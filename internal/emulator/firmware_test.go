package emulator

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// rpcs3TestInstall prepara um "RPCS3" e devolve a pasta de configuração que o
// ZeuX deve consultar nesta plataforma — a do executável no Windows, o
// XDG_CONFIG_HOME apontado para um temporário no resto.
func rpcs3TestInstall(t *testing.T) (Installation, string) {
	t.Helper()
	exeDir := t.TempDir()
	install := Installation{BinaryPath: filepath.Join(exeDir, "rpcs3.exe")}
	if runtime.GOOS == "windows" {
		t.Setenv("RPCS3_CONFIG_DIR", "")
		return install, exeDir
	}
	xdg := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", xdg)
	if runtime.GOOS == "darwin" {
		t.Skip("macOS usa ~/Library/Application Support — não isolável por variável de ambiente neste teste")
	}
	return install, filepath.Join(xdg, "rpcs3")
}

// Trava a prova de firmware instalado: é o mesmo arquivo que o RPCS3 exige
// antes de bootar um jogo. Sem ele, "faltando" — com certeza, não palpite.
func TestFirmwareInstalledFollowsRPCS3Proof(t *testing.T) {
	install, configDir := rpcs3TestInstall(t)

	installed, known := FirmwareInstalled("rpcs3", install)
	if !known || installed {
		t.Fatalf("sem dev_flash: installed=%v known=%v, esperado false/true", installed, known)
	}

	lib := filepath.Join(configDir, "dev_flash", "sys", "external", "liblv2.sprx")
	if err := os.MkdirAll(filepath.Dir(lib), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(lib, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	installed, known = FirmwareInstalled("rpcs3", install)
	if !known || !installed {
		t.Fatalf("com liblv2.sprx: installed=%v known=%v, esperado true/true", installed, known)
	}
}

// Um dev_flash fora do padrão (vfs.yml do usuário) vira "não sei", nunca
// "faltando": o firmware pode estar lá e o ZeuX não saberia onde olhar.
func TestFirmwareUnknownWithCustomDevFlash(t *testing.T) {
	install, configDir := rpcs3TestInstall(t)
	vfsDir := configDir
	if runtime.GOOS == "windows" {
		vfsDir = filepath.Join(configDir, "config")
	}
	if err := os.MkdirAll(vfsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(vfsDir, "vfs.yml"), []byte("/dev_flash/: D:/ps3/dev_flash/\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, known := FirmwareInstalled("rpcs3", install); known {
		t.Fatal("dev_flash personalizado deveria dar known=false")
	}
}

// Só o RPCS3 tem firmware instalável pelo ZeuX; os outros ficam de fora da
// verificação, sem inventar resposta.
func TestFirmwareOnlyForRPCS3(t *testing.T) {
	if _, known := FirmwareInstalled("pcsx2", Installation{BinaryPath: "/x/pcsx2"}); known {
		t.Fatal("pcsx2 não deveria ter firmware verificável")
	}
	if FirmwareInstallable("dolphin") || !FirmwareInstallable("rpcs3") {
		t.Fatal("FirmwareInstallable deveria valer só para rpcs3")
	}
}
