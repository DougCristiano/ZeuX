// Package hardware detecta as características da máquina do usuário.
//
// A detecção é deliberadamente tolerante a falhas: quando uma informação não
// pode ser obtida (ferramenta do sistema ausente, driver que não reporta VRAM,
// etc.) o campo correspondente fica zerado e a origem do dado é registrada em
// Source, em vez de a detecção inteira falhar. Quem consome esses dados precisa
// saber o quanto pode confiar neles — o produto promete sinceridade sobre o
// hardware, e isso inclui admitir o que não foi possível descobrir.
package hardware

import "time"

// HardwareInfo é o retrato completo da máquina num dado momento.
type HardwareInfo struct {
	ScannedAt time.Time  `json:"scanned_at"`
	OS        OSInfo     `json:"os"`
	CPU       CPUInfo    `json:"cpu"`
	GPUs      []GPUInfo  `json:"gpus"`
	Memory    MemoryInfo `json:"memory"`

	// Warnings descreve, em linguagem de usuário, o que não pôde ser detectado.
	// Alimenta diretamente o aviso de "veredito menos preciso" na interface.
	Warnings []string `json:"warnings"`
}

// OSInfo identifica o sistema operacional.
type OSInfo struct {
	Platform string `json:"platform"` // "windows", "linux", "darwin"
	Version  string `json:"version"`
	Arch     string `json:"arch"`
}

// CPUInfo descreve o processador.
type CPUInfo struct {
	Model        string  `json:"model"`
	Vendor       string  `json:"vendor"`
	PhysicalCore int     `json:"physical_cores"`
	LogicalCore  int     `json:"logical_cores"` // threads
	BaseClockMHz float64 `json:"base_clock_mhz"`
}

// GPUInfo descreve uma placa de vídeo. VRAMBytes é 0 quando o sistema não
// reportou o valor — o que é comum em GPUs integradas, onde a memória é
// compartilhada com a RAM e não existe um número fixo a informar.
type GPUInfo struct {
	Model      string `json:"model"`
	Vendor     string `json:"vendor"`
	VRAMBytes  uint64 `json:"vram_bytes"`
	Integrated bool   `json:"integrated"`
	DriverVer  string `json:"driver_version,omitempty"`

	// Source registra como o dado foi obtido ("wmi", "nvidia-smi", "lspci",
	// "system_profiler"), para que a confiabilidade possa ser ponderada.
	Source string `json:"source"`
}

// MemoryInfo descreve a memória RAM instalada.
type MemoryInfo struct {
	TotalBytes     uint64 `json:"total_bytes"`
	AvailableBytes uint64 `json:"available_bytes"`
}

// PrimaryGPU devolve a GPU mais relevante para decidir o que a máquina roda:
// a dedicada com mais VRAM, se houver alguma, caso contrário a primeira
// integrada. Máquinas com gráficos híbridos (integrada + dedicada) listam as
// duas, e emular no chip integrado daria um veredito injustamente pessimista.
func (h HardwareInfo) PrimaryGPU() (GPUInfo, bool) {
	var best GPUInfo
	var found bool

	for _, gpu := range h.GPUs {
		switch {
		case !found:
			best, found = gpu, true
		case best.Integrated && !gpu.Integrated:
			// Dedicada sempre vence integrada, independente da VRAM reportada.
			best = gpu
		case best.Integrated == gpu.Integrated && gpu.VRAMBytes > best.VRAMBytes:
			best = gpu
		}
	}

	return best, found
}

// HasDedicatedGPU informa se existe ao menos uma GPU dedicada na máquina.
func (h HardwareInfo) HasDedicatedGPU() bool {
	for _, gpu := range h.GPUs {
		if !gpu.Integrated {
			return true
		}
	}
	return false
}

// TotalRAMGiB devolve a RAM total em GiB, unidade em que o usuário pensa.
func (h HardwareInfo) TotalRAMGiB() float64 {
	return float64(h.Memory.TotalBytes) / (1024 * 1024 * 1024)
}

// VRAMGiB devolve a VRAM da GPU em GiB.
func (g GPUInfo) VRAMGiB() float64 {
	return float64(g.VRAMBytes) / (1024 * 1024 * 1024)
}
