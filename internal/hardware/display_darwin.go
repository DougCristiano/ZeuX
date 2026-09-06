//go:build darwin

package hardware

import (
	"context"
	"encoding/json"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
)

// spDisplayModes espelha o recorte de monitores da saída do system_profiler.
// É o **mesmo comando** que detectGPUs já roda (gpu_darwin.go): a chave
// SPDisplaysDataType traz a placa de vídeo e, dentro dela, os monitores
// ligados nela em `spdisplays_ndrvs`.
type spDisplayModes struct {
	Cards []struct {
		Monitors []struct {
			Name string `json:"_name"`
			// O system_profiler mudou o nome desta chave entre versões do
			// macOS; as duas são lidas e a primeira preenchida vence, para não
			// depender de qual versão o usuário tem.
			Resolution  string `json:"_spdisplays_resolution"`
			Resolution2 string `json:"spdisplays_resolution"`
			Main        string `json:"spdisplays_main"`
		} `json:"spdisplays_ndrvs"`
	} `json:"SPDisplaysDataType"`
}

// resolutionPattern captura largura, altura e (quando presente) a taxa de
// textos como "3840 x 2160 @ 60.00Hz" ou "2560 x 1600".
var resolutionPattern = regexp.MustCompile(`(\d+)\s*x\s*(\d+)(?:\s*@\s*([\d.]+)\s*Hz)?`)

// detectDisplays lista os monitores no macOS via system_profiler, que já vem no
// sistema — mesma ferramenta e mesma justificativa de detectGPUs.
//
// O comando é executado de novo em vez de a saída ser compartilhada com
// detectGPUs: são ~200 ms num scan que roda uma vez por sessão, e acoplar as
// duas detecções obrigaria uma a saber do formato interno da outra. Se algum
// dia o custo importar, o lugar de resolver é um cache no probe, não um
// parâmetro atravessando as duas funções.
func detectDisplays(ctx context.Context) ([]DisplayInfo, []string) {
	output, err := exec.CommandContext(ctx, "system_profiler", "SPDisplaysDataType", "-json").Output()
	if err != nil {
		return nil, []string{"Não foi possível consultar o monitor pelo system_profiler."}
	}

	var parsed spDisplayModes
	if err := json.Unmarshal(output, &parsed); err != nil {
		return nil, []string{"A resposta do macOS sobre o monitor não pôde ser interpretada."}
	}

	var displays []DisplayInfo
	for _, card := range parsed.Cards {
		for _, monitor := range card.Monitors {
			resolution := monitor.Resolution
			if resolution == "" {
				resolution = monitor.Resolution2
			}

			match := resolutionPattern.FindStringSubmatch(resolution)
			if match == nil {
				continue
			}

			width, _ := strconv.Atoi(match[1])
			height, _ := strconv.Atoi(match[2])
			if width <= 0 || height <= 0 {
				continue
			}

			display := DisplayInfo{
				Name:   strings.TrimSpace(monitor.Name),
				Width:  width,
				Height: height,
				// spdisplays_main vem como "spdisplays_yes" no monitor
				// principal, e ausente nos demais.
				Primary: strings.Contains(monitor.Main, "yes"),
				Source:  "system_profiler",
			}
			if match[3] != "" {
				if hz, err := strconv.ParseFloat(match[3], 64); err == nil {
					display.RefreshHz = int(hz + 0.5)
				}
			}

			displays = append(displays, display)
		}
	}

	if len(displays) == 0 {
		return nil, []string{"Não foi possível identificar o monitor conectado."}
	}
	return displays, nil
}
