package api_test

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

// Trava o critério de aceite do L5: apontar uma pasta existente para um
// console do catálogo grava a pasta e já devolve quantos jogos a varredura
// achou, sem exigir uma segunda chamada.
func TestAddLibraryFolderScansImmediately(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Jogo (USA).nes"), []byte("x"), 0o644); err != nil {
		t.Fatalf("criando ROM de teste: %v", err)
	}

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders", map[string]any{
		"console_id": "nes",
		"path":       dir,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperado 200, corpo: %s", rec.Code, rec.Body.String())
	}

	body := decodeBody(t, rec)
	if found, _ := body["games_found"].(float64); found != 1 {
		t.Fatalf("games_found = %v, esperado 1", body["games_found"])
	}

	folder, ok := body["folder"].(map[string]any)
	if !ok {
		t.Fatalf("esperava o campo folder no corpo, veio %v", body)
	}
	if folder["console_id"] != "nes" {
		t.Fatalf("folder.console_id = %v, esperado nes", folder["console_id"])
	}
}

// Trava que apontar um console fora do catálogo é 400 nomeando o problema,
// não um erro genérico — mesma regra de "erro é frase acionável" do resto da
// API.
func TestAddLibraryFolderRejectsUnknownConsole(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders", map[string]any{
		"console_id": "console-inexistente",
		"path":       t.TempDir(),
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "unknown_console" {
		t.Fatalf("code = %q, esperado unknown_console", code)
	}
}

// Trava que apontar um caminho que não existe no disco é 400 nomeando o
// caminho, não 500 — regra 10 do CLAUDE.md (falha do usuário não é erro de
// servidor).
func TestAddLibraryFolderRejectsMissingPath(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders", map[string]any{
		"console_id": "nes",
		"path":       "/caminho/que/nao/existe/de/verdade",
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "path_not_found" {
		t.Fatalf("code = %q, esperado path_not_found", code)
	}
}

// Trava que listar pastas devolve o que foi apontado, e que remover some da
// listagem seguinte — o roteiro completo do L5 sem precisar de UI.
func TestLibraryFoldersListAndRemove(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	dir := t.TempDir()

	addRec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders", map[string]any{
		"console_id": "nes",
		"path":       dir,
	})
	folder := decodeBody(t, addRec)["folder"].(map[string]any)
	id := int64(folder["id"].(float64))

	listRec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/folders", nil)
	folders := decodeBody(t, listRec)["folders"].([]any)
	if len(folders) != 1 {
		t.Fatalf("esperava 1 pasta listada, veio %d", len(folders))
	}

	delRec := doJSON(t, server.Routes(), http.MethodDelete,
		"/api/v1/library/folders/"+strconv.FormatInt(id, 10), nil)
	if delRec.Code != http.StatusOK {
		t.Fatalf("status da remoção = %d, esperado 200", delRec.Code)
	}

	listRec2 := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/folders", nil)
	folders2 := decodeBody(t, listRec2)["folders"].([]any)
	if len(folders2) != 0 {
		t.Fatalf("esperava 0 pastas após remoção, veio %d", len(folders2))
	}
}

// Trava o caso central do L2/L5 juntos: um arquivo novo aparece numa
// revarredura sem precisar reapontar a pasta, e o jogo aparece em
// /library/games para o console certo.
func TestLibraryFolderRescanFindsNewFiles(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	dir := t.TempDir()

	addRec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders", map[string]any{
		"console_id": "nes",
		"path":       dir,
	})
	folder := decodeBody(t, addRec)["folder"].(map[string]any)
	id := int64(folder["id"].(float64))

	if err := os.WriteFile(filepath.Join(dir, "Novo Jogo.nes"), []byte("x"), 0o644); err != nil {
		t.Fatalf("criando segunda ROM: %v", err)
	}

	scanRec := doJSON(t, server.Routes(), http.MethodPost,
		"/api/v1/library/folders/"+strconv.FormatInt(id, 10)+"/scan", nil)
	if scanRec.Code != http.StatusOK {
		t.Fatalf("status da revarredura = %d, esperado 200, corpo: %s", scanRec.Code, scanRec.Body.String())
	}
	if found, _ := decodeBody(t, scanRec)["games_found"].(float64); found != 1 {
		t.Fatalf("games_found na revarredura = %v, esperado 1 (só o arquivo novo)", found)
	}

	gamesRec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?console_id=nes", nil)
	games := decodeBody(t, gamesRec)["games"].([]any)
	if len(games) != 1 {
		t.Fatalf("esperava 1 jogo listado para nes, veio %d", len(games))
	}
}
