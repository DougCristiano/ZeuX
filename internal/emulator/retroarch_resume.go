package emulator

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// "Iniciar do zero" e "Continuar" no RetroArch (2026-10-09). Não há flag de
// linha de comando que diga "abra no estado salvo" ou "não abra no estado";
// o que o RetroArch oferece é o carregamento automático de estado, controlado
// pelo retroarch.cfg do usuário. O ZeuX então passa um arquivo de config
// extra com `--appendconfig=FILE`, que tem prioridade sobre o retroarch.cfg
// (ajuda do retroarch.c, RA_OPT_APPENDCONFIG: "Extra config files are loaded
// in, and take priority over config selected in -c (or default)").
//
// A regra de carregamento vem de runloop.c: com entry_state_slot sem valor
// (só `-e` o define, e o ZeuX não usa `-e`), o RetroArch carrega
// `<jogo>.state.auto` ao iniciar se savestate_auto_load estiver ligado
// (https://raw.githubusercontent.com/libretro/RetroArch/master/runloop.c,
// "if (runloop_st->entry_state_slot < 0 && settings->bools.savestate_auto_load)
// command_event_load_auto_state();"). O caminho do arquivo está no comentário
// de savestate_auto_load do retroarch.cfg: "The path is $SRAM_PATH.auto"
// (https://raw.githubusercontent.com/libretro/RetroArch/master/retroarch.cfg).
//
// Nada disso foi validado contra o binário do RetroArch: a ressalva de
// docs/decisoes.md (2026-10-09) continua valendo.

// retroArchModeUnappliedMessage é o aviso quando o lançamento não recebeu o
// arquivo de override. Vale para a prévia, que monta a linha sem gravar nada;
// no lançamento real, quem falha ao gravar registra o próprio aviso (session.go).
const retroArchModeUnappliedMessage = "A escolha entre começar do início e continuar só é aplicada na hora de abrir o jogo; esta prévia mostra a linha sem ela."

// retroArchAutoLoadKey é a chave que liga o carregamento automático de estado.
const retroArchAutoLoadKey = "savestate_auto_load"

// retroArchAutoSaveKey é a chave que liga o salvamento automático ao fechar o
// jogo. Sem ela não nasce `<jogo>.state.auto`, e o "Continuar" nunca habilita.
// Decisão do Douglas (2026-10-09), e vale nos dois modos: é ao sair de uma
// partida iniciada do zero que o primeiro estado para continuar é gravado.
// Fonte: o retroarch.cfg diz "Automatically saves a savestate at the end of
// RetroArch's lifetime. The path is $SRAM_PATH.auto.". O padrão do RetroArch é
// desligado (DEFAULT_SAVESTATE_AUTO_SAVE false em config.def.h), por isso o
// ZeuX precisa ligar explicitamente.
const retroArchAutoSaveKey = "savestate_auto_save"

// retroArchAppendConfigContent devolve o arquivo de config extra para o modo
// pedido. Função pura (sem disco), para o teste travar o conteúdo sem gravar
// nada.
//
// config_save_on_exit = "false" é obrigatório: o help do --appendconfig diz que
// as configurações do arquivo extra são gravadas no config principal "whenever
// it is saved, on exit included", e sem essa linha o savestate_auto_load e o
// savestate_auto_save do modo escolhido vazariam para o retroarch.cfg do
// usuário.
func retroArchAppendConfigContent(mode Mode) []byte {
	autoLoad := "false"
	if mode == ModeResume {
		autoLoad = "true"
	}
	return []byte(fmt.Sprintf(
		"# Gerado pelo ZeuX para o lançamento (%s). Não edite: é regravado a cada jogo.\n"+
			"%s = %q\n"+
			"%s = \"true\"\n"+
			"config_save_on_exit = \"false\"\n",
		string(mode), retroArchAutoLoadKey, autoLoad, retroArchAutoSaveKey))
}

// retroArchAppendConfigPath é o caminho do arquivo de override de cada modo,
// no diretório de dados do ZeuX (AppDataDir), nunca no do usuário. Um arquivo
// por modo: o conteúdo não depende do jogo, então dois jogos em sequência
// reaproveitam o mesmo arquivo.
func retroArchAppendConfigPath(mode Mode) (string, error) {
	dir, err := AppDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "retroarch", "lancamento-"+string(mode)+".cfg"), nil
}

// writeRetroArchAppendConfig grava o arquivo de override do modo e devolve o
// caminho pronto para o Request. Quem chama é o launcher, antes de BuildCommand
// (que é pura e só referencia o caminho).
//
// Recusa caminho com "|": o help do --appendconfig diz que vários arquivos são
// separados por '|', então um caminho com esse caractere seria lido em pedaços.
func writeRetroArchAppendConfig(mode Mode) (string, error) {
	path, err := retroArchAppendConfigPath(mode)
	if err != nil {
		return "", fmt.Errorf("localizando a pasta de dados do ZeuX: %w", err)
	}
	if strings.Contains(path, "|") {
		return "", fmt.Errorf("o caminho da configuração do RetroArch contém '|', que o RetroArch usa como separador")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", fmt.Errorf("criando a pasta da configuração do RetroArch: %w", err)
	}
	if err := os.WriteFile(path, retroArchAppendConfigContent(mode), 0o644); err != nil {
		return "", fmt.Errorf("gravando a configuração do RetroArch: %w", err)
	}
	return path, nil
}

// retroArchAutoStatePath devolve onde o RetroArch grava (e lê ao continuar) o
// estado automático do jogo: "<statesDir>/<nome da ROM>.state.auto". Lê o
// retroarch.cfg real pelo mesmo caminho de saves (retroArchSaveDataDirs), com
// a pasta da ROM como fallback.
//
// Não garante que o arquivo exista: quem decide é quem chama (os dois usos
// olham o disco depois).
func retroArchAutoStatePath(install Installation, romPath string) (string, bool) {
	cfgPath, err := retroArchConfigPath(install)
	if err != nil {
		return "", false
	}
	statesDir := retroArchSaveDataDirs("retroarch", cfgPath).SaveStatesDir
	if statesDir == "" {
		statesDir = filepath.Dir(romPath)
	}
	return filepath.Join(statesDir, retroArchContentName(romPath)+".state.auto"), true
}

// retroArchResumeFile acha o estado automático do jogo se ele foi gravado a
// partir de `since`. Mesma folga de 2 s de newestResumeFile. Arquivo antigo
// (de antes da sessão) não conta: com savestate_auto_save desligado o
// RetroArch não regrava o arquivo, e registrar um estado velho faria o
// "Continuar" aparecer sem ter havido nada salvo nesta partida.
func retroArchResumeFile(install Installation, romPath string, since time.Time) (string, time.Time, bool) {
	path, ok := retroArchAutoStatePath(install, romPath)
	if !ok {
		return "", time.Time{}, false
	}
	info, err := os.Stat(path)
	if err != nil || info.IsDir() || info.ModTime().Before(since.Add(-2*time.Second)) {
		return "", time.Time{}, false
	}
	return path, info.ModTime(), true
}
