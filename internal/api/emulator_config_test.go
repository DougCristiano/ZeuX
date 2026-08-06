package api_test

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/doufl/zeux/internal/emulator"
)

// installFakePCSX2 grava um "binário" na pasta gerenciada do PCSX2, para
// Locate() achá-lo, e um PCSX2.ini realista em
// $XDG_CONFIG_HOME/PCSX2/inis/PCSX2.ini — o mesmo caminho que
// pcsx2ConfigPath() resolve nesta máquina (os.UserConfigDir() respeita
// XDG_CONFIG_HOME, que newTestServer já isola por teste).
func installFakePCSX2(t *testing.T) {
	t.Helper()

	root, err := emulator.ManagedRoot()
	if err != nil {
		t.Fatalf("ManagedRoot: %v", err)
	}
	dir := emulator.ManagedEmulatorDir(root, "pcsx2", []string{"ps2"})
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	binName := "pcsx2-qt"
	if runtime.GOOS == "windows" {
		binName = "pcsx2-qt.exe"
	}
	if err := os.WriteFile(filepath.Join(dir, binName), []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}

	configHome, err := os.UserConfigDir()
	if err != nil {
		t.Fatalf("UserConfigDir: %v", err)
	}
	iniDir := filepath.Join(configHome, "PCSX2", "inis")
	if err := os.MkdirAll(iniDir, 0o755); err != nil {
		t.Fatal(err)
	}
	raw := "[UI]\nStartFullscreen = false\n\n[EmuCore/GS]\nRenderer = -1\nupscale_multiplier = 1\n"
	if err := os.WriteFile(filepath.Join(iniDir, "PCSX2.ini"), []byte(raw), 0o644); err != nil {
		t.Fatal(err)
	}
}

// Trava o critério central do H2: ler devolve o valor efetivo hoje (lido do
// arquivo real), gravar altera esse valor e ele sobrevive a uma nova
// leitura, e restaurar devolve ao original.
func TestEmulatorConfigReadWriteRestore(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	installFakePCSX2(t)

	getRec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/emulators/pcsx2/config", nil)
	if getRec.Code != http.StatusOK {
		t.Fatalf("GET config status = %d, esperado 200, corpo: %s", getRec.Code, getRec.Body.String())
	}
	body := decodeBody(t, getRec)
	if fs, _ := body["fullscreen"].(bool); fs {
		t.Fatalf("fullscreen lido = %v, esperado false (valor real do arquivo)", body["fullscreen"])
	}
	if _, hasRenderer := body["renderer"]; hasRenderer {
		t.Fatalf("renderer não deveria vir presente (mapeamento não confirmado): %v", body)
	}

	postRec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/emulators/pcsx2/config", map[string]any{
		"fullscreen":     true,
		"internal_scale": 3,
	})
	if postRec.Code != http.StatusOK {
		t.Fatalf("POST config status = %d, esperado 200, corpo: %s", postRec.Code, postRec.Body.String())
	}

	getRec2 := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/emulators/pcsx2/config", nil)
	body2 := decodeBody(t, getRec2)
	if fs, _ := body2["fullscreen"].(bool); !fs {
		t.Fatalf("fullscreen depois de gravar = %v, esperado true", body2["fullscreen"])
	}
	if scale, _ := body2["internal_scale"].(float64); scale != 3 {
		t.Fatalf("internal_scale depois de gravar = %v, esperado 3", body2["internal_scale"])
	}

	restoreRec := doJSON(t, server.Routes(), http.MethodDelete, "/api/v1/emulators/pcsx2/config", nil)
	if restoreRec.Code != http.StatusOK {
		t.Fatalf("DELETE (restore) status = %d, esperado 200, corpo: %s", restoreRec.Code, restoreRec.Body.String())
	}

	getRec3 := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/emulators/pcsx2/config", nil)
	body3 := decodeBody(t, getRec3)
	if fs, _ := body3["fullscreen"].(bool); fs {
		t.Fatalf("fullscreen depois de restaurar = %v, esperado false (original)", body3["fullscreen"])
	}
}

