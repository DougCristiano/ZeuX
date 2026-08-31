package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// Regra: a rota de cores lista TODO core que o ZeuX conhece (não só os
// instalados), cada um com installed=false quando ausente — é isso que
// permite a interface mostrar "faltam estes" em vez de só "algo deu errado".
func TestRetroArchCoresListsEveryKnownCore(t *testing.T) {
	server := newTestServer(t, fakeProbe{info: beefyHardware()})

	rec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/retroarch/cores", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, corpo: %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Cores []struct {
			Name      string `json:"name"`
			Filename  string `json:"filename"`
			Installed bool   `json:"installed"`
		} `json:"cores"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decodificando resposta: %v", err)
	}

	if len(body.Cores) == 0 {
		t.Fatal("esperava a lista de cores conhecidos, veio vazia")
	}

	found := false
	for _, c := range body.Cores {
		if c.Name == "sameboy" {
			found = true
			if c.Filename == "" {
				t.Error("core sameboy sem filename")
			}
		}
	}
	if !found {
		t.Error("esperava \"sameboy\" na lista de cores conhecidos (adicionado em 2026-08-04)")
	}
}
