package api_test

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"testing"
	"time"

	"github.com/doufl/zeux/internal/emulator"
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

// Trava o critério de aceite de "um caminho para todos os jogos"
// (2026-08-05): uma pasta-raiz com subpastas nomeadas por console tem cada
// subpasta reconhecida e varrida, sem precisar apontar console por console.
func TestBulkAddLibraryFoldersMatchesSubfoldersByName(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	root := t.TempDir()
	nesDir := filepath.Join(root, "NES")
	snesDir := filepath.Join(root, "Super Nintendo") // casa por Name, não por ID
	weirdDir := filepath.Join(root, "Pasta Qualquer")
	for _, dir := range []string{nesDir, snesDir, weirdDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("criando %s: %v", dir, err)
		}
	}
	if err := os.WriteFile(filepath.Join(nesDir, "Jogo (USA).nes"), []byte("x"), 0o644); err != nil {
		t.Fatalf("criando ROM de teste: %v", err)
	}
	if err := os.WriteFile(filepath.Join(snesDir, "Outro Jogo.sfc"), []byte("x"), 0o644); err != nil {
		t.Fatalf("criando ROM de teste: %v", err)
	}

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders/bulk", map[string]any{
		"path": root,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperado 200, corpo: %s", rec.Code, rec.Body.String())
	}

	body := decodeBody(t, rec)
	matched, ok := body["matched"].([]any)
	if !ok || len(matched) != 2 {
		t.Fatalf("matched = %v, esperava 2 entradas", body["matched"])
	}
	unmatched, ok := body["unmatched"].([]any)
	if !ok || len(unmatched) != 1 || unmatched[0] != "Pasta Qualquer" {
		t.Fatalf("unmatched = %v, esperava [\"Pasta Qualquer\"]", body["unmatched"])
	}

	byConsole := map[string]float64{}
	for _, m := range matched {
		entry := m.(map[string]any)
		byConsole[entry["console_id"].(string)] = entry["games_found"].(float64)
	}
	if byConsole["nes"] != 1 {
		t.Fatalf("games_found para nes = %v, esperado 1", byConsole["nes"])
	}
	if byConsole["snes"] != 1 {
		t.Fatalf("games_found para snes = %v, esperado 1", byConsole["snes"])
	}
}

// Trava que um caminho inexistente é 400 nomeando o problema, não 500 —
// mesma convenção de TestAddLibraryFolderRejectsMissingPath.
func TestBulkAddLibraryFoldersRejectsMissingPath(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders/bulk", map[string]any{
		"path": filepath.Join(t.TempDir(), "nao-existe"),
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "path_not_found" {
		t.Fatalf("code = %q, esperado path_not_found", code)
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

// Trava o L11: GET /library/games junta tempo de jogo e "jogado por último"
// vindos das sessões (por rom_path), sem que o launcher precise conhecer a
// biblioteca — a junção é feita na API (docs/arquitetura-a-preservar.md).
func TestLibraryGamesIncludePlaytimeAndLastPlayed(t *testing.T) {
	server, db := newTestServerWithDB(t, fakeProbe{})
	dir := t.TempDir()

	pathA := filepath.Join(dir, "Jogo Antigo.nes")
	pathB := filepath.Join(dir, "Jogo Recente.nes")
	if err := os.WriteFile(pathA, []byte("x"), 0o644); err != nil {
		t.Fatalf("criando ROM A: %v", err)
	}
	if err := os.WriteFile(pathB, []byte("x"), 0o644); err != nil {
		t.Fatalf("criando ROM B: %v", err)
	}

	addRec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders", map[string]any{
		"console_id": "nes",
		"path":       dir,
	})
	if found, _ := decodeBody(t, addRec)["games_found"].(float64); found != 2 {
		t.Fatalf("games_found = %v, esperado 2", found)
	}

	// Duas sessões inseridas direto no banco — sem depender de um emulador de
	// verdade rodando. A ordenação espera pathB por cima, por ter sido jogado
	// mais recentemente, mesmo que pathA tenha mais tempo total.
	sessions := emulator.NewSQLiteSessions(db)
	insertClosedSession(t, sessions, "nes", pathA, time.Now().Add(-2*time.Hour), 300*time.Second)
	insertClosedSession(t, sessions, "nes", pathB, time.Now().Add(-10*time.Minute), 60*time.Second)

	rec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?console_id=nes", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperado 200, corpo: %s", rec.Code, rec.Body.String())
	}

	games := decodeBody(t, rec)["games"].([]any)
	if len(games) != 2 {
		t.Fatalf("esperava 2 jogos, veio %d", len(games))
	}

	first := games[0].(map[string]any)
	if first["path"] != pathB {
		t.Fatalf("primeiro jogo = %v, esperado o mais recém-jogado (%s)", first["path"], pathB)
	}
	if playtime, _ := first["playtime_seconds"].(float64); playtime != 60 {
		t.Fatalf("playtime_seconds do mais recente = %v, esperado 60", first["playtime_seconds"])
	}
	if first["last_played_at"] == nil || first["last_played_at"] == "" {
		t.Fatal("esperava last_played_at preenchido no jogo mais recente")
	}

	second := games[1].(map[string]any)
	if second["path"] != pathA {
		t.Fatalf("segundo jogo = %v, esperado o mais antigo (%s)", second["path"], pathA)
	}
	if playtime, _ := second["playtime_seconds"].(float64); playtime != 300 {
		t.Fatalf("playtime_seconds do mais antigo = %v, esperado 300", second["playtime_seconds"])
	}
}

