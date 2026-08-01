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

// spDisplays espelha o recorte que nos interessa da saída do system_profiler.
type spDisplays struct {
	Displays []struct {
		Model     string `json:"sppci_model"`
		VRAM      string `json:"spdisplays_vram"`
		VRAMShare string `json:"spdisplays_vram_shared"`
		Vendor    string `json:"spdisplays_vendor"`
		Bus       string `json:"sppci_bus"`
	} `json:"SPDisplaysDataType"`
}

// vramPattern captura o número e a unidade de textos como "8 GB" ou "1536 MB",
// formato em que o system_profiler reporta a memória de vídeo.
var vramPattern = regexp.MustCompile(`(?i)(\d+)\s*(gb|mb)`)

// detectGPUs lista as placas de vídeo no macOS via system_profiler, que já vem
// no sistema e não exige instalação adicional.
func detectGPUs(ctx context.Context) ([]GPUInfo, []string) {
	cmd := exec.CommandContext(ctx, "system_profiler", "SPDisplaysDataType", "-json")

	output, err := cmd.Output()
	if err != nil {
		return nil, []string{"Não foi possível consultar a placa de vídeo pelo system_profiler."}
	}

	var parsed spDisplays
	if err := json.Unmarshal(output, &parsed); err != nil {
		return nil, []string{"A resposta do macOS sobre a placa de vídeo não pôde ser interpretada."}
	}

	var (
		gpus     []GPUInfo
		warnings []string
	)

	for _, display := range parsed.Displays {
		model := strings.TrimSpace(display.Model)
		if model == "" {
			continue
		}

		vendor, integrated := classifyGPUVendor(model)

		// Apple Silicon usa memória unificada: o campo dedicado vem vazio e o
		// compartilhado é preenchido. Tratamos essas GPUs como integradas.
		vramText := display.VRAM
		if vramText == "" {
			vramText = display.VRAMShare
			if vramText != "" {
				integrated = true
			}
		}
		if strings.Contains(strings.ToLower(display.Bus), "builtin") {
			integrated = true
		}

		gpus = append(gpus, GPUInfo{
			Model:      model,
			Vendor:     vendor,
			VRAMBytes:  parseVRAMText(vramText),
			Integrated: integrated,
			Source:     "system_profiler",
		})
	}

	if len(gpus) == 0 {
		warnings = append(warnings, "O macOS não reportou nenhuma placa de vídeo.")
	}

	return gpus, warnings
}

// parseVRAMText converte "8 GB" ou "1536 MB" em bytes. Devolve 0 quando o texto
// não segue nenhum formato reconhecido.
func parseVRAMText(text string) uint64 {
	match := vramPattern.FindStringSubmatch(text)
	if match == nil {
		return 0
	}

	value, err := strconv.ParseUint(match[1], 10, 64)
	if err != nil {
		return 0
	}

	if strings.EqualFold(match[2], "gb") {
		return value * 1024 * 1024 * 1024
	}
	return value * 1024 * 1024
}
