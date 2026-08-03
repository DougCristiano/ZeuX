package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/doufl/zeux/internal/api"
	"github.com/doufl/zeux/internal/consent"
	"github.com/doufl/zeux/internal/emulator"
	"github.com/doufl/zeux/internal/hardware"
	"github.com/doufl/zeux/internal/install"
	"github.com/doufl/zeux/internal/library"
	"github.com/doufl/zeux/internal/store"
	"github.com/doufl/zeux/internal/verdict"
)

// fakeProbe simula a leitura de hardware sem consultar a máquina real, para
// que os testes de rota controlem exatamente o retrato que o servidor recebe.
type fakeProbe struct {
	info hardware.HardwareInfo
	err  error
}

func (p fakeProbe) Detect(ctx context.Context) (hardware.HardwareInfo, error) {
	return p.info, p.err
}

// beefyHardware descreve uma máquina que qualquer console do catálogo
// considera viável, para não depender de limiares específicos nos testes de
// rota que só querem "um scan válido qualquer".
func beefyHardware() hardware.HardwareInfo {
	return hardware.HardwareInfo{
		ScannedAt: time.Now().UTC(),
		OS:        hardware.OSInfo{Platform: "linux", Arch: "amd64"},
		CPU: hardware.CPUInfo{
			Model: "CPU de teste", Vendor: "GenuineTeste",
			PhysicalCore: 16, LogicalCore: 32, BaseClockMHz: 4500,
		},
		GPUs: []hardware.GPUInfo{{
			Model: "GPU de teste", Vendor: "NVIDIA",
			VRAMBytes: 24 * 1024 * 1024 * 1024, Source: "teste",
		}},
		Memory: hardware.MemoryInfo{
			TotalBytes:     64 * 1024 * 1024 * 1024,
			AvailableBytes: 32 * 1024 * 1024 * 1024,
		},
		Warnings: []string{},
	}
}

// newTestServer monta um Server com as mesmas dependências de cmd/zeuxd, mas
// isolado do disco real: consent.Store e emulator.CustomStore normalmente
// gravam em os.UserConfigDir(), então redirecionamos essa pasta para um
// diretório temporário exclusivo do teste.
func newTestServer(t *testing.T, probe hardware.Probe) *api.Server {
	t.Helper()

	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir) // Linux/BSD
	t.Setenv("AppData", dir)         // Windows

	catalog, err := verdict.LoadCatalog()
	if err != nil {
		t.Fatalf("LoadCatalog: %v", err)
	}

	consentStore, err := consent.NewStore()
	if err != nil {
		t.Fatalf("consent.NewStore: %v", err)
	}

	registry := emulator.NewRegistry()

	customStore, err := emulator.NewCustomStore()
	if err != nil {
		t.Fatalf("emulator.NewCustomStore: %v", err)
	}

	db, err := store.Open()
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	launcher := emulator.NewLauncher(registry, emulator.NewSQLiteSessions(db), silentLogger())

	sources, err := install.LoadCatalog()
	if err != nil {
		t.Fatalf("install.LoadCatalog: %v", err)
	}
	installer := install.NewManager(sources, silentLogger())

	libraryStore := library.NewStore(db)

	return api.NewServer(probe, catalog, consentStore, registry, customStore, launcher, installer, libraryStore, silentLogger())
}

func silentLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func doJSON(t *testing.T, handler http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()

	var reader *bytes.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal do corpo: %v", err)
		}
		reader = bytes.NewReader(data)
	} else {
		reader = bytes.NewReader(nil)
	}

	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decodificando resposta %q: %v", rec.Body.String(), err)
	}
	return out
}

func errorCode(body map[string]any) string {
	errObj, ok := body["error"].(map[string]any)
	if !ok {
		return ""
	}
	code, _ := errObj["code"].(string)
	return code
}

// Trava que /health devolve os metadados do catálogo carregado, para que a
// interface possa exibir a versão do schema sem uma rota separada.
func TestHealthReturnsCatalogInfo(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	rec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/health", nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperado 200", rec.Code)
	}

	body := decodeBody(t, rec)
	if body["status"] != "ok" {
		t.Fatalf("status no corpo = %v, esperado \"ok\"", body["status"])
	}
	if body["consoles"] == nil {
		t.Fatal("esperava o campo consoles no corpo de /health")
	}
}

// Trava a regra de produto central do consentimento: o scan é recusado no
// servidor quando não há consentimento válido, mesmo que a interface nunca
// verifique isso sozinha.
func TestScanWithoutConsentIsForbidden(t *testing.T) {
	server := newTestServer(t, fakeProbe{info: beefyHardware()})
	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/hardware/scan", nil)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, esperado 403", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "consent_required" {
		t.Fatalf("code = %q, esperado consent_required", code)
	}
}

