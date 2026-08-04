package emulator

import (
	"strings"
	"testing"
)

// BuildCommand é pura de propósito: estes testes verificam a tradução de
// opções em argumentos sem que nenhum emulador esteja instalado. O que eles
// NÃO provam é que os emuladores aceitam esses argumentos — isso só a execução
// contra binários reais resolve, e está pendente.

func install(id, path string) Installation {
	return Installation{AdapterID: id, BinaryPath: path}
}

func argvString(cmd Command) string { return strings.Join(cmd.Argv, " ") }

func hasArg(cmd Command, arg string) bool {
	for _, item := range cmd.Argv {
		if item == arg {
			return true
		}
	}
	return false
}

// hasPair confirma que dois argumentos aparecem juntos e em ordem, o que
// importa para flags do tipo "-C chave=valor".
func hasPair(cmd Command, first, second string) bool {
	for i := 0; i+1 < len(cmd.Argv); i++ {
		if cmd.Argv[i] == first && cmd.Argv[i+1] == second {
			return true
		}
	}
	return false
}

func fullPreset() Options {
	return Options{
		Fullscreen:    true,
		InternalScale: 4,
		Renderer:      RendererVulkan,
		ExitOnClose:   true,
	}
}

// O caminho do jogo precisa sobreviver intacto e ficar no fim da linha, depois
// das flags. Um argumento fora de ordem faz o emulador tratar a ROM como opção.
func TestROMPathIsLastAndUnaltered(t *testing.T) {
	const rom = "C:\\Jogos\\meu jogo (USA).chd"

	registry := NewRegistry()
	for _, adapter := range registry.Adapters() {
		consoles := adapter.Consoles()
		if len(consoles) == 0 {
			t.Fatalf("%s não declara nenhum console", adapter.ID())
		}

		cmd, err := adapter.BuildCommand(
			install(adapter.ID(), "/opt/emu/bin"),
			Request{ROMPath: rom, ConsoleID: consoles[0], Options: fullPreset()},
		)

		// O RetroArch falha sem o core no disco, o que é o comportamento
		// correto e está coberto por teste próprio.
		if err != nil {
			if adapter.ID() == "retroarch" {
				continue
			}
			t.Fatalf("%s: BuildCommand falhou: %v", adapter.ID(), err)
		}

		if last := cmd.Argv[len(cmd.Argv)-1]; last != rom {
			t.Errorf("%s: último argumento = %q, esperado o caminho do jogo", adapter.ID(), last)
		}
		if cmd.Argv[0] != "/opt/emu/bin" {
			t.Errorf("%s: primeiro argumento = %q, esperado o executável", adapter.ID(), cmd.Argv[0])
		}
	}
}

// O Dolphin é o único do conjunto que aceita configuração completa por linha de
// comando, então nele a autoconfiguração do ZeuX precisa se aplicar de fato.
func TestDolphinAppliesFullPreset(t *testing.T) {
	cmd, err := newDolphin().BuildCommand(
		install("dolphin", "/usr/bin/dolphin-emu"),
		Request{ROMPath: "/roms/jogo.rvz", ConsoleID: "gamecube", Options: fullPreset()},
	)
	if err != nil {
		t.Fatalf("BuildCommand falhou: %v", err)
	}

	if !hasPair(cmd, "-C", "Dolphin.Display.Fullscreen=True") {
		t.Errorf("tela cheia não aplicada: %s", argvString(cmd))
	}
	if !hasPair(cmd, "-C", "GFX.Settings.InternalResolution=4") {
		t.Errorf("resolução interna não aplicada: %s", argvString(cmd))
	}
	if !hasPair(cmd, "-C", "Dolphin.Core.GFXBackend=Vulkan") {
		t.Errorf("backend gráfico não aplicado: %s", argvString(cmd))
	}
	if !hasArg(cmd, "-b") {
		t.Errorf("modo batch não aplicado: %s", argvString(cmd))
	}
	if !hasPair(cmd, "-e", "/roms/jogo.rvz") {
		t.Errorf("o jogo precisa vir depois de -e: %s", argvString(cmd))
	}

	if len(cmd.Unapplied) != 0 {
		t.Errorf("o Dolphin aceita tudo por linha de comando, não deveria reportar pendências: %v", cmd.Unapplied)
	}
}

