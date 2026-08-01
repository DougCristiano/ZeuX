package verdict

import (
	"strings"
	"testing"

	"github.com/doufl/zeux/internal/hardware"
)

// Os testes usam hardware sintético de propósito: o parecer precisa ser estável
// e verificável independente da máquina em que a suíte roda.

func modestPC() hardware.HardwareInfo {
	return hardware.HardwareInfo{
		OS:  hardware.OSInfo{Platform: "windows", Arch: "amd64"},
		CPU: hardware.CPUInfo{Model: "Intel Core i3-8100", PhysicalCore: 4, LogicalCore: 4, BaseClockMHz: 1800},
		GPUs: []hardware.GPUInfo{
			{Model: "Intel UHD Graphics 630", Vendor: "Intel", Integrated: true, Source: "wmi"},
		},
		Memory: hardware.MemoryInfo{TotalBytes: 4 << 30, AvailableBytes: 2 << 30},
	}
}

func midRangePC() hardware.HardwareInfo {
	return hardware.HardwareInfo{
		OS:  hardware.OSInfo{Platform: "windows", Arch: "amd64"},
		CPU: hardware.CPUInfo{Model: "AMD Ryzen 5 5600", PhysicalCore: 6, LogicalCore: 12, BaseClockMHz: 3500},
		GPUs: []hardware.GPUInfo{
			{Model: "NVIDIA GeForce RTX 3060", Vendor: "NVIDIA", VRAMBytes: 12 << 30, Source: "wmi"},
		},
		Memory: hardware.MemoryInfo{TotalBytes: 16 << 30, AvailableBytes: 9 << 30},
	}
}

func highEndPC() hardware.HardwareInfo {
	return hardware.HardwareInfo{
		OS:  hardware.OSInfo{Platform: "windows", Arch: "amd64"},
		CPU: hardware.CPUInfo{Model: "AMD Ryzen 9 7950X", PhysicalCore: 16, LogicalCore: 32, BaseClockMHz: 4500},
		GPUs: []hardware.GPUInfo{
			{Model: "NVIDIA GeForce RTX 4090", Vendor: "NVIDIA", VRAMBytes: 24 << 30, Source: "wmi"},
		},
		Memory: hardware.MemoryInfo{TotalBytes: 64 << 30, AvailableBytes: 40 << 30},
	}
}

// strongCPUWeakGPU é o caso que motivou o desenho do motor: uma máquina cuja
// CPU sozinha sugeriria um veredito excelente, mas cujos gráficos integrados
// contam outra história. Uma nota única esconderia isso.
func strongCPUWeakGPU() hardware.HardwareInfo {
	return hardware.HardwareInfo{
		OS:  hardware.OSInfo{Platform: "windows", Arch: "amd64"},
		CPU: hardware.CPUInfo{Model: "AMD Ryzen 9 7940HS", PhysicalCore: 8, LogicalCore: 16, BaseClockMHz: 4000},
		GPUs: []hardware.GPUInfo{
			{Model: "AMD Radeon 780M Graphics", Vendor: "AMD", Integrated: true, Source: "wmi"},
		},
		Memory: hardware.MemoryInfo{TotalBytes: 32 << 30, AvailableBytes: 20 << 30},
	}
}

func findVerdict(t *testing.T, report Report, consoleID string) ConsoleVerdict {
	t.Helper()

	for _, v := range report.Verdicts {
		if v.ConsoleID == consoleID {
			return v
		}
	}

	t.Fatalf("console %q ausente do relatório", consoleID)
	return ConsoleVerdict{}
}

func evaluate(t *testing.T, info hardware.HardwareInfo) Report {
	t.Helper()

	catalog, err := LoadCatalog()
	if err != nil {
		t.Fatalf("carregando catálogo: %v", err)
	}
	return Evaluate(catalog, info)
}

func TestLoadCatalog(t *testing.T) {
	catalog, err := LoadCatalog()
	if err != nil {
		t.Fatalf("carregando catálogo: %v", err)
	}

	for _, console := range catalog.Consoles {
		if len(console.Tiers) == 0 {
			t.Errorf("console %q não define nenhum patamar", console.ID)
		}

		// Os patamares precisam estar do mais exigente para o menos exigente: a
		// avaliação para no primeiro atendido e devolveria o pior resultado
		// disponível se a ordem estivesse invertida.
		for i := 1; i < len(console.Tiers); i++ {
			previous, current := console.Tiers[i-1], console.Tiers[i]
			if levelRank(current.Level) <= levelRank(previous.Level) {
				t.Errorf("console %q: patamar %q vem depois de %q, fora de ordem",
					console.ID, current.Level, previous.Level)
			}
		}
	}
}

func TestModestPCReachesRetroButNotHeavyConsoles(t *testing.T) {
	report := evaluate(t, modestPC())

	if got := findVerdict(t, report, "nes").Level; got != LevelOtimo {
		t.Errorf("NES: nível = %q, esperado %q", got, LevelOtimo)
	}

	if got := findVerdict(t, report, "ps1").Level; got != LevelLimitado {
		t.Errorf("PS1: nível = %q, esperado %q", got, LevelLimitado)
	}

	for _, id := range []string{"ps2", "ps3", "wiiu"} {
		if got := findVerdict(t, report, id).Level; got != LevelImprovavel {
			t.Errorf("%s: nível = %q, esperado %q", id, got, LevelImprovavel)
		}
	}
}

