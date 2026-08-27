package install

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/doufl/zeux/internal/emulator"
)

// StartCore dispara o download sob demanda de um core do RetroArch (ADR 0015,
// R2) e devolve o job imediatamente — mesmo padrão não bloqueante de Start().
//
// Diferente de Start(), que resolve a release mais recente contra o GitHub,
// aqui a URL e o SHA256 esperado já são conhecidos: vêm do manifesto fixado
// no R1 (retroarch_manifest.go). Isso significa que não existe "resolvendo a
// versão" para um core — o job entra direto em "baixando".
func (m *Manager) StartCore(ctx context.Context, coreName string) (*Job, error) {
	coreName = strings.ToLower(strings.TrimSpace(coreName))
	if coreName == "" {
		return nil, fmt.Errorf("nome do core não pode ser vazio")
	}

	// No-op explícito checado ANTES de qualquer coisa relacionada ao
	// manifesto: um core que já está no lugar (bundled, de uma sessão
	// anterior, ou colocado à mão pelo Online Updater do próprio RetroArch)
	// não deveria depender do manifesto ter hash medido para esta
	// plataforma — só baixar de novo depende disso. RetroArchCoreStatus já
	// sabe procurar em todos os diretórios que o adapter considera.
	for _, status := range emulator.RetroArchCoreStatus(ctx) {
		if status.Name == coreName && status.Installed {
			return m.recordCoreJob(coreName, PhaseDone, "O core já está instalado.", nil), nil
		}
	}

	manifest, err := m.coreManifest()
	if err != nil {
		return nil, err
	}

	entry, ok := manifest.Cores[coreName]
	if !ok {
		return nil, fmt.Errorf("o ZeuX não conhece o core %q do RetroArch", coreName)
	}

	platform := runtime.GOOS + "/" + runtime.GOARCH
	asset, ok := entry.Platforms[platform]
	if !ok {
		return nil, fmt.Errorf("o core %q não tem download disponível para %s", coreName, platform)
	}
	if !asset.Generated {
		// Estado honesto do R1: a URL é conhecida, mas ninguém rodou
		// cmd/generate-retroarch-manifest com acesso ao buildbot para medir
		// tamanho e SHA256 desta combinação ainda.
		return nil, fmt.Errorf(
			"o manifesto ainda não tem o core %q medido para %s — rode cmd/generate-retroarch-manifest numa máquina com acesso a buildbot.libretro.com e recorte uma nova versão do ZeuX",
			coreName, platform)
	}

	m.mu.Lock()
	if m.activeCores == nil {
		m.activeCores = make(map[string]bool)
	}
	if m.activeCores[coreName] {
		m.mu.Unlock()
		return nil, fmt.Errorf("já existe um download do core %q em andamento", coreName)
	}
	m.activeCores[coreName] = true
	m.mu.Unlock()

	job := m.recordCoreJob(coreName, PhaseDownloading, "Baixando o core "+coreName+"...", &asset)

	go m.runCore(job, coreName, asset)

	return m.snapshot(job.ID), nil
}

// recordCoreJob cria (ou fecha, no caso de no-op) o job de download de um
// core e o registra no mapa compartilhado com os jobs de instalação de
// emulador — a mesma GET /api/v1/installs/{id} atende os dois.
func (m *Manager) recordCoreJob(coreName string, phase Phase, message string, asset *RetroArchCoreAsset) *Job {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.sequence++
	job := &Job{
		ID:        fmt.Sprintf("i%d", m.sequence),
		AdapterID: "retroarch",
		CoreName:  coreName,
		Name:      "core " + coreName + " do RetroArch",
		Phase:     phase,
		Message:   message,
		StartedAt: time.Now().UTC(),
	}
	if asset != nil {
		job.Total = asset.Size
	}
	if phase == PhaseDone || phase == PhaseFailed {
		finished := time.Now().UTC()
		job.FinishedAt = &finished
	}
	m.jobs[job.ID] = job
	return job
}

// runCore executa o download inteiro em segundo plano, do mesmo jeito que run()
// faz para uma instalação de emulador — contexto próprio, não o da requisição
// HTTP que disparou (a mesma regra de session.go: o trabalho precisa
// sobreviver à resposta).
func (m *Manager) runCore(job *Job, coreName string, asset RetroArchCoreAsset) {
	timeout, cancelTimeout := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancelTimeout()

	// Um segundo nível de cancelamento, acionável de fora pela interface
	// (CancelJob, R3) — sem ele, o único jeito de interromper um download em
	// andamento seria esperar os 15 minutos do timeout acima.
	ctx, cancelManual := context.WithCancel(timeout)
	defer cancelManual()

	m.mu.Lock()
	if m.cancels == nil {
		m.cancels = make(map[string]context.CancelFunc)
	}
	m.cancels[job.ID] = cancelManual
	m.mu.Unlock()

	defer func() {
		m.mu.Lock()
		delete(m.activeCores, coreName)
		delete(m.cancels, job.ID)
		m.mu.Unlock()
	}()

	if err := m.installCore(ctx, job, coreName, asset); err != nil {
		finished := time.Now().UTC()

		// Cancelamento explícito (CancelJob) tem sua própria fase — não é uma
		// falha, é o usuário desistindo. errors.Is cobre tanto o cancelManual
		// quanto o timeout de 15 minutos (os dois produzem context.Canceled ou
		// context.DeadlineExceeded na árvore de erro que download()/Extract()
		// devolvem).
		if errors.Is(err, context.Canceled) {
			m.update(job, func(j *Job) {
				j.Phase = PhaseCanceled
				j.Message = "Download do core " + coreName + " cancelado."
				j.FinishedAt = &finished
			})
			m.logger.Info("download de core do RetroArch cancelado", "core", coreName)
			return
		}

		code := "core_download_failed"
		var mismatch *coreHashMismatchError
		if errors.As(err, &mismatch) {
			code = "core_hash_mismatch"
		}

		m.update(job, func(j *Job) {
			j.Phase = PhaseFailed
			j.Code = code
			j.Error = err.Error()
			j.Message = "O download do core " + coreName + " não foi concluído."
			j.FinishedAt = &finished
		})

		m.logger.Error("download de core do RetroArch falhou", "core", coreName, "erro", err)
		return
	}

	finished := time.Now().UTC()
	m.update(job, func(j *Job) {
		j.Phase = PhaseDone
		j.Message = "Core " + coreName + " pronto para uso."
		j.FinishedAt = &finished
	})

	m.logger.Info("core do RetroArch baixado", "core", coreName)
}

