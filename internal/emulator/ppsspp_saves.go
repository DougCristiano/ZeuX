package emulator

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Saves e retomada do PPSSPP por jogo (2026-10-09). Fontes lidas no código-fonte
// oficial do PPSSPP (github.com/hrydgard/ppsspp), não observadas com o binário:
//
//   - Pasta do Memory Stick: <memstick>/PSP/ (Common/File/PathBrowser ou
//     Core/Util/PathUtil.cpp, GetSysDirectory). Saves em PSP/SAVEDATA, states em
//     PSP/PPSSPP_STATE. Se a própria pasta escolhida já se chamar PSP, ela não
//     ganha outro PSP dentro (mesmo trecho).
//   - Onde fica o Memory Stick no Windows: ao lado do executável, na pasta
//     "memstick"; se existir "installed.txt" ao lado do executável, ele vale:
//     vazio = %USERPROFILE%\Documents\PPSSPP, com caminho = esse caminho
//     (https://www.ppsspp.org/docs/getting-started/save-data-and-storage-windows/).
//     Linux e macOS não foram confirmados — o ZeuX não chuta.
//   - Nome do state: <DISC_ID>_<DISC_VERSION>_<slot>.ppst (Core/SaveState.cpp,
//     GenerateFullDiscId, GenerateSaveSlotFilename, STATE_EXTENSION "ppst").
//     Estado "desfazer" (.undo.ppst) e load_undo.ppst não casam com o padrão.
//   - O DISC_ID é a identificação do jogo (ex.: ULUS10001); o ZeuX o tira do
//     nome do state gravado na sessão, sem ler o PARAM.SFO de dentro do ISO.

// ppssppStateName reconhece "<DISC_ID>_<versão>_<slot>.ppst". A versão é "1.00"
// na maioria dos discos; o padrão só aceita números com ponto para não confundir
// com outro arquivo qualquer.
var ppssppStateName = regexp.MustCompile(`^([A-Z]{4}\d{5})_(\d+\.\d+)_(\d+)\.ppst$`)

// ppssppMemStickFromMarker decide a pasta do Memory Stick do PPSSPP no Windows a
// partir do installed.txt ao lado do executável. Função pura: recebe o conteúdo
// já lido (marker nil = arquivo ausente), para o teste não depender do disco.
func ppssppMemStickFromMarker(exeDir string, marker []byte, present bool, home string) (string, bool) {
	if !present {
		return filepath.Join(exeDir, "memstick"), true
	}
	if p := strings.TrimSpace(string(marker)); p != "" {
		return p, true
	}
	if home == "" {
		return "", false
	}
	return filepath.Join(home, "Documents", "PPSSPP"), true
}

// ppssppMemStickDir resolve o Memory Stick do PPSSPP instalado. Só o Windows
// tem o caminho confirmado; nos demais devolve ok=false e as listas de saves
// ficam "não sei".
func ppssppMemStickDir(install Installation) (string, bool) {
	if runtime.GOOS != "windows" || install.BinaryPath == "" {
		return "", false
	}
	exeDir := filepath.Dir(install.BinaryPath)
	raw, err := os.ReadFile(filepath.Join(exeDir, "installed.txt"))
	present := err == nil
	if err != nil && !os.IsNotExist(err) {
		return "", false
	}
	home, _ := os.UserHomeDir()
	return ppssppMemStickFromMarker(exeDir, raw, present, home)
}

// ppssppPSPDir é a pasta PSP dentro do Memory Stick (GetSysDirectory do
// PPSSPP, Core/Util/PathUtil.cpp).
func ppssppPSPDir(memstick string) string {
	if strings.EqualFold(filepath.Base(memstick), "PSP") {
		return memstick
	}
	return filepath.Join(memstick, "PSP")
}

// ppssppStateSlot reconhece um state do jogo `discID` e devolve o slot. ok=false
// para o estado de outro jogo e para os arquivos de desfazer.
func ppssppStateSlot(file, discID string) (slot *int, ok bool) {
	m := ppssppStateName.FindStringSubmatch(file)
	if m == nil || !strings.EqualFold(m[1], discID) {
		return nil, false
	}
	n, err := strconv.Atoi(m[3])
	if err != nil {
		return nil, false
	}
	return intPtr(n), true
}

