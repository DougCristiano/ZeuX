package emulator

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// Trava que "Continuar" vira `-s <estado>` antes do jogo, e que "Iniciar do
// zero" não passa flag nenhuma de estado.
func TestDolphinSaveStateFlagOnlyOnResume(t *testing.T) {
	a := newDolphin()
	inst := install("dolphin", "/opt/dolphin/Dolphin")

	resume, err := a.BuildCommand(inst, Request{ROMPath: "/jogos/jogo.iso", ConsoleID: "gamecube",
		Mode: ModeResume, StatePath: "/estados/GALE01.s01"})
	if err != nil {
		t.Fatal(err)
	}
	flag, rom := -1, -1
	for i, arg := range resume.Argv {
		switch {
		case arg == "-s" && i+1 < len(resume.Argv) && resume.Argv[i+1] == "/estados/GALE01.s01":
			flag = i
		case arg == "/jogos/jogo.iso":
			rom = i
		}
	}
	if flag == -1 || rom == -1 || flag > rom {
		t.Errorf("-s ausente ou depois do jogo: %s", argvString(resume))
	}
	if len(resume.Unapplied) != 0 {
		t.Errorf("continuar com estado não deveria gerar aviso: %v", resume.Unapplied)
	}

	fresh, err := a.BuildCommand(inst, Request{ROMPath: "/jogos/jogo.iso", ConsoleID: "gamecube",
		Mode: ModeFresh, StatePath: "/estados/GALE01.s01"})
	if err != nil {
		t.Fatal(err)
	}
	for _, arg := range fresh.Argv {
		if arg == "-s" {
			t.Errorf("iniciar do zero não pode carregar estado: %s", argvString(fresh))
		}
	}
}

// Trava a regra de pasta de usuário do Dolphin por SO: portable.txt ao lado
// do executável manda para a pasta local; sem ele, a pasta normal do SO
// (UICommon.cpp / CommonPaths.h).
func TestDolphinUserDirFollowsPortableMarkerAndOS(t *testing.T) {
	exe := filepath.Join("/opt", "dolphin")
	home := filepath.Join("/home", "ana")
	for _, tc := range []struct {
		goos     string
		portable bool
		want     string
	}{
		{"windows", true, filepath.Join(exe, "User")},
		{"linux", true, filepath.Join(exe, "user")},
		{"darwin", true, filepath.Join(exe, "User")},
		{"linux", false, filepath.Join(home, ".dolphin-emu")},
		{"darwin", false, filepath.Join(home, "Library", "Application Support", "Dolphin")},
		{"windows", false, filepath.Join(home, "Documents", "Dolphin Emulator")},
	} {
		if got := dolphinUserDirFor(tc.goos, exe, tc.portable, home); got != tc.want {
			t.Errorf("%s portable=%v: got %q, want %q", tc.goos, tc.portable, got, tc.want)
		}
	}
}

// Trava que só "<GameID>.sNN" conta como estado: o arquivo "lastState.sav" e
// nomes com outro formato não podem virar "Continuar" nem aparecer na lista.
func TestDolphinStateNameAcceptsOnlyGameIDSlots(t *testing.T) {
	for name, want := range map[string]bool{
		"GALE01.s01":     true,
		"RSBE01.s09":     true,
		"lastState.sav":  false,
		"GALE01.s1":      false,
		"GALE01.s01.sav": false,
		"GALE0.s01":      false,
		"GALE01.s01.bak": false,
	} {
		if got := dolphinResumeMatch(name); got != want {
			t.Errorf("%q: got %v, want %v", name, got, want)
		}
	}
}

// Trava que o GameID sai do nome do estado em maiúsculas, para casar com o
// nome que o Dolphin grava.
func TestDolphinGameIDComesFromStateName(t *testing.T) {
	id, ok := dolphinGameIDFromState("/estados/gale01.s03")
	if !ok || id != "GALE01" {
		t.Errorf("got %q, %v; want GALE01, true", id, ok)
	}
}

// Trava que sem GameID conhecido a listagem declara "não sei" (known=false),
// e não "nenhum save": a tela precisa diferenciar os dois casos.
func TestDolphinSavesUnknownWithoutGameID(t *testing.T) {
	inst := install("dolphin", filepath.Join(t.TempDir(), "Dolphin"))
	if _, ok := findDolphinGameSaves(inst, GameDiscID{}); ok {
		t.Error("sem GameID a listagem não pode dizer que sabe onde estão os saves")
	}
}

// Trava que a listagem pega só os estados do jogo pedido (pelo GameID),
// na pasta StateSaves da pasta de usuário portátil ao lado do executável.
func TestDolphinSavesListOnlyTheGamesStates(t *testing.T) {
	dir := t.TempDir()
	exe := filepath.Join(dir, "Dolphin")
	if err := os.WriteFile(filepath.Join(dir, "portable.txt"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	// A pasta portátil muda de caixa por SO (User no Windows e macOS, user no
	// Linux); o teste pede a mesma conta que o código faz, para não travar
	// um caminho que só vale num SO.
	states := filepath.Join(dolphinUserDirFor(runtime.GOOS, dir, true, ""), "StateSaves")
	if err := os.MkdirAll(states, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"GALE01.s02", "GALE01.s01", "RSBE01.s01", "lastState.sav"} {
		if err := os.WriteFile(filepath.Join(states, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	saves, ok := findDolphinGameSaves(install("dolphin", exe), GameDiscID{Serial: "GALE01"})
	if !ok {
		t.Fatal("com GameID conhecido a listagem deveria responder")
	}
	if len(saves.SaveStates) != 2 {
		t.Fatalf("esperava 2 estados de GALE01, veio %d", len(saves.SaveStates))
	}
	if *saves.SaveStates[0].Slot != 1 || *saves.SaveStates[1].Slot != 2 {
		t.Errorf("estados fora de ordem de slot: %+v", saves.SaveStates)
	}
}
