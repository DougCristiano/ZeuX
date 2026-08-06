package igdb

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// allowedHosts são os únicos domínios que este pacote fala. A lista é o que
// o teste de trava (internal/igdb/allowlist_test.go) verifica — ela é a
// prova estrutural de que o scraper só busca metadado/imagem, nunca um
// caminho que poderia servir arquivo de jogo (regra do CLAUDE.md).
var allowedHosts = map[string]bool{
	"api.igdb.com":    true,
	"images.igdb.com": true,
	"id.twitch.tv":    true,
}

// insecureTestHosts existe só para os testes deste pacote poderem apontar
// para um httptest.NewServer (HTTP, sem certificado) sem afrouxar a
// exigência de HTTPS em produção. Nenhum código fora de arquivo _test.go
// deste pacote escreve neste mapa.
var insecureTestHosts = map[string]bool{}

// Bases de URL como variáveis de pacote — os testes deste pacote as
// substituem por um servidor de mentira (httptest), nunca fazendo requisição
// de rede real.
var (
	twitchTokenURL = "https://id.twitch.tv/oauth2/token"
	igdbAPIBase    = "https://api.igdb.com/v4"
	igdbImageBase  = "https://images.igdb.com/igdb/image/upload"
)

// maxCoverBytes limita o tamanho de uma capa. Capas do IGDB são JPEGs
// pequenos; algo muito acima disso indica resposta errada, não uma capa de
// alta resolução legítima.
const maxCoverBytes int64 = 8 << 20 // 8 MiB

// checkHost recusa qualquer URL fora de HTTPS ou fora da lista de hosts
// permitidos — mesma defesa de internal/install/download.go, pacote
// próprio para não acoplar os dois (internal/igdb não importa
// internal/install nem vice-versa).
func checkHost(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("URL inválida: %w", err)
	}
	if insecureTestHosts[parsed.Host] {
		return nil
	}
	if parsed.Scheme != "https" {
		return fmt.Errorf("apenas HTTPS é aceito, veio %q", parsed.Scheme)
	}
	if !allowedHosts[parsed.Hostname()] {
		return fmt.Errorf("o host %q não está na lista de origens permitidas", parsed.Hostname())
	}
	return nil
}

// httpClient tem timeout curto: isto é metadado e imagens pequenas, não os
// binários de emulador que internal/install baixa.
var httpClient = &http.Client{
	Timeout: 30 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return fmt.Errorf("redirecionamentos demais")
		}
		return checkHost(req.URL.String())
	},
}

// rateLimiter respeita o limite documentado do IGDB (4 requisições por
// segundo). Um usuário local buscando a própria biblioteca nunca chega
// perto disso de propósito — isto é só para não estourar em lote.
var rateLimiter = time.NewTicker(250 * time.Millisecond)

