package emulator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Trava qual nome de arquivo é um state de slot do PPSSPP. O estado de
// "desfazer" e o load_undo.ppst não são slots e não podem aparecer como
// "onde você parou".
func TestPPSSPPStateNameRecognisesOnlySlotStates(t *testing.T) {
	if m := ppssppStateName.FindStringSubmatch("ULUS10001_1.00_1.ppst"); m == nil || m[1] != "ULUS10001" || m[3] != "1" {
		t.Errorf("state de slot 1 não reconhecido: %v", m)
	}
	for _, name := range []string{"ULUS10001_1.00_0.undo.ppst", "load_undo.ppst", "ULUS10001_1.00_1.jpg", "ULUS10001_1.00.ppst"} {
		if ppssppStateName.MatchString(name) {
			t.Errorf("%s não é state de slot", name)
		}
	}
}

// Trava que um state de outro jogo, mesmo na mesma pasta, não casa com o ID.
func TestPPSSPPStateSlotOnlyMatchesOwnGame(t *testing.T) {
	if _, ok := ppssppStateSlot("ULES00001_1.00_0.ppst", "ULUS10001"); ok {
		t.Error("state de outro jogo não deveria casar")
	}
	slot, ok := ppssppStateSlot("ULUS10001_1.00_3.ppst", "ULUS10001")
	if !ok || slot == nil || *slot != 3 {
		t.Errorf("slot = %v, ok = %v; quer 3", slot, ok)
	}
}

// Trava o caminho da pasta PSP dentro do Memory Stick, e que uma pasta que já
// se chama PSP não ganha outro PSP dentro (GetSysDirectory do PPSSPP).
func TestPPSSPPPSPDirAvoidsDoublePSP(t *testing.T) {
	if got := ppssppPSPDir(filepath.Join("/x", "memstick")); got != filepath.Join("/x", "memstick", "PSP") {
		t.Errorf("memstick comum: %q", got)
	}
	if got := ppssppPSPDir(filepath.Join("/x", "PSP")); got != filepath.Join("/x", "PSP") {
		t.Errorf("memstick já chamada PSP: %q", got)
	}
}

// Trava as três regras do Windows para achar o Memory Stick: sem installed.txt
// vale a pasta memstick ao lado do executável; com installed.txt vazio vale
// Documents\PPSSPP; com caminho dentro, vale esse caminho.
func TestPPSSPPMemStickFromMarkerFollowsDocumentedRules(t *testing.T) {
	exe := filepath.Join("C:", "PPSSPP")
	home := filepath.Join("C:", "Users", "x")

	if got, _ := ppssppMemStickFromMarker(exe, nil, false, home); got != filepath.Join(exe, "memstick") {
		t.Errorf("sem installed.txt: %q", got)
	}
	if got, _ := ppssppMemStickFromMarker(exe, []byte("  \n"), true, home); got != filepath.Join(home, "Documents", "PPSSPP") {
		t.Errorf("installed.txt vazio: %q", got)
	}
	if got, _ := ppssppMemStickFromMarker(exe, []byte(" E:\\PSP \n"), true, home); got != "E:\\PSP" {
		t.Errorf("installed.txt com caminho: %q", got)
	}
	if _, ok := ppssppMemStickFromMarker(exe, []byte(""), true, ""); ok {
		t.Error("installed.txt vazio sem pasta do usuário não tem onde procurar")
	}
}

// Trava que os saves do PPSSPP são achados só pelo DISC_ID do jogo: pasta de
// save de outro jogo e state de outro jogo ficam de fora, e a lista sai
// aproximada.
func TestPPSSPPFindsOnlyOwnSavesAndStates(t *testing.T) {
	memstick := t.TempDir()
	psp := filepath.Join(memstick, "PSP")
	writeFile(t, filepath.Join(psp, "SAVEDATA", "ULUS10001DATA", "PARAM.SFO"))
	writeFile(t, filepath.Join(psp, "SAVEDATA", "ULES00001DATA", "PARAM.SFO"))
	writeFile(t, filepath.Join(psp, "PPSSPP_STATE", "ULUS10001_1.00_0.ppst"))
	writeFile(t, filepath.Join(psp, "PPSSPP_STATE", "ULUS10001_1.00_0.undo.ppst"))
	writeFile(t, filepath.Join(psp, "PPSSPP_STATE", "ULES00001_1.00_0.ppst"))

	out := findPPSSPPSavesIn(memstick, "ULUS10001")
	if out.Serial != "ULUS10001" || !out.MemoryCardsApproximate {
		t.Errorf("Serial = %q, aproximado = %v", out.Serial, out.MemoryCardsApproximate)
	}
	if len(out.MemoryCards) != 1 || !strings.Contains(out.MemoryCards[0].Path, "ULUS10001DATA") {
		t.Errorf("cartões = %+v", out.MemoryCards)
	}
	if len(out.SaveStates) != 1 || out.SaveStates[0].Slot == nil || *out.SaveStates[0].Slot != 0 {
		t.Errorf("states = %+v", out.SaveStates)
	}
}

