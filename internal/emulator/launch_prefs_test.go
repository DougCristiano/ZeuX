package emulator

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/doufl/zeux/internal/store"
)

// Testes de "Salvar estado ao fechar o jogo" (decisão do Douglas, 2026-10-09).
// Nada aqui foi validado contra o binário dos emuladores: os testes travam o
// que o ZeuX monta e grava, não que o emulador se comporte assim.

// launcherWithDB monta o lançamento com o banco real (migrações incluídas) em
// uma pasta temporária, para que a preferência passe pelo SQLite de verdade.
func launcherWithDB(t *testing.T) *Launcher {
	t.Helper()
	db, err := store.OpenAt(filepath.Join(t.TempDir(), "zeux.db"))
	if err != nil {
		t.Fatalf("OpenAt: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewLauncher(nil, NewSQLiteSessions(db), fakeUserConfig{}, discardLogger())
}

// Trava o padrão do produto: sem nenhuma escolha guardada, RetroArch e Flycast
// salvam o estado ao fechar o jogo.
func TestAutoSaveStateDefaultsToOn(t *testing.T) {
	l := launcherWithDB(t)
	for _, id := range []string{"retroarch", "flycast"} {
		if !l.AutoSaveStateFor(context.Background(), id) {
			t.Errorf("%s: sem escolha guardada, o salvamento ao fechar deveria estar ligado", id)
		}
	}
}

// Trava que desligar a opção grava "false" e que o lançamento passa a ver isso,
// e que religar volta ao ligado (sem linha extra no banco).
func TestAutoSaveStateOffIsStoredAndRead(t *testing.T) {
	l := launcherWithDB(t)
	ctx := context.Background()
	if err := l.SetStoredEmulatorSettings(ctx, "flycast", map[string]string{AutoSaveStateID: "false"}); err != nil {
		t.Fatalf("desligar: %v", err)
	}
	if l.AutoSaveStateFor(ctx, "flycast") {
		t.Error("depois de desligar, o lançamento deveria ver o salvamento desligado")
	}
	if l.AutoSaveStateFor(ctx, "retroarch") != true {
		t.Error("desligar o Flycast não pode mexer no RetroArch")
	}
	stored, err := l.StoredEmulatorSettings(ctx, "flycast")
	if err != nil || len(stored) != 1 || stored[0].Value != "false" {
		t.Fatalf("a tela deveria ler false: %+v, %v", stored, err)
	}
	if err := l.SetStoredEmulatorSettings(ctx, "flycast", map[string]string{AutoSaveStateID: "true"}); err != nil {
		t.Fatalf("religar: %v", err)
	}
	if !l.AutoSaveStateFor(ctx, "flycast") {
		t.Error("religar deveria voltar ao salvamento ligado")
	}
}

// Trava que uma chave fora do catálogo, ou um valor que não é true/false, recusa
// o pedido inteiro: nada é gravado pela metade.
func TestStoredSettingsRefusesUnknownOptionOrValue(t *testing.T) {
	l := launcherWithDB(t)
	ctx := context.Background()
	if err := l.SetStoredEmulatorSettings(ctx, "retroarch", map[string]string{"Main.SaveStateOnExit": "false"}); err == nil {
		t.Error("chave de arquivo de outro emulador deveria ser recusada")
	}
	if err := l.SetStoredEmulatorSettings(ctx, "retroarch", map[string]string{AutoSaveStateID: "talvez"}); err == nil {
		t.Error("valor fora de true/false deveria ser recusado")
	}
	if !l.AutoSaveStateFor(ctx, "retroarch") {
		t.Error("pedido recusado não pode ter mudado a opção")
	}
}

// Trava que os emuladores que guardam a opção no próprio arquivo não passam
// pelo banco: o lançamento sempre os vê ligados, e quem decide é o arquivo.
func TestFileEmulatorsDoNotReadZeuXPreference(t *testing.T) {
	l := launcherWithDB(t)
	for _, id := range []string{"duckstation", "pcsx2"} {
		if !l.AutoSaveStateFor(context.Background(), id) {
			t.Errorf("%s: a opção mora no arquivo do emulador, não no banco do ZeuX", id)
		}
		if _, err := l.StoredEmulatorSettings(context.Background(), id); err == nil {
			t.Errorf("%s: não deveria devolver catálogo guardado no ZeuX", id)
		}
	}
}

// Trava que o Flycast recebe o modo de salvamento como -config transitório em
// AMBOS os modos: sem a linha, nenhum estado de retomada seria gravado ao fechar.
func TestFlycastStatesAutoSaveFlagInBothModes(t *testing.T) {
	for _, mode := range []Mode{ModeFresh, ModeResume} {
		req := Request{ROMPath: "/jogos/dc/Jogo.gdi", ConsoleID: "dreamcast", Mode: mode}
		on, err := newFlycast().BuildCommand(install("flycast", "/opt/flycast/flycast.exe"), req)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(argvString(on), "-config Dreamcast:AutoSaveState=yes") {
			t.Errorf("modo %s ligado: falta AutoSaveState=yes: %s", mode, argvString(on))
		}
		req.AutoSaveStateOff = true
		off, err := newFlycast().BuildCommand(install("flycast", "/opt/flycast/flycast.exe"), req)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(argvString(off), "-config Dreamcast:AutoSaveState=no") {
			t.Errorf("modo %s desligado: falta AutoSaveState=no: %s", mode, argvString(off))
		}
		if strings.Contains(argvString(off), "AutoSaveState=yes") {
			t.Errorf("modo %s desligado não pode ligar o salvamento: %s", mode, argvString(off))
		}
	}
}

// Trava que o override do RetroArch leva a escolha do usuário para
// savestate_auto_save, nos dois sentidos, e que o valor vai sempre explícito.
func TestRetroArchAppendConfigCarriesAutoSaveChoice(t *testing.T) {
	on := string(retroArchAppendConfigContent(ModeResume, true))
	if !strings.Contains(on, `savestate_auto_save = "true"`) {
		t.Errorf("ligado deveria gravar true:\n%s", on)
	}
	off := string(retroArchAppendConfigContent(ModeResume, false))
	if !strings.Contains(off, `savestate_auto_save = "false"`) {
		t.Errorf("desligado deveria gravar false, sobrepondo o retroarch.cfg:\n%s", off)
	}
	if strings.Contains(off, `savestate_auto_save = "true"`) {
		t.Errorf("desligado não pode deixar o auto-save ligado:\n%s", off)
	}
}

// Trava o padrão ligado no catálogo dos dois emuladores de arquivo: a tela
// mostra "ligado" antes de a pessoa mexer, e os dois usam o mesmo ID.
func TestFileCatalogsExposeAutoSaveDefaultOn(t *testing.T) {
	for name, catalog := range map[string][]EmulatorSetting{
		"duckstation": duckStationSettingsCatalog,
		"pcsx2":       pcsx2SettingsCatalog,
	} {
		found := false
		for _, s := range catalog {
			if s.ID == AutoSaveStateID {
				found = true
				if s.Default != "true" || s.Kind != SettingBool {
					t.Errorf("%s: a opção de salvar estado deveria ser bool com padrão true: %+v", name, s)
				}
			}
		}
		if !found {
			t.Errorf("%s: falta a opção %s no catálogo", name, AutoSaveStateID)
		}
	}
}

// Trava que o DuckStation ganha SaveStateOnExit ligado quando a chave falta, e
// que um "desligado" escolhido pela pessoa sobrevive ao próximo lançamento.
func TestDuckStationMergeKeepsSaveStateOnExitChoice(t *testing.T) {
	got := string(MergeDuckStationDefaults([]byte("[Main]\nSaveStateOnExit = true\n"), false))
	if !strings.Contains(got, "SaveStateOnExit = true") {
		t.Errorf("chave ausente deveria ficar ligada:\n%s", got)
	}
	off := string(MergeDuckStationDefaults([]byte("[Main]\nSaveStateOnExit = false\n"), false))
	if !strings.Contains(off, "SaveStateOnExit = false") || strings.Contains(off, "SaveStateOnExit = true") {
		t.Errorf("escolha de desligar foi desfeita no lançamento:\n%s", off)
	}
}

// Trava que o PCSX2 liga SaveStateOnShutdown quando a chave falta (o padrão do
// PCSX2 é desligado) e respeita um desligado escolhido na tela.
func TestPCSX2MergeSavesStateOnShutdownByDefault(t *testing.T) {
	got := string(MergePCSX2Defaults([]byte("[UI]\nSettingsVersion = 1\n"), false))
	if !strings.Contains(got, "SaveStateOnShutdown = true") {
		t.Errorf("chave ausente deveria ficar ligada:\n%s", got)
	}
	off := string(MergePCSX2Defaults([]byte("[EmuCore]\nSaveStateOnShutdown = false\n"), false))
	if !strings.Contains(off, "SaveStateOnShutdown = false") || strings.Contains(off, "SaveStateOnShutdown = true") {
		t.Errorf("escolha de desligar foi desfeita no lançamento:\n%s", off)
	}
}
