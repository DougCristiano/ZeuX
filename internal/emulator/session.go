package emulator

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
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

// SessionRepository persiste sessões de jogo. É uma interface — não o tipo
// concreto SQLiteSessions (internal/emulator/session_store.go) — para que os
// testes do Launcher rodem com uma implementação em memória, sem precisar de
// um banco de verdade. Ver ADR 0011 (docs/decisoes/), que decidiu SQLite
// local para isso.
type SessionRepository interface {
	// Insert grava a sessão e devolve o ID definitivo — quem persiste é quem
	// decide o ID (ex.: a implementação em SQLite usa o rowid autoincrement),
	// para que ele sobreviva a um reinício sem colidir com sessões antigas.
	Insert(ctx context.Context, session Session) (id string, err error)
	Close(ctx context.Context, id string, endedAt time.Time, exitError string) error
	List(ctx context.Context) ([]Session, error)
}

// Launcher executa jogos e mantém o registro das sessões.
type Launcher struct {
	registry *Registry
	logger   *slog.Logger
	sessions SessionRepository
}

// NewLauncher cria o executor de jogos. sessions é onde o histórico de
// sessões e o tempo de jogo (Playtime) são persistidos — antes da decisão do
// ADR 0011, isso vivia num slice em memória e sumia a cada reinício.
func NewLauncher(registry *Registry, sessions SessionRepository, logger *slog.Logger) *Launcher {
	return &Launcher{registry: registry, sessions: sessions, logger: logger}
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

	session := Session{
		ConsoleID: input.ConsoleID,
		AdapterID: adapter.ID(),
		Emulator:  adapter.Name(),
		ROMPath:   input.ROMPath,
		StartedAt: time.Now().UTC(),
		Unapplied: built.Unapplied,
		pid:       cmd.Process.Pid,
	}

	// A persistência também roda desligada do contexto da requisição: se o
	// cliente HTTP cancelar a conexão bem no instante entre o processo subir
	// e a sessão ser gravada, o jogo já está rodando e a sessão precisa ser
	// registrada de qualquer forma.
	id, err := l.sessions.Insert(context.Background(), session)
	if err != nil {
		return Session{}, fmt.Errorf("registrando a sessão: %w", err)
	}
	session.ID = id

	l.logger.Info("jogo iniciado",
		"sessao", session.ID,
		"emulador", adapter.Name(),
		"console", input.ConsoleID,
		"pid", session.pid)

	go l.supervise(session, cmd)

	return session, nil
}

// supervise espera o emulador terminar e fecha a sessão no repositório.
func (l *Launcher) supervise(session Session, cmd *exec.Cmd) {
	waitErr := cmd.Wait()

	endedAt := time.Now().UTC()
	exitError := ""
	if waitErr != nil {
		exitError = waitErr.Error()
	}

	if err := l.sessions.Close(context.Background(), session.ID, endedAt, exitError); err != nil {
		l.logger.Error("não foi possível fechar a sessão no banco", "sessao", session.ID, "erro", err)
	}

	l.logger.Info("jogo encerrado",
		"sessao", session.ID,
		"emulador", session.Emulator,
		"duracao", endedAt.Sub(session.StartedAt).Round(time.Second))
}

// Sessions devolve o histórico, do mais recente para o mais antigo.
func (l *Launcher) Sessions(ctx context.Context) ([]MarshalSession, error) {
	sessions, err := l.sessions.List(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]MarshalSession, 0, len(sessions))
	for _, session := range sessions {
		result = append(result, MarshalSession{
			Session:         session,
			DurationSeconds: int(session.Duration().Seconds()),
			IsRunning:       session.Running(),
		})
	}

	return result, nil
}

// Playtime soma o tempo jogado por console. É a base do "tempo total de jogo"
// do perfil.
func (l *Launcher) Playtime(ctx context.Context) (map[string]int, error) {
	sessions, err := l.sessions.List(ctx)
	if err != nil {
		return nil, err
	}

	totals := make(map[string]int)
	for _, session := range sessions {
		totals[session.ConsoleID] += int(session.Duration().Seconds())
	}

	return totals, nil
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
