package emulator

import (
	"strconv"
	"strings"
	"testing"
)

// Trava o critério mais importante do H1: gravar uma chave conhecida não
// pode alterar nenhuma das outras — comentário, ordem e espaçamento
// inclusive. 40 chaves das quais só 1 é tocada, como o roadmap pede.
func TestIniFileSetPreservesEverythingElse(t *testing.T) {
	var raw strings.Builder
	raw.WriteString("[Main]\n; comentário do usuário\n")
	for i := 0; i < 39; i++ {
		raw.WriteString("ChaveQualquer" + strconv.Itoa(i) + " = valor" + strconv.Itoa(i) + "\n")
	}
	raw.WriteString("AlvoDaEdicao = antes\n")

	ini := parseINI([]byte(raw.String()))
	ini.set("Main", "AlvoDaEdicao", "depois")

	out := string(ini.bytes())

	if !strings.Contains(out, "; comentário do usuário") {
		t.Fatal("comentário do usuário sumiu")
	}
	if !strings.Contains(out, "AlvoDaEdicao = depois") {
		t.Fatalf("chave alvo não foi atualizada: %s", out)
	}
	if strings.Contains(out, "AlvoDaEdicao = antes") {
		t.Fatal("valor antigo ainda presente")
	}
	for i := 0; i < 39; i++ {
		want := "ChaveQualquer" + strconv.Itoa(i) + " = valor" + strconv.Itoa(i)
		if !strings.Contains(out, want) {
			t.Fatalf("chave não tocada foi alterada: esperava %q em %s", want, out)
		}
	}
}

// Trava que uma chave nova, numa seção que já existe, entra dentro dela —
// não solta no fim do arquivo fora de qualquer seção.
func TestIniFileSetInsertsIntoExistingSection(t *testing.T) {
	raw := "[UI]\nA = 1\n\n[Other]\nB = 2\n"
	ini := parseINI([]byte(raw))
	ini.set("UI", "Nova", "3")

	out := string(ini.bytes())
	if !strings.Contains(out, "[UI]\nA = 1\nNova = 3") {
		t.Fatalf("chave nova não entrou dentro da seção [UI]: %s", out)
	}
}

// Trava que uma seção inexistente é criada — necessário para um emulador
// que nunca gravou aquela seção (config recém-criada, ou uma opção que o
// usuário nunca mexeu).
func TestIniFileSetCreatesMissingSection(t *testing.T) {
	ini := parseINI([]byte("[Main]\nX = 1\n"))
	ini.set("EmuCore/GS", "upscale_multiplier", "3")

	out := string(ini.bytes())
	if !strings.Contains(out, "[EmuCore/GS]") || !strings.Contains(out, "upscale_multiplier = 3") {
		t.Fatalf("seção nova não foi criada corretamente: %s", out)
	}
}

// Trava round-trip: um arquivo sem nenhuma chamada a set() sai
// byte-a-byte igual ao que entrou.
func TestIniFileRoundTripUnchanged(t *testing.T) {
	raw := "[A]\nX = 1\n; nota\n\n[B]\nY = 2\n"
	ini := parseINI([]byte(raw))
	if string(ini.bytes()) != raw {
		t.Fatalf("round-trip mudou o arquivo:\nquer: %q\nveio: %q", raw, string(ini.bytes()))
	}
}
