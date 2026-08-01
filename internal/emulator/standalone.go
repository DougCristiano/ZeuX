package emulator

import (
	"context"
	"fmt"
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
	path, managed, ok := findBinary(ctx, a.id, a.names, nil)
	if !ok {
		return Installation{}, false
	}

	return Installation{
		AdapterID:  a.id,
		Name:       a.name,
		BinaryPath: path,
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

			return opts, []string{req.ROMPath}, unapplied
		},
	}
}

func newPCSX2() Adapter {
	return standaloneAdapter{
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

			// O "--" separa as opções do caminho do jogo. Sem ele, ROMs cujo nome
			// começa com hífen seriam lidas como flag.
			return opts, []string{"--", req.ROMPath}, unapplied
		},
	}
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

			return opts, []string{req.ROMPath}, unapplied
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
