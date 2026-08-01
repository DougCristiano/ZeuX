package hardware

import "testing"

// A classificação de GPU é heurística por nome, então os casos reais que os
// sistemas reportam precisam estar travados por teste. Um erro aqui muda o
// parecer que o usuário recebe: tratar a integrada como dedicada faria o app
// prometer desempenho que a máquina não entrega.
func TestClassifyGPUVendor(t *testing.T) {
	cases := []struct {
		model          string
		wantVendor     string
		wantIntegrated bool
	}{
		// Como o Windows reporta a integrada das APUs Ryzen — o "(TM)" no meio do
		// nome já quebrou a detecção uma vez.
		{"AMD Radeon(TM) Graphics", "AMD", true},
		{"AMD Radeon(TM) 780M Graphics", "AMD", true},
		{"Intel(R) UHD Graphics 630", "Intel", true},
		{"Intel(R) Iris(R) Xe Graphics", "Intel", true},
		{"Apple M3 Pro", "Apple", true},

		{"NVIDIA GeForce RTX 3060 Ti", "NVIDIA", false},
		{"NVIDIA GeForce GTX 1650", "NVIDIA", false},
		{"AMD Radeon RX 7900 XTX", "AMD", false},
		{"NVIDIA Quadro P2000", "NVIDIA", false},

		{"Placa de vídeo genérica", "Desconhecido", false},
	}

	for _, tc := range cases {
		t.Run(tc.model, func(t *testing.T) {
			vendor, integrated := classifyGPUVendor(tc.model)

			if vendor != tc.wantVendor {
				t.Errorf("fabricante = %q, esperado %q", vendor, tc.wantVendor)
			}
			if integrated != tc.wantIntegrated {
				t.Errorf("integrada = %v, esperado %v", integrated, tc.wantIntegrated)
			}
		})
	}
}

func TestNormalizeGPUModel(t *testing.T) {
	cases := map[string]string{
		"AMD Radeon(TM) Graphics":  "amd radeon graphics",
		"Intel(R)  Iris(R) Xe":     "intel iris xe",
		"NVIDIA GeForce RTX 4090™": "nvidia geforce rtx 4090",
	}

	for input, want := range cases {
		if got := normalizeGPUModel(input); got != want {
			t.Errorf("normalizeGPUModel(%q) = %q, esperado %q", input, got, want)
		}
	}
}

// Máquinas híbridas expõem integrada e dedicada. Escolher a integrada como
// referência produziria um parecer injustamente pessimista.
func TestPrimaryGPUPrefersDedicated(t *testing.T) {
	info := HardwareInfo{
		GPUs: []GPUInfo{
			{Model: "AMD Radeon Graphics", Integrated: true, VRAMBytes: 512 << 20},
			{Model: "NVIDIA GeForce RTX 3060 Ti", Integrated: false, VRAMBytes: 8 << 30},
		},
	}

	gpu, ok := info.PrimaryGPU()
	if !ok {
		t.Fatal("esperava uma GPU principal")
	}
	if gpu.Model != "NVIDIA GeForce RTX 3060 Ti" {
		t.Errorf("GPU principal = %q, esperava a dedicada", gpu.Model)
	}
	if !info.HasDedicatedGPU() {
		t.Error("esperava HasDedicatedGPU verdadeiro")
	}
}

// A dedicada vence mesmo quando a integrada reporta mais VRAM, situação possível
// em APUs com memória compartilhada generosa.
func TestPrimaryGPUPrefersDedicatedEvenWithLessVRAM(t *testing.T) {
	info := HardwareInfo{
		GPUs: []GPUInfo{
			{Model: "AMD Radeon Graphics", Integrated: true, VRAMBytes: 16 << 30},
			{Model: "NVIDIA GeForce GTX 1650", Integrated: false, VRAMBytes: 4 << 30},
		},
	}

	gpu, _ := info.PrimaryGPU()
	if gpu.Model != "NVIDIA GeForce GTX 1650" {
		t.Errorf("GPU principal = %q, esperava a dedicada", gpu.Model)
	}
}

func TestPrimaryGPUEmpty(t *testing.T) {
	if _, ok := (HardwareInfo{}).PrimaryGPU(); ok {
		t.Error("esperava nenhuma GPU principal quando a lista está vazia")
	}
}