// As flags do RMG foram lidas do código-fonte real (main.cpp), não de
// documentação de terceiros — ver docs/roadmap.md, achado do D11 em
// 2026-08-03. -f e -q existem; resolução interna e backend gráfico não têm
// flag e precisam virar Unapplied, não uma flag inventada.
func TestRMGAppliesFullscreenAndExitOnCloseReportsRest(t *testing.T) {
	cmd, err := newRMG().BuildCommand(
		install("rmg", "/usr/bin/RMG"),
		Request{ROMPath: "/roms/jogo.z64", ConsoleID: "n64", Options: fullPreset()},
	)
	if err != nil {
		t.Fatalf("BuildCommand falhou: %v", err)
	}

	if !hasArg(cmd, "-f") {
		t.Errorf("tela cheia não aplicada: %s", argvString(cmd))
	}
	if !hasArg(cmd, "-q") {
		t.Errorf("encerrar junto com o jogo não aplicado: %s", argvString(cmd))
	}
	if cmd.Argv[len(cmd.Argv)-1] != "/roms/jogo.z64" {
		t.Errorf("o caminho do jogo deveria ser o último argumento: %s", argvString(cmd))
	}
	if len(cmd.Unapplied) != 2 {
		t.Errorf("esperava 2 pendências (resolução interna, backend gráfico), veio: %v", cmd.Unapplied)
	}
}

// Onde a opção não cabe na linha de comando, o adapter precisa dizer — e não
// inventar uma flag. Uma flag inexistente faria o emulador recusar a abrir.
func TestUnsupportedOptionsAreReportedNotInvented(t *testing.T) {
	cases := []struct {
		name    string
		adapter Adapter
		console string
	}{
		{"pcsx2", newPCSX2(), "ps2"},
		{"duckstation", newDuckStation(), "ps1"},
		{"ppsspp", newPPSSPP(), "psp"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cmd, err := tc.adapter.BuildCommand(
				install(tc.name, "/opt/emu"),
				Request{ROMPath: "/roms/jogo.iso", ConsoleID: tc.console, Options: fullPreset()},
			)
			if err != nil {
				t.Fatalf("BuildCommand falhou: %v", err)
			}

			if len(cmd.Unapplied) == 0 {
				t.Errorf("esperava pendências reportadas para resolução e backend: %s", argvString(cmd))
			}

			// Nenhum argumento deve conter o número da escala: se aparecesse,
			// seria uma flag inventada.
			for _, arg := range cmd.Argv {
				if strings.Contains(arg, "InternalResolution") || arg == "vulkan" {
					t.Errorf("argumento inventado para opção não suportada: %q", arg)
				}
			}
		})
	}
}

// O PCSX2 precisa do separador "--", senão uma ROM cujo nome comece com hífen
// seria lida como flag.
func TestPCSX2SeparatesOptionsFromROM(t *testing.T) {
	cmd, err := newPCSX2().BuildCommand(
		install("pcsx2", "/opt/pcsx2-qt"),
		Request{ROMPath: "-jogo-estranho.iso", ConsoleID: "ps2", Options: Options{Fullscreen: true}},
	)
	if err != nil {
		t.Fatalf("BuildCommand falhou: %v", err)
	}

	separator := -1
	for i, arg := range cmd.Argv {
		if arg == "--" {
			separator = i
		}
	}

	if separator == -1 {
		t.Fatalf("separador -- ausente: %s", argvString(cmd))
	}
	if separator != len(cmd.Argv)-2 {
		t.Errorf("o separador deveria vir imediatamente antes do jogo: %s", argvString(cmd))
	}
}

