package igdb

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/doufl/zeux/internal/emulator"
	"github.com/doufl/zeux/internal/library"
	"github.com/doufl/zeux/internal/store"
)

func silentLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// newTestLibrary cria um library.Store sobre um banco temporário — mesmo
// padrão de internal/library/library_test.go.
func newTestLibrary(t *testing.T) *library.Store {
	t.Helper()
	db, err := store.OpenAt(filepath.Join(t.TempDir(), "zeux.db"))
	if err != nil {
		t.Fatalf("store.OpenAt: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return library.NewStore(db)
}

// seedGame grava uma pasta e um jogo direto no banco, para os testes de
// ScrapeManager não precisarem de um arquivo de ROM real em disco.
func seedGame(t *testing.T, lib *library.Store, consoleID, title string) library.Game {
	t.Helper()
	ctx := context.Background()

	folder, err := lib.AddFolder(ctx, consoleID, "/jogos/"+consoleID)
	if err != nil {
		t.Fatalf("AddFolder: %v", err)
	}
	if err := lib.SaveGames(ctx, folder.ID, []library.NewGame{
		{ConsoleID: consoleID, Path: "/jogos/" + consoleID + "/" + title + ".zip", Title: title},
	}); err != nil {
		t.Fatalf("SaveGames: %v", err)
	}

	games, err := lib.ListGames(ctx, consoleID)
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	for _, g := range games {
		if g.Title == title {
			return g
		}
	}
	t.Fatalf("jogo %q não encontrado depois de gravado", title)
	return library.Game{}
}

// gamesEndpoint devolve um handler que responde por título: jogos em found
// devolvem uma capa; qualquer outro título devolve lista vazia (não
// encontrado). Um handler só, reaproveitado entre os testes deste arquivo.
func gamesEndpoint(t *testing.T, found map[string]string) http.HandlerFunc {
	t.Helper()
	return func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		query := string(body)
		w.Header().Set("Content-Type", "application/json")

		for title, imageID := range found {
			if strings.Contains(query, title) {
				w.Write([]byte(`[{"name":"` + title + `","first_release_date":774144000,"cover":{"id":1,"image_id":"` + imageID + `"}}]`))
				return
			}
		}
		w.Write([]byte(`[]`))
	}
}

func imageEndpoint() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("capa-de-teste"))
	}
}

// setManagedRootEnv aponta os.UserConfigDir() (via XDG_CONFIG_HOME/AppData)
// para um diretório temporário, para GameCoverDir gravar num lugar isolado
// do teste — mesmo mecanismo que internal/api/server_test.go já usa para
// consent.Store/CustomStore.
func setManagedRootEnv(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("AppData", dir)
	return dir
}

