package install

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/doufl/zeux/internal/emulator"
)

// currentPlatform é a chave goos/goarch usada tanto pelo manifesto quanto por
// StartCore — os testes deste arquivo sempre montam a entrada da plataforma
// em que o teste está rodando de verdade.
func currentPlatform() string {
	return runtime.GOOS + "/" + runtime.GOARCH
}

// coresDirForTest resolve o mesmo diretório que installCore usa para
// promover um core — precisa ser chamado depois de t.Setenv("HOME", ...),
// senão aponta para o HOME real de quem roda o teste.
func coresDirForTest() (string, error) {
	return emulator.RetroArchManagedCoresDir()
}

// coreExtensionForTest espelha coreExtension() (retroarch.go, não exportada)
// só o bastante para montar o nome de arquivo de um core "já instalado" nos
// testes de no-op.
func coreExtensionForTest() string {
	switch runtime.GOOS {
	case "windows":
		return ".dll"
	case "darwin":
		return ".dylib"
	default:
		return ".so"
	}
}

// zipWithSingleFile monta um .zip com uma única entrada — mesmo formato que o
// buildbot publica para um core (scripts/download-retroarch-cores.mjs
// documenta isso).
func zipWithSingleFile(t *testing.T, entryName string, content []byte) []byte {
	t.Helper()

	var buf bytes.Buffer
	writer := zip.NewWriter(&buf)
	entry, err := writer.Create(entryName)
	if err != nil {
		t.Fatalf("criando entrada do zip: %v", err)
	}
	if _, err := entry.Write(content); err != nil {
		t.Fatalf("escrevendo entrada do zip: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("fechando zip: %v", err)
	}
	return buf.Bytes()
}

// allowTestServer prepara um httptest.Server de mentira para ser aceito
// pelas mesmas defesas que download() aplica a um host de verdade:
//   - checkHost (download.go) só aceita HTTPS de um host conhecido — o
//     servidor de teste precisa ser TLS (httptest.NewTLSServer) e seu host
//     entra temporariamente em allowedHosts.
//   - o certificado autoassinado do httptest.Server não é confiável para o
//     httpClient padrão do pacote — troca-se por server.Client(), que já
//     vem configurado para confiar nele.
//
// As duas trocas são desfeitas no fim do teste: são vars de pacote
// deliberadamente mutáveis para isto, não uma porta deixada aberta em
// produção.
func allowTestServer(t *testing.T, server *httptest.Server) {
	t.Helper()
	parsed, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parseando URL do servidor de teste: %v", err)
	}
	host := parsed.Hostname()
	allowedHosts[host] = true
	t.Cleanup(func() { delete(allowedHosts, host) })

	previousClient := httpClient
	httpClient = server.Client()
	t.Cleanup(func() { httpClient = previousClient })
}

// waitForJob espera o job sair de PhaseDownloading/Verifying/Extracting, com
// um teto curto — o servidor é local, não deveria demorar.
func waitForJob(t *testing.T, m *Manager, id string) Job {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		job, ok := m.Job(id)
		if !ok {
			t.Fatalf("job %s desapareceu", id)
		}
		if job.Phase == PhaseDone || job.Phase == PhaseFailed || job.Phase == PhaseCanceled {
			return *job
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("job %s não terminou dentro do prazo", id)
	return Job{}
}

// Trava o comportamento central do R2: SHA256 divergente do manifesto falha o
// job com um code estável, nomeia o core, e não promove nada para o
// diretório gerenciado. Sem rede — o "buildbot" é um httptest.Server local.
func TestStartCoreRejectsHashMismatch(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	zipBytes := zipWithSingleFile(t, "testcore.so", []byte("conteudo do core"))

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(zipBytes)
	}))
	defer server.Close()
	allowTestServer(t, server)

	manager := NewManager(mustCatalog(t), discardLogger())
	manager.retroArchManifest = &RetroArchCoreManifest{
		Cores: map[string]RetroArchCoreEntry{
			"testcore": {
				LibretroName: "testcore",
				Platforms: map[string]RetroArchCoreAsset{
					currentPlatform(): {
						URL:       server.URL,
						Filename:  "testcore.so.zip",
						Size:      int64(len(zipBytes)),
						SHA256:    "0000000000000000000000000000000000000000000000000000000000000f",
						Generated: true,
					},
				},
			},
		},
	}

	job, err := manager.StartCore(context.Background(), "testcore")
	if err != nil {
		t.Fatalf("StartCore: %v", err)
	}

	finished := waitForJob(t, manager, job.ID)
	if finished.Phase != PhaseFailed {
		t.Fatalf("Phase = %s, esperava %s", finished.Phase, PhaseFailed)
	}
	if finished.Code != "core_hash_mismatch" {
		t.Errorf("Code = %q, esperava %q", finished.Code, "core_hash_mismatch")
	}
	if finished.Error == "" {
		t.Error("Error vazio — a mensagem deveria dizer qual core e que o arquivo não confere")
	}

	coresDir, err := coresDirForTest()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(coresDir, "testcore.so")); err == nil {
		t.Error("o core não deveria ter sido promovido depois de um hash divergente")
	}
}

