package install

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/doufl/zeux/internal/emulator"
)

// Phase é a etapa em que uma instalação está. A interface usa isso para dizer
// ao usuário o que está acontecendo, em vez de mostrar uma barra sem contexto.
type Phase string

const (
	PhaseResolving   Phase = "resolvendo"
	PhaseDownloading Phase = "baixando"
	PhaseVerifying   Phase = "verificando"
	PhaseExtracting  Phase = "extraindo"
	PhaseFinishing   Phase = "finalizando"
	PhaseDone        Phase = "concluido"
	PhaseFailed      Phase = "falhou"
)

// Job é uma instalação em andamento ou terminada.
type Job struct {
	ID        string `json:"id"`
	AdapterID string `json:"adapter_id"`
	Name      string `json:"name"`

	Phase   Phase  `json:"phase"`
	Message string `json:"message"`

	Version    string `json:"version,omitempty"`
	AssetName  string `json:"asset_name,omitempty"`
	Downloaded int64  `json:"downloaded_bytes"`
	Total      int64  `json:"total_bytes"`

	// SHA256 do pacote baixado. Registrado sempre, mesmo quando o projeto não
	// publica soma de verificação — assim dá para comparar instalações entre
	// máquinas e detectar um pacote trocado depois do fato.
	SHA256 string `json:"sha256,omitempty"`

	// ChecksumVerified diz se a soma foi conferida contra um valor publicado
	// pelo projeto, e não apenas calculada por nós.
	ChecksumVerified bool `json:"checksum_verified"`

	StartedAt  time.Time  `json:"started_at"`
	FinishedAt *time.Time `json:"finished_at"`
	Error      string     `json:"error,omitempty"`
}

// Percent devolve o andamento do download de 0 a 100, ou -1 quando o tamanho
// total é desconhecido.
func (j Job) Percent() int {
	if j.Total <= 0 {
		return -1
	}
	return int(float64(j.Downloaded) / float64(j.Total) * 100)
}

// Manager conduz as instalações e guarda o histórico.
type Manager struct {
	catalog *Catalog
	logger  *slog.Logger

	mu       sync.RWMutex
	jobs     map[string]*Job
	active   map[string]bool // adapterID -> instalando agora
	sequence int
}

// NewManager cria o gerenciador de instalações.
func NewManager(catalog *Catalog, logger *slog.Logger) *Manager {
	return &Manager{
		catalog: catalog,
		logger:  logger,
		jobs:    make(map[string]*Job),
		active:  make(map[string]bool),
	}
}

// Catalog expõe o catálogo de fontes.
func (m *Manager) Catalog() *Catalog { return m.catalog }

// Start dispara a instalação de um emulador e devolve o job imediatamente.
//
// Não bloqueia porque o download leva minutos: a interface acompanha pelo job,
// e a requisição HTTP volta na hora.
func (m *Manager) Start(adapterID string) (*Job, error) {
	source, ok := m.catalog.ByAdapter(adapterID)
	if !ok {
		return nil, fmt.Errorf("o ZeuX não conhece a fonte de download do emulador %q", adapterID)
	}

	if source.Kind == KindManual {
		return nil, fmt.Errorf(
			"o %s precisa ser instalado manualmente a partir de %s. %s",
			source.Name, source.Homepage, source.Reason)
	}

	if source.Kind == KindBundled {
		// Não deveria aparecer um botão de instalar para isto — Locate()
		// já encontra a cópia empacotada (ver EnsureBundledRetroArchAvailable).
		// Chegar aqui mesmo assim significa que a cópia falhou ou ainda não
		// rodou; a mensagem diz a verdade em vez de repetir instruções de
		// download que não fazem mais sentido para este emulador.
		return nil, fmt.Errorf(
			"o %s já vem empacotado com o ZeuX; não há nada para baixar. %s",
			source.Name, source.Reason)
	}

	if _, ok := source.PatternForHost(); !ok {
		return nil, fmt.Errorf("o %s não publica pacote para este sistema operacional", source.Name)
	}

	m.mu.Lock()
	if m.active[adapterID] {
		m.mu.Unlock()
		return nil, fmt.Errorf("já existe uma instalação do %s em andamento", source.Name)
	}

	m.sequence++
	job := &Job{
		ID:        fmt.Sprintf("i%d", m.sequence),
		AdapterID: adapterID,
		Name:      source.Name,
		Phase:     PhaseResolving,
		Message:   "Descobrindo a versão mais recente do " + source.Name + "...",
		StartedAt: time.Now().UTC(),
	}
	m.jobs[job.ID] = job
	m.active[adapterID] = true
	m.mu.Unlock()

	go m.run(job, source)

	return m.snapshot(job.ID), nil
}

