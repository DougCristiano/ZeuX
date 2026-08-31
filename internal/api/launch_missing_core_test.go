package api_test

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/doufl/zeux/internal/emulator"
	"github.com/doufl/zeux/internal/install"
)

// fakeManagedRetroArch grava um "executável" de mentira no diretório
// gerenciado que Locate() confere primeiro (ver internal/emulator/discovery.go,
// findBinary) — sem isto, s.emulators.Resolve nunca acha o RetroArch nesta
// máquina de teste, e o caminho de download nem chega a ser considerado.
// O conteúdo é um script de verdade (não só bytes com +x): o relançamento
// que a tela faz depois do download chega a cmd.Start(), e o processo
// precisa conseguir rodar, ou o teste não teria como observar a sessão.
func fakeManagedRetroArch(t *testing.T) {
	t.Helper()

	root, err := emulator.ManagedRoot()
	if err != nil {
		t.Fatalf("ManagedRoot: %v", err)
	}
	// RetroArch atende dezenas de consoles — qualquer slice com mais de um
	// elemento cai no mesmo ramo "compartilhado" que ManagedEmulatorDir usa
	// para o adapter de verdade.
	dir := emulator.ManagedEmulatorDir(root, "retroarch", []string{"nes", "snes"})
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}

	name := "retroarch"
	if runtime.GOOS == "windows" {
		name = "retroarch.exe"
	}
	script := "#!/bin/sh\nexit 0\n"
	if err := os.WriteFile(filepath.Join(dir, name), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
}

