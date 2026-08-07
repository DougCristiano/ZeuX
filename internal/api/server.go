// Package api expõe o núcleo do ZeuX como uma API HTTP local, consumida pela
// interface Tauri/React e testável direto pelo terminal.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/doufl/zeux/internal/consent"
	"github.com/doufl/zeux/internal/emulator"
	"github.com/doufl/zeux/internal/hardware"
	"github.com/doufl/zeux/internal/igdb"
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
	igdbCreds *igdb.CredentialsStore
	igdbJobs  *igdb.ScrapeManager
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
	igdbCreds *igdb.CredentialsStore,
	igdbJobs *igdb.ScrapeManager,
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
		igdbCreds: igdbCreds,
		igdbJobs:  igdbJobs,
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
	// Rota própria em vez de embutir em /emulators: cores só existem para o
	// RetroArch (nenhum outro adapter carrega bibliotecas plugáveis), e
	// listar 20+ cores dentro da resposta de /emulators infiltraria esse
	// detalhe em toda tela que só quer saber "instalado sim/não" por
	// emulador.
	mux.HandleFunc("GET /api/v1/retroarch/cores", s.handleRetroArchCores)
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
	// Botão "Configurar" (2026-08-04): abre o emulador sozinho, sem ROM —
	// não é lançamento de jogo, por isso não é /games/launch. Ver
	// Launcher.LaunchStandalone, internal/emulator/session.go.
	mux.HandleFunc("POST /api/v1/emulators/{id}/open", s.handleOpenEmulator)
	// H1/H2 (docs/roadmap.md): configuração persistida do emulador — só
	// para adapters que satisfazem emulator.ConfigurableAdapter
	// (PCSX2/RetroArch nesta v1.0, ver Status.Configurable em GET
	// /emulators).
	mux.HandleFunc("GET /api/v1/emulators/{id}/config", s.handleGetEmulatorConfig)
	mux.HandleFunc("POST /api/v1/emulators/{id}/config", s.handleSetEmulatorConfig)
	mux.HandleFunc("DELETE /api/v1/emulators/{id}/config", s.handleRestoreEmulatorConfig)
	// H3/H4: mapeamento de teclado/controle — só para
	// emulator.KeyBindableAdapter (ver Status.Bindable).
	mux.HandleFunc("GET /api/v1/emulators/{id}/bindings", s.handleGetEmulatorBindings)
	mux.HandleFunc("POST /api/v1/emulators/{id}/bindings", s.handleSetEmulatorBindings)
	mux.HandleFunc("GET /api/v1/installs", s.handleInstalls)
	mux.HandleFunc("GET /api/v1/installs/{id}", s.handleInstallJob)
	mux.HandleFunc("POST /api/v1/games/launch", s.handleLaunch)
	mux.HandleFunc("POST /api/v1/games/preview", s.handlePreviewLaunch)
	mux.HandleFunc("GET /api/v1/sessions", s.handleSessions)

	mux.HandleFunc("POST /api/v1/library/folders", s.handleAddLibraryFolder)
	// Rota própria em vez de sobrecarregar POST /library/folders com um corpo
	// opcional diferente — "console_id + path" (um console) e "path" sozinho
	// (todos os consoles, por subpasta) são operações distintas o bastante
	// para merecer contrato próprio, não um `if console_id == ""` escondido.
	mux.HandleFunc("POST /api/v1/library/folders/bulk", s.handleBulkAddLibraryFolders)
	mux.HandleFunc("GET /api/v1/library/folders", s.handleListLibraryFolders)
	mux.HandleFunc("DELETE /api/v1/library/folders/{id}", s.handleRemoveLibraryFolder)
	mux.HandleFunc("POST /api/v1/library/folders/{id}/scan", s.handleScanLibraryFolder)
	mux.HandleFunc("GET /api/v1/library/games", s.handleListLibraryGames)
	// G4 (docs/roadmap.md): favoritar/desfavoritar. Rota própria, não um
	// PATCH em /library/games/{id} — só um campo, sem motivo para um
	// contrato mais genérico ainda não usado por mais nada.
	mux.HandleFunc("POST /api/v1/library/games/{id}/favorite", s.handleFavoriteGame)
	mux.HandleFunc("DELETE /api/v1/library/games/{id}/favorite", s.handleUnfavoriteGame)

	// G1 (docs/roadmap.md, Sprint G): scraper de metadados IGDB. Credencial
	// é por usuário — sem ela, estas rotas de busca simplesmente recusam
	// (400 igdb_not_configured), nunca tentam a rede.
	mux.HandleFunc("GET /api/v1/igdb/credentials", s.handleGetIGDBCredentials)
	mux.HandleFunc("POST /api/v1/igdb/credentials", s.handleSetIGDBCredentials)
	mux.HandleFunc("DELETE /api/v1/igdb/credentials", s.handleClearIGDBCredentials)
	mux.HandleFunc("POST /api/v1/library/games/scrape-covers", s.handleScrapeCovers)
	mux.HandleFunc("GET /api/v1/scrape-jobs/{id}", s.handleScrapeJob)
	// Serve as capas já baixadas em disco (nunca a URL do IGDB direto — G1
	// exige arquivo local). Primeiro uso de http.FileServer neste servidor.
	mux.HandleFunc("GET /api/v1/covers/", s.handleCoverFile)

	return s.withLogging(s.withCORS(mux))
}

