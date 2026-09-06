//go:build linux

package hardware

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// xrandrCurrent casa a linha de uma saída conectada e o modo em uso.
//
// O xrandr marca o modo ativo com um "*" logo depois da taxa:
//
//	DP-1 connected primary 2560x1440+0+0 ...
//	   2560x1440     59.95*+  74.97
//
// O "+" (modo preferido) pode ou não acompanhar o "*", e a taxa vem com casas
// decimais — daí o `\.\d+` obrigatório e o arredondamento na leitura.
var (
	xrandrConnected = regexp.MustCompile(`^(\S+) connected( primary)?`)
	xrandrMode      = regexp.MustCompile(`^\s+(\d+)x(\d+)\s+([\d.]+)\*`)
	drmMode         = regexp.MustCompile(`^(\d+)x(\d+)$`)
)

// detectDisplays lista os monitores no Linux.
//
// Duas fontes, nesta ordem, porque nenhuma sozinha cobre o caso comum:
//
//  1. `xrandr`, que é o único que reporta a **taxa de atualização** e qual
//     saída é a primária. Só existe sob X11 (ou XWayland) e nem sempre está
//     instalado.
//  2. `/sys/class/drm/*/modes`, que funciona sem servidor gráfico nenhum —
//     inclusive em Wayland puro, onde o xrandr não responde — mas só informa
//     resolução. Nesse caminho a taxa fica em 0, que é "não reportado", nunca
//     um valor inventado.
func detectDisplays(ctx context.Context) ([]DisplayInfo, []string) {
	if displays := detectDisplaysXrandr(ctx); len(displays) > 0 {
		return displays, nil
	}
	if displays := detectDisplaysDRM(); len(displays) > 0 {
		return displays, nil
	}
	return nil, []string{"Não foi possível identificar o monitor conectado."}
}

func detectDisplaysXrandr(ctx context.Context) []DisplayInfo {
	output, err := exec.CommandContext(ctx, "xrandr", "--query").Output()
	if err != nil {
		return nil
	}
	return parseXrandr(string(output))
}

// parseXrandr é separada da execução do comando para poder ser testada contra
// saídas reais de xrandr sem depender de um servidor X — o formato é o pedaço
// com mais chance de estar errado aqui.
func parseXrandr(output string) []DisplayInfo {
	var (
		displays []DisplayInfo
		pending  *DisplayInfo
	)

	// O xrandr descreve cada saída em duas partes: a linha do cabeçalho diz o
	// nome e se é primária, e as linhas indentadas seguintes trazem os modos —
	// o ativo entre eles. Por isso o cabeçalho fica "pendente" até o modo com
	// "*" aparecer; uma saída conectada mas sem modo ativo (desligada) é
	// descartada quando o próximo cabeçalho chega.
	for _, line := range strings.Split(output, "\n") {
		if header := xrandrConnected.FindStringSubmatch(line); header != nil {
			pending = &DisplayInfo{
				Name:    header[1],
				Primary: header[2] != "",
				Source:  "xrandr",
			}
			continue
		}

		if pending == nil {
			continue
		}

		mode := xrandrMode.FindStringSubmatch(line)
		if mode == nil {
			continue
		}

		width, _ := strconv.Atoi(mode[1])
		height, _ := strconv.Atoi(mode[2])
		if width <= 0 || height <= 0 {
			pending = nil
			continue
		}
		pending.Width, pending.Height = width, height
		if hz, err := strconv.ParseFloat(mode[3], 64); err == nil {
			pending.RefreshHz = int(hz + 0.5)
		}

		displays = append(displays, *pending)
		pending = nil
	}

	return displays
}

func detectDisplaysDRM() []DisplayInfo {
	return displaysFromDRM("/sys/class/drm")
}

// displaysFromDRM recebe a raiz do sysfs para que o teste possa montar uma
// árvore de mentira num diretório temporário — o formato do arquivo `modes` é
// simples, mas a extração do nome da saída a partir do caminho não é.
func displaysFromDRM(root string) []DisplayInfo {
	entries, err := filepath.Glob(filepath.Join(root, "card*-*", "modes"))
	if err != nil {
		return nil
	}
	// Glob não garante ordem estável entre execuções; sem ordenar, a "primeira"
	// tela mudaria de scan para scan.
	sort.Strings(entries)

	var displays []DisplayInfo
	for _, path := range entries {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		// A primeira linha é o modo ativo/preferido. Arquivo vazio significa
		// saída sem nada ligado.
		first, _, _ := strings.Cut(strings.TrimSpace(string(data)), "\n")
		mode := drmMode.FindStringSubmatch(strings.TrimSpace(first))
		if mode == nil {
			continue
		}

		width, _ := strconv.Atoi(mode[1])
		height, _ := strconv.Atoi(mode[2])
		if width <= 0 || height <= 0 {
			continue
		}

		displays = append(displays, DisplayInfo{
			// "card0-DP-1" → "DP-1": o prefixo da placa é detalhe do sysfs, e o
			// que o usuário reconhece é o nome da saída.
			Name:   nomeDaSaidaDRM(path),
			Width:  width,
			Height: height,
			// Sem taxa: o sysfs não a expõe aqui, e inventar 60 seria um
			// palpite disfarçado de leitura.
			Source: "drm",
		})
	}

	return displays
}

func nomeDaSaidaDRM(modesPath string) string {
	dir := filepath.Base(filepath.Dir(modesPath))
	if _, saida, ok := strings.Cut(dir, "-"); ok {
		return saida
	}
	return dir
}
