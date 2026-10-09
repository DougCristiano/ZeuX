package emulator

import (
	"strings"
	"testing"
)

// Trava os nomes dos arquivos de estado: slot 0 sem sufixo, slots 1 a 9 com
// "_N" (getSavestatePath em core/oslib/oslib.cpp).
func TestFlycastStateNames(t *testing.T) {
	if got := flycastStateName("Jogo", 0); got != "Jogo.state" {
		t.Errorf("slot 0 = %q", got)
	}
	if got := flycastStateName("Jogo", 3); got != "Jogo_3.state" {
		t.Errorf("slot 3 = %q", got)
	}
}

// Trava que o slot sai do nome do arquivo SÓ quando ele casa com o nome da
// ROM do pedido. Sem isso, "Crazy_1.state" seria ambíguo entre o slot 0 de
// "Crazy_1" e o slot 1 de "Crazy".
func TestFlycastStateSlotNeedsTheRomName(t *testing.T) {
	const rom = "/jogos/dc/Crazy_1.gdi"
	if slot, ok := flycastStateSlot("Crazy_1.state", rom); !ok || slot != 0 {
		t.Errorf("slot 0 de Crazy_1: slot=%d ok=%v", slot, ok)
	}
	if slot, ok := flycastStateSlot("Crazy_1_1.state", rom); !ok || slot != 1 {
		t.Errorf("slot 1 de Crazy_1: slot=%d ok=%v", slot, ok)
	}
	for _, name := range []string{
		"Crazy.state",      // outro jogo
		"Crazy_1_11.state", // slot fora de 1 a 9
		"Crazy_1_01.state", // número com zero à esquerda: o Flycast não grava assim
		"Crazy_1_0.state",  // slot 0 tem nome sem sufixo
		"Crazy_1_1.state.net",
	} {
		if _, ok := flycastStateSlot(name, rom); ok {
			t.Errorf("%q não deveria casar com %s", name, rom)
		}
	}
}

// Trava que Iniciar do zero manda Dreamcast.AutoLoadState=no como -config
// transitório, mesmo que o emu.cfg do usuário tenha o carregamento ligado.
func TestFlycastFreshForcesAutoLoadOff(t *testing.T) {
	cmd, err := newFlycast().BuildCommand(install("flycast", "/opt/flycast/flycast.exe"),
		Request{ROMPath: "/jogos/dc/Jogo.gdi", ConsoleID: "dreamcast", Mode: ModeFresh, StatePath: "/x/Jogo.state"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(argvString(cmd), "-config Dreamcast:AutoLoadState=no") {
		t.Errorf("fresh sem AutoLoadState=no: %s", argvString(cmd))
	}
	if strings.Contains(argvString(cmd), "SavestateSlot") || strings.Contains(argvString(cmd), "AutoLoadState=yes") {
		t.Errorf("fresh não deveria escolher slot nem carregar: %s", argvString(cmd))
	}
	if cmd.Argv[len(cmd.Argv)-1] != "/jogos/dc/Jogo.gdi" {
		t.Errorf("o caminho do jogo precisa ser o último argumento: %v", cmd.Argv)
	}
}

// Trava que Continuar liga o carregamento e escolhe o slot do estado deste
// jogo, e que o caminho do jogo continua depois das opções.
func TestFlycastResumeSelectsStateSlot(t *testing.T) {
	cmd, err := newFlycast().BuildCommand(install("flycast", "/opt/flycast/flycast.exe"),
		Request{ROMPath: "/jogos/dc/Jogo.gdi", ConsoleID: "dreamcast", Mode: ModeResume, StatePath: "/x/Jogo_2.state"})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Dreamcast:AutoLoadState=yes", "Dreamcast:SavestateSlot=2"} {
		if !strings.Contains(argvString(cmd), want) {
			t.Errorf("falta %q em %s", want, argvString(cmd))
		}
	}
	if len(cmd.Unapplied) != 0 {
		t.Errorf("Continuar com estado deste jogo não deveria declarar nada: %v", cmd.Unapplied)
	}
	if cmd.Argv[len(cmd.Argv)-1] != "/jogos/dc/Jogo.gdi" {
		t.Errorf("o caminho do jogo precisa ser o último argumento: %v", cmd.Argv)
	}
}

// Trava que um estado com nome de outro jogo nunca é carregado: o jogo abre
// do início e a prévia diz por quê.
func TestFlycastResumeWithForeignStateOpensFromStart(t *testing.T) {
	cmd, err := newFlycast().BuildCommand(install("flycast", "/opt/flycast/flycast.exe"),
		Request{ROMPath: "/jogos/dc/Jogo.gdi", ConsoleID: "dreamcast", Mode: ModeResume, StatePath: "/x/Outro.state"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(argvString(cmd), "AutoLoadState=yes") || strings.Contains(argvString(cmd), "Outro") {
		t.Errorf("estado de outro jogo foi usado: %s", argvString(cmd))
	}
	if !containsString(cmd.Unapplied, "O estado escolhido não corresponde a este jogo; o jogo abre do início.") {
		t.Errorf("Unapplied = %v", cmd.Unapplied)
	}
}

// Trava quais emuladores de Dreamcast/3DS/DS abrem num estado: só o Flycast.
// Azahar e melonDS não têm flag que faça isso (ver docs/decisoes.md).
func TestOnlyFlycastAmongNewEmulatorsSupportsResume(t *testing.T) {
	if !SupportsResume("flycast") {
		t.Error("o Flycast deveria suportar retomada")
	}
	for _, id := range []string{"azahar", "melonds"} {
		if SupportsResume(id) {
			t.Errorf("%s não deveria suportar retomada sem flag documentada", id)
		}
	}
}

// Trava que o valor booleano do emu.cfg segue o Config::getBool do Flycast:
// só yes/true/on/1 ligam. "no" ou valor desconhecido desliga.
func TestFlycastTruthyFollowsFlycastBoolRules(t *testing.T) {
	for _, v := range []string{"yes", "true", "on", "1", "YES"} {
		if !flycastTruthy(v) {
			t.Errorf("%q deveria ligar a opção", v)
		}
	}
	for _, v := range []string{"no", "false", "0", "", "talvez"} {
		if flycastTruthy(v) {
			t.Errorf("%q não deveria ligar a opção", v)
		}
	}
}
