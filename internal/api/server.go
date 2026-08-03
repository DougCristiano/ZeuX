// Package api expõe o núcleo do ZeuX como uma API HTTP local, consumida pela
// interface Tauri/React e testável direto pelo terminal.
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/doufl/zeux/internal/consent"
	"github.com/doufl/zeux/internal/emulator"
	"github.com/doufl/zeux/internal/hardware"
	"github.com/doufl/zeux/internal/install"
	"github.com/doufl/zeux/internal/library"
	"github.com/doufl/zeux/internal/verdict"
)

// Server carrega as dependências do núcleo e o resultado do último scan.
type Server struct {
	probe     hardware.Probe
	catalog   *verdict.Catalog
	consent   *consent.Store
	emulators *emulator.Registry
	customs   *emulator.CustomStore
	launcher  *emulator.Launcher
	installs  *install.Manager
	library   *library.Store
	logger    *slog.Logger

	// devOrigin é a origem extra liberada por SetDevOrigin. Só é lido, nunca
	// escrito, depois que o servidor começa a atender requisições — daí não
	// precisar do mutex abaixo, que protege lastScan.
	devOrigin string

	mu       sync.RWMutex
	lastScan *hardware.HardwareInfo
}

// NewServer monta o servidor com suas dependências.
func NewServer(
	probe hardware.Probe,
	catalog *verdict.Catalog,
	store *consent.Store,
	emulators *emulator.Registry,
	customs *emulator.CustomStore,
	launcher *emulator.Launcher,
	installs *install.Manager,
	libraryStore *library.Store,
	logger *slog.Logger,
) *Server {
	return &Server{
		probe:     probe,
		catalog:   catalog,
		consent:   store,
		emulators: emulators,
		customs:   customs,
		launcher:  launcher,
		installs:  installs,
		library:   libraryStore,
		logger:    logger,
	}
}

// Routes devolve o roteador com todas as rotas registradas.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/v1/health", s.handleHealth)
	mux.HandleFunc("GET /api/v1/consent", s.handleGetConsent)
	mux.HandleFunc("POST /api/v1/consent", s.handlePostConsent)
	mux.HandleFunc("POST /api/v1/hardware/scan", s.handleScan)
	mux.HandleFunc("GET /api/v1/hardware", s.handleGetHardware)
	mux.HandleFunc("GET /api/v1/consoles/verdicts", s.handleVerdicts)
	mux.HandleFunc("GET /api/v1/emulators", s.handleEmulators)
	// Os emuladores personalizados ficam num prefixo próprio, e não sob
	// /emulators/, porque "custom" colidiria com o {id} de
	// /emulators/{id}/install — o roteador do Go recusa registrar padrões em
	// que "/emulators/custom/install" casaria com os dois.
	mux.HandleFunc("GET /api/v1/custom-emulators", s.handleListCustom)
	mux.HandleFunc("POST /api/v1/custom-emulators", s.handleUpsertCustom)
	mux.HandleFunc("DELETE /api/v1/custom-emulators/{id}", s.handleDeleteCustom)

	mux.HandleFunc("GET /api/v1/emulator-sources", s.handleSources)
	mux.HandleFunc("POST /api/v1/emulators/{id}/install", s.handleInstall)
	mux.HandleFunc("DELETE /api/v1/emulators/{id}/install", s.handleUninstall)
	mux.HandleFunc("GET /api/v1/installs", s.handleInstalls)
	mux.HandleFunc("GET /api/v1/installs/{id}", s.handleInstallJob)
	mux.HandleFunc("POST /api/v1/games/launch", s.handleLaunch)
	mux.HandleFunc("POST /api/v1/games/preview", s.handlePreviewLaunch)
	mux.HandleFunc("GET /api/v1/sessions", s.handleSessions)

	mux.HandleFunc("POST /api/v1/library/folders", s.handleAddLibraryFolder)
	mux.HandleFunc("GET /api/v1/library/folders", s.handleListLibraryFolders)
	mux.HandleFunc("DELETE /api/v1/library/folders/{id}", s.handleRemoveLibraryFolder)
	mux.HandleFunc("POST /api/v1/library/folders/{id}/scan", s.handleScanLibraryFolder)
	mux.HandleFunc("GET /api/v1/library/games", s.handleListLibraryGames)

	return s.withLogging(s.withCORS(mux))
}