func zipWithSingleFile(t *testing.T, entryName string, content []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	writer := zip.NewWriter(&buf)
	entry, err := writer.Create(entryName)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := entry.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// Ponta a ponta do R3: lançar um jogo pelo RetroArch com o core ausente
// dispara o download e devolve 202 com o job — e o servidor **não** lança o
// jogo sozinho ao terminar (decisão do Douglas, 2026-08-27: quem abre o jogo
// é a tela, repetindo a chamada quando o job chegar a "concluido"). Um
// servidor que abre um processo de jogo minutos depois surpreende quem já
// saiu da tela. Sem rede real: o "buildbot" é um httptest.NewTLSServer
// local, liberado pelos seams de teste do pacote install.
func TestLaunchStartsCoreDownloadWithoutLaunchingByItself(t *testing.T) {
	// RetroArchManagedCoresDir (emulator.bundledCoreDirsForWrite) lê $HOME
	// diretamente, sem passar por XDG_CONFIG_HOME/AppData — sem isto, o
	// download e o "já instalado" deste teste mexeriam no $HOME de verdade
	// de quem roda o teste.
	t.Setenv("HOME", t.TempDir())

	server, installer := newTestServerWithInstaller(t, fakeProbe{info: beefyHardware()})
	handler := server.Routes()

	doJSON(t, handler, http.MethodPost, "/api/v1/consent", map[string]bool{"granted": true})
	doJSON(t, handler, http.MethodPost, "/api/v1/hardware/scan", nil)

	fakeManagedRetroArch(t)

	binaryExt := ".so"
	switch runtime.GOOS {
	case "windows":
		binaryExt = ".dll"
	case "darwin":
		binaryExt = ".dylib"
	}
	binaryName := "mesen_libretro" + binaryExt
	content := []byte("core de mentira, só para o teste")
	zipBytes := zipWithSingleFile(t, binaryName, content)
	sum := sha256.Sum256(zipBytes)
	expectedHash := hex.EncodeToString(sum[:])

	fakeBuildbot := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(zipBytes)
	}))
	defer fakeBuildbot.Close()

	parsedURL, err := url.Parse(fakeBuildbot.URL)
	if err != nil {
		t.Fatalf("parseando URL do servidor de teste: %v", err)
	}
	t.Cleanup(install.AllowHostForTesting(parsedURL.Hostname()))
	t.Cleanup(install.SetHTTPClientForTesting(fakeBuildbot.Client()))

	platform := runtime.GOOS + "/" + runtime.GOARCH
	installer.SetRetroArchManifestForTesting(&install.RetroArchCoreManifest{
		Cores: map[string]install.RetroArchCoreEntry{
			"mesen": {
				LibretroName: "mesen_libretro",
				Platforms: map[string]install.RetroArchCoreAsset{
					platform: {
						URL:       fakeBuildbot.URL,
						Filename:  binaryName + ".zip",
						Size:      int64(len(zipBytes)),
						SHA256:    expectedHash,
						Generated: true,
					},
				},
			},
		},
	})

	romPath := filepath.Join(t.TempDir(), "jogo.nes")
	if err := os.WriteFile(romPath, []byte("rom de mentira"), 0o644); err != nil {
		t.Fatal(err)
	}

	body := map[string]any{
		"rom_path":    romPath,
		"console_id":  "nes",
		"emulator_id": "retroarch",
		"core":        "mesen",
		"options":     map[string]any{},
	}
	rec := doJSON(t, handler, http.MethodPost, "/api/v1/games/launch", body)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, esperava %d (download disparado) — corpo: %s", rec.Code, http.StatusAccepted, rec.Body.String())
	}

	respBody := decodeBody(t, rec)
	if respBody["downloading_core"] != true {
		t.Errorf("esperava downloading_core=true no corpo: %v", respBody)
	}
	job, ok := respBody["install_job"].(map[string]any)
	if !ok {
		t.Fatalf("esperava install_job no corpo: %v", respBody)
	}
	if job["core_name"] != "mesen" {
		t.Errorf("core_name = %v, esperava \"mesen\"", job["core_name"])
	}

	// O download termina sozinho (o "buildbot" de mentira responde na hora),
	// mas o jogo NÃO pode abrir por conta do servidor.
	jobID := job["id"].(string)
	deadline := time.Now().Add(5 * time.Second)
	for {
		got, ok := installer.Job(jobID)
		if !ok {
			t.Fatal("job desapareceu")
		}
		if got.Phase == install.PhaseDone {
			break
		}
		if got.Phase == install.PhaseFailed || got.Phase == install.PhaseCanceled {
			t.Fatalf("download não concluiu: %+v", got)
		}
		if time.Now().After(deadline) {
			t.Fatalf("download não terminou dentro do prazo: %+v", got)
		}
		time.Sleep(10 * time.Millisecond)
	}

	// Margem generosa: se existisse um lançamento em segundo plano, ele teria
	// tempo de sobra para acontecer aqui.
	time.Sleep(300 * time.Millisecond)

	sessionsRec := doJSON(t, handler, http.MethodGet, "/api/v1/sessions", nil)
	sessionsBody := decodeBody(t, sessionsRec)
	if sessions, _ := sessionsBody["sessions"].([]any); len(sessions) != 0 {
		t.Errorf("o servidor não deveria lançar o jogo sozinho — quem abre é a tela: %v", sessions)
	}

	// E a segunda chamada de lançamento (o que a tela faz quando o job
	// termina) agora acha o core no lugar e abre o jogo de verdade.
	rec2 := doJSON(t, handler, http.MethodPost, "/api/v1/games/launch", body)
	if rec2.Code != http.StatusOK {
		t.Fatalf("relançamento status = %d, esperava 200 — corpo: %s", rec2.Code, rec2.Body.String())
	}

	sessionsRec = doJSON(t, handler, http.MethodGet, "/api/v1/sessions", nil)
	sessionsBody = decodeBody(t, sessionsRec)
	sessions, _ := sessionsBody["sessions"].([]any)
	if len(sessions) != 1 {
		t.Fatalf("esperava exatamente 1 sessão depois do relançamento, veio %d: %v", len(sessions), sessions)
	}
	if sessions[0].(map[string]any)["rom_path"] != romPath {
		t.Errorf("sessão gravada para a ROM errada: %v", sessions[0])
	}
}

