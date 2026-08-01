//go:build linux

package hardware

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// detectGPUs lista as placas de vídeo no Linux.
//
// Não existe uma fonte única que dê nome e VRAM ao mesmo tempo, então a
// detecção é montada em camadas: lspci enumera os dispositivos e dá os nomes,
// e a VRAM é buscada em nvidia-smi (NVIDIA) ou no sysfs do amdgpu (AMD). Cada
// camada é opcional — em uma máquina sem lspci instalado ainda conseguimos
// listar a GPU NVIDIA, e vice-versa.
func detectGPUs(ctx context.Context) ([]GPUInfo, []string) {
	var (
		gpus     []GPUInfo
		warnings []string
	)

	gpus = append(gpus, detectNvidiaLinux(ctx)...)

	// lspci cobre AMD, Intel e qualquer GPU sem ferramenta dedicada. Ignoramos
	// as NVIDIA aqui para não duplicar o que o nvidia-smi já reportou com VRAM.
	for _, gpu := range detectLspci(ctx) {
		if gpu.Vendor == "NVIDIA" && len(gpus) > 0 {
			continue
		}
		if gpu.Vendor == "AMD" && !gpu.Integrated {
			if vram, ok := amdVRAMFromSysfs(); ok {
				gpu.VRAMBytes = vram
				gpu.Source += "+sysfs"
			}
		}
		gpus = append(gpus, gpu)
	}

	if len(gpus) == 0 {
		warnings = append(warnings,
			"Não foi possível identificar a placa de vídeo. Instalar o pacote pciutils (comando lspci) melhora a precisão do veredito.")
		return gpus, warnings
	}

	for _, gpu := range gpus {
		if gpu.VRAMBytes == 0 && !gpu.Integrated {
			warnings = append(warnings,
				"A quantidade de memória da placa "+gpu.Model+" não pôde ser lida. O veredito para consoles mais exigentes fica menos preciso.")
		}
	}

	return gpus, warnings
}

// detectNvidiaLinux consulta o nvidia-smi, única fonte confiável de VRAM para
// placas NVIDIA. A saída vem em MiB.
func detectNvidiaLinux(ctx context.Context) []GPUInfo {
	cmd := exec.CommandContext(ctx, "nvidia-smi",
		"--query-gpu=name,memory.total", "--format=csv,noheader,nounits")

	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	var gpus []GPUInfo
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		parts := strings.SplitN(line, ",", 2)
		if len(parts) != 2 {
			continue
		}

		name := strings.TrimSpace(parts[0])
		if name == "" {
			continue
		}

		var vram uint64
		if mib, err := strconv.ParseUint(strings.TrimSpace(parts[1]), 10, 64); err == nil {
			vram = mib * 1024 * 1024
		}

		gpus = append(gpus, GPUInfo{
			Model:      name,
			Vendor:     "NVIDIA",
			VRAMBytes:  vram,
			Integrated: false,
			Source:     "nvidia-smi",
		})
	}

	return gpus
}

// detectLspci enumera controladores de vídeo pelo barramento PCI. Devolve nome
// e fabricante, mas nunca VRAM — o lspci não expõe essa informação.
func detectLspci(ctx context.Context) []GPUInfo {
	output, err := exec.CommandContext(ctx, "lspci", "-mm").Output()
	if err != nil {
		return nil
	}

	var gpus []GPUInfo
	for _, line := range strings.Split(string(output), "\n") {
		lower := strings.ToLower(line)
		if !strings.Contains(lower, "vga compatible controller") &&
			!strings.Contains(lower, "3d controller") &&
			!strings.Contains(lower, "display controller") {
			continue
		}

		// O formato -mm usa campos entre aspas: slot, classe, fabricante,
		// dispositivo. Fabricante e dispositivo juntos formam o nome legível.
		fields := parseLspciFields(line)
		if len(fields) < 4 {
			continue
		}

		name := strings.TrimSpace(fields[2] + " " + fields[3])
		vendor, integrated := classifyGPUVendor(name)
		gpus = append(gpus, GPUInfo{
			Model:      name,
			Vendor:     vendor,
			Integrated: integrated,
			Source:     "lspci",
		})
	}

	return gpus
}

// parseLspciFields extrai os campos entre aspas de uma linha do lspci -mm.
func parseLspciFields(line string) []string {
	var (
		fields  []string
		current strings.Builder
		inQuote bool
	)

	for _, r := range line {
		switch {
		case r == '"':
			if inQuote {
				fields = append(fields, current.String())
				current.Reset()
			}
			inQuote = !inQuote
		case inQuote:
			current.WriteRune(r)
		}
	}

	return fields
}

// amdVRAMFromSysfs lê a VRAM total exposta pelo driver amdgpu. Devolve o maior
// valor encontrado, já que máquinas com APU e placa dedicada expõem os dois e
// o maior corresponde à dedicada.
func amdVRAMFromSysfs() (uint64, bool) {
	matches, err := filepath.Glob("/sys/class/drm/card*/device/mem_info_vram_total")
	if err != nil {
		return 0, false
	}

	var best uint64
	for _, path := range matches {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		if bytes, err := strconv.ParseUint(strings.TrimSpace(string(data)), 10, 64); err == nil && bytes > best {
			best = bytes
		}
	}

	return best, best > 0
}
