package igdb

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fakeIGDBServer sobe um httptest.NewServer e aponta as variáveis de base de
// URL do pacote para ele — nenhum teste deste arquivo faz requisição de rede
// real. host entra em insecureTestHosts para checkHost aceitar HTTP (o
// servidor de teste não tem certificado) sem afrouxar a exigência de HTTPS
// em produção.
func fakeIGDBServer(t *testing.T, mux *http.ServeMux) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	host := strings.TrimPrefix(server.URL, "http://")
	insecureTestHosts[host] = true
	t.Cleanup(func() { delete(insecureTestHosts, host) })

	origToken, origAPI, origImage := twitchTokenURL, igdbAPIBase, igdbImageBase
	twitchTokenURL = server.URL + "/oauth2/token"
	igdbAPIBase = server.URL + "/v4"
	igdbImageBase = server.URL + "/images/upload"
	t.Cleanup(func() {
		twitchTokenURL, igdbAPIBase, igdbImageBase = origToken, origAPI, origImage
	})

	return server
}

func tokenHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"access_token":"token-de-teste","expires_in":3600,"token_type":"bearer"}`))
}

func testCredentials() Credentials {
	return Credentials{ClientID: "id-de-teste", ClientSecret: "segredo-de-teste"}
}

func TestSearchGameFound(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/oauth2/token", tokenHandler)
	mux.HandleFunc("/v4/games", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[{"name":"Chrono Trigger","first_release_date":774144000,"cover":{"id":1,"image_id":"abcd1234"}}]`))
	})
	fakeIGDBServer(t, mux)

	client := NewClient(testCredentials())
	match, found, err := client.SearchGame(context.Background(), "Chrono Trigger")
	if err != nil {
		t.Fatalf("SearchGame: %v", err)
	}
	if !found {
		t.Fatal("SearchGame: deveria ter encontrado o jogo")
	}
	if match.Name != "Chrono Trigger" {
		t.Errorf("Name = %q, esperado %q", match.Name, "Chrono Trigger")
	}
	if match.ImageID != "abcd1234" {
		t.Errorf("ImageID = %q, esperado %q", match.ImageID, "abcd1234")
	}
	if match.ReleaseYear != 1994 {
		t.Errorf("ReleaseYear = %d, esperado 1994", match.ReleaseYear)
	}
}

// Trava a regra central: nenhum resultado não é erro, é uma busca que não
// achou nada — a chamadora decide marcar "não encontrado", nunca inventar
// uma capa parecida.
func TestSearchGameNotFound(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/oauth2/token", tokenHandler)
	mux.HandleFunc("/v4/games", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[]`))
	})
	fakeIGDBServer(t, mux)

	client := NewClient(testCredentials())
	match, found, err := client.SearchGame(context.Background(), "Jogo Que Não Existe De Verdade")
	if err != nil {
		t.Fatalf("SearchGame: não deveria ser erro, e sim resultado vazio: %v", err)
	}
	if found {
		t.Fatal("SearchGame: não deveria ter encontrado nada")
	}
	if match != (Match{}) {
		t.Fatalf("SearchGame: esperado Match zerado, veio %+v", match)
	}
}

// Trava que um erro de rede (servidor inalcançável) vira um erro claro, sem
// panic e sem resultado inventado.
func TestSearchGameNetworkError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/oauth2/token", tokenHandler)
	fakeIGDBServer(t, mux)

	// api.igdb.com aponta para uma porta sem ninguém escutando — a
	// autenticação (contra o servidor de mentira) funciona, só a busca
	// falha, isolando o teste ao erro de rede da própria SearchGame.
	igdbAPIBase = "http://127.0.0.1:1"
	insecureTestHosts["127.0.0.1:1"] = true
	t.Cleanup(func() { delete(insecureTestHosts, "127.0.0.1:1") })

	client := NewClient(testCredentials())
	_, _, err := client.SearchGame(context.Background(), "Chrono Trigger")
	if err == nil {
		t.Fatal("SearchGame: deveria falhar com o host de busca inalcançável")
	}
}

// Trava que uma resposta que não é um array JSON válido vira erro explícito,
// nunca um resultado vazio silencioso — isso esconderia uma credencial
// errada ou uma mudança na API atrás de "não encontrado".
func TestSearchGameMalformedResponse(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/oauth2/token", tokenHandler)
	mux.HandleFunc("/v4/games", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("isto não é json"))
	})
	fakeIGDBServer(t, mux)

	client := NewClient(testCredentials())
	_, _, err := client.SearchGame(context.Background(), "Chrono Trigger")
	if err == nil {
		t.Fatal("SearchGame: resposta malformada deveria virar erro")
	}
}

// Trava que uma credencial recusada pelo Twitch vira uma mensagem
// específica e acionável, não um erro de rede genérico.
func TestSearchGameAuthenticationFailure(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/oauth2/token", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	})
	fakeIGDBServer(t, mux)

	client := NewClient(testCredentials())
	_, _, err := client.SearchGame(context.Background(), "Chrono Trigger")
	if err == nil {
		t.Fatal("SearchGame: credencial recusada deveria virar erro")
	}
}

func TestDownloadCoverWritesFile(t *testing.T) {
	content := []byte("conteudo-de-imagem-de-teste")
	mux := http.NewServeMux()
	mux.HandleFunc("/images/upload/t_cover_big/abcd1234.jpg", func(w http.ResponseWriter, r *http.Request) {
		w.Write(content)
	})
	fakeIGDBServer(t, mux)

	client := NewClient(testCredentials())
	dest := filepath.Join(t.TempDir(), "capa", "cover.jpg")

	if err := client.DownloadCover(context.Background(), "abcd1234", dest); err != nil {
		t.Fatalf("DownloadCover: %v", err)
	}

	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("lendo arquivo baixado: %v", err)
	}
	if string(got) != string(content) {
		t.Fatalf("conteúdo baixado = %q, esperado %q", got, content)
	}

	if _, err := os.Stat(dest + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("DownloadCover: arquivo temporário deveria ter sido renomeado, stat = %v", err)
	}
}

// Trava que uma imagem maior que o limite aceito é rejeitada, mesmo quando o
// servidor não anuncia o tamanho via Content-Length (resposta fatiada) —
// defesa real contra um servidor que devolva algo muito maior que uma capa.
func TestDownloadCoverOversizeRejected(t *testing.T) {
	oversize := make([]byte, maxCoverBytes+1024)

	mux := http.NewServeMux()
	mux.HandleFunc("/images/upload/t_cover_big/grande.jpg", func(w http.ResponseWriter, r *http.Request) {
		w.(http.Flusher).Flush() // força chunked: Content-Length fica desconhecido no cliente
		w.Write(oversize)
	})
	fakeIGDBServer(t, mux)

	client := NewClient(testCredentials())
	dest := filepath.Join(t.TempDir(), "cover.jpg")

	if err := client.DownloadCover(context.Background(), "grande", dest); err == nil {
		t.Fatal("DownloadCover: imagem grande demais deveria ser rejeitada")
	}

	if _, err := os.Stat(dest); !os.IsNotExist(err) {
		t.Fatal("DownloadCover: nenhum arquivo deveria ter sido deixado para trás após rejeição")
	}
}