// installCore baixa, verifica e promove um único core.
func (m *Manager) installCore(ctx context.Context, job *Job, coreName string, asset RetroArchCoreAsset) error {
	coresDir, err := emulator.RetroArchManagedCoresDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(coresDir, 0o755); err != nil {
		return fmt.Errorf("criando o diretório de cores do RetroArch: %w", err)
	}

	// O diretório de trabalho fica dentro do próprio destino — não em
	// os.TempDir(), que pode estar num sistema de arquivos diferente — para
	// que a promoção final (abaixo) seja sempre um os.Rename no mesmo
	// volume: nunca falha por "invalid cross-device link" e nunca deixa um
	// arquivo pela metade no lugar definitivo, porque o rename só acontece
	// depois que o download e a extração já terminaram com sucesso.
	workDir, err := os.MkdirTemp(coresDir, ".zeux-core-download-*")
	if err != nil {
		return fmt.Errorf("criando diretório de trabalho: %w", err)
	}
	defer os.RemoveAll(workDir)

	archivePath := filepath.Join(workDir, asset.Filename)
	hash, err := download(ctx, asset.URL, archivePath, asset.Size, func(p Progress) {
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
		j.Message = "Verificando a integridade do core " + coreName + "..."
	})

	if hash != asset.SHA256 {
		// Nada é promovido para o diretório gerenciado — o arquivo errado
		// fica preso no workDir, que o defer acima apaga.
		return &coreHashMismatchError{core: coreName, expected: asset.SHA256, got: hash}
	}
	m.update(job, func(j *Job) { j.ChecksumVerified = true })

	m.update(job, func(j *Job) {
		j.Phase = PhaseExtracting
		j.Message = "Extraindo o core " + coreName + "..."
	})
	if err := Extract(archivePath, workDir, ArchiveZip); err != nil {
		return err
	}

	// O buildbot zipa só o binário do core, sem diretórios (mesma observação
	// de scripts/download-retroarch-cores.mjs) — o nome esperado depois de
	// extrair é o nome do .zip sem a extensão .zip.
	binaryName := strings.TrimSuffix(asset.Filename, ".zip")
	extractedPath := filepath.Join(workDir, binaryName)
	if _, err := os.Stat(extractedPath); err != nil {
		return fmt.Errorf("o core %s não apareceu depois de extrair %s — o formato do pacote pode ter mudado no buildbot", binaryName, asset.Filename)
	}

	m.update(job, func(j *Job) {
		j.Phase = PhaseFinishing
		j.Message = "Colocando o core " + coreName + " no lugar..."
	})

	dest := filepath.Join(coresDir, binaryName)
	if err := os.Rename(extractedPath, dest); err != nil {
		return fmt.Errorf("instalando o core: %w", err)
	}

	return nil
}

// coreHashMismatchError distingue "hash não confere" de qualquer outra falha
// de download — runCore usa isso para atribuir o code estável
// "core_hash_mismatch" ao job, em vez do genérico "core_download_failed".
type coreHashMismatchError struct {
	core, expected, got string
}

func (e *coreHashMismatchError) Error() string {
	return fmt.Sprintf(
		"o core %q foi baixado, mas o arquivo recebido não confere com o SHA256 esperado (esperado %s, recebido %s) — nada foi instalado",
		e.core, e.expected, e.got)
}

// SetRetroArchManifestForTesting substitui o manifesto de cores do RetroArch
// que StartCore consulta. Existe só para teste — inclusive de fora deste
// pacote (ex.: internal/api), onde não há como mexer no campo não exportado
// diretamente — apontando para um manifesto sintético (core inventado,
// servidor de mentira) sem depender de rede nem do manifesto real embutido.
// Nunca chamado fora de arquivo `_test.go`.
func (m *Manager) SetRetroArchManifestForTesting(manifest *RetroArchCoreManifest) {
	m.retroArchManifest = manifest
}

// coreManifest devolve o manifesto de cores a usar — o injetado em testes
// (Manager.retroArchManifest, campo do mesmo pacote) tem prioridade sobre o
// embutido no binário, para que um teste possa apontar para um servidor de
// mentira sem precisar de rede nem editar o manifesto real.
func (m *Manager) coreManifest() (*RetroArchCoreManifest, error) {
	if m.retroArchManifest != nil {
		return m.retroArchManifest, nil
	}
	return sharedRetroArchManifest()
}

var (
	sharedManifestOnce sync.Once
	sharedManifestData *RetroArchCoreManifest
	sharedManifestErr  error
)

// sharedRetroArchManifest carrega o manifesto embutido uma única vez por
// processo — ele não muda em tempo de execução, então não há razão para
// reanalisar o JSON a cada chamada de StartCore.
func sharedRetroArchManifest() (*RetroArchCoreManifest, error) {
	sharedManifestOnce.Do(func() {
		sharedManifestData, sharedManifestErr = LoadRetroArchCoreManifest()
	})
	return sharedManifestData, sharedManifestErr
}
