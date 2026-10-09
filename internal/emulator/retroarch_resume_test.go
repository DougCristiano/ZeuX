package emulator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Estas flags do RetroArch nunca foram validadas contra o binário real: a
// fonte é o código-fonte (retroarch.c, runloop.c, retroarch.cfg). Os testes
// travam o que o ZeuX monta, não que o RetroArch se comporte assim.

// retroArchWithCore prepara um RetroArch "instalado" com o core do NES no
// lugar, para BuildCommand passar pela busca de core sem nada real no disco.
func retroArchWithCore(t *testing.T) Installation {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	t.Setenv("APPDATA", t.TempDir())
	bin := filepath.Join(t.TempDir(), "retroarch")
	coreDir := filepath.Join(filepath.Dir(bin), "cores")
	if err := os.MkdirAll(coreDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(coreDir, retroArchCores["mesen"]+coreExtension()), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	return install("retroarch", bin)
}

// Trava que "Iniciar do zero" grava savestate_auto_load = "false": sem isso o
// RetroArch carrega <jogo>.state.auto mesmo sem nenhuma flag de estado, se o
// retroarch.cfg do usuário tiver o auto-load ligado.
func TestRetroArchFreshOverrideDisablesAutoLoad(t *testing.T) {
	content := string(retroArchAppendConfigContent(ModeFresh))
	if !strings.Contains(content, `savestate_auto_load = "false"`) {
		t.Errorf("modo fresh deveria desligar o auto-load:\n%s", content)
	}
	if strings.Contains(content, `savestate_auto_load = "true"`) {
		t.Errorf("modo fresh não pode ligar o auto-load:\n%s", content)
	}
}

// Trava que "Continuar" grava savestate_auto_load = "true", que é a condição
// para o RetroArch carregar <jogo>.state.auto na abertura.
func TestRetroArchResumeOverrideEnablesAutoLoad(t *testing.T) {
	content := string(retroArchAppendConfigContent(ModeResume))
	if !strings.Contains(content, `savestate_auto_load = "true"`) {
		t.Errorf("modo resume deveria ligar o auto-load:\n%s", content)
	}
}

// Trava que os dois modos ligam o savestate_auto_save: é ele que grava
// <jogo>.state.auto ao fechar, e sem esse arquivo o "Continuar" nunca habilita.
// Decisão do Douglas (2026-10-09): vale também no "Iniciar do zero", porque é
// ao sair dessa partida que nasce o primeiro estado para continuar depois.
func TestRetroArchOverridesEnableAutoSaveInBothModes(t *testing.T) {
	for _, mode := range []Mode{ModeFresh, ModeResume} {
		content := string(retroArchAppendConfigContent(mode))
		if !strings.Contains(content, `savestate_auto_save = "true"`) {
			t.Errorf("modo %s: deveria ligar o savestate_auto_save:\n%s", mode, content)
		}
	}
}

// Trava que o arquivo de override nunca deixa o savestate_auto_load escapar
// para o retroarch.cfg do usuário: o help do --appendconfig diz que as
// configurações do arquivo extra são gravadas no principal ao salvar, "on exit
// included", a não ser que config_save_on_exit = "false" esteja nele.
func TestRetroArchOverrideNeverWritesBackToUserConfig(t *testing.T) {
	for _, mode := range []Mode{ModeFresh, ModeResume} {
		content := string(retroArchAppendConfigContent(mode))
		if !strings.Contains(content, `config_save_on_exit = "false"`) {
			t.Errorf("modo %s: falta config_save_on_exit = \"false\":\n%s", mode, content)
		}
	}
}

// Trava que o modo escolhido chega ao RetroArch como --appendconfig, antes do
// caminho do jogo (depois dele o RetroArch trataria o arquivo como conteúdo),
// e sem nenhum aviso de "não aplicado" quando o caminho veio.
func TestRetroArchPassesAppendConfigBeforeROM(t *testing.T) {
	inst := retroArchWithCore(t)
	for _, mode := range []Mode{ModeFresh, ModeResume} {
		cmd, err := newRetroArch().BuildCommand(inst, Request{
			ROMPath: "/roms/mario.nes", ConsoleID: "nes", Mode: mode,
			AppendConfigPath: "/dados/zeux/retroarch/lancamento-" + string(mode) + ".cfg",
		})
		if err != nil {
			t.Fatalf("modo %s: %v", mode, err)
		}
		flag := "--appendconfig=/dados/zeux/retroarch/lancamento-" + string(mode) + ".cfg"
		idxFlag, idxROM := -1, -1
		for i, a := range cmd.Argv {
			if a == flag {
				idxFlag = i
			}
			if a == "/roms/mario.nes" {
				idxROM = i
			}
		}
		if idxFlag < 0 {
			t.Errorf("modo %s: falta %s em %v", mode, flag, cmd.Argv)
		} else if idxFlag > idxROM {
			t.Errorf("modo %s: --appendconfig depois do caminho do jogo: %v", mode, cmd.Argv)
		}
		if len(cmd.Unapplied) != 0 {
			t.Errorf("modo %s: com o caminho do override não deveria haver aviso: %v", mode, cmd.Unapplied)
		}
	}
}

// Trava que o ZeuX não usa -e/--entryslot: o slot depende de um número de
// estado que não foi confirmado contra o binário, e o auto-load já cobre o
// "onde a pessoa parou".
func TestRetroArchNeverUsesEntrySlot(t *testing.T) {
	inst := retroArchWithCore(t)
	for _, mode := range []Mode{ModeFresh, ModeResume} {
		cmd, err := newRetroArch().BuildCommand(inst, Request{
			ROMPath: "/roms/mario.nes", ConsoleID: "nes", Mode: mode,
			AppendConfigPath: "/x/lancamento.cfg", StatePath: "/x/mario.state.auto",
		})
		if err != nil {
			t.Fatal(err)
		}
		for _, a := range cmd.Argv {
			if a == "-e" || strings.HasPrefix(a, "--entryslot") {
				t.Errorf("modo %s: não deveria usar slot de entrada: %v", mode, cmd.Argv)
			}
		}
	}
}

// Trava que, sem o caminho do override (prévia, ou gravação que falhou), o
// RetroArch declara a escolha como não aplicada nos dois modos, em vez de
// abrir em silêncio com o retroarch.cfg do usuário.
func TestRetroArchWithoutOverrideDeclaresUnapplied(t *testing.T) {
	inst := retroArchWithCore(t)
	for _, mode := range []Mode{ModeFresh, ModeResume} {
		cmd, err := newRetroArch().BuildCommand(inst, Request{
			ROMPath: "/roms/mario.nes", ConsoleID: "nes", Mode: mode,
		})
		if err != nil {
			t.Fatalf("modo %s: %v", mode, err)
		}
		if strings.Contains(argvString(cmd), "--appendconfig") {
			t.Errorf("modo %s: sem caminho não deveria haver --appendconfig: %v", mode, cmd.Argv)
		}
		if !containsString(cmd.Unapplied, retroArchModeUnappliedMessage) {
			t.Errorf("modo %s: Unapplied = %v, esperava o aviso de escolha não aplicada", mode, cmd.Unapplied)
		}
	}
}

// Trava que o caminho do override não é gravado pelo BuildCommand: ele só
// referencia o arquivo que o launcher preparou. Função pura, então o caminho
// que não existe no disco não pode falhar a montagem.
func TestRetroArchBuildCommandDoesNotTouchOverrideFile(t *testing.T) {
	inst := retroArchWithCore(t)
	missing := filepath.Join(t.TempDir(), "nao-existe", "lancamento.cfg")
	if _, err := newRetroArch().BuildCommand(inst, Request{
		ROMPath: "/roms/mario.nes", ConsoleID: "nes", Mode: ModeResume, AppendConfigPath: missing,
	}); err != nil {
		t.Fatalf("BuildCommand não pode falhar por causa do arquivo: %v", err)
	}
	if _, err := os.Stat(missing); err == nil {
		t.Errorf("BuildCommand gravou o arquivo de override")
	}
}

// Trava que o arquivo de override vai para a pasta de dados do ZeuX (e não
// para a do usuário), e que cada modo tem o seu arquivo com o conteúdo certo.
func TestWriteRetroArchAppendConfigUsesZeuXDataDir(t *testing.T) {
	root := t.TempDir()
	t.Setenv("HOME", root)
	t.Setenv("XDG_CONFIG_HOME", root)
	t.Setenv("APPDATA", root)

	path, err := writeRetroArchAppendConfig(ModeResume)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(path, root) || !strings.Contains(path, "ZeuX") {
		t.Errorf("override fora da pasta do ZeuX: %s", path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != string(retroArchAppendConfigContent(ModeResume)) {
		t.Errorf("conteúdo gravado diferente do esperado:\n%s", data)
	}
}

// Trava que um caminho com '|' é recusado: o RetroArch separa vários arquivos
// de --appendconfig por esse caractere, e o caminho sairia partido. Sem
// erro, o lançamento cairia no aviso de não aplicado sem explicar o motivo.
func TestWriteRetroArchAppendConfigRefusesPipeInPath(t *testing.T) {
	root := filepath.Join(t.TempDir(), "a|b")
	t.Setenv("HOME", root)
	t.Setenv("XDG_CONFIG_HOME", root)
	t.Setenv("APPDATA", root)

	if _, err := writeRetroArchAppendConfig(ModeFresh); err == nil {
		t.Error("caminho com '|' deveria ser recusado")
	}
}

// Trava que o RetroArch só conta como "Continuar" disponível quando o estado
// automático foi gravado durante a sessão: um <jogo>.state.auto antigo, de
// antes da sessão, não pode virar um "onde você parou" que ninguém salvou.
func TestRetroArchResumeFileOnlyCountsWhenWrittenInSession(t *testing.T) {
	dir := t.TempDir()
	cfg := filepath.Join(dir, "retroarch.cfg")
	states := filepath.Join(dir, "estados")
	if err := os.MkdirAll(states, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cfg, []byte("savestate_directory = \""+states+"\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	orig := retroArchConfigPath
	retroArchConfigPath = func(Installation) (string, error) { return cfg, nil }
	defer func() { retroArchConfigPath = orig }()

	auto := filepath.Join(states, "mario.state.auto")
	if err := os.WriteFile(auto, []byte("estado"), 0o644); err != nil {
		t.Fatal(err)
	}
	started := time.Now().Add(-time.Minute)
	inst := install("retroarch", "/opt/retroarch")

	if _, _, ok := retroArchResumeFile(inst, "/roms/mario.nes", started); !ok {
		t.Fatal("estado gravado durante a sessão deveria ser reconhecido")
	}

	old := time.Now().Add(-24 * time.Hour)
	if err := os.Chtimes(auto, old, old); err != nil {
		t.Fatal(err)
	}
	if _, _, ok := retroArchResumeFile(inst, "/roms/mario.nes", started); ok {
		t.Error("estado de antes da sessão não pode contar como retomada")
	}
}

// Trava que o modo "Continuar" no RetroArch é aceito pelo launcher (antes
// SupportsResume recusava o emulador e o pedido virava erro).
func TestRetroArchSupportsResume(t *testing.T) {
	if !SupportsResume("retroarch") {
		t.Error("RetroArch deveria aceitar Continuar")
	}
}
