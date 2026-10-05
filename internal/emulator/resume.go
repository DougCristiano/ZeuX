package emulator

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// "Continuar de onde parei" (2026-10-05, pedido do Douglas): além do save do
// próprio jogo (memory card), DuckStation e PCSX2 gravam um save state de
// retomada ao fechar e aceitam abrir já carregando um estado com
// `-statefile <arquivo>`. As duas coisas foram lidas no código-fonte dos
// emuladores (duckstation-qt/qthost.cpp e pcsx2-qt/QtHost.cpp: ajuda e
// leitura do argumento; core/system.cpp e pcsx2/VMManager.cpp: nome do
// arquivo de retomada), não observadas com o binário rodando — ver a
// ressalva em docs/decisoes.md.
//
// Os dois RECUSAM abrir quando o estado pedido não existe (DuckStation mostra
// erro; PCSX2 devolve StartupFailure). Por isso o ZeuX só oferece "Continuar"
// quando o arquivo existe de fato.

// ResumeState é o estado de retomada conhecido de um jogo.
type ResumeState struct {
	ROMPath   string
	AdapterID string
	StatePath string
	SavedAt   time.Time
}

// ResumeRepository guarda o estado de retomada por jogo. Capacidade
// opcional do SessionRepository (verificada por type assertion), para não
// obrigar os repositórios falsos dos testes a implementá-la.
type ResumeRepository interface {
	RecordResumeState(ctx context.Context, state ResumeState) error
	ResumeStates(ctx context.Context) (map[string]ResumeState, error)
}

// ErrNoResumeState é devolvido quando se pede "Continuar" sem estado salvo.
var ErrNoResumeState = errors.New("não há um estado salvo para continuar este jogo — use Jogar para começar do início")

// SupportsResume diz se o ZeuX sabe abrir este emulador num estado salvo.
func SupportsResume(adapterID string) bool {
	return adapterID == "duckstation" || adapterID == "pcsx2"
}

// resumeStateLocation devolve a pasta de save states do emulador e como
// reconhecer o arquivo de retomada dentro dela.
//
// DuckStation: "<serial>_resume.sav" em <pasta de dados>/savestates
// (System::GetGameSaveStatePath com slot -1). A pasta de dados só é
// conhecida na instalação gerenciada em modo portátil (a do .exe, ver
// duckStationSettingsPath); `[Folders] SaveStates` no settings.ini, se
// existir, troca o "savestates" padrão (EmuFolders::LoadConfig).
//
// PCSX2: "<serial> (<CRC>).resume.p2s" em <pcsx2DataDir>/sstates — a pasta
// "sstates" foi vista criada pelo binário real em 2026-09-11 (save_data.go).
func resumeStateLocation(adapterID string, install Installation) (dir string, match func(name string) bool, ok bool) {
	switch adapterID {
	case "duckstation":
		settings, ok := duckStationSettingsPath(install)
		if !ok {
			return "", nil, false
		}
		root := filepath.Dir(settings)
		dir := filepath.Join(root, "savestates")
		if data, err := os.ReadFile(settings); err == nil {
			if custom, has := parseINI(data).get("Folders", "SaveStates"); has && strings.TrimSpace(custom) != "" {
				custom = strings.TrimSpace(custom)
				if !filepath.IsAbs(custom) {
					custom = filepath.Join(root, custom)
				}
				dir = custom
			}
		}
		return dir, func(name string) bool { return strings.HasSuffix(strings.ToLower(name), "_resume.sav") }, true
	case "pcsx2":
		data, err := pcsx2DataDir()
		if err != nil {
			return "", nil, false
		}
		return filepath.Join(data, "sstates"), func(name string) bool {
			return strings.HasSuffix(strings.ToLower(name), ".resume.p2s")
		}, true
	default:
		return "", nil, false
	}
}