// Core já instalado: /games/launch não deveria criar nenhum job de download
// — critério de aceite explícito do R3.
func TestLaunchDoesNotCreateJobWhenCoreAlreadyInstalled(t *testing.T) {
	// RetroArchManagedCoresDir (emulator.bundledCoreDirsForWrite) lê $HOME
	// diretamente, sem passar por XDG_CONFIG_HOME/AppData — sem isto, o
	// download e o "já instalado" deste teste mexeriam no $HOME de verdade
	// de quem roda o teste.
	t.Setenv("HOME", t.TempDir())

	server, installer := newTestServerWithInstaller(t, fakeProbe{info: beefyHardware()})
	handler := server.Routes()

	doJSON(t, handler, http.MethodPost, "/api/v1/consent", map[string]bool{"granted": true})
	doJSON(t, handler, http.MethodPost, "/api/v1/hardware/scan", nil)

	fakeManagedRetroArch(t)

	coresDir, err := emulator.RetroArchManagedCoresDir()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(coresDir, 0o755); err != nil {
		t.Fatal(err)
	}
	ext := ".so"
	switch runtime.GOOS {
	case "windows":
		ext = ".dll"
	case "darwin":
		ext = ".dylib"
	}
	if err := os.WriteFile(filepath.Join(coresDir, "mesen_libretro"+ext), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	romPath := filepath.Join(t.TempDir(), "jogo.nes")
	if err := os.WriteFile(romPath, []byte("rom de mentira"), 0o644); err != nil {
		t.Fatal(err)
	}

	body := map[string]any{
		"rom_path":    romPath,
		"console_id":  "nes",
		"emulator_id": "retroarch",
		"core":        "mesen",
		"options":     map[string]any{},
	}
	rec := doJSON(t, handler, http.MethodPost, "/api/v1/games/launch", body)

	// O "RetroArch" de mentira sai(0) na hora, então o lançamento em si
	// termina rápido — o que importa aqui é que a resposta não foi
	// downloading_core.
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, esperava %d (lançamento direto, sem download) — corpo: %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	jobsRec := doJSON(t, handler, http.MethodGet, "/api/v1/installs", nil)
	jobsBody := decodeBody(t, jobsRec)
	jobs, _ := jobsBody["installs"].([]any)
	if len(jobs) != 0 {
		t.Errorf("esperava nenhum job de instalação (core já presente), achou %d: %v", len(jobs), jobs)
	}

	_ = installer // installer só é usado para injeção de manifesto no outro teste
}

// Sem manifesto sintético injetado, o core cai no manifesto real embutido —
// hoje "generated: false" para tudo (ADR 0015/R1, host bloqueado neste
// ambiente). O lançamento precisa recusar nomeando o core, não com "erro ao
// lançar" genérico, e sem criar nenhuma sessão fantasma.
func TestLaunchNamesTheMissingCoreWhenDownloadCannotStart(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	server, _ := newTestServerWithInstaller(t, fakeProbe{info: beefyHardware()})
	handler := server.Routes()

	doJSON(t, handler, http.MethodPost, "/api/v1/consent", map[string]bool{"granted": true})
	doJSON(t, handler, http.MethodPost, "/api/v1/hardware/scan", nil)

	fakeManagedRetroArch(t)

	romPath := filepath.Join(t.TempDir(), "jogo.nes")
	if err := os.WriteFile(romPath, []byte("rom de mentira"), 0o644); err != nil {
		t.Fatal(err)
	}

	body := map[string]any{
		"rom_path":    romPath,
		"console_id":  "nes",
		"emulator_id": "retroarch",
		"core":        "mesen",
		"options":     map[string]any{},
	}
	rec := doJSON(t, handler, http.MethodPost, "/api/v1/games/launch", body)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, esperava %d — corpo: %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
	respBody := decodeBody(t, rec)
	if code := errorCode(respBody); code != "launch_failed" {
		t.Errorf("code = %q, esperava %q", code, "launch_failed")
	}
	message, _ := respBody["error"].(map[string]any)["message"].(string)
	if !strings.Contains(message, "mesen") {
		t.Errorf("mensagem deveria nomear o core que falta: %q", message)
	}

	sessionsRec := doJSON(t, handler, http.MethodGet, "/api/v1/sessions", nil)
	sessionsBody := decodeBody(t, sessionsRec)
	if sessions, _ := sessionsBody["sessions"].([]any); len(sessions) != 0 {
		t.Errorf("nenhuma sessão deveria ter sido criada: %v", sessions)
	}
}

// Cancelar um download de core em andamento via DELETE /installs/{id}
// interrompe de verdade — o job vai para "cancelado" e o jogo não é lançado
// automaticamente depois.
func TestCancelInstallStopsCoreDownload(t *testing.T) {
	// RetroArchManagedCoresDir (emulator.bundledCoreDirsForWrite) lê $HOME
	// diretamente, sem passar por XDG_CONFIG_HOME/AppData — sem isto, o
	// download e o "já instalado" deste teste mexeriam no $HOME de verdade
	// de quem roda o teste.
	t.Setenv("HOME", t.TempDir())

	server, installer := newTestServerWithInstaller(t, fakeProbe{info: beefyHardware()})
	handler := server.Routes()

	doJSON(t, handler, http.MethodPost, "/api/v1/consent", map[string]bool{"granted": true})
	doJSON(t, handler, http.MethodPost, "/api/v1/hardware/scan", nil)

	fakeManagedRetroArch(t)

	block := make(chan struct{})
	fakeBuildbot := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("primeiros bytes"))
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
		<-block
	}))
	// server.Close() espera o handler terminar — precisa destravar
	// (close(block)) antes, senão os dois travam um esperando o outro.
	defer fakeBuildbot.Close()
	defer close(block)

	parsedURL, err := url.Parse(fakeBuildbot.URL)
	if err != nil {
		t.Fatalf("parseando URL do servidor de teste: %v", err)
	}
	t.Cleanup(install.AllowHostForTesting(parsedURL.Hostname()))
	t.Cleanup(install.SetHTTPClientForTesting(fakeBuildbot.Client()))

	platform := runtime.GOOS + "/" + runtime.GOARCH
	installer.SetRetroArchManifestForTesting(&install.RetroArchCoreManifest{
		Cores: map[string]install.RetroArchCoreEntry{
			"mesen": {
				LibretroName: "mesen_libretro",
				Platforms: map[string]install.RetroArchCoreAsset{
					platform: {URL: fakeBuildbot.URL, Filename: "mesen_libretro.so.zip", SHA256: "irrelevante", Generated: true},
				},
			},
		},
	})

	romPath := filepath.Join(t.TempDir(), "jogo.nes")
	if err := os.WriteFile(romPath, []byte("rom de mentira"), 0o644); err != nil {
		t.Fatal(err)
	}

	body := map[string]any{
		"rom_path":    romPath,
		"console_id":  "nes",
		"emulator_id": "retroarch",
		"core":        "mesen",
		"options":     map[string]any{},
	}
	rec := doJSON(t, handler, http.MethodPost, "/api/v1/games/launch", body)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, esperava %d — corpo: %s", rec.Code, http.StatusAccepted, rec.Body.String())
	}
	job := decodeBody(t, rec)["install_job"].(map[string]any)
	jobID := job["id"].(string)

	time.Sleep(50 * time.Millisecond) // dá tempo do download realmente começar

	cancelRec := doJSON(t, handler, http.MethodDelete, "/api/v1/installs/"+jobID, nil)
	if cancelRec.Code != http.StatusOK {
		t.Fatalf("DELETE /installs/%s status = %d, esperava 200: %s", jobID, cancelRec.Code, cancelRec.Body.String())
	}

	deadline := time.Now().Add(5 * time.Second)
	for {
		got, ok := installer.Job(jobID)
		if !ok {
			t.Fatal("job desapareceu")
		}
		if got.Phase == install.PhaseCanceled {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("job não chegou a \"cancelado\": %+v", got)
		}
		time.Sleep(10 * time.Millisecond)
	}

	sessionsRec := doJSON(t, handler, http.MethodGet, "/api/v1/sessions", nil)
	sessionsBody := decodeBody(t, sessionsRec)
	if sessions, _ := sessionsBody["sessions"].([]any); len(sessions) != 0 {
		t.Errorf("cancelar o download não deveria ter lançado o jogo: %v", sessions)
	}
}
