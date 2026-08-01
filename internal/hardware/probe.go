package hardware

import (
	"context"
	"fmt"
	"runtime"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
)

// Probe executa a detecção de hardware da máquina local.
type Probe interface {
	Detect(ctx context.Context) (HardwareInfo, error)
}

// systemProbe é a implementação real, que consulta o sistema operacional.
type systemProbe struct{}

// NewProbe devolve o Probe padrão do sistema.
func NewProbe() Probe { return systemProbe{} }

// Detect monta o retrato do hardware. CPU e memória vêm do gopsutil, que já é
// multiplataforma; a GPU depende de ferramentas específicas de cada sistema e
// é resolvida por detectGPUs, implementada por arquivo de plataforma.
//
// Falha ao ler CPU ou memória é erro fatal — sem esses dados não há veredito
// possível. Falha ao ler GPU não é: vira um aviso, porque um veredito baseado
// só em CPU e RAM ainda é melhor que nenhum, desde que o usuário saiba disso.
func (systemProbe) Detect(ctx context.Context) (HardwareInfo, error) {
	info := HardwareInfo{
		ScannedAt: time.Now().UTC(),
		OS: OSInfo{
			Platform: runtime.GOOS,
			Arch:     runtime.GOARCH,
		},
		Warnings: []string{},
	}

	if version, err := host.KernelVersionWithContext(ctx); err == nil {
		info.OS.Version = version
	}

	cpuInfo, err := detectCPU(ctx)
	if err != nil {
		return HardwareInfo{}, fmt.Errorf("detectando CPU: %w", err)
	}
	info.CPU = cpuInfo

	memInfo, err := mem.VirtualMemoryWithContext(ctx)
	if err != nil {
		return HardwareInfo{}, fmt.Errorf("detectando memória: %w", err)
	}
	info.Memory = MemoryInfo{
		TotalBytes:     memInfo.Total,
		AvailableBytes: memInfo.Available,
	}

	gpus, warnings := detectGPUs(ctx)
	info.GPUs = gpus
	info.Warnings = append(info.Warnings, warnings...)

	if len(gpus) == 0 {
		info.Warnings = append(info.Warnings,
			"Não foi possível identificar a placa de vídeo. O veredito abaixo considera apenas processador e memória, e por isso é menos preciso.")
	}

	return info, nil
}

// detectCPU consolida as informações do processador. gopsutil devolve uma
// entrada por socket físico; máquinas de usuário final têm apenas uma, mas
// somamos os núcleos para não subestimar as raras que têm mais de um.
func detectCPU(ctx context.Context) (CPUInfo, error) {
	stats, err := cpu.InfoWithContext(ctx)
	if err != nil {
		return CPUInfo{}, err
	}
	if len(stats) == 0 {
		return CPUInfo{}, fmt.Errorf("nenhum processador reportado pelo sistema")
	}

	info := CPUInfo{
		Model:        strings.TrimSpace(stats[0].ModelName),
		Vendor:       strings.TrimSpace(stats[0].VendorID),
		BaseClockMHz: stats[0].Mhz,
	}

	// Em Linux, InfoWithContext devolve uma entrada por processador lógico, com
	// Cores repetido; em Windows/macOS devolve uma por socket. Somar às cegas
	// inflaria a contagem no Linux, então usamos a contagem dedicada do gopsutil
	// e só caímos para a soma se ela falhar.
	if physical, err := cpu.CountsWithContext(ctx, false); err == nil && physical > 0 {
		info.PhysicalCore = physical
	} else {
		for _, stat := range stats {
			info.PhysicalCore += int(stat.Cores)
		}
	}

	if logical, err := cpu.CountsWithContext(ctx, true); err == nil && logical > 0 {
		info.LogicalCore = logical
	} else {
		info.LogicalCore = runtime.NumCPU()
	}

	return info, nil
}

// trademarkNoise são marcas registradas que os fabricantes injetam no meio do
// nome do produto. O Windows reporta "AMD Radeon(TM) Graphics", e sem removê-las
// a busca por "radeon graphics" não casa — a GPU integrada acabaria classificada
// como dedicada.
var trademarkNoise = strings.NewReplacer(
	"(tm)", "", "(r)", "", "(c)", "",
	"™", "", "®", "", "©", "",
)

// normalizeGPUModel deixa o nome em caixa baixa, sem marcas registradas e com
// espaçamento simples, para que a comparação por palavra-chave seja confiável.
func normalizeGPUModel(model string) string {
	return strings.Join(strings.Fields(trademarkNoise.Replace(strings.ToLower(model))), " ")
}

// classifyGPUVendor normaliza o nome do fabricante e deduz se a GPU é
// integrada. A heurística é por palavra-chave no modelo, já que nem todo
// sistema expõe essa distinção de forma estruturada.
func classifyGPUVendor(model string) (vendor string, integrated bool) {
	lower := normalizeGPUModel(model)

	switch {
	case strings.Contains(lower, "nvidia"), strings.Contains(lower, "geforce"),
		strings.Contains(lower, "quadro"), strings.Contains(lower, "rtx"),
		strings.Contains(lower, "gtx"):
		vendor = "NVIDIA"
	case strings.Contains(lower, "amd"), strings.Contains(lower, "radeon"),
		strings.Contains(lower, "ati "):
		vendor = "AMD"
	case strings.Contains(lower, "intel"):
		vendor = "Intel"
	case strings.Contains(lower, "apple"):
		vendor = "Apple"
	default:
		vendor = "Desconhecido"
	}

	// Marcas de gráficos integrados. As séries Vega/680M/780M da AMD aparecem em
	// APUs Ryzen, e "graphics" sem sufixo costuma ser Intel integrado.
	integratedMarkers := []string{
		"uhd graphics", "hd graphics", "iris", "integrated",
		"radeon graphics", "vega", "680m", "780m", "760m", "apple m",
	}
	for _, marker := range integratedMarkers {
		if strings.Contains(lower, marker) {
			integrated = true
			break
		}
	}

	return vendor, integrated
}
