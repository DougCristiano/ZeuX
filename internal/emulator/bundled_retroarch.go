package emulator

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// EnsureBundledRetroArchAvailable copia o RetroArch empacotado no instalador
// (extensão do ADR 0012 que também empacota os cores, ver
// docs/decisoes/0012-empacotar-retroarch-e-cores.md) para o mesmo diretório
// gerenciado que uma instalação 1-click usaria.
//
// Copia tudo que cmd/download-retroarch-app deixou em
// $ZEUX_BUNDLED_RETROARCH_DIR, sem presumir um nome fixo de arquivo: no
// Linux é um único .AppImage autocontido; no Windows é retroarch.exe mais
// ~65 DLLs ao lado (sem elas o executável não abre) — ver o comentário do
// pacote em cmd/download-retroarch-app/main.go para como cada formato foi
// confirmado. Reaproveitar o diretório gerenciado — em vez de ensinar
// Locate() a procurar num lugar novo — significa que
// retroArchAdapter.Locate() já funciona sem nenhuma mudança: findBinary
// (discovery.go) sempre checou o diretório gerenciado primeiro, inclusive
// com um caso especial para um único *.AppImage lá dentro. A tela de
// emuladores passa a mostrar "instalado pelo ZeuX", que é a badge certa
// (Managed: true).
//
// Chamada uma vez na subida do daemon (cmd/zeuxd/main.go), em paralelo com
// o Listen — não sob demanda como ensureBundledCoresAvailable faz com os
// cores. Rodar antes do Listen bloqueava a porta enquanto copiava ~65 DLLs
// no Windows e a UI esgotava o GET /consent (issue #6). /emulators pode
// ver o RetroArch ausente por um instante na primeira abertura; na
// seguinte já está no diretório gerenciado (idempotente).
func EnsureBundledRetroArchAvailable() error {
	bundledDir := os.Getenv("ZEUX_BUNDLED_RETROARCH_DIR")
	if bundledDir == "" {
		// RetroArch bundled não está disponível neste ambiente (ex.: build
		// local de desenvolvimento fora do Tauri, ou plataforma para a qual
		// cmd/download-retroarch-app ainda não sabe empacotar — macOS, por
		// enquanto).
		return nil
	}

	entries, err := os.ReadDir(bundledDir)
	if err != nil {
		return fmt.Errorf("lendo diretório do RetroArch bundled (%s): %w", bundledDir, err)
	}
	if len(entries) == 0 {
		return fmt.Errorf("diretório do RetroArch bundled está vazio: %s", bundledDir)
	}

	root, err := ManagedRoot()
	if err != nil {
		return err
	}
	managedDir := ManagedEmulatorDir(root, "retroarch", (retroArchAdapter{}).Consoles())

	// Idempotente: se já tem algo lá (de uma execução anterior do daemon),
	// não refaz — mesmo padrão de ensureBundledCoresAvailable.
	if existing, err := os.ReadDir(managedDir); err == nil && len(existing) > 0 {
		return nil
	}

	if err := os.MkdirAll(managedDir, 0o755); err != nil {
		return fmt.Errorf("criando diretório gerenciado do RetroArch: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			// cmd/download-retroarch-app nunca inclui subpastas de assets —
			// se uma aparecer aqui é sinal de mudança na estrutura do
			// pacote, não algo para copiar às cegas.
			continue
		}

		src := filepath.Join(bundledDir, entry.Name())
		dst := filepath.Join(managedDir, entry.Name())
		if err := copyFile(src, dst); err != nil {
			return fmt.Errorf("copiando %s: %w", entry.Name(), err)
		}

		// Chmod +x em todo arquivo extraído no Linux/macOS — hoje é sempre
		// um único .AppImage, mas marcar por sufixo seria uma suposição a
		// mais para quebrar se o formato mudar; +x num arquivo que não
		// precisava é inofensivo.
		if runtime.GOOS != "windows" {
			if err := os.Chmod(dst, 0o755); err != nil {
				return fmt.Errorf("marcando %s como executável: %w", entry.Name(), err)
			}
		}
	}

	return nil
}
