package emulator

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"sync"
	"time"
)

// Session é uma execução de jogo acompanhada pelo ZeuX.
//
// O acompanhamento não é enfeite: o PRD promete tempo total de jogo, status
// "jogando agora" e histórico de últimos jogados. Todos os três saem daqui — do
// momento em que o processo do emulador começa até o momento em que termina.
type Session struct {
	ID        string    `json:"id"`
	ConsoleID string    `json:"console_id"`
	AdapterID string    `json:"adapter_id"`
	Emulator  string    `json:"emulator"`
	ROMPath   string    `json:"rom_path"`
	StartedAt time.Time `json:"started_at"`

	// EndedAt é nulo enquanto o jogo está aberto.
	//
	// É ponteiro porque `omitempty` não funciona em time.Time — o valor zero
	// não conta como vazio para o encoder, e a interface receberia
	// "0001-01-01T00:00:00Z" numa sessão em andamento.
	EndedAt *time.Time `json:"ended_at"`

	// ExitError descreve uma saída anormal do emulador. Código de saída
	// diferente de zero é comum quando o usuário fecha pela janela, então isso
	// é informativo e não necessariamente uma falha.
	ExitError string `json:"exit_error,omitempty"`

	// Unapplied repete o que o adapter não conseguiu configurar, para que a
	// interface possa avisar assim que o jogo abre.
	Unapplied []string `json:"unapplied,omitempty"`

	pid int
}

// Running informa se a sessão ainda está em andamento.
func (s Session) Running() bool { return s.EndedAt == nil }

// Duration devolve o tempo decorrido — total se a sessão terminou, parcial se
// ainda está rodando.
func (s Session) Duration() time.Duration {
	if s.EndedAt == nil {
		return time.Since(s.StartedAt)
	}
	return s.EndedAt.Sub(s.StartedAt)
}

// MarshalSession é a forma serializada da sessão, com a duração já calculada
// em segundos para a interface não precisar fazer conta de datas.
type MarshalSession struct {
	Session
	DurationSeconds int  `json:"duration_seconds"`
	IsRunning       bool `json:"is_running"`
}

// Launcher executa jogos e mantém o registro das sessões.
type Launcher struct {
	registry *Registry
	logger   *slog.Logger

	mu       sync.RWMutex
	sessions []*Session
	sequence int
}

// NewLauncher cria o executor de jogos.
func NewLauncher(registry *Registry, logger *slog.Logger) *Launcher {
	return &Launcher{registry: registry, logger: logger}
}

// LaunchInput descreve o pedido de execução vindo da interface.
type LaunchInput struct {
	ROMPath   string
	ConsoleID string

	// EmulatorID força um emulador específico. Vazio deixa o ZeuX escolher.
	EmulatorID string

	// Core seleciona o core do RetroArch, quando aplicável.
	Core string

	Options Options
}

// Launch inicia o jogo e passa a acompanhar o processo.
//
// A chamada não bloqueia: devolve assim que o emulador sobe, e uma goroutine
// cuida de esperar o fim para fechar a sessão. Travar aqui prenderia a
// requisição HTTP pelo tempo inteiro da partida.
//
// Devolve uma cópia da sessão, não o ponteiro guardado internamente: a
// goroutine supervise grava EndedAt/ExitError nesse ponteiro assim que o
// processo termina, e o chamador (handleLaunch) serializa o valor para JSON
// logo em seguida. Ponteiro compartilhado ali seria leitura e escrita
// concorrente na mesma struct, sem lock do lado de quem lê.
func (l *Launcher) Launch(ctx context.Context, input LaunchInput) (Session, error) {
	if err := ValidateROM(input.ROMPath); err != nil {
		return Session{}, err
	}

	adapter, install, err := l.registry.Resolve(ctx, input.ConsoleID, input.EmulatorID)
	if err != nil {
		return Session{}, err
	}

	built, err := adapter.BuildCommand(install, Request{
		ROMPath:   input.ROMPath,
		ConsoleID: input.ConsoleID,
		Core:      input.Core,
		Options:   input.Options,
	})
	if err != nil {
		return Session{}, err
	}

	// O processo é desligado do contexto da requisição de propósito: o jogo
	// precisa continuar rodando muito depois de a resposta HTTP ter sido
	// enviada. Amarrá-lo ao ctx mataria o emulador em segundos.
	cmd, err := command(context.Background(), built.Argv)
	if err != nil {
		return Session{}, err
	}

	if err := cmd.Start(); err != nil {
		return Session{}, fmt.Errorf("não foi possível iniciar o %s: %w", adapter.Name(), err)
	}

	session := l.register(input, adapter, built, cmd.Process.Pid)

	l.logger.Info("jogo iniciado",
		"sessao", session.ID,
		"emulador", adapter.Name(),
		"console", input.ConsoleID,
		"pid", session.pid)

	go l.supervise(session, cmd)

	return l.snapshot(session), nil
}

