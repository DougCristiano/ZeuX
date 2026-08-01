//go:build windows

package hardware

import (
	"context"
	"encoding/json"
	"os/exec"
	"strings"
)

// gpuScript consulta as placas de vídeo pelo WMI e complementa a VRAM lendo o
// registro do Windows.
//
// A leitura do registro não é preciosismo: Win32_VideoController.AdapterRAM é
// um uint32, então satura em 4 GiB e reportaria uma RTX 4090 de 24 GiB como
// tendo 4 GiB. O valor correto vive em HardwareInformation.qwMemorySize, na
// chave da classe de display. Usamos o registro como fonte primária e caímos
// para AdapterRAM apenas quando ele não existe.
const gpuScript = `
$ErrorActionPreference = 'SilentlyContinue'
$classKey = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
$regEntries = Get-ChildItem $classKey | ForEach-Object {
    $props = Get-ItemProperty $_.PSPath
    if ($props.DriverDesc) {
        [PSCustomObject]@{
            Desc = $props.DriverDesc
            QwMem = $props.'HardwareInformation.qwMemorySize'
        }
    }
}
$result = Get-CimInstance Win32_VideoController | ForEach-Object {
    $name = $_.Name
    $vram = 0
    $match = $regEntries | Where-Object { $_.Desc -eq $name } | Select-Object -First 1
    if ($match -and $match.QwMem) {
        $vram = [uint64]$match.QwMem
    } elseif ($_.AdapterRAM -and $_.AdapterRAM -gt 0) {
        $vram = [uint64]$_.AdapterRAM
    }
    [PSCustomObject]@{
        name = $name
        vram = $vram
        driver = $_.DriverVersion
    }
}
ConvertTo-Json -InputObject @($result) -Compress
`

type winGPU struct {
	Name   string `json:"name"`
	VRAM   uint64 `json:"vram"`
	Driver string `json:"driver"`
}

// detectGPUs lista as placas de vídeo no Windows via PowerShell. Optamos por
// invocar o PowerShell em vez de falar WMI diretamente para manter o binário
// livre de CGO e de dependências COM.
func detectGPUs(ctx context.Context) ([]GPUInfo, []string) {
	cmd := exec.CommandContext(ctx, "powershell.exe",
		"-NoProfile", "-NonInteractive", "-Command", gpuScript)

	output, err := cmd.Output()
	if err != nil {
		return nil, []string{"Não foi possível consultar a placa de vídeo pelo Windows (PowerShell indisponível ou bloqueado)."}
	}

	raw := strings.TrimSpace(string(output))
	if raw == "" || raw == "null" {
		return nil, []string{"O Windows não reportou nenhuma placa de vídeo."}
	}

	// O ConvertTo-Json do Windows PowerShell 5.1 colapsa arrays de um único
	// elemento em objeto, mesmo com o array explícito. Aceitamos as duas formas.
	var entries []winGPU
	if err := json.Unmarshal([]byte(raw), &entries); err != nil {
		var single winGPU
		if err := json.Unmarshal([]byte(raw), &single); err != nil {
			return nil, []string{"A resposta do Windows sobre a placa de vídeo não pôde ser interpretada."}
		}
		entries = []winGPU{single}
	}

	var (
		gpus     []GPUInfo
		warnings []string
	)

	for _, entry := range entries {
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			continue
		}

		vendor, integrated := classifyGPUVendor(name)
		gpus = append(gpus, GPUInfo{
			Model:      name,
			Vendor:     vendor,
			VRAMBytes:  entry.VRAM,
			Integrated: integrated,
			DriverVer:  strings.TrimSpace(entry.Driver),
			Source:     "wmi+registry",
		})

		// GPU dedicada sem VRAM conhecida compromete o veredito; integrada não,
		// porque ali a memória é compartilhada com a RAM e a ausência do número
		// é esperada.
		if entry.VRAM == 0 && !integrated {
			warnings = append(warnings,
				"A quantidade de memória da placa "+name+" não foi reportada pelo sistema. O veredito para consoles mais exigentes fica menos preciso.")
		}
	}

	return gpus, warnings
}
