package emulator

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Trava o formato observado no DuckStation (levantamento 2026-10-06): o
// controle grava "SDL-0/Back & SDL-0/RightStick", só a chave do print muda,
// a seção [Hotkeys] é criada quando não existe (assistente pulado) e o
// backup sai antes.
func TestDuckStationScreenshotHotkeyController(t *testing.T) {
	install, dir := managedDuckStation(t)
	path := filepath.Join(dir, "settings.ini")
	original := "[Main]\nSetupWizardIncomplete = false\n"
	if err := os.WriteFile(path, []byte(original), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := WriteScreenshotHotkey("duckstation", install, ScreenshotHotkey{Controller: []string{"back", "r3"}}); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	if !strings.Contains(string(data), "[Hotkeys]\nScreenshot = SDL-0/Back & SDL-0/RightStick") {
		t.Fatalf("arquivo:\n%s", data)
	}
	if !strings.HasPrefix(string(data), original) {
		t.Fatalf("o resto do arquivo deveria ficar igual:\n%s", data)
	}
	if b, err := os.ReadFile(path + configBackupSuffix); err != nil || string(b) != original {
		t.Fatalf("backup = %q, %v", b, err)
	}
	st, err := ReadScreenshotHotkey("duckstation", install)
	if err != nil || len(st.Current.Controller) != 2 || st.Current.Controller[1] != "r3" {
		t.Fatalf("leitura = %+v, %v", st, err)
	}
	if st.Folder != filepath.Join(dir, "screenshots") {
		t.Fatalf("pasta = %q", st.Folder)
	}
}

// Trava a recusa de conflito com outro atalho do emulador (F11 é tela cheia
// no DuckStation), de tecla fora da lista (PrintScreen) e do botão Xbox, e
// de teclado + controle juntos onde só cabe uma ligação.
func TestScreenshotHotkeyValidation(t *testing.T) {
	install, dir := managedDuckStation(t)
	path := filepath.Join(dir, "settings.ini")
	os.WriteFile(path, []byte("[Hotkeys]\nToggleFullscreen = Keyboard/F11\nScreenshot = Keyboard/F10\n"), 0o644)
	var invalid ErrScreenshotHotkey
	for _, h := range []ScreenshotHotkey{
		{Keyboard: "F11"},
		{Keyboard: "PrintScreen"},
		{Controller: []string{"guide", "r3"}},
		{Controller: []string{"r3", "r3"}},
		{Controller: []string{"back"}},
		{Keyboard: "F9", Controller: []string{"back", "r3"}},
	} {
		if err := WriteScreenshotHotkey("duckstation", install, h); !errors.As(err, &invalid) {
			t.Errorf("%+v: esperava recusa, veio %v", h, err)
		}
	}
	if data, _ := os.ReadFile(path); !strings.Contains(string(data), "Screenshot = Keyboard/F10") {
		t.Fatalf("recusa não pode gravar nada:\n%s", data)
	}
}

// Trava o padrão de fábrica do PCSX2 (F8) quando a chave não existe, e o
// mesmo formato SDL do DuckStation.
func TestPCSX2ScreenshotHotkey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "PCSX2.ini")
	orig := pcsx2ConfigPath
	pcsx2ConfigPath = func() (string, error) { return path, nil }
	defer func() { pcsx2ConfigPath = orig }()
	os.WriteFile(path, []byte("[UI]\nSetupWizardIncomplete = false\n"), 0o644)

	st, err := ReadScreenshotHotkey("pcsx2", Installation{})
	if err != nil || st.Current.Keyboard != "F8" {
		t.Fatalf("padrão = %+v, %v", st, err)
	}
	if err := WriteScreenshotHotkey("pcsx2", Installation{}, ScreenshotHotkey{Keyboard: "F9"}); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(path); !strings.Contains(string(data), "[Hotkeys]\nScreenshot = Keyboard/F9") {
		t.Fatalf("arquivo:\n%s", data)
	}
}

// Trava o RetroArch: teclado e controle coexistem, o combo vira índices do
// xinput (Select+R3 = 7 e 9, observado), input_enable_hotkey de teclado
// nunca é criada, e com outro driver de controle o ZeuX recusa em vez de
// chutar número.
func TestRetroArchScreenshotHotkey(t *testing.T) {
	dir := t.TempDir()
	install := Installation{AdapterID: "retroarch", BinaryPath: filepath.Join(dir, "retroarch.exe")}
	cfgPath := filepath.Join(dir, "retroarch.cfg")
	orig := retroArchConfigPath
	retroArchConfigPath = func(Installation) (string, error) { return cfgPath, nil }
	defer func() { retroArchConfigPath = orig }()
	os.WriteFile(cfgPath, []byte(`input_joypad_driver = "xinput"
input_screenshot = "f8"
input_toggle_fullscreen = "f"
input_save_state = "f2"
input_enable_hotkey_btn = "nul"
input_screenshot_btn = "nul"
input_save_state_btn = "nul"
screenshot_directory = ":\screenshots"
`), 0o644)

	if err := WriteScreenshotHotkey("retroarch", install, ScreenshotHotkey{Keyboard: "F2"}); err == nil {
		t.Fatal("F2 é salvar estado; deveria recusar")
	}
	if err := WriteScreenshotHotkey("retroarch", install, ScreenshotHotkey{Keyboard: "F8", Controller: []string{"back", "r3"}}); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(cfgPath)
	s := string(data)
	for _, want := range []string{`input_enable_hotkey_btn = "7"`, `input_screenshot_btn = "9"`, `input_screenshot = "f8"`} {
		if !strings.Contains(s, want) {
			t.Fatalf("faltou %s:\n%s", want, s)
		}
	}
	if strings.Contains(s, "input_enable_hotkey =") {
		t.Fatalf("input_enable_hotkey não pode ser criada:\n%s", s)
	}
	st, err := ReadScreenshotHotkey("retroarch", install)
	if err != nil || st.Current.Keyboard != "F8" || len(st.Current.Controller) != 2 {
		t.Fatalf("leitura = %+v, %v", st, err)
	}
	if st.Folder != filepath.Join(dir, "screenshots") {
		t.Fatalf("pasta \":\\screenshots\" deveria resolver ao lado do exe, veio %q", st.Folder)
	}

	os.WriteFile(cfgPath, []byte(`input_joypad_driver = "sdl2"`+"\n"), 0o644)
	if err := WriteScreenshotHotkey("retroarch", install, ScreenshotHotkey{Controller: []string{"back", "r3"}}); err == nil {
		t.Fatal("com driver sdl2 os índices não são conhecidos; deveria recusar")
	}
}

// Trava que os emuladores sem levantamento ficam de fora.
func TestScreenshotHotkeyUnsupportedAdapters(t *testing.T) {
	for _, id := range []string{"flycast", "rpcs3", "vita3k", "xemu", "dolphin"} {
		if SupportsScreenshotHotkey(id) {
			t.Errorf("%s não foi levantado", id)
		}
	}
}
