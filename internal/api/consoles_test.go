package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// consoleEntry espelha a resposta de GET /api/v1/consoles do lado de fora do
// pacote — de propósito: se o formato mudar sem querer, é aqui que quebra,
// em vez de o teste acompanhar a mudança calado por usar o tipo interno.
type consoleEntry struct {
	ConsoleID            string `json:"console_id"`
	Name                 string `json:"name"`
	ShortName            string `json:"short_name"`
	Year                 int    `json:"year"`
	RequiresExternalFile bool   `json:"requires_external_file"`
	Emulators            []struct {
		AdapterID string `json:"adapter_id"`
		Name      string `json:"name"`
		Core      string `json:"core"`
	} `json:"emulators"`
}

func getConsoles(t *testing.T) []consoleEntry {
	t.Helper()

	server := newTestServer(t, fakeProbe{})
	rec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/consoles", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperado 200 (corpo: %s)", rec.Code, rec.Body.String())
	}

	var body struct {
		Consoles []consoleEntry `json:"consoles"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decodificando resposta %q: %v", rec.Body.String(), err)
	}
	if len(body.Consoles) == 0 {
		t.Fatal("nenhum console devolvido — o teste não travaria nada")
	}
	return body.Consoles
}

// Trava a regra que separa esta rota de /consoles/verdicts: catálogo não é
// hardware, então não há o que consentir. `newTestServer` nunca concede
// consentimento, e o scan nunca rodou — se algum dia esta rota passar a
// exigir um dos dois, quem recusou o scan perde a tela de consoles inteira
// (docs/sprint-b-plano.md, B8: "recusar não pode ser beco sem saída").
func TestConsolesNaoExigeConsentimento(t *testing.T) {
	getConsoles(t)
}

// Trava o contrato entre o catálogo (internal/verdict/data/consoles.json) e a
// tabela de cores do adapter do RetroArch: todo console atendido pelo
// RetroArch precisa dizer QUAL core ele pede. Sem isto, a tela de consoles
// mostraria "RetroArch" sem ter como responder se o core desse console está
// baixado — que é a diferença entre o emulador estar instalado e o jogo
// abrir. Mesmo espírito de verdict/catalog_integration_test.go: um acordo
// entre duas listas que nada no compilador força a andarem juntas.
func TestConsolesTrazCoreDoRetroArch(t *testing.T) {
	for _, console := range getConsoles(t) {
		for _, option := range console.Emulators {
			if option.AdapterID != "retroarch" {
				continue
			}
			if option.Core == "" {
				t.Errorf("console %q: o RetroArch atende, mas nenhum core foi informado", console.ConsoleID)
			}
		}
	}
}

// O outro lado da regra acima: um emulador standalone não tem core nenhum, e
// um campo `core` preenchido para ele faria a tela oferecer "baixar o core"
// de algo que não carrega cores. Ausente é o estado certo, nunca "".
func TestConsolesNaoInventaCoreParaStandalone(t *testing.T) {
	for _, console := range getConsoles(t) {
		for _, option := range console.Emulators {
			if option.AdapterID == "retroarch" {
				continue
			}
			if option.Core != "" {
				t.Errorf("console %q: %s não carrega cores, mas veio core=%q",
					console.ConsoleID, option.AdapterID, option.Core)
			}
		}
	}
}

// Trava a regra de produto que mora em Registry.ForConsole: um emulador
// dedicado vem antes do RetroArch, porque costuma ter compatibilidade e
// desempenho melhores no console dele. A ordem é o motivo de esta rota
// existir em vez de a tela inverter `consoles[]` de GET /emulators por conta
// própria — inverter um mapa no front devolveria a lista em qualquer ordem.
func TestConsolesColocaStandaloneAntesDoRetroArch(t *testing.T) {
	var comEscolha int

	for _, console := range getConsoles(t) {
		if len(console.Emulators) < 2 {
			continue
		}
		comEscolha++

		for i, option := range console.Emulators {
			if option.AdapterID != "retroarch" {
				continue
			}
			if i != len(console.Emulators)-1 {
				t.Errorf("console %q: RetroArch veio na posição %d de %d — deveria ser o último",
					console.ConsoleID, i+1, len(console.Emulators))
			}
		}
	}

	// Em 2026-08-28 eram 5 (ps1, n64, dreamcast, psp, nds). O número pode
	// crescer; zero significa que o teste acima não olhou nenhum console de
	// verdade e passaria mesmo com a ordem invertida.
	if comEscolha == 0 {
		t.Fatal("nenhum console com mais de um emulador — a ordem não foi travada por nada")
	}
}

// Todo console do catálogo aparece, mesmo o que nenhum adapter atende: a tela
// precisa poder dizer "o ZeuX ainda não sabe rodar isto" em vez de o console
// sumir sem explicação. Trava também que o campo de identificação vem
// preenchido — um card sem nome não tem o que mostrar.
func TestConsolesCobreOCatalogoInteiro(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	rec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/health", nil)
	totalNoCatalogo, ok := decodeBody(t, rec)["consoles"].(float64)
	if !ok {
		t.Fatal("/health não devolveu a contagem de consoles do catálogo")
	}

	consoles := getConsoles(t)
	if float64(len(consoles)) != totalNoCatalogo {
		t.Errorf("/consoles devolveu %d consoles, o catálogo tem %.0f", len(consoles), totalNoCatalogo)
	}

	for _, console := range consoles {
		if console.Name == "" || console.ShortName == "" || console.Year == 0 {
			t.Errorf("console %q veio sem identificação completa: %+v", console.ConsoleID, console)
		}
	}
}
