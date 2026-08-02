package emulator

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

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

	path, managed, ok := findBinary(ctx, a.ID(), a.Consoles(), names, nil)
	if !ok {
		return Installation{}, false
	}

	return Installation{
		AdapterID:  a.ID(),
		Name:       a.Name(),
		BinaryPath: path,
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
func locateCore(binaryPath, coreName string) (string, bool) {
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

// coreDirs lista os diretórios de cores. No Windows os cores ficam ao lado do
// executável; no Linux e no macOS costumam ficar no diretório de configuração
// do usuário ou em caminhos do sistema.
func coreDirs(binaryPath string) []string {
	dirs := []string{filepath.Join(filepath.Dir(binaryPath), "cores")}

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