func waitJobDone(t *testing.T, m *ScrapeManager, jobID string) *Job {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		job, ok := m.Job(jobID)
		if !ok {
			t.Fatalf("job %q sumiu", jobID)
		}
		if job.Phase == PhaseDone || job.Phase == PhaseFailed {
			return job
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("job %q não terminou a tempo", jobID)
	return nil
}

// Trava o caminho feliz do lote: um jogo é encontrado (ganha capa), outro
// não é encontrado (vira "not_found") — os dois continuam processados até o
// fim, um não encontrado não derruba o outro.
func TestScrapeBatchPartialSuccess(t *testing.T) {
	setManagedRootEnv(t)
	lib := newTestLibrary(t)
	credsStore := newTestCredentialsStore(t)
	if err := credsStore.Save(testCredentials()); err != nil {
		t.Fatalf("Save credenciais: %v", err)
	}

	found := seedGame(t, lib, "snes", "Chrono Trigger")
	notFound := seedGame(t, lib, "snes", "Jogo Sem Capa")

	mux := http.NewServeMux()
	mux.HandleFunc("/oauth2/token", tokenHandler)
	mux.HandleFunc("/v4/games", gamesEndpoint(t, map[string]string{"Chrono Trigger": "abcd1234"}))
	mux.HandleFunc("/images/upload/t_cover_big/abcd1234.jpg", imageEndpoint())
	fakeIGDBServer(t, mux)

	// Fake do libretro-thumbnails que responde 404 a tudo: força os dois jogos
	// a cair para o IGDB de forma determinística, sem tocar a rede real
	// (FetchLibretroThumbnail agora tenta várias variações do nome).
	fakeLibretroThumbnailsServer(t, http.NewServeMux())

	manager := NewScrapeManager(lib, credsStore, silentLogger())
	job, err := manager.Start(context.Background(), nil)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}

	done := waitJobDone(t, manager, job.ID)
	if done.Phase != PhaseDone {
		t.Fatalf("Phase = %q, esperado %q (erro: %s)", done.Phase, PhaseDone, done.Error)
	}
	if done.Processed != 2 {
		t.Fatalf("Processed = %d, esperado 2", done.Processed)
	}

	reloadedFound, ok, err := lib.GameByID(context.Background(), found.ID)
	if err != nil || !ok {
		t.Fatalf("GameByID(found): ok=%v err=%v", ok, err)
	}
	if reloadedFound.CoverPath == "" {
		t.Fatal("jogo encontrado deveria ter cover_path preenchido")
	}

	reloadedNotFound, ok, err := lib.GameByID(context.Background(), notFound.ID)
	if err != nil || !ok {
		t.Fatalf("GameByID(notFound): ok=%v err=%v", ok, err)
	}
	if reloadedNotFound.CoverStatus != "not_found" {
		t.Fatalf("cover_status = %q, esperado \"not_found\"", reloadedNotFound.CoverStatus)
	}
	if reloadedNotFound.CoverPath != "" {
		t.Fatal("jogo não encontrado não pode ter cover_path preenchido")
	}
}

// Trava a mudança de 2026-08-17: sem credencial PESSOAL conectada, Start não
// recusa mais com ErrNotConfigured — cai na credencial de teste embutida
// (defaultCredentials, credentials.go), pensada para pequenos grupos de
// testadores não precisarem configurar nada antes da busca funcionar. Sem
// jogo na biblioteca (lote vazio), o job conclui sem tentar a rede (mesma
// otimização que a busca automática depende), então este teste não precisa
// de um servidor IGDB falso para travar a regra.
func TestScrapeStartWithoutPersonalCredentialsFallsBackToDefault(t *testing.T) {
	withDefaultCredentials(t, "default-id", "default-secret")
	setManagedRootEnv(t)
	lib := newTestLibrary(t)
	credsStore := newTestCredentialsStore(t) // nunca Save() — sem credencial pessoal

	manager := NewScrapeManager(lib, credsStore, silentLogger())
	job, err := manager.Start(context.Background(), nil)
	if err != nil {
		t.Fatalf("Start sem credencial pessoal: erro = %v, esperava cair na credencial padrão", err)
	}

	done := waitJobDone(t, manager, job.ID)
	if done.Phase != PhaseDone {
		t.Fatalf("phase = %q, esperado %q", done.Phase, PhaseDone)
	}
}

