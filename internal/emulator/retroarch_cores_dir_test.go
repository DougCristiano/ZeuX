package emulator

import (
	"os"
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

// Achado real (2026-09-06, relato do Douglas): um core baixado/instalado
// pelo próprio RetroArch (não pelo ZeuX) roda de verdade dentro do
// RetroArch, mas o ZeuX o reportava como "não instalado" — coreDirs()
// nunca olhava %APPDATA%\RetroArch\cores, só a pasta gerida pelo ZeuX e a
// pasta ao lado do executável (válida só no modo "portable" do RetroArch).
// Este teste trava que locateCore() acha um core colocado exatamente onde
// o instalador padrão do RetroArch no Windows o grava.
func TestLocateCoreFindsWindowsAppDataInstall(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("caminho %APPDATA%\\RetroArch\\cores só existe no Windows")
	}

	appData := t.TempDir()
	t.Setenv("APPDATA", appData)
	t.Setenv("HOME", t.TempDir())

	coreDir := filepath.Join(appData, "RetroArch", "cores")
	if err := os.MkdirAll(coreDir, 0o755); err != nil {
		t.Fatalf("preparando diretório de teste: %v", err)
	}
	corePath := filepath.Join(coreDir, retroArchCores["mesen"]+coreExtension())
	if err := os.WriteFile(corePath, []byte("core de mentira"), 0o644); err != nil {
		t.Fatalf("escrevendo core de teste: %v", err)
	}

	got, ok := locateCore(filepath.Join(t.TempDir(), "retroarch.exe"), "mesen")
	if !ok {
		t.Fatal("locateCore não achou o core em %APPDATA%\\RetroArch\\cores")
	}
	if got != corePath {
		t.Errorf("locateCore() = %q, esperava %q", got, corePath)
	}
}