// Trava o caminho feliz: consentir, escanear, e ler o resultado de volta.
func TestConsentThenScanThenReadHardware(t *testing.T) {
	server := newTestServer(t, fakeProbe{info: beefyHardware()})
	handler := server.Routes()

	consentRec := doJSON(t, handler, http.MethodPost, "/api/v1/consent", map[string]bool{"granted": true})
	if consentRec.Code != http.StatusOK {
		t.Fatalf("POST /consent status = %d, esperado 200", consentRec.Code)
	}

	scanRec := doJSON(t, handler, http.MethodPost, "/api/v1/hardware/scan", nil)
	if scanRec.Code != http.StatusOK {
		t.Fatalf("POST /hardware/scan status = %d, esperado 200: %s", scanRec.Code, scanRec.Body.String())
	}

	hwRec := doJSON(t, handler, http.MethodGet, "/api/v1/hardware", nil)
	if hwRec.Code != http.StatusOK {
		t.Fatalf("GET /hardware status = %d, esperado 200", hwRec.Code)
	}

	body := decodeBody(t, hwRec)
	cpu, ok := body["cpu"].(map[string]any)
	if !ok || cpu["model"] != "CPU de teste" {
		t.Fatalf("hardware devolvido não bate com o scan: %v", body)
	}
}

// Trava que revogar o consentimento descarta o scan em memória — manter os
// dados depois de um "não" explícito contrariaria o que o usuário pediu.
func TestRevokeConsentClearsScan(t *testing.T) {
	server := newTestServer(t, fakeProbe{info: beefyHardware()})
	handler := server.Routes()

	doJSON(t, handler, http.MethodPost, "/api/v1/consent", map[string]bool{"granted": true})
	doJSON(t, handler, http.MethodPost, "/api/v1/hardware/scan", nil)
	doJSON(t, handler, http.MethodPost, "/api/v1/consent", map[string]bool{"granted": false})

	hwRec := doJSON(t, handler, http.MethodGet, "/api/v1/hardware", nil)
	if hwRec.Code != http.StatusNotFound {
		t.Fatalf("GET /hardware após revogar = %d, esperado 404", hwRec.Code)
	}
	if code := errorCode(decodeBody(t, hwRec)); code != "no_scan_yet" {
		t.Fatalf("code = %q, esperado no_scan_yet", code)
	}
}

// Trava que /hardware sem nenhum scan anterior devolve 404 com o code
// estável que a interface usa para distinguir "nunca rodou" de outros erros.
func TestGetHardwareWithoutScanReturns404(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	rec := doJSON(t, server.Routes(), http.MethodGet, "/api/v1/hardware", nil)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, esperado 404", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "no_scan_yet" {
		t.Fatalf("code = %q, esperado no_scan_yet", code)
	}
}

// Trava a validação de campos obrigatórios do lançamento, comum a
// /games/launch e /games/preview.
func TestLaunchMissingFieldsReturns400(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/games/launch", map[string]string{})

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "missing_fields" {
		t.Fatalf("code = %q, esperado missing_fields", code)
	}
}

// Trava que lançar sem opções explícitas e sem scan prévio devolve o code
// específico que orienta o usuário a rodar o scan, em vez de um erro genérico.
func TestLaunchWithoutScanReturnsNoScanYet(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	body := map[string]string{"rom_path": "/tmp/jogo.iso", "console_id": "ps2"}
	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/games/launch", body)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "no_scan_yet" {
		t.Fatalf("code = %q, esperado no_scan_yet", code)
	}
}

// Trava que um console inexistente no catálogo é rejeitado com um code
// distinto de "sem scan", já que são causas diferentes para a interface tratar.
func TestLaunchUnknownConsoleReturns400(t *testing.T) {
	server := newTestServer(t, fakeProbe{info: beefyHardware()})
	handler := server.Routes()

	doJSON(t, handler, http.MethodPost, "/api/v1/consent", map[string]bool{"granted": true})
	doJSON(t, handler, http.MethodPost, "/api/v1/hardware/scan", nil)

	body := map[string]string{"rom_path": "/tmp/jogo.iso", "console_id": "console-que-nao-existe"}
	rec := doJSON(t, handler, http.MethodPost, "/api/v1/games/launch", body)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "unknown_console" {
		t.Fatalf("code = %q, esperado unknown_console", code)
	}
}