// Achado real, 2026-09-06: com a credencial do IGDB suspensa (403 do
// Twitch), o lote inteiro falhava antes de processar qualquer jogo — mesmo
// para jogos que o libretro-thumbnails (thumbnails.go) resolveria sem
// nenhuma credencial. A causa era scrape.go autenticar uma vez, fora do
// laço, antes de sequer tentar a fonte gratuita por jogo. Trava que agora um
// console mapeado no libretro-thumbnails ganha capa mesmo com o IGDB fora do
// ar, e o job termina "concluido", não "falhou".
func TestScrapeFallsBackToLibretroThumbnailWhenIGDBAuthFails(t *testing.T) {
	setManagedRootEnv(t)
	lib := newTestLibrary(t)
	credsStore := newTestCredentialsStore(t)
	if err := credsStore.Save(testCredentials()); err != nil {
		t.Fatalf("Save credenciais: %v", err)
	}

	game := seedGame(t, lib, "nes", "Super Mario Bros")

	// IGDB fora do ar: autenticar sempre devolve 403 (suspensão de app, o
	// mesmo caso real de 2026-08-18).
	igdbMux := http.NewServeMux()
	igdbMux.HandleFunc("/oauth2/token", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	})
	fakeIGDBServer(t, igdbMux)

	// libretro-thumbnails tem a capa deste jogo, sem credencial nenhuma.
	thumbMux := http.NewServeMux()
	thumbMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/Nintendo - Nintendo Entertainment System/Named_Boxarts/Super Mario Bros.png" {
			http.NotFound(w, r)
			return
		}
		w.Write([]byte("capa-de-mentira"))
	})
	fakeLibretroThumbnailsServer(t, thumbMux)

	manager := NewScrapeManager(lib, credsStore, silentLogger())
	job, err := manager.Start(context.Background(), nil)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}

	done := waitJobDone(t, manager, job.ID)
	if done.Phase != PhaseDone {
		t.Fatalf("Phase = %q, esperado %q (IGDB fora do ar não deveria derrubar o lote) — erro: %s", done.Phase, PhaseDone, done.Error)
	}

	reloaded, ok, err := lib.GameByID(context.Background(), game.ID)
	if err != nil || !ok {
		t.Fatalf("GameByID: ok=%v err=%v", ok, err)
	}
	if reloaded.CoverPath == "" {
		t.Fatal("jogo deveria ter ganhado capa via libretro-thumbnails mesmo com o IGDB suspenso")
	}
}

// Trava a correção de 2026-09-08 (relato do Douglas: botão "Buscar capas"
// sumiu e a busca de um jogo específico recusava com "conecte sua conta"
// mesmo sem nenhuma tentativa de rede) — Start não pode mais recusar o lote
// inteiro por falta de credencial: sem credencial pessoal NEM padrão
// (defaultCredentials vazio — o caso real de um build local sem os ldflags
// do release oficial), o lote roda mesmo assim. Um jogo que libretro-
// thumbnails também não encontra vira "not_found" com uma mensagem
// explicando o motivo, nunca "error" — SearchGame não chega a ser chamado.
func TestScrapeRunsWithoutAnyCredentialFallingBackToNotFound(t *testing.T) {
	setManagedRootEnv(t)
	lib := newTestLibrary(t)
	credsStore := newTestCredentialsStore(t) // nunca Save() — sem credencial pessoal
	withDefaultCredentials(t, "", "")        // e sem credencial padrão embutida

	game := seedGame(t, lib, "nes", "Jogo Sem Capa Em Lugar Nenhum")

	// libretro-thumbnails não tem a capa deste jogo — qualquer caminho
	// devolve 404, forçando o miss que expõe a falta de credencial do IGDB.
	thumbMux := http.NewServeMux()
	thumbMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})
	fakeLibretroThumbnailsServer(t, thumbMux)

	manager := NewScrapeManager(lib, credsStore, silentLogger())
	job, err := manager.Start(context.Background(), nil)
	if err != nil {
		t.Fatalf("Start sem credencial nenhuma: erro = %v, esperava rodar mesmo assim", err)
	}

	done := waitJobDone(t, manager, job.ID)
	if done.Phase != PhaseDone {
		t.Fatalf("Phase = %q, esperado %q — erro: %s", done.Phase, PhaseDone, done.Error)
	}
	if len(done.Results) != 1 || done.Results[0].Status != "not_found" {
		t.Fatalf("Results = %+v, esperado um resultado \"not_found\"", done.Results)
	}
	if done.Results[0].Message == "" {
		t.Fatal("Message deveria explicar que não há credencial do IGDB para tentar a segunda fonte")
	}

	reloaded, ok, err := lib.GameByID(context.Background(), game.ID)
	if err != nil || !ok {
		t.Fatalf("GameByID: ok=%v err=%v", ok, err)
	}
	if reloaded.CoverStatus != "not_found" {
		t.Fatalf("cover_status = %q, esperado \"not_found\"", reloaded.CoverStatus)
	}
}