// allowedOrigins são os únicos valores de Origin aos quais o servidor responde
// com Access-Control-Allow-Origin. Comprovado em 2026-08-01 (ver
// docs/sprint-b-plano.md, item B2): sem essa lista, o WebView do Tauri falha
// tanto no GET simples (a requisição chega ao servidor e volta 200, mas o
// WebView recusa entregar a resposta ao JS) quanto no POST com
// Content-Type: application/json (o preflight OPTIONS não tem rota registrada
// no mux, cai em 405, e a requisição real nunca sai). "tauri://localhost" é o
// origin do build de produção rodando num container Linux; "http://tauri.localhost"
// é o documentado pelo Tauri para builds de produção no Windows — ainda não
// verificado numa máquina Windows real.
//
// O ADR 0001 já aceita que qualquer processo local alcança esta porta; CORS
// aqui não é a defesa contra isso — é só o que destrava o fetch do WebView.
// Por isso a lista é fechada e nunca reflete "*": ecoar qualquer origem
// tornaria trivial para uma página maliciosa aberta num navegador comum ler a
// resposta desta API, o que hoje não é possível sem essa reflexão.
var allowedOrigins = map[string]bool{
	"tauri://localhost":      true,
	"http://tauri.localhost": true,
}

// SetDevOrigin libera uma origem extra no CORS, além de allowedOrigins — pensada
// só para o servidor de desenvolvimento do front (`npm run tauri dev`, que serve
// de http://localhost:1420 por padrão no scaffold Vite). Nunca chamada no
// binário que o usuário instala: cmd/zeuxd só invoca isto quando a variável de
// ambiente ZEUX_DEV_ORIGIN está definida, o que não acontece fora da máquina de
// quem está desenvolvendo o front.
func (s *Server) SetDevOrigin(origin string) {
	s.devOrigin = origin
}

// withCORS libera o fetch do WebView do Tauri para as origens conhecidas do
// app empacotado. Ver allowedOrigins para o porquê da lista ser fechada.
func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowedOrigins[origin] || (s.devOrigin != "" && origin == s.devOrigin) {
			// Vary: Origin evita que uma resposta cacheada para uma origem
			// permitida seja servida como se valesse para outra.
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleEmulators(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"emulators": s.emulators.Survey(r.Context()),
	})
}

func (s *Server) handleSources(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"sources": s.installs.Catalog().Sources,
	})
}

// handleInstall dispara a instalação 1-click.
//
// A regra de produto está aqui: quando o hardware não alcança o console, o ZeuX
// não instala às cegas. Ele explica o que barrou e devolve 409, e a interface
// oferece o "tentar mesmo assim". Quem insiste passa force=true e o app obedece
// sem discutir — a decisão é do dono da máquina, mas informada.
func (s *Server) handleInstall(w http.ResponseWriter, r *http.Request) {
	adapterID := r.PathValue("id")

	if r.URL.Query().Get("force") != "true" {
		if blocked, reason := s.hardwareBlocks(adapterID); blocked {
			writeJSON(w, http.StatusConflict, map[string]any{
				"error": map[string]string{
					"code":    "hardware_insufficient",
					"message": reason,
				},
				"override_hint": "Repita a chamada com ?force=true para instalar mesmo assim.",
			})
			return
		}
	}

	job, err := s.installs.Start(adapterID)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "install_refused", err.Error())
		return
	}

	writeJSON(w, http.StatusAccepted, job)
}

// hardwareBlocks informa se nenhum console atendido pelo emulador é viável
// nesta máquina.
//
// Basta um console viável para liberar: o Dolphin roda GameCube e Wii, e um PC
// que dá conta de um deles merece o emulador instalado. Sem scan feito, não
// bloqueamos nada — não há base para opinar.
func (s *Server) hardwareBlocks(adapterID string) (bool, string) {
	info, ok := s.snapshot()
	if !ok {
		return false, ""
	}

	adapter, ok := s.emulators.ByID(adapterID)
	if !ok {
		return false, ""
	}

	var worst []string
	for _, consoleID := range adapter.Consoles() {
		result, err := verdict.EvaluateConsole(s.catalog, info, consoleID)
		if err != nil {
			continue
		}
		if result.Level != verdict.LevelImprovavel {
			return false, ""
		}
		worst = append(worst, result.Name)
	}

	if len(worst) == 0 {
		return false, ""
	}

	return true, fmt.Sprintf(
		"Pelo que o ZeuX leu deste computador, %s (%s) provavelmente não roda de forma jogável aqui. Você pode instalar mesmo assim, se quiser tentar.",
		adapter.Name(), strings.Join(worst, ", "))
}

