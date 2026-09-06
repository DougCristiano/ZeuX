package install

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// allowedHosts são os únicos domínios de onde o ZeuX aceita baixar.
//
// A lista existe para que uma release comprometida, ou um redirecionamento
// inesperado, não consiga apontar o download para outro lugar. Ela cobre a API
// do GitHub e os domínios por onde os anexos de release são realmente
// entregues.
// buildbot.libretro.com foi adicionado pelo ADR 0015 (download sob demanda de
// cores do RetroArch, R1) — único host fora do GitHub que o ZeuX baixa. Uma
// URL do manifesto embutido (internal/install/data/retroarch_cores_manifest.json)
// que apontasse para outro lugar seria recusada aqui do mesmo jeito que uma
// release de GitHub comprometida seria.
var allowedHosts = map[string]bool{
	"api.github.com":                       true,
	"github.com":                           true,
	"objects.githubusercontent.com":        true,
	"release-assets.githubusercontent.com": true,
	"codeload.github.com":                  true,
	"buildbot.libretro.com":                true,
}

// maxDownloadBytes limita o tamanho do pacote. Emuladores ficam na casa das
// dezenas ou poucas centenas de MB; algo muito acima disso indica que o padrão
// de asset pegou o arquivo errado.
const maxDownloadBytes int64 = 2 << 30 // 2 GiB

// checkHost recusa qualquer URL fora de HTTPS ou fora da lista de hosts.
func checkHost(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("URL inválida: %w", err)
	}
	if parsed.Scheme != "https" {
		return fmt.Errorf("apenas HTTPS é aceito, veio %q", parsed.Scheme)
	}
	if !allowedHosts[parsed.Hostname()] {
		return fmt.Errorf("o host %q não está na lista de origens permitidas", parsed.Hostname())
	}
	return nil
}

// httpClient tem timeout generoso porque emuladores são grandes, e verifica
// cada redirecionamento contra a lista de hosts.
var httpClient = &http.Client{
	Timeout: 30 * time.Minute,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return fmt.Errorf("redirecionamentos demais")
		}
		return checkHost(req.URL.String())
	},
}

// Release é a versão resolvida de um emulador.
type Release struct {
	Version     string  `json:"version"`
	AssetName   string  `json:"asset_name"`
	DownloadURL string  `json:"download_url"`
	SizeBytes   int64   `json:"size_bytes"`
	PublishedAt string  `json:"published_at"`
	ChecksumURL string  `json:"checksum_url,omitempty"`
	Archive     Archive `json:"archive"`
}

type githubRelease struct {
	TagName     string `json:"tag_name"`
	PublishedAt string `json:"published_at"`
	Assets      []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
		Size               int64  `json:"size"`
	} `json:"assets"`
}

