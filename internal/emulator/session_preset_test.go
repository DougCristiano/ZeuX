package emulator

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
)

// presetSpyAdapter é um Adapter que também é ConfigurableAdapter, apontando
// para /bin/true — o mesmo truque de TestLaunchStandaloneStartsBinaryWithoutROM,
// para exercitar o Launch de verdade (processo sobe, sessão é gravada) sem
// depender de um emulador instalado. Registra o que cada camada recebeu, que é
// justamente o que o Q2 precisa travar.
type presetSpyAdapter struct {
	writeConfigOpts  *Options
	buildCommandOpts *Options
	writeErr         error
	unapplied        []string
}

func (a *presetSpyAdapter) ID() string         { return "spy" }
func (a *presetSpyAdapter) Name() string       { return "Emulador Espião" }
func (a *presetSpyAdapter) Consoles() []string { return []string{"nes"} }

func (a *presetSpyAdapter) Locate(context.Context) (Installation, bool) {
	return Installation{AdapterID: "spy", Name: "Emulador Espião", BinaryPath: "/bin/true"}, true
}

func (a *presetSpyAdapter) BuildCommand(install Installation, req Request) (Command, error) {
	opts := req.Options
	a.buildCommandOpts = &opts
	return Command{
		Argv:      []string{install.BinaryPath},
		Unapplied: []string{"o que só a linha de comando não aplicou"},
	}, nil
}

func (a *presetSpyAdapter) ReadConfig(Installation) (PersistedOptions, error) {
	return PersistedOptions{}, nil
}

func (a *presetSpyAdapter) WriteConfig(_ Installation, opts Options) ([]string, error) {
	a.writeConfigOpts = &opts
	if a.writeErr != nil {
		return nil, a.writeErr
	}
	return a.unapplied, nil
}

func (a *presetSpyAdapter) RestoreConfig(Installation) error { return nil }

// fakeUserConfig responde a pergunta "o usuário configurou este emulador à
// mão?" sem banco.
type fakeUserConfig struct {
	configured bool
	err        error
}

func (f fakeUserConfig) IsUserConfigured(context.Context, string) (bool, error) {
	if f.err != nil {
		// Mesmo contrato do UserConfigStore real: erro devolve true junto — na
		// dúvida, não mexer no arquivo do usuário.
		return true, f.err
	}
	return f.configured, nil
}

func newPresetLauncher(t *testing.T, adapter *presetSpyAdapter, userConfig UserConfigRepository) *Launcher {
	t.Helper()
	if _, err := os.Stat("/bin/true"); err != nil {
		t.Skip("/bin/true não existe neste ambiente")
	}
	registry := NewRegistry()
	registry.SetCustom([]Adapter{adapter})
	return NewLauncher(registry, &fakeSessionRepository{}, userConfig, discardLogger())
}

