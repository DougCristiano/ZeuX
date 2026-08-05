package emulator

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// Sem ZEUX_BUNDLED_RETROARCH_DIR (build local de desenvolvimento, fora do
// Tauri), a função não pode fazer nada nem falhar — cores/binário bundled
// simplesmente não existem neste ambiente.
func TestEnsureBundledRetroArchAvailableNoopsWithoutEnvVar(t *testing.T) {
	t.Setenv("ZEUX_BUNDLED_RETROARCH_DIR", "")

	if err := EnsureBundledRetroArchAvailable(); err != nil {
		t.Fatalf("esperava nil sem a env var, veio %v", err)
	}
}

// testBundledFileName imita o que cmd/download-retroarch-app realmente
// deixa em disco por SO: no Linux/macOS um único .AppImage autocontido, no
// Windows retroarch.exe (aqui sozinho; a cópia real também traz DLLs, mas
// isso não muda a regra testada — Locate() só depende de achar um nome
// esperado ou o único *.AppImage do diretório).
func testBundledFileName() string {
	if runtime.GOOS == "windows" {
		return "retroarch.exe"
	}
	return "retroarch-linux-x86_64.AppImage"
}

// Regra central: o que cmd/download-retroarch-app deixou em
// $ZEUX_BUNDLED_RETROARCH_DIR precisa acabar no mesmo diretório gerenciado
// que uma instalação 1-click usaria, executável, para que
// retroArchAdapter.Locate() (via findBinary) o encontre sem nenhuma mudança
// na lógica de busca.
func TestEnsureBundledRetroArchAvailableCopiesToManagedDirAndMakesExecutable(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	bundledDir := t.TempDir()
	fileName := testBundledFileName()
	if err := os.WriteFile(filepath.Join(bundledDir, fileName), []byte("fake retroarch"), 0o644); err != nil {
		t.Fatalf("preparando arquivo bundled falso: %v", err)
	}
	t.Setenv("ZEUX_BUNDLED_RETROARCH_DIR", bundledDir)

	if err := EnsureBundledRetroArchAvailable(); err != nil {
		t.Fatalf("EnsureBundledRetroArchAvailable: %v", err)
	}

	root, err := ManagedRoot()
	if err != nil {
		t.Fatalf("ManagedRoot: %v", err)
	}
	managedDir := ManagedEmulatorDir(root, "retroarch", (retroArchAdapter{}).Consoles())
	copied := filepath.Join(managedDir, fileName)

	info, err := os.Stat(copied)
	if err != nil {
		t.Fatalf("esperava o arquivo copiado em %s: %v", copied, err)
	}

	if runtime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0 {
		t.Errorf("arquivo copiado não está marcado como executável: %v", info.Mode())
	}

	// Locate() precisa achar o RetroArch bundled sem nenhuma mudança na
	// própria lógica de busca — é essa integração que faz a tela de
	// emuladores parar de mostrar "não instalado". No Linux isto exercita o
	// caminho de detecção de *.AppImage único que findBinary já tinha
	// (discovery.go); no Windows, o nome exato "retroarch.exe".
	install, ok := retroArchAdapter{}.Locate(context.Background())
	if !ok {
		t.Fatal("Locate() não encontrou o RetroArch bundled")
	}
	if !install.Managed {
		t.Error("Locate() deveria marcar o RetroArch bundled como Managed (veio do diretório gerenciado do ZeuX)")
	}
}

