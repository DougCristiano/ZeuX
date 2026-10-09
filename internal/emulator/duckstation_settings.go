package emulator

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"strings"
)

// Configuração do DuckStation pelo ZeuX (2026-10-05).
//
// Origem dos dados, que importa para quem for mexer: as seções, chaves e
// valores abaixo foram OBSERVADOS pelo Douglas no settings.ini real do
// DuckStation 0.1-12070 no Windows (levantamento com o emulador rodando),
// exceto onde o comentário diz "código-fonte". Valores de lista só entram
// quando foram vistos no arquivo real ou lidos no código — nunca chutados.
//
// Regra de escrita: o DuckStation às vezes grava só as chaves diferentes do
// padrão, às vezes o arquivo inteiro, e o "restaurar padrões" reordena as
// seções. Então o ZeuX nunca reescreve o arquivo: lê, MESCLA só as chaves que
// controla (iniFile, linha a linha) e grava de volta. E só com o emulador
// fechado — ele grava o próprio settings.ini ao sair, por cima de qualquer
// coisa escrita enquanto estava aberto.

// dsPolicy diz quando um padrão do ZeuX entra no settings.ini.
type dsPolicy int

const (
	// dsIfAbsent: só quando a chave não existe — se a pessoa (ou o próprio
	// DuckStation) já escreveu um valor, ele vale.
	dsIfAbsent dsPolicy = iota
	// dsForce: sempre. Reservado ao que é política do ZeuX, não preferência.
	dsForce
	// dsFreshOnly: só numa instalação nova (sem settings.ini). Mudar depois
	// trocaria o comportamento de quem já joga — ex.: o tipo de cartão, que
	// faria os cartões existentes "sumirem".
	dsFreshOnly
)

type dsDefault struct {
	section, key, value string
	policy              dsPolicy
}

// duckStationDefaults é o que a primeira execução precisa ter.
//
// O bug que motivou a lista (observado): com o assistente pulado, o
// DuckStation ficava sem botões no [Pad1] e sem [Hotkeys] — o jogo abria e
// não respondia a nada.
var duckStationDefaults = []dsDefault{
	{"Main", "SetupWizardIncomplete", "false", dsIfAbsent},
	{"Main", "NoDesktopFile", "true", dsIfAbsent},
	// Obrigatório: com o padrão (true) o DuckStation se atualizou sozinho
	// durante o teste e trocou o .exe e as DLLs. Quem atualiza é o ZeuX.
	{"AutoUpdater", "CheckAtStartup", "false", dsForce},

	{"InputSources", "SDL", "true", dsIfAbsent},
	{"InputSources", "XInput", "false", dsIfAbsent},
	{"InputSources", "RawInput", "false", dsIfAbsent},
	{"InputSources", "SDLControllerEnhancedMode", "false", dsIfAbsent},
	{"InputSources", "SDLPS5PlayerLED", "false", dsIfAbsent},

	{"Hotkeys", "OpenPauseMenu", "Keyboard/Escape", dsIfAbsent},
	{"Hotkeys", "SaveSelectedSaveState", "Keyboard/F2", dsIfAbsent},
	{"Hotkeys", "LoadSelectedSaveState", "Keyboard/F1", dsIfAbsent},
	{"Hotkeys", "SelectPreviousSaveStateSlot", "Keyboard/F3", dsIfAbsent},
	{"Hotkeys", "SelectNextSaveStateSlot", "Keyboard/F4", dsIfAbsent},
	{"Hotkeys", "Screenshot", "Keyboard/F10", dsIfAbsent},
	{"Hotkeys", "ToggleFullscreen", "Keyboard/F11", dsIfAbsent},
	{"Hotkeys", "FastForward", "Keyboard/Tab", dsIfAbsent},
	{"Hotkeys", "TogglePause", "Keyboard/Space", dsIfAbsent},

	// Cartão nomeado pelo arquivo da ROM (decisão do Douglas, 2026-10-05):
	// é o único tipo em que o ZeuX acha o cartão de cada jogo com certeza —
	// "PerGameTitle", o padrão, usa o título do banco interno do DuckStation,
	// que o ZeuX não tem. Nome do valor lido no código-fonte
	// (core/settings.cpp, s_memory_card_type_names).
	{"MemoryCards", "Card1Type", "PerGameFileTitle", dsFreshOnly},

	// Salvar estado ao fechar liga por padrão do ZeuX (decisão do Douglas,
	// 2026-10-09): é o estado que o "Continuar" retoma. Só entra se a chave
	// falta, para que o "desligado" escolhido pela pessoa na tela de opções
	// seja respeitado no lançamento seguinte. O padrão do próprio DuckStation
	// também é ligado (core/settings.cpp, GetBoolValue("Main", "SaveStateOnExit", true)).
	{"Main", "SaveStateOnExit", "true", dsIfAbsent},
}

// duckStationPadType é o tipo de controle do jogador 1 (decisão do Douglas:
// analógico — cobre os jogos de DualShock, e os botões digitais continuam
// iguais). Observado como padrão do DuckStation no arquivo real.
const duckStationPadType = "AnalogController"

