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

	// Displays são os monitores conectados (Q3, docs/roadmap.md, Sprint Q).
	// Lista vazia é estado honesto: nem todo sistema expõe isso de forma
	// confiável (ver detectDisplays em cada display_<so>.go), e um palpite
	// aqui vira resolução interna errada no jogo.
	Displays []DisplayInfo `json:"displays"`

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

// DisplayInfo descreve um monitor conectado.
//
// Existe porque "otimizar para a sua tela" era impossível sem ele: o
// `internal_scale` do catálogo era uma constante escrita à mão, igual num
// 1080p e num 4K. Ver PrimaryDisplay e o uso em internal/verdict.
//
// RefreshHz é 0 quando o sistema não reportou — dado ausente, nunca um
// palpite (princípio 4 do CLAUDE.md). O mesmo vale para Width/Height: um
// monitor que não pôde ser medido não entra na lista.
type DisplayInfo struct {
	// Name é como o sistema identifica a saída ("DP-1", `\\.\DISPLAY1`).
	// Vazio quando não há um identificador legível — é rótulo, não chave.
	Name string `json:"name,omitempty"`

	Width  int `json:"width"`
	Height int `json:"height"`

	// RefreshHz é a taxa de atualização em Hz. 0 = não reportado.
	RefreshHz int `json:"refresh_hz,omitempty"`

	// Primary marca o monitor principal do sistema. Quando nenhum vem
	// marcado (comum no Linux fora do X), o primeiro da lista é usado.
	Primary bool `json:"primary,omitempty"`

	// Source registra como o dado foi obtido ("user32", "xrandr", "drm",
	// "system_profiler"), no mesmo espírito de GPUInfo.Source: a
	// confiabilidade varia entre eles e isso precisa ser auditável.
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

// PrimaryDisplay devolve o monitor que deve guiar a configuração do emulador:
// o marcado como principal, ou — quando nenhum vem marcado, o que é comum fora
// do Windows — o de maior área.
//
// "Maior área" e não "o primeiro" porque a ordem em que o sistema lista os
// monitores não significa nada: num notebook ligado a um monitor externo, quem
// manda na decisão de resolução interna é a tela em que a pessoa vai jogar, e
// a maior é o palpite menos ruim entre os disponíveis. Ainda é um palpite —
// por isso Primary é preenchido de verdade onde o sistema informa.
func (h HardwareInfo) PrimaryDisplay() (DisplayInfo, bool) {
	var best DisplayInfo
	var found bool

	for _, display := range h.Displays {
		if display.Width <= 0 || display.Height <= 0 {
			continue
		}
		if display.Primary {
			return display, true
		}
		if !found || display.Width*display.Height > best.Width*best.Height {
			best, found = display, true
		}
	}

	return best, found
}
