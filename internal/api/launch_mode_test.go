package api

import (
	"testing"

	"github.com/doufl/zeux/internal/emulator"
)

// Trava que quem não manda modo nenhum continua do início: o padrão precisa
// ser o caminho sem estado carregado.
func TestLaunchModeDefaultsToFresh(t *testing.T) {
	mode, ok := launchMode(launchBody{ROMPath: "/a.iso", ConsoleID: "ps1"})
	if !ok || mode != emulator.ModeFresh {
		t.Fatalf("launchMode = %q, %v; esperava fresh", mode, ok)
	}
}

// Trava que o campo antigo `resume: true` continua significando "Continuar",
// para quem ainda manda só ele.
func TestLaunchModeLegacyResumeFlag(t *testing.T) {
	mode, ok := launchMode(launchBody{Resume: true})
	if !ok || mode != emulator.ModeResume {
		t.Fatalf("launchMode = %q, %v; esperava resume", mode, ok)
	}
}

// Trava que `mode` vence quando vem sozinho e que `mode: "fresh"` com
// `resume: true` é recusado — escolher um dos dois em silêncio poderia
// carregar um estado que o pedido não quis.
func TestLaunchModeRefusesContradiction(t *testing.T) {
	if mode, ok := launchMode(launchBody{Mode: "resume"}); !ok || mode != emulator.ModeResume {
		t.Fatalf("mode resume: %q, %v", mode, ok)
	}
	if _, ok := launchMode(launchBody{Mode: "fresh", Resume: true}); ok {
		t.Fatal("fresh com resume:true deveria ser recusado")
	}
	if _, ok := launchMode(launchBody{Mode: "Resume"}); ok {
		t.Fatal("valor fora da lista deveria ser recusado")
	}
}