func (s *Server) handleUninstall(w http.ResponseWriter, r *http.Request) {
	if err := s.installs.Uninstall(r.PathValue("id")); err != nil {
		s.writeError(w, http.StatusBadRequest, "uninstall_failed", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"removed": r.PathValue("id")})
}

func (s *Server) handleInstalls(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"installs": s.installs.Jobs()})
}

func (s *Server) handleInstallJob(w http.ResponseWriter, r *http.Request) {
	job, ok := s.installs.Job(r.PathValue("id"))
	if !ok {
		s.writeError(w, http.StatusNotFound, "not_found", "Nenhuma instalação com este identificador.")
		return
	}

	writeJSON(w, http.StatusOK, job)
}

// handleListCustom devolve as definições do usuário junto do caminho do
// arquivo, para quem preferir editá-lo à mão.
func (s *Server) handleListCustom(w http.ResponseWriter, r *http.Request) {
	definitions, err := s.customs.Load()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "custom_read_failed", err.Error())
		return
	}

	if definitions == nil {
		definitions = []emulator.CustomDefinition{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"custom_emulators": definitions,
		"file_path":        s.customs.Path(),
		"placeholders": map[string]string{
			emulator.PlaceholderROM:      "caminho do jogo (obrigatório)",
			emulator.PlaceholderScale:    "multiplicador de resolução interna do preset",
			emulator.PlaceholderRenderer: "backend gráfico do preset",
		},
	})
}

func (s *Server) handleUpsertCustom(w http.ResponseWriter, r *http.Request) {
	var def emulator.CustomDefinition
	if err := json.NewDecoder(r.Body).Decode(&def); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_body",
			"O corpo deve ser um JSON com id, name, consoles, binary_path e args.")
		return
	}

	definitions, err := s.customs.Upsert(def)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_definition", err.Error())
		return
	}

	s.reloadCustom(definitions)
	writeJSON(w, http.StatusOK, map[string]any{"custom_emulators": definitions})
}

func (s *Server) handleDeleteCustom(w http.ResponseWriter, r *http.Request) {
	definitions, err := s.customs.Delete(r.PathValue("id"))
	if err != nil {
		s.writeError(w, http.StatusNotFound, "not_found", err.Error())
		return
	}

	s.reloadCustom(definitions)
	writeJSON(w, http.StatusOK, map[string]any{"custom_emulators": definitions})
}

// reloadCustom reconstrói os adapters personalizados a partir das definições.
func (s *Server) reloadCustom(definitions []emulator.CustomDefinition) {
	adapters, problems := emulator.BuildAdapters(definitions)
	s.emulators.SetCustom(adapters)

	for _, problem := range problems {
		s.logger.Warn("emulador personalizado inválido", "detalhe", problem)
	}
}

// launchBody é o pedido de execução vindo da interface.
type launchBody struct {
	ROMPath    string            `json:"rom_path"`
	ConsoleID  string            `json:"console_id"`
	EmulatorID string            `json:"emulator_id,omitempty"`
	Core       string            `json:"core,omitempty"`
	Options    *emulator.Options `json:"options,omitempty"`
}

