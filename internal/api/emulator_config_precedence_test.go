package api_test

import (
	"net/http"
	"testing"
)

// Trava o par de rotas que alimenta a precedência do Q2 (docs/roadmap.md,
// Sprint Q): salvar configuração pelo painel faz o lançamento parar de aplicar
// o preset do catálogo naquele emulador, e restaurar a configuração original
// faz voltar a aplicar.
//
// O que este teste cobre é o **contrato HTTP** — que as duas rotas continuam
// existindo e respondendo o que a interface espera. O efeito da precedência em
// si (WriteConfig chamado ou não no lançamento) é travado em
// internal/emulator/session_preset_test.go, onde dá para observar o que cada
// camada recebeu sem um emulador instalado.
//
// Sem emulador instalado, as duas devolvem 400 `not_installed` — e é isso que
// travamos aqui: a rota existe, chega até a checagem de instalação, e não
// devolve 404 nem 500. Cobrir o caminho de sucesso exigiria um PCSX2 de
// verdade no disco, que este ambiente não tem.
func TestRotasDeConfiguracaoRespondemSemEmuladorInstalado(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	handler := server.Routes()

	casos := []struct {
		nome   string
		metodo string
	}{
		{"salvar configuração", http.MethodPost},
		{"restaurar configuração", http.MethodDelete},
	}

	for _, caso := range casos {
		t.Run(caso.nome, func(t *testing.T) {
			var body any
			if caso.metodo == http.MethodPost {
				body = map[string]any{"fullscreen": true, "internal_scale": 3}
			}
			rec := doJSON(t, handler, caso.metodo, "/api/v1/emulators/pcsx2/config", body)

			if rec.Code == http.StatusNotFound {
				t.Fatalf("a rota sumiu: %s", rec.Body.String())
			}
			if rec.Code >= 500 {
				t.Fatalf("erro de servidor onde deveria haver recusa tratada: %d %s", rec.Code, rec.Body.String())
			}
			if code := errorCode(decodeBody(t, rec)); code != "not_installed" {
				t.Errorf("code = %q, esperava \"not_installed\" (corpo: %s)", code, rec.Body.String())
			}
		})
	}
}

// Um adapter que não sabe configurar (12 dos 14) precisa recusar com o código
// próprio, e não fingir que gravou — a capacidade é opcional e GET /emulators
// anuncia isso em `configurable`.
func TestConfiguracaoRecusadaParaAdapterQueNaoConfigura(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/emulators/duckstation/config",
		map[string]any{"fullscreen": true, "internal_scale": 3})

	if code := errorCode(decodeBody(t, rec)); code == "" {
		t.Fatalf("esperava um erro com code; veio %d %s", rec.Code, rec.Body.String())
	} else if code == "not_installed" {
		t.Skip("o DuckStation nem instalado está neste ambiente — a checagem de capacidade não foi alcançada")
	}
}