// ResolveLatest descobre a versão mais recente e qual pacote baixar.
func ResolveLatest(ctx context.Context, source Source) (Release, error) {
	if source.Kind != KindGitHub {
		return Release{}, fmt.Errorf("a fonte do %s não é automatizável", source.Name)
	}

	pattern, ok := source.PatternForHost()
	if !ok {
		return Release{}, fmt.Errorf("o %s não publica pacote para este sistema operacional", source.Name)
	}

	apiURL := "https://api.github.com/repos/" + source.Repo + "/releases/latest"
	if err := checkHost(apiURL); err != nil {
		return Release{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return Release{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "ZeuX")

	response, err := httpClient.Do(req)
	if err != nil {
		return Release{}, fmt.Errorf("consultando a release do %s: %w", source.Name, err)
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusForbidden {
		return Release{}, fmt.Errorf(
			"o GitHub limitou as consultas por agora; tente novamente em alguns minutos")
	}
	if response.StatusCode != http.StatusOK {
		return Release{}, fmt.Errorf("o GitHub respondeu %s ao consultar a release do %s",
			response.Status, source.Name)
	}

	var release githubRelease
	if err := json.NewDecoder(io.LimitReader(response.Body, 8<<20)).Decode(&release); err != nil {
		return Release{}, fmt.Errorf("lendo a resposta do GitHub: %w", err)
	}

	names := make([]string, 0, len(release.Assets))
	for _, asset := range release.Assets {
		names = append(names, asset.Name)
	}

	chosen, err := matchAsset(names, pattern)
	if err != nil {
		return Release{}, fmt.Errorf("%s: %w", source.Name, err)
	}

	result := Release{
		Version:     release.TagName,
		AssetName:   chosen,
		PublishedAt: release.PublishedAt,
		Archive:     pattern.Archive,
	}

	for _, asset := range release.Assets {
		switch asset.Name {
		case chosen:
			result.DownloadURL = asset.BrowserDownloadURL
			result.SizeBytes = asset.Size
		case chosen + pattern.ChecksumSuffix:
			if pattern.ChecksumSuffix != "" {
				result.ChecksumURL = asset.BrowserDownloadURL
			}
		}
	}

	if result.DownloadURL == "" {
		return Release{}, fmt.Errorf("o pacote %q não trouxe URL de download", chosen)
	}
	if err := checkHost(result.DownloadURL); err != nil {
		return Release{}, err
	}

	return result, nil
}

// Progress relata o andamento de um download.
type Progress struct {
	Downloaded int64
	Total      int64
}

// download baixa o arquivo para destPath, informando o progresso e devolvendo o
// SHA-256 do que foi gravado.
func download(ctx context.Context, rawURL, destPath string, total int64, report func(Progress)) (string, error) {
	if err := checkHost(rawURL); err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "ZeuX")

	response, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("baixando: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("o servidor respondeu %s", response.Status)
	}

	if response.ContentLength > maxDownloadBytes {
		return "", fmt.Errorf("o pacote tem %d bytes, acima do limite aceito", response.ContentLength)
	}
	if total <= 0 {
		total = response.ContentLength
	}

	file, err := os.Create(destPath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hasher := sha256.New()
	writer := io.MultiWriter(file, hasher)

	counter := &progressWriter{total: total, report: report, lastReport: time.Now()}

	// LimitReader é a defesa real contra um servidor que ignore o
	// Content-Length e mande dados sem fim.
	if _, err := io.Copy(io.MultiWriter(writer, counter), io.LimitReader(response.Body, maxDownloadBytes)); err != nil {
		return "", fmt.Errorf("baixando: %w", err)
	}

	return hex.EncodeToString(hasher.Sum(nil)), nil
}

// progressWriter conta os bytes e informa o progresso sem inundar quem escuta.
type progressWriter struct {
	downloaded int64
	total      int64
	report     func(Progress)
	lastReport time.Time
}

func (w *progressWriter) Write(p []byte) (int, error) {
	w.downloaded += int64(len(p))

	// Relatar a cada bloco geraria milhares de atualizações por segundo. Meio
	// segundo é suficiente para a barra parecer viva.
	if w.report != nil && time.Since(w.lastReport) > 500*time.Millisecond {
		w.lastReport = time.Now()
		w.report(Progress{Downloaded: w.downloaded, Total: w.total})
	}

	return len(p), nil
}

// fetchChecksum baixa e interpreta um arquivo .sha256.
func fetchChecksum(ctx context.Context, rawURL string) (string, error) {
	if err := checkHost(rawURL); err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "ZeuX")

	response, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("o servidor respondeu %s", response.Status)
	}

	data, err := io.ReadAll(io.LimitReader(response.Body, 4<<10))
	if err != nil {
		return "", err
	}

	// O formato usual é "<hash>  <nome do arquivo>".
	fields := strings.Fields(string(data))
	if len(fields) == 0 {
		return "", fmt.Errorf("arquivo de soma de verificação vazio")
	}

	hash := strings.ToLower(fields[0])
	if len(hash) != 64 {
		return "", fmt.Errorf("soma de verificação com formato inesperado")
	}

	return hash, nil
}
