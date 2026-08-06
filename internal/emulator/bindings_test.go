package emulator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func strPtr(s string) *string { return &s }

func TestPCSX2SatisfiesKeyBindableAdapter(t *testing.T) {
	if _, ok := newPCSX2().(KeyBindableAdapter); !ok {
		t.Fatal("newPCSX2() deveria satisfazer KeyBindableAdapter")
	}
}

func TestRetroArchSatisfiesKeyBindableAdapter(t *testing.T) {
	if _, ok := newRetroArch().(KeyBindableAdapter); !ok {
		t.Fatal("newRetroArch() deveria satisfazer KeyBindableAdapter")
	}
}

func TestDuckStationDoesNotSatisfyKeyBindableAdapter(t *testing.T) {
	if _, ok := newDuckStation().(KeyBindableAdapter); ok {
		t.Fatal("DuckStation não deveria satisfazer KeyBindableAdapter ainda (fora do escopo do H3/H4 nesta sessão)")
	}
}

func TestPCSX2ReadBindingsMissingFileReturnsNil(t *testing.T) {
	orig := pcsx2ConfigPath
	pcsx2ConfigPath = func() (string, error) { return filepath.Join(t.TempDir(), "nao-existe.ini"), nil }
	defer func() { pcsx2ConfigPath = orig }()

	bindings, err := newPCSX2().(KeyBindableAdapter).ReadBindings(Installation{})
	if err != nil {
		t.Fatalf("arquivo ausente não deveria ser erro: %v", err)
	}
	if bindings != nil {
		t.Fatalf("esperava nil, veio %+v", bindings)
	}
}

func TestPCSX2WriteBindingsRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "PCSX2.ini")
	raw := "[Pad1]\nType = DualShock2\nCross = Keyboard/K\nUp = Keyboard/Up\n"
	if err := os.WriteFile(path, []byte(raw), 0o644); err != nil {
		t.Fatal(err)
	}

	orig := pcsx2ConfigPath
	pcsx2ConfigPath = func() (string, error) { return path, nil }
	defer func() { pcsx2ConfigPath = orig }()

	adapter := newPCSX2().(KeyBindableAdapter)
	unapplied, err := adapter.WriteBindings(Installation{}, []InputBinding{
		{Action: "Cross", Key: strPtr("Space")},
	})
	if err != nil {
		t.Fatalf("WriteBindings: %v", err)
	}
	if len(unapplied) != 0 {
		t.Fatalf("não esperava Unapplied, veio %v", unapplied)
	}

	out, _ := os.ReadFile(path)
	if !strings.Contains(string(out), "Cross = Keyboard/Space") {
		t.Fatalf("Cross não foi atualizado: %s", out)
	}
	if !strings.Contains(string(out), "Up = Keyboard/Up") {
		t.Fatalf("Up (não tocado) deveria continuar igual: %s", out)
	}
	if !strings.Contains(string(out), "Type = DualShock2") {
		t.Fatalf("Type (não tocado) deveria continuar igual: %s", out)
	}
}

