package emulator

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// ensureBundledCoresAvailable copia cores bundled do instalador para o
// diretório de dados do usuário na primeira execução (ADR 0012).
//
// Tauri (src-tauri/src/lib.rs) já seta ZEUX_BUNDLED_CORES_DIR apontando
// diretamente para a pasta que contém os arquivos de core (não para uma raiz
// de recursos genérica) — este código não deve acrescentar "retroarch/cores"
// de novo em cima. Bug real, presente desde a implementação original do ADR
// 0012 até 2026-08-04: um `filepath.Join(bundledDir, "retroarch", "cores")`
// aqui produzia um caminho duplicado
// (".../resources/retroarch/cores/retroarch/cores") que nunca existiu —
// silencioso porque o erro só vira log de aviso, nunca trava o daemon.
// Passou despercebido até o Douglas lançar um jogo de verdade e receber
// "core não encontrado" mesmo com o core presente no pacote.
//
// Se a variável não existir, ignora silenciosamente (cores bundled podem não
// estar disponíveis, ex.: build local do desenvolvedor).
//
// Comportamento:
// - Lê cores de $ZEUX_BUNDLED_CORES_DIR
// - Copia para ~/.local/share/zeux/retroarch/cores (Linux), etc
// - Idempotente: se arquivo já existe, não copia duas vezes
// - Erros de cópia são registrados mas não bloqueiam o daemon
func ensureBundledCoresAvailable() error {
	bundledCoresPath := os.Getenv("ZEUX_BUNDLED_CORES_DIR")
	if bundledCoresPath == "" {
		// Cores bundled não estão disponíveis neste ambiente.
		return nil
	}

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
		// .gitkeep versiona a pasta vazia (ver .gitignore) — nunca um core de
		// verdade. Mesma classe de bug corrigida em bundled_retroarch.go.
		if strings.HasPrefix(entry.Name(), ".") {
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
