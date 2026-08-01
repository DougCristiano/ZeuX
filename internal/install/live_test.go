package install

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"testing"
	"time"
)

// TestResolveLive confere os padrões de asset contra as releases reais, de
// todas as plataformas declaradas — não só a da máquina onde o teste roda.
//
// Verificar apenas a plataforma atual deixaria os padrões de Linux e macOS sem
// nenhuma checagem até alguém tentar instalar por lá. Como a lista de assets
// vem inteira na mesma resposta, dá para conferir todos de uma vez.
//
// Fica desligado por padrão porque depende de rede e do limite de requisições
// do GitHub:
//
//	ZEUX_LIVE=1 go test ./internal/install -run TestResolveLive -v
func TestResolveLive(t *testing.T) {
	if os.Getenv("ZEUX_LIVE") != "1" {
		t.Skip("teste de rede desligado; use ZEUX_LIVE=1 para ativar")
	}

	catalog, err := LoadCatalog()
	if err != nil {
		t.Fatalf("carregando catálogo: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	for _, source := range catalog.Sources {
		if source.Kind != KindGitHub {
			t.Logf("%-12s MANUAL  %s", source.AdapterID, source.Homepage)
			continue
		}

		names, sizes, tag, err := fetchAssetNames(ctx, source.Repo)
		if err != nil {
			t.Errorf("%-12s não foi possível consultar a release: %v", source.AdapterID, err)
			continue
		}

		platforms := make([]string, 0, len(source.Assets))
		for platform := range source.Assets {
			platforms = append(platforms, platform)
		}
		sort.Strings(platforms)

		for _, platform := range platforms {
			chosen, err := matchAsset(names, source.Assets[platform])
			if err != nil {
				t.Errorf("%-12s %-14s FALHOU: %v", source.AdapterID, platform, err)
				continue
			}

			t.Logf("%-12s %-14s %-46s %6.1f MB  (%s)",
				source.AdapterID, platform, chosen,
				float64(sizes[chosen])/(1024*1024), tag)
		}
	}
}

// fetchAssetNames devolve os nomes e tamanhos dos assets da release mais
// recente de um repositório.
func fetchAssetNames(ctx context.Context, repo string) ([]string, map[string]int64, string, error) {
	apiURL := "https://api.github.com/repos/" + repo + "/releases/latest"
	if err := checkHost(apiURL); err != nil {
		return nil, nil, "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, nil, "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "ZeuX")

	response, err := httpClient.Do(req)
	if err != nil {
		return nil, nil, "", err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, nil, "", fmt.Errorf("o GitHub respondeu %s", response.Status)
	}

	var release githubRelease
	if err := json.NewDecoder(io.LimitReader(response.Body, 8<<20)).Decode(&release); err != nil {
		return nil, nil, "", err
	}

	names := make([]string, 0, len(release.Assets))
	sizes := make(map[string]int64, len(release.Assets))
	for _, asset := range release.Assets {
		names = append(names, asset.Name)
		sizes[asset.Name] = asset.Size
	}

	return names, sizes, release.TagName, nil
}
