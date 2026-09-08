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

// fakeLibretroThumbnailsServer sobe um httptest.NewServer e aponta
// libretroThumbnailsBase para ele — mesmo padrão de fakeIGDBServer
// (client_test.go), nenhuma requisição de rede real.
func fakeLibretroThumbnailsServer(t *testing.T, mux *http.ServeMux) {
	t.Helper()
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	host := strings.TrimPrefix(server.URL, "http://")
	insecureTestHosts[host] = true
	t.Cleanup(func() { delete(insecureTestHosts, host) })

	orig := libretroThumbnailsBase
	libretroThumbnailsBase = server.URL
	t.Cleanup(func() { libretroThumbnailsBase = orig })
}

// Trava a regra central desta fonte: um console mapeado com o nome de
// arquivo (COM etiqueta de região, convenção No-Intro) acha a capa sem
// nenhuma credencial envolvida.
func TestFetchLibretroThumbnailFindsMappedConsole(t *testing.T) {
	content := []byte("capa-de-mentira")
	const want = "/Nintendo - Nintendo Entertainment System/Named_Boxarts/Super Mario Bros. (World).png"
	// ServeMux (Go 1.22+) interpreta o texto antes do primeiro espaço do
	// padrão como método HTTP — um espaço legítimo no caminho (nome de
	// pasta/jogo, aqui) quebra o registro do padrão. Handler manual comparando
	// r.URL.Path evita o problema, sem mudar o que o teste trava.
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != want {
			http.NotFound(w, r)
			return
		}
		w.Write(content)
	})
	fakeLibretroThumbnailsServer(t, mux)

	dest := filepath.Join(t.TempDir(), "cover.jpg")
	found, err := FetchLibretroThumbnail(context.Background(), "nes", "Super Mario Bros. (World)", dest)
	if err != nil {
		t.Fatalf("FetchLibretroThumbnail: %v", err)
	}
	if !found {
		t.Fatal("FetchLibretroThumbnail: esperava achar a capa")
	}

	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("lendo arquivo baixado: %v", err)
	}
	if string(got) != string(content) {
		t.Fatalf("conteúdo baixado = %q, esperado %q", got, content)
	}
}

// Console fora de libretroSystemFolders nunca faz requisição — devolve
// (false, nil) direto, sem tocar a rede nem exigir servidor de teste.
// "arcade" é o único console do catálogo fora do mapa (auditoria de
// 2026-09-08, ver comentário de libretroSystemFolders) — usar qualquer
// console mapeado aqui faria este teste bater na rede real por engano em
// vez de travar a regra que o nome promete.
func TestFetchLibretroThumbnailSkipsUnmappedConsole(t *testing.T) {
	found, err := FetchLibretroThumbnail(context.Background(), "arcade", "Algum Jogo", filepath.Join(t.TempDir(), "cover.jpg"))
	if err != nil {
		t.Fatalf("FetchLibretroThumbnail: esperava sem erro para console fora do mapa, veio %v", err)
	}
	if found {
		t.Fatal("FetchLibretroThumbnail: console fora do mapa não deveria achar nada")
	}
}

// Trava a auditoria de 2026-09-08: 32 dos 33 consoles do catálogo têm pasta
// real confirmada em libretro-thumbnails, só "arcade" fica de fora (ver o
// comentário de libretroSystemFolders para o motivo). Uma remoção
// acidental de qualquer um destes ids passaria despercebida sem este
// teste — o efeito é silencioso (o console simplesmente cai pro IGDB sem
// erro nenhum).
func TestLibretroSystemFoldersCoversAuditedConsoles(t *testing.T) {
	audited := []string{
		"atari2600", "nes", "snes", "n64", "gb", "gbc", "gba", "virtualboy",
		"mastersystem", "megadrive", "gamegear", "segacd", "sega32x", "saturn",
		"dreamcast", "ps1", "ps2", "ps3", "psp", "vita", "neogeo", "ngpc",
		"wonderswan", "3do", "pcengine", "gamecube", "wii", "wiiu", "nds",
		"3ds", "xbox", "xbox360",
	}
	for _, id := range audited {
		if _, ok := libretroSystemFolders[id]; !ok {
			t.Errorf("console %q deveria estar em libretroSystemFolders (auditoria de 2026-09-08)", id)
		}
	}
	if _, ok := libretroSystemFolders["arcade"]; ok {
		t.Error(`"arcade" não deveria estar em libretroSystemFolders — nome de arquivo de romset MAME/FBNeo é código curto, não título`)
	}
}

// 404 (arquivo não existe pra este jogo específico) é resultado normal desta
// fonte, não erro — quem chama (scrape.go) precisa poder seguir pro IGDB
// sem tratar isto como falha.
func TestFetchLibretroThumbnail404IsNotAnError(t *testing.T) {
	mux := http.NewServeMux() // nenhuma rota registrada: tudo 404
	fakeLibretroThumbnailsServer(t, mux)

	found, err := FetchLibretroThumbnail(context.Background(), "snes", "Jogo Que Não Existe", filepath.Join(t.TempDir(), "cover.jpg"))
	if err != nil {
		t.Fatalf("FetchLibretroThumbnail: 404 não deveria virar erro, veio %v", err)
	}
	if found {
		t.Fatal("FetchLibretroThumbnail: não deveria reportar achado num 404")
	}
}
