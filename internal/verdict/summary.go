package verdict

import (
	"fmt"
	"strings"

	"github.com/doufl/zeux/internal/hardware"
)

// HardwareSummary é a descrição do hardware em linguagem de usuário, exibida no
// modal de resultado do scan.
//
// Cada campo descreve um componente pelos números reais, sem adjetivos de valor.
// A regra combinada com o produto é clara: dizemos o que a peça é e até onde ela
// chega, nunca se ela é boa ou ruim. Quem decide se está satisfeito é o usuário.
type HardwareSummary struct {
	CPU    string `json:"cpu"`
	GPU    string `json:"gpu"`
	Memory string `json:"memory"`
	System string `json:"system"`
}

// Summarize monta a descrição textual do hardware detectado.
func Summarize(info hardware.HardwareInfo) HardwareSummary {
	return HardwareSummary{
		CPU:    describeCPU(info.CPU),
		GPU:    describeGPU(info),
		Memory: describeMemory(info),
		System: describeSystem(info.OS),
	}
}

// describeCPU descreve o processador pelos números que o usuário reconhece:
// modelo, núcleos, threads e clock.
func describeCPU(cpu hardware.CPUInfo) string {
	model := cpu.Model
	if model == "" {
		model = "Processador não identificado"
	}

	parts := []string{model}

	switch {
	case cpu.PhysicalCore > 0 && cpu.LogicalCore > cpu.PhysicalCore:
		parts = append(parts, fmt.Sprintf("%d núcleos físicos e %d threads", cpu.PhysicalCore, cpu.LogicalCore))
	case cpu.PhysicalCore > 0:
		parts = append(parts, fmt.Sprintf("%d núcleos físicos", cpu.PhysicalCore))
	case cpu.LogicalCore > 0:
		parts = append(parts, fmt.Sprintf("%d threads", cpu.LogicalCore))
	}

	if cpu.BaseClockMHz > 0 {
		parts = append(parts, fmt.Sprintf("clock base de %.2f GHz", cpu.BaseClockMHz/1000))
	}

	return strings.Join(parts, " — ") + "."
}

// describeGPU descreve a placa de vídeo principal, deixando explícito quando a
// máquina tem mais de uma e quando a memória de vídeo não foi reportada.
func describeGPU(info hardware.HardwareInfo) string {
	gpu, ok := info.PrimaryGPU()
	if !ok {
		return "Placa de vídeo não identificada. As sugestões abaixo consideram apenas processador e memória."
	}

	var builder strings.Builder
	builder.WriteString(gpu.Model)

	if gpu.Integrated {
		builder.WriteString(" — gráficos integrados, que compartilham memória com a RAM do sistema")
	} else if gpu.VRAMBytes > 0 {
		builder.WriteString(fmt.Sprintf(" — placa dedicada com %.1f GB de memória de vídeo", gpu.VRAMGiB()))
	} else {
		builder.WriteString(" — placa dedicada, com quantidade de memória de vídeo não reportada pelo sistema")
	}

	// Notebooks com gráficos híbridos listam duas GPUs. Dizer qual delas foi
	// usada no parecer evita a impressão de que o app ignorou a placa boa.
	if len(info.GPUs) > 1 {
		builder.WriteString(fmt.Sprintf(". Foram detectadas %d placas nesta máquina; o parecer usa esta como referência", len(info.GPUs)))
	}

	builder.WriteString(".")
	return builder.String()
}

// describeMemory descreve a RAM instalada e a disponível no momento do scan.
func describeMemory(info hardware.HardwareInfo) string {
	total := info.TotalRAMGiB()
	if total <= 0 {
		return "Quantidade de memória RAM não identificada."
	}

	available := float64(info.Memory.AvailableBytes) / (1024 * 1024 * 1024)
	return fmt.Sprintf(
		"%.1f GB de memória RAM instalada, com %.1f GB livres no momento da leitura.",
		total, available)
}

// describeSystem descreve o sistema operacional e a arquitetura.
func describeSystem(os hardware.OSInfo) string {
	name := map[string]string{
		"windows": "Windows",
		"linux":   "Linux",
		"darwin":  "macOS",
	}[os.Platform]

	if name == "" {
		name = os.Platform
	}

	if os.Version != "" {
		return fmt.Sprintf("%s %s (%s).", name, os.Version, os.Arch)
	}
	return fmt.Sprintf("%s (%s).", name, os.Arch)
}
