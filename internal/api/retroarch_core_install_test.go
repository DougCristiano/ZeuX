package api_test

import (
	"net/http"
	"strings"
	"testing"
)

// Vários cores do RetroArch têm espaço no nome amigável ("beetle vb",
// "parallel n64", "genesis plus gx") — o path da rota precisa levar isso
// percent-encoded (%20), e o roteador do Go devolve o valor já decodificado
// em PathValue. Este teste prova a decodificação sem precisar de rede: se o
// espaço não tivesse sido decodificado, a busca no manifesto bateria em
// "não conhece o core" em vez de "ainda não tem... medido" — as duas
// mensagens de handleInstallRetroArchCore são bem diferentes, então a
// resposta por si só denuncia qual das duas aconteceu.
func TestInstallRetroArchCoreDecodesSpaceInPath(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/retroarch/cores/beetle%20vb/install", nil)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperava %d — corpo: %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}

	body := decodeBody(t, rec)
	if code := errorCode(body); code != "core_install_refused" {
		t.Errorf("code = %q, esperava %q", code, "core_install_refused")
	}

	message, _ := body["error"].(map[string]any)["message"].(string)
	if strings.Contains(message, "não conhece o core") {
		t.Errorf("mensagem indica que \"beetle vb\" não foi reconhecido — o espaço do path não foi decodificado: %q", message)
	}
	if !strings.Contains(message, "beetle vb") {
		t.Errorf("mensagem deveria nomear o core \"beetle vb\": %q", message)
	}
}

// Um core que o ZeuX realmente não conhece continua recusado com 400,
// nomeando o core — não um 404 genérico nem um 500.
func TestInstallRetroArchCoreRejectsUnknownCore(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/retroarch/cores/nao-existe/install", nil)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperava %d — corpo: %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}

	body := decodeBody(t, rec)
	message, _ := body["error"].(map[string]any)["message"].(string)
	if !strings.Contains(message, "nao-existe") {
		t.Errorf("mensagem deveria nomear o core desconhecido: %q", message)
	}
}
