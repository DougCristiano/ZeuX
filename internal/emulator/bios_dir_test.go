package emulator

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// DuckStation só recebe a pasta de BIOS quando foi o ZeuX quem instalou —
// uma instalação alheia do usuário pode não estar em modo portátil, e
// presumir a convenção erraria o palpite.
func TestBiosDirDuckStationOnlyWhenManaged(t *testing.T) {
	installDir := t.TempDir()
	binPath := filepath.Join(installDir, "DuckStation-x64.AppImage")

	managed := Installation{BinaryPath: binPath, Managed: true}
	dir, ok := BiosDir("duckstation", managed)
	if !ok {
		t.Fatal("esperava BiosDir para DuckStation managed")
	}
	want := filepath.Join(installDir, "bios")
	if dir != want {
		t.Errorf("BiosDir = %q, queria %q", dir, want)
	}
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		t.Errorf("BiosDir deveria ter criado a pasta: %v", err)
	}

	unmanaged := Installation{BinaryPath: "/usr/bin/duckstation-qt", Managed: false}
	if _, ok := BiosDir("duckstation", unmanaged); ok {
		t.Error("não deveria ter BiosDir para instalação não gerenciada pelo ZeuX")
	}
}

// PCSX2 (achado real em 2026-08-04): mesmo com portable.txt presente, o
// binário real não entra em modo portátil — sempre usa o diretório global do
// sistema, independente de Managed. Só verificado no Linux.
func TestBiosDirPCSX2UsesGlobalDirRegardlessOfManaged(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("BiosDir de pcsx2 só verificado no Linux")
	}

	// Isola XDG_CONFIG_HOME: sem isso, BiosDir criaria de verdade
	// ~/.config/PCSX2/bios na máquina de quem roda o teste.
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	for _, managed := range []bool{true, false} {
		install := Installation{BinaryPath: "/anywhere/pcsx2.AppImage", Managed: managed}
		dir, ok := BiosDir("pcsx2", install)
		if !ok {
			t.Fatalf("esperava BiosDir para pcsx2 (managed=%v)", managed)
		}
		if filepath.Base(filepath.Dir(dir)) != "PCSX2" || filepath.Base(dir) != "bios" {
			t.Errorf("BiosDir = %q, esperava terminar em .../PCSX2/bios", dir)
		}
		if info, err := os.Stat(dir); err != nil || !info.IsDir() {
			t.Errorf("BiosDir deveria ter criado a pasta: %v", err)
		}
	}
}

// RPCS3 não usa pasta nenhuma — o firmware é instalado pelo próprio RPCS3
// via diálogo de arquivo (main_window::InstallPup). Nenhum adapter fora dos
// dois verificados deve devolver um caminho.
func TestBiosDirUnknownForEverythingElse(t *testing.T) {
	for _, id := range []string{"rpcs3", "vita3k", "flycast", "xemu", "retroarch"} {
		if _, ok := BiosDir(id, Installation{BinaryPath: "/x", Managed: true}); ok {
			t.Errorf("%s não deveria ter BiosDir verificado", id)
		}
	}
}
