package api_test

import (
	"encoding/json"
	"net/http"
	"os"
	"testing"
)

// Trava o passo (b) do trilho de instalação manual (2026-09-09): a rota cria
// a pasta de destino se ela ainda não existe — sem isso, "abrir a pasta de
// destino" falharia justamente para quem nunca instalou o emulador — e
// devolve o caminho absoluto para a tela revelar no explorador.
func TestEnsureManagedDirCreatesFolderAndReturnsPath(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/emulators/retroarch/managed-dir", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, corpo: %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decodificando: %v", err)
	}
	if body.Path == "" {
		t.Fatal("path vazio — a tela não teria o que abrir")
	}
	info, err := os.Stat(body.Path)
	if err != nil || !info.IsDir() {
		t.Fatalf("a pasta %q não foi criada: %v", body.Path, err)
	}
}

// Emulador desconhecido é 404, não 500 nem uma pasta criada no vazio.
func TestEnsureManagedDirUnknownEmulator(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/emulators/naoexiste/managed-dir", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, esperava 404", rec.Code)
	}
}
