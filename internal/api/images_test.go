package api_test

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

// pngSignature são os 8 bytes mágicos que abrem qualquer PNG válido —
// http.DetectContentType (usado por copyValidatedImage) só olha a
// assinatura, não decodifica a imagem inteira, então isso já basta para os
// testes que precisam de "um arquivo que claramente é uma imagem".
var pngSignature = []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}

func writeFakeImage(t *testing.T, dir, name string, extraBytes int) string {
	t.Helper()
	path := filepath.Join(dir, name)
	data := append([]byte{}, pngSignature...)
	data = append(data, make([]byte, extraBytes)...)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("escrevendo imagem de teste: %v", err)
	}
	return path
}

// Trava o fluxo central de 2026-09-08: trocar a logo de um console pela
// interface grava um arquivo próprio, que passa a vencer a logo embutida —
// e DELETE desfaz, voltando a servir a embutida.
func TestSetConsoleImageOverridesEmbeddedAndReset(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	src := writeFakeImage(t, t.TempDir(), "logo-customizada.png", 100)

	before := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/consoles/n64/image", nil)
	if before.Code != http.StatusOK {
		t.Fatalf("GET antes da troca: status = %d, esperado 200 (n64 já tem imagem embutida)", before.Code)
	}
	embedded := before.Body.Bytes()

	setRec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/consoles/n64/image", map[string]any{
		"source_path": src,
	})
	if setRec.Code != http.StatusOK {
		t.Fatalf("POST .../image: status = %d, esperado 200, corpo: %s", setRec.Code, setRec.Body.String())
	}

	after := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/consoles/n64/image", nil)
	if after.Code != http.StatusOK {
		t.Fatalf("GET depois da troca: status = %d, esperado 200", after.Code)
	}
	if string(after.Body.Bytes()) == string(embedded) {
		t.Fatal("GET depois de trocar ainda devolveu a imagem embutida — a customizada deveria vencer")
	}
	wantLen := len(pngSignature) + 100
	if got := after.Body.Len(); got != wantLen {
		t.Fatalf("tamanho da imagem servida = %d, esperado %d (a customizada gravada)", got, wantLen)
	}

	resetRec := doJSON(t, server.Routes(), http.MethodDelete, "/api/v1/consoles/n64/image", nil)
	if resetRec.Code != http.StatusOK {
		t.Fatalf("DELETE .../image: status = %d, esperado 200, corpo: %s", resetRec.Code, resetRec.Body.String())
	}

	afterReset := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/consoles/n64/image", nil)
	if string(afterReset.Body.Bytes()) != string(embedded) {
		t.Fatal("GET depois do DELETE deveria voltar a servir a imagem embutida original")
	}
}

func TestSetConsoleImageRejectsUnknownConsole(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	src := writeFakeImage(t, t.TempDir(), "logo.png", 10)

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/consoles/console-que-nao-existe/image", map[string]any{
		"source_path": src,
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "unknown_console" {
		t.Fatalf("code = %q, esperado unknown_console", code)
	}
}

func TestSetConsoleImageRejectsMissingSourcePath(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/consoles/n64/image", map[string]any{})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "missing_fields" {
		t.Fatalf("code = %q, esperado missing_fields", code)
	}
}

// Trava que um arquivo que não é imagem nenhuma (texto puro) é recusado
// antes de virar a logo de um console — nunca silenciosamente aceito.
func TestSetConsoleImageRejectsNonImageFile(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	dir := t.TempDir()
	notAnImage := filepath.Join(dir, "nao-e-imagem.txt")
	if err := os.WriteFile(notAnImage, []byte("isto é só texto, não uma imagem"), 0o644); err != nil {
		t.Fatalf("escrevendo arquivo de teste: %v", err)
	}

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/consoles/n64/image", map[string]any{
		"source_path": notAnImage,
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400, corpo: %s", rec.Code, rec.Body.String())
	}
	if code := errorCode(decodeBody(t, rec)); code != "invalid_image" {
		t.Fatalf("code = %q, esperado invalid_image", code)
	}
}

// Trava o teto de tamanho (mesmo valor que o scraper do IGDB já aceita para
// capa) — um arquivo maior que isso é recusado, não truncado nem aceito.
func TestSetConsoleImageRejectsOversizedFile(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	const eightMiB = 8 << 20
	src := writeFakeImage(t, t.TempDir(), "logo-grande.png", eightMiB+1)

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/consoles/n64/image", map[string]any{
		"source_path": src,
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400, corpo: %s", rec.Code, rec.Body.String())
	}
	if code := errorCode(decodeBody(t, rec)); code != "image_too_large" {
		t.Fatalf("code = %q, esperado image_too_large", code)
	}
}

func TestSetConsoleImageRejectsMissingSourceFile(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/consoles/n64/image", map[string]any{
		"source_path": filepath.Join(t.TempDir(), "nao-existe.png"),
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400, corpo: %s", rec.Code, rec.Body.String())
	}
	if code := errorCode(decodeBody(t, rec)); code != "path_not_found" {
		t.Fatalf("code = %q, esperado path_not_found", code)
	}
}

// Trava o fluxo central de capa customizada (2026-09-08): POST .../cover
// grava a capa e o jogo passa a devolver esse cover_url em
// GET /library/games — a mesma mecânica de gravação da logo de console,
// só que gravando no lugar que o scraper automático já usa.
func TestSetGameCoverOverridesCoverURL(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Jogo.nes"), []byte("x"), 0o644); err != nil {
		t.Fatalf("criando ROM de teste: %v", err)
	}
	doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders", map[string]any{
		"console_id": "nes",
		"path":       dir,
	})
	gamesRec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?console_id=nes", nil)
	games := decodeBody(t, gamesRec)["games"].([]any)
	if len(games) != 1 {
		t.Fatalf("setup: esperava 1 jogo, veio %d", len(games))
	}
	game := games[0].(map[string]any)
	if game["cover_url"] != nil {
		t.Fatalf("setup: esperava cover_url ausente antes da troca, veio %v", game["cover_url"])
	}
	id := int64(game["id"].(float64))

	src := writeFakeImage(t, t.TempDir(), "capa.png", 50)
	setRec := doJSON(t, server.Routes(), http.MethodPost,
		"/api/v1/library/games/"+strconv.FormatInt(id, 10)+"/cover", map[string]any{"source_path": src})
	if setRec.Code != http.StatusOK {
		t.Fatalf("POST .../cover: status = %d, esperado 200, corpo: %s", setRec.Code, setRec.Body.String())
	}
	coverURL, _ := decodeBody(t, setRec)["cover_url"].(string)
	if coverURL == "" {
		t.Fatal("resposta de POST .../cover deveria trazer cover_url preenchido")
	}

	gamesRec2 := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?console_id=nes", nil)
	games2 := decodeBody(t, gamesRec2)["games"].([]any)
	if got := games2[0].(map[string]any)["cover_url"]; got != coverURL {
		t.Fatalf("GET /library/games depois da troca: cover_url = %v, esperado %q", got, coverURL)
	}

	imgRec := doJSON(t, server.Routes(), http.MethodGet, coverURL, nil)
	if imgRec.Code != http.StatusOK {
		t.Fatalf("GET %s: status = %d, esperado 200 — a capa gravada deveria ser servível", coverURL, imgRec.Code)
	}
}

func TestSetGameCoverRejectsUnknownGame(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	src := writeFakeImage(t, t.TempDir(), "capa.png", 10)

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/games/999999/cover", map[string]any{
		"source_path": src,
	})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, esperado 404", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "not_found" {
		t.Fatalf("code = %q, esperado not_found", code)
	}
}
