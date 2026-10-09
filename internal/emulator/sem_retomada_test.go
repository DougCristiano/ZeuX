package emulator

import (
	"strings"
	"testing"
)

// Os quatro emuladores desta rodada (xemu, Vita3K, Xenia, Cemu) não têm, na
// fonte lida, uma flag de linha de comando que abra o jogo num estado salvo.
// Ver docs/decisoes.md, "Saves e retomada: xemu, Vita3K, Xenia e Cemu
// (2026-10-09)". Estes testes travam o comportamento até alguém confirmar uma
// flag com o binário real.
var semRetomada = []struct {
	adapter  Adapter
	id, cons string
}{
	{newXemu(), "xemu", "xbox"},
	{newVita3K(), "vita3k", "vita"},
	{newXenia(), "xenia", "xbox360"},
	{newCemu(), "cemu", "wiiu"},
}

// Trava que nenhum dos quatro entra em SupportsResume sem uma flag confirmada:
// a interface oferece "Continuar" só para emulador que o ZeuX sabe abrir num
// estado.
func TestSemRetomadaNaoEntraEmSupportsResume(t *testing.T) {
	for _, tc := range semRetomada {
		if SupportsResume(tc.id) {
			t.Errorf("%s entrou em SupportsResume sem flag confirmada", tc.id)
		}
	}
}

// Trava que "Continuar" nesses emuladores é declarado como não aplicado e que
// o caminho do estado nunca vaza para a linha de comando, mesmo que chegue
// preenchido no pedido.
func TestSemRetomadaDeclaraContinuarNaoAplicado(t *testing.T) {
	for _, tc := range semRetomada {
		cmd, err := tc.adapter.BuildCommand(install(tc.id, "/opt/"+tc.id),
			Request{ROMPath: "/jogos/jogo.bin", ConsoleID: tc.cons, Mode: ModeResume, StatePath: "/estados/sobra.state"})
		if err != nil {
			t.Fatalf("%s: %v", tc.id, err)
		}
		if strings.Contains(argvString(cmd), "/estados/sobra.state") {
			t.Errorf("%s: o caminho do estado vazou para a linha de comando: %s", tc.id, argvString(cmd))
		}
		if !containsString(cmd.Unapplied, resumeUnappliedMessage) {
			t.Errorf("%s: Unapplied = %v, esperava o aviso de retomada não suportada", tc.id, cmd.Unapplied)
		}
	}
}

// Trava que "Iniciar do zero" nesses emuladores não gera aviso nenhum sobre
// retomada e não carrega nada: o boot é o normal, com o save do próprio jogo.
func TestSemRetomadaFreshSemAvisoNemCarga(t *testing.T) {
	for _, tc := range semRetomada {
		cmd, err := tc.adapter.BuildCommand(install(tc.id, "/opt/"+tc.id),
			Request{ROMPath: "/jogos/jogo.bin", ConsoleID: tc.cons, Mode: ModeFresh})
		if err != nil {
			t.Fatalf("%s: %v", tc.id, err)
		}
		if containsString(cmd.Unapplied, resumeUnappliedMessage) {
			t.Errorf("%s: modo fresh não deveria avisar sobre retomada: %v", tc.id, cmd.Unapplied)
		}
		for _, bad := range []string{"-loadvm", "-statefile", "-resume", "--savestate", "--last-savestate"} {
			if strings.Contains(argvString(cmd), bad) {
				t.Errorf("%s: modo fresh saiu com %q: %s", tc.id, bad, argvString(cmd))
			}
		}
	}
}

// Trava que o xemu não usa -loadvm (herdado do QEMU) para retomar: o ZeuX não
// tem como gerar um snapshot de VM que o xemu aceite de volta, e a flag
// carregaria um arquivo que ninguém criou de propósito.
func TestXemuNaoUsaLoadvmParaRetomar(t *testing.T) {
	cmd, err := newXemu().BuildCommand(install("xemu", "/opt/xemu"),
		Request{ROMPath: "/jogos/jogo.iso", ConsoleID: "xbox", Mode: ModeResume, StatePath: "/estados/x.sav"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(argvString(cmd), "-loadvm") {
		t.Fatalf("xemu recebeu -loadvm: %s", argvString(cmd))
	}
}

// Trava que o xemu recebe a ROM por -dvd_path (flag própria do xemu,
// system/vl.c), e não como argumento posicional.
func TestXemuRomPorDvdPath(t *testing.T) {
	cmd, err := newXemu().BuildCommand(install("xemu", "/opt/xemu"),
		Request{ROMPath: "/jogos/jogo.iso", ConsoleID: "xbox"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(argvString(cmd), "-dvd_path /jogos/jogo.iso") {
		t.Errorf("a ROM do xemu deveria sair por -dvd_path: %s", argvString(cmd))
	}
}
