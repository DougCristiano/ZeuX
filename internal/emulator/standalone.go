package emulator

import (
	"context"
	"fmt"
	"path/filepath"
	"strconv"
)

// standaloneAdapter cobre os emuladores de console único, cuja diferença entre
// si é apenas a gramática de argumentos. Um tipo por emulador seria sete cópias
// da mesma estrutura mudando só a função de montagem.
type standaloneAdapter struct {
	id       string
	name     string
	consoles []string

	// names são os nomes de executável procurados no disco, em ordem de
	// preferência.
	names []string

	// buildArgs traduz as opções na gramática do emulador.
	//
	// A separação entre opts e romPart existe por causa dos argumentos extras
	// do usuário: eles precisam entrar entre os dois. Anexá-los ao final
	// colocaria o extra depois do caminho do jogo — e no PCSX2, depois do
	// separador "--", onde qualquer coisa vira argumento posicional.
	buildArgs func(req Request) (opts []string, romPart []string, unapplied []string)
}

func (a standaloneAdapter) ID() string         { return a.id }
func (a standaloneAdapter) Name() string       { return a.name }
func (a standaloneAdapter) Consoles() []string { return a.consoles }

func (a standaloneAdapter) Locate(ctx context.Context) (Installation, bool) {
	path, managed, version, ok := findBinary(ctx, a.id, a.consoles, a.names, nil)
	if !ok {
		return Installation{}, false
	}

	return Installation{
		AdapterID:  a.id,
		Name:       a.name,
		BinaryPath: path,
		Version:    version,
		Managed:    managed,
	}, true
}

func (a standaloneAdapter) BuildCommand(install Installation, req Request) (Command, error) {
	if err := validateRequest(a, req); err != nil {
		return Command{}, err
	}
	if install.BinaryPath == "" {
		return Command{}, fmt.Errorf("caminho do executável do %s não informado", a.name)
	}

	opts, romPart, unapplied := a.buildArgs(req)

	// Continuar num emulador sem suporte não pode fingir que foi atendido: o
	// jogo abre do início e o usuário precisa saber disso pela própria prévia.
	if req.Mode == ModeResume {
		if !SupportsResume(a.id) {
			unapplied = append(unapplied, resumeUnappliedMessage)
		} else if req.StatePath == "" {
			// Prévia (POST /games/preview): não há disco consultado, então o
			// estado só entra no lançamento de verdade.
			unapplied = append(unapplied,
				"O estado de retomada é localizado na hora de abrir o jogo; esta prévia mostra a linha sem ele.")
		}
	}

	argv := append([]string{install.BinaryPath}, opts...)
	argv = append(argv, req.Options.Extra...)
	argv = append(argv, romPart...)

	return Command{Argv: argv, Unapplied: unapplied}, nil
}

// AVISO SOBRE AS FLAGS ABAIXO
//
// As gramáticas de linha de comando foram checadas contra o --help/-h real de
// cada binário (ou empiricamente, rodando com a flag, para os que não imprimem
// ajuda) em 2026-08-01 — ver D1 em docs/roadmap.md para o resultado completo
// por adapter e as correções feitas. O que continua sem validar é abrir uma ROM
// de verdade até o fim: o ZeuX não obtém ROM, então essa última milha só pode
// ser fechada por quem tem jogos próprios.

func newDuckStation() Adapter {
	return standaloneAdapter{
		id:       "duckstation",
		name:     "DuckStation",
		consoles: []string{"ps1"},
		names: binaryNames("duckstation-qt",
			[]string{"duckstation-qt-x64-ReleaseLTCG.exe", "duckstation-qt.exe", "duckstation.exe"},
			"DuckStation"),
		buildArgs: func(req Request) ([]string, []string, []string) {
			opts := []string{}
			var unapplied []string

			if req.Options.ExitOnClose {
				// -batch não abre a interface do emulador e encerra junto com o
				// jogo, que é o comportamento esperado por quem entrou pelo ZeuX.
				opts = append(opts, "-batch")
			}
			if req.Options.Fullscreen {
				opts = append(opts, "-fullscreen")
			}
			if req.Options.InternalScale > 1 {
				unapplied = append(unapplied,
					"A resolução interna precisa ser ajustada dentro do DuckStation.")
			}
			if req.Options.Renderer != RendererDefault {
				unapplied = append(unapplied,
					"O backend gráfico precisa ser escolhido dentro do DuckStation.")
			}
			// `-statefile <arquivo>` está na ajuda do próprio DuckStation
			// (duckstation-qt/qthost.cpp, PrintCommandLineHelp) — "Loads state
			// from the specified filename". Lido no código-fonte, não no binário.
			// Usamos o caminho explícito e não o `-resume`, que escolhe o
			// arquivo pelo nome do jogo ou pelo mais recente: aqui o estado
			// deste jogo já é conhecido (resume.go).
			if req.Mode == ModeResume && req.StatePath != "" {
				opts = append(opts, "-statefile", req.StatePath)
			}

			return opts, []string{req.ROMPath}, unapplied
		},
	}
}

