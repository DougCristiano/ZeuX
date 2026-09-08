package igdb

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/doufl/zeux/internal/emulator"
	"github.com/doufl/zeux/internal/library"
)

// ErrNotConfigured é devolvido por Start quando não há credencial do IGDB
// conectada. A camada de API mapeia isto para um erro específico e
// acionável (400, "conecte sua conta"), nunca um erro de rede genérico —
// sem credencial, G1 nem tenta se conectar (docs/roadmap.md, critério de
// aceite adicional do G1).
var ErrNotConfigured = errors.New("conecte sua conta do IGDB nas Configurações antes de buscar capas")

// ErrScrapeInProgress é devolvido por Start quando já existe uma busca em
// andamento. Só uma por vez, mesma simplicidade de internal/install.Manager.
var ErrScrapeInProgress = errors.New("já existe uma busca de capas em andamento")

// Phase é a etapa em que um job de busca de capas está.
type Phase string

const (
	PhaseSearching   Phase = "buscando"
	PhaseDownloading Phase = "baixando"
	PhaseDone        Phase = "concluido"
	PhaseFailed      Phase = "falhou"
)

// GameResult é o resultado da busca de capa de um jogo dentro de um lote.
type GameResult struct {
	GameID  int64  `json:"game_id"`
	Title   string `json:"title"`
	Status  string `json:"status"` // "found" | "not_found" | "error"
	Message string `json:"message,omitempty"`
}

// Job é uma busca de capas em andamento ou terminada — lote (todo jogo sem
// capa) ou de um jogo só.
type Job struct {
	ID string `json:"id"`

	Phase     Phase        `json:"phase"`
	Total     int          `json:"total"`
	Processed int          `json:"processed"`
	Results   []GameResult `json:"results"`

	StartedAt  time.Time  `json:"started_at"`
	FinishedAt *time.Time `json:"finished_at"`
	Error      string     `json:"error,omitempty"`
}

// ScrapeManager conduz as buscas de capa e guarda o histórico de jobs —
// mesmo desenho de internal/install.Manager.
type ScrapeManager struct {
	library     *library.Store
	credentials *CredentialsStore
	logger      *slog.Logger

	mu       sync.RWMutex
	jobs     map[string]*Job
	active   bool
	sequence int
}

// NewScrapeManager cria o gerenciador de busca de capas.
func NewScrapeManager(libraryStore *library.Store, credentials *CredentialsStore, logger *slog.Logger) *ScrapeManager {
	return &ScrapeManager{
		library:     libraryStore,
		credentials: credentials,
		logger:      logger,
		jobs:        make(map[string]*Job),
	}
}

// Start dispara uma busca de capas e devolve o job imediatamente — o lote
// pode levar minutos (um jogo por vez, respeitando o limite de 4 req/s do
// IGDB), então a interface acompanha pelo job em vez de esperar a resposta.
//
// gameIDs vazio dispara o lote (todo jogo ainda sem capa nem status);
// gameIDs com um elemento é a busca por um jogo só (G2: reconsultar sem
// apagar o cache inteiro).
func (m *ScrapeManager) Start(ctx context.Context, gameIDs []int64) (*Job, error) {
	creds, configured, err := m.credentials.Load()
	if err != nil {
		return nil, fmt.Errorf("lendo a credencial do IGDB: %w", err)
	}
	if !configured {
		return nil, ErrNotConfigured
	}

	// Lote (gameIDs vazio) e busca de um jogo só divergem em quem pode
	// sobrescrever o quê — ver o comentário grande em processGame.
	batch := len(gameIDs) == 0

	games, err := m.resolveGames(ctx, gameIDs)
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	if m.active {
		m.mu.Unlock()
		return nil, ErrScrapeInProgress
	}

	m.sequence++
	job := &Job{
		ID:    fmt.Sprintf("s%d", m.sequence),
		Phase: PhaseSearching,
		Total: len(games),
		// Nunca nil, mesmo antes do primeiro resultado — um lote vazio
		// (nenhum jogo sem capa) chega a "concluido" sem passar pelo laço
		// que preenche Results, e []GameResult(nil) serializaria como
		// `null`, quebrando `job.results.filter(...)` no front (mesma
		// classe de bug achada e corrigida em internal/api/server.go,
		// handleSetEmulatorConfig/Bindings).
		Results:   []GameResult{},
		StartedAt: time.Now().UTC(),
	}
	m.jobs[job.ID] = job
	m.active = true
	m.mu.Unlock()

	// Contexto próprio do job, não da requisição HTTP — o lote precisa
	// sobreviver ao fim da resposta 202 que o disparou (mesmo raciocínio de
	// internal/install.Manager.run).
	go m.run(job, creds, games, batch)

	return m.snapshot(job.ID), nil
}

