//go:build windows

package hardware

import (
	"context"
	"syscall"
	"unsafe"
)

// detectDisplays lista os monitores no Windows chamando o user32 direto por
// syscall.
//
// Sem processo externo e sem cgo de propósito: `wmic` está descontinuado, a
// consulta WMI equivalente (`WmiMonitorListedSupportedSourceModes`) devolve os
// modos que o monitor suporta e não o que está em uso agora, e o PowerShell
// custa segundos de inicialização num scan que precisa ser rápido. O
// EnumDisplaySettings responde exatamente a pergunta certa: em que modo cada
// saída está **neste momento**.
var (
	user32                  = syscall.NewLazyDLL("user32.dll")
	procEnumDisplayDevicesW = user32.NewProc("EnumDisplayDevicesW")
	procEnumDisplaySettings = user32.NewProc("EnumDisplaySettingsW")
)

const (
	displayDeviceAttachedToDesktop = 0x00000001
	displayDevicePrimaryDevice     = 0x00000004

	// Pede o modo em uso agora, não um da lista de suportados.
	enumCurrentSettings = 0xFFFFFFFF
)

type displayDeviceW struct {
	cb           uint32
	deviceName   [32]uint16
	deviceString [128]uint16
	stateFlags   uint32
	deviceID     [128]uint16
	deviceKey    [128]uint16
}

// devModeW espelha campo a campo a DEVMODEW do Windows. A ordem e os tamanhos
// não podem mudar: o layout é lido pelo próprio sistema, que preenche a
// estrutura por deslocamento de bytes. Os campos que não usamos continuam
// declarados justamente para manter esses deslocamentos corretos.
type devModeW struct {
	dmDeviceName         [32]uint16
	dmSpecVersion        uint16
	dmDriverVersion      uint16
	dmSize               uint16
	dmDriverExtra        uint16
	dmFields             uint32
	dmPositionX          int32
	dmPositionY          int32
	dmDisplayOrientation uint32
	dmDisplayFixedOutput uint32
	dmColor              int16
	dmDuplex             int16
	dmYResolution        int16
	dmTTOption           int16
	dmCollate            int16
	dmFormName           [32]uint16
	dmLogPixels          uint16
	dmBitsPerPel         uint32
	dmPelsWidth          uint32
	dmPelsHeight         uint32
	dmDisplayFlags       uint32
	dmDisplayFrequency   uint32
	dmICMMethod          uint32
	dmICMIntent          uint32
	dmMediaType          uint32
	dmDitherType         uint32
	dmReserved1          uint32
	dmReserved2          uint32
	dmPanningWidth       uint32
	dmPanningHeight      uint32
}

func detectDisplays(_ context.Context) (displays []DisplayInfo, warnings []string) {
	// Rede de segurança para o caminho menos verificado do projeto: o layout da
	// DEVMODEW é preenchido pelo próprio Windows por deslocamento de bytes, e um
	// campo fora de lugar numa versão futura do sistema poderia levar a um
	// acesso inválido. Ler o monitor é conveniência — a mesma regra que já vale
	// para a GPU: falhar vira aviso, e o parecer continua saindo com CPU,
	// memória e placa de vídeo. Sem isto, um pânico aqui derrubaria o scan
	// inteiro, e com ele o onboarding.
	defer func() {
		if r := recover(); r != nil {
			displays = nil
			warnings = []string{"Não foi possível identificar o monitor conectado."}
		}
	}()

	for index := uint32(0); ; index++ {
		var device displayDeviceW
		device.cb = uint32(unsafe.Sizeof(device))

		ret, _, _ := procEnumDisplayDevicesW.Call(
			0, uintptr(index), uintptr(unsafe.Pointer(&device)), 0)
		if ret == 0 {
			// Fim da enumeração: não é erro, é o sinal de que acabou.
			break
		}

		// Saída existente mas sem nada ligado (ex.: uma porta HDMI vazia) não é
		// um monitor do usuário — não deveria influenciar a resolução do jogo.
		if device.stateFlags&displayDeviceAttachedToDesktop == 0 {
			continue
		}

		var mode devModeW
		mode.dmSize = uint16(unsafe.Sizeof(mode))

		ok, _, _ := procEnumDisplaySettings.Call(
			uintptr(unsafe.Pointer(&device.deviceName[0])),
			uintptr(enumCurrentSettings),
			uintptr(unsafe.Pointer(&mode)))
		if ok == 0 || mode.dmPelsWidth == 0 || mode.dmPelsHeight == 0 {
			// Monitor que não reporta o modo atual fica de fora em vez de entrar
			// com zeros: PrimaryDisplay ignoraria mesmo, e uma entrada vazia na
			// tela de Especificações não diz nada a ninguém.
			continue
		}

		displays = append(displays, DisplayInfo{
			Name:      syscall.UTF16ToString(device.deviceName[:]),
			Width:     int(mode.dmPelsWidth),
			Height:    int(mode.dmPelsHeight),
			RefreshHz: int(mode.dmDisplayFrequency),
			Primary:   device.stateFlags&displayDevicePrimaryDevice != 0,
			Source:    "user32",
		})
	}

	if len(displays) == 0 {
		return nil, []string{"Não foi possível identificar o monitor conectado."}
	}
	return displays, nil
}