// Trava que sem DISC_ID não se finge que o jogo não tem saves: a busca diz "não
// sei" (ok=false), e a tela não mostra uma lista vazia como se fosse certeza.
func TestPPSSPPWithoutDiscIDSaysUnknown(t *testing.T) {
	inst := install("ppsspp", filepath.Join(t.TempDir(), "PPSSPPWindows64.exe"))
	if _, ok := findPPSSPPGameSaves(inst, ""); ok {
		t.Error("sem DISC_ID a busca não pode dizer que sabe")
	}
}

// Trava que "Continuar" no PPSSPP só aceita state gravado depois de a sessão
// começar, e que o DISC_ID sai do nome do próprio arquivo.
func TestPPSSPPResumeOnlyTakesStatesFromThisSession(t *testing.T) {
	memstick := t.TempDir()
	dir := filepath.Join(memstick, "PSP", "PPSSPP_STATE")
	old := filepath.Join(dir, "ULUS10001_1.00_0.ppst")
	writeFile(t, old)
	since := time.Now()
	past := since.Add(-time.Hour)
	if err := os.Chtimes(old, past, past); err != nil {
		t.Fatal(err)
	}
	if _, _, _, ok := ppssppResumeIn(memstick, since); ok {
		t.Fatal("state de antes da sessão não deveria virar retomada")
	}

	fresh := filepath.Join(dir, "ULUS10001_1.00_2.ppst")
	writeFile(t, fresh)
	later := since.Add(time.Minute)
	if err := os.Chtimes(fresh, later, later); err != nil {
		t.Fatal(err)
	}
	path, _, discID, ok := ppssppResumeIn(memstick, since)
	if !ok || path != fresh || discID != "ULUS10001" {
		t.Errorf("retomada = %q, id = %q, ok = %v", path, discID, ok)
	}
}

// Trava que o PPSSPP recebe --state com o caminho exato, mantendo o caminho do
// jogo: sem o jogo na linha o estado não é carregado (NativeApp.cpp).
func TestPPSSPPResumeUsesStateFlagAndKeepsGame(t *testing.T) {
	cmd, err := newPPSSPP().BuildCommand(install("ppsspp", "/opt/ppsspp/PPSSPPSDL"),
		Request{ROMPath: "/jogos/Jogo.iso", ConsoleID: "psp", Mode: ModeResume, StatePath: "/mem/PSP/PPSSPP_STATE/ULUS10001_1.00_0.ppst"})
	if err != nil {
		t.Fatal(err)
	}
	want := "/opt/ppsspp/PPSSPPSDL --state /mem/PSP/PPSSPP_STATE/ULUS10001_1.00_0.ppst /jogos/Jogo.iso"
	if argvString(cmd) != want {
		t.Errorf("argv = %q, quer %q", argvString(cmd), want)
	}
}

// Trava que o modo "do zero" do PPSSPP não recebe --state, mesmo com um
// StatePath sobrando no pedido.
func TestPPSSPPFreshNeverPassesState(t *testing.T) {
	cmd, err := newPPSSPP().BuildCommand(install("ppsspp", "/opt/ppsspp/PPSSPPSDL"),
		Request{ROMPath: "/jogos/Jogo.iso", ConsoleID: "psp", Mode: ModeFresh, StatePath: "/mem/PSP/PPSSPP_STATE/sobra.ppst"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(argvString(cmd), "--state") || strings.Contains(argvString(cmd), "sobra.ppst") {
		t.Errorf("modo fresh carregou estado: %s", argvString(cmd))
	}
}
