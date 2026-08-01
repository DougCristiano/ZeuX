package verdict

import (
	"testing"

	"github.com/doufl/zeux/internal/emulator"
)

// O catálogo e os adapters são mantidos em arquivos separados e é fácil um sair
// de sincronia com o outro. Estes testes travam o contrato entre eles: sugerir
// um emulador que o ZeuX não sabe lançar seria uma promessa que o app não
// cumpre na hora de abrir o jogo.

func TestEveryTierPointsToAKnownAdapter(t *testing.T) {
	catalog, err := LoadCatalog()
	if err != nil {
		t.Fatalf("carregando catálogo: %v", err)
	}

	registry := emulator.NewRegistry()

	for _, console := range catalog.Consoles {
		for _, tier := range console.Tiers {
			if tier.AdapterID == "" {
				t.Errorf("%s/%s: nenhum adapter_id declarado", console.ID, tier.Level)
				continue
			}

			adapter, ok := registry.ByID(tier.AdapterID)
			if !ok {
				t.Errorf("%s/%s: adapter %q não existe", console.ID, tier.Level, tier.AdapterID)
				continue
			}

			// O adapter precisa declarar que atende este console, senão o
			// lançamento seria recusado com ErrUnsupportedConsole.
			var supported bool
			for _, id := range adapter.Consoles() {
				if id == console.ID {
					supported = true
					break
				}
			}
			if !supported {
				t.Errorf("%s/%s: o adapter %q não declara suporte a este console",
					console.ID, tier.Level, tier.AdapterID)
			}
		}
	}
}

// Todo patamar precisa de um preset aplicável: sem opções estruturadas a
// autoconfiguração não acontece, e o texto do preset vira decoração.
func TestEveryTierHasApplicableOptions(t *testing.T) {
	catalog, err := LoadCatalog()
	if err != nil {
		t.Fatalf("carregando catálogo: %v", err)
	}

	for _, console := range catalog.Consoles {
		for _, tier := range console.Tiers {
			if tier.Preset == "" {
				t.Errorf("%s/%s: preset sem descrição para o usuário", console.ID, tier.Level)
			}
			if !tier.Options.Fullscreen {
				t.Errorf("%s/%s: quem entra por um jogo espera tela cheia", console.ID, tier.Level)
			}
			if !tier.Options.ExitOnClose {
				t.Errorf("%s/%s: o emulador deve encerrar junto com o jogo", console.ID, tier.Level)
			}
			if tier.Options.InternalScale < 0 {
				t.Errorf("%s/%s: escala interna negativa (%d)", console.ID, tier.Level, tier.Options.InternalScale)
			}
		}
	}
}

// Os patamares melhores não podem pedir configuração mais modesta que os
// piores — seria o inverso do que o nome do patamar promete.
func TestBetterTiersDoNotDowngradeSettings(t *testing.T) {
	catalog, err := LoadCatalog()
	if err != nil {
		t.Fatalf("carregando catálogo: %v", err)
	}

	for _, console := range catalog.Consoles {
		for i := 1; i < len(console.Tiers); i++ {
			better, worse := console.Tiers[i-1], console.Tiers[i]

			if better.Options.InternalScale > 0 && worse.Options.InternalScale > 0 &&
				better.Options.InternalScale < worse.Options.InternalScale {
				t.Errorf("%s: patamar %q usa escala %d, menor que a do patamar %q (%d)",
					console.ID, better.Level, better.Options.InternalScale,
					worse.Level, worse.Options.InternalScale)
			}
		}
	}
}

// O RetroArch não roda nada sem core, então todo patamar que o usa precisa
// declarar qual.
func TestRetroArchTiersDeclareCore(t *testing.T) {
	catalog, err := LoadCatalog()
	if err != nil {
		t.Fatalf("carregando catálogo: %v", err)
	}

	for _, console := range catalog.Consoles {
		for _, tier := range console.Tiers {
			if tier.AdapterID == "retroarch" && tier.Core == "" {
				t.Errorf("%s/%s: patamar do RetroArch sem core declarado", console.ID, tier.Level)
			}
			if tier.AdapterID != "retroarch" && tier.Core != "" {
				t.Errorf("%s/%s: core declarado para o adapter %q, que não usa cores",
					console.ID, tier.Level, tier.AdapterID)
			}
		}
	}
}