// O caminho feliz: hash bate, o core é extraído e promovido de forma atômica
// para o diretório gerenciado.
func TestStartCoreInstallsWhenHashMatches(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	content := []byte("conteudo do core de verdade")
	zipBytes := zipWithSingleFile(t, "testcore.so", content)
	sum := sha256.Sum256(zipBytes)
	expectedHash := hex.EncodeToString(sum[:])

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(zipBytes)
	}))
	defer server.Close()
	allowTestServer(t, server)

	manager := NewManager(mustCatalog(t), discardLogger())
	manager.retroArchManifest = &RetroArchCoreManifest{
		Cores: map[string]RetroArchCoreEntry{
			"testcore": {
				LibretroName: "testcore",
				Platforms: map[string]RetroArchCoreAsset{
					currentPlatform(): {
						URL:       server.URL,
						Filename:  "testcore.so.zip",
						Size:      int64(len(zipBytes)),
						SHA256:    expectedHash,
						Generated: true,
					},
				},
			},
		},
	}

	job, err := manager.StartCore(context.Background(), "testcore")
	if err != nil {
		t.Fatalf("StartCore: %v", err)
	}

	finished := waitForJob(t, manager, job.ID)
	if finished.Phase != PhaseDone {
		t.Fatalf("Phase = %s (%s), esperava %s", finished.Phase, finished.Error, PhaseDone)
	}
	if !finished.ChecksumVerified {
		t.Error("ChecksumVerified deveria ser true quando o hash bate")
	}

	coresDir, err := coresDirForTest()
	if err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join(coresDir, "testcore.so"))
	if err != nil {
		t.Fatalf("o core promovido não está no diretório gerenciado: %v", err)
	}
	if string(got) != string(content) {
		t.Errorf("conteúdo do core promovido = %q, esperava %q", got, content)
	}

	// Nenhum resto de diretório de trabalho: workDir some, o zip baixado não
	// vaza para dentro do diretório gerenciado.
	entries, err := os.ReadDir(coresDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Errorf("coresDir tem %d entradas, esperava só o core promovido: %v", len(entries), entries)
	}
}

// Um 404 do "buildbot" falha o job — não trava o daemon, não promove nada.
func TestStartCoreFailsOn404(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer server.Close()
	allowTestServer(t, server)

	manager := NewManager(mustCatalog(t), discardLogger())
	manager.retroArchManifest = &RetroArchCoreManifest{
		Cores: map[string]RetroArchCoreEntry{
			"testcore": {
				LibretroName: "testcore",
				Platforms: map[string]RetroArchCoreAsset{
					currentPlatform(): {URL: server.URL, Filename: "testcore.so.zip", SHA256: "irrelevante", Generated: true},
				},
			},
		},
	}

	job, err := manager.StartCore(context.Background(), "testcore")
	if err != nil {
		t.Fatalf("StartCore: %v", err)
	}

	finished := waitForJob(t, manager, job.ID)
	if finished.Phase != PhaseFailed {
		t.Fatalf("Phase = %s, esperava %s", finished.Phase, PhaseFailed)
	}
	if finished.Code == "core_hash_mismatch" {
		t.Error("um 404 não deveria ser relatado como hash divergente")
	}
}

