package emulator

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/doufl/zeux/internal/store"
)

// Trava que o "Continuar" vira `-statefile <arquivo>` ANTES do jogo — no
// PCSX2, antes do separador "--" (depois dele seria lido como jogo).
func TestResumeStateFileGoesBeforeTheGame(t *testing.T) {
	for _, tc := range []struct {
		adapter  Adapter
		id, cons string
	}{{newDuckStation(), "duckstation", "ps1"}, {newPCSX2(), "pcsx2", "ps2"}} {
		cmd, err := tc.adapter.BuildCommand(install(tc.id, "/opt/"+tc.id),
			Request{ROMPath: "/jogos/jogo.iso", ConsoleID: tc.cons, StatePath: "/estados/jogo.resume"})
		if err != nil {
			t.Fatalf("%s: %v", tc.id, err)
		}
		flag, rom, sep := -1, -1, -1
		for i, a := range cmd.Argv {
			switch {
			case a == "-statefile" && i+1 < len(cmd.Argv) && cmd.Argv[i+1] == "/estados/jogo.resume":
				flag = i
			case a == "/jogos/jogo.iso":
				rom = i
			case a == "--":
				sep = i
			}
		}
		if flag == -1 || rom == -1 || flag > rom || (sep != -1 && flag > sep) {
			t.Errorf("%s: -statefile ausente ou depois do jogo/separador: %s", tc.id, argvString(cmd))
		}
	}
}

// Trava que sem estado pedido nada muda na linha de comando de sempre.
func TestNoStateFileWithoutResume(t *testing.T) {
	cmd, err := newDuckStation().BuildCommand(install("duckstation", "/opt/ds"),
		Request{ROMPath: "/jogos/jogo.cue", ConsoleID: "ps1"})
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range cmd.Argv {
		if a == "-statefile" {
			t.Fatalf("-statefile sem Continuar: %s", argvString(cmd))
		}
	}
}

// Trava a ligação estado ↔ jogo pela sessão: só conta o arquivo de retomada
// gravado durante a sessão, e o mais novo deles.
func TestNewestResumeFileOnlyCountsThisSession(t *testing.T) {
	dir := t.TempDir()
	start := time.Now()
	write := func(name string, mod time.Time) {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(p, mod, mod); err != nil {
			t.Fatal(err)
		}
	}
	write("SLUS-00001_resume.sav", start.Add(-time.Hour)) // de outra sessão
	write("SLUS-00002_resume.sav", start.Add(30*time.Second))
	write("SLUS-00002_1.sav", start.Add(40*time.Second)) // slot comum, não é retomada
	match := func(n string) bool { return filepath.Ext(n) == ".sav" && len(n) > 11 && n[len(n)-11:] == "_resume.sav" }

	got, _, ok := newestResumeFile(dir, match, start)
	if !ok || filepath.Base(got) != "SLUS-00002_resume.sav" {
		t.Fatalf("got %q (ok=%v), esperado SLUS-00002_resume.sav", got, ok)
	}
}

// Trava que "Continuar" só é oferecido com o arquivo existindo: o emulador
// recusa abrir se o estado pedido não existe.
func TestResumeStateDisappearsWhenFileIsGone(t *testing.T) {
	db, err := store.OpenAt(filepath.Join(t.TempDir(), "zeux.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	sessions := NewSQLiteSessions(db)
	l := NewLauncher(nil, sessions, fakeUserConfig{}, discardLogger())
	ctx := context.Background()

	state := filepath.Join(t.TempDir(), "SLUS_resume.sav")
	if err := os.WriteFile(state, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := sessions.RecordResumeState(ctx, ResumeState{
		ROMPath: "/jogos/a.cue", AdapterID: "duckstation", StatePath: state, SavedAt: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}

	if got, err := l.resumeStateFor(ctx, "/jogos/a.cue", "duckstation"); err != nil || got != state {
		t.Fatalf("resumeStateFor = %q, %v", got, err)
	}
	if err := os.Remove(state); err != nil {
		t.Fatal(err)
	}
	if _, err := l.resumeStateFor(ctx, "/jogos/a.cue", "duckstation"); !errors.Is(err, ErrNoResumeState) {
		t.Fatalf("sem arquivo: got %v, esperado ErrNoResumeState", err)
	}
}