// Windows precisa de retroarch.exe MAIS as DLLs ao lado — todo arquivo que
// cmd/download-retroarch-app deixou no diretório bundled precisa ser
// copiado, não só o executável.
func TestEnsureBundledRetroArchAvailableCopiesEveryFileInBundledDir(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	bundledDir := t.TempDir()
	files := []string{testBundledFileName(), "libexemplo.dll", "outrolib.dll"}
	for _, name := range files {
		if err := os.WriteFile(filepath.Join(bundledDir, name), []byte("conteudo"), 0o644); err != nil {
			t.Fatalf("preparando %s: %v", name, err)
		}
	}
	t.Setenv("ZEUX_BUNDLED_RETROARCH_DIR", bundledDir)

	if err := EnsureBundledRetroArchAvailable(); err != nil {
		t.Fatalf("EnsureBundledRetroArchAvailable: %v", err)
	}

	root, _ := ManagedRoot()
	managedDir := ManagedEmulatorDir(root, "retroarch", (retroArchAdapter{}).Consoles())

	for _, name := range files {
		if _, err := os.Stat(filepath.Join(managedDir, name)); err != nil {
			t.Errorf("esperava %s copiado para o diretório gerenciado: %v", name, err)
		}
	}
}

// Trava o bug real achado em 2026-08-05: um checkout limpo de
// src-tauri/resources/retroarch/bin sempre tem o .gitkeep que versiona a
// pasta vazia (ver .gitignore) — um diretório bundled com só .gitkeep
// precisa contar como vazio (erro), nunca como "já tem o RetroArch".
func TestEnsureBundledRetroArchAvailableTreatsOnlyGitkeepAsEmpty(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	bundledDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(bundledDir, ".gitkeep"), nil, 0o644); err != nil {
		t.Fatalf("preparando .gitkeep: %v", err)
	}
	t.Setenv("ZEUX_BUNDLED_RETROARCH_DIR", bundledDir)

	if err := EnsureBundledRetroArchAvailable(); err == nil {
		t.Fatal("esperava erro com o diretório bundled contendo só .gitkeep, veio nil")
	}
}

// Mesmo bug, do lado da cópia: um .gitkeep ao lado do RetroArch de verdade
// (caso real — cmd/download-retroarch-app grava no mesmo diretório que o
// .gitkeep versiona) não pode ser copiado para o diretório gerenciado.
func TestEnsureBundledRetroArchAvailableSkipsGitkeep(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	bundledDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(bundledDir, ".gitkeep"), nil, 0o644); err != nil {
		t.Fatalf("preparando .gitkeep: %v", err)
	}
	if err := os.WriteFile(filepath.Join(bundledDir, testBundledFileName()), []byte("fake retroarch"), 0o644); err != nil {
		t.Fatalf("preparando arquivo bundled falso: %v", err)
	}
	t.Setenv("ZEUX_BUNDLED_RETROARCH_DIR", bundledDir)

	if err := EnsureBundledRetroArchAvailable(); err != nil {
		t.Fatalf("EnsureBundledRetroArchAvailable: %v", err)
	}

	root, _ := ManagedRoot()
	managedDir := ManagedEmulatorDir(root, "retroarch", (retroArchAdapter{}).Consoles())

	if _, err := os.Stat(filepath.Join(managedDir, ".gitkeep")); err == nil {
		t.Error(".gitkeep não deveria ter sido copiado para o diretório gerenciado")
	}
	if _, err := os.Stat(filepath.Join(managedDir, testBundledFileName())); err != nil {
		t.Errorf("esperava o RetroArch de verdade copiado: %v", err)
	}
}

// Idempotência: chamar duas vezes não deve falhar nem duplicar trabalho —
// mesmo padrão exigido de ensureBundledCoresAvailable.
func TestEnsureBundledRetroArchAvailableIsIdempotent(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	bundledDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(bundledDir, testBundledFileName()), []byte("fake retroarch"), 0o644); err != nil {
		t.Fatalf("preparando arquivo bundled falso: %v", err)
	}
	t.Setenv("ZEUX_BUNDLED_RETROARCH_DIR", bundledDir)

	if err := EnsureBundledRetroArchAvailable(); err != nil {
		t.Fatalf("primeira chamada: %v", err)
	}
	if err := EnsureBundledRetroArchAvailable(); err != nil {
		t.Fatalf("segunda chamada (deveria ser idempotente): %v", err)
	}
}