// Trava a correção de 2026-09-08: uma capa colocada manualmente
// (internal/api.handleSetGameCover) enquanto o lote automático já está
// processando aquele jogo não pode ser sobrescrita quando o lote termina
// depois — mesmo que o snapshot inicial (UncoveredGames) tenha capturado o
// jogo como "sem capa" antes da troca manual acontecer. Sem a escrita
// condicional (SetCoverIfUncovered), o lote vencia a corrida e revertia a
// capa manual para a encontrada pelo scraper (ou para "error"/"not_found").
func TestScrapeBatchNeverOverwritesCoverSetDuringTheRun(t *testing.T) {
	setManagedRootEnv(t)
	lib := newTestLibrary(t)
	credsStore := newTestCredentialsStore(t)
	if err := credsStore.Save(testCredentials()); err != nil {
		t.Fatalf("Save credenciais: %v", err)
	}

	game := seedGame(t, lib, "snes", "Chrono Trigger")

	// libretro-thumbnails não tem a capa: força o caminho até o IGDB, onde
	// a autenticação fica presa em `block` até o teste liberar — dá tempo
	// determinístico para simular a troca manual no meio do processamento.
	thumbMux := http.NewServeMux()
	thumbMux.HandleFunc("/", http.NotFound)
	fakeLibretroThumbnailsServer(t, thumbMux)

	block := make(chan struct{})
	igdbMux := http.NewServeMux()
	igdbMux.HandleFunc("/oauth2/token", func(w http.ResponseWriter, r *http.Request) {
		<-block
		tokenHandler(w, r)
	})
	igdbMux.HandleFunc("/v4/games", gamesEndpoint(t, map[string]string{"Chrono Trigger": "abcd1234"}))
	igdbMux.HandleFunc("/images/upload/t_cover_big/abcd1234.jpg", imageEndpoint())
	fakeIGDBServer(t, igdbMux)

	manager := NewScrapeManager(lib, credsStore, silentLogger())
	job, err := manager.Start(context.Background(), nil)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}

	// A busca do lote está presa em `block`, tentando alcançar o IGDB — o
	// jogo ainda estava "sem capa" quando UncoveredGames() foi lido lá
	// dentro de Start(). Uma troca manual acontece agora, no meio da
	// corrida.
	const manualCover = "snes/jogos/manual/cover.jpg"
	if err := lib.SetCover(context.Background(), game.ID, manualCover); err != nil {
		t.Fatalf("SetCover manual: %v", err)
	}

	close(block)
	done := waitJobDone(t, manager, job.ID)
	if done.Phase != PhaseDone {
		t.Fatalf("Phase = %q, esperado %q (erro: %s)", done.Phase, PhaseDone, done.Error)
	}

	reloaded, ok, err := lib.GameByID(context.Background(), game.ID)
	if err != nil || !ok {
		t.Fatalf("GameByID: ok=%v err=%v", ok, err)
	}
	if reloaded.CoverPath != manualCover {
		t.Fatalf("cover_path = %q, esperado a capa manual %q sobrevivendo ao lote", reloaded.CoverPath, manualCover)
	}
}

// Trava que só um lote roda por vez — uma segunda chamada enquanto a
// primeira está em andamento é recusada, não enfileirada silenciosamente.
func TestScrapeStartWhileRunningRefuses(t *testing.T) {
	setManagedRootEnv(t)
	lib := newTestLibrary(t)
	credsStore := newTestCredentialsStore(t)
	if err := credsStore.Save(testCredentials()); err != nil {
		t.Fatalf("Save credenciais: %v", err)
	}
	seedGame(t, lib, "snes", "Chrono Trigger")

	block := make(chan struct{})
	mux := http.NewServeMux()
	mux.HandleFunc("/oauth2/token", func(w http.ResponseWriter, r *http.Request) {
		<-block // segura a autenticação até o teste liberar
		tokenHandler(w, r)
	})
	mux.HandleFunc("/v4/games", gamesEndpoint(t, nil))
	fakeIGDBServer(t, mux)
	// 404 em tudo no libretro-thumbnails: o jogo semeado precisa chegar ao
	// caminho do IGDB (a autenticação segurada por `block`) sem depender da
	// rede real.
	fakeLibretroThumbnailsServer(t, http.NewServeMux())

	manager := NewScrapeManager(lib, credsStore, silentLogger())
	first, err := manager.Start(context.Background(), nil)
	if err != nil {
		t.Fatalf("primeiro Start: %v", err)
	}

	_, err = manager.Start(context.Background(), nil)
	if err != ErrScrapeInProgress {
		t.Fatalf("segundo Start: erro = %v, esperado ErrScrapeInProgress", err)
	}

	close(block)
	waitJobDone(t, manager, first.ID)
}