// snapshot copia a sessão sob o lock, para devolver ao chamador um valor que
// nenhuma goroutine vai continuar escrevendo.
//
// A cópia rasa basta porque supervise **substitui** o ponteiro EndedAt em vez
// de alterar o time.Time apontado, e Unapplied é preenchido uma única vez no
// register. Um campo que passasse a ser mutado no lugar exigiria cópia
// profunda aqui.
func (l *Launcher) snapshot(s *Session) Session {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return *s
}

// register cria e guarda a sessão.
func (l *Launcher) register(input LaunchInput, adapter Adapter, built Command, pid int) *Session {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.sequence++
	session := &Session{
		ID:        fmt.Sprintf("s%d", l.sequence),
		ConsoleID: input.ConsoleID,
		AdapterID: adapter.ID(),
		Emulator:  adapter.Name(),
		ROMPath:   input.ROMPath,
		StartedAt: time.Now().UTC(),
		Unapplied: built.Unapplied,
		pid:       pid,
	}

	l.sessions = append(l.sessions, session)
	return session
}

// supervise espera o emulador terminar e fecha a sessão.
func (l *Launcher) supervise(session *Session, cmd *exec.Cmd) {
	err := cmd.Wait()

	endedAt := time.Now().UTC()

	l.mu.Lock()
	session.EndedAt = &endedAt
	if err != nil {
		session.ExitError = err.Error()
	}
	duration := session.Duration()
	l.mu.Unlock()

	l.logger.Info("jogo encerrado",
		"sessao", session.ID,
		"emulador", session.Emulator,
		"duracao", duration.Round(time.Second))
}

// Sessions devolve o histórico, do mais recente para o mais antigo.
func (l *Launcher) Sessions() []MarshalSession {
	l.mu.RLock()
	defer l.mu.RUnlock()

	result := make([]MarshalSession, 0, len(l.sessions))
	for i := len(l.sessions) - 1; i >= 0; i-- {
		session := *l.sessions[i]
		result = append(result, MarshalSession{
			Session:         session,
			DurationSeconds: int(session.Duration().Seconds()),
			IsRunning:       session.Running(),
		})
	}

	return result
}

// Playtime soma o tempo jogado por console. É a base do "tempo total de jogo"
// do perfil; hoje vive em memória e some ao fechar o app, até a persistência
// entrar.
func (l *Launcher) Playtime() map[string]int {
	l.mu.RLock()
	defer l.mu.RUnlock()

	totals := make(map[string]int)
	for _, session := range l.sessions {
		totals[session.ConsoleID] += int(session.Duration().Seconds())
	}

	return totals
}

// ValidateROM confirma que o arquivo existe antes de tentar abrir o emulador.
// Falhar aqui dá uma mensagem clara; falhar dentro do emulador dá uma janela
// preta e nenhuma explicação.
func ValidateROM(path string) error {
	if path == "" {
		return fmt.Errorf("o caminho do jogo não pode estar vazio")
	}

	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return fmt.Errorf("o arquivo %q não foi encontrado", path)
	}
	if err != nil {
		return fmt.Errorf("não foi possível acessar o arquivo %q: %w", path, err)
	}
	if info.IsDir() {
		return fmt.Errorf("%q é uma pasta, não um arquivo de jogo", path)
	}

	return nil
}