func waitRateLimit(ctx context.Context) error {
	select {
	case <-rateLimiter.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Match é o resultado de uma busca por título no IGDB.
type Match struct {
	Name        string
	ImageID     string
	ReleaseYear int
}

// Client fala com a API do IGDB usando a credencial de um usuário.
type Client struct {
	creds Credentials

	mu          sync.Mutex
	token       string
	tokenExpiry time.Time
}

// NewClient cria um cliente para uma credencial já carregada
// (CredentialsStore.Load). Não valida a credencial aqui — a validação real
// acontece na primeira chamada, onde um client_id/secret errado vira um
// erro específico e acionável.
func NewClient(creds Credentials) *Client {
	return &Client{creds: creds}
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int64  `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

// authenticate troca client_id/client_secret por um access_token via OAuth
// do Twitch (o IGDB usa a mesma autenticação). Chamado sob demanda, nunca
// no início do processo — só quando alguém de fato dispara uma busca.
func (c *Client) authenticate(ctx context.Context) error {
	values := url.Values{
		"client_id":     {c.creds.ClientID},
		"client_secret": {c.creds.ClientSecret},
		"grant_type":    {"client_credentials"},
	}
	reqURL := twitchTokenURL + "?" + values.Encode()
	if err := checkHost(reqURL); err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "ZeuX")

	response, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("autenticando com o IGDB: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusBadRequest || response.StatusCode == http.StatusUnauthorized {
		return fmt.Errorf("o Twitch recusou o client_id/client_secret informado — confira a credencial nas Configurações")
	}
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("o Twitch respondeu %s ao autenticar", response.Status)
	}

	var parsed tokenResponse
	if err := json.NewDecoder(io.LimitReader(response.Body, 4<<10)).Decode(&parsed); err != nil {
		return fmt.Errorf("lendo a resposta de autenticação do Twitch: %w", err)
	}
	if parsed.AccessToken == "" {
		return fmt.Errorf("o Twitch não devolveu um token de acesso")
	}

	c.mu.Lock()
	c.token = parsed.AccessToken
	// Uma margem de 60s evita usar um token que expira entre o cálculo e o
	// envio da próxima requisição.
	c.tokenExpiry = time.Now().Add(time.Duration(parsed.ExpiresIn)*time.Second - 60*time.Second)
	c.mu.Unlock()

	return nil
}

// Authenticate garante que o cliente tem um token válido, autenticando de
// novo se preciso. Exportado para o job de busca (scrape.go) chamar uma vez
// no início do lote: uma credencial errada falha aqui, antes de processar
// qualquer jogo, em vez de repetir o mesmo erro de autenticação por jogo.
func (c *Client) Authenticate(ctx context.Context) error {
	return c.ensureToken(ctx)
}

// ensureToken autentica de novo só se ainda não há token ou se ele expirou.
func (c *Client) ensureToken(ctx context.Context) error {
	c.mu.Lock()
	valid := c.token != "" && time.Now().Before(c.tokenExpiry)
	c.mu.Unlock()
	if valid {
		return nil
	}
	return c.authenticate(ctx)
}

type coverField struct {
	ImageID string `json:"image_id"`
}

type gameResult struct {
	Name             string      `json:"name"`
	FirstReleaseDate int64       `json:"first_release_date"`
	Cover            *coverField `json:"cover"`
}

// SearchGame procura um jogo pelo título. Nenhum resultado não é erro — é
// uma busca que não achou nada, e a chamadora decide o que fazer (marcar
// como "não encontrado", nunca inventar uma capa parecida).
func (c *Client) SearchGame(ctx context.Context, title string) (Match, bool, error) {
	if err := c.ensureToken(ctx); err != nil {
		return Match{}, false, err
	}
	if err := waitRateLimit(ctx); err != nil {
		return Match{}, false, err
	}

	body := fmt.Sprintf("search %q; fields name,cover.image_id,first_release_date; limit 1;", title)

	reqURL := igdbAPIBase + "/games"
	if err := checkHost(reqURL); err != nil {
		return Match{}, false, err
	}

	results, err := c.postApicalypse(ctx, reqURL, body)
	if err != nil {
		return Match{}, false, err
	}
	if len(results) == 0 {
		return Match{}, false, nil
	}

	game := results[0]
	match := Match{Name: game.Name}
	if game.FirstReleaseDate > 0 {
		match.ReleaseYear = time.Unix(game.FirstReleaseDate, 0).UTC().Year()
	}
	if game.Cover != nil {
		match.ImageID = game.Cover.ImageID
	}

	return match, true, nil
}

// postApicalypse envia uma consulta no formato Apicalypse do IGDB e devolve
// a lista de jogos encontrados. Uma resposta que não é um array JSON válido
// vira erro explícito, nunca um resultado vazio silencioso — isso
// esconderia uma credencial errada ou uma mudança na API atrás de "não
// encontrado".
func (c *Client) postApicalypse(ctx context.Context, reqURL, body string) ([]gameResult, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	c.mu.Lock()
	token := c.token
	c.mu.Unlock()
	req.Header.Set("Client-ID", c.creds.ClientID)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "ZeuX")

	response, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("consultando o IGDB: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusTooManyRequests {
		if err := waitRetryAfter(ctx, response); err != nil {
			return nil, err
		}
		return c.postApicalypse(ctx, reqURL, body)
	}
	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("o IGDB recusou a credencial informada — confira o client_id/client_secret nas Configurações")
	}
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("o IGDB respondeu %s", response.Status)
	}

	var results []gameResult
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&results); err != nil {
		return nil, fmt.Errorf("lendo a resposta do IGDB: %w", err)
	}

	return results, nil
}

// waitRetryAfter espera o tempo pedido pelo cabeçalho Retry-After (ou 1s se
// ausente/inválido) antes de tentar de novo — só uma vez por chamada, para
// não entrar num laço se o servidor devolver 429 sempre.
func waitRetryAfter(ctx context.Context, response *http.Response) error {
	wait := time.Second
	if raw := response.Header.Get("Retry-After"); raw != "" {
		if seconds, err := strconv.Atoi(raw); err == nil && seconds > 0 {
			wait = time.Duration(seconds) * time.Second
		}
	}
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// DownloadCover baixa a capa (tamanho "cover_big") para destPath, gravando
// de forma atômica (arquivo temporário + rename) para nunca deixar uma
// imagem truncada onde a biblioteca espera encontrar uma capa completa.
func (c *Client) DownloadCover(ctx context.Context, imageID, destPath string) error {
	if err := waitRateLimit(ctx); err != nil {
		return err
	}

	reqURL := igdbImageBase + "/t_cover_big/" + imageID + ".jpg"
	if err := checkHost(reqURL); err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "ZeuX")

	response, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("baixando a capa: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("o servidor de imagens do IGDB respondeu %s", response.Status)
	}
	if response.ContentLength > maxCoverBytes {
		return fmt.Errorf("a imagem tem %d bytes, acima do limite aceito para uma capa", response.ContentLength)
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return fmt.Errorf("criando a pasta da capa: %w", err)
	}

	temp := destPath + ".tmp"
	file, err := os.Create(temp)
	if err != nil {
		return fmt.Errorf("gravando a capa: %w", err)
	}

	// Copia até um byte a mais que o limite: se o servidor ignorar
	// Content-Length (ou ele vier ausente, como acontece com resposta
	// fatiada/chunked), isto ainda detecta o excesso sem precisar confiar só
	// no cabeçalho — mesmo raciocínio do io.LimitReader em
	// internal/install/download.go.
	written, err := io.Copy(file, io.LimitReader(response.Body, maxCoverBytes+1))
	closeErr := file.Close()
	if err != nil {
		os.Remove(temp)
		return fmt.Errorf("gravando a capa: %w", err)
	}
	if closeErr != nil {
		os.Remove(temp)
		return fmt.Errorf("gravando a capa: %w", closeErr)
	}
	if written > maxCoverBytes {
		os.Remove(temp)
		return fmt.Errorf("a imagem excede o limite aceito para uma capa")
	}

	if err := os.Rename(temp, destPath); err != nil {
		os.Remove(temp)
		return fmt.Errorf("finalizando a gravação da capa: %w", err)
	}

	return nil
}