// newestResumeFile acha o arquivo de retomada gravado a partir de `since`.
// A folga de 2 s cobre relógio de sistema de arquivos com resolução grossa.
func newestResumeFile(dir string, match func(string) bool, since time.Time) (string, time.Time, bool) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", time.Time{}, false
	}
	var bestPath string
	var bestTime time.Time
	for _, e := range entries {
		if e.IsDir() || !match(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil || info.ModTime().Before(since.Add(-2*time.Second)) {
			continue
		}
		if info.ModTime().After(bestTime) {
			bestPath, bestTime = filepath.Join(dir, e.Name()), info.ModTime()
		}
	}
	return bestPath, bestTime, bestPath != ""
}

// recordResumeState roda ao fim de uma sessão: se o emulador gravou um
// estado de retomada durante ela, liga esse arquivo ao jogo.
func (l *Launcher) recordResumeState(session Session, install Installation) {
	repo, ok := l.sessions.(ResumeRepository)
	if !ok || !SupportsResume(session.AdapterID) {
		return
	}
	dir, match, ok := resumeStateLocation(session.AdapterID, install)
	if !ok {
		return
	}
	path, savedAt, ok := newestResumeFile(dir, match, session.StartedAt)
	if !ok {
		return
	}
	if err := repo.RecordResumeState(context.Background(), ResumeState{
		ROMPath: session.ROMPath, AdapterID: session.AdapterID, StatePath: path, SavedAt: savedAt.UTC(),
	}); err != nil {
		l.logger.Warn("não foi possível registrar o estado de retomada", "sessao", session.ID, "erro", err)
	}
}

// ResumeStates devolve, por caminho de ROM, os estados de retomada cujo
// arquivo ainda existe no disco. Mapa vazio quando o repositório não guarda
// estados (testes).
func (l *Launcher) ResumeStates(ctx context.Context) (map[string]ResumeState, error) {
	repo, ok := l.sessions.(ResumeRepository)
	if !ok {
		return map[string]ResumeState{}, nil
	}
	all, err := repo.ResumeStates(ctx)
	if err != nil {
		return nil, err
	}
	for path, state := range all {
		if _, err := os.Stat(state.StatePath); err != nil {
			delete(all, path)
		}
	}
	return all, nil
}

// resumeStateFor resolve o arquivo a carregar num "Continuar".
func (l *Launcher) resumeStateFor(ctx context.Context, romPath, adapterID string) (string, error) {
	if !SupportsResume(adapterID) {
		return "", fmt.Errorf("o ZeuX ainda não sabe continuar jogos no emulador %s", adapterID)
	}
	states, err := l.ResumeStates(ctx)
	if err != nil {
		return "", err
	}
	state, ok := states[romPath]
	if !ok || state.AdapterID != adapterID {
		return "", ErrNoResumeState
	}
	return state.StatePath, nil
}

// ensurePCSX2SaveStateOnShutdown liga `[EmuCore] SaveStateOnShutdown` no
// PCSX2.ini quando a chave não existe — sem ela o PCSX2 não grava o estado de
// retomada ao fechar e o "Continuar" nunca apareceria. Chave lida do código
// (Pcsx2Config.cpp: seção "EmuCore", SettingsWrapBitBool). Se a pessoa já
// escolheu um valor, ele vale. O DuckStation não precisa disto:
// SaveStateOnExit já vem ligado por padrão (core/settings.cpp).
func ensurePCSX2SaveStateOnShutdown() error {
	path, err := pcsx2ConfigPath()
	if err != nil {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		// Sem arquivo ainda: o seed ou o próprio PCSX2 cria; não é aqui.
		return nil
	}
	ini := parseINI(data)
	if _, has := ini.get("EmuCore", "SaveStateOnShutdown"); has {
		return nil
	}
	ini.set("EmuCore", "SaveStateOnShutdown", "true")
	if err := backupBeforeFirstWrite(path); err != nil {
		return err
	}
	return os.WriteFile(path, ini.bytes(), 0o644)
}
