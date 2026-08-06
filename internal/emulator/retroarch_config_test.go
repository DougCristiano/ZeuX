package emulator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRetroArchSatisfiesConfigurableAdapter(t *testing.T) {
	if _, ok := newRetroArch().(ConfigurableAdapter); !ok {
		t.Fatal("newRetroArch() deveria satisfazer ConfigurableAdapter")
	}
}

func TestRetroArchReadConfigParsesKnownKeys(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "retroarch.cfg")
	raw := "video_driver = \"gl\"\nvideo_fullscreen = \"true\"\naudio_driver = \"pulse\"\n"
	if err := os.WriteFile(path, []byte(raw), 0o644); err != nil {
		t.Fatal(err)
	}

	opts, err := retroArchReadConfig(path)
	if err != nil {
		t.Fatalf("retroArchReadConfig: %v", err)
	}
	if opts.Fullscreen == nil || !*opts.Fullscreen {
		t.Fatalf("Fullscreen = %v, esperado true", opts.Fullscreen)
	}
	if opts.Renderer == nil || *opts.Renderer != RendererOpenGL {
		t.Fatalf("Renderer = %v, esperado RendererOpenGL", opts.Renderer)
	}
	if opts.InternalScale != nil {
		t.Fatalf("InternalScale deveria ficar nil (video_scale não é o mesmo conceito), veio %v", *opts.InternalScale)
	}
}

// Driver desconhecido (ex.: "d3d12", que não mapeamos) não vira um Renderer
// inventado — fica ausente.
func TestRetroArchReadConfigUnmappedDriverStaysNil(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "retroarch.cfg")
	if err := os.WriteFile(path, []byte("video_driver = \"d3d12\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	opts, err := retroArchReadConfig(path)
	if err != nil {
		t.Fatalf("retroArchReadConfig: %v", err)
	}
	if opts.Renderer != nil {
		t.Fatalf("driver não mapeado deveria ficar nil, veio %v", *opts.Renderer)
	}
}

// Trava preservação byte a byte num retroarch.cfg realista (centenas de
// chaves) — só video_fullscreen muda.
func TestRetroArchWriteConfigPreservesUnknownKeys(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "retroarch.cfg")
	raw := `accessibility_enable = "false"
audio_driver = "pulse"
audio_out_rate = "48000"
video_driver = "gl"
video_fullscreen = "false"
video_scale = "3"
`
	if err := os.WriteFile(path, []byte(raw), 0o644); err != nil {
		t.Fatal(err)
	}

	unapplied, err := retroArchWriteConfig(path, Options{Fullscreen: true})
	if err != nil {
		t.Fatalf("retroArchWriteConfig: %v", err)
	}
	if len(unapplied) != 0 {
		t.Fatalf("não esperava Unapplied só para Fullscreen, veio %v", unapplied)
	}

	out, _ := os.ReadFile(path)
	got := string(out)
	for _, untouched := range []string{
		`accessibility_enable = "false"`,
		`audio_driver = "pulse"`,
		`audio_out_rate = "48000"`,
		`video_driver = "gl"`,
		`video_scale = "3"`,
	} {
		if !strings.Contains(got, untouched) {
			t.Errorf("chave não tocada foi alterada: esperava %q em:\n%s", untouched, got)
		}
	}
	if !strings.Contains(got, `video_fullscreen = "true"`) {
		t.Errorf("video_fullscreen não foi atualizado: %s", got)
	}
}

// Renderer sem mapeamento confirmado (D3D12) vai para Unapplied, nunca
// escrito como um video_driver adivinhado.
func TestRetroArchWriteConfigUnmappedRendererGoesToUnapplied(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "retroarch.cfg")
	if err := os.WriteFile(path, []byte("video_fullscreen = \"false\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	unapplied, err := retroArchWriteConfig(path, Options{Renderer: RendererD3D12})
	if err != nil {
		t.Fatalf("retroArchWriteConfig: %v", err)
	}
	if len(unapplied) != 1 {
		t.Fatalf("esperava 1 mensagem em Unapplied, veio %v", unapplied)
	}
}

// Backup/restore, exercitado pelo Adapter de verdade (não só as funções
// puras) — path resolvido via a var de teste.
func TestRetroArchConfigurableAdapterWriteAndRestore(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "retroarch.cfg")
	original := "video_fullscreen = \"false\"\naudio_driver = \"pulse\"\n"
	if err := os.WriteFile(path, []byte(original), 0o644); err != nil {
		t.Fatal(err)
	}

	orig := retroArchConfigPath
	retroArchConfigPath = func(Installation) (string, error) { return path, nil }
	defer func() { retroArchConfigPath = orig }()

	adapter := newRetroArch().(ConfigurableAdapter)

	if _, err := adapter.WriteConfig(Installation{}, Options{Fullscreen: true}); err != nil {
		t.Fatalf("WriteConfig: %v", err)
	}
	after, _ := os.ReadFile(path)
	if !strings.Contains(string(after), `video_fullscreen = "true"`) {
		t.Fatalf("WriteConfig não aplicou Fullscreen: %s", after)
	}

	if err := adapter.RestoreConfig(Installation{}); err != nil {
		t.Fatalf("RestoreConfig: %v", err)
	}
	restored, _ := os.ReadFile(path)
	if string(restored) != original {
		t.Fatalf("RestoreConfig não devolveu o conteúdo original:\nquer: %q\nveio: %q", original, string(restored))
	}
}

// RestoreConfig sem nenhum WriteConfig anterior é um erro claro, não um
// sucesso silencioso.
func TestRestoreConfigWithoutPriorWriteFails(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "retroarch.cfg")

	orig := retroArchConfigPath
	retroArchConfigPath = func(Installation) (string, error) { return path, nil }
	defer func() { retroArchConfigPath = orig }()

	adapter := newRetroArch().(ConfigurableAdapter)
	if err := adapter.RestoreConfig(Installation{}); err == nil {
		t.Fatal("RestoreConfig sem backup deveria falhar, não ter sucesso silencioso")
	}
}