// PCSX2 é um dos dois pilotos do H1 (docs/roadmap.md) — envolvido em
// pcsx2ConfigurableAdapter para ganhar ReadConfig/WriteConfig/RestoreConfig
// (pcsx2_config.go) além do BuildCommand de sempre. Nenhum outro adapter
// desta lista muda: só o PCSX2 sai como algo além de um standaloneAdapter
// puro.
func newPCSX2() Adapter {
	return pcsx2ConfigurableAdapter{Adapter: standaloneAdapter{
		id:       "pcsx2",
		name:     "PCSX2",
		consoles: []string{"ps2"},
		names: binaryNames("pcsx2-qt",
			[]string{"pcsx2-qt.exe", "pcsx2-qtx64-avx2.exe", "pcsx2.exe"},
			"PCSX2"),
		buildArgs: func(req Request) ([]string, []string, []string) {
			opts := []string{}
			var unapplied []string

			if req.Options.ExitOnClose {
				opts = append(opts, "-batch")
			}
			if req.Options.Fullscreen {
				opts = append(opts, "-fullscreen")
			}
			if req.Options.InternalScale > 1 {
				unapplied = append(unapplied,
					"A resolução interna precisa ser ajustada dentro do PCSX2.")
			}
			if req.Options.Renderer != RendererDefault {
				unapplied = append(unapplied,
					"O backend gráfico precisa ser escolhido dentro do PCSX2.")
			}
			// Mesma flag do DuckStation, na ajuda do PCSX2
			// (pcsx2-qt/QtHost.cpp). Fica antes do "--": é opção, não jogo.
			if req.Mode == ModeResume && req.StatePath != "" {
				opts = append(opts, "-statefile", req.StatePath)
			}

			// O "--" separa as opções do caminho do jogo. Sem ele, ROMs cujo nome
			// começa com hífen seriam lidas como flag.
			return opts, []string{"--", req.ROMPath}, unapplied
		},
	}}
}

func newDolphin() Adapter {
	return standaloneAdapter{
		id:       "dolphin",
		name:     "Dolphin",
		consoles: []string{"gamecube", "wii"},
		names: binaryNames("dolphin-emu",
			[]string{"Dolphin.exe", "DolphinWx.exe"},
			"Dolphin"),
		buildArgs: func(req Request) ([]string, []string, []string) {
			opts := []string{}

			if req.Options.ExitOnClose {
				opts = append(opts, "-b")
			}

			// O Dolphin é o mais flexível do conjunto: -C sobrescreve qualquer
			// configuração do INI direto na linha de comando, então aqui a
			// autoconfiguração do ZeuX se aplica de verdade.
			if req.Options.Fullscreen {
				opts = append(opts, "-C", "Dolphin.Display.Fullscreen=True")
			}
			if req.Options.InternalScale > 1 {
				opts = append(opts, "-C",
					"GFX.Settings.InternalResolution="+strconv.Itoa(req.Options.InternalScale))
			}

			switch req.Options.Renderer {
			case RendererVulkan:
				opts = append(opts, "-C", "Dolphin.Core.GFXBackend=Vulkan")
			case RendererOpenGL:
				opts = append(opts, "-C", "Dolphin.Core.GFXBackend=OGL")
			case RendererD3D12:
				opts = append(opts, "-C", "Dolphin.Core.GFXBackend=D3D12")
			case RendererSoftware:
				opts = append(opts, "-C", "Dolphin.Core.GFXBackend=Software Renderer")
			}

			// `-s <arquivo>` (Source/Core/UICommon/CommandLineParse.cpp,
			// "Load the initial save state"). O estado é carregado depois do
			// boot (Core.cpp), então a ordem em relação a `-e` não muda o
			// resultado; fica antes do jogo por consistência com os demais.
			if req.Mode == ModeResume && req.StatePath != "" {
				opts = append(opts, "-s", req.StatePath)
			}

			return opts, []string{"-e", req.ROMPath}, nil
		},
	}
}

