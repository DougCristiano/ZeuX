package emulator

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
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

// --- Opções editáveis pela tela do console ---

// DuckStationSettingKind é o tipo de valor de uma opção.
type DuckStationSettingKind string

const (
	DSBool   DuckStationSettingKind = "bool"
	DSChoice DuckStationSettingKind = "choice"
	DSInt    DuckStationSettingKind = "int"
)

// DuckStationSetting é uma opção do settings.ini exposta na tela do PS1.
// O texto que a pessoa lê mora no front (i18n), pela ID.
type DuckStationSetting struct {
	ID      string                 `json:"id"`
	Section string                 `json:"section"`
	Key     string                 `json:"key"`
	Kind    DuckStationSettingKind `json:"kind"`
	Default string                 `json:"default"`
	Choices []string               `json:"choices,omitempty"`
	Min     int                    `json:"min,omitempty"`
	Max     int                    `json:"max,omitempty"`
	// Value é o que está no arquivo; vazio quando a chave não existe (vale
	// o Default do DuckStation).
	Value string `json:"value,omitempty"`
}

func dsBool(section, key, def string) DuckStationSetting {
	return DuckStationSetting{ID: section + "." + key, Section: section, Key: key, Kind: DSBool, Default: def}
}

func dsInt(section, key, def string, min, max int) DuckStationSetting {
	return DuckStationSetting{ID: section + "." + key, Section: section, Key: key, Kind: DSInt, Default: def, Min: min, Max: max}
}

func dsChoice(section, key, def string, choices ...string) DuckStationSetting {
	return DuckStationSetting{ID: section + "." + key, Section: section, Key: key, Kind: DSChoice, Default: def, Choices: choices}
}

// duckStationSettingsCatalog: padrões do DuckStation observados no arquivo
// real. Listas só com valores vistos (ou lidos no código, onde dito): um
// valor de enum errado faz o DuckStation ignorar a chave.
var duckStationSettingsCatalog = []DuckStationSetting{
	dsBool("Main", "StartFullscreen", "false"),
	dsBool("Main", "HideMainWindowWhenRunning", "false"),
	dsBool("Main", "ConfirmPowerOff", "true"),
	dsBool("Main", "SaveStateOnExit", "true"),
	dsBool("Main", "CreateSaveStateBackups", "true"),
	dsBool("Main", "HideCursorInFullscreen", "true"),
	dsBool("Main", "PauseOnFocusLoss", "false"),
	dsBool("Main", "PauseOnControllerDisconnection", "false"),
	dsBool("Main", "DisableBackgroundInput", "false"),
	dsBool("Main", "InhibitScreensaver", "true"),
	dsBool("Main", "DoubleClickTogglesFullscreen", "true"),
	dsBool("Main", "EnableDiscordPresence", "false"),
	dsBool("Display", "AutoResizeWindow", "false"),
	dsChoice("Audio", "Backend", "Cubeb", "Cubeb", "SDL"),
	dsInt("Audio", "BufferMS", "50", 10, 500),
	dsInt("Audio", "OutputLatencyMS", "20", 0, 500),
	dsChoice("Audio", "StretchMode", "TimeStretch", "TimeStretch", "Resample"),
	dsInt("Audio", "OutputVolume", "100", 0, 100),
	dsInt("Audio", "FastForwardVolume", "100", 0, 100),
	// "PerGameFileTitle" lido no código-fonte; os outros dois observados.
	dsChoice("MemoryCards", "Card1Type", "PerGameTitle", "PerGameFileTitle", "PerGameTitle", "Shared"),
	dsBool("MemoryCards", "UsePlaylistTitle", "true"),
}

// ErrDuckStationNotManaged: as opções só valem para a instalação do ZeuX em
// modo portátil, a única cujo settings.ini o ZeuX sabe onde está.
var ErrDuckStationNotManaged = errors.New("as opções do DuckStation só podem ser ajustadas pelo ZeuX na instalação feita por ele")

// ReadDuckStationSettings devolve o catálogo com os valores atuais do arquivo.
func ReadDuckStationSettings(install Installation) ([]DuckStationSetting, error) {
	path, ok := duckStationSettingsPath(install)
	if !ok {
		return nil, ErrDuckStationNotManaged
	}
	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("lendo %s: %w", path, err)
	}
	ini := parseINI(data)
	out := make([]DuckStationSetting, len(duckStationSettingsCatalog))
	for i, s := range duckStationSettingsCatalog {
		if v, has := ini.get(s.Section, s.Key); has {
			s.Value = v
		}
		out[i] = s
	}
	return out, nil
}

// WriteDuckStationSettings valida e mescla os valores pedidos (por ID).
// Uma ID fora do catálogo ou um valor fora do permitido recusa tudo — nada
// é gravado pela metade.
func WriteDuckStationSettings(install Installation, values map[string]string) error {
	path, ok := duckStationSettingsPath(install)
	if !ok {
		return ErrDuckStationNotManaged
	}
	byID := make(map[string]DuckStationSetting, len(duckStationSettingsCatalog))
	for _, s := range duckStationSettingsCatalog {
		byID[s.ID] = s
	}
	for id, v := range values {
		s, ok := byID[id]
		if !ok {
			return fmt.Errorf("a opção %q não existe nas opções do DuckStation", id)
		}
		if err := validateDuckStationValue(s, v); err != nil {
			return err
		}
	}

	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("lendo %s: %w", path, err)
	}
	ini := parseINI(data)
	for id, v := range values {
		s := byID[id]
		ini.set(s.Section, s.Key, v)
	}
	if err := backupBeforeFirstWrite(path); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, ini.bytes(), 0o644)
}

func validateDuckStationValue(s DuckStationSetting, v string) error {
	switch s.Kind {
	case DSBool:
		if v != "true" && v != "false" {
			return fmt.Errorf("a opção %s aceita só true ou false", s.ID)
		}
	case DSInt:
		n, err := strconv.Atoi(v)
		if err != nil || n < s.Min || n > s.Max {
			return fmt.Errorf("a opção %s aceita um número entre %d e %d", s.ID, s.Min, s.Max)
		}
	case DSChoice:
		for _, c := range s.Choices {
			if v == c {
				return nil
			}
		}
		return fmt.Errorf("a opção %s não aceita o valor %q", s.ID, v)
	}
	return nil
}