// Uma conexão que cai no meio do download (o servidor promete mais bytes via
// Content-Length do que realmente envia) falha o job em vez de promover um
// core truncado.
func TestStartCoreFailsOnTruncatedDownload(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	full := zipWithSingleFile(t, "testcore.so", bytes.Repeat([]byte("x"), 1024))

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Promete o tamanho inteiro mas fecha a conexão na metade — o cliente
		// vê um corpo mais curto do que Content-Length prometeu.
		w.Header().Set("Content-Length", "999999")
		w.Write(full[:len(full)/2])
	}))
	defer server.Close()
	allowTestServer(t, server)

	manager := NewManager(mustCatalog(t), discardLogger())
	manager.retroArchManifest = &RetroArchCoreManifest{
		Cores: map[string]RetroArchCoreEntry{
			"testcore": {
				LibretroName: "testcore",
				Platforms: map[string]RetroArchCoreAsset{
					currentPlatform(): {URL: server.URL, Filename: "testcore.so.zip", Size: 999999, SHA256: "irrelevante", Generated: true},
				},
			},
		},
	}

	job, err := manager.StartCore(context.Background(), "testcore")
	if err != nil {
		t.Fatalf("StartCore: %v", err)
	}

	finished := waitForJob(t, manager, job.ID)
	if finished.Phase != PhaseFailed {
		t.Fatalf("Phase = %s, esperava %s", finished.Phase, PhaseFailed)
	}

	coresDir, err := coresDirForTest()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(coresDir, "testcore.so")); err == nil {
		t.Error("um download truncado não deveria ter sido promovido")
	}
}

// CancelJob interrompe um download em andamento (R3): o job vai para
// PhaseCanceled, não PhaseFailed, e nada é promovido — o handler do servidor
// de mentira nunca fecha a conexão sozinho, só o cancelamento do contexto do
// cliente encerra a leitura.
func TestCancelJobInterruptsCoreDownload(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	block := make(chan struct{})

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("primeiros bytes, depois trava"))
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
		<-block
	}))
	// server.Close() espera o handler em andamento terminar — precisa
	// destravar o handler (close(block)) ANTES de fechar o servidor, senão
	// os dois ficam esperando um pelo outro para sempre. Defers rodam em
	// ordem inversa à declaração, então close(block) é declarado por último
	// para rodar primeiro.
	defer server.Close()
	defer close(block)
	allowTestServer(t, server)

	manager := NewManager(mustCatalog(t), discardLogger())
	manager.retroArchManifest = &RetroArchCoreManifest{
		Cores: map[string]RetroArchCoreEntry{
			"testcore": {
				LibretroName: "testcore",
				Platforms: map[string]RetroArchCoreAsset{
					currentPlatform(): {URL: server.URL, Filename: "testcore.so.zip", SHA256: "irrelevante", Generated: true},
				},
			},
		},
	}

	job, err := manager.StartCore(context.Background(), "testcore")
	if err != nil {
		t.Fatalf("StartCore: %v", err)
	}

	// Tempo para o download realmente começar (a goroutine chegar na leitura
	// bloqueada do handler) antes de cancelar.
	time.Sleep(50 * time.Millisecond)

	if err := manager.CancelJob(job.ID); err != nil {
		t.Fatalf("CancelJob: %v", err)
	}

	finished := waitForJob(t, manager, job.ID)
	if finished.Phase != PhaseCanceled {
		t.Fatalf("Phase = %s, esperava %s", finished.Phase, PhaseCanceled)
	}

	coresDir, err := coresDirForTest()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(coresDir, "testcore.so")); err == nil {
		t.Error("um download cancelado não deveria ter promovido nada")
	}
}