func (m *ScrapeManager) resolveGames(ctx context.Context, gameIDs []int64) ([]library.Game, error) {
	if len(gameIDs) == 0 {
		return m.library.UncoveredGames(ctx)
	}

	games := make([]library.Game, 0, len(gameIDs))
	for _, id := range gameIDs {
		game, ok, err := m.library.GameByID(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("procurando o jogo %d: %w", id, err)
		}
		if !ok {
			return nil, fmt.Errorf("nenhum jogo com o id %d", id)
		}
		games = append(games, game)
	}
	return games, nil
}

func (m *ScrapeManager) run(job *Job, creds Credentials, games []library.Game, batch bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()

	defer func() {
		m.mu.Lock()
		m.active = false
		m.mu.Unlock()
	}()

	// Lote vazio (nenhum jogo elegível) não precisa autenticar contra o
	// IGDB — poupa uma chamada de rede que aconteceria toda vez que a busca
	// automática (2026-08-17: dispara sozinha depois de toda pasta
	// adicionada/revarrida, não só quando o usuário clica "Buscar capas")
	// encontrasse a biblioteca já 100% coberta.
	if len(games) == 0 {
		finished := time.Now().UTC()
		m.mu.Lock()
		job.Phase = PhaseDone
		job.FinishedAt = &finished
		m.mu.Unlock()
		return
	}

	client := NewClient(creds)

	root, err := emulator.ManagedRoot()
	if err != nil {
		m.fail(job, fmt.Errorf("localizando a pasta gerenciada do ZeuX: %w", err))
		return
	}

	for _, game := range games {
		result := m.processGame(ctx, client, root, game, batch)

		m.mu.Lock()
		job.Results = append(job.Results, result)
		job.Processed++
		if result.Status == "found" {
			job.Phase = PhaseDownloading
		}
		m.mu.Unlock()
	}

	finished := time.Now().UTC()
	m.mu.Lock()
	job.Phase = PhaseDone
	job.FinishedAt = &finished
	m.mu.Unlock()

	m.logger.Info("busca de capas concluída", "job", job.ID, "total", len(games))
}

// processGame busca e baixa a capa de um jogo. Erro de rede/IGDB para este
// jogo específico nunca derruba o lote inteiro (docs/roadmap.md: "falha de
// rede não quebra a biblioteca") — só grava o status e segue para o
// próximo.
//
// batch distingue as duas origens possíveis de uma chamada (Start,
// gameIDs vazio ou não) porque elas precisam de garantias opostas:
//   - lote (batch=true, inclui a busca automática que dispara sozinha
//     depois de toda pasta adicionada/revarrida): o snapshot de
//     UncoveredGames() pode já estar desatualizado quando este jogo é
//     processado minutos depois — o usuário pode ter trocado a capa à mão
//     nesse meio-tempo (internal/api.handleSetGameCover). O lote nunca pode
//     sobrescrever isso, então revalida o estado antes de gastar rede e usa
//     escritas condicionais (SetCoverIfUncovered/SetCoverStatusIfUncovered).
//   - jogo único (batch=false, "Buscar capa novamente" em
//     GameDetailScreen.tsx): é um pedido explícito do usuário para
//     substituir a capa atual, manual ou automática — precisa continuar
//     sobrescrevendo sem condição, senão o botão pararia de funcionar
//     depois de uma troca manual.
func (m *ScrapeManager) processGame(ctx context.Context, client *Client, root string, game library.Game, batch bool) GameResult {
	result := GameResult{GameID: game.ID, Title: game.Title}
	destDir := emulator.GameCoverDir(root, game.ConsoleID, game.ID)
	destPath := filepath.Join(destDir, "cover.jpg")

	if batch {
		fresh, ok, err := m.library.GameByID(ctx, game.ID)
		if err != nil {
			result.Status = "error"
			result.Message = err.Error()
			return result
		}
		if !ok {
			result.Status = "error"
			result.Message = "jogo removido da biblioteca durante a busca"
			return result
		}
		if fresh.CoverPath != "" {
			result.Status = "found"
			return result
		}
		if fresh.CoverStatus != "" {
			result.Status = fresh.CoverStatus
			return result
		}
	}

	// Libretro-thumbnails primeiro (thumbnails.go): sem conta, sem cota
	// compartilhada. Só segue pro IGDB abaixo se esta fonte não achar nada
	// para este console/nome de arquivo — nunca ao contrário, e uma falha de
	// rede aqui não impede a tentativa pelo IGDB (mesma regra de "erro de
	// uma fonte não pode travar a busca do jogo", só vira log).
	thumbFound, thumbErr := FetchLibretroThumbnail(ctx, game.ConsoleID, library.RawBaseName(game.Path), destPath)
	if thumbErr != nil {
		m.logger.Warn("libretro-thumbnails falhou, seguindo pro IGDB", "jogo", game.ID, "erro", thumbErr)
	}
	if thumbFound {
		if err := m.saveResolvedCover(ctx, game.ID, root, destPath, batch); err != nil {
			result.Status = "error"
			result.Message = err.Error()
			return result
		}
		result.Status = "found"
		return result
	}

	match, found, err := client.SearchGame(ctx, game.Title)
	if err != nil {
		m.markError(ctx, game.ID, err, batch)
		result.Status = "error"
		result.Message = err.Error()
		return result
	}
	if !found || match.ImageID == "" {
		var setErr error
		if batch {
			_, setErr = m.library.SetCoverStatusIfUncovered(ctx, game.ID, "not_found")
		} else {
			setErr = m.library.SetCoverStatus(ctx, game.ID, "not_found")
		}
		if setErr != nil {
			m.logger.Error("gravando status de capa não encontrada", "jogo", game.ID, "erro", setErr)
		}
		result.Status = "not_found"
		return result
	}

	if err := client.DownloadCover(ctx, match.ImageID, destPath); err != nil {
		m.markError(ctx, game.ID, err, batch)
		result.Status = "error"
		result.Message = err.Error()
		return result
	}

	if err := m.saveResolvedCover(ctx, game.ID, root, destPath, batch); err != nil {
		result.Status = "error"
		result.Message = err.Error()
		return result
	}

	result.Status = "found"
	return result
}