func newPPSSPP() Adapter {
	return standaloneAdapter{
		id:       "ppsspp",
		name:     "PPSSPP",
		consoles: []string{"psp"},
		names: binaryNames("PPSSPPSDL",
			[]string{"PPSSPPWindows64.exe", "PPSSPPWindows.exe"},
			"PPSSPP"),
		buildArgs: func(req Request) ([]string, []string, []string) {
			opts := []string{}
			var unapplied []string

			if req.Options.Fullscreen {
				opts = append(opts, "--fullscreen")
			}
			if req.Options.ExitOnClose {
				// O PPSSPP não tem um flag de "encerra sozinho quando o jogo
				// termina" como o -batch do DuckStation. --pause-menu-exit troca
				// "Sair para o menu" por "Sair" de verdade no menu de pausa, e
				// --escape-exit faz o ESC sair na hora — juntos são a aproximação
				// mais próxima do comportamento que ExitOnClose pede nos outros
				// adapters. Confirmado contra a documentação oficial em
				// ppsspp.org/docs/reference/command-line; o binário não expõe
				// --help para conferir contra o --help real como nos demais.
				opts = append(opts, "--escape-exit", "--pause-menu-exit")
			}
			if req.Options.InternalScale > 1 {
				unapplied = append(unapplied,
					"A resolução de renderização precisa ser ajustada dentro do PPSSPP.")
			}
			if req.Options.Renderer != RendererDefault {
				unapplied = append(unapplied,
					"O backend gráfico precisa ser escolhido dentro do PPSSPP.")
			}
			// `--state FILE` está em Core/CmdLine.cpp (g_autoParams, "Load state
			// from specified file"), e a própria ajuda do PPSSPP imprime
			// "--state=FILE". A documentação pública (ppsspp.org/docs/reference/
			// command-line) não lista a flag, por isso a confirmação vem do código.
			// O estado só é carregado se o jogo também vier na linha (UI/NativeApp.cpp,
			// "if (!boot_filename.empty() && stateToLoad)"): o caminho do jogo continua.
			if req.Mode == ModeResume && req.StatePath != "" {
				opts = append(opts, "--state", req.StatePath)
			}

			return opts, []string{req.ROMPath}, unapplied
		},
	}
}