// Trava a tela "Todos os jogos" (2026-08-04): sem console_id, GET
// /library/games lista jogos de todos os consoles juntos, paginado por
// page/page_size, com total presente para a interface calcular quantas
// páginas existem.
func TestLibraryGamesWithoutConsoleIDPaginatesAcrossConsoles(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	dir := t.TempDir()

	roms := map[string]string{"nes": "jogo.nes", "snes": "jogo.sfc", "n64": "jogo.z64"}
	for consoleID, filename := range roms {
		path := filepath.Join(dir, consoleID+"-"+filename)
		if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
			t.Fatalf("criando ROM de %s: %v", consoleID, err)
		}
		rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders", map[string]any{
			"console_id": consoleID,
			"path":       dir,
		})
		if rec.Code != http.StatusOK {
			t.Fatalf("apontando pasta de %s: status %d, corpo %s", consoleID, rec.Code, rec.Body.String())
		}
	}

	rec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?page=1&page_size=2", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperado 200, corpo: %s", rec.Code, rec.Body.String())
	}

	body := decodeBody(t, rec)
	games := body["games"].([]any)
	if len(games) != 2 {
		t.Fatalf("esperava 2 jogos na primeira página (page_size=2), veio %d", len(games))
	}
	if total, _ := body["total"].(float64); total != 3 {
		t.Fatalf("total = %v, esperado 3 (um jogo por console apontado)", body["total"])
	}

	rec2 := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?page=2&page_size=2", nil)
	games2 := decodeBody(t, rec2)["games"].([]any)
	if len(games2) != 1 {
		t.Fatalf("esperava 1 jogo na segunda página, veio %d", len(games2))
	}

	// Busca (?q=, 2026-08-04) acha o jogo mesmo estando fora da primeira
	// página — a rota filtra no SQL, não no cliente, exatamente por isso.
	recQ := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?page=1&page_size=2&q=n64", nil)
	gamesQ := decodeBody(t, recQ)["games"].([]any)
	if len(gamesQ) != 1 {
		t.Fatalf("esperava 1 jogo casando com \"n64\" no título, veio %d", len(gamesQ))
	}
	if title, _ := gamesQ[0].(map[string]any)["title"].(string); title != "n64-jogo" {
		t.Fatalf("título do jogo achado = %q, esperado \"n64-jogo\"", title)
	}
}