// Um job que já terminou (ou nunca existiu) não pode ser cancelado — a
// mensagem diz isso, em vez de fingir sucesso.
func TestCancelJobFailsForFinishedOrUnknownJob(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	manager := NewManager(mustCatalog(t), discardLogger())

	if err := manager.CancelJob("nao-existe"); err == nil {
		t.Error("esperava erro ao cancelar um job inexistente")
	}

	manager.retroArchManifest = &RetroArchCoreManifest{
		Cores: map[string]RetroArchCoreEntry{
			"mesen": {LibretroName: "mesen_libretro", Platforms: map[string]RetroArchCoreAsset{}},
		},
	}
	coresDir, err := coresDirForTest()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(coresDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(coresDir, "mesen_libretro"+coreExtensionForTest()), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	doneJob, err := manager.StartCore(context.Background(), "mesen")
	if err != nil {
		t.Fatalf("StartCore: %v", err)
	}
	if doneJob.Phase != PhaseDone {
		t.Fatalf("pré-condição do teste falhou: Phase = %s, esperava %s", doneJob.Phase, PhaseDone)
	}
	if err := manager.CancelJob(doneJob.ID); err == nil {
		t.Error("esperava erro ao cancelar um job já concluído (no-op)")
	}
}

// Um core que a plataforma ainda não teve medida (R1: "generated": false) é
// recusado antes de qualquer tentativa de rede — "generated: false" não é
// "sem verificação", é "ninguém mediu isto ainda" (comentário de
// retroarch_manifest.go).
func TestStartCoreRejectsUngeneratedEntry(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	manager := NewManager(mustCatalog(t), discardLogger())
	manager.retroArchManifest = &RetroArchCoreManifest{
		Cores: map[string]RetroArchCoreEntry{
			"testcore": {
				LibretroName: "testcore",
				Platforms: map[string]RetroArchCoreAsset{
					currentPlatform(): {URL: "https://buildbot.libretro.com/x.zip", Generated: false},
				},
			},
		},
	}

	if _, err := manager.StartCore(context.Background(), "testcore"); err == nil {
		t.Fatal("esperava erro para uma entrada não gerada")
	}
}

// Um core desconhecido do manifesto é recusado com uma mensagem que nomeia o
// core, não um erro genérico.
func TestStartCoreRejectsUnknownCore(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	manager := NewManager(mustCatalog(t), discardLogger())
	manager.retroArchManifest = &RetroArchCoreManifest{Cores: map[string]RetroArchCoreEntry{}}

	_, err := manager.StartCore(context.Background(), "nao existe")
	if err == nil {
		t.Fatal("esperava erro para core desconhecido")
	}
}

// Baixar um core que já está instalado é no-op: o job volta já concluído, sem
// nenhuma requisição de rede.
func TestStartCoreIsNoOpWhenAlreadyInstalled(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	coresDir, err := coresDirForTest()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(coresDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// "mesen" é um core real (internal/emulator/retroarch.go), então
	// RetroArchCoreStatus sabe resolver o nome de arquivo esperado sozinho.
	if err := os.WriteFile(filepath.Join(coresDir, "mesen_libretro"+coreExtensionForTest()), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	manager := NewManager(mustCatalog(t), discardLogger())
	// Nenhum servidor de mentira registrado: se StartCore tentasse baixar
	// algo, o teste falharia por falta de host permitido / conexão recusada.
	manager.retroArchManifest = &RetroArchCoreManifest{
		Cores: map[string]RetroArchCoreEntry{
			"mesen": {
				LibretroName: "mesen_libretro",
				Platforms: map[string]RetroArchCoreAsset{
					currentPlatform(): {URL: "https://buildbot.libretro.com/nunca-deveria-ser-chamado.zip", Generated: true, SHA256: "irrelevante"},
				},
			},
		},
	}

	job, err := manager.StartCore(context.Background(), "mesen")
	if err != nil {
		t.Fatalf("StartCore: %v", err)
	}
	if job.Phase != PhaseDone {
		t.Fatalf("Phase = %s, esperava %s (no-op)", job.Phase, PhaseDone)
	}
}