// Trava a ressalva mais importante do H3: botão de controle no PCSX2 nunca
// é escrito com um formato adivinhado — vai para Unapplied.
func TestPCSX2WriteBindingsButtonGoesToUnapplied(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "PCSX2.ini")
	if err := os.WriteFile(path, []byte("[Pad1]\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	orig := pcsx2ConfigPath
	pcsx2ConfigPath = func() (string, error) { return path, nil }
	defer func() { pcsx2ConfigPath = orig }()

	unapplied, err := newPCSX2().(KeyBindableAdapter).WriteBindings(Installation{}, []InputBinding{
		{Action: "Cross", Button: strPtr("0")},
	})
	if err != nil {
		t.Fatalf("WriteBindings: %v", err)
	}
	if len(unapplied) != 1 {
		t.Fatalf("esperava 1 mensagem em Unapplied, veio %v", unapplied)
	}

	out, _ := os.ReadFile(path)
	if strings.Contains(string(out), "Cross") {
		t.Fatalf("não deveria ter gravado nada para Cross (botão não confirmado): %s", out)
	}
}

// Ação desconhecida não é gravada silenciosamente — vai para Unapplied com
// o nome nomeado.
func TestPCSX2WriteBindingsUnknownActionGoesToUnapplied(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "PCSX2.ini")
	if err := os.WriteFile(path, []byte("[Pad1]\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	orig := pcsx2ConfigPath
	pcsx2ConfigPath = func() (string, error) { return path, nil }
	defer func() { pcsx2ConfigPath = orig }()

	unapplied, err := newPCSX2().(KeyBindableAdapter).WriteBindings(Installation{}, []InputBinding{
		{Action: "BotaoQueNaoExiste", Key: strPtr("A")},
	})
	if err != nil {
		t.Fatalf("WriteBindings: %v", err)
	}
	if len(unapplied) != 1 || !strings.Contains(unapplied[0], "BotaoQueNaoExiste") {
		t.Fatalf("esperava Unapplied nomeando a ação desconhecida, veio %v", unapplied)
	}
}

func TestRetroArchReadBindingsTreatsNulAsAbsent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "retroarch.cfg")
	raw := "input_player1_a = \"x\"\ninput_player1_a_btn = \"nul\"\ninput_player1_b = \"nul\"\n"
	if err := os.WriteFile(path, []byte(raw), 0o644); err != nil {
		t.Fatal(err)
	}

	orig := retroArchConfigPath
	retroArchConfigPath = func(Installation) (string, error) { return path, nil }
	defer func() { retroArchConfigPath = orig }()

	bindings, err := newRetroArch().(KeyBindableAdapter).ReadBindings(Installation{})
	if err != nil {
		t.Fatalf("ReadBindings: %v", err)
	}
	byAction := map[string]InputBinding{}
	for _, b := range bindings {
		byAction[b.Action] = b
	}
	if byAction["a"].Key == nil || *byAction["a"].Key != "x" {
		t.Fatalf("a.Key = %v, esperado \"x\"", byAction["a"].Key)
	}
	if byAction["a"].Button != nil {
		t.Fatalf("a.Button deveria ser nil (\"nul\" = sem vínculo), veio %q", *byAction["a"].Button)
	}
	if byAction["b"].Key != nil {
		t.Fatalf("b.Key deveria ser nil (\"nul\" = sem vínculo), veio %q", *byAction["b"].Key)
	}
}

func TestRetroArchWriteBindingsRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "retroarch.cfg")
	raw := "input_player1_a = \"x\"\ninput_player1_b = \"z\"\naudio_driver = \"pulse\"\n"
	if err := os.WriteFile(path, []byte(raw), 0o644); err != nil {
		t.Fatal(err)
	}

	orig := retroArchConfigPath
	retroArchConfigPath = func(Installation) (string, error) { return path, nil }
	defer func() { retroArchConfigPath = orig }()

	unapplied, err := newRetroArch().(KeyBindableAdapter).WriteBindings(Installation{}, []InputBinding{
		{Action: "a", Key: strPtr("space")},
		{Action: "a", Button: strPtr("0")},
	})
	if err != nil {
		t.Fatalf("WriteBindings: %v", err)
	}
	if len(unapplied) != 0 {
		t.Fatalf("Button no RetroArch é aplicado (chave confirmada), não esperava Unapplied: %v", unapplied)
	}

	out, _ := os.ReadFile(path)
	got := string(out)
	if !strings.Contains(got, `input_player1_a = "space"`) {
		t.Fatalf("input_player1_a não foi atualizado: %s", got)
	}
	if !strings.Contains(got, `input_player1_a_btn = "0"`) {
		t.Fatalf("input_player1_a_btn não foi gravado: %s", got)
	}
	if !strings.Contains(got, `input_player1_b = "z"`) {
		t.Fatalf("input_player1_b (não tocado) deveria continuar igual: %s", got)
	}
	if !strings.Contains(got, `audio_driver = "pulse"`) {
		t.Fatalf("audio_driver (não tocado) deveria continuar igual: %s", got)
	}
}
