package emulator

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func usePCSX2Config(t *testing.T, path string) {
	t.Helper()
	orig := pcsx2ConfigPath
	pcsx2ConfigPath = func() (string, error) { return path, nil }
	t.Cleanup(func() { pcsx2ConfigPath = orig })
}

// Trava a forma de "mais de um bind por ação": linhas repetidas, lado a
// lado, no lugar da primeira — e nada fora da chave muda.
func TestINISetAllReplacesEveryOccurrenceInPlace(t *testing.T) {
	ini := parseINI([]byte("[Pad1]\nType = DualShock2\nCross = Keyboard/K\nUp = Keyboard/Up\nCross = SDL-0/A\n\n[Outro]\nCross = fica\n"))
	ini.setAll("Pad1", "Cross", []string{"SDL-0/FaceSouth", "Keyboard/K"})

	want := "[Pad1]\nType = DualShock2\nCross = SDL-0/FaceSouth\nCross = Keyboard/K\nUp = Keyboard/Up\n\n[Outro]\nCross = fica\n"
	if got := string(ini.bytes()); got != want {
		t.Fatalf("got %q\nwant %q", got, want)
	}
	if got := ini.getAll("Pad1", "Cross"); len(got) != 2 || got[0] != "SDL-0/FaceSouth" {
		t.Fatalf("getAll = %v", got)
	}
}

// Trava que o mapeamento padrão liga controle e teclado juntos, sem mexer no
// resto do arquivo, e com backup do original.
func TestApplyControllerPresetPCSX2KeepsKeyboardAndRestOfFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "PCSX2.ini")
	if err := os.WriteFile(path, []byte("[UI]\nSettingsVersion = 1\n\n[Pad1]\nType = DualShock2\nCross = Keyboard/Space\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	usePCSX2Config(t, path)

	if err := ApplyControllerPreset("pcsx2", Installation{}); err != nil {
		t.Fatalf("ApplyControllerPreset: %v", err)
	}
	out, _ := os.ReadFile(path)
	for _, want := range []string{"SettingsVersion = 1", "Type = DualShock2", "Cross = SDL-0/FaceSouth\nCross = Keyboard/K", "LUp = SDL-0/-LeftY"} {
		if !strings.Contains(string(out), want) {
			t.Errorf("faltou %q em:\n%s", want, out)
		}
	}
	if _, err := os.Stat(path + configBackupSuffix); err != nil {
		t.Errorf("sem backup do original: %v", err)
	}

	applied, known := ControllerPresetApplied("pcsx2", Installation{})
	if !known || !applied {
		t.Fatalf("ControllerPresetApplied = %v, %v; esperava true, true", applied, known)
	}
}

// Trava quando o ZeuX conserta sozinho ao abrir o jogo: só com o jogador 1
// sem bind nenhum. Um teclado escolhido pelo usuário, ou um arquivo que o
// emulador ainda nem criou, não são tocados.
func TestNeedsControllerPresetOnlyWhenPlayerOneIsEmpty(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "PCSX2.ini")
	usePCSX2Config(t, path)

	if NeedsControllerPreset("pcsx2", Installation{}) {
		t.Error("arquivo ausente: o PCSX2 cria os padrões dele, não é para gravar")
	}

	os.WriteFile(path, []byte("[UI]\nSettingsVersion = 1\nSetupWizardIncomplete = false\n"), 0o644)
	if !NeedsControllerPreset("pcsx2", Installation{}) {
		t.Error("seed antigo sem [Pad1]: deveria pedir o mapeamento padrão")
	}

	os.WriteFile(path, []byte("[Pad1]\nCross = Keyboard/Space\n"), 0o644)
	if NeedsControllerPreset("pcsx2", Installation{}) {
		t.Error("com bind do usuário não é para gravar por cima")
	}
}

// Trava que ler os binds do PCSX2 enxerga controle e teclado na mesma ação,
// e que gravar a tecla não apaga o botão.
func TestPCSX2BindingsWithControllerAndKeyboard(t *testing.T) {
	path := filepath.Join(t.TempDir(), "PCSX2.ini")
	os.WriteFile(path, []byte("[Pad1]\nCross = SDL-0/FaceSouth\nCross = Keyboard/K\n"), 0o644)
	usePCSX2Config(t, path)

	adapter := newPCSX2().(KeyBindableAdapter)
	bindings, err := adapter.ReadBindings(Installation{})
	if err != nil {
		t.Fatal(err)
	}
	var cross InputBinding
	for _, b := range bindings {
		if b.Action == "Cross" {
			cross = b
		}
	}
	if cross.Key == nil || *cross.Key != "K" || cross.Button == nil || *cross.Button != "SDL-0/FaceSouth" {
		t.Fatalf("Cross = %+v", cross)
	}

	if _, err := adapter.WriteBindings(Installation{}, []InputBinding{{Action: "Cross", Key: strPtr("Space")}}); err != nil {
		t.Fatal(err)
	}
	out, _ := os.ReadFile(path)
	if !strings.Contains(string(out), "Cross = Keyboard/Space") || !strings.Contains(string(out), "Cross = SDL-0/FaceSouth") {
		t.Fatalf("a tecla nova deveria conviver com o botão:\n%s", out)
	}
	if strings.Contains(string(out), "Keyboard/K") {
		t.Fatalf("a tecla antiga deveria ter saído:\n%s", out)
	}
}