// findPPSSPPGameSaves lista saves e states de um jogo. Sem DISC_ID conhecido
// (nenhum state gravado ainda) não há como achar as pastas: ok=false.
func findPPSSPPGameSaves(install Installation, discID string) (GameSaves, bool) {
	if discID == "" {
		return GameSaves{}, false
	}
	memstick, ok := ppssppMemStickDir(install)
	if !ok {
		return GameSaves{}, false
	}
	return findPPSSPPSavesIn(memstick, discID), true
}

// findPPSSPPSavesIn faz a busca de findPPSSPPGameSaves a partir de uma pasta de
// Memory Stick já resolvida. Separada para o teste poder usar uma pasta
// temporária em qualquer sistema operacional.
func findPPSSPPSavesIn(memstick, discID string) GameSaves {
	psp := ppssppPSPDir(memstick)
	cardsDir := filepath.Join(psp, "SAVEDATA")
	statesDir := filepath.Join(psp, "PPSSPP_STATE")
	out := GameSaves{
		AdapterID:              "ppsspp",
		MemoryCards:            []SaveFileInfo{},
		SaveStates:             []SaveFileInfo{},
		MemoryCardsApproximate: true,
		Serial:                 discID,
		CardsDir:               cardsDir,
		StatesDir:              statesDir,
	}

	// A pasta de save do PSP começa com o ID do jogo. Só arquivos soltos entram,
	// pelo mesmo motivo de rpcs3_saves.go: o backup é arquivo a arquivo.
	if entries, err := os.ReadDir(cardsDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() || !strings.HasPrefix(strings.ToUpper(e.Name()), strings.ToUpper(discID)) {
				continue
			}
			dir := filepath.Join(cardsDir, e.Name())
			files, err := os.ReadDir(dir)
			if err != nil {
				continue
			}
			for _, f := range files {
				if f.IsDir() {
					continue
				}
				if fi, ok := fileInfo(filepath.Join(dir, f.Name())); ok {
					out.MemoryCards = append(out.MemoryCards, fi)
				}
			}
		}
	}

	if entries, err := os.ReadDir(statesDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			slot, ok := ppssppStateSlot(e.Name(), discID)
			if !ok {
				continue
			}
			if fi, ok := fileInfo(filepath.Join(statesDir, e.Name())); ok {
				fi.Slot = slot
				out.SaveStates = append(out.SaveStates, fi)
			}
		}
	}
	sortStates(out.SaveStates)
	return out
}

// ppssppResumeFile acha o state gravado durante a sessão e devolve também o
// DISC_ID do jogo, lido do nome do arquivo. Só states escritos depois de
// `since` contam: um state antigo de outro jogo não pode virar "Continuar".
func ppssppResumeFile(install Installation, since time.Time) (path string, savedAt time.Time, discID string, ok bool) {
	memstick, ok := ppssppMemStickDir(install)
	if !ok {
		return "", time.Time{}, "", false
	}
	return ppssppResumeIn(memstick, since)
}

// ppssppResumeIn é a busca de ppssppResumeFile a partir de uma pasta de Memory
// Stick já resolvida (mesmo motivo de findPPSSPPSavesIn).
func ppssppResumeIn(memstick string, since time.Time) (path string, savedAt time.Time, discID string, ok bool) {
	dir := filepath.Join(ppssppPSPDir(memstick), "PPSSPP_STATE")
	path, savedAt, ok = newestResumeFile(dir, func(name string) bool {
		return ppssppStateName.MatchString(name)
	}, since)
	if !ok {
		return "", time.Time{}, "", false
	}
	m := ppssppStateName.FindStringSubmatch(filepath.Base(path))
	return path, savedAt, m[1], true
}

// recordPPSSPPDiscID guarda o DISC_ID que a sessão do PPSSPP revelou, para que
// a tela do jogo ache os saves mesmo sem o state de retomada (ex.: o state
// foi apagado pela pessoa, mas o ID continua valendo).
func (l *Launcher) recordPPSSPPDiscID(session Session, discID string) {
	repo, ok := l.sessions.(DiscIDRepository)
	if !ok || discID == "" {
		return
	}
	if err := repo.RecordDiscID(context.Background(), GameDiscID{
		ROMPath: session.ROMPath, AdapterID: "ppsspp", Serial: discID,
	}); err != nil {
		l.logger.Warn("não foi possível guardar o ID do jogo do PPSSPP", "sessao", session.ID, "erro", err)
	}
}