// MergeDuckStationDefaults devolve o settings.ini com os padrões do ZeuX
// mesclados. `fresh` = instalação nova (arquivo não existia). Pura: não toca
// o disco, para ser testada com qualquer forma de arquivo.
//
// O [Pad1] segue regra própria: os botões só entram se o jogador 1 não tem
// bind nenhum (o estado do bug acima) — um mapeamento que a pessoa fez é dela.
// Teclado e controle entram juntos em cada botão: o DuckStation lê a mesma
// chave repetida em linhas separadas como vários binds
// (INISettingsInterface::GetStringList, código-fonte).
func MergeDuckStationDefaults(existing []byte, fresh bool) []byte {
	ini := parseINI(existing)
	for _, d := range duckStationDefaults {
		_, has := ini.get(d.section, d.key)
		switch d.policy {
		case dsForce:
			ini.set(d.section, d.key, d.value)
		case dsIfAbsent:
			if !has {
				ini.set(d.section, d.key, d.value)
			}
		case dsFreshOnly:
			if fresh && !has {
				ini.set(d.section, d.key, d.value)
			}
		}
	}

	if !duckStationPadHasBinds(ini) {
		if _, has := ini.get("Pad1", "Type"); !has {
			ini.set("Pad1", "Type", duckStationPadType)
		}
		for _, e := range duckStationControllerPreset {
			ini.setAll("Pad1", e.action, e.values)
		}
	}
	return ini.bytes()
}

func duckStationPadHasBinds(ini *iniFile) bool {
	for _, action := range duckStationPadActions() {
		for _, v := range ini.getAll("Pad1", action) {
			if strings.TrimSpace(v) != "" {
				return true
			}
		}
	}
	return false
}

// EnsureDuckStationDefaults aplica MergeDuckStationDefaults no settings.ini
// de uma instalação gerenciada, já existente — o caminho que conserta quem
// instalou antes desta correção, sem reinstalar. Grava só se algo mudou, com
// backup antes da primeira escrita do ZeuX. Quem chama garante que o
// DuckStation está fechado.
func EnsureDuckStationDefaults(install Installation) error {
	path, ok := duckStationSettingsPath(install)
	if !ok {
		return nil
	}
	data, err := os.ReadFile(path)
	fresh := os.IsNotExist(err)
	if err != nil && !fresh {
		return fmt.Errorf("lendo %s: %w", path, err)
	}
	merged := MergeDuckStationDefaults(data, fresh)
	if bytes.Equal(merged, data) {
		return nil
	}
	if err := backupBeforeFirstWrite(path); err != nil {
		return err
	}
	return os.WriteFile(path, merged, 0o644)
}

// ErrDuckStationNotManaged: as opções só valem para a instalação do ZeuX em
// modo portátil, a única cujo settings.ini o ZeuX sabe onde está.
var ErrDuckStationNotManaged = errors.New("as opções do DuckStation só podem ser ajustadas pelo ZeuX na instalação feita por ele")

// duckStationSettingsCatalog: padrões do DuckStation observados no arquivo
// real. Listas só com valores vistos (ou lidos no código, onde dito): um
// valor de enum errado faz o DuckStation ignorar a chave.
var duckStationSettingsCatalog = []EmulatorSetting{
	boolSetting("Main", "StartFullscreen", "false"),
	boolSetting("Main", "HideMainWindowWhenRunning", "false"),
	boolSetting("Main", "ConfirmPowerOff", "true"),
	fileAutoSaveSetting("Main", "SaveStateOnExit"),
	boolSetting("Main", "CreateSaveStateBackups", "true"),
	boolSetting("Main", "HideCursorInFullscreen", "true"),
	boolSetting("Main", "PauseOnFocusLoss", "false"),
	boolSetting("Main", "PauseOnControllerDisconnection", "false"),
	boolSetting("Main", "DisableBackgroundInput", "false"),
	boolSetting("Main", "InhibitScreensaver", "true"),
	boolSetting("Main", "DoubleClickTogglesFullscreen", "true"),
	boolSetting("Main", "EnableDiscordPresence", "false"),
	boolSetting("Display", "AutoResizeWindow", "false"),
	choiceSetting("Audio", "Backend", "Cubeb", "Cubeb", "SDL"),
	intSetting("Audio", "BufferMS", "50", 10, 500),
	intSetting("Audio", "OutputLatencyMS", "20", 0, 500),
	choiceSetting("Audio", "StretchMode", "TimeStretch", "TimeStretch", "Resample"),
	intSetting("Audio", "OutputVolume", "100", 0, 100),
	intSetting("Audio", "FastForwardVolume", "100", 0, 100),
	// "PerGameFileTitle" lido no código-fonte; os outros dois observados.
	choiceSetting("MemoryCards", "Card1Type", "PerGameTitle", "PerGameFileTitle", "PerGameTitle", "Shared"),
	boolSetting("MemoryCards", "UsePlaylistTitle", "true"),
}