// run executa a instalação de ponta a ponta.
func (m *Manager) run(job *Job, source Source) {
	// O contexto é próprio do job, não da requisição HTTP: o download precisa
	// sobreviver ao fim da resposta que o disparou.
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Minute)
	defer cancel()

	defer func() {
		m.mu.Lock()
		delete(m.active, job.AdapterID)
		m.mu.Unlock()
	}()

	if err := m.install(ctx, job, source); err != nil {
		finished := time.Now().UTC()

		m.mu.Lock()
		job.Phase = PhaseFailed
		job.Error = err.Error()
		job.Message = "A instalação do " + source.Name + " não foi concluída."
		job.FinishedAt = &finished
		m.mu.Unlock()

		m.logger.Error("instalação falhou", "emulador", source.Name, "erro", err)
		return
	}

	finished := time.Now().UTC()

	m.mu.Lock()
	job.Phase = PhaseDone
	job.Message = source.Name + " instalado e pronto para uso."
	job.FinishedAt = &finished
	m.mu.Unlock()

	m.logger.Info("instalação concluída", "emulador", source.Name, "versao", job.Version)
}

func (m *Manager) install(ctx context.Context, job *Job, source Source) error {
	release, err := ResolveLatest(ctx, source)
	if err != nil {
		return err
	}

	m.update(job, func(j *Job) {
		j.Phase = PhaseDownloading
		j.Version = release.Version
		j.AssetName = release.AssetName
		j.Total = release.SizeBytes
		j.Message = fmt.Sprintf("Baixando %s %s...", source.Name, release.Version)
	})

	// O trabalho todo acontece num diretório temporário. A pasta definitiva só
	// é tocada no fim, quando já se sabe que deu certo — uma instalação que
	// falha pela metade não pode deixar um emulador quebrado no lugar de um que
	// funcionava.
	workDir, err := os.MkdirTemp("", "zeux-install-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(workDir)

	archivePath := filepath.Join(workDir, release.AssetName)

	hash, err := download(ctx, release.DownloadURL, archivePath, release.SizeBytes, func(p Progress) {
		m.update(job, func(j *Job) {
			j.Downloaded = p.Downloaded
			if p.Total > 0 {
				j.Total = p.Total
			}
		})
	})
	if err != nil {
		return err
	}

	m.update(job, func(j *Job) {
		j.SHA256 = hash
		j.Phase = PhaseVerifying
		j.Message = "Verificando a integridade do pacote..."
	})

	if release.ChecksumURL != "" {
		expected, err := fetchChecksum(ctx, release.ChecksumURL)
		if err != nil {
			return fmt.Errorf("obtendo a soma de verificação: %w", err)
		}
		if expected != hash {
			return fmt.Errorf(
				"a soma de verificação não confere: o projeto publicou %s e o arquivo baixado é %s. O download foi descartado",
				expected, hash)
		}

		m.update(job, func(j *Job) { j.ChecksumVerified = true })
	}

	m.update(job, func(j *Job) {
		j.Phase = PhaseExtracting
		j.Message = "Extraindo os arquivos..."
	})

	stagingDir := filepath.Join(workDir, "staging")
	if err := Extract(archivePath, stagingDir, release.Archive); err != nil {
		return err
	}
	if err := flattenSingleRoot(stagingDir); err != nil {
		return err
	}

	m.update(job, func(j *Job) {
		j.Phase = PhaseFinishing
		j.Message = "Colocando o " + source.Name + " no lugar..."
	})

	return m.promote(stagingDir, source.AdapterID)
}

// promote move a instalação pronta para o diretório gerenciado, substituindo a
// anterior.
func (m *Manager) promote(stagingDir, adapterID string) error {
	root, err := emulator.ManagedRoot()
	if err != nil {
		return err
	}

	final := managedDirFor(root, adapterID)
	if err := os.MkdirAll(filepath.Dir(final), 0o755); err != nil {
		return err
	}

	// A versão anterior sai do caminho antes, mas só é apagada depois de a nova
	// entrar: se o rename falhar, ainda dá para voltar atrás.
	backup := final + ".anterior"
	os.RemoveAll(backup)

	if _, err := os.Stat(final); err == nil {
		// Antes de mover a instalação antiga para o backup, copiamos para o
		// staging o que só existe nela — saves, memory cards, settings.ini já
		// configurado. Emuladores em modo portátil (ex.: DuckStation, ver
		// firstrun.go) guardam esses arquivos dentro do diretório gerenciado, e
		// o backup é apagado no fim desta função: sem essa cópia, atualizar o
		// emulador pelo ZeuX destruiria o progresso salvo do usuário.
		if err := preservePortableUserData(final, stagingDir); err != nil {
			return fmt.Errorf("preservando dados da instalação anterior: %w", err)
		}
		if err := os.Rename(final, backup); err != nil {
			return fmt.Errorf("movendo a instalação anterior: %w", err)
		}
	}

	if err := os.Rename(stagingDir, final); err != nil {
		os.Rename(backup, final)
		return fmt.Errorf("instalando: %w", err)
	}

	if err := seedFirstRun(final, adapterID); err != nil {
		// Não falha a instalação por isto: o emulador funciona sem o seed, só
		// mostra o assistente de primeira execução na primeira vez.
		m.logger.Warn("não foi possível preparar a primeira execução", "emulador", adapterID, "erro", err)
	}

	os.RemoveAll(backup)
	return nil
}

// Uninstall remove uma instalação gerenciada pelo ZeuX.
//
// Fontes "bundled" (hoje só o RetroArch, ver KindBundled) nunca podem ser
// removidas por aqui: o binário vem dentro do próprio instalador do ZeuX, não
// foi baixado por Start(), e apagá-lo quebraria os 24 consoles que dependem
// dele sem nenhuma forma simples de reinstalar (não é "clique em Instalar de
// novo" como os outros — precisaria reinstalar o ZeuX inteiro). O guard fica
// no Manager, não só escondendo o botão na interface, para valer mesmo se
// alguém chamar a rota direto.
//
// Os cores do RetroArch nunca passam por Uninstall — eles vivem em
// bundledCoreDirsForWrite() (internal/emulator/bundled_cores.go), fora da
// árvore que managedDirFor resolve, então já são naturalmente intocáveis por
// esta função.
func (m *Manager) Uninstall(adapterID string) error {
	if source, ok := m.catalog.ByAdapter(adapterID); ok && source.Kind == KindBundled {
		return fmt.Errorf(
			"o %s vem empacotado com o ZeuX e não pode ser removido por aqui — faz parte do próprio instalador do app, não uma instalação separada",
			source.Name)
	}

	root, err := emulator.ManagedRoot()
	if err != nil {
		return err
	}

	target := managedDirFor(root, adapterID)
	if _, err := os.Stat(target); os.IsNotExist(err) {
		return fmt.Errorf("o ZeuX não instalou este emulador; nada a remover")
	}

	return os.RemoveAll(target)
}

// managedDirFor resolve o diretório gerenciado de um adapter a partir do seu
// ID, consultando o registro de adapters embutidos para saber quantos
// consoles ele atende (ver emulator.ManagedEmulatorDir). Um adapter
// desconhecido do registro (não deveria acontecer: os IDs vêm do mesmo
// catálogo que os adapters) cai no caminho compartilhado, por segurança.
func managedDirFor(root, adapterID string) string {
	var consoles []string
	if adapter, ok := emulator.NewRegistry().ByID(adapterID); ok {
		consoles = adapter.Consoles()
	}
	return emulator.ManagedEmulatorDir(root, adapterID, consoles)
}

// update aplica uma alteração ao job com o lock tomado.
func (m *Manager) update(job *Job, mutate func(*Job)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	mutate(job)
}

// snapshot devolve uma cópia do job, segura para serializar.
func (m *Manager) snapshot(id string) *Job {
	m.mu.RLock()
	defer m.mu.RUnlock()

	job, ok := m.jobs[id]
	if !ok {
		return nil
	}

	copied := *job
	return &copied
}

// Job devolve o andamento de uma instalação.
func (m *Manager) Job(id string) (*Job, bool) {
	job := m.snapshot(id)
	return job, job != nil
}

// Jobs devolve todas as instalações, da mais recente para a mais antiga.
func (m *Manager) Jobs() []Job {
	m.mu.RLock()
	defer m.mu.RUnlock()

	jobs := make([]Job, 0, len(m.jobs))
	for _, job := range m.jobs {
		jobs = append(jobs, *job)
	}

	// A iteração de um mapa em Go é deliberadamente aleatória, então a ordem
	// precisa ser imposta aqui — inverter a fatia não bastaria.
	sort.Slice(jobs, func(i, j int) bool {
		return jobs[i].StartedAt.After(jobs[j].StartedAt)
	})

	return jobs
}
