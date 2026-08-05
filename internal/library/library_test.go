package library

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/doufl/zeux/internal/store"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	db, err := store.OpenAt(filepath.Join(t.TempDir(), "zeux.db"))
	if err != nil {
		t.Fatalf("store.OpenAt: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewStore(db)
}

// Apontar a mesma pasta duas vezes para o mesmo console não pode criar uma
// segunda linha — é o que faz a tela "apontar pasta" idempotente mesmo se o
// usuário clicar de novo, ou se a interface reenviar por engano.
func TestAddFolderIsIdempotent(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	first, err := s.AddFolder(ctx, "ps1", "/jogos/ps1")
	if err != nil {
		t.Fatalf("primeiro AddFolder: %v", err)
	}

	second, err := s.AddFolder(ctx, "ps1", "/jogos/ps1")
	if err != nil {
		t.Fatalf("segundo AddFolder: %v", err)
	}

	if first.ID != second.ID {
		t.Errorf("esperava o mesmo id (%d), achou %d", first.ID, second.ID)
	}

	folders, err := s.ListFolders(ctx)
	if err != nil {
		t.Fatalf("ListFolders: %v", err)
	}
	if len(folders) != 1 {
		t.Fatalf("esperava 1 pasta, achou %d", len(folders))
	}
}

// A mesma pasta em consoles diferentes é uma escolha estranha do usuário,
// mas não é a mesma pasta — cada console tem sua própria linha.
func TestAddFolderAllowsSamePathForDifferentConsoles(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	if _, err := s.AddFolder(ctx, "ps1", "/jogos/misturado"); err != nil {
		t.Fatalf("AddFolder ps1: %v", err)
	}
	if _, err := s.AddFolder(ctx, "ps2", "/jogos/misturado"); err != nil {
		t.Fatalf("AddFolder ps2: %v", err)
	}

	folders, err := s.ListFolders(ctx)
	if err != nil {
		t.Fatalf("ListFolders: %v", err)
	}
	if len(folders) != 2 {
		t.Fatalf("esperava 2 pastas (uma por console), achou %d", len(folders))
	}
}

// Remover uma pasta remove só os jogos que vieram dela — nunca os de outra
// pasta, mesmo do mesmo console.
func TestRemoveFolderDeletesOnlyItsOwnGames(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	keep, err := s.AddFolder(ctx, "ps1", "/jogos/manter")
	if err != nil {
		t.Fatalf("AddFolder (manter): %v", err)
	}
	remove, err := s.AddFolder(ctx, "ps1", "/jogos/remover")
	if err != nil {
		t.Fatalf("AddFolder (remover): %v", err)
	}

	if err := s.SaveGames(ctx, keep.ID, []NewGame{
		{ConsoleID: "ps1", Path: "/jogos/manter/a.bin", Title: "A"},
	}); err != nil {
		t.Fatalf("SaveGames (manter): %v", err)
	}
	if err := s.SaveGames(ctx, remove.ID, []NewGame{
		{ConsoleID: "ps1", Path: "/jogos/remover/b.bin", Title: "B"},
	}); err != nil {
		t.Fatalf("SaveGames (remover): %v", err)
	}

	if err := s.RemoveFolder(ctx, remove.ID); err != nil {
		t.Fatalf("RemoveFolder: %v", err)
	}

	games, err := s.ListGames(ctx, "ps1")
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if len(games) != 1 {
		t.Fatalf("esperava 1 jogo sobrevivendo, achou %d", len(games))
	}
	if games[0].Path != "/jogos/manter/a.bin" {
		t.Errorf("sobrou o jogo errado: %q", games[0].Path)
	}
}

// RemoveFolder num id inexistente precisa avisar, não falhar em silêncio —
// quem chamou pode ter perdido a referência do id por um bug em outro lugar.
func TestRemoveFolderRejectsUnknownID(t *testing.T) {
	s := newTestStore(t)
	if err := s.RemoveFolder(context.Background(), 999); err == nil {
		t.Error("esperava erro ao remover uma pasta que não existe")
	}
}

// Varrer a mesma pasta duas vezes não pode duplicar o jogo — SaveGames
// precisa ser seguro para chamar de novo com o mesmo resultado de varredura.
func TestSaveGamesDoesNotDuplicateOnRepeatedScan(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	folder, err := s.AddFolder(ctx, "n64", "/jogos/n64")
	if err != nil {
		t.Fatalf("AddFolder: %v", err)
	}

	found := []NewGame{
		{ConsoleID: "n64", Path: "/jogos/n64/mario.z64", Title: "Mario"},
		{ConsoleID: "n64", Path: "/jogos/n64/zelda.z64", Title: "Zelda"},
	}

	if err := s.SaveGames(ctx, folder.ID, found); err != nil {
		t.Fatalf("primeira varredura: %v", err)
	}
	if err := s.SaveGames(ctx, folder.ID, found); err != nil {
		t.Fatalf("segunda varredura (mesma pasta de novo): %v", err)
	}

	games, err := s.ListGames(ctx, "n64")
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if len(games) != 2 {
		t.Fatalf("esperava 2 jogos após varrer duas vezes, achou %d", len(games))
	}
}

// ListGames filtra por console — a tela da biblioteca (05) não deveria ter
// que filtrar no cliente o que o servidor já sabe separar.
func TestListGamesFiltersByConsole(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	ps1, err := s.AddFolder(ctx, "ps1", "/jogos/ps1")
	if err != nil {
		t.Fatalf("AddFolder ps1: %v", err)
	}
	n64, err := s.AddFolder(ctx, "n64", "/jogos/n64")
	if err != nil {
		t.Fatalf("AddFolder n64: %v", err)
	}

	if err := s.SaveGames(ctx, ps1.ID, []NewGame{{ConsoleID: "ps1", Path: "/jogos/ps1/a.bin", Title: "A"}}); err != nil {
		t.Fatalf("SaveGames ps1: %v", err)
	}
	if err := s.SaveGames(ctx, n64.ID, []NewGame{{ConsoleID: "n64", Path: "/jogos/n64/b.z64", Title: "B"}}); err != nil {
		t.Fatalf("SaveGames n64: %v", err)
	}

	ps1Games, err := s.ListGames(ctx, "ps1")
	if err != nil {
		t.Fatalf("ListGames ps1: %v", err)
	}
	if len(ps1Games) != 1 || ps1Games[0].ConsoleID != "ps1" {
		t.Errorf("ListGames(ps1) = %+v, esperava só o jogo de ps1", ps1Games)
	}
}

// Diferente de ListGames, ListAllGames não filtra por console — é a base da
// tela "Todos os jogos" (2026-08-04), que lista sem escolher console
// primeiro.
func TestListAllGamesIncludesEveryConsole(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	ps1, err := s.AddFolder(ctx, "ps1", "/jogos/ps1")
	if err != nil {
		t.Fatalf("AddFolder ps1: %v", err)
	}
	n64, err := s.AddFolder(ctx, "n64", "/jogos/n64")
	if err != nil {
		t.Fatalf("AddFolder n64: %v", err)
	}

	if err := s.SaveGames(ctx, ps1.ID, []NewGame{{ConsoleID: "ps1", Path: "/jogos/ps1/a.bin", Title: "A"}}); err != nil {
		t.Fatalf("SaveGames ps1: %v", err)
	}
	if err := s.SaveGames(ctx, n64.ID, []NewGame{{ConsoleID: "n64", Path: "/jogos/n64/b.z64", Title: "B"}}); err != nil {
		t.Fatalf("SaveGames n64: %v", err)
	}

	all, err := s.ListAllGames(ctx, "")
	if err != nil {
		t.Fatalf("ListAllGames: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("ListAllGames = %+v, esperava 2 jogos (um de cada console)", all)
	}
}

// Busca por título (2026-08-04, tela "Todos os jogos") filtra sem
// diferenciar maiúsculas/minúsculas, e curingas de LIKE digitados pelo
// usuário (%, _) não podem escapar do filtro por acidente.
func TestListAllGamesFiltersByTitleCaseInsensitive(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	folder, err := s.AddFolder(ctx, "ps1", "/jogos/ps1")
	if err != nil {
		t.Fatalf("AddFolder: %v", err)
	}
	games := []NewGame{
		{ConsoleID: "ps1", Path: "/jogos/ps1/chrono.bin", Title: "Chrono Trigger"},
		{ConsoleID: "ps1", Path: "/jogos/ps1/sonic.bin", Title: "Sonic 2"},
		{ConsoleID: "ps1", Path: "/jogos/ps1/percent.bin", Title: "100% Orange Juice"},
	}
	if err := s.SaveGames(ctx, folder.ID, games); err != nil {
		t.Fatalf("SaveGames: %v", err)
	}

	found, err := s.ListAllGames(ctx, "chrono")
	if err != nil {
		t.Fatalf("ListAllGames: %v", err)
	}
	if len(found) != 1 || found[0].Title != "Chrono Trigger" {
		t.Fatalf("ListAllGames(chrono) = %+v, esperava só Chrono Trigger (busca case-insensitive)", found)
	}

	// "%" no termo de busca não pode virar curinga solto — sem escapar,
	// "100%" casaria com qualquer título que comece com "100".
	percentMatch, err := s.ListAllGames(ctx, "100%")
	if err != nil {
		t.Fatalf("ListAllGames: %v", err)
	}
	if len(percentMatch) != 1 || percentMatch[0].Title != "100% Orange Juice" {
		t.Fatalf("ListAllGames(100%%) = %+v, esperava só \"100%% Orange Juice\"", percentMatch)
	}
}
