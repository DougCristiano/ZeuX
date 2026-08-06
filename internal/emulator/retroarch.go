package emulator

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
)

// bundledCoresInitOnce garante que cores bundled são copiados apenas uma vez
// por execução do daemon (idempotente na primeira vez).
var bundledCoresInitOnce sync.Once

// O RetroArch não é um emulador, e sim um front-end que carrega cores. Sem
// core ele não roda nada, então este adapter carrega uma responsabilidade que
// os standalone não têm: descobrir qual biblioteca carregar e onde ela está.

// retroArchCores mapeia o nome amigável do core (o mesmo usado no catálogo de
// consoles) para o nome do arquivo, sem a extensão de plataforma.
var retroArchCores = map[string]string{
	// Nintendo
	"mesen":            "mesen_libretro",
	"bsnes":            "bsnes_libretro",
	"snes9x":           "snes9x_libretro",
	"mgba":             "mgba_libretro",
	"gambatte":         "gambatte_libretro",
	"sameboy":          "sameboy_libretro",
	"parallel n64":     "parallel_n64_libretro",
	"mupen64plus-next": "mupen64plus_next_libretro",
	"melonds":          "melonds_libretro",
	"beetle vb":        "mednafen_vb_libretro",

	// Sega
	"genesis plus gx": "genesis_plus_gx_libretro",
	"picodrive":       "picodrive_libretro",
	"beetle saturn":   "mednafen_saturn_libretro",
	"yabause":         "yabause_libretro",
	"flycast":         "flycast_libretro",

	// Sony
	"beetle psx hw": "mednafen_psx_hw_libretro",
	"swanstation":   "swanstation_libretro",
	"ppsspp":        "ppsspp_libretro",

	// NEC, SNK, Bandai, Panasonic
	"beetle pce":   "mednafen_pce_libretro",
	"beetle ngp":   "mednafen_ngp_libretro",
	"beetle cygne": "mednafen_wswan_libretro",
	"opera":        "opera_libretro",

	// Atari e fliperama
	"stella": "stella_libretro",
	"mame":   "mame_libretro",
	"fbneo":  "fbneo_libretro",
}

// defaultCoreByConsole é o core usado quando a requisição não especifica um.
//
// A escolha aqui privilegia compatibilidade sobre precisão: quem não escolheu
// core explicitamente quer que o jogo abra, não a emulação mais fiel. Os cores
// de alta precisão (bsnes, ParaLLEl, Beetle Saturn) aparecem nos patamares
// altos do catálogo, onde o hardware aguenta.
var defaultCoreByConsole = map[string]string{
	"nes":          "mesen",
	"snes":         "snes9x",
	"gb":           "gambatte",
	"gbc":          "gambatte",
	"gba":          "mgba",
	"n64":          "mupen64plus-next",
	"nds":          "melonds",
	"virtualboy":   "beetle vb",
	"mastersystem": "genesis plus gx",
	"gamegear":     "genesis plus gx",
	"megadrive":    "genesis plus gx",
	"segacd":       "genesis plus gx",
	"sega32x":      "picodrive",
	"saturn":       "beetle saturn",
	"dreamcast":    "flycast",
	"ps1":          "beetle psx hw",
	"psp":          "ppsspp",
	"pcengine":     "beetle pce",
	"ngpc":         "beetle ngp",
	"wonderswan":   "beetle cygne",
	"3do":          "opera",
	"atari2600":    "stella",
	"arcade":       "mame",
	"neogeo":       "fbneo",
}

type retroArchAdapter struct{}

func newRetroArch() Adapter { return retroArchAdapter{} }

func (retroArchAdapter) ID() string   { return "retroarch" }
func (retroArchAdapter) Name() string { return "RetroArch" }

func (retroArchAdapter) Consoles() []string {
	consoles := make([]string, 0, len(defaultCoreByConsole))
	for id := range defaultCoreByConsole {
		consoles = append(consoles, id)
	}
	return consoles
}

func (a retroArchAdapter) Locate(ctx context.Context) (Installation, bool) {
	names := binaryNames("retroarch", []string{"retroarch.exe"}, "RetroArch")

	path, managed, version, ok := findBinary(ctx, a.ID(), a.Consoles(), names, nil)
	if !ok {
		return Installation{}, false
	}

	return Installation{
		AdapterID:  a.ID(),
		Name:       a.Name(),
		BinaryPath: path,
		Version:    version,
		Managed:    managed,
	}, true
}