// Achado testando o H2 de verdade em 2026-08-05 (mesma classe de bug, ver
// internal/api/server.go): um lote sem nenhum jogo elegível conclui sem
// nunca passar pelo laço que preenche Job.Results — se o campo ficasse
// nil, serializaria como `null` e derrubaria `job.results.filter(...)` no
// front. Trava que Results é sempre um slice de verdade, mesmo vazio.
func TestScrapeEmptyBatchResultsIsNeverNil(t *testing.T) {
	setManagedRootEnv(t)
	lib := newTestLibrary(t)
	credsStore := newTestCredentialsStore(t)
	if err := credsStore.Save(testCredentials()); err != nil {
		t.Fatalf("Save credenciais: %v", err)
	}
	// Nenhum jogo cadastrado — UncoveredGames devolve lote vazio.

	mux := http.NewServeMux()
	mux.HandleFunc("/oauth2/token", tokenHandler)
	fakeIGDBServer(t, mux)

	manager := NewScrapeManager(lib, credsStore, silentLogger())
	job, err := manager.Start(context.Background(), nil)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}

	done := waitJobDone(t, manager, job.ID)
	if done.Results == nil {
		t.Fatal("Results não pode ser nil — serializaria como null e quebraria o front")
	}
	if len(done.Results) != 0 {
		t.Fatalf("esperava lote vazio, veio %d resultados", len(done.Results))
	}
}