// Trava que o DuckStation só vira "preset" onde o ZeuX sabe qual
// settings.ini ele lê: a instalação gerenciada em modo portátil.
func TestDuckStationPresetNeedsManagedPortableInstall(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "duckstation-qt")
	os.WriteFile(bin, nil, 0o755)

	if got, _ := ControllerSupportFor("duckstation", Installation{BinaryPath: bin}); got != ControllerSupportManual {
		t.Errorf("instalação do usuário: got %q, want manual", got)
	}
	if got, _ := ControllerSupportFor("duckstation", Installation{BinaryPath: bin, Managed: true}); got != ControllerSupportManual {
		t.Errorf("gerenciada sem portable.txt: got %q, want manual", got)
	}

	os.WriteFile(filepath.Join(dir, "portable.txt"), nil, 0o644)
	install := Installation{BinaryPath: bin, Managed: true}
	if got, _ := ControllerSupportFor("duckstation", install); got != ControllerSupportPreset {
		t.Fatalf("gerenciada portátil: got %q, want preset", got)
	}

	if err := ApplyControllerPreset("duckstation", install); err != nil {
		t.Fatal(err)
	}
	out, _ := os.ReadFile(filepath.Join(dir, "settings.ini"))
	// Vocabulário do DuckStation, não do PCSX2: A/B/X/Y e UpArrow/Enter.
	for _, want := range []string{"Cross = SDL-0/A", "Up = Keyboard/UpArrow", "Start = Keyboard/Enter"} {
		if !strings.Contains(string(out), want) {
			t.Errorf("faltou %q em:\n%s", want, out)
		}
	}
	if applied, known := ControllerPresetApplied("duckstation", install); !known || !applied {
		t.Errorf("ControllerPresetApplied = %v, %v", applied, known)
	}
}

// Trava que emulador personalizado não ganha resposta inventada.
func TestControllerSupportUnknownForCustom(t *testing.T) {
	if _, ok := ControllerSupportFor("custom-meu-emulador", Installation{}); ok {
		t.Fatal("emulador personalizado não deveria ter ControllerSupport")
	}
}

// Trava a leitura mínima do Default.yml do RPCS3: só o Handler do jogador 1.
func TestRPCS3Player1Handler(t *testing.T) {
	path := filepath.Join(t.TempDir(), "Default.yml")
	os.WriteFile(path, []byte("Player 1 Input:\n  Handler: Keyboard\n  Device: Keyboard\n  Config:\n    Handler: nada\nPlayer 2 Input:\n  Handler: XInput\n"), 0o644)
	got, err := rpcs3Player1Handler(path)
	if err != nil || got != "Keyboard" {
		t.Fatalf("got %q, %v; want Keyboard", got, err)
	}
}

// Trava que o preset do RPCS3 nunca sobrescreve um Default.yml do usuário
// (YAML aninhado que o ZeuX não edita sem parser) e que só existe no Windows.
func TestRPCS3PresetRefusesExistingConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config", "input_configs", "global", "Default.yml")
	if err := writeRPCS3XInputPreset(path); err != nil {
		t.Fatalf("arquivo ausente deveria ser gravado: %v", err)
	}
	if got, _ := rpcs3Player1Handler(path); got != "XInput" {
		t.Fatalf("Handler = %q, want XInput", got)
	}
	if err := writeRPCS3XInputPreset(path); !errors.Is(err, ErrControllerPresetExisting) {
		t.Fatalf("segunda escrita: got %v, want ErrControllerPresetExisting", err)
	}

	want := ControllerSupportManual
	if runtime.GOOS == "windows" {
		want = ControllerSupportPreset
	}
	if got, _ := ControllerSupportFor("rpcs3", Installation{BinaryPath: filepath.Join(t.TempDir(), "rpcs3.exe")}); got != want {
		t.Fatalf("rpcs3 em %s: got %q, want %q", runtime.GOOS, got, want)
	}
}

// Trava o conserto do "não consigo configurar o controle do PS3": o RPCS3 cria
// o Default.yml sozinho com o jogador 1 no teclado, e o preset precisa
// reescrever só esse bloco — sem tocar no jogador 2 — em vez de recusar.
func TestRPCS3PresetRewritesUntouchedKeyboardDefault(t *testing.T) {
	path := filepath.Join(t.TempDir(), "Default.yml")
	original := "Player 1 Input:\n  Handler: Keyboard\n  Device: Keyboard\n  Config:\n    Left Stick Left: A\n    Start: Return\n  Buddy Device: \"\"\nPlayer 2 Input:\n  Handler: Null\n  Device: \"\"\n"
	if err := os.WriteFile(path, []byte(original), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := writeRPCS3XInputPreset(path); err != nil {
		t.Fatalf("Default.yml no padrão do teclado deveria ser reescrito: %v", err)
	}
	data, _ := os.ReadFile(path)
	got := string(data)
	for _, want := range []string{"Handler: XInput", "Device: XInput Pad #1", "Buddy Device", "Player 2 Input:"} {
		if !strings.Contains(got, want) {
			t.Errorf("faltou %q em:\n%s", want, got)
		}
	}
	if strings.Contains(got, "Left Stick Left") || strings.Contains(got, "Handler: Keyboard") {
		t.Errorf("sobrou configuração de teclado do jogador 1:\n%s", got)
	}
	if h, _ := rpcs3Player1Handler(path); h != "XInput" {
		t.Errorf("Handler do jogador 1 = %q, esperado XInput", h)
	}
}