func newFlycast() Adapter {
	return standaloneAdapter{
		id:       "flycast",
		name:     "Flycast",
		consoles: []string{"dreamcast"},
		names:    binaryNames("flycast", []string{"flycast.exe"}, "Flycast"),
		buildArgs: func(req Request) ([]string, []string, []string) {
			var opts []string
			var unapplied []string

			// O Flycast standalone expõe muito pouco por linha de comando; quase
			// tudo vive no emu.cfg. "-config section:key=value" sobrescreve uma
			// chave sem persistir no arquivo — confirmado rodando o binário real
			// com essa flag (fica de pé, sem erro no log) e contra o wiki
			// dedicado do projeto (TheArcadeStriker/flycast-wiki), que traz esse
			// comando exato como exemplo.
			if req.Options.Fullscreen {
				opts = append(opts, "-config", "window:fullscreen=yes")
			}
			// Salvar estado ao fechar (decisão do Douglas, 2026-10-09): ligado por
			// padrão do ZeuX, e explícito nos dois sentidos, para que o emu.cfg do
			// usuário não decida no lugar da escolha feita na tela. Sem essa linha
			// nenhum estado de retomada é gravado ao fechar (Dreamcast.AutoSaveState,
			// core/emulator.cpp, unloadGame).
			if req.AutoSaveStateOff {
				opts = append(opts, "-config", "Dreamcast:AutoSaveState=no")
			} else {
				opts = append(opts, "-config", "Dreamcast:AutoSaveState=yes")
			}
			if req.Options.InternalScale > 1 {
				unapplied = append(unapplied,
					"A resolução interna precisa ser ajustada dentro do Flycast.")
			}
			if req.Options.Renderer != RendererDefault {
				unapplied = append(unapplied,
					"O backend gráfico precisa ser escolhido dentro do Flycast.")
			}
			if req.Options.ExitOnClose {
				unapplied = append(unapplied,
					"O Flycast volta ao menu ao fechar o jogo; não há opção de linha de comando para encerrá-lo junto.")
			}

			// Iniciar do zero e Continuar (2026-10-09). Sem nenhuma opção, o Flycast
			// segue o "Automatic State: Load" do emu.cfg do usuário, então o modo é
			// dito explicitamente com "-config" transitório: Dreamcast.AutoLoadState
			// (core/cfg/option.cpp) e, para Continuar, Dreamcast.SavestateSlot. A
			// ajuda do binário diz que o valor transitório não vai para o emu.cfg
			// (core/cfg/cl.cpp, usage: "Transient config values won't be saved to
			// emu.cfg."). Lido no código-fonte, não no binário.
			switch {
			case req.Mode == ModeResume && req.StatePath != "":
				if slot, ok := flycastStateSlot(filepath.Base(req.StatePath), req.ROMPath); ok {
					opts = append(opts, "-config", "Dreamcast:AutoLoadState=yes",
						"-config", "Dreamcast:SavestateSlot="+strconv.Itoa(slot))
				} else {
					// Nome que não casa com este jogo: melhor abrir do início e dizer
					// isso do que carregar o estado de outro jogo.
					opts = append(opts, "-config", "Dreamcast:AutoLoadState=no")
					unapplied = append(unapplied,
						"O estado escolhido não corresponde a este jogo; o jogo abre do início.")
				}
			case req.Mode == ModeResume:
				// Prévia sem o caminho do estado: o aviso de "localizado na hora" já
				// vem do standalone, e a linha fica sem a opção.
			default:
				opts = append(opts, "-config", "Dreamcast:AutoLoadState=no")
			}

			return opts, []string{req.ROMPath}, unapplied
		},
	}
}

func newRPCS3() Adapter {
	return standaloneAdapter{
		id:       "rpcs3",
		name:     "RPCS3",
		consoles: []string{"ps3"},
		names:    binaryNames("rpcs3", []string{"rpcs3.exe"}, "RPCS3"),
		buildArgs: func(req Request) ([]string, []string, []string) {
			opts := []string{}
			var unapplied []string

			if req.Options.ExitOnClose {
				opts = append(opts, "--no-gui")
			}
			if req.Options.Fullscreen {
				// --help do próprio RPCS3 avisa: "--fullscreen ... Only used
				// when no-gui is set." Sem --no-gui, a flag é aceita mas não
				// tem efeito nenhum — silenciosa, não um erro.
				if req.Options.ExitOnClose {
					opts = append(opts, "--fullscreen")
				} else {
					unapplied = append(unapplied,
						"A tela cheia do RPCS3 só funciona quando o jogo também encerra sozinho ao fechar; sem essa opção, ative dentro do RPCS3.")
				}
			}
			if req.Options.InternalScale > 1 || req.Options.Renderer != RendererDefault {
				unapplied = append(unapplied,
					"Resolução e backend gráfico precisam ser ajustados dentro do RPCS3.")
			}

			// `--savestate <arquivo>` está em rpcs3/rpcs3.cpp (QCommandLineOption
			// "Path for directly loading a savestate."). O bloco que trata esta
			// opção é um "else if" antes do que abre o caminho posicional do jogo:
			// com --savestate, o RPCS3 ignora o caminho do jogo. Por isso o jogo
			// só sai da linha quando o estado vai junto — o estado já diz qual é o
			// jogo. Sem StatePath (prévia, ou "do zero") o jogo entra normalmente.
			romPart := []string{req.ROMPath}
			if req.Mode == ModeResume && req.StatePath != "" {
				opts = append(opts, "--savestate", req.StatePath)
				romPart = nil
			}

			return opts, romPart, unapplied
		},
	}
}

