package install

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/doufl/zeux/internal/emulator"
)

// TestInstallLive exercita download, verificação, extração e promoção com um
// pacote real.
//
// Fica separado do TestResolveLive porque valida a outra metade do caminho: a
// resolução da versão passa pela API do GitHub (limitada a 60 consultas por
// hora sem autenticação), enquanto o download vem do domínio de releases, que
// não tem esse limite. Poder testar as duas metades de forma independente é o
// que permite validar a instalação mesmo com a cota da API esgotada.
//
//	ZEUX_LIVE_INSTALL=1 go test ./internal/install -run TestInstallLive -v
func TestInstallLive(t *testing.T) {
	if os.Getenv("ZEUX_LIVE_INSTALL") != "1" {
		t.Skip("teste de download desligado; use ZEUX_LIVE_INSTALL=1 para ativar")
	}

	// Release fixa de propósito: o objetivo aqui é o caminho do arquivo, não a
	// descoberta da versão.
	release := Release{
		Version:     "latest",
		AssetName:   "duckstation-windows-x64-release.zip",
		DownloadURL: "https://github.com/stenzek/duckstation/releases/download/latest/duckstation-windows-x64-release.zip",
		Archive:     ArchiveZip,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()

	workDir := t.TempDir()
	archivePath := filepath.Join(workDir, release.AssetName)

	var lastPercent int
	hash, err := download(ctx, release.DownloadURL, archivePath, 0, func(p Progress) {
		if p.Total > 0 {
			percent := int(float64(p.Downloaded) / float64(p.Total) * 100)
			if percent >= lastPercent+20 {
				lastPercent = percent
				t.Logf("baixando... %d%%", percent)
			}
		}
	})
	if err != nil {
		t.Fatalf("baixando: %v", err)
	}

	info, err := os.Stat(archivePath)
	if err != nil {
		t.Fatalf("pacote baixado não existe: %v", err)
	}
	t.Logf("baixado: %.1f MB", float64(info.Size())/(1024*1024))
	t.Logf("sha256:  %s", hash)

	if len(hash) != 64 {
		t.Errorf("hash com tamanho inesperado: %q", hash)
	}

	staging := filepath.Join(workDir, "staging")
	if err := Extract(archivePath, staging, release.Archive); err != nil {
		t.Fatalf("extraindo: %v", err)
	}
	if err := flattenSingleRoot(staging); err != nil {
		t.Fatalf("achatando: %v", err)
	}

	entries, err := os.ReadDir(staging)
	if err != nil {
		t.Fatalf("lendo o extraído: %v", err)
	}
	t.Logf("extraído: %d entradas na raiz", len(entries))

	manager := NewManager(mustCatalog(t), discardLogger())
	if err := manager.promote(staging, "duckstation"); err != nil {
		t.Fatalf("promovendo: %v", err)
	}

	// A prova final é o adapter encontrar sozinho o que acabou de ser
	// instalado: sem isso, a instalação existiria mas o jogo não abriria.
	adapter, ok := emulator.NewRegistry().ByID("duckstation")
	if !ok {
		t.Fatal("adapter duckstation não registrado")
	}

	installation, found := adapter.Locate(ctx)
	if !found {
		root, _ := emulator.ManagedRoot()
		t.Fatalf("o DuckStation instalado não foi encontrado pela descoberta (procurado em %s)", root)
	}

	t.Logf("descoberto: %s", installation.BinaryPath)
	if !installation.Managed {
		t.Error("a instalação deveria estar marcada como gerenciada pelo ZeuX")
	}
}

func mustCatalog(t *testing.T) *Catalog {
	t.Helper()

	catalog, err := LoadCatalog()
	if err != nil {
		t.Fatalf("carregando catálogo: %v", err)
	}
	return catalog
}
