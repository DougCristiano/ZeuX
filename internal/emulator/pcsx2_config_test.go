package emulator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Trava que newPCSX2() satisfaz ConfigurableAdapter — a asserção de tipo é
// o contrato que H1 pede ("capacidade opcional"), não um método que sempre
// devolve erro.
func TestPCSX2SatisfiesConfigurableAdapter(t *testing.T) {
	if _, ok := newPCSX2().(ConfigurableAdapter); !ok {
		t.Fatal("newPCSX2() deveria satisfazer ConfigurableAdapter")
	}
}

// Trava o oposto: um standaloneAdapter comum (ex.: DuckStation) NÃO
// satisfaz ConfigurableAdapter — a capacidade é mesmo opcional, não algo
// que todo adapter ganhou de graça.
func TestOrdinaryStandaloneAdapterDoesNotSatisfyConfigurableAdapter(t *testing.T) {
	if _, ok := newDuckStation().(ConfigurableAdapter); ok {
		t.Fatal("DuckStation não deveria satisfazer ConfigurableAdapter ainda (H5 cobre isso depois, não o H1)")
	}
}

// Trava a leitura contra as duas chaves reais confirmadas (achadas num
// PCSX2.ini gerado por uma execução de verdade — ver comentário de
// pcsx2_config.go).
func TestPCSX2ReadConfigParsesKnownKeys(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "PCSX2.ini")
	raw := "[UI]\nStartFullscreen = true\n\n[EmuCore/GS]\nRenderer = -1\nupscale_multiplier = 3\n"
	if err := os.WriteFile(path, []byte(raw), 0o644); err != nil {
		t.Fatal(err)
	}

	opts, err := pcsx2ReadConfig(path)
	if err != nil {
		t.Fatalf("pcsx2ReadConfig: %v", err)
	}
	if opts.Fullscreen == nil || !*opts.Fullscreen {
		t.Fatalf("Fullscreen = %v, esperado true", opts.Fullscreen)
	}
	if opts.InternalScale == nil || *opts.InternalScale != 3 {
		t.Fatalf("InternalScale = %v, esperado 3", opts.InternalScale)
	}
	if opts.Renderer != nil {
		t.Fatalf("Renderer deveria ficar nil (mapeamento não confirmado), veio %v", *opts.Renderer)
	}
}

// Arquivo ausente (emulador nunca rodou) não é erro — PersistedOptions
// zerado, nunca um valor inventado.
func TestPCSX2ReadConfigMissingFileReturnsEmpty(t *testing.T) {
	opts, err := pcsx2ReadConfig(filepath.Join(t.TempDir(), "nao-existe.ini"))
	if err != nil {
		t.Fatalf("arquivo ausente não deveria ser erro: %v", err)
	}
	if opts.Fullscreen != nil || opts.InternalScale != nil || opts.Renderer != nil {
		t.Fatalf("opts deveria vir totalmente vazio, veio %+v", opts)
	}
}

// O critério mais importante do H1: gravar Fullscreen/InternalScale não
// pode tocar em nenhuma das outras ~15 chaves de um PCSX2.ini realista.
func TestPCSX2WriteConfigPreservesUnknownKeys(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "PCSX2.ini")
	raw := `[UI]
SettingsVersion = 1
InhibitScreensaver = true
StartFullscreen = false
Theme = darkfusionblue

[EmuCore/GS]
VsyncEnable = false
FramerateNTSC = 59.94
Renderer = -1
upscale_multiplier = 1
OsdShowFPS = false
`
	if err := os.WriteFile(path, []byte(raw), 0o644); err != nil {
		t.Fatal(err)
	}

	unapplied, err := pcsx2WriteConfig(path, Options{Fullscreen: true, InternalScale: 4})
	if err != nil {
		t.Fatalf("pcsx2WriteConfig: %v", err)
	}
	if len(unapplied) != 0 {
		t.Fatalf("não esperava Unapplied para Fullscreen/InternalScale, veio %v", unapplied)
	}

	out, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	got := string(out)

	for _, untouched := range []string{
		"SettingsVersion = 1",
		"InhibitScreensaver = true",
		"Theme = darkfusionblue",
		"VsyncEnable = false",
		"FramerateNTSC = 59.94",
		"Renderer = -1",
		"OsdShowFPS = false",
	} {
		if !containsLine(got, untouched) {
			t.Errorf("chave não tocada foi alterada: esperava %q em:\n%s", untouched, got)
		}
	}
	if !containsLine(got, "StartFullscreen = true") {
		t.Errorf("StartFullscreen não foi atualizado: %s", got)
	}
	if !containsLine(got, "upscale_multiplier = 4") {
		t.Errorf("upscale_multiplier não foi atualizado: %s", got)
	}
}

// Renderer, quando pedido, entra em Unapplied — nunca escrito com um valor
// numérico inventado.
func TestPCSX2WriteConfigRendererGoesToUnapplied(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "PCSX2.ini")
	if err := os.WriteFile(path, []byte("[UI]\nStartFullscreen = false\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	unapplied, err := pcsx2WriteConfig(path, Options{Renderer: RendererVulkan})
	if err != nil {
		t.Fatalf("pcsx2WriteConfig: %v", err)
	}
	if len(unapplied) != 1 {
		t.Fatalf("esperava 1 mensagem em Unapplied para Renderer, veio %v", unapplied)
	}

	out, _ := os.ReadFile(path)
	if containsLine(string(out), "Renderer = ") && !containsLine(string(out), "StartFullscreen") {
		t.Fatalf("não deveria ter inventado uma chave Renderer: %s", out)
	}
}

func containsLine(text, substr string) bool {
	for _, line := range strings.Split(text, "\n") {
		if line == substr {
			return true
		}
	}
	return false
}