// allowedOrigins são os únicos valores de Origin aos quais o servidor responde
// com Access-Control-Allow-Origin. Comprovado em 2026-08-01 (ver
// docs/sprint-b-plano.md, item B2): sem essa lista, o WebView do Tauri falha
// tanto no GET simples (a requisição chega ao servidor e volta 200, mas o
// WebView recusa entregar a resposta ao JS) quanto no POST com
// Content-Type: application/json (o preflight OPTIONS não tem rota registrada
// no mux, cai em 405, e a requisição real nunca sai). "tauri://localhost" é o
// origin do build de produção em Linux/macOS; "http://tauri.localhost" é o
// padrão do WebView2 no Windows (useHttpsScheme=false). "https://tauri.localhost"
// cobre o caso em que useHttpsScheme=true — mesma origem documentada pelo
// Tauri 2, só com esquema HTTPS.
//
// O ADR 0001 já aceita que qualquer processo local alcança esta porta; CORS
// aqui não é a defesa contra isso — é só o que destrava o fetch do WebView.
// Por isso a lista é fechada e nunca reflete "*": ecoar qualquer origem
// tornaria trivial para uma página maliciosa aberta num navegador comum ler a
// resposta desta API, o que hoje não é possível sem essa reflexão.
var allowedOrigins = map[string]bool{
	"tauri://localhost":       true,
	"http://tauri.localhost":  true,
	"https://tauri.localhost": true,
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

// handleRetroArchCores lista todo core que o ZeuX conhece, com o estado de
// instalação de cada um — não só "RetroArch instalado" (handleEmulators já
// diz isso), mas quais das bibliotecas de emulação individuais estão de
// fato no lugar certo. Existe porque um core podia estar ausente por um bug
// silencioso (log de aviso, nunca erro) e nada avisava até o usuário tentar
// lançar um jogo e receber "core não encontrado" na cara.
func (s *Server) handleRetroArchCores(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"cores": emulator.RetroArchCoreStatus(r.Context()),
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

// handleOpenEmulator abre o executável do emulador sozinho — sem jogo, sem
// sessão registrada. Falha do usuário (emulador não instalado, id
// desconhecido) é 400, mesma convenção de handleLaunch: quase sempre algo
// que o usuário pode resolver (ex.: instalar o emulador primeiro).
func (s *Server) handleOpenEmulator(w http.ResponseWriter, r *http.Request) {
	if err := s.launcher.LaunchStandalone(r.Context(), r.PathValue("id")); err != nil {
		s.writeError(w, http.StatusBadRequest, "open_failed", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"opened": r.PathValue("id")})
}

// resolveConfigurableAdapter acha o adapter, confirma que ele está
// instalado (precisa de Installation para resolver o caminho do arquivo de
// config — ver retroArchConfigPath, que depende do BinaryPath para o modo
// portátil) e que ele satisfaz ConfigurableAdapter. As três falhas têm
// `code` diferentes porque pedem correções diferentes do usuário.
func (s *Server) resolveConfigurableAdapter(w http.ResponseWriter, r *http.Request) (emulator.ConfigurableAdapter, emulator.Installation, bool) {
	id := r.PathValue("id")
	adapter, ok := s.emulators.ByID(id)
	if !ok {
		s.writeError(w, http.StatusNotFound, "not_found", fmt.Sprintf("Nenhum emulador com o id %q.", id))
		return nil, emulator.Installation{}, false
	}

	configurable, ok := adapter.(emulator.ConfigurableAdapter)
	if !ok {
		s.writeError(w, http.StatusBadRequest, "not_configurable",
			fmt.Sprintf("O %s não tem configuração persistida gerenciável pelo ZeuX ainda.", adapter.Name()))
		return nil, emulator.Installation{}, false
	}

	install, ok := adapter.Locate(r.Context())
	if !ok {
		s.writeError(w, http.StatusBadRequest, "not_installed",
			fmt.Sprintf("O %s não está instalado — instale antes de configurar.", adapter.Name()))
		return nil, emulator.Installation{}, false
	}

	return configurable, install, true
}

func (s *Server) handleGetEmulatorConfig(w http.ResponseWriter, r *http.Request) {
	configurable, install, ok := s.resolveConfigurableAdapter(w, r)
	if !ok {
		return
	}

	opts, err := configurable.ReadConfig(install)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "config_read_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, opts)
}

func (s *Server) handleSetEmulatorConfig(w http.ResponseWriter, r *http.Request) {
	configurable, install, ok := s.resolveConfigurableAdapter(w, r)
	if !ok {
		return
	}

	var body struct {
		Fullscreen    bool              `json:"fullscreen"`
		InternalScale int               `json:"internal_scale"`
		Renderer      emulator.Renderer `json:"renderer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_body",
			`O corpo deve ser um JSON no formato {"fullscreen": bool, "internal_scale": int, "renderer": string}.`)
		return
	}

	unapplied, err := configurable.WriteConfig(install, emulator.Options{
		Fullscreen:    body.Fullscreen,
		InternalScale: body.InternalScale,
		Renderer:      body.Renderer,
	})
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "config_write_failed", err.Error())
		return
	}
	if unapplied == nil {
		// []string(nil) serializa como `null`, não `[]` — o front espera um
		// array sempre iterável (achado testando de verdade em 2026-08-05:
		// `null.length` derrubou a tela inteira).
		unapplied = []string{}
	}

	writeJSON(w, http.StatusOK, map[string]any{"unapplied": unapplied})
}

func (s *Server) handleRestoreEmulatorConfig(w http.ResponseWriter, r *http.Request) {
	configurable, install, ok := s.resolveConfigurableAdapter(w, r)
	if !ok {
		return
	}

	if err := configurable.RestoreConfig(install); err != nil {
		s.writeError(w, http.StatusBadRequest, "config_restore_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"restored": true})
}

// resolveBindableAdapter espelha resolveConfigurableAdapter para
// KeyBindableAdapter (H3/H4) — mesmo raciocínio de códigos de erro
// distintos por causa diferente.
func (s *Server) resolveBindableAdapter(w http.ResponseWriter, r *http.Request) (emulator.KeyBindableAdapter, emulator.Installation, bool) {
	id := r.PathValue("id")
	adapter, ok := s.emulators.ByID(id)
	if !ok {
		s.writeError(w, http.StatusNotFound, "not_found", fmt.Sprintf("Nenhum emulador com o id %q.", id))
		return nil, emulator.Installation{}, false
	}

	bindable, ok := adapter.(emulator.KeyBindableAdapter)
	if !ok {
		s.writeError(w, http.StatusBadRequest, "not_bindable",
			fmt.Sprintf("O %s não tem mapeamento de controle gerenciável pelo ZeuX ainda.", adapter.Name()))
		return nil, emulator.Installation{}, false
	}

	install, ok := adapter.Locate(r.Context())
	if !ok {
		s.writeError(w, http.StatusBadRequest, "not_installed",
			fmt.Sprintf("O %s não está instalado — instale antes de mapear controles.", adapter.Name()))
		return nil, emulator.Installation{}, false
	}

	return bindable, install, true
}

func (s *Server) handleGetEmulatorBindings(w http.ResponseWriter, r *http.Request) {
	bindable, install, ok := s.resolveBindableAdapter(w, r)
	if !ok {
		return
	}

	bindings, err := bindable.ReadBindings(install)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "bindings_read_failed", err.Error())
		return
	}
	if bindings == nil {
		// Ausência de arquivo não é "sem ações" — devolve a lista de ações
		// conhecidas, cada uma sem tecla/botão vinculado, para a tela
		// sempre ter o que mostrar (mesmo raciocínio de nunca confundir
		// "não pôde ler" com "não existe a ação").
		actions := bindable.Actions()
		bindings = make([]emulator.InputBinding, len(actions))
		for i, action := range actions {
			bindings[i] = emulator.InputBinding{Action: action}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"actions":  bindable.Actions(),
		"bindings": bindings,
	})
}

func (s *Server) handleSetEmulatorBindings(w http.ResponseWriter, r *http.Request) {
	bindable, install, ok := s.resolveBindableAdapter(w, r)
	if !ok {
		return
	}

	var body struct {
		Bindings []emulator.InputBinding `json:"bindings"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_body",
			`O corpo deve ser um JSON no formato {"bindings": [{"action": "...", "key": "..."}]}.`)
		return
	}

	unapplied, err := bindable.WriteBindings(install, body.Bindings)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "bindings_write_failed", err.Error())
		return
	}
	if unapplied == nil {
		unapplied = []string{}
	}

	writeJSON(w, http.StatusOK, map[string]any{"unapplied": unapplied})
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

	// Validação estrutural primeiro (id/name/consoles/args vazios) — dá a
	// mensagem certa antes de checar o disco, para não confundir "caminho
	// não existe" com "formulário incompleto".
	if err := def.Validate(); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_definition", err.Error())
		return
	}

	// I1 (docs/roadmap.md): o caminho precisa existir e ser executável no
	// momento do cadastro — sem isso, o emulador apareceria na lista e só
	// quebraria na hora de jogar, um sucesso falso. Checagem só aqui, no
	// caminho de cadastro pela tela — nunca em CustomDefinition.Validate(),
	// que também roda no carregamento do JSON gravado em disco a cada
	// início do daemon: um caminho temporariamente indisponível (HD externo
	// desconectado) não pode apagar a definição do usuário, mesma filosofia
	// de library.Game.Missing.
	if !emulator.IsExecutableFile(def.BinaryPath) {
		s.writeError(w, http.StatusBadRequest, "binary_not_found",
			fmt.Sprintf("O caminho %q não existe ou não é um executável.", def.BinaryPath))
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
	if err != nil {
		return emulator.LaunchInput{}, fmt.Errorf("no_console")
	}
	// O console existe, mas nenhum patamar foi alcançado nesta máquina
	// (level "improvavel") — diferente de console inexistente. Confundir os
	// dois diria "console desconhecido" para um console que o catálogo
	// conhece muito bem, só não recomenda para este hardware.
	if result.Options == nil {
		return emulator.LaunchInput{}, fmt.Errorf("no_preset")
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
		case "no_preset":
			s.writeError(w, http.StatusBadRequest, "no_preset_available",
				"Este computador não alcançou nenhum patamar de compatibilidade conhecido para este console. Envie o campo options para configurar manualmente.")
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

// bulkAddLibraryFoldersBody é o pedido de "uma pasta para todos os jogos": um
// único caminho-raiz cuja subpastas de primeiro nível o ZeuX tenta casar,
// cada uma, com um console do catálogo.
type bulkAddLibraryFoldersBody struct {
	Path string `json:"path"`
}

// normalizeConsoleMatch reduz um nome (de console ou de subpasta) a
// minúsculas sem separadores, para comparar "Mega Drive", "mega-drive" e
// "MEGADRIVE" como o mesmo texto — sem isso, a varredura em lote exigiria que
// o usuário nomeasse as subpastas exatamente como o catálogo interno.
func normalizeConsoleMatch(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// handleBulkAddLibraryFolders implementa "selecionar um caminho para todos os
// jogos" (2026-08-05, a pedido do Douglas): ele aponta UMA pasta-raiz
// organizada com uma subpasta por console (ex. `Roms/PS1`, `Roms/SNES`), e o
// ZeuX aponta cada subpasta reconhecida para o console certo, na mesma
// varredura que handleAddLibraryFolder já faz uma por uma.
//
// Isto NÃO adivinha console por extensão de arquivo solto — essa rota foi
// descartada de propósito em 2026-08-02 (ver o comentário de LibraryScreen.tsx
// no frontend): extensão sozinha é ambígua entre consoles (.bin/.iso/.zip
// valem para vários). O casamento aqui é só por NOME DE SUBPASTA contra
// id/nome/sigla do console — determinístico, sem achismo.
func (s *Server) handleBulkAddLibraryFolders(w http.ResponseWriter, r *http.Request) {
	var body bulkAddLibraryFoldersBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_body", `O corpo deve ser um JSON com {"path": "..."}.`)
		return
	}
	if body.Path == "" {
		s.writeError(w, http.StatusBadRequest, "missing_fields", "O campo path é obrigatório.")
		return
	}

	entries, err := os.ReadDir(body.Path)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "path_not_found",
			fmt.Sprintf("A pasta %q não existe ou não pôde ser lida.", body.Path))
		return
	}

	// Índice normalizado -> console, construído uma vez: cada console entra
	// pelo id, pelo nome e pela sigla, todos normalizados — uma subpasta
	// "ps1", "PlayStation" ou "PS1" acham o mesmo console.
	byNormalized := make(map[string]verdict.Console)
	for _, console := range s.catalog.Consoles {
		byNormalized[normalizeConsoleMatch(console.ID)] = console
		byNormalized[normalizeConsoleMatch(console.Name)] = console
		byNormalized[normalizeConsoleMatch(console.ShortName)] = console
	}

	type matchedFolder struct {
		ConsoleID  string `json:"console_id"`
		Name       string `json:"name"`
		Path       string `json:"path"`
		GamesFound int    `json:"games_found"`
	}
	matched := []matchedFolder{}
	unmatched := []string{}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		console, ok := byNormalized[normalizeConsoleMatch(entry.Name())]
		if !ok {
			unmatched = append(unmatched, entry.Name())
			continue
		}

		subPath := filepath.Join(body.Path, entry.Name())
		folder, err := s.library.AddFolder(r.Context(), console.ID, subPath)
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, "library_write_failed", err.Error())
			return
		}
		found, err := s.syncLibraryFolder(r.Context(), folder, console)
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, "library_scan_failed", err.Error())
			return
		}
		matched = append(matched, matchedFolder{
			ConsoleID: console.ID, Name: console.Name, Path: subPath, GamesFound: found,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"matched":   matched,
		"unmatched": unmatched,
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

	// Lê os jogos ANTES de remover: ON DELETE CASCADE (migração 0002) apaga
	// as linhas junto da pasta, e depois disso não haveria mais como saber
	// quais capas (G2) pertenciam a ela. Falha nesta leitura não impede a
	// remoção — só significa que a limpeza de capa órfã fica pra trás desta
	// vez, preferível a bloquear "remover pasta" por causa de um efeito
	// colateral de limpeza.
	games, gamesErr := s.library.GamesByFolder(r.Context(), id)

	if err := s.library.RemoveFolder(r.Context(), id); err != nil {
		s.writeError(w, http.StatusNotFound, "not_found", err.Error())
		return
	}

	if gamesErr == nil {
		s.removeCoverDirs(games)
	} else {
		s.logger.Warn("não foi possível listar jogos da pasta para limpar capas órfãs", "pasta", id, "erro", gamesErr)
	}

	writeJSON(w, http.StatusOK, map[string]any{"removed": id})
}

// removeCoverDirs apaga do disco a pasta de capa (G2: "remover pasta não
// deixa imagem órfã") de cada jogo informado. Erro por jogo só é logado —
// uma capa que não pôde ser removida não é motivo para reportar falha numa
// operação de remoção de pasta que já terminou com sucesso no banco.
func (s *Server) removeCoverDirs(games []library.Game) {
	root, err := emulator.ManagedRoot()
	if err != nil {
		s.logger.Warn("não foi possível localizar a pasta gerenciada para limpar capas órfãs", "erro", err)
		return
	}
	for _, game := range games {
		dir := emulator.GameCoverDir(root, game.ConsoleID, game.ID)
		if err := os.RemoveAll(dir); err != nil {
			s.logger.Warn("não foi possível remover a capa órfã", "jogo", game.ID, "erro", err)
		}
	}
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

// gameWithStats acrescenta tempo de jogo e "jogado por último" (L11,
// docs/roadmap.md) a um library.Game, sem alterar o tipo de domínio — a
// junção com sessões é responsabilidade da API, não da biblioteca.
type gameWithStats struct {
	library.Game
	PlaytimeSeconds int    `json:"playtime_seconds"`
	LastPlayedAt    string `json:"last_played_at,omitempty"`

	// CoverURL é derivado de Game.CoverPath (G1) — nunca exposto cru, nunca
	// uma URL de terceiro. omitempty garante o campo AUSENTE (nunca "") quando
	// a capa não foi resolvida, contrato documentado em docs/api.md.
	CoverURL string `json:"cover_url,omitempty"`
}

// coverURLFor converte o caminho relativo guardado no banco (G1) na URL
// servida por handleCoverFile. Vazio devolve vazio — a chamadora decide não
// preencher o campo (omitempty).
func coverURLFor(coverPath string) string {
	if coverPath == "" {
		return ""
	}
	return "/api/v1/covers/" + coverPath
}

// defaultLibraryPageSize e maxLibraryPageSize regem só o modo "todos os
// jogos" (sem console_id) — o modo por console mantém o comportamento
// antigo, lista inteira sem paginar, porque GamesScreen já lida bem com o
// tamanho normal de uma pasta de um console só.
const (
	// M15 (docs/sprint-m-plano.md, decidido pelo Douglas em 2026-08-07): 24
	// nunca fechava fileira numa grade de 5 ou 6 colunas; 30 é múltiplo dos
	// dois. O `PAGE_SIZE` do front (AllGamesScreen.tsx) acompanha o mesmo
	// valor de propósito — os dois divergiam em silêncio antes desta sprint.
	defaultLibraryPageSize = 30
	maxLibraryPageSize     = 100
)

func (s *Server) handleListLibraryGames(w http.ResponseWriter, r *http.Request) {
	consoleID := r.URL.Query().Get("console_id")

	var (
		games []library.Game
		err   error
	)
	if consoleID == "" {
		// ?q= filtra por título no modo "todos os jogos" (2026-08-04, busca
		// da Biblioteca) — no SQL, não no cliente, para achar o jogo mesmo
		// se ele estiver em outra página. ?favorite=true filtra só os
		// favoritos (G4), combinável com ?q=.
		games, err = s.library.ListAllGames(r.Context(), r.URL.Query().Get("q"), r.URL.Query().Get("favorite") == "true")
	} else {
		games, err = s.library.ListGames(r.Context(), consoleID)
	}
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_read_failed", err.Error())
		return
	}

	// Sessões vêm por rom_path, não por id de jogo — o launcher nunca soube
	// da biblioteca (a dependência corre num sentido só, ver
	// docs/arquitetura-a-preservar.md), então a junção é feita aqui. Uma
	// sessão cujo rom_path não bate com nenhum jogo simplesmente não
	// contribui para nenhuma linha; ela continua existindo em GET /sessions,
	// que não passa por este código.
	sessions, err := s.launcher.Sessions(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_read_failed", err.Error())
		return
	}

	type stat struct {
		seconds int
		last    time.Time
	}
	byPath := make(map[string]stat, len(sessions))
	for _, session := range sessions {
		st := byPath[session.ROMPath]
		st.seconds += session.DurationSeconds
		if session.StartedAt.After(st.last) {
			st.last = session.StartedAt
		}
		byPath[session.ROMPath] = st
	}

	result := make([]gameWithStats, 0, len(games))
	for _, game := range games {
		gw := gameWithStats{Game: game, CoverURL: coverURLFor(game.CoverPath)}
		if st, ok := byPath[game.Path]; ok {
			gw.PlaytimeSeconds = st.seconds
			gw.LastPlayedAt = st.last.Format(time.RFC3339)
		}
		result = append(result, gw)
	}

	// Jogado mais recentemente primeiro; nunca jogado vai para o fim, na
	// ordem que ListGames já devolveu (mais recém-adicionado primeiro).
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].LastPlayedAt == "" {
			return false
		}
		if result[j].LastPlayedAt == "" {
			return true
		}
		return result[i].LastPlayedAt > result[j].LastPlayedAt
	})

	response := map[string]any{"games": result}

	if consoleID == "" {
		// M4 (docs/sprint-m-plano.md): consoles presentes no resultado
		// COMPLETO — antes do filtro de `?platform=` e da paginação —, para
		// que os chips da tela não mudem de opção sozinhos ao trocar de
		// página ou de plataforma escolhida (o bug que motivou o item:
		// platformsOnPage calculado só sobre a página atual, no cliente).
		consoleSet := make(map[string]struct{}, len(result))
		for _, g := range result {
			consoleSet[g.ConsoleID] = struct{}{}
		}
		consoles := make([]string, 0, len(consoleSet))
		for id := range consoleSet {
			consoles = append(consoles, id)
		}
		sort.Strings(consoles)

		// ?platform=<console_id> filtra o modo "todos os jogos" a um único
		// console, antes de paginar — em Go, não em SQL: ListAllGames já
		// devolve a lista inteira em memória (comentário na própria função:
		// a ordenação por último jogado só é possível depois da junção com
		// sessões, que a store não conhece), e `consoles` acima já precisa
		// do resultado completo de qualquer forma. Nome do parâmetro
		// deliberado: `console_id` já significa outra coisa nesta mesma
		// rota (troca para o modo antigo, por console, sem paginação) —
		// reusar gerraria ambiguidade, ver docs/api.md.
		if platform := r.URL.Query().Get("platform"); platform != "" {
			filtered := make([]gameWithStats, 0, len(result))
			for _, g := range result {
				if g.ConsoleID == platform {
					filtered = append(filtered, g)
				}
			}
			result = filtered
		}

		// Paginação só no modo "todos os jogos" — depois de ordenar por
		// último jogado e filtrar por plataforma, nunca antes (ver
		// comentário de ListAllGames).
		page := 1
		if raw := r.URL.Query().Get("page"); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
				page = parsed
			}
		}
		pageSize := defaultLibraryPageSize
		if raw := r.URL.Query().Get("page_size"); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= maxLibraryPageSize {
				pageSize = parsed
			}
		}

		total := len(result)
		start := (page - 1) * pageSize
		if start > total {
			start = total
		}
		end := start + pageSize
		if end > total {
			end = total
		}

		response["games"] = result[start:end]
		response["total"] = total
		response["page"] = page
		response["page_size"] = pageSize
		response["consoles"] = consoles
	}

	writeJSON(w, http.StatusOK, response)
}