func TestHighEndPCReachesTopTier(t *testing.T) {
	report := evaluate(t, highEndPC())

	for _, id := range []string{"ps1", "ps2", "gamecube", "ps3"} {
		result := findVerdict(t, report, id)
		if result.Level != LevelOtimo {
			t.Errorf("%s: nível = %q, esperado %q (gargalos: %v)", id, result.Level, LevelOtimo, result.Bottlenecks)
		}
		if len(result.Bottlenecks) != 0 {
			t.Errorf("%s: no melhor patamar não deveria haver gargalos, veio %v", id, result.Bottlenecks)
		}
	}
}

func TestMidRangePCGetsBottleneckExplanation(t *testing.T) {
	report := evaluate(t, midRangePC())
	result := findVerdict(t, report, "ps3")

	if result.Level == LevelOtimo {
		t.Fatalf("PS3 não deveria atingir o melhor patamar neste hardware")
	}

	// O valor do parecer está aqui: não basta dizer que não chegou ao topo, é
	// preciso dizer o que falta.
	if len(result.Bottlenecks) == 0 {
		t.Error("PS3: esperava gargalos explicando o que impede o patamar acima")
	}
	if result.NextLevel == "" {
		t.Error("PS3: esperava a indicação de qual patamar está bloqueado")
	}
}

func TestStrongCPUWeakGPUNamesTheGPUAsBottleneck(t *testing.T) {
	report := evaluate(t, strongCPUWeakGPU())
	result := findVerdict(t, report, "ps2")

	if result.Level == LevelOtimo {
		t.Fatal("PS2: gráficos integrados não deveriam alcançar o melhor patamar")
	}

	// O gargalo tem de apontar a GPU. Se apontasse a CPU, o usuário trocaria a
	// peça errada.
	var mentionsGPU bool
	for _, bottleneck := range result.Bottlenecks {
		lower := strings.ToLower(bottleneck)
		if strings.Contains(lower, "dedicada") || strings.Contains(lower, "vídeo") {
			mentionsGPU = true
		}
		if strings.Contains(lower, "threads de processador") {
			t.Errorf("PS2: CPU apontada como gargalo indevidamente: %q", bottleneck)
		}
	}

	if !mentionsGPU {
		t.Errorf("PS2: esperava a GPU nomeada como gargalo, veio %v", result.Bottlenecks)
	}
}

// Uma GPU dedicada que não reporta VRAM não pode ser tratada como reprovada nem
// como aprovada: o parecer segue, mas assumidamente parcial.
func TestUnknownVRAMMarksVerdictAsPartial(t *testing.T) {
	info := highEndPC()
	info.GPUs = []hardware.GPUInfo{
		{Model: "NVIDIA GeForce RTX 4090", Vendor: "NVIDIA", VRAMBytes: 0, Source: "wmi"},
	}

	result := findVerdict(t, evaluate(t, info), "ps3")

	if result.Precision != PrecisionParcial {
		t.Errorf("precisão = %q, esperado %q quando a VRAM é desconhecida", result.Precision, PrecisionParcial)
	}
	if result.Level == LevelImprovavel {
		t.Error("VRAM desconhecida não deveria reprovar o console")
	}
}

func TestMissingGPUKeepsReportUsable(t *testing.T) {
	info := midRangePC()
	info.GPUs = nil

	report := evaluate(t, info)

	if report.Precision != PrecisionParcial {
		t.Errorf("precisão do relatório = %q, esperado %q sem GPU", report.Precision, PrecisionParcial)
	}
	if got := findVerdict(t, report, "nes").Level; got != LevelOtimo {
		t.Errorf("NES: nível = %q, esperado %q mesmo sem GPU identificada", got, LevelOtimo)
	}
}

// O resumo é o texto que o usuário lê no modal, então precisa citar os números
// reais e não pode julgar o hardware.
func TestSummaryDescribesWithoutJudging(t *testing.T) {
	summary := Summarize(midRangePC())

	for _, expected := range []string{"Ryzen 5 5600", "6 núcleos", "12 threads", "3.50 GHz"} {
		if !strings.Contains(summary.CPU, expected) {
			t.Errorf("resumo da CPU não menciona %q: %s", expected, summary.CPU)
		}
	}

	if !strings.Contains(summary.GPU, "RTX 3060") {
		t.Errorf("resumo da GPU não menciona o modelo: %s", summary.GPU)
	}

	judgmental := []string{"fraco", "ruim", "excelente", "potente", "insuficiente"}
	for _, field := range []string{summary.CPU, summary.GPU, summary.Memory} {
		lower := strings.ToLower(field)
		for _, word := range judgmental {
			if strings.Contains(lower, word) {
				t.Errorf("resumo emite juízo de valor com %q: %s", word, field)
			}
		}
	}
}

func TestIntegratedGPUSummaryExplainsSharedMemory(t *testing.T) {
	summary := Summarize(strongCPUWeakGPU())

	if !strings.Contains(summary.GPU, "integrados") {
		t.Errorf("resumo deveria identificar os gráficos como integrados: %s", summary.GPU)
	}
	if !strings.Contains(summary.GPU, "compartilham memória") {
		t.Errorf("resumo deveria explicar a memória compartilhada: %s", summary.GPU)
	}
}