// toInput converte o corpo da requisição no pedido do launcher, preenchendo as
// opções a partir do catálogo quando a interface não mandou nenhuma. É o que
// torna a autoconfiguração o caminho padrão: quem não escolhe nada recebe o
// preset adequado ao hardware, em vez de configuração genérica.
func (s *Server) toInput(body launchBody) (emulator.LaunchInput, error) {
	input := emulator.LaunchInput{
		ROMPath:    body.ROMPath,
		ConsoleID:  body.ConsoleID,
		EmulatorID: body.EmulatorID,
		Core:       body.Core,
	}

	if body.Options != nil {
		input.Options = *body.Options
		return input, nil
	}

	info, ok := s.snapshot()
	if !ok {
		return emulator.LaunchInput{}, fmt.Errorf("no_scan")
	}

	result, err := verdict.EvaluateConsole(s.catalog, info, body.ConsoleID)
	if err != nil || result.Options == nil {
		return emulator.LaunchInput{}, fmt.Errorf("no_console")
	}

	input.Options = *result.Options
	if input.EmulatorID == "" {
		input.EmulatorID = result.AdapterID
	}
	if input.Core == "" {
		input.Core = result.Core
	}
	return input, nil
}

func (s *Server) handleLaunch(w http.ResponseWriter, r *http.Request) {
	input, ok := s.decodeLaunch(w, r)
	if !ok {
		return
	}

	session, err := s.launcher.Launch(r.Context(), input)
	if err != nil {
		// Falha de lançamento é quase sempre algo que o usuário pode resolver
		// (emulador ausente, core faltando, ROM movida), então a mensagem do
		// erro vai direto para a interface em vez de virar um 500 genérico.
		s.writeError(w, http.StatusBadRequest, "launch_failed", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, session)
}

// handlePreviewLaunch monta o comando sem executá-lo. Serve para a interface
// mostrar exatamente o que será rodado, e para diagnosticar configuração sem
// abrir jogo nenhum.
func (s *Server) handlePreviewLaunch(w http.ResponseWriter, r *http.Request) {
	input, ok := s.decodeLaunch(w, r)
	if !ok {
		return
	}

	// O preview valida a ROM igual ao lançamento: um preview que aprova um
	// caminho inexistente daria confiança falsa justamente a quem está usando a
	// rota para diagnosticar um problema.
	if err := emulator.ValidateROM(input.ROMPath); err != nil {
		s.writeError(w, http.StatusBadRequest, "rom_unavailable", err.Error())
		return
	}

	adapter, install, err := s.emulators.Resolve(r.Context(), input.ConsoleID, input.EmulatorID)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "emulator_unavailable", err.Error())
		return
	}

	cmd, err := adapter.BuildCommand(install, emulator.Request{
		ROMPath:   input.ROMPath,
		ConsoleID: input.ConsoleID,
		Core:      input.Core,
		Options:   input.Options,
	})
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "command_failed", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"emulator":     adapter.Name(),
		"adapter_id":   adapter.ID(),
		"installation": install,
		"command":      cmd,
	})
}

// decodeLaunch lê e valida o corpo comum a lançamento e preview.
func (s *Server) decodeLaunch(w http.ResponseWriter, r *http.Request) (emulator.LaunchInput, bool) {
	var body launchBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_body",
			`O corpo deve ser um JSON com ao menos {"rom_path": "...", "console_id": "..."}.`)
		return emulator.LaunchInput{}, false
	}

	if body.ROMPath == "" || body.ConsoleID == "" {
		s.writeError(w, http.StatusBadRequest, "missing_fields",
			"Os campos rom_path e console_id são obrigatórios.")
		return emulator.LaunchInput{}, false
	}

	input, err := s.toInput(body)
	if err != nil {
		switch err.Error() {
		case "no_scan":
			s.writeError(w, http.StatusBadRequest, "no_scan_yet",
				"Execute o scan de hardware para que o ZeuX escolha a configuração, ou envie o campo options.")
		default:
			s.writeError(w, http.StatusBadRequest, "unknown_console",
				"O console informado não está no catálogo do ZeuX.")
		}
		return emulator.LaunchInput{}, false
	}

	return input, true
}

func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	sessions, err := s.launcher.Sessions(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "sessions_read_failed", err.Error())
		return
	}

	playtime, err := s.launcher.Playtime(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "sessions_read_failed", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"sessions":         sessions,
		"playtime_seconds": playtime,
	})
}

// addLibraryFolderBody é o pedido para apontar uma pasta de ROM a um console.
type addLibraryFolderBody struct {
	ConsoleID string `json:"console_id"`
	Path      string `json:"path"`
}