func newMelonDS() Adapter {
	return standaloneAdapter{
		id:       "melonds",
		name:     "melonDS",
		consoles: []string{"nds"},
		names:    binaryNames("melonDS", []string{"melonDS.exe"}, "melonDS"),
		buildArgs: func(req Request) ([]string, []string, []string) {
			opts := []string{}
			var unapplied []string

			if req.Options.Fullscreen {
				opts = append(opts, "-f")
			}
			if req.Options.InternalScale > 1 || req.Options.Renderer != RendererDefault {
				unapplied = append(unapplied,
					"Resolução interna e renderizador precisam ser ajustados dentro do melonDS.")
			}
			if req.Options.ExitOnClose {
				unapplied = append(unapplied,
					"O melonDS permanece aberto ao fechar o jogo; não há opção de linha de comando para encerrá-lo junto.")
			}

			return opts, []string{req.ROMPath}, unapplied
		},
	}
}

// Azahar é a continuação do Citra, que foi descontinuado após ação judicial.
// A gramática de linha de comando herdou a do Citra.
func newAzahar() Adapter {
	return standaloneAdapter{
		id:       "azahar",
		name:     "Azahar",
		consoles: []string{"3ds"},
		names: binaryNames("azahar",
			[]string{"azahar.exe", "citra-qt.exe"},
			"Azahar"),
		buildArgs: func(req Request) ([]string, []string, []string) {
			var unapplied []string

			if req.Options.Fullscreen {
				unapplied = append(unapplied,
					"A tela cheia precisa ser ativada dentro do Azahar.")
			}
			if req.Options.InternalScale > 1 || req.Options.Renderer != RendererDefault {
				unapplied = append(unapplied,
					"Resolução interna e backend gráfico precisam ser ajustados dentro do Azahar.")
			}
			if req.Options.ExitOnClose {
				unapplied = append(unapplied,
					"O Azahar permanece aberto ao fechar o jogo; não há opção de linha de comando para encerrá-lo junto.")
			}

			return nil, []string{req.ROMPath}, unapplied
		},
	}
}

func newXemu() Adapter {
	return standaloneAdapter{
		id:       "xemu",
		name:     "xemu",
		consoles: []string{"xbox"},
		names:    binaryNames("xemu", []string{"xemu.exe"}, "xemu"),
		buildArgs: func(req Request) ([]string, []string, []string) {
			opts := []string{}
			var unapplied []string

			if req.Options.Fullscreen {
				opts = append(opts, "-full-screen")
			}
			if req.Options.InternalScale > 1 {
				unapplied = append(unapplied,
					"A resolução de saída precisa ser ajustada dentro do xemu.")
			}
			if req.Options.Renderer != RendererDefault {
				unapplied = append(unapplied,
					"O backend gráfico precisa ser escolhido dentro do xemu.")
			}
			if req.Options.ExitOnClose {
				unapplied = append(unapplied,
					"O xemu permanece aberto ao fechar o jogo; não há opção de linha de comando para encerrá-lo junto.")
			}

			// O xemu monta a imagem como disco, e não recebe a ROM como
			// argumento posicional.
			return opts, []string{"-dvd_path", req.ROMPath}, unapplied
		},
	}
}

func newVita3K() Adapter {
	return standaloneAdapter{
		id:       "vita3k",
		name:     "Vita3K",
		consoles: []string{"vita"},
		names:    binaryNames("Vita3K", []string{"Vita3K.exe"}, "Vita3K"),
		buildArgs: func(req Request) ([]string, []string, []string) {
			var unapplied []string

			if req.Options.Fullscreen {
				unapplied = append(unapplied,
					"A tela cheia precisa ser ativada dentro do Vita3K.")
			}
			if req.Options.InternalScale > 1 || req.Options.Renderer != RendererDefault {
				unapplied = append(unapplied,
					"A resolução de renderização e o backend gráfico precisam ser ajustados dentro do Vita3K.")
			}
			if req.Options.ExitOnClose {
				unapplied = append(unapplied,
					"O Vita3K permanece aberto ao fechar o jogo; não há opção de linha de comando para encerrá-lo junto.")
			}

			// O --help real do Vita3K mostra dois caminhos diferentes: "-r,
			// --installed-path" espera um app JÁ instalado (ID interno, não um
			// arquivo do disco), enquanto o argumento posicional [content-path]
			// é quem aceita um .vpk/.zip solto e instala + roda na hora — o
			// caso do ZeuX, que aponta para o arquivo da ROM.
			return nil, []string{req.ROMPath}, unapplied
		},
	}
}