// Trava o critério de aceite central do G4: favoritar marca na hora, GET
// /library/games devolve o campo sempre presente, e desfavoritar desfaz.
func TestFavoriteGameTogglesAndReflectsInListing(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Jogo.nes"), []byte("x"), 0o644); err != nil {
		t.Fatalf("criando ROM de teste: %v", err)
	}

	addRec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders", map[string]any{
		"console_id": "nes",
		"path":       dir,
	})
	gamesRec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?console_id=nes", nil)
	games := decodeBody(t, gamesRec)["games"].([]any)
	if len(games) != 1 {
		t.Fatalf("setup: esperava 1 jogo, veio %d (add: %d)", len(games), decodeBody(t, addRec)["games_found"])
	}
	game := games[0].(map[string]any)
	if fav, ok := game["favorite"]; !ok || fav != false {
		t.Fatalf("favorite = %v (presente=%v), esperado false sempre presente", fav, ok)
	}
	id := int64(game["id"].(float64))

	favRec := doJSON(t, server.Routes(), http.MethodPost,
		"/api/v1/library/games/"+strconv.FormatInt(id, 10)+"/favorite", nil)
	if favRec.Code != http.StatusOK {
		t.Fatalf("status ao favoritar = %d, esperado 200, corpo: %s", favRec.Code, favRec.Body.String())
	}
	if fav, _ := decodeBody(t, favRec)["favorite"].(bool); !fav {
		t.Fatal("resposta de POST .../favorite deveria trazer favorite=true")
	}

	gamesRec2 := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?console_id=nes", nil)
	games2 := decodeBody(t, gamesRec2)["games"].([]any)
	if fav, _ := games2[0].(map[string]any)["favorite"].(bool); !fav {
		t.Fatal("GET /library/games depois de favoritar deveria trazer favorite=true")
	}

	unfavRec := doJSON(t, server.Routes(), http.MethodDelete,
		"/api/v1/library/games/"+strconv.FormatInt(id, 10)+"/favorite", nil)
	if unfavRec.Code != http.StatusOK {
		t.Fatalf("status ao desfavoritar = %d, esperado 200", unfavRec.Code)
	}
	if fav, _ := decodeBody(t, unfavRec)["favorite"].(bool); fav {
		t.Fatal("resposta de DELETE .../favorite deveria trazer favorite=false")
	}
}

// Trava que favoritar um id inexistente é 404 com code estável — não 500
// nem 200 silencioso (critério de aceite explícito do G4).
func TestFavoriteUnknownGameReturns404(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/games/999999/favorite", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, esperado 404", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "not_found" {
		t.Fatalf("code = %q, esperado not_found", code)
	}
}

// Trava ?favorite=true no modo "todos os jogos": só os favoritados voltam.
func TestLibraryGamesFilterByFavorite(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.nes"), []byte("x"), 0o644); err != nil {
		t.Fatalf("criando ROM a: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "b.nes"), []byte("x"), 0o644); err != nil {
		t.Fatalf("criando ROM b: %v", err)
	}
	doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders", map[string]any{
		"console_id": "nes",
		"path":       dir,
	})

	gamesRec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?page=1&page_size=10", nil)
	games := decodeBody(t, gamesRec)["games"].([]any)
	if len(games) != 2 {
		t.Fatalf("setup: esperava 2 jogos, veio %d", len(games))
	}
	id := int64(games[0].(map[string]any)["id"].(float64))
	doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/games/"+strconv.FormatInt(id, 10)+"/favorite", nil)

	favRec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?page=1&page_size=10&favorite=true", nil)
	favGames := decodeBody(t, favRec)["games"].([]any)
	if len(favGames) != 1 {
		t.Fatalf("esperava 1 jogo com ?favorite=true, veio %d", len(favGames))
	}
	if got := int64(favGames[0].(map[string]any)["id"].(float64)); got != id {
		t.Fatalf("jogo filtrado = %d, esperado %d", got, id)
	}
}