// favoriteResponse é a resposta comum de handleFavoriteGame/handleUnfavoriteGame.
type favoriteResponse struct {
	ID       int64 `json:"id"`
	Favorite bool  `json:"favorite"`
}

func (s *Server) handleFavoriteGame(w http.ResponseWriter, r *http.Request) {
	s.setFavorite(w, r, true)
}

func (s *Server) handleUnfavoriteGame(w http.ResponseWriter, r *http.Request) {
	s.setFavorite(w, r, false)
}

// setFavorite implementa as duas rotas (POST marca, DELETE desmarca) — o
// corpo é idêntico exceto o valor gravado, então uma função só evita
// duplicar a validação do {id} e o tratamento de erro.
func (s *Server) setFavorite(w http.ResponseWriter, r *http.Request, favorite bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_id", "O identificador do jogo deve ser numérico.")
		return
	}

	if err := s.library.SetFavorite(r.Context(), id, favorite); err != nil {
		if errors.Is(err, library.ErrGameNotFound) {
			s.writeError(w, http.StatusNotFound, "not_found", fmt.Sprintf("Nenhum jogo com o id %d.", id))
			return
		}
		s.writeError(w, http.StatusInternalServerError, "library_write_failed", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, favoriteResponse{ID: id, Favorite: favorite})
}

