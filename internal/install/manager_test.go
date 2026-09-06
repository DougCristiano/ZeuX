package install

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/doufl/zeux/internal/emulator"
)

// promote precisa colocar um emulador de console único dentro da pasta do
// console dele (<root>/<console>/emuladores/<adapter>) — a estrutura por
// console decidida em 2026-08-02, não mais um diretório achatado por
// adapter. A prova real é a descoberta (findBinary, via Locate) achar
// sozinha o que acabou de ser promovido.
func TestPromoteSingleConsoleAdapterGoesInsideConsoleFolder(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	staging := t.TempDir()
	if err := os.WriteFile(filepath.Join(staging, "duckstation-qt"), []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}

	manager := NewManager(mustCatalog(t), discardLogger())
	if err := manager.promote(staging, "duckstation"); err != nil {
		t.Fatalf("promote: %v", err)
	}

	root, err := emulator.ManagedRoot()
	if err != nil {
		t.Fatal(err)
	}
	wantDir := filepath.Join(root, "ps1", "emuladores", "duckstation")
	if _, err := os.Stat(filepath.Join(wantDir, "duckstation-qt")); err != nil {
		t.Fatalf("binário não está em %s: %v", wantDir, err)
	}

	adapter, ok := emulator.NewRegistry().ByID("duckstation")
	if !ok {
		t.Fatal("adapter duckstation não registrado")
	}
	installation, found := adapter.Locate(context.Background())
	if !found {
		t.Fatal("a descoberta não achou o DuckStation promovido")
	}
	if !installation.Managed {
		t.Error("deveria estar marcado como managed")
	}
}

// Dolphin atende dois consoles (gamecube, wii) — não tem "o console dele" e
// precisa cair na pasta compartilhada, não duplicado em nenhum dos dois.
func TestPromoteMultiConsoleAdapterGoesToSharedFolder(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	staging := t.TempDir()
	if err := os.WriteFile(filepath.Join(staging, "dolphin-emu"), []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}

	manager := NewManager(mustCatalog(t), discardLogger())
	if err := manager.promote(staging, "dolphin"); err != nil {
		t.Fatalf("promote: %v", err)
	}

	root, err := emulator.ManagedRoot()
	if err != nil {
		t.Fatal(err)
	}
	wantDir := filepath.Join(root, emulator.SharedDirName, "dolphin")
	if _, err := os.Stat(filepath.Join(wantDir, "dolphin-emu")); err != nil {
		t.Fatalf("binário não está em %s: %v", wantDir, err)
	}

	for _, console := range []string{"gamecube", "wii"} {
		if _, err := os.Stat(filepath.Join(root, console)); err == nil {
			t.Errorf("não deveria existir pasta de console %q para um adapter compartilhado", console)
		}
	}
}

// Uninstall precisa apagar do mesmo lugar onde promote colocou — travando a
// simetria entre os dois, já que cada um resolve o caminho de forma
// independente (managedDirFor).
func TestUninstallRemovesFromTheSameFolderPromoteUsed(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	staging := t.TempDir()
	if err := os.WriteFile(filepath.Join(staging, "duckstation-qt"), []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}

	manager := NewManager(mustCatalog(t), discardLogger())
	if err := manager.promote(staging, "duckstation"); err != nil {
		t.Fatalf("promote: %v", err)
	}
	if err := manager.Uninstall("duckstation"); err != nil {
		t.Fatalf("Uninstall: %v", err)
	}

	root, _ := emulator.ManagedRoot()
	dir := filepath.Join(root, "ps1", "emuladores", "duckstation")
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Errorf("esperava %s removido, stat = %v", dir, err)
	}
}

// Desde o ADR 0015 (R4), o RetroArch é KindManual — Uninstall não tem mais
// um guard próprio para ele. Sem nenhuma instalação gerenciada no disco (o
// caso normal: o RetroArch é instalado manualmente pelo usuário), a recusa
// vem do mesmo caminho de qualquer outro emulador nunca instalado pelo ZeuX.
func TestUninstallRetroArchWithoutManagedInstallSaysNothingToRemove(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	manager := NewManager(mustCatalog(t), discardLogger())

	err := manager.Uninstall("retroarch")
	if err == nil {
		t.Fatal("esperava recusa: nada gerenciado para remover")
	}
	if !strings.Contains(err.Error(), "não instalou este emulador") {
		t.Errorf("mensagem deveria dizer que o ZeuX não instalou este emulador: %v", err)
	}
}