// handleAddLibraryFolder aponta uma pasta a um console e varre imediatamente,
// para que a resposta já diga quantos jogos foram encontrados — o usuário não
// deveria precisar de uma segunda chamada só para ver o resultado do que
// acabou de apontar.
func (s *Server) handleAddLibraryFolder(w http.ResponseWriter, r *http.Request) {
	var body addLibraryFolderBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_body",
			`O corpo deve ser um JSON com {"console_id": "...", "path": "..."}.`)
		return
	}

	if body.ConsoleID == "" || body.Path == "" {
		s.writeError(w, http.StatusBadRequest, "missing_fields",
			"Os campos console_id e path são obrigatórios.")
		return
	}

	console, ok := s.catalog.ConsoleByID(body.ConsoleID)
	if !ok {
		s.writeError(w, http.StatusBadRequest, "unknown_console",
			"O console informado não está no catálogo do ZeuX.")
		return
	}

	info, err := os.Stat(body.Path)
	if err != nil || !info.IsDir() {
		s.writeError(w, http.StatusBadRequest, "path_not_found",
			fmt.Sprintf("A pasta %q não existe ou não é um diretório.", body.Path))
		return
	}

	folder, err := s.library.AddFolder(r.Context(), body.ConsoleID, body.Path)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_write_failed", err.Error())
		return
	}

	found, err := s.syncLibraryFolder(r.Context(), folder, console)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_scan_failed", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"folder":      folder,
		"games_found": found,
	})
}

func (s *Server) handleListLibraryFolders(w http.ResponseWriter, r *http.Request) {
	folders, err := s.library.ListFolders(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_read_failed", err.Error())
		return
	}
	if folders == nil {
		folders = []library.Folder{}
	}

	writeJSON(w, http.StatusOK, map[string]any{"folders": folders})
}

// handleRemoveLibraryFolder apaga a pasta do banco — nunca o arquivo no disco
// do usuário, só a referência (ver library.Store.RemoveFolder).
func (s *Server) handleRemoveLibraryFolder(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_id",
			"O identificador da pasta deve ser numérico.")
		return
	}

	if err := s.library.RemoveFolder(r.Context(), id); err != nil {
		s.writeError(w, http.StatusNotFound, "not_found", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"removed": id})
}

// handleScanLibraryFolder repete a varredura de uma pasta já apontada —
// achando jogos novos e marcando como ausentes (library.Game.Missing) os que
// sumiram do disco desde a última vez.
func (s *Server) handleScanLibraryFolder(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_id",
			"O identificador da pasta deve ser numérico.")
		return
	}

	folder, ok, err := s.library.FolderByID(r.Context(), id)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_read_failed", err.Error())
		return
	}
	if !ok {
		s.writeError(w, http.StatusNotFound, "not_found",
			fmt.Sprintf("Nenhuma pasta com o id %d.", id))
		return
	}

	console, ok := s.catalog.ConsoleByID(folder.ConsoleID)
	if !ok {
		s.writeError(w, http.StatusInternalServerError, "unknown_console",
			"O console desta pasta não está mais no catálogo do ZeuX.")
		return
	}

	found, err := s.syncLibraryFolder(r.Context(), folder, console)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_scan_failed", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"games_found": found})
}

func (s *Server) handleListLibraryGames(w http.ResponseWriter, r *http.Request) {
	consoleID := r.URL.Query().Get("console_id")
	if consoleID == "" {
		s.writeError(w, http.StatusBadRequest, "missing_fields",
			"O parâmetro console_id é obrigatório.")
		return
	}

	games, err := s.library.ListGames(r.Context(), consoleID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_read_failed", err.Error())
		return
	}
	if games == nil {
		games = []library.Game{}
	}

	writeJSON(w, http.StatusOK, map[string]any{"games": games})
}

// syncLibraryFolder varre o disco a partir de folder, usando as extensões do
// console, e reconcilia o resultado com o banco. Devolve quantos jogos a
// varredura encontrou desta vez.
func (s *Server) syncLibraryFolder(ctx context.Context, folder library.Folder, console verdict.Console) (int, error) {
	paths, err := library.FindROMs(folder.Path, console.Extensions)
	if err != nil {
		return 0, err
	}

	games := make([]library.NewGame, 0, len(paths))
	for _, path := range paths {
		games = append(games, library.NewGame{
			ConsoleID: folder.ConsoleID,
			Path:      path,
			Title:     library.TitleFromFilename(path),
		})
	}

	if err := s.library.SyncFolder(ctx, folder.ID, games); err != nil {
		return 0, err
	}

	return len(games), nil
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":         "ok",
		"schema_version": s.catalog.SchemaVersion,
		"consoles":       len(s.catalog.Consoles),
	})
}

