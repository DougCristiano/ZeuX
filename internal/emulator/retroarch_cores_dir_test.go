package emulator

import (
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// RetroArchManagedCoresDir precisa apontar para o mesmo lugar que coreDirs()
// confere primeiro (bundledCoreDirs(), retroarch.go) — é o que garante que um
// core baixado sob demanda (R2) seja achado sem precisar ensinar a busca a
// olhar num segundo diretório.
func TestRetroArchManagedCoresDirMatchesFirstCoreSearchPath(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))

	got, err := RetroArchManagedCoresDir()
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if got == "" {
		t.Fatal("diretório vazio")
	}

	want := bundledCoreDirs()[0]
	if got != want {
		t.Errorf("RetroArchManagedCoresDir() = %q, esperava bater com o primeiro diretório de coreDirs() (%q)", got, want)
	}

	// No Linux/macOS, sob $HOME de teste; no Windows, sob %APPDATA%.
	if runtime.GOOS != "windows" && !strings.HasPrefix(got, home) {
		t.Errorf("esperava %q dentro de %q", got, home)
	}
}