// igdbWithMetadata responde a busca de "Chrono Trigger" com ano, resumo,
// gêneros e uma publicadora que NÃO é desenvolvedora antes da que é.
func igdbWithMetadata(t *testing.T) {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/oauth2/token", tokenHandler)
	mux.HandleFunc("/v4/games", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[{"name":"Chrono Trigger","first_release_date":795052800,"cover":{"id":1,"image_id":"abcd1234"},` +
			`"summary":"  A time-travel RPG.  ","genres":[{"name":"Role-playing (RPG)"},{"name":"Adventure"}],` +
			`"involved_companies":[{"developer":false,"company":{"name":"Nintendo"}},{"developer":true,"company":{"name":"Square"}}]}]`))
	})
	mux.HandleFunc("/images/upload/t_cover_big/abcd1234.jpg", imageEndpoint())
	fakeIGDBServer(t, mux)
}

func libretroHasChronoTrigger(t *testing.T) {
	t.Helper()
	thumbMux := http.NewServeMux()
	thumbMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/Nintendo - Super Nintendo Entertainment System/Named_Boxarts/Chrono Trigger.png" {
			http.NotFound(w, r)
			return
		}
		w.Write([]byte("capa-libretro"))
	})
	fakeLibretroThumbnailsServer(t, thumbMux)
}

// Trava a separação de 2026-09-28: a capa vir do libretro-thumbnails não
// pode mais impedir a busca das informações no IGDB — antes o IGDB só era
// consultado quando o libretro não achava capa, e ano/resumo nunca apareciam
// para a maior parte da biblioteca. Trava também que só a empresa marcada
// como desenvolvedora vira `Developer` (a publicadora vem antes na lista).
func TestScrapeFetchesMetadataEvenWhenCoverComesFromLibretro(t *testing.T) {
	setManagedRootEnv(t)
	lib := newTestLibrary(t)
	credsStore := newTestCredentialsStore(t)
	if err := credsStore.Save(testCredentials()); err != nil {
		t.Fatalf("Save credenciais: %v", err)
	}
	game := seedGame(t, lib, "snes", "Chrono Trigger")
	igdbWithMetadata(t)
	libretroHasChronoTrigger(t)

	manager := NewScrapeManager(lib, credsStore, silentLogger())
	job, err := manager.Start(context.Background(), nil)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	waitJobDone(t, manager, job.ID)

	got, _, err := lib.GameByID(context.Background(), game.ID)
	if err != nil {
		t.Fatalf("GameByID: %v", err)
	}
	root, err := emulator.ManagedRoot()
	if err != nil {
		t.Fatalf("ManagedRoot: %v", err)
	}
	cover, err := os.ReadFile(filepath.Join(root, got.CoverPath))
	if err != nil || string(cover) != "capa-libretro" {
		t.Fatalf("a capa deveria ter vindo do libretro-thumbnails, veio %q (err %v)", cover, err)
	}
	if got.ReleaseYear != 1995 || got.Summary != "A time-travel RPG." || got.Developer != "Square" {
		t.Fatalf("informações = ano %d, resumo %q, desenvolvedora %q; esperado 1995, \"A time-travel RPG.\", \"Square\"",
			got.ReleaseYear, got.Summary, got.Developer)
	}
	if len(got.Genres) != 2 || got.Genres[0] != "Role-playing (RPG)" {
		t.Fatalf("gêneros = %v", got.Genres)
	}
	if got.MetadataStatus != "found" {
		t.Fatalf("metadata_status = %q, esperado \"found\"", got.MetadataStatus)
	}
}

// Trava que uma biblioteca já com capa em tudo (o caso de quem usou o ZeuX
// antes desta mudança) ainda ganha as informações no próximo lote — sem
// isso, ScrapeCandidates só olharia jogo sem capa e ninguém veria o ano.
func TestScrapeBatchPicksUpCoveredGamesMissingMetadata(t *testing.T) {
	setManagedRootEnv(t)
	lib := newTestLibrary(t)
	credsStore := newTestCredentialsStore(t)
	if err := credsStore.Save(testCredentials()); err != nil {
		t.Fatalf("Save credenciais: %v", err)
	}
	game := seedGame(t, lib, "snes", "Chrono Trigger")
	if err := lib.SetCover(context.Background(), game.ID, "covers/snes/1/cover.jpg"); err != nil {
		t.Fatalf("SetCover: %v", err)
	}
	igdbWithMetadata(t)
	fakeLibretroThumbnailsServer(t, http.NewServeMux())

	manager := NewScrapeManager(lib, credsStore, silentLogger())
	job, err := manager.Start(context.Background(), nil)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if job.Total != 1 {
		t.Fatalf("Total = %d, esperado 1 (jogo com capa mas sem informações)", job.Total)
	}
	waitJobDone(t, manager, job.ID)

	got, _, _ := lib.GameByID(context.Background(), game.ID)
	if got.CoverPath != "covers/snes/1/cover.jpg" {
		t.Fatalf("a capa existente não pode ser trocada pelo lote: %q", got.CoverPath)
	}
	if got.ReleaseYear != 1995 {
		t.Fatalf("release_year = %d, esperado 1995", got.ReleaseYear)
	}
}

// Trava a busca só de informações (2026-09-29): ela existe justamente para
// não trocar a capa — uma capa escolhida à mão tem que continuar intacta — e
// o resultado do job passa a ser o das informações.
func TestStartMetadataKeepsCoverAndSavesInfo(t *testing.T) {
	setManagedRootEnv(t)
	lib := newTestLibrary(t)
	credsStore := newTestCredentialsStore(t)
	if err := credsStore.Save(testCredentials()); err != nil {
		t.Fatalf("Save credenciais: %v", err)
	}
	game := seedGame(t, lib, "snes", "Chrono Trigger")
	if err := lib.SetCover(context.Background(), game.ID, "covers/snes/1/manual.jpg"); err != nil {
		t.Fatalf("SetCover: %v", err)
	}
	igdbWithMetadata(t)

	manager := NewScrapeManager(lib, credsStore, silentLogger())
	job, err := manager.StartMetadata(context.Background(), game.ID)
	if err != nil {
		t.Fatalf("StartMetadata: %v", err)
	}
	done := waitJobDone(t, manager, job.ID)
	if len(done.Results) != 1 || done.Results[0].Status != "found" {
		t.Fatalf("resultado do job = %+v, esperado um \"found\"", done.Results)
	}

	got, _, _ := lib.GameByID(context.Background(), game.ID)
	if got.CoverPath != "covers/snes/1/manual.jpg" {
		t.Fatalf("a busca só de informações trocou a capa: %q", got.CoverPath)
	}
	if got.Summary != "A time-travel RPG." || got.MetadataStatus != "found" {
		t.Fatalf("informações = %q / %q, esperado o resumo e \"found\"", got.Summary, got.MetadataStatus)
	}
}

// Sem conta do IGDB, a busca só de informações recusa com o motivo, em vez de
// um job que terminaria "não encontrado" escondendo que falta a conta.
func TestStartMetadataRefusesWithoutAccount(t *testing.T) {
	setManagedRootEnv(t)
	lib := newTestLibrary(t)
	game := seedGame(t, lib, "snes", "Chrono Trigger")

	manager := NewScrapeManager(lib, newTestCredentialsStore(t), silentLogger())
	if _, err := manager.StartMetadata(context.Background(), game.ID); !errors.Is(err, ErrMetadataNeedsAccount) {
		t.Fatalf("StartMetadata sem conta = %v, esperado ErrMetadataNeedsAccount", err)
	}
}

// Trava as duas metades da retentativa: uma busca de informações que falhou
// ('error') volta a entrar no lote seguinte — antes ficava sem informações
// para sempre —, mas o lote para de tentar depois de
// maxConsecutiveMetadataErrors falhas seguidas, para uma conta quebrada não
// virar uma chamada ao IGDB por jogo a cada biblioteca aberta.
func TestScrapeBatchRetriesMetadataErrorsButStopsAfterConsecutiveFailures(t *testing.T) {
	setManagedRootEnv(t)
	lib := newTestLibrary(t)
	credsStore := newTestCredentialsStore(t)
	if err := credsStore.Save(testCredentials()); err != nil {
		t.Fatalf("Save credenciais: %v", err)
	}
	var searches int
	mux := http.NewServeMux()
	mux.HandleFunc("/oauth2/token", tokenHandler)
	mux.HandleFunc("/v4/games", func(w http.ResponseWriter, r *http.Request) {
		searches++
		http.Error(w, "fora do ar", http.StatusInternalServerError)
	})
	fakeIGDBServer(t, mux)
	fakeLibretroThumbnailsServer(t, http.NewServeMux())

	var ids []int64
	for i := 0; i < maxConsecutiveMetadataErrors+3; i++ {
		game := seedGame(t, lib, "snes", fmt.Sprintf("Jogo %d", i))
		if err := lib.SetCover(context.Background(), game.ID, fmt.Sprintf("covers/snes/%d/cover.jpg", game.ID)); err != nil {
			t.Fatalf("SetCover: %v", err)
		}
		if err := lib.SetMetadataStatus(context.Background(), game.ID, "error"); err != nil {
			t.Fatalf("SetMetadataStatus: %v", err)
		}
		ids = append(ids, game.ID)
	}

	manager := NewScrapeManager(lib, credsStore, silentLogger())
	job, err := manager.Start(context.Background(), nil)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if job.Total != len(ids) {
		t.Fatalf("Total = %d, esperado %d (os jogos com busca de informações falha voltam ao lote)", job.Total, len(ids))
	}
	waitJobDone(t, manager, job.ID)

	if searches != maxConsecutiveMetadataErrors {
		t.Fatalf("buscas no IGDB = %d, esperado parar em %d falhas seguidas", searches, maxConsecutiveMetadataErrors)
	}
}