// consentResponse acompanha o texto e a versão da política, para que a interface
// nunca exiba um texto de consentimento diferente do que o servidor registra.
type consentResponse struct {
	Granted       bool   `json:"granted"`
	PolicyVersion string `json:"policy_version"`
	PolicyText    string `json:"policy_text"`
	GrantedAt     string `json:"granted_at,omitempty"`
}

func (s *Server) handleGetConsent(w http.ResponseWriter, r *http.Request) {
	record, err := s.consent.Load()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "consent_read_failed",
			"Não foi possível ler o registro de consentimento.")
		return
	}

	writeJSON(w, http.StatusOK, toConsentResponse(record))
}

func (s *Server) handlePostConsent(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Granted bool `json:"granted"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_body",
			`O corpo da requisição deve ser um JSON no formato {"granted": true}.`)
		return
	}

	var (
		record consent.Record
		err    error
	)

	if body.Granted {
		record, err = s.consent.Grant()
	} else {
		record, err = s.consent.Revoke()
	}

	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "consent_write_failed",
			"Não foi possível salvar o registro de consentimento.")
		return
	}

	// Revogar o consentimento também descarta o scan já feito. Manter os dados em
	// memória depois de o usuário dizer "não" contrariaria o que ele acabou de
	// pedir, mesmo que nada fosse persistido em disco.
	if !record.Granted {
		s.mu.Lock()
		s.lastScan = nil
		s.mu.Unlock()
	}

	writeJSON(w, http.StatusOK, toConsentResponse(record))
}

func (s *Server) handleScan(w http.ResponseWriter, r *http.Request) {
	record, err := s.consent.Load()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "consent_read_failed",
			"Não foi possível ler o registro de consentimento.")
		return
	}

	if !record.IsValid() {
		s.writeError(w, http.StatusForbidden, "consent_required",
			"O usuário precisa autorizar a leitura do hardware antes do scan.")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	info, err := s.probe.Detect(ctx)
	if err != nil {
		s.logger.Error("falha ao detectar hardware", "erro", err)
		s.writeError(w, http.StatusInternalServerError, "scan_failed",
			"Não foi possível ler as características deste computador.")
		return
	}

	s.mu.Lock()
	s.lastScan = &info
	s.mu.Unlock()

	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleGetHardware(w http.ResponseWriter, r *http.Request) {
	info, ok := s.snapshot()
	if !ok {
		s.writeError(w, http.StatusNotFound, "no_scan_yet",
			"Nenhum scan foi executado nesta sessão.")
		return
	}

	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleVerdicts(w http.ResponseWriter, r *http.Request) {
	info, ok := s.snapshot()
	if !ok {
		s.writeError(w, http.StatusNotFound, "no_scan_yet",
			"Execute o scan de hardware antes de consultar as sugestões de console.")
		return
	}

	writeJSON(w, http.StatusOK, verdict.Evaluate(s.catalog, info))
}

// snapshot devolve uma cópia do último scan.
func (s *Server) snapshot() (hardware.HardwareInfo, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.lastScan == nil {
		return hardware.HardwareInfo{}, false
	}
	return *s.lastScan, true
}

// withLogging registra cada requisição com o tempo de resposta.
func (s *Server) withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		s.logger.Debug("requisição",
			"metodo", r.Method,
			"rota", r.URL.Path,
			"duracao", time.Since(start))
	})
}

func toConsentResponse(record consent.Record) consentResponse {
	response := consentResponse{
		Granted:       record.IsValid(),
		PolicyVersion: consent.PolicyVersion,
		PolicyText:    consent.PolicyText,
	}

	if record.IsValid() {
		response.GrantedAt = record.GrantedAt.Format(time.RFC3339)
	}

	return response
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// writeError devolve um erro em formato estável, com um code que a interface
// pode tratar programaticamente e uma mensagem já pronta para exibir.
func (s *Server) writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}
