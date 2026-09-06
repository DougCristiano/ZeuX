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
	registry   *Registry
	logger     *slog.Logger
	sessions   SessionRepository
	userConfig UserConfigRepository
}

// UserConfigRepository responde se o usuário já salvou configuração à mão
// para um emulador. Interface, e não o *UserConfigStore concreto, para que o
// teste do lançamento (Q2) possa simular os dois lados da precedência sem
// abrir um banco.
type UserConfigRepository interface {
	IsUserConfigured(ctx context.Context, adapterID string) (bool, error)
}

// NewLauncher cria o executor de jogos. sessions é onde o histórico de
// sessões e o tempo de jogo (Playtime) são persistidos — antes da decisão do
// ADR 0011, isso vivia num slice em memória e sumia a cada reinício.
func NewLauncher(registry *Registry, sessions SessionRepository, userConfig UserConfigRepository, logger *slog.Logger) *Launcher {
	return &Launcher{registry: registry, sessions: sessions, userConfig: userConfig, logger: logger}
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

	// Q2 (docs/roadmap.md, Sprint Q): o preset precisa ser APLICADO, não só
	// prometido. Até aqui, lançar só emitia linha de comando — e a maior parte
	// do preset não cabe em flag (no RetroArch, resolução interna, renderer e
	// exit_on_close iam todos para Unapplied). O resultado era o parecer
	// anunciar "resolução interna 4x" e o emulador receber apenas tela cheia.
	//
	// A escrita mora aqui, na camada de lançamento, e não em BuildCommand, que
	// continua puro por regra do CLAUDE.md ("não faça BuildCommand executar
	// nada nem tocar o sistema de arquivos").
	options := input.Options
	configUnapplied, persisted := l.applyPreset(ctx, adapter, install, options)
	if persisted {
		// O arquivo de configuração passou a carregar estas duas opções, então
		// pedi-las de novo na linha de comando só produziria uma segunda
		// mensagem de Unapplied dizendo o que a configuração já resolveu — ou,
		// pior, uma mensagem dizendo que o renderer não foi aplicado logo
		// depois de ele ter sido. Fullscreen continua indo pelas duas vias de
		// propósito: uma flag é mais confiável que uma chave de arquivo.
		options.InternalScale = 0
		options.Renderer = RendererDefault
	}

	built, err := adapter.BuildCommand(install, Request{
		ROMPath:   input.ROMPath,
		ConsoleID: input.ConsoleID,
		Core:      input.Core,
		Options:   options,
	})
	if err != nil {
		return Session{}, err
	}

	unapplied := append(append([]string{}, configUnapplied...), built.Unapplied...)

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
		Unapplied: unapplied,
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

// LaunchStandalone abre o executável do emulador sozinho — sem ROM, sem
// opções, sem `BuildCommand` nenhum. Existe para o botão "Configurar"
// (2026-08-04): o ZeuX ainda não grava nem aplica configuração de emulador
// nenhuma (backlog separado, ver docs/roadmap.md) — por ora, "configurar"
// significa só abrir o próprio emulador para o usuário mexer na
// configuração dele diretamente, do jeito que faria sem o ZeuX.
//
// Não grava sessão: abrir o emulador para configurar não é uma partida
// jogada, e contar isso como tempo de jogo inflaria a estatística real do
// usuário. O processo ainda é esperado numa goroutine (só para não deixar
// zombie no sistema) — só não há nada para fechar no banco quando termina.
func (l *Launcher) LaunchStandalone(ctx context.Context, adapterID string) error {
	adapter, ok := l.registry.ByID(adapterID)
	if !ok {
		return fmt.Errorf("o ZeuX não conhece o emulador %q", adapterID)
	}

	install, ok := adapter.Locate(ctx)
	if !ok {
		return fmt.Errorf("o %s não está instalado", adapter.Name())
	}
	if install.BinaryPath == "" {
		return fmt.Errorf("caminho do executável do %s não foi encontrado", adapter.Name())
	}

	// Contexto próprio, como em Launch: o emulador precisa continuar aberto
	// muito depois desta requisição HTTP ter terminado.
	cmd, err := command(context.Background(), []string{install.BinaryPath})
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("não foi possível abrir o %s: %w", adapter.Name(), err)
	}

	l.logger.Info("emulador aberto para configurar (sem jogo)",
		"emulador", adapter.Name(), "pid", cmd.Process.Pid)

	go func() {
		if err := cmd.Wait(); err != nil {
			l.logger.Debug("emulador (modo configurar) encerrado com erro",
				"emulador", adapter.Name(), "detalhe", err)
		}
	}()

	return nil
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

// applyPreset grava o preset do catálogo no arquivo de configuração do próprio
// emulador, antes de abrir o jogo. Devolve o que o adapter não soube persistir
// (mesmo espírito de Command.Unapplied, ADR 0006) e se algo chegou a ser
// gravado.
//
// Três motivos para não fazer nada, todos devolvendo persisted=false:
//
//  1. O adapter não é ConfigurableAdapter. Só PCSX2 e RetroArch são hoje; os
//     outros 12 continuam recebendo o que couber na linha de comando.
//  2. **O usuário já configurou este emulador à mão.** É a precedência que o
//     Registry já documenta para emulador personalizado — o que a pessoa
//     definiu vence o que vem de fábrica. Sem esta checagem, todo lançamento
//     sobrescreveria em silêncio a escolha dela.
//  3. A escrita falhou. Nesse caso o jogo abre assim mesmo, com a
//     configuração que já estava lá: um preset não aplicado é uma partida
//     menos bonita, não uma partida impedida (princípio 5 — informar, não
//     bloquear).
func (l *Launcher) applyPreset(ctx context.Context, adapter Adapter, install Installation, opts Options) (unapplied []string, persisted bool) {
	configurable, ok := adapter.(ConfigurableAdapter)
	if !ok {
		return nil, false
	}

	// Sem repositório (nenhum caminho de produção hoje, mas construtível em
	// teste), o seguro é não tocar no arquivo do usuário.
	if l.userConfig == nil {
		return nil, false
	}

	userConfigured, err := l.userConfig.IsUserConfigured(ctx, adapter.ID())
	if err != nil {
		// IsUserConfigured já devolve true junto do erro — na dúvida, não
		// mexer. Registrado como aviso: o lançamento segue.
		l.logger.Warn("não foi possível checar a configuração manual; preset não aplicado",
			"emulador", adapter.ID(), "erro", err)
		return nil, false
	}
	if userConfigured {
		l.logger.Info("preset do catálogo não aplicado: o usuário configurou este emulador à mão",
			"emulador", adapter.ID())
		return nil, false
	}

	unapplied, err = configurable.WriteConfig(install, opts)
	if err != nil {
		l.logger.Warn("não foi possível aplicar o preset; o jogo abre com a configuração atual",
			"emulador", adapter.ID(), "erro", err)
		return nil, false
	}

	l.logger.Info("preset do catálogo aplicado",
		"emulador", adapter.ID(), "resolucao_interna", opts.InternalScale, "nao_aplicado", len(unapplied))

	return unapplied, true
}