func (a retroArchAdapter) BuildCommand(install Installation, req Request) (Command, error) {
	if err := validateRequest(a, req); err != nil {
		return Command{}, err
	}
	if install.BinaryPath == "" {
		return Command{}, fmt.Errorf("caminho do executável do RetroArch não informado")
	}

	coreName, err := a.resolveCoreName(req)
	if err != nil {
		return Command{}, err
	}

	corePath, found := locateCore(install.BinaryPath, coreName)
	if !found {
		// Sem o core não há como montar um comando que funcione. Falhar aqui,
		// com o nome do core que falta, é melhor que abrir o RetroArch no menu e
		// deixar o usuário adivinhar o que deu errado.
		return Command{}, fmt.Errorf(
			"o core %q do RetroArch não foi encontrado; instale-o pelo próprio RetroArch em Online Updater",
			coreName)
	}

	argv := []string{install.BinaryPath, "-L", corePath}

	var unapplied []string
	if req.Options.Fullscreen {
		argv = append(argv, "-f")
	}
	if req.Options.InternalScale > 1 {
		unapplied = append(unapplied,
			"A resolução interna depende do core e precisa ser ajustada nas opções do core, dentro do RetroArch.")
	}
	if req.Options.Renderer != RendererDefault {
		unapplied = append(unapplied,
			"O driver de vídeo precisa ser escolhido nas configurações do RetroArch.")
	}
	if req.Options.ExitOnClose {
		unapplied = append(unapplied,
			"O RetroArch volta ao próprio menu ao fechar o jogo; não há opção de linha de comando para encerrá-lo junto.")
	}

	// Os argumentos extras entram antes do caminho do jogo: depois dele, o
	// RetroArch os trataria como conteúdo adicional em vez de opções.
	argv = append(argv, req.Options.Extra...)
	argv = append(argv, req.ROMPath)

	return Command{Argv: argv, Unapplied: unapplied}, nil
}

// resolveCoreName decide qual core usar: o pedido explicitamente, ou o padrão
// do console.
func (retroArchAdapter) resolveCoreName(req Request) (string, error) {
	if req.Core != "" {
		name := strings.ToLower(strings.TrimSpace(req.Core))
		if _, ok := retroArchCores[name]; !ok {
			return "", fmt.Errorf("core %q do RetroArch é desconhecido pelo ZeuX", req.Core)
		}
		return name, nil
	}

	name, ok := defaultCoreByConsole[req.ConsoleID]
	if !ok {
		return "", fmt.Errorf("nenhum core padrão do RetroArch definido para o console %q", req.ConsoleID)
	}
	return name, nil
}

// coreExtension é o sufixo da biblioteca de core em cada sistema.
func coreExtension() string {
	switch runtime.GOOS {
	case "windows":
		return ".dll"
	case "darwin":
		return ".dylib"
	default:
		return ".so"
	}
}

// locateCore procura o arquivo do core nos diretórios onde o RetroArch os
// mantém, que variam conforme a forma de instalação.
//
// Na primeira chamada, tenta copiar cores bundled do instalador para
// ~/.local/share/zeux/retroarch/cores (Linux) ou equivalentes (ADR 0012).
func locateCore(binaryPath, coreName string) (string, bool) {
	// Garantir que cores bundled foram copiados (uma vez por daemon)
	bundledCoresInitOnce.Do(func() {
		if err := ensureBundledCoresAvailable(); err != nil {
			// Aviso mas não bloqueia — cores podem vir do Online Updater
			fmt.Fprintf(os.Stderr, "aviso ao copiar cores bundled: %v\n", err)
		}
	})

	file, ok := retroArchCores[coreName]
	if !ok {
		return "", false
	}
	file += coreExtension()

	for _, dir := range coreDirs(binaryPath) {
		candidate := filepath.Join(dir, file)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, true
		}
	}

	return "", false
}