// Trava o critério central do M4 (docs/sprint-m-plano.md): o campo
// `consoles` da resposta reflete o resultado COMPLETO (antes de `?platform=`
// e da paginação), e `?platform=<console_id>` pagina só dentro daquele
// console — "página 2 de PS1" é a segunda página só dos jogos de PS1, não a
// segunda página do acervo inteiro filtrada depois.
func TestLibraryGamesFilterByPlatformAndConsolesField(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	dir := t.TempDir()

	// 3 jogos de nes, 1 de snes — dá pra distinguir "não filtrado" (4) de
	// "filtrado por nes, paginado de 2 em 2" (3, em duas páginas).
	for _, name := range []string{"a.nes", "b.nes", "c.nes"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatalf("criando ROM %s: %v", name, err)
		}
	}
	doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders", map[string]any{
		"console_id": "nes",
		"path":       dir,
	})
	snesDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(snesDir, "d.sfc"), []byte("x"), 0o644); err != nil {
		t.Fatalf("criando ROM snes: %v", err)
	}
	doJSON(t, server.Routes(), http.MethodPost, "/api/v1/library/folders", map[string]any{
		"console_id": "snes",
		"path":       snesDir,
	})

	// `consoles` no resultado sem filtro precisa trazer os dois, mesmo com
	// page_size menor que o total — é o resultado completo, não a página.
	allRec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?page=1&page_size=2", nil)
	allBody := decodeBody(t, allRec)
	consoles := toStringSlice(t, allBody["consoles"])
	if !slices.Equal(consoles, []string{"nes", "snes"}) {
		t.Fatalf("consoles = %v, esperado [nes snes] (ordenado, do resultado completo)", consoles)
	}

	// `consoles` continua trazendo os dois mesmo já filtrando por
	// ?platform=nes — é calculado ANTES do filtro (senão o chip "snes"
	// desapareceria do próprio filtro assim que o usuário o escolhesse).
	page1 := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?page=1&page_size=2&platform=nes", nil)
	page1Body := decodeBody(t, page1)
	if got := toStringSlice(t, page1Body["consoles"]); !slices.Equal(got, []string{"nes", "snes"}) {
		t.Fatalf("consoles com ?platform=nes = %v, esperado [nes snes] (não filtrado pelo platform)", got)
	}
	if total, _ := page1Body["total"].(float64); total != 3 {
		t.Fatalf("total com ?platform=nes = %v, esperado 3 (só os jogos de nes)", page1Body["total"])
	}
	page1Games := page1Body["games"].([]any)
	if len(page1Games) != 2 {
		t.Fatalf("página 1 (?platform=nes&page_size=2) = %d jogos, esperado 2", len(page1Games))
	}
	for _, g := range page1Games {
		if cid, _ := g.(map[string]any)["console_id"].(string); cid != "nes" {
			t.Fatalf("jogo com console_id = %q na página filtrada por nes", cid)
		}
	}

	page2 := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/library/games?page=2&page_size=2&platform=nes", nil)
	page2Games := decodeBody(t, page2)["games"].([]any)
	if len(page2Games) != 1 {
		t.Fatalf("página 2 (?platform=nes&page_size=2) = %d jogos, esperado 1 (3 no total)", len(page2Games))
	}
}

func toStringSlice(t *testing.T, raw any) []string {
	t.Helper()
	list, ok := raw.([]any)
	if !ok {
		t.Fatalf("campo não é array: %#v", raw)
	}
	out := make([]string, len(list))
	for i, v := range list {
		s, ok := v.(string)
		if !ok {
			t.Fatalf("elemento %d não é string: %#v", i, v)
		}
		out[i] = s
	}
	return out
}

func insertClosedSession(t *testing.T, sessions *emulator.SQLiteSessions, consoleID, romPath string, startedAt time.Time, duration time.Duration) {
	t.Helper()
	ctx := context.Background()

	id, err := sessions.Insert(ctx, emulator.Session{
		ConsoleID: consoleID,
		AdapterID: "retroarch",
		Emulator:  "RetroArch",
		ROMPath:   romPath,
		StartedAt: startedAt,
	})
	if err != nil {
		t.Fatalf("inserindo sessão de teste: %v", err)
	}

	if err := sessions.Close(ctx, id, startedAt.Add(duration), ""); err != nil {
		t.Fatalf("fechando sessão de teste: %v", err)
	}
}