// Trava o ciclo completo de emuladores personalizados: criar, listar e
// remover, exercitando o mesmo caminho que a interface usaria.
func TestCustomEmulatorLifecycle(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	handler := server.Routes()

	def := map[string]any{
		"id":          "meu-emulador",
		"name":        "Meu Emulador",
		"consoles":    []string{"ps1"},
		"binary_path": "/opt/meu-emulador/bin",
		"args":        []string{"{rom}"},
	}

	upsertRec := doJSON(t, handler, http.MethodPost, "/api/v1/custom-emulators", def)
	if upsertRec.Code != http.StatusOK {
		t.Fatalf("POST /custom-emulators status = %d, esperado 200: %s", upsertRec.Code, upsertRec.Body.String())
	}

	listRec := doJSON(t, handler, http.MethodGet, "/api/v1/custom-emulators", nil)
	listBody := decodeBody(t, listRec)
	customs, ok := listBody["custom_emulators"].([]any)
	if !ok || len(customs) != 1 {
		t.Fatalf("esperava 1 emulador personalizado, corpo = %v", listBody)
	}

	deleteRec := doJSON(t, handler, http.MethodDelete, "/api/v1/custom-emulators/meu-emulador", nil)
	if deleteRec.Code != http.StatusOK {
		t.Fatalf("DELETE status = %d, esperado 200: %s", deleteRec.Code, deleteRec.Body.String())
	}

	afterDeleteRec := doJSON(t, handler, http.MethodGet, "/api/v1/custom-emulators", nil)
	afterDeleteBody := decodeBody(t, afterDeleteRec)
	remaining, _ := afterDeleteBody["custom_emulators"].([]any)
	if len(remaining) != 0 {
		t.Fatalf("esperava lista vazia após DELETE, corpo = %v", afterDeleteBody)
	}
}

// Trava que uma definição sem {rom} nos argumentos é recusada — sem essa
// marca o emulador abriria sem jogo nenhum.
func TestCustomEmulatorWithoutROMPlaceholderIsRejected(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	def := map[string]any{
		"id":          "sem-rom",
		"name":        "Sem ROM",
		"consoles":    []string{"ps1"},
		"binary_path": "/opt/sem-rom/bin",
		"args":        []string{"--fullscreen"},
	}

	rec := doJSON(t, server.Routes(), http.MethodPost, "/api/v1/custom-emulators", def)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "invalid_definition" {
		t.Fatalf("code = %q, esperado invalid_definition", code)
	}
}

// Trava o achado do B2 (docs/sprint-b-plano.md): um preflight OPTIONS vindo
// da origem real do WebView Tauri em produção precisa devolver 204 com
// Access-Control-Allow-Origin ecoando exatamente essa origem. Sem isso, o
// fetch do WebView falha mesmo que o servidor responda com sucesso.
func TestCORSPreflightAllowsKnownWebViewOrigin(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/consent", nil)
	req.Header.Set("Origin", "tauri://localhost")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "content-type")
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, esperado 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "tauri://localhost" {
		t.Fatalf("Access-Control-Allow-Origin = %q, esperado a origem ecoada", got)
	}
}

// Trava a outra metade da regra do ADR 0001: a lista de origens é fechada, e
// uma origem fora dela nunca recebe Access-Control-Allow-Origin — nem por
// engano, nem "*".
func TestCORSPreflightRejectsUnknownOrigin(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/consent", nil)
	req.Header.Set("Origin", "http://exemplo.invalido")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "content-type")
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)

	if got, ok := rec.Result().Header["Access-Control-Allow-Origin"]; ok {
		t.Fatalf("Access-Control-Allow-Origin não deveria existir para origem desconhecida, veio %v", got)
	}
}

// Trava que uma requisição normal (não-preflight) também recebe o cabeçalho
// quando a origem é conhecida — achado do B2: sem isso, o WebView recebe 200
// do servidor mas o `fetch` falha do mesmo jeito ao tentar ler a resposta.
func TestCORSAllowsSimpleRequestFromKnownOrigin(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	req.Header.Set("Origin", "http://tauri.localhost")
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperado 200", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://tauri.localhost" {
		t.Fatalf("Access-Control-Allow-Origin = %q, esperado a origem ecoada", got)
	}
}

// Trava a válvula de desenvolvimento: SetDevOrigin libera uma origem extra
// (o devUrl do Vite, http://localhost:1420), sem abrir mão da lista fechada
// para qualquer outra origem.
func TestSetDevOriginAllowsOnlyThatOrigin(t *testing.T) {
	server := newTestServer(t, fakeProbe{})
	server.SetDevOrigin("http://localhost:1420")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	req.Header.Set("Origin", "http://localhost:1420")
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:1420" {
		t.Fatalf("Access-Control-Allow-Origin = %q, esperado a origem de dev liberada", got)
	}

	otherReq := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	otherReq.Header.Set("Origin", "http://localhost:9999")
	otherRec := httptest.NewRecorder()
	server.Routes().ServeHTTP(otherRec, otherReq)

	if got, ok := otherRec.Result().Header["Access-Control-Allow-Origin"]; ok {
		t.Fatalf("origem de dev não deveria liberar outras portas, veio %v", got)
	}
}

// Trava o formato estável de erro (code + message) para corpo inválido, já
// que a interface trata o code programaticamente.
func TestPostConsentWithInvalidBodyReturns400(t *testing.T) {
	server := newTestServer(t, fakeProbe{})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/consent", bytes.NewReader([]byte("não é json")))
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperado 400", rec.Code)
	}
	if code := errorCode(decodeBody(t, rec)); code != "invalid_body" {
		t.Fatalf("code = %q, esperado invalid_body", code)
	}
}
