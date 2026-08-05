package emulator

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"
)

// fakeSessionRepository é a implementação em memória de SessionRepository
// usada para testar a agregação do Launcher (Sessions/Playtime) sem precisar
// de um banco de verdade — só o repositório concreto (SQLiteSessions) tem
// motivo para tocar disco.
type fakeSessionRepository struct {
	sessions []Session
}

func (f *fakeSessionRepository) Insert(ctx context.Context, session Session) (string, error) {
	session.ID = formatSessionID(int64(len(f.sessions) + 1))
	f.sessions = append(f.sessions, session)
	return session.ID, nil
}

func (f *fakeSessionRepository) Close(ctx context.Context, id string, endedAt time.Time, exitError string) error {
	for i := range f.sessions {
		if f.sessions[i].ID == id {
			f.sessions[i].EndedAt = &endedAt
			f.sessions[i].ExitError = exitError
			return nil
		}
	}
	return nil
}

func (f *fakeSessionRepository) List(ctx context.Context) ([]Session, error) {
	// A ordem de listagem (mais recente primeiro) é responsabilidade do
	// repositório concreto — coberta em TestSQLiteSessionsListOrdersMostRecentFirst
	// contra o SQLite de verdade. Aqui devolve na ordem de inserção porque os
	// testes deste arquivo verificam campo por sessão, não ordem.
	result := make([]Session, len(f.sessions))
	copy(result, f.sessions)
	return result, nil
}

// Sessions() precisa marcar como "em andamento" quem não tem EndedAt, e
// calcular a duração corrente em vez de zero — é a diferença entre uma
// sessão realmente aberta e uma que só não foi encerrada por engano.
func TestLauncherSessionsComputesDurationAndRunningState(t *testing.T) {
	started := time.Now().UTC().Add(-2 * time.Minute)
	ended := started.Add(90 * time.Second)

	repo := &fakeSessionRepository{sessions: []Session{
		{ID: "s1", ConsoleID: "ps1", StartedAt: started, EndedAt: &ended},
		{ID: "s2", ConsoleID: "ps2", StartedAt: started},
	}}
	launcher := &Launcher{sessions: repo}

	sessions, err := launcher.Sessions(context.Background())
	if err != nil {
		t.Fatalf("Sessions: %v", err)
	}
	if len(sessions) != 2 {
		t.Fatalf("esperava 2 sessões, achou %d", len(sessions))
	}

	byID := make(map[string]MarshalSession, len(sessions))
	for _, s := range sessions {
		byID[s.ID] = s
	}

	finished := byID["s1"]
	if finished.IsRunning {
		t.Error("sessão com EndedAt não deveria estar marcada como em andamento")
	}
	if finished.DurationSeconds != 90 {
		t.Errorf("DurationSeconds = %d, queria 90", finished.DurationSeconds)
	}

	running := byID["s2"]
	if !running.IsRunning {
		t.Error("sessão sem EndedAt deveria estar marcada como em andamento")
	}
	if running.DurationSeconds < 119 {
		t.Errorf("DurationSeconds = %d, esperava ~120 (tempo decorrido até agora)", running.DurationSeconds)
	}
}

// Playtime soma por console, incluindo sessões em andamento — é a base do
// "tempo total de jogo" do perfil, e uma sessão aberta não pode ficar de
// fora só porque ainda não terminou.
func TestLauncherPlaytimeSumsByConsole(t *testing.T) {
	now := time.Now().UTC()

	repo := &fakeSessionRepository{sessions: []Session{
		{ID: "s1", ConsoleID: "ps1", StartedAt: now.Add(-1 * time.Hour), EndedAt: timePtr(now.Add(-30 * time.Minute))},
		{ID: "s2", ConsoleID: "ps1", StartedAt: now.Add(-10 * time.Minute), EndedAt: timePtr(now.Add(-5 * time.Minute))},
		{ID: "s3", ConsoleID: "n64", StartedAt: now.Add(-20 * time.Minute), EndedAt: timePtr(now.Add(-10 * time.Minute))},
	}}
	launcher := &Launcher{sessions: repo}

	totals, err := launcher.Playtime(context.Background())
	if err != nil {
		t.Fatalf("Playtime: %v", err)
	}

	if totals["ps1"] != 30*60+5*60 {
		t.Errorf("playtime ps1 = %d, queria %d", totals["ps1"], 30*60+5*60)
	}
	if totals["n64"] != 10*60 {
		t.Errorf("playtime n64 = %d, queria %d", totals["n64"], 10*60)
	}
}

func timePtr(t time.Time) *time.Time { return &t }

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError + 1}))
}

// Botão "Configurar" (2026-08-04): recusa adapter que o ZeuX nem conhece —
// mensagem precisa nomear o id, não um erro genérico.
func TestLaunchStandaloneRejectsUnknownAdapter(t *testing.T) {
	launcher := &Launcher{registry: NewRegistry(), logger: discardLogger()}

	err := launcher.LaunchStandalone(context.Background(), "emulador-que-nao-existe")
	if err == nil {
		t.Fatal("esperava erro para adapter desconhecido")
	}
}

// Recusa quando o adapter é conhecido mas não está instalado nesta máquina
// — mesma regra de handleLaunch: falha do usuário, mensagem acionável.
func TestLaunchStandaloneRejectsNotInstalled(t *testing.T) {
	registry := NewRegistry()
	def := CustomDefinition{
		ID:         "custom-nao-instalado",
		Name:       "Emulador Fake",
		Consoles:   []string{"nes"},
		BinaryPath: "/caminho/que/nao/existe/emulador",
		Args:       []string{PlaceholderROM},
	}
	adapter, err := NewCustomAdapter(def)
	if err != nil {
		t.Fatalf("NewCustomAdapter: %v", err)
	}
	registry.SetCustom([]Adapter{adapter})
	launcher := &Launcher{registry: registry, logger: discardLogger()}

	if err := launcher.LaunchStandalone(context.Background(), "custom-nao-instalado"); err == nil {
		t.Fatal("esperava erro para emulador não instalado")
	}
}

// Abre de verdade o executável, sem ROM nenhum — /bin/true é usado só
// porque é um binário real, inofensivo e presente em qualquer máquina Unix,
// não porque o teste liga para o que ele faz.
func TestLaunchStandaloneStartsBinaryWithoutROM(t *testing.T) {
	if _, err := os.Stat("/bin/true"); err != nil {
		t.Skip("/bin/true não existe neste ambiente")
	}

	registry := NewRegistry()
	def := CustomDefinition{
		ID:         "custom-true",
		Name:       "Emulador Fake",
		Consoles:   []string{"nes"},
		BinaryPath: "/bin/true",
		Args:       []string{PlaceholderROM},
	}
	adapter, err := NewCustomAdapter(def)
	if err != nil {
		t.Fatalf("NewCustomAdapter: %v", err)
	}
	registry.SetCustom([]Adapter{adapter})
	launcher := &Launcher{registry: registry, logger: discardLogger()}

	if err := launcher.LaunchStandalone(context.Background(), "custom-true"); err != nil {
		t.Fatalf("LaunchStandalone: %v", err)
	}
}
