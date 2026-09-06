package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

type emulatorEntryResposta struct {
	AdapterID   string `json:"adapter_id"`
	Installed   bool   `json:"installed"`
	InstallKind string `json:"install_kind"`
}

func listarEmuladores(t *testing.T) []emulatorEntryResposta {
	t.Helper()

	server := newTestServer(t, fakeProbe{})
	rec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/emulators", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperado 200", rec.Code)
	}

	var body struct {
		Emulators []emulatorEntryResposta `json:"emulators"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decodificando: %v", err)
	}
	if len(body.Emulators) == 0 {
		t.Fatal("nenhum emulador devolvido — o teste não travaria nada")
	}
	return body.Emulators
}

// Trava a regra central do Q5 (docs/roadmap.md, Sprint Q): "não instalado, e o
// ZeuX instala sozinho" e "não instalado, e o ZeuX não sabe instalar" são
// estados diferentes, e a interface precisa distinguir **antes** do clique.
// Sem isto, os 21 consoles que dependem do RetroArch mostravam o mesmo
// "instalar emulador" dos outros e o clique terminava num 400.
func TestEmuladoresDeclaramComoPodemSerInstalados(t *testing.T) {
	esperado := map[string]string{
		// Fontes manuais: buildbot/site próprio, sem release do GitHub que o
		// ZeuX consiga resolver por API.
		"retroarch": "manual",
		"dolphin":   "manual",
		// 1-click por release do GitHub.
		"duckstation": "github",
		"pcsx2":       "github",
		"rmg":         "github",
	}

	visto := map[string]string{}
	for _, e := range listarEmuladores(t) {
		visto[e.AdapterID] = e.InstallKind
	}

	for adapter, kind := range esperado {
		if visto[adapter] != kind {
			t.Errorf("%s: install_kind = %q, esperava %q", adapter, visto[adapter], kind)
		}
	}
}

// Todo emulador declara alguma coisa: um campo vazio faria a interface cair no
// caminho de "dá para instalar" por omissão, que é justamente o beco que o Q5
// fecha.
func TestTodoEmuladorTemInstallKind(t *testing.T) {
	validos := map[string]bool{"github": true, "manual": true, "none": true}

	for _, e := range listarEmuladores(t) {
		if !validos[e.InstallKind] {
			t.Errorf("%s: install_kind = %q, fora dos valores conhecidos", e.AdapterID, e.InstallKind)
		}
	}
}
