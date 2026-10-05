package emulator

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// Opções de emulador editáveis pela tela do console (2026-10-05). Cada
// emulador declara um catálogo fechado — seção, chave, tipo, padrão —, e a
// escrita MESCLA só as chaves pedidas no arquivo do emulador (iniFile, linha
// a linha): comentários, ordem e seções desconhecidas ficam intactos, e o
// diff do arquivo mostra só a linha mudada. Backup antes da primeira escrita.
// Valores de lista só com o que foi observado no arquivo real ou lido no
// código-fonte: um valor errado faz o emulador ignorar a chave.

// EmulatorSettingKind é o tipo de valor de uma opção.
type EmulatorSettingKind string

const (
	SettingBool   EmulatorSettingKind = "bool"
	SettingChoice EmulatorSettingKind = "choice"
	SettingInt    EmulatorSettingKind = "int"
)

// EmulatorSetting é uma opção do arquivo de configuração. O texto que a
// pessoa lê mora no front (i18n), pela ID "Seção.Chave".
type EmulatorSetting struct {
	ID      string              `json:"id"`
	Section string              `json:"section"`
	Key     string              `json:"key"`
	Kind    EmulatorSettingKind `json:"kind"`
	Default string              `json:"default"`
	Choices []string            `json:"choices,omitempty"`
	Min     int                 `json:"min,omitempty"`
	Max     int                 `json:"max,omitempty"`
	// Value é o que está no arquivo; vazio quando a chave não existe.
	Value string `json:"value,omitempty"`
	// mirrors são outras "Seção.Chave" gravadas junto com o mesmo valor —
	// o PCSX2 tem InhibitScreensaver em [UI] e em [EmuCore], e a interface
	// dele mexe na de [EmuCore].
	mirrors [][2]string
}

func boolSetting(section, key, def string) EmulatorSetting {
	return EmulatorSetting{ID: section + "." + key, Section: section, Key: key, Kind: SettingBool, Default: def}
}

func intSetting(section, key, def string, min, max int) EmulatorSetting {
	return EmulatorSetting{ID: section + "." + key, Section: section, Key: key, Kind: SettingInt, Default: def, Min: min, Max: max}
}

func choiceSetting(section, key, def string, choices ...string) EmulatorSetting {
	return EmulatorSetting{ID: section + "." + key, Section: section, Key: key, Kind: SettingChoice, Default: def, Choices: choices}
}

// ErrSettingsUnsupported: o ZeuX ainda não tem catálogo para o emulador.
var ErrSettingsUnsupported = errors.New("o ZeuX ainda não ajusta as opções deste emulador")

// SupportsSettings diz se há catálogo de opções para o emulador.
func SupportsSettings(adapterID string) bool {
	return adapterID == "duckstation" || adapterID == "pcsx2"
}

// settingsTarget resolve o arquivo e o catálogo de um emulador.
func settingsTarget(adapterID string, install Installation) (string, []EmulatorSetting, error) {
	switch adapterID {
	case "duckstation":
		path, ok := duckStationSettingsPath(install)
		if !ok {
			return "", nil, ErrDuckStationNotManaged
		}
		return path, duckStationSettingsCatalog, nil
	case "pcsx2":
		path, err := pcsx2ConfigPath()
		if err != nil {
			return "", nil, fmt.Errorf("o ZeuX não sabe onde fica a configuração do PCSX2 neste sistema")
		}
		return path, pcsx2SettingsCatalog, nil
	default:
		return "", nil, ErrSettingsUnsupported
	}
}

// ReadEmulatorSettings devolve o catálogo com os valores atuais do arquivo.
func ReadEmulatorSettings(adapterID string, install Installation) ([]EmulatorSetting, error) {
	path, catalog, err := settingsTarget(adapterID, install)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("lendo %s: %w", path, err)
	}
	ini := parseINI(data)
	out := make([]EmulatorSetting, len(catalog))
	for i, s := range catalog {
		if v, has := ini.get(s.Section, s.Key); has {
			s.Value = v
		}
		out[i] = s
	}
	return out, nil
}

// WriteEmulatorSettings valida e mescla os valores pedidos (por ID). Uma ID
// fora do catálogo ou um valor fora do permitido recusa tudo — nada é
// gravado pela metade.
func WriteEmulatorSettings(adapterID string, install Installation, values map[string]string) error {
	path, catalog, err := settingsTarget(adapterID, install)
	if err != nil {
		return err
	}
	byID := make(map[string]EmulatorSetting, len(catalog))
	for _, s := range catalog {
		byID[s.ID] = s
	}
	for id, v := range values {
		s, ok := byID[id]
		if !ok {
			return fmt.Errorf("a opção %q não existe nas opções deste emulador", id)
		}
		if err := validateSettingValue(s, v); err != nil {
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
		for _, m := range s.mirrors {
			ini.set(m[0], m[1], v)
		}
	}
	if err := backupBeforeFirstWrite(path); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, ini.bytes(), 0o644)
}

func validateSettingValue(s EmulatorSetting, v string) error {
	switch s.Kind {
	case SettingBool:
		if v != "true" && v != "false" {
			return fmt.Errorf("a opção %s aceita só true ou false", s.ID)
		}
	case SettingInt:
		n, err := strconv.Atoi(v)
		if err != nil || n < s.Min || n > s.Max {
			return fmt.Errorf("a opção %s aceita um número entre %d e %d", s.ID, s.Min, s.Max)
		}
	case SettingChoice:
		for _, c := range s.Choices {
			if v == c {
				return nil
			}
		}
		return fmt.Errorf("a opção %s não aceita o valor %q", s.ID, v)
	}
	return nil
}

// pcsx2SettingsCatalog: chaves e padrões do PCSX2.ini observados pelo
// Douglas no PCSX2 2.8.2 (2026-10-05). Ficaram de fora, de propósito:
// [SPU2/Output] Backend e SyncMode (só um valor confirmado cada),
// OutputLatencyMS (não confirmado se vale para todo backend),
// [EmuCore/GS] Renderer (só "-1" confirmado) e as pastas — o modo portátil
// cuida delas. upscale_multiplier: 1–8 cobre os valores da interface do
// PCSX2 até 8x (o arquivo real tinha 4).
var pcsx2SettingsCatalog = []EmulatorSetting{
	boolSetting("UI", "StartFullscreen", "true"),
	boolSetting("UI", "ConfirmShutdown", "true"),
	boolSetting("UI", "DoubleClickTogglesFullscreen", "true"),
	boolSetting("UI", "HideMouseCursor", "false"),
	{ID: "EmuCore.InhibitScreensaver", Section: "EmuCore", Key: "InhibitScreensaver", Kind: SettingBool, Default: "true",
		mirrors: [][2]string{{"UI", "InhibitScreensaver"}}},
	boolSetting("EmuCore", "EnableDiscordPresence", "false"),
	boolSetting("EmuCore", "UseSavestateSelector", "true"),
	boolSetting("EmuCore", "BackupSavestate", "true"),
	boolSetting("EmuCore", "SaveStateOnShutdown", "false"),
	intSetting("SPU2/Output", "BufferMS", "50", 10, 500),
	intSetting("SPU2/Output", "StandardVolume", "100", 0, 100),
	intSetting("EmuCore/GS", "upscale_multiplier", "4", 1, 8),
	boolSetting("EmuCore/GS", "VsyncEnable", "false"),
}
