package api_test

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// newExecutableFile cria um arquivo de teste com o bit de execução setado
// (fora do Windows, onde a extensão já basta — ver emulator.IsExecutableFile).
func newExecutableFile(t *testing.T, dir, name string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatalf("criando executável de teste: %v", err)
	}
	return path
}

func customDefBody(id, binaryPath string) map[string]any {
	return map[string]any{
		"id":          id,
		"name":        "Emulador de Teste",
		"consoles":    []string{"nes"},
		"binary_path": binaryPath,
		"args":        []string{"{rom}"},
	}
}

// Trava o critério de aceite central do I1: um caminho que não existe é
// recusado com 400 nomeando o caminho, não um sucesso falso que só quebra
// na hora de jogar.
func TestUpsertCustomEmulatorRejectsMissingBinary(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	missing := filepath.Join(t.TempDir(), "nao-existe")
	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/custom-emulators", customDefBody("teste", missing))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400, corpo: %s", rec.Code, rec.Body.String())
	}
	if code := errorCode(decodeBody(t, rec)); code != "binary_not_found" {
		t.Fatalf("code = %q, esperado binary_not_found", code)
	}
}

// Trava que um caminho que existe mas não é executável (fora do Windows,
// onde a extensão já basta) também é recusado.
func TestUpsertCustomEmulatorRejectsNonExecutableBinary(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("no Windows a extensão já basta — não há bit de execução para testar")
	}
	server := newTestServer(t, fakeProbe{})

	dir := t.TempDir()
	notExecutable := filepath.Join(dir, "leiame.txt")
	if err := os.WriteFile(notExecutable, []byte("x"), 0o644); err != nil {
		t.Fatalf("criando arquivo de teste: %v", err)
	}

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/custom-emulators", customDefBody("teste", notExecutable))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400, corpo: %s", rec.Code, rec.Body.String())
	}
	if code := errorCode(decodeBody(t, rec)); code != "binary_not_found" {
		t.Fatalf("code = %q, esperado binary_not_found", code)
	}
}

// Trava que um emulador personalizado cadastrado aparece em GET /emulators
// (via registry recarregado por reloadCustom) — não basta existir em
// GET /custom-emulators, ele precisa ficar visível junto dos conhecidos — e
// que editar substitui a definição pelo mesmo id, sem duplicar.
func TestCustomEmulatorAppearsInEmulatorsListAndEditPreservesID(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	dir := t.TempDir()
	binPath := newExecutableFile(t, dir, "meu-emulador")

	addRec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/custom-emulators", customDefBody("meu-emu", binPath))
	if addRec.Code != http.StatusOK {
		t.Fatalf("status ao cadastrar = %d, esperado 200, corpo: %s", addRec.Code, addRec.Body.String())
	}

	emuRec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/emulators", nil)
	emus := decodeBody(t, emuRec)["emulators"].([]any)
	found := false
	for _, e := range emus {
		entry := e.(map[string]any)
		if entry["adapter_id"] == "meu-emu" {
			found = true
			if installed, _ := entry["installed"].(bool); !installed {
				t.Fatal("emulador personalizado com binário válido deveria aparecer como instalado")
			}
		}
	}
	if !found {
		t.Fatal("emulador personalizado cadastrado não apareceu em GET /emulators")
	}

	// Editar: mesmo id, nome novo — Upsert substitui, não duplica.
	editBody := customDefBody("meu-emu", binPath)
	editBody["name"] = "Nome Editado"
	editRec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/custom-emulators", editBody)
	if editRec.Code != http.StatusOK {
		t.Fatalf("status ao editar = %d, esperado 200", editRec.Code)
	}
	listAfterEdit := decodeBody(t, doJSON(t, server.Routes(), http.MethodGet, "/api/v1/custom-emulators", nil))["custom_emulators"].([]any)
	if len(listAfterEdit) != 1 {
		t.Fatalf("editar deveria substituir, não duplicar — veio %d entradas", len(listAfterEdit))
	}
	if name := listAfterEdit[0].(map[string]any)["name"]; name != "Nome Editado" {
		t.Fatalf("name após editar = %v, esperado \"Nome Editado\"", name)
	}

	// Excluir.
	delRec := doJSON(t, server.Routes(), http.MethodDelete, "/api/v1/custom-emulators/meu-emu", nil)
	if delRec.Code != http.StatusOK {
		t.Fatalf("status ao excluir = %d, esperado 200", delRec.Code)
	}
	listAfterDelete := decodeBody(t, doJSON(t, server.Routes(), http.MethodGet, "/api/v1/custom-emulators", nil))["custom_emulators"].([]any)
	if len(listAfterDelete) != 0 {
		t.Fatalf("esperava lista vazia após excluir, veio %d", len(listAfterDelete))
	}
}

// Trava que excluir um id inexistente é 404, não 500 nem sucesso silencioso.
func TestDeleteUnknownCustomEmulatorReturns404(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodDelete, "/api/v1/custom-emulators/nao-existe", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, esperado 404", rec.Code)
	}
}
