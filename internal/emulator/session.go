package emulator

import (
	"context"
	"errors"
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

	// Mode escolhe "Continuar" (ModeResume, estado de retomada da última
	// sessão, resume.go) ou começar do início (ModeFresh). Vazio vale
	// ModeFresh. Valor fora dos conhecidos é recusado antes de qualquer
	// processo subir.
	Mode Mode
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
	if adapter.ID() == "rpcs3" {
		if err := suppressRPCS3Welcome(install); err != nil {
			l.logger.Warn("não foi possível silenciar a tela de boas-vindas do RPCS3", "erro", err)
		}
	}
	mode := input.Mode
	if mode == "" {
		mode = ModeFresh
	}
	if !mode.Valid() {
		return Session{}, fmt.Errorf("modo de lançamento %q desconhecido", string(input.Mode))
	}
	// Só o modo resume procura estado. No fresh o caminho fica vazio e nenhum
	// argumento de carregamento é montado — a garantia de "do início" vive
	// aqui e em BuildCommand, não só na tela.
	var statePath string
	if mode == ModeResume {
		statePath, err = l.resumeStateFor(ctx, input.ROMPath, adapter.ID())
		if err != nil {
			return Session{}, err
		}
	}
	// Conserta a instalação do DuckStation feita antes de 2026-10-05 (sem
	// botões, sem atalhos, auto-update ligado) sem exigir reinstalar. Só com
	// ele fechado: o DuckStation regrava o settings.ini ao sair.
	if adapter.ID() == "duckstation" && !l.AdapterRunning(ctx, "duckstation") {
		if err := EnsureDuckStationDefaults(install); err != nil {
			l.logger.Warn("não foi possível completar a configuração do DuckStation", "erro", err)
		}
	}
	// O PCSX2 grava o estado de retomada só com SaveStateOnShutdown ligado, e
	// o padrão dele é desligado. Desde 2026-10-09 (decisão do Douglas) o ZeuX
	// liga essa chave quando ela falta, e a pessoa pode desligá-la na tela do
	// PS2; EnsurePCSX2Defaults cuida das duas coisas.
	if adapter.ID() == "pcsx2" && !l.AdapterRunning(ctx, "pcsx2") {
		if err := EnsurePCSX2Defaults(); err != nil {
			l.logger.Warn("não foi possível completar a configuração do PCSX2", "erro", err)
		}
	}

	// Sem isto o RetroArch grava o print ao lado do jogo, na pasta de ROMs
	// do usuário — onde o ZeuX não escreve nem recolhe (screenshots.go).
	if adapter.ID() == "retroarch" && !l.AdapterRunning(ctx, "retroarch") {
		if err := ensureRetroArchScreenshotDir(install); err != nil {
			l.logger.Warn("não foi possível apontar a pasta de prints do RetroArch", "erro", err)
		}
	}

	options := input.Options
	configUnapplied, persisted := l.applyPreset(ctx, adapter, install, options)

	// Jogador 1 sem bind nenhum (nem teclado) é o estado que o seed antigo do
	// ZeuX deixava no PCSX2 e no DuckStation — o jogo abriria sem responder a
	// nada. Consertar aqui não passa por cima de escolha do usuário
	// (NeedsControllerPreset só diz sim quando não há escolha nenhuma), e
	// falhar em gravar não impede o jogo de abrir.
	if NeedsControllerPreset(adapter.ID(), install) {
		if err := ApplyControllerPreset(adapter.ID(), install); err != nil {
			l.logger.Warn("não foi possível gravar o mapeamento padrão de controle",
				"emulador", adapter.Name(), "erro", err)
		} else {
			l.logger.Info("mapeamento padrão de controle gravado (jogador 1 estava vazio)",
				"emulador", adapter.Name())
		}
	}
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

	// O RetroArch decide "do início" ou "no estado salvo" por um arquivo de
	// config extra gravado no diretório do ZeuX (retroarch_resume.go). Não
	// gravar não pode bloquear o jogo: o aviso vai para a sessão, e o
	// retroarch.cfg do usuário segue valendo.
	// A opção "Salvar estado ao fechar o jogo" do RetroArch e do Flycast mora no
	// banco do ZeuX (launch_prefs.go); no RetroArch ela também vai para o
	// arquivo de override, junto com o modo.
	autoSave := l.AutoSaveStateFor(ctx, adapter.ID())
	var appendConfig string
	var appendUnapplied []string
	if adapter.ID() == "retroarch" {
		appendConfig, err = writeRetroArchAppendConfig(mode, autoSave)
		if err != nil {
			l.logger.Warn("não foi possível gravar a configuração de lançamento do RetroArch",
				"modo", string(mode), "erro", err)
			appendUnapplied = append(appendUnapplied,
				"Não foi possível preparar a escolha de início do RetroArch; o jogo abre com a configuração que você já tem nele.")
		}
	}

	built, err := adapter.BuildCommand(install, Request{
		ROMPath:          input.ROMPath,
		ConsoleID:        input.ConsoleID,
		Core:             input.Core,
		Options:          options,
		Mode:             mode,
		StatePath:        statePath,
		AppendConfigPath: appendConfig,
		AutoSaveStateOff: !autoSave,
	})
	if err != nil {
		return Session{}, err
	}

	unapplied := append(append(append([]string{}, configUnapplied...), appendUnapplied...), built.Unapplied...)

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

	go l.supervise(session, cmd, install)

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

	if adapter.ID() == "rpcs3" {
		if err := suppressRPCS3Welcome(install); err != nil {
			l.logger.Warn("não foi possível silenciar a tela de boas-vindas do RPCS3", "erro", err)
		}
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

// AdapterRunning diz se há uma sessão aberta deste emulador agora. Escrever
// na config de um emulador aberto é inútil: ele regrava a própria config ao
// fechar, por cima. Erro ao ler as sessões conta como "aberto" — na dúvida,
// não escrever.
func (l *Launcher) AdapterRunning(ctx context.Context, adapterID string) bool {
	sessions, err := l.Sessions(ctx)
	if err != nil {
		return true
	}
	for _, s := range sessions {
		if s.AdapterID == adapterID && s.IsRunning {
			return true
		}
	}
	return false
}

// supervise espera o emulador terminar e fecha a sessão no repositório.
func (l *Launcher) supervise(session Session, cmd *exec.Cmd, install Installation) {
	waitErr := cmd.Wait()

	endedAt := time.Now().UTC()
	exitError := describeExitError(waitErr)

	// Prints antes de fechar a sessão no banco: a tela recarrega a galeria
	// quando vê a sessão encerrada (GET /sessions), e com a ordem inversa
	// ela relia a pasta antes de o print chegar — o print só aparecia
	// saindo da tela e voltando (achado do Douglas, 2026-10-06).
	l.collectScreenshots(session, install)

	if err := l.sessions.Close(context.Background(), session.ID, endedAt, exitError); err != nil {
		l.logger.Error("não foi possível fechar a sessão no banco", "sessao", session.ID, "erro", err)
	}

	l.recordDiscID(session)
	l.recordResumeState(session, install)

	l.logger.Info("jogo encerrado",
		"sessao", session.ID,
		"emulador", session.Emulator,
		"duracao", endedAt.Sub(session.StartedAt).Round(time.Second))
}

// windowsDLLNotFound é o NTSTATUS STATUS_DLL_NOT_FOUND. O carregador do
// Windows devolve este código quando o processo chega a nascer mas morre
// antes da primeira instrução do emulador, porque uma DLL que o executável
// importa não está no sistema.
//
// Não há checagem de sistema operacional em volta dele de propósito: código
// de saída no Unix cabe em um byte (0-255), então nenhum processo de Linux ou
// macOS consegue sair com este valor por acidente. Uma comparação a mais é
// mais barata que um caminho por SO a mais.
const windowsDLLNotFound = 0xC0000135

// describeExitError traduz a saída do processo do emulador para uma frase em
// que o usuário consiga agir.
//
// Verificado ao vivo em 2026-09-11, nesta máquina, depois de o Douglas
// relatar que o PS1 e o PS2 "dizem que vão abrir e não abrem": o DuckStation
// e o PCSX2 morriam em menos de 100 ms e gravavam "exit status 0xc0000135" na
// sessão — texto que atravessava a API inteira sem explicar nada. Rodando os
// dois executáveis direto pelo terminal, sem o ZeuX no meio, o mesmo código
// se repetiu, e o runtime do Visual C++ que ambos importam
// (VCRUNTIME140.dll, VCRUNTIME140_1.dll, MSVCP140.dll) não está instalado
// aqui. O RetroArch continua abrindo normalmente porque o build dele para
// Windows não importa nenhuma dessas DLLs — é isso que faz a mesma máquina
// jogar SNES e N64 e não jogar PS1 nem PS2.
//
// Só este código ganha tradução. Qualquer outra saída diferente de zero
// continua vindo crua, porque é comum e esperada quando o usuário fecha o
// emulador pela janela: inventar explicação para ela seria pior que não
// explicar nada.
func describeExitError(err error) string {
	if err == nil {
		return ""
	}

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		if message, ok := describeExitCode(exitErr.ExitCode()); ok {
			return message
		}
	}

	return err.Error()
}

// describeExitCode é separada de describeExitError para poder ser testada sem
// precisar de um processo real que saia com um código do Windows — fabricar
// um *exec.ExitError com código arbitrário não é portátil.
func describeExitCode(code int) (string, bool) {
	if uint32(code) == windowsDLLNotFound {
		return "O emulador abriu e fechou na mesma hora porque o Windows não encontrou uma biblioteca que o executável dele precisa (código 0xC0000135). " +
			"Na prática isso quase sempre é o runtime do Visual C++ da Microsoft, que o DuckStation e o PCSX2 exigem e não trazem junto. " +
			"Instale o \"Microsoft Visual C++ Redistributable (x64)\" e abra o jogo de novo.", true
	}
	return "", false
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
