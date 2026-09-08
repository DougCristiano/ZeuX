package api_test

import (
	"net/http"
	"testing"
)

// Trava a correção de 2026-09-08: handleGetIGDBCredentials parou de
// devolver `configured: true` hardcoded (invariante que valia quando a
// credencial de teste embutida era um literal sempre presente no
// código-fonte) — agora reflete de verdade o que igdb.CredentialsStore.Load
// resolve. Um binário de teste (sem ldflags do release oficial) não tem
// credencial padrão nenhuma, então sem conta pessoal conectada o resultado
// tem que ser `false`, não um otimismo que não corresponde à capacidade
// real de autenticar.
func TestIGDBCredentialsConfiguredReflectsPersonalConnection(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	getRec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/igdb/credentials", nil)
	if getRec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperado 200, corpo: %s", getRec.Code, getRec.Body.String())
	}
	body := decodeBody(t, getRec)
	if body["configured"] != false {
		t.Fatalf("configured = %v, esperado false (sem conta pessoal, sem credencial padrão embutida no build de teste)", body["configured"])
	}
	if body["personal"] != false {
		t.Fatalf("personal = %v, esperado false", body["personal"])
	}

	postRec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/igdb/credentials", map[string]any{
		"client_id":     "abc123",
		"client_secret": "segredo",
	})
	if postRec.Code != http.StatusOK {
		t.Fatalf("POST status = %d, esperado 200, corpo: %s", postRec.Code, postRec.Body.String())
	}

	getRec2 := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/igdb/credentials", nil)
	body2 := decodeBody(t, getRec2)
	if body2["configured"] != true {
		t.Fatalf("configured = %v, esperado true depois de conectar conta pessoal", body2["configured"])
	}
	if body2["personal"] != true {
		t.Fatalf("personal = %v, esperado true depois de conectar conta pessoal", body2["personal"])
	}

	deleteRec := doJSON(t, server.Routes(), http.MethodDelete, "/api/v1/igdb/credentials", nil)
	if deleteRec.Code != http.StatusOK {
		t.Fatalf("DELETE status = %d, esperado 200, corpo: %s", deleteRec.Code, deleteRec.Body.String())
	}

	getRec3 := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/igdb/credentials", nil)
	body3 := decodeBody(t, getRec3)
	if body3["configured"] != false {
		t.Fatalf("configured = %v, esperado false depois de desconectar a conta pessoal", body3["configured"])
	}
}