func newXenia() Adapter {
	return standaloneAdapter{
		id:       "xenia",
		name:     "Xenia",
		consoles: []string{"xbox360"},
		// O Xenia só existe para Windows. Em Linux e macOS o Locate simplesmente
		// não encontra nada, que é o comportamento correto — não é preciso
		// tratar a plataforma como caso especial.
		names: []string{"xenia.exe", "xenia_canary.exe"},
		buildArgs: func(req Request) ([]string, []string, []string) {
			opts := []string{}
			var unapplied []string

			if req.Options.Fullscreen {
				opts = append(opts, "--fullscreen=true")
			}
			if req.Options.InternalScale > 1 {
				unapplied = append(unapplied,
					"A resolução de saída precisa ser ajustada dentro do Xenia.")
			}
			if req.Options.Renderer != RendererDefault {
				unapplied = append(unapplied,
					"O backend gráfico precisa ser escolhido dentro do Xenia.")
			}
			if req.Options.ExitOnClose {
				unapplied = append(unapplied,
					"O Xenia permanece aberto ao fechar o jogo; não há opção de linha de comando para encerrá-lo junto.")
			}

			return opts, []string{req.ROMPath}, unapplied
		},
	}
}

func newCemu() Adapter {
	return standaloneAdapter{
		id:       "cemu",
		name:     "Cemu",
		consoles: []string{"wiiu"},
		names:    binaryNames("Cemu", []string{"Cemu.exe"}, "Cemu"),
		buildArgs: func(req Request) ([]string, []string, []string) {
			opts := []string{}
			var unapplied []string

			if req.Options.Fullscreen {
				opts = append(opts, "-f")
			}
			if req.Options.InternalScale > 1 || req.Options.Renderer != RendererDefault {
				unapplied = append(unapplied,
					"Resolução e backend gráfico precisam ser ajustados dentro do Cemu.")
			}
			if req.Options.ExitOnClose {
				unapplied = append(unapplied,
					"O Cemu volta ao menu ao fechar o jogo; não há opção de linha de comando para encerrá-lo junto.")
			}

			// O Cemu exige -g antes do caminho do jogo.
			return opts, []string{"-g", req.ROMPath}, unapplied
		},
	}
}

// newRMG cria o adapter do RMG (Rosalie's Mupen GUI), emulador dedicado de
// N64 com release real no GitHub (Linux via AppImage, Windows via zip) — ao
// contrário do RetroArch, que atende N64 mas não é instalável pelo 1-click
// (distribuição própria, fora do GitHub). Sem isso, N64 nunca seria "plug and
// play" de verdade: o usuário precisaria instalar o RetroArch e o core na mão
// mesmo depois do ZeuX dizer que o console estava pronto.
//
// As flags foram lidas do código-fonte real (Source/RMG/main.cpp,
// QCommandLineParser), não de documentação de terceiros — ver
// docs/roadmap.md, achado de 2026-08-03 no D11.
func newRMG() Adapter {
	return standaloneAdapter{
		id:       "rmg",
		name:     "RMG (Rosalie's Mupen GUI)",
		consoles: []string{"n64"},
		names:    binaryNames("RMG", []string{"RMG.exe"}, ""),
		buildArgs: func(req Request) ([]string, []string, []string) {
			opts := []string{}
			var unapplied []string

			if req.Options.Fullscreen {
				opts = append(opts, "-f")
			}
			if req.Options.ExitOnClose {
				opts = append(opts, "-q")
			}
			if req.Options.InternalScale > 1 {
				unapplied = append(unapplied,
					"A resolução interna precisa ser ajustada dentro do RMG.")
			}
			if req.Options.Renderer != RendererDefault {
				unapplied = append(unapplied,
					"O backend gráfico precisa ser escolhido dentro do RMG.")
			}

			return opts, []string{req.ROMPath}, unapplied
		},
	}
}
