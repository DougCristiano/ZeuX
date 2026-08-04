package emulator

import (
	"os"
	"path/filepath"
	"testing"
)

// Sem ZEUX_BUNDLED_CORES_DIR (build local de desenvolvimento, fora do
// Tauri), a função não pode fazer nada nem falhar.
func TestEnsureBundledCoresAvailableNoopsWithoutEnvVar(t *testing.T) {
	t.Setenv("ZEUX_BUNDLED_CORES_DIR", "")

	if err := ensureBundledCoresAvailable(); err != nil {
		t.Fatalf("esperava nil sem a env var, veio %v", err)
	}
}

// Regra central, achada quebrada em produção em 2026-08-04: o valor de
// ZEUX_BUNDLED_CORES_DIR (que src-tauri/src/lib.rs seta) já É o caminho até
// a pasta de cores — esta função não pode acrescentar "retroarch/cores" de
// novo em cima, senão procura um diretório que nunca existe e nenhum core
// é copiado (o daemon logava aviso e seguia, então o bug ficava invisível
// até alguém lançar um jogo de verdade).
func TestEnsureBundledCoresAvailableReadsDirectlyFromEnvVarWithoutExtraJoin(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	bundledDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(bundledDir, "sameboy_libretro.so"), []byte("fake core"), 0o644); err != nil {
		t.Fatalf("preparando core bundled falso: %v", err)
	}
	t.Setenv("ZEUX_BUNDLED_CORES_DIR", bundledDir)

	if err := ensureBundledCoresAvailable(); err != nil {
		t.Fatalf("ensureBundledCoresAvailable: %v", err)
	}

	userCoresDir := bundledCoreDirsForWrite()[0]
	if _, err := os.Stat(filepath.Join(userCoresDir, "sameboy_libretro.so")); err != nil {
		t.Fatalf("esperava o core copiado para %s: %v", userCoresDir, err)
	}
}

// Idempotência: chamar duas vezes não deve falhar nem duplicar trabalho.
func TestEnsureBundledCoresAvailableIsIdempotent(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	bundledDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(bundledDir, "gambatte_libretro.so"), []byte("fake core"), 0o644); err != nil {
		t.Fatalf("preparando core bundled falso: %v", err)
	}
	t.Setenv("ZEUX_BUNDLED_CORES_DIR", bundledDir)

	if err := ensureBundledCoresAvailable(); err != nil {
		t.Fatalf("primeira chamada: %v", err)
	}
	if err := ensureBundledCoresAvailable(); err != nil {
		t.Fatalf("segunda chamada (deveria ser idempotente): %v", err)
	}
}
