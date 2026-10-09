package emulator

import (
	"strings"
	"testing"
)

// Trava que "Iniciar do zero" nunca carrega estado: no modo fresh nenhum
// argumento de estado sai na linha de comando, mesmo que um StatePath tenha
// sobrado no pedido. Vale para os dois emuladores que sabem continuar.
func TestFreshNeverCarriesStateFile(t *testing.T) {
	for _, tc := range []struct {
		adapter  Adapter
		id, cons string
	}{{newDuckStation(), "duckstation", "ps1"}, {newPCSX2(), "pcsx2", "ps2"}} {
		cmd, err := tc.adapter.BuildCommand(install(tc.id, "/opt/"+tc.id),
			Request{ROMPath: "/jogos/jogo.iso", ConsoleID: tc.cons, Mode: ModeFresh, StatePath: "/estados/sobra.resume"})
		if err != nil {
			t.Fatalf("%s: %v", tc.id, err)
		}
		if strings.Contains(argvString(cmd), "-statefile") || strings.Contains(argvString(cmd), "sobra.resume") {
			t.Errorf("%s: modo fresh carregou estado: %s", tc.id, argvString(cmd))
		}
		if len(cmd.Unapplied) != 0 {
			t.Errorf("%s: modo fresh não deveria declarar nada como não aplicado: %v", tc.id, cmd.Unapplied)
		}
	}
}

// Trava que o modo vazio (pedido antigo, sem campo mode) é o mesmo que fresh:
// quem não escolheu nada não recebe estado escondido.
func TestEmptyModeBehavesAsFresh(t *testing.T) {
	cmd, err := newDuckStation().BuildCommand(install("duckstation", "/opt/ds"),
		Request{ROMPath: "/jogos/jogo.cue", ConsoleID: "ps1", StatePath: "/estados/sobra.resume"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(argvString(cmd), "-statefile") {
		t.Fatalf("modo vazio carregou estado: %s", argvString(cmd))
	}
}

// Trava que "Continuar" sem o caminho do estado não inventa um -statefile
// vazio: na prévia a linha sai sem ele, e o Unapplied diz que o estado é
// localizado só no lançamento.
func TestResumePreviewWithoutStatePathSaysWhenStateIsFound(t *testing.T) {
	cmd, err := newPCSX2().BuildCommand(install("pcsx2", "/opt/pcsx2"),
		Request{ROMPath: "/jogos/jogo.iso", ConsoleID: "ps2", Mode: ModeResume})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(argvString(cmd), "-statefile") {
		t.Fatalf("sem StatePath não deveria haver -statefile: %s", argvString(cmd))
	}
	if len(cmd.Unapplied) != 1 || !strings.Contains(cmd.Unapplied[0], "na hora de abrir o jogo") {
		t.Errorf("Unapplied = %v, esperava o aviso de estado localizado no lançamento", cmd.Unapplied)
	}
}

// Trava que um emulador sem suporte a retomada declara "Continuar" como não
// aplicado, em vez de abrir em silêncio no início como se tivesse atendido.
func TestStandaloneWithoutResumeSupportDeclaresUnapplied(t *testing.T) {
	// xemu serve de exemplo: Dolphin, PPSSPP e RPCS3 já têm retomada.
	cmd, err := newXemu().BuildCommand(install("xemu", "/opt/xemu"),
		Request{ROMPath: "/jogos/jogo.iso", ConsoleID: "xbox", Mode: ModeResume, StatePath: "/x.sav"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(argvString(cmd), "/x.sav") {
		t.Fatalf("o caminho do estado vazou para um emulador sem suporte: %s", argvString(cmd))
	}
	if !containsString(cmd.Unapplied, resumeUnappliedMessage) {
		t.Errorf("Unapplied = %v, esperava o aviso de retomada não suportada", cmd.Unapplied)
	}
}

// Trava que o modo fresh não gera aviso de retomada em emulador nenhum: o
// usuário que não pediu para continuar não deve ver nada sobre isso.
func TestFreshOnStandaloneHasNoResumeWarning(t *testing.T) {
	cmd, err := newDolphin().BuildCommand(install("dolphin", "/opt/dolphin"),
		Request{ROMPath: "/jogos/jogo.iso", ConsoleID: "gamecube", Mode: ModeFresh})
	if err != nil {
		t.Fatal(err)
	}
	if containsString(cmd.Unapplied, resumeUnappliedMessage) {
		t.Errorf("modo fresh não deveria avisar sobre retomada: %v", cmd.Unapplied)
	}
}

// Trava que só os dois valores documentados são modos válidos: um typo como
// "Resume" não pode cair em carregamento de estado por acidente.
func TestModeValidOnlyForKnownValues(t *testing.T) {
	if !ModeFresh.Valid() || !ModeResume.Valid() {
		t.Fatal("fresh e resume deveriam ser válidos")
	}
	for _, bad := range []Mode{"", "Resume", "continuar"} {
		if bad.Valid() {
			t.Errorf("%q não deveria ser modo válido", bad)
		}
	}
}

func containsString(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}