// Os argumentos extras do usuário precisam entrar antes do caminho do jogo.
// Depois dele, o emulador os leria como conteúdo adicional — e no PCSX2, onde
// eles cairiam após o separador "--", viram argumentos posicionais.
func TestExtraArgsComeBeforeTheROM(t *testing.T) {
	const rom = "/roms/jogo.iso"
	options := Options{Fullscreen: true, Extra: []string{"--minha-flag", "--outra=1"}}

	registry := NewRegistry()
	for _, adapter := range registry.Adapters() {
		consoles := adapter.Consoles()

		cmd, err := adapter.BuildCommand(
			install(adapter.ID(), "/opt/emu/bin"),
			Request{ROMPath: rom, ConsoleID: consoles[0], Options: options},
		)
		if err != nil {
			if adapter.ID() == "retroarch" {
				continue
			}
			t.Fatalf("%s: BuildCommand falhou: %v", adapter.ID(), err)
		}

		romIndex, extraIndex := -1, -1
		for i, arg := range cmd.Argv {
			switch arg {
			case rom:
				romIndex = i
			case "--minha-flag":
				extraIndex = i
			}
		}

		if extraIndex == -1 {
			t.Errorf("%s: argumentos extras sumiram: %s", adapter.ID(), argvString(cmd))
			continue
		}
		if romIndex == -1 {
			t.Errorf("%s: caminho do jogo sumiu: %s", adapter.ID(), argvString(cmd))
			continue
		}
		if extraIndex > romIndex {
			t.Errorf("%s: extras vieram depois do jogo: %s", adapter.ID(), argvString(cmd))
		}
	}
}

// No PCSX2 o erro é mais grave: qualquer coisa depois do "--" deixa de ser
// interpretada como opção.
func TestPCSX2ExtraArgsStayBeforeSeparator(t *testing.T) {
	cmd, err := newPCSX2().BuildCommand(
		install("pcsx2", "/opt/pcsx2-qt"),
		Request{
			ROMPath:   "/roms/jogo.iso",
			ConsoleID: "ps2",
			Options:   Options{Fullscreen: true, Extra: []string{"--minha-flag"}},
		},
	)
	if err != nil {
		t.Fatalf("BuildCommand falhou: %v", err)
	}

	for i, arg := range cmd.Argv {
		if arg == "--minha-flag" {
			if i > 0 && cmd.Argv[i-1] == "--" {
				t.Errorf("extra caiu depois do separador: %s", argvString(cmd))
			}
			return
		}
	}

	t.Errorf("argumento extra sumiu: %s", argvString(cmd))
}

// Toda opção do preset ou é aplicada na linha de comando, ou é reportada como
// pendente. Ignorar em silêncio é o único desfecho inaceitável: o usuário
// acharia que o ZeuX configurou algo que ele não configurou.
func TestNoOptionIsSilentlyIgnored(t *testing.T) {
	registry := NewRegistry()

	for _, adapter := range registry.Adapters() {
		if adapter.ID() == "retroarch" {
			continue // coberto por teste próprio, exige core no disco
		}

		cmd, err := adapter.BuildCommand(
			install(adapter.ID(), "/opt/emu/bin"),
			Request{ROMPath: "/roms/jogo.iso", ConsoleID: adapter.Consoles()[0], Options: fullPreset()},
		)
		if err != nil {
			t.Fatalf("%s: BuildCommand falhou: %v", adapter.ID(), err)
		}

		argv := strings.ToLower(argvString(cmd))
		reported := strings.ToLower(strings.Join(cmd.Unapplied, " "))

		checks := []struct {
			option  string
			applied bool
			words   []string
		}{
			{"tela cheia", strings.Contains(argv, "full") || strings.Contains(argv, "-f"), []string{"tela cheia"}},
			{"resolução interna", strings.Contains(argv, "resolution") || strings.Contains(argv, "scale"), []string{"resolução"}},
			{"encerrar junto com o jogo", strings.Contains(argv, "batch") || strings.Contains(argv, "-b") || strings.Contains(argv, "no-gui") || strings.Contains(argv, "escape-exit") || strings.Contains(argv, "-q"), []string{"fechar o jogo", "encerrá-lo"}},
		}

		for _, check := range checks {
			if check.applied {
				continue
			}

			var mentioned bool
			for _, word := range check.words {
				if strings.Contains(reported, word) {
					mentioned = true
				}
			}
			if !mentioned {
				t.Errorf("%s: opção %q não foi aplicada nem reportada.\n  comando: %s\n  pendências: %v",
					adapter.ID(), check.option, argvString(cmd), cmd.Unapplied)
			}
		}
	}
}

