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
	// AppData isola no Windows — sem isso, os.UserConfigDir() ignora
	// XDG_CONFIG_HOME e promote()/Uninstall() mexem na instalação real de
	// emuladores de quem roda a suíte (achado de 2026-09-11, docs/decisoes.md:
	// foi assim que TestPromoteSingleConsoleAdapterGoesInsideConsoleFolder
	// apagou o DuckStation de verdade do Douglas).
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)
	t.Setenv("AppData", configHome)

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
	// AppData isola no Windows — sem isso, os.UserConfigDir() ignora
	// XDG_CONFIG_HOME e promote()/Uninstall() mexem na instalação real de
	// emuladores de quem roda a suíte (achado de 2026-09-11, docs/decisoes.md:
	// foi assim que TestPromoteSingleConsoleAdapterGoesInsideConsoleFolder
	// apagou o DuckStation de verdade do Douglas).
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)
	t.Setenv("AppData", configHome)

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
	// AppData isola no Windows — sem isso, os.UserConfigDir() ignora
	// XDG_CONFIG_HOME e promote()/Uninstall() mexem na instalação real de
	// emuladores de quem roda a suíte (achado de 2026-09-11, docs/decisoes.md:
	// foi assim que TestPromoteSingleConsoleAdapterGoesInsideConsoleFolder
	// apagou o DuckStation de verdade do Douglas).
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)
	t.Setenv("AppData", configHome)

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

	// O binário sai do mesmo lugar onde promote o pôs. A pasta fica, com só
	// os dados do usuário (2026-10-05: em modo portátil o desinstalador
	// nunca apaga config, cartões, states nem BIOS).
	root, _ := emulator.ManagedRoot()
	dir := filepath.Join(root, "ps1", "emuladores", "duckstation")
	if _, err := os.Stat(filepath.Join(dir, "duckstation-qt")); !os.IsNotExist(err) {
		t.Errorf("esperava o binário removido de %s, stat = %v", dir, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "settings.ini")); err != nil {
		t.Errorf("a configuração do usuário deveria ter ficado: %v", err)
	}
}

// Trava a regra do desinstalador em modo portátil: cartões, states, BIOS e
// config do PCSX2 ficam; o programa sai.
func TestRemoveKeepingUserDataPCSX2(t *testing.T) {
	dir := t.TempDir()
	for _, rel := range []string{"portable.ini", "pcsx2-qt.exe", "inis/PCSX2.ini", "memcards/Mcd001.ps2", "sstates/a.p2s", "bios/x.bin", "resources/r.dat", "logs/emulog.txt"} {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		os.MkdirAll(filepath.Dir(p), 0o755)
		os.WriteFile(p, []byte("x"), 0o644)
	}
	if _, err := removeKeepingUserData(dir, "pcsx2"); err != nil {
		t.Fatal(err)
	}
	for _, kept := range []string{"inis/PCSX2.ini", "memcards/Mcd001.ps2", "sstates/a.p2s", "bios/x.bin", "portable.ini"} {
		if _, err := os.Stat(filepath.Join(dir, filepath.FromSlash(kept))); err != nil {
			t.Errorf("%s deveria ter ficado: %v", kept, err)
		}
	}
	for _, gone := range []string{"pcsx2-qt.exe", "resources", "logs"} {
		if _, err := os.Stat(filepath.Join(dir, gone)); !os.IsNotExist(err) {
			t.Errorf("%s deveria ter saído", gone)
		}
	}
}

// Desde o ADR 0015 (R4), o RetroArch é KindManual — Uninstall não tem mais
// um guard próprio para ele. Sem nenhuma instalação gerenciada no disco (o
// caso normal: o RetroArch é instalado manualmente pelo usuário), a recusa
// vem do mesmo caminho de qualquer outro emulador nunca instalado pelo ZeuX.
func TestUninstallRetroArchWithoutManagedInstallSaysNothingToRemove(t *testing.T) {
	// AppData isola no Windows — sem isso, os.UserConfigDir() ignora
	// XDG_CONFIG_HOME e promote()/Uninstall() mexem na instalação real de
	// emuladores de quem roda a suíte (achado de 2026-09-11, docs/decisoes.md:
	// foi assim que TestPromoteSingleConsoleAdapterGoesInsideConsoleFolder
	// apagou o DuckStation de verdade do Douglas).
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)
	t.Setenv("AppData", configHome)

	manager := NewManager(mustCatalog(t), discardLogger())

	err := manager.Uninstall("retroarch")
	if err == nil {
		t.Fatal("esperava recusa: nada gerenciado para remover")
	}
	if !strings.Contains(err.Error(), "não instalou este emulador") {
		t.Errorf("mensagem deveria dizer que o ZeuX não instalou este emulador: %v", err)
	}
}