func romParaTeste(t *testing.T) string {
	t.Helper()
	path := t.TempDir() + "/jogo.nes"
	if err := os.WriteFile(path, []byte("rom"), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

// A regra central do Q2 (docs/roadmap.md, Sprint Q): lançar aplica o preset do
// catálogo no arquivo de configuração do emulador. Antes disso, o preset só
// virava linha de comando — e "resolução interna 4x" não cabe em flag nenhuma,
// então o parecer prometia e o emulador nunca recebia.
func TestLaunchAplicaOPresetNaConfiguracao(t *testing.T) {
	adapter := &presetSpyAdapter{}
	launcher := newPresetLauncher(t, adapter, fakeUserConfig{configured: false})

	_, err := launcher.Launch(context.Background(), LaunchInput{
		ROMPath:   romParaTeste(t),
		ConsoleID: "nes",
		Options:   Options{Fullscreen: true, InternalScale: 3},
	})
	if err != nil {
		t.Fatalf("Launch: %v", err)
	}

	if adapter.writeConfigOpts == nil {
		t.Fatal("WriteConfig não foi chamado — o preset não chegou ao arquivo do emulador")
	}
	if adapter.writeConfigOpts.InternalScale != 3 {
		t.Errorf("InternalScale gravado = %d, esperava 3", adapter.writeConfigOpts.InternalScale)
	}
}

// A precedência que o Registry já documenta para emulador personalizado, agora
// valendo para configuração: o que o usuário definiu à mão vence o que vem de
// fábrica. Sem esta regra, TODO lançamento sobrescreveria em silêncio a
// escolha de quem abriu o painel "Configurações" e salvou.
func TestLaunchNaoSobrescreveConfiguracaoDoUsuario(t *testing.T) {
	adapter := &presetSpyAdapter{}
	launcher := newPresetLauncher(t, adapter, fakeUserConfig{configured: true})

	_, err := launcher.Launch(context.Background(), LaunchInput{
		ROMPath:   romParaTeste(t),
		ConsoleID: "nes",
		Options:   Options{InternalScale: 4},
	})
	if err != nil {
		t.Fatalf("Launch: %v", err)
	}

	if adapter.writeConfigOpts != nil {
		t.Errorf("WriteConfig foi chamado mesmo com o usuário tendo configurado à mão: %+v", *adapter.writeConfigOpts)
	}
	// E o lançamento continua: o jogo abre com a configuração que o usuário
	// escolheu, não é impedido por ela existir.
	if adapter.buildCommandOpts == nil {
		t.Error("BuildCommand não foi chamado — o jogo deveria abrir assim mesmo")
	}
}

// Falhar em checar não pode virar "então escreve por cima": na dúvida, o
// arquivo do usuário fica como está. Um preset não aplicado é uma partida
// menos bonita; sobrescrever calado é irreversível do ponto de vista dele.
func TestLaunchNaoAplicaPresetQuandoNaoConsegueChecar(t *testing.T) {
	adapter := &presetSpyAdapter{}
	launcher := newPresetLauncher(t, adapter, fakeUserConfig{err: errors.New("banco fora do ar")})

	if _, err := launcher.Launch(context.Background(), LaunchInput{
		ROMPath:   romParaTeste(t),
		ConsoleID: "nes",
		Options:   Options{InternalScale: 4},
	}); err != nil {
		t.Fatalf("Launch: %v", err)
	}

	if adapter.writeConfigOpts != nil {
		t.Error("WriteConfig foi chamado mesmo sem conseguir checar a configuração manual")
	}
}

// O arquivo de configuração passou a carregar resolução interna e renderer, e
// pedi-los DE NOVO na linha de comando produziria uma segunda mensagem de
// "não aplicado" sobre algo que acabou de ser aplicado — no RetroArch, o
// BuildCommand chega a dizer que o renderer precisa ser escolhido à mão logo
// depois de o WriteConfig ter gravado video_driver.
func TestLaunchNaoRepeteNaLinhaDeComandoOQueAConfiguracaoJaResolveu(t *testing.T) {
	adapter := &presetSpyAdapter{}
	launcher := newPresetLauncher(t, adapter, fakeUserConfig{configured: false})

	if _, err := launcher.Launch(context.Background(), LaunchInput{
		ROMPath:   romParaTeste(t),
		ConsoleID: "nes",
		Options:   Options{Fullscreen: true, InternalScale: 3, Renderer: RendererVulkan},
	}); err != nil {
		t.Fatalf("Launch: %v", err)
	}

	if adapter.buildCommandOpts == nil {
		t.Fatal("BuildCommand não foi chamado")
	}
	if adapter.buildCommandOpts.InternalScale != 0 {
		t.Errorf("InternalScale chegou ao BuildCommand como %d — a configuração já resolveu isso",
			adapter.buildCommandOpts.InternalScale)
	}
	if adapter.buildCommandOpts.Renderer != RendererDefault {
		t.Errorf("Renderer chegou ao BuildCommand como %q — a configuração já resolveu isso",
			adapter.buildCommandOpts.Renderer)
	}
	// Fullscreen continua indo pelas duas vias de propósito: uma flag é mais
	// confiável que uma chave de arquivo.
	if !adapter.buildCommandOpts.Fullscreen {
		t.Error("Fullscreen deveria continuar chegando à linha de comando")
	}
}

// A sessão precisa carregar o que NENHUMA das duas camadas aplicou — se só o
// Unapplied da linha de comando sobrevivesse, o usuário deixaria de saber o
// que o arquivo de configuração não deu conta (ADR 0006).
func TestLaunchJuntaOUnappliedDasDuasCamadas(t *testing.T) {
	adapter := &presetSpyAdapter{unapplied: []string{"o que a configuração não aplicou"}}
	launcher := newPresetLauncher(t, adapter, fakeUserConfig{configured: false})

	session, err := launcher.Launch(context.Background(), LaunchInput{
		ROMPath:   romParaTeste(t),
		ConsoleID: "nes",
		Options:   Options{InternalScale: 2},
	})
	if err != nil {
		t.Fatalf("Launch: %v", err)
	}

	juntos := strings.Join(session.Unapplied, " | ")
	if !strings.Contains(juntos, "a configuração não aplicou") {
		t.Errorf("faltou o Unapplied da configuração em %q", juntos)
	}
	if !strings.Contains(juntos, "a linha de comando não aplicou") {
		t.Errorf("faltou o Unapplied da linha de comando em %q", juntos)
	}
}

// Escrita que falha não impede o jogo de abrir: princípio 5 do CLAUDE.md —
// informar, não bloquear. O jogo abre com a configuração que já estava lá.
func TestLaunchAbreOJogoMesmoSeOPresetFalhar(t *testing.T) {
	adapter := &presetSpyAdapter{writeErr: errors.New("arquivo somente leitura")}
	launcher := newPresetLauncher(t, adapter, fakeUserConfig{configured: false})

	session, err := launcher.Launch(context.Background(), LaunchInput{
		ROMPath:   romParaTeste(t),
		ConsoleID: "nes",
		Options:   Options{InternalScale: 2},
	})
	if err != nil {
		t.Fatalf("Launch devolveu erro por causa do preset: %v", err)
	}
	if session.ID == "" {
		t.Error("a sessão não foi registrada")
	}
	// A escrita falhou, então a linha de comando volta a ser a única chance de
	// aplicar a resolução interna — não pode ter sido zerada.
	if adapter.buildCommandOpts == nil || adapter.buildCommandOpts.InternalScale != 2 {
		t.Error("com o preset falhando, InternalScale deveria continuar chegando ao BuildCommand")
	}
}

// Um adapter que NÃO é ConfigurableAdapter (12 dos 14 hoje) segue exatamente
// como antes: nada é gravado, tudo que couber vai pela linha de comando.
func TestLaunchNaoTentaConfigurarAdapterQueNaoSabeConfigurar(t *testing.T) {
	if _, err := os.Stat("/bin/true"); err != nil {
		t.Skip("/bin/true não existe neste ambiente")
	}
	registry := NewRegistry()
	adapter, err := NewCustomAdapter(CustomDefinition{
		ID: "custom-true", Name: "Sem Configuração", Consoles: []string{"nes"},
		BinaryPath: "/bin/true", Args: []string{PlaceholderROM},
	})
	if err != nil {
		t.Fatalf("NewCustomAdapter: %v", err)
	}
	registry.SetCustom([]Adapter{adapter})
	launcher := NewLauncher(registry, &fakeSessionRepository{}, fakeUserConfig{}, discardLogger())

	if _, err := launcher.Launch(context.Background(), LaunchInput{
		ROMPath:   romParaTeste(t),
		ConsoleID: "nes",
		Options:   Options{InternalScale: 2},
	}); err != nil {
		t.Fatalf("Launch: %v", err)
	}
}
