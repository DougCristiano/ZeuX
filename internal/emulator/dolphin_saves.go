package emulator

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
)

// Saves e retomada no Dolphin (2026-10-09). Fontes lidas no código-fonte
// (github.com/dolphin-emu/dolphin, master):
//
//   - Opção `-s, --save_state <file>`, help "Load the initial save state"
//     (Source/Core/UICommon/CommandLineParse.cpp). O estado é carregado depois
//     do boot (Source/Core/Core/Core.cpp: CpuThread chama State::LoadAs), então
//     convive com `-e <jogo>` na mesma linha.
//   - Estado de save: "<pasta de estados><GameID>.sNN", com NN de dois dígitos
//     (Source/Core/Core/State.cpp, MakeStateFilename: "{}{}.s{:02d}").
//   - Pasta de usuário: portable.txt ao lado do executável manda para
//     <exe>/User (Windows) ou <exe>/user (demais), e o padrão é a pasta
//     normal do SO (Source/Core/UICommon/UICommon.cpp, SetUserDirectory;
//     Source/Core/Common/CommonPaths.h: "Dolphin Emulator", "dolphin-emu",
//     "Library/Application Support/Dolphin"). Pasta de estados = "StateSaves"
//     dentro da pasta de usuário (CommonPaths.h, STATESAVES_DIR).
//
// O que NÃO entra nesta versão, de propósito:
//   - Cartão de memória GameCube (raw ou pasta GCI) e NAND do Wii: o caminho
//     do cartão sai de Config (Dolphin.ini) e a pasta GCI não foi lida até o
//     fim; sem isso, listar o cartão seria chutar. Pendência.
//   - GameID lido do ISO/RVZ: o cabeçalho de disco não foi confirmado contra
//     o código-fonte (Volume.h só declara a interface). O GameID vem do nome
//     do estado de retomada que a sessão gravou — ver DiscIDFor.
//
// Nada disso foi validado contra o binário real do Dolphin; a ressalva de
// docs/decisoes.md (2026-10-09) continua valendo.

// dolphinStateName reconhece "<GameID>.sNN" (o GameID do Dolphin tem 6
// caracteres alfanuméricos). "lastState.sav" e outros arquivos ficam de fora.
var dolphinStateName = regexp.MustCompile(`^([A-Za-z0-9]{6})\.s(\d{2})$`)

// dolphinUserDirFor é a regra de SetUserDirectory, separada do disco para o
// teste travar cada ramo. portableExists diz se há portable.txt ao lado do
// executável; home é o diretório do usuário.
func dolphinUserDirFor(goos, exeDir string, portableExists bool, home string) string {
	switch goos {
	case "windows":
		if portableExists {
			return filepath.Join(exeDir, "User")
		}
		// Caminho normal no Windows: a pasta de documentos do usuário. A
		// tabela de docs/pendencias.md já registrava este caminho; ele não
		// veio do trecho de UICommon.cpp que foi lido.
		return filepath.Join(home, "Documents", "Dolphin Emulator")
	case "darwin":
		if portableExists {
			return filepath.Join(exeDir, "User")
		}
		return filepath.Join(home, "Library", "Application Support", "Dolphin")
	default:
		if portableExists {
			return filepath.Join(exeDir, "user")
		}
		// ~/.dolphin-emu, como o código-fonte mostra para os demais SOs
		// (NORMAL_USER_DIR "dolphin-emu" com ponto na frente). Não foi
		// confirmado se o Dolphin também consulta XDG antes disso.
		return filepath.Join(home, ".dolphin-emu")
	}
}

// dolphinUserDir resolve a pasta de usuário da instalação deste emulador. Sem
// portable.txt e sem pasta home, não há onde procurar: ok=false.
func dolphinUserDir(install Installation) (string, bool) {
	if install.BinaryPath == "" {
		return "", false
	}
	exeDir := filepath.Dir(install.BinaryPath)
	_, statErr := os.Stat(filepath.Join(exeDir, "portable.txt"))
	portable := statErr == nil
	home, homeErr := os.UserHomeDir()
	if !portable && homeErr != nil {
		return "", false
	}
	return dolphinUserDirFor(runtime.GOOS, exeDir, portable, home), true
}

// dolphinStatesDir é a pasta de save states do Dolphin nesta instalação.
func dolphinStatesDir(install Installation) (string, bool) {
	user, ok := dolphinUserDir(install)
	if !ok {
		return "", false
	}
	return filepath.Join(user, "StateSaves"), true
}

// dolphinResumeMatch reconhece um estado de retomada: qualquer "<GameID>.sNN".
// O Dolphin não grava um arquivo de "continuar" próprio; quem decide qual
// estado é "o da última sessão" é recordResumeState (janela de tempo).
func dolphinResumeMatch(name string) bool {
	return dolphinStateName.MatchString(name)
}

// dolphinGameIDFromState tira o GameID do nome de um estado do Dolphin.
func dolphinGameIDFromState(path string) (string, bool) {
	m := dolphinStateName.FindStringSubmatch(filepath.Base(path))
	if m == nil {
		return "", false
	}
	return strings.ToUpper(m[1]), true
}

// findDolphinGameSaves lista os estados de um jogo. Sem GameID conhecido
// devolve ok=false: "não sei onde estão os saves" é diferente de "não há
// nenhum", e a tela precisa saber a diferença.
func findDolphinGameSaves(install Installation, id GameDiscID) (GameSaves, bool) {
	if id.Serial == "" {
		return GameSaves{}, false
	}
	statesDir, ok := dolphinStatesDir(install)
	if !ok {
		return GameSaves{}, false
	}
	out := GameSaves{AdapterID: "dolphin", MemoryCards: []SaveFileInfo{}, SaveStates: []SaveFileInfo{},
		Serial: strings.ToUpper(id.Serial), StatesDir: statesDir}
	entries, err := os.ReadDir(statesDir)
	if err != nil {
		return out, true
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		m := dolphinStateName.FindStringSubmatch(e.Name())
		if m == nil || !strings.EqualFold(m[1], id.Serial) {
			continue
		}
		fi, ok := fileInfo(filepath.Join(statesDir, e.Name()))
		if !ok {
			continue
		}
		n, _ := strconv.Atoi(m[2])
		fi.Slot = intPtr(n)
		out.SaveStates = append(out.SaveStates, fi)
	}
	sort.SliceStable(out.SaveStates, func(i, j int) bool {
		return *out.SaveStates[i].Slot < *out.SaveStates[j].Slot
	})
	return out, true
}