// handleGetIGDBCredentials nunca ecoa client_secret de volta — mesmo
// instinto de nunca logar uma senha. A interface só precisa saber se há
// conta conectada, não o valor guardado.
func (s *Server) handleGetIGDBCredentials(w http.ResponseWriter, r *http.Request) {
	_, configured, err := s.igdbCreds.Load()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "igdb_credentials_read_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"configured": configured})
}

// handleSetIGDBCredentials não valida contra o IGDB na hora — fica
// instantânea e funciona offline. A validação real acontece na primeira
// busca (handleScrapeCovers), onde um client_id/secret errado vira um erro
// específico e acionável.
func (s *Server) handleSetIGDBCredentials(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_body",
			`O corpo da requisição deve ser um JSON no formato {"client_id": "...", "client_secret": "..."}.`)
		return
	}
	if body.ClientID == "" || body.ClientSecret == "" {
		s.writeError(w, http.StatusBadRequest, "igdb_credentials_invalid",
			"Informe o ID do cliente e o segredo do cliente do IGDB.")
		return
	}

	creds := igdb.Credentials{ClientID: body.ClientID, ClientSecret: body.ClientSecret}
	if err := s.igdbCreds.Save(creds); err != nil {
		s.writeError(w, http.StatusInternalServerError, "igdb_credentials_write_failed", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"configured": true})
}