// saveResolvedCover grava no banco o caminho (relativo a root) de uma capa
// já baixada em destPath — passo final comum às duas fontes de capa
// (libretro-thumbnails e IGDB), extraído para não duplicar o cálculo de
// caminho relativo nem o tratamento de erro entre as duas. batch escolhe a
// escrita condicional ou incondicional — ver o comentário de processGame.
func (m *ScrapeManager) saveResolvedCover(ctx context.Context, gameID int64, root, destPath string, batch bool) error {
	relPath, err := filepath.Rel(root, destPath)
	if err != nil {
		// Não deveria acontecer — destPath é sempre construído a partir de
		// root. Se acontecer, trata como erro deste jogo, não do lote.
		m.markError(ctx, gameID, err, batch)
		return err
	}

	path := filepath.ToSlash(relPath)
	if batch {
		if _, err := m.library.SetCoverIfUncovered(ctx, gameID, path); err != nil {
			m.logger.Error("gravando a capa resolvida", "jogo", gameID, "erro", err)
			return err
		}
		return nil
	}

	if err := m.library.SetCover(ctx, gameID, path); err != nil {
		m.logger.Error("gravando a capa resolvida", "jogo", gameID, "erro", err)
		return err
	}

	return nil
}

// markError grava que a busca deste jogo falhou. batch escolhe a escrita
// condicional ou incondicional — ver o comentário de processGame.
func (m *ScrapeManager) markError(ctx context.Context, gameID int64, cause error, batch bool) {
	var err error
	if batch {
		_, err = m.library.SetCoverStatusIfUncovered(ctx, gameID, "error")
	} else {
		err = m.library.SetCoverStatus(ctx, gameID, "error")
	}
	if err != nil {
		m.logger.Error("gravando status de erro de capa", "jogo", gameID, "erro_original", cause, "erro", err)
	}
}

func (m *ScrapeManager) fail(job *Job, err error) {
	finished := time.Now().UTC()
	m.mu.Lock()
	job.Phase = PhaseFailed
	job.Error = err.Error()
	job.FinishedAt = &finished
	m.mu.Unlock()
	m.logger.Error("busca de capas falhou", "job", job.ID, "erro", err)
}

// snapshot devolve uma cópia do job, segura para serializar.
func (m *ScrapeManager) snapshot(id string) *Job {
	m.mu.RLock()
	defer m.mu.RUnlock()

	job, ok := m.jobs[id]
	if !ok {
		return nil
	}
	copied := *job
	// make+copy, não append(nil, ...): um Results vazio (lote sem jogo
	// elegível) precisa continuar sendo []GameResult{}, não virar nil de
	// novo — append(nil) com zero elementos devolve nil, o que
	// serializaria como `null` e quebraria job.results.filter(...) no
	// front (achado testando o H2 de verdade, mesma classe de bug de
	// internal/api/server.go).
	copied.Results = make([]GameResult, len(job.Results))
	copy(copied.Results, job.Results)
	return &copied
}

// Job devolve o andamento de uma busca de capas.
func (m *ScrapeManager) Job(id string) (*Job, bool) {
	job := m.snapshot(id)
	return job, job != nil
}

// Jobs devolve todas as buscas, da mais recente para a mais antiga.
func (m *ScrapeManager) Jobs() []Job {
	m.mu.RLock()
	defer m.mu.RUnlock()

	jobs := make([]Job, 0, len(m.jobs))
	for _, job := range m.jobs {
		jobs = append(jobs, *job)
	}
	sort.Slice(jobs, func(i, j int) bool {
		return jobs[i].StartedAt.After(jobs[j].StartedAt)
	})
	return jobs
}