// coreDirs lista os diretórios de cores. A busca começa pelos cores bundled
// (empacotados com o ZeuX via ADR 0012), depois os do usuário e do sistema.
//
// No Windows os cores do usuário ficam ao lado do executável; no Linux e
// macOS ficam no diretório de configuração do usuário ou caminhos do sistema.
func coreDirs(binaryPath string) []string {
	dirs := bundledCoreDirs()
	dirs = append(dirs, filepath.Join(filepath.Dir(binaryPath), "cores"))

	if home, err := os.UserHomeDir(); err == nil {
		switch runtime.GOOS {
		case "windows":
			// Nada além do diretório do executável.
		case "darwin":
			dirs = append(dirs,
				filepath.Join(home, "Library", "Application Support", "RetroArch", "cores"))
		default:
			dirs = append(dirs,
				filepath.Join(home, ".config", "retroarch", "cores"),
				filepath.Join(home, ".var", "app", "org.libretro.RetroArch", "config", "retroarch", "cores"),
				"/usr/lib/libretro",
				"/usr/lib/x86_64-linux-gnu/libretro",
				"/usr/local/lib/libretro",
			)
		}
	}

	return dirs
}

// bundledCoreDirs retorna o diretório onde os cores empacotados com o ZeuX
// (via ADR 0012) são mantidos. Isto permite que o instalador do Tauri ou um
// script de setup prepopule cores sem depender de download em tempo de execução.
//
// Retorna lista (pode estar vazia se o diretório não existir) porque a busca
// em coreDirs continua pelos outros diretórios.
func bundledCoreDirs() []string {
	if home, err := os.UserHomeDir(); err == nil {
		switch runtime.GOOS {
		case "windows":
			// %APPDATA%\ZeuX\RetroArch\cores
			appData := os.Getenv("APPDATA")
			if appData != "" {
				return []string{filepath.Join(appData, "ZeuX", "RetroArch", "cores")}
			}
		case "darwin":
			// ~/Library/Application Support/ZeuX/RetroArch/cores
			return []string{filepath.Join(home, "Library", "Application Support", "ZeuX", "RetroArch", "cores")}
		default:
			// ~/.local/share/zeux/retroarch/cores
			return []string{filepath.Join(home, ".local", "share", "zeux", "retroarch", "cores")}
		}
	}
	return []string{}
}

// CoreStatus é o estado de um core do RetroArch conhecido pelo ZeuX: se está
// instalado (achado em algum dos diretórios de coreDirs) e, se sim, onde.
type CoreStatus struct {
	Name      string `json:"name"`
	Filename  string `json:"filename"`
	Installed bool   `json:"installed"`
	Path      string `json:"path,omitempty"`
}

// RetroArchCoreStatus lista todo core que o ZeuX sabe usar (retroArchCores),
// em ordem alfabética, com o estado de instalação de cada um. Existe para que
// a interface consiga mostrar "quais dos cores empacotados/baixados
// realmente estão no lugar certo" — sem isto, a única forma de descobrir que
// um core está faltando era tentar lançar um jogo e receber o erro
// (achado 2026-08-04: um core inteiro podia estar ausente por um bug de
// caminho, e nada na tela avisava até o lançamento falhar).
func RetroArchCoreStatus(ctx context.Context) []CoreStatus {
	// Mesmo gatilho de locateCore: garante que cores bundled foram copiados
	// antes de reportar o que está instalado, senão a primeira consulta a
	// esta rota mostraria tudo como ausente até o primeiro lançamento.
	bundledCoresInitOnce.Do(func() {
		if err := ensureBundledCoresAvailable(); err != nil {
			fmt.Fprintf(os.Stderr, "aviso ao copiar cores bundled: %v\n", err)
		}
	})

	binaryPath := ""
	if install, ok := (retroArchAdapter{}).Locate(ctx); ok {
		binaryPath = install.BinaryPath
	}

	names := make([]string, 0, len(retroArchCores))
	for name := range retroArchCores {
		names = append(names, name)
	}
	sort.Strings(names)

	dirs := coreDirs(binaryPath)
	statuses := make([]CoreStatus, 0, len(names))
	for _, name := range names {
		file := retroArchCores[name] + coreExtension()
		status := CoreStatus{Name: name, Filename: file}

		for _, dir := range dirs {
			candidate := filepath.Join(dir, file)
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				status.Installed = true
				status.Path = candidate
				break
			}
		}

		statuses = append(statuses, status)
	}

	return statuses
}