// Achado testando de verdade em 2026-08-05: `[]string(nil)` serializa como
// `null`, e o front chamava `.length` nele sem checar — derrubava a tela
// inteira. Trava que `unapplied` é sempre um array de verdade, mesmo quando
// vazio (nada ficou sem aplicar).
func TestEmulatorConfigUnappliedIsNeverNull(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	installFakePCSX2(t)

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/emulators/pcsx2/config", map[string]any{
		"fullscreen": true,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperado 200, corpo: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"unapplied":[]`) {
		t.Fatalf(`corpo deveria conter "unapplied":[] (nunca null) quando nada fica sem aplicar: %s`, rec.Body.String())
	}
}

// Trava que um Renderer sem mapeamento confirmado vai para `unapplied`, não
// é gravado como um valor adivinhado.
func TestEmulatorConfigRendererGoesToUnapplied(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	installFakePCSX2(t)

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/emulators/pcsx2/config", map[string]any{
		"renderer": "vulkan",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperado 200, corpo: %s", rec.Code, rec.Body.String())
	}
	unapplied, _ := decodeBody(t, rec)["unapplied"].([]any)
	if len(unapplied) != 1 {
		t.Fatalf("esperava 1 item em unapplied, veio %v", unapplied)
	}
}

// Trava que um emulador sem ConfigurableAdapter (ex.: DuckStation) recusa
// com 400 not_configurable — nunca 500, nunca um sucesso fingido.
func TestEmulatorConfigNotConfigurableAdapter(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/emulators/duckstation/config", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "not_configurable" {
		t.Fatalf("code = %q, esperado not_configurable", code)
	}
}

// Trava que pedir config de um emulador configurável mas não instalado
// recusa com 400 not_installed, nomeando o problema.
func TestEmulatorConfigNotInstalled(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/emulators/pcsx2/config", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "not_installed" {
		t.Fatalf("code = %q, esperado not_installed", code)
	}
}

// Emulador desconhecido é 404, não 400 — mesma convenção do resto da API.
func TestEmulatorConfigUnknownAdapter(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/emulators/nao-existe/config", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, esperado 404", rec.Code)
	}
}

// Trava o critério central do H3/H4: ler devolve as ações + o mapeamento
// real, gravar altera uma tecla preservando as outras.
func TestEmulatorBindingsReadWrite(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	installFakePCSX2(t)

	// Sem nenhum WriteBindings ainda: o arquivo (via installFakePCSX2) não
	// tem [Pad1], então bindings vêm todas sem Key/Button.
	getRec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/emulators/pcsx2/bindings", nil)
	if getRec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperado 200, corpo: %s", getRec.Code, getRec.Body.String())
	}
	body := decodeBody(t, getRec)
	actions, _ := body["actions"].([]any)
	if len(actions) == 0 {
		t.Fatal("esperava uma lista de ações não vazia")
	}

	postRec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/emulators/pcsx2/bindings", map[string]any{
		"bindings": []map[string]any{
			{"action": "Cross", "key": "Space"},
		},
	})
	if postRec.Code != http.StatusOK {
		t.Fatalf("POST bindings status = %d, esperado 200, corpo: %s", postRec.Code, postRec.Body.String())
	}

	getRec2 := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/emulators/pcsx2/bindings", nil)
	body2 := decodeBody(t, getRec2)
	bindings, _ := body2["bindings"].([]any)
	found := false
	for _, b := range bindings {
		m := b.(map[string]any)
		if m["action"] == "Cross" {
			found = true
			if m["key"] != "Space" {
				t.Fatalf("Cross.key = %v, esperado Space", m["key"])
			}
		}
	}
	if !found {
		t.Fatal("ação Cross não apareceu na leitura depois de gravada")
	}
}

func TestEmulatorBindingsNotBindableAdapter(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	rec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/emulators/duckstation/bindings", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "not_bindable" {
		t.Fatalf("code = %q, esperado not_bindable", code)
	}
}
