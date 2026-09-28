package emulator

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/doufl/zeux/internal/store"
)

// O ciclo completo (gravar, fechar, listar) precisa ir e voltar do SQLite de
// verdade sem perder nenhum campo — é o que prova que a troca do slice em
// memória pelo banco (ADR 0011) não regrediu nada que a API expõe.
func TestSQLiteSessionsRoundTrip(t *testing.T) {
	db, err := store.OpenAt(filepath.Join(t.TempDir(), "zeux.db"))
	if err != nil {
		t.Fatalf("OpenAt: %v", err)
	}
	defer db.Close()

	repo := NewSQLiteSessions(db)
	ctx := context.Background()

	started := time.Date(2026, 8, 2, 10, 0, 0, 0, time.UTC)
	id, err := repo.Insert(ctx, Session{
		ConsoleID: "ps1",
		AdapterID: "duckstation",
		Emulator:  "DuckStation",
		ROMPath:   "/jogos/crash.bin",
		StartedAt: started,
		Unapplied: []string{"resolução interna manual"},
	})
	if err != nil {
		t.Fatalf("Insert: %v", err)
	}
	if id == "" {
		t.Fatal("Insert devolveu id vazio")
	}

	sessions, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("List (sessão em andamento): %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("esperava 1 sessão, achou %d", len(sessions))
	}
	got := sessions[0]
	if got.ID != id || got.ConsoleID != "ps1" || got.ROMPath != "/jogos/crash.bin" {
		t.Errorf("sessão lida = %+v, não bate com o que foi gravado", got)
	}
	if !got.StartedAt.Equal(started) {
		t.Errorf("StartedAt = %v, queria %v", got.StartedAt, started)
	}
	if len(got.Unapplied) != 1 || got.Unapplied[0] != "resolução interna manual" {
		t.Errorf("Unapplied = %v, não sobreviveu ao round-trip", got.Unapplied)
	}
	if !got.Running() {
		t.Error("sessão sem Close deveria estar em andamento")
	}

	ended := started.Add(90 * time.Minute)
	if err := repo.Close(ctx, id, ended, "exit status 1"); err != nil {
		t.Fatalf("Close: %v", err)
	}

	sessions, err = repo.List(ctx)
	if err != nil {
		t.Fatalf("List (sessão encerrada): %v", err)
	}
	got = sessions[0]
	if got.Running() {
		t.Error("sessão fechada não deveria aparecer como em andamento")
	}
	if got.EndedAt == nil || !got.EndedAt.Equal(ended) {
		t.Errorf("EndedAt = %v, queria %v", got.EndedAt, ended)
	}
	if got.ExitError != "exit status 1" {
		t.Errorf("ExitError = %q, queria %q", got.ExitError, "exit status 1")
	}
	if got.Duration() != 90*time.Minute {
		t.Errorf("Duration = %v, queria 90m", got.Duration())
	}
}

// List ordena da mais recente para a mais antiga — mesma regra que o slice em
// memória sempre seguiu (GET /sessions documenta isso em docs/api.md).
func TestSQLiteSessionsListOrdersMostRecentFirst(t *testing.T) {
	db, err := store.OpenAt(filepath.Join(t.TempDir(), "zeux.db"))
	if err != nil {
		t.Fatalf("OpenAt: %v", err)
	}
	defer db.Close()

	repo := NewSQLiteSessions(db)
	ctx := context.Background()

	for _, console := range []string{"ps1", "ps2", "n64"} {
		if _, err := repo.Insert(ctx, Session{
			ConsoleID: console,
			AdapterID: "x",
			Emulator:  "x",
			ROMPath:   "/jogo",
			StartedAt: time.Now().UTC(),
		}); err != nil {
			t.Fatalf("Insert(%s): %v", console, err)
		}
	}

	sessions, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(sessions) != 3 {
		t.Fatalf("esperava 3 sessões, achou %d", len(sessions))
	}

	want := []string{"n64", "ps2", "ps1"}
	for i, console := range want {
		if sessions[i].ConsoleID != console {
			t.Errorf("posição %d = %q, queria %q (mais recente primeiro)", i, sessions[i].ConsoleID, console)
		}
	}
}

// Fechar um id que não existe não deve ser tratado como sucesso silencioso —
// embora hoje o UPDATE sem WHERE match não erre, o teste trava que pelo menos
// não quebra o processo, e documenta o comportamento atual.
func TestSQLiteSessionsCloseRejectsInvalidID(t *testing.T) {
	db, err := store.OpenAt(filepath.Join(t.TempDir(), "zeux.db"))
	if err != nil {
		t.Fatalf("OpenAt: %v", err)
	}
	defer db.Close()

	repo := NewSQLiteSessions(db)
	if err := repo.Close(context.Background(), "não-é-um-id", time.Now(), ""); err == nil {
		t.Error("esperava erro ao fechar um id em formato inválido")
	}
}

// Uma sessão que ficou aberta quando o daemon morreu não pode continuar "em
// andamento" para sempre nem somar tempo jogado sozinha — e o tempo que não
// foi medido não pode ser inventado. Sessões já encerradas ficam intactas.
func TestSQLiteSessionsCloseOrphaned(t *testing.T) {
	db, err := store.OpenAt(filepath.Join(t.TempDir(), "zeux.db"))
	if err != nil {
		t.Fatalf("OpenAt: %v", err)
	}
	defer db.Close()

	repo := NewSQLiteSessions(db)
	ctx := context.Background()

	started := time.Date(2026, 9, 27, 21, 0, 0, 0, time.UTC)
	orphanID, err := repo.Insert(ctx, Session{ConsoleID: "n64", AdapterID: "retroarch", Emulator: "RetroArch", ROMPath: "/jogos/zelda.z64", StartedAt: started})
	if err != nil {
		t.Fatalf("Insert (órfã): %v", err)
	}
	closedID, err := repo.Insert(ctx, Session{ConsoleID: "snes", AdapterID: "retroarch", Emulator: "RetroArch", ROMPath: "/jogos/metroid.sfc", StartedAt: started})
	if err != nil {
		t.Fatalf("Insert (encerrada): %v", err)
	}
	if err := repo.Close(ctx, closedID, started.Add(time.Hour), ""); err != nil {
		t.Fatalf("Close: %v", err)
	}

	n, err := repo.CloseOrphaned(ctx)
	if err != nil {
		t.Fatalf("CloseOrphaned: %v", err)
	}
	if n != 1 {
		t.Errorf("CloseOrphaned encerrou %d sessões, queria 1", n)
	}

	sessions, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	for _, s := range sessions {
		switch s.ID {
		case orphanID:
			if s.Running() {
				t.Error("a sessão órfã continua em andamento")
			}
			if s.Duration() != 0 {
				t.Errorf("a sessão órfã ganhou duração %v; o tempo não medido não pode ser inventado", s.Duration())
			}
			if s.ExitError != OrphanedSessionMessage {
				t.Errorf("ExitError = %q, queria a explicação da sessão órfã", s.ExitError)
			}
		case closedID:
			if s.Duration() != time.Hour || s.ExitError != "" {
				t.Errorf("a sessão já encerrada foi alterada: duração %v, erro %q", s.Duration(), s.ExitError)
			}
		}
	}

	// Rodar de novo (o próximo início do daemon) não mexe em mais nada.
	if n, err := repo.CloseOrphaned(ctx); err != nil || n != 0 {
		t.Errorf("segunda chamada: %d sessões, erro %v; queria 0 e nil", n, err)
	}
}
