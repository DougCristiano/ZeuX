package api_test

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/doufl/zeux/internal/emulator"
)

// Trava o ciclo da galeria (2026-10-06): o print na pasta do jogo aparece
// na lista e nos "últimos prints", pode virar banner (e o jogo passa a
// devolver banner_url), e apagar o print que era banner limpa o banner —
// senão a tela pediria uma imagem que não existe mais.
func TestScreenshotGalleryLifecycle(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	romDir := t.TempDir()
	rom := filepath.Join(romDir, "Jogo (USA).cue")
	if err := os.WriteFile(rom, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders", map[string]any{"console_id": "ps1", "path": romDir})
	games := decodeBody(t, doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?console_id=ps1", nil))["games"].([]any)
	if len(games) != 1 {
		t.Fatalf("setup: esperava 1 jogo, veio %d", len(games))
	}
	id := int(games[0].(map[string]any)["id"].(float64))
	base := "/api/v1/library/games/" + strconv.Itoa(id)

	root, _ := emulator.ScreenshotsRoot()
	gallery := filepath.Join(root, emulator.GameScreenshotsSubdir("ps1", rom))
	if err := os.MkdirAll(gallery, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(gallery, "print 1.png"), []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}

	list := decodeBody(t, doJSON(t, server.Routes(), http.MethodGet, base+"/screenshots", nil))
	shots := list["screenshots"].([]any)
	if len(shots) != 1 {
		t.Fatalf("galeria: %v", list)
	}
	url := shots[0].(map[string]any)["url"].(string)
	if rec := doJSON(t, server.Routes(), http.MethodGet, url, nil); rec.Code != http.StatusOK {
		t.Fatalf("GET %s = %d", url, rec.Code)
	}

	recent := decodeBody(t, doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/screenshots/recent", nil))["screenshots"].([]any)
	if len(recent) != 1 || int(recent[0].(map[string]any)["game_id"].(float64)) != id {
		t.Fatalf("recentes: %v", recent)
	}

	if rec := doJSON(t, server.Routes(), http.MethodPost, base+"/banner", map[string]any{"name": "../x.png"}); rec.Code != http.StatusBadRequest {
		t.Fatalf("nome com caminho deveria dar 400, deu %d", rec.Code)
	}
	if rec := doJSON(t, server.Routes(), http.MethodPost, base+"/banner", map[string]any{"name": "print 1.png"}); rec.Code != http.StatusOK {
		t.Fatalf("banner: %d %s", rec.Code, rec.Body.String())
	}
	game := decodeBody(t, doJSON(t, server.Routes(), http.MethodGet, base, nil))
	if game["banner_url"] != url {
		t.Fatalf("banner_url = %v, esperado %q", game["banner_url"], url)
	}

	if rec := doJSON(t, server.Routes(), http.MethodDelete, base+"/screenshots/print%201.png", nil); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", rec.Code, rec.Body.String())
	}
	game = decodeBody(t, doJSON(t, server.Routes(), http.MethodGet, base, nil))
	if game["banner_url"] != nil {
		t.Fatalf("banner deveria sumir junto com o print, veio %v", game["banner_url"])
	}
}
