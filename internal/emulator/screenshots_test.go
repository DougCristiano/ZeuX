package emulator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeShot(t *testing.T, path string, mod time.Time) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, mod, mod); err != nil {
		t.Fatal(err)
	}
}

// Trava a regra da coleta: só entram imagens gravadas durante a sessão
// (print antigo de outro jogo não pode ser movido para esta galeria), e a
// subpasta por jogo do PCSX2 só é visitada quando `nested`.
func TestNewScreenshotsSinceFiltersByTimeAndDepth(t *testing.T) {
	dir := t.TempDir()
	start := time.Now().Add(-time.Minute)
	writeShot(t, filepath.Join(dir, "velho.png"), start.Add(-time.Hour))
	writeShot(t, filepath.Join(dir, "novo.png"), start.Add(10*time.Second))
	writeShot(t, filepath.Join(dir, "log.txt"), start.Add(10*time.Second))
	writeShot(t, filepath.Join(dir, "Jogo", "sub.png"), start.Add(10*time.Second))
	writeShot(t, filepath.Join(dir, "Jogo", "fundo", "deep.png"), start.Add(10*time.Second))

	flat := newScreenshotsSince([]string{dir}, false, start)
	if len(flat) != 1 || filepath.Base(flat[0]) != "novo.png" {
		t.Fatalf("sem nested: %v", flat)
	}
	nested := newScreenshotsSince([]string{dir}, true, start)
	if len(nested) != 2 {
		t.Fatalf("com nested esperava novo.png e sub.png, veio %v", nested)
	}
}

// Trava que um print com nome repetido nunca sobrescreve o que já está na
// galeria — a coleta move, então sobrescrever seria perder a imagem.
func TestUniquePathNeverOverwrites(t *testing.T) {
	dir := t.TempDir()
	writeShot(t, filepath.Join(dir, "a.png"), time.Now())
	writeShot(t, filepath.Join(dir, "a (2).png"), time.Now())
	if got := filepath.Base(uniquePath(dir, "a.png")); got != "a (3).png" {
		t.Fatalf("uniquePath = %q", got)
	}
}

// Trava que o nome vindo da API não escapa da pasta da galeria.
func TestValidScreenshotNameRejectsPaths(t *testing.T) {
	for _, bad := range []string{"", "..", "../x.png", `..\x.png`, "a/b.png", "x.exe", "."} {
		if ValidScreenshotName(bad) {
			t.Errorf("%q deveria ser recusado", bad)
		}
	}
	if !ValidScreenshotName("Crash (USA) 2026.png") {
		t.Error("nome comum de print deveria valer")
	}
}

// Trava que a pasta da galeria é válida no Windows mesmo com ROM de nome
// estranho, e que a extensão sai (o mesmo jogo em .cue ou .chd é o mesmo
// nome de pasta só quando a pessoa troca o arquivo pelo mesmo título).
func TestGameScreenshotsSubdirSanitizes(t *testing.T) {
	got := GameScreenshotsSubdir("ps1", filepath.Join("roms", `Jogo: Parte?.cue`))
	if got != filepath.Join("ps1", "Jogo_ Parte_") {
		t.Fatalf("subdir = %q", got)
	}
}

// Trava que o ZeuX só aponta a pasta de prints do RetroArch quando ela está
// no padrão (que grava junto da ROM) — caminho escolhido pela pessoa vale.
func TestEnsureRetroArchScreenshotDirRespectsUserChoice(t *testing.T) {
	cfgHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", cfgHome)
	t.Setenv("AppData", cfgHome)

	installDir := t.TempDir()
	install := Installation{AdapterID: "retroarch", BinaryPath: filepath.Join(installDir, "retroarch.exe")}
	cfgPath, err := retroArchConfigPath(install)
	if err != nil {
		t.Skipf("retroArchConfigPath indisponível nesta plataforma: %v", err)
	}
	writeCfg := func(content string) {
		if err := os.MkdirAll(filepath.Dir(cfgPath), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(cfgPath, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	writeCfg("screenshot_directory = \"default\"\nvideo_fullscreen = \"false\"\n")
	if err := ensureRetroArchScreenshotDir(install); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(cfgPath)
	inbox, _ := RetroArchScreenshotInbox()
	if v, _ := parseRetroArchCfg(raw).get("screenshot_directory"); v != inbox {
		t.Fatalf("screenshot_directory = %q, esperado %q", v, inbox)
	}
	if !strings.Contains(string(raw), "video_fullscreen") {
		t.Fatal("as outras chaves do retroarch.cfg deveriam continuar")
	}

	writeCfg("screenshot_directory = \"D:\\\\Prints\"\n")
	if err := ensureRetroArchScreenshotDir(install); err != nil {
		t.Fatal(err)
	}
	raw, _ = os.ReadFile(cfgPath)
	if v, _ := parseRetroArchCfg(raw).get("screenshot_directory"); v == inbox {
		t.Fatal("pasta escolhida pelo usuário não pode ser trocada")
	}
}