func TestRejectsConsoleTheAdapterDoesNotSupport(t *testing.T) {
	_, err := newDuckStation().BuildCommand(
		install("duckstation", "/opt/duckstation"),
		Request{ROMPath: "/roms/jogo.iso", ConsoleID: "ps3"},
	)

	var unsupported ErrUnsupportedConsole
	if err == nil {
		t.Fatal("esperava recusa ao console não suportado")
	}
	if !asUnsupported(err, &unsupported) {
		t.Fatalf("esperava ErrUnsupportedConsole, veio %T: %v", err, err)
	}
	if unsupported.ConsoleID != "ps3" {
		t.Errorf("console no erro = %q, esperado ps3", unsupported.ConsoleID)
	}
}

func asUnsupported(err error, target *ErrUnsupportedConsole) bool {
	if e, ok := err.(ErrUnsupportedConsole); ok {
		*target = e
		return true
	}
	return false
}

func TestRejectsEmptyROMPath(t *testing.T) {
	if _, err := newDolphin().BuildCommand(
		install("dolphin", "/usr/bin/dolphin-emu"),
		Request{ROMPath: "  ", ConsoleID: "wii"},
	); err == nil {
		t.Error("esperava recusa ao caminho vazio")
	}
}

// Sem core instalado o RetroArch abriria no menu, sem explicação. Falhar com o
// nome do core faltante é mais útil.
func TestRetroArchFailsWithCoreNameWhenCoreMissing(t *testing.T) {
	// Isola HOME: sem isso, o teste passa a falhar de propósito errado numa
	// máquina que já tenha o core mesen instalado de verdade (ex.: sessão de
	// 2026-08-04, que testou o download/cópia de cores bundled de ponta a
	// ponta na máquina real do Douglas) — coreDirs() acharia o core
	// genuíno e BuildCommand não devolveria mais o erro que este teste
	// trava.
	t.Setenv("HOME", t.TempDir())

	_, err := newRetroArch().BuildCommand(
		install("retroarch", "/opt/retroarch/retroarch"),
		Request{ROMPath: "/roms/mario.nes", ConsoleID: "nes"},
	)
	if err == nil {
		t.Fatal("esperava falha quando o core não está no disco")
	}
	if !strings.Contains(err.Error(), "mesen") {
		t.Errorf("a mensagem deveria nomear o core faltante: %v", err)
	}
}

func TestRetroArchRejectsUnknownCore(t *testing.T) {
	_, err := newRetroArch().BuildCommand(
		install("retroarch", "/opt/retroarch/retroarch"),
		Request{ROMPath: "/roms/mario.nes", ConsoleID: "nes", Core: "core-inexistente"},
	)
	if err == nil || !strings.Contains(err.Error(), "desconhecido") {
		t.Errorf("esperava recusa a core desconhecido, veio: %v", err)
	}
}

// Todo console do catálogo precisa ter um core padrão do RetroArch declarado,
// senão a escolha automática falha em tempo de execução.
func TestRetroArchDefaultCoresAreKnown(t *testing.T) {
	for console, core := range defaultCoreByConsole {
		if _, ok := retroArchCores[core]; !ok {
			t.Errorf("console %q aponta para o core %q, que não está mapeado", console, core)
		}
	}
}

// Um emulador dedicado deve ser preferido ao RetroArch no seu console: costuma
// ter compatibilidade melhor que o core equivalente.
func TestStandalonePreferredOverRetroArch(t *testing.T) {
	candidates := NewRegistry().ForConsole("ps1")
	if len(candidates) < 2 {
		t.Fatalf("esperava DuckStation e RetroArch para PS1, veio %d", len(candidates))
	}
	if candidates[0].ID() != "duckstation" {
		t.Errorf("primeiro candidato = %q, esperado duckstation", candidates[0].ID())
	}
}

func TestRegistryLookup(t *testing.T) {
	registry := NewRegistry()

	if _, ok := registry.ByID("dolphin"); !ok {
		t.Error("dolphin deveria estar registrado")
	}
	if _, ok := registry.ByID("nao-existe"); ok {
		t.Error("adapter inexistente não deveria ser encontrado")
	}
	if got := registry.ForConsole("console-inexistente"); len(got) != 0 {
		t.Errorf("esperava nenhum adapter, veio %d", len(got))
	}
}

func TestValidateROMRejectsMissingFile(t *testing.T) {
	if err := ValidateROM("/caminho/que/nao/existe.iso"); err == nil {
		t.Error("esperava erro para arquivo inexistente")
	}
	if err := ValidateROM(t.TempDir()); err == nil {
		t.Error("esperava erro ao apontar para uma pasta")
	}
}