// handleClearIGDBCredentials desconecta a conta — reversível (o usuário só
// reconecta), por isso não exige nenhuma confirmação especial no servidor.
func (s *Server) handleClearIGDBCredentials(w http.ResponseWriter, r *http.Request) {
	if err := s.igdbCreds.Clear(); err != nil {
		s.writeError(w, http.StatusInternalServerError, "igdb_credentials_write_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"configured": false})
}

// handleScrapeCovers dispara uma busca de capas — em lote (corpo vazio ou
// sem game_id, todo jogo ainda sem capa) ou de um jogo só (game_id
// presente, também serve para reconsultar um jogo específico — G2).
func (s *Server) handleScrapeCovers(w http.ResponseWriter, r *http.Request) {
	var body struct {
		GameID int64 `json:"game_id"`
	}
	// Corpo ausente é válido aqui (dispara o lote) — só um JSON malformado é
	// erro; um corpo vazio decodifica para body zerado sem erro.
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err != io.EOF {
			s.writeError(w, http.StatusBadRequest, "invalid_body",
				`O corpo da requisição deve ser um JSON no formato {"game_id": 123} ou vazio.`)
			return
		}
	}

	var gameIDs []int64
	if body.GameID != 0 {
		gameIDs = []int64{body.GameID}
	}

	job, err := s.igdbJobs.Start(r.Context(), gameIDs)
	if err != nil {
		switch {
		case errors.Is(err, igdb.ErrNotConfigured):
			s.writeError(w, http.StatusBadRequest, "igdb_not_configured", err.Error())
		case errors.Is(err, igdb.ErrScrapeInProgress):
			s.writeError(w, http.StatusConflict, "scrape_in_progress", err.Error())
		default:
			s.writeError(w, http.StatusBadRequest, "scrape_refused", err.Error())
		}
		return
	}

	writeJSON(w, http.StatusAccepted, job)
}

func (s *Server) handleScrapeJob(w http.ResponseWriter, r *http.Request) {
	job, ok := s.igdbJobs.Job(r.PathValue("id"))
	if !ok {
		s.writeError(w, http.StatusNotFound, "not_found", "Nenhuma busca de capas com este identificador.")
		return
	}
	writeJSON(w, http.StatusOK, job)
}

// handleCoverFile serve as capas já baixadas em disco — nunca a URL do IGDB
// direto (G1: a interface só vê um arquivo local já resolvido). A raiz é
// recalculada a cada requisição (só um os.UserConfigDir(), barato) em vez de
// guardada no Server, para não propagar uma falha de resolução do diretório
// ao construir o servidor inteiro.
func (s *Server) handleCoverFile(w http.ResponseWriter, r *http.Request) {
	root, err := emulator.ManagedRoot()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "cover_root_unavailable",
			"Não foi possível localizar a pasta gerenciada do ZeuX.")
		return
	}
	http.StripPrefix("/api/v1/covers/", http.FileServer(http.Dir(root))).ServeHTTP(w, r)
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
