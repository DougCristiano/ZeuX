package emulator

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
)

// ensureBundledCoresAvailable copia cores bundled do instalador para o
// diretório de dados do usuário na primeira execução (ADR 0012).
//
// Tauri seta ZEUX_BUNDLED_CORES_DIR para o caminho do diretório de recursos
// que contém cores. Se a variável não existir, ignora silenciosamente (cores
// bundled podem não estar disponíveis, ex.: build local do desenvolvedor).
//
// Comportamento:
// - Lê cores de $ZEUX_BUNDLED_CORES_DIR/retroarch/cores/
// - Copia para ~/.local/share/zeux/retroarch/cores (Linux), etc
// - Idempotente: se arquivo já existe, não copia duas vezes
// - Erros de cópia são registrados mas não bloqueiam o daemon
func ensureBundledCoresAvailable() error {
	bundledDir := os.Getenv("ZEUX_BUNDLED_CORES_DIR")
	if bundledDir == "" {
		// Cores bundled não estão disponíveis neste ambiente.
		return nil
	}

	bundledCoresPath := filepath.Join(bundledDir, "retroarch", "cores")
	userCoresDir := bundledCoreDirsForWrite()[0]

	// Criar diretório de destino se não existir
	if err := os.MkdirAll(userCoresDir, 0755); err != nil {
		return fmt.Errorf("não consegui criar diretório de cores bundled (%s): %w", userCoresDir, err)
	}

	// Listar cores em bundledCoresPath
	entries, err := os.ReadDir(bundledCoresPath)
	if err != nil {
		return fmt.Errorf("cores bundled não encontrados em %s: %w", bundledCoresPath, err)
	}

	// Copiar cada core
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		src := filepath.Join(bundledCoresPath, entry.Name())
		dst := filepath.Join(userCoresDir, entry.Name())

		// Pular se já existe (idempotente)
		if _, err := os.Stat(dst); err == nil {
			continue
		}

		// Copiar arquivo
		if err := copyFile(src, dst); err != nil {
			// Log mas não falha — pode haver cores inutilizáveis, mas o daemon
			// continua funcionando (usuário pode usar Online Updater do RetroArch)
			fmt.Fprintf(os.Stderr, "aviso: não consegui copiar core %s: %v\n", entry.Name(), err)
		}
	}

	return nil
}

// bundledCoreDirsForWrite retorna o diretório de escrita para cores bundled
// (onde serão copiados na primeira execução). Idêntico a bundledCoreDirs(),
// mas separado para clareza de intenção e para possibilitar testes unitários.
func bundledCoreDirsForWrite() []string {
	if home, err := os.UserHomeDir(); err == nil {
		switch runtime.GOOS {
		case "windows":
			appData := os.Getenv("APPDATA")
			if appData != "" {
				return []string{filepath.Join(appData, "ZeuX", "RetroArch", "cores")}
			}
		case "darwin":
			return []string{filepath.Join(home, "Library", "Application Support", "ZeuX", "RetroArch", "cores")}
		default:
			return []string{filepath.Join(home, ".local", "share", "zeux", "retroarch", "cores")}
		}
	}
	return []string{}
}

// copyFile copia um arquivo de src para dst. Usa io.Copy para eficiência
// com arquivos grandes (cores têm 5-50 MB cada).
func copyFile(src, dst string) error {
	source, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("abrir origem: %w", err)
	}
	defer source.Close()

	dest, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("criar destino: %w", err)
	}
	defer dest.Close()

	if _, err := io.Copy(dest, source); err != nil {
		return fmt.Errorf("copiar dados: %w", err)
	}

	return nil
}
