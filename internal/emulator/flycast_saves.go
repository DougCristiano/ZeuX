package emulator

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Saves do Flycast por jogo (2026-10-09). Lido no código-fonte do Flycast
// (github.com/flyinghead/flycast), não observado com o binário rodando — a
// pasta "data" ao lado do executável é a única parte verificada ao vivo (ver
// flycastBiosDir em bios_dir.go).
//
//   - Pasta de dados e de config: ao lado do executável, no Windows
//     (core/windows/winmain.cpp, setupPath). O emu.cfg fica nessa pasta
//     (core/cfg/cfg.cpp, open).
//   - Save states (core/oslib/oslib.cpp, getSavestatePath): "<nome da ROM sem
//     a última extensão>.state" para o slot 0 e "<nome>_N.state" para os slots
//     1 a 9. O nome é o do arquivo do jogo (settings.content.fileName), e
//     get_file_basename corta na última extensão (core/stdclass.h).
//   - Cartão (VMU): com Dreamcast.PerGameVmu ligado (o padrão do código), o
//     arquivo leva o código do disco (<gameId>_vmu_save_A1.bin), e o código
//     vem do disco, que o ZeuX não lê. Por isso o cartão só é listado quando a
//     opção está desligada no emu.cfg; com ela ligada, o ZeuX declara o cartão
//     como desconhecido (memory_cards_unknown).
//   - Retomada: o Flycast abre num estado com "-config Dreamcast:AutoLoadState=yes"
//     e escolhe o slot com "-config Dreamcast:SavestateSlot=N" (core/cfg/option.cpp;
//     core/emulator.cpp, carregamento na abertura). Ver flycastStateSlot e
//     BuildCommand em standalone.go.

// flycastMaxSlot é o último slot de save state (a interface do Flycast usa 0 a 9).
const flycastMaxSlot = 9

// flycastStateName monta o nome do arquivo de um slot (getSavestatePath).
func flycastStateName(base string, slot int) string {
	if slot == 0 {
		return base + ".state"
	}
	return base + "_" + strconv.Itoa(slot) + ".state"
}

// flycastStateSlot diz qual slot é um arquivo de estado deste jogo. O nome da
// ROM vem do próprio pedido: sem ele, "Crazy_1.state" poderia ser o slot 0 de
// "Crazy_1" ou o slot 1 de "Crazy".
func flycastStateSlot(stateName, romPath string) (int, bool) {
	base := romFileBase(romPath)
	if stateName == base+".state" {
		return 0, true
	}
	prefix, suffix := base+"_", ".state"
	if !strings.HasPrefix(stateName, prefix) || !strings.HasSuffix(stateName, suffix) {
		return 0, false
	}
	mid := stateName[len(prefix) : len(stateName)-len(suffix)]
	n, err := strconv.Atoi(mid)
	if err != nil || n < 1 || n > flycastMaxSlot || strconv.Itoa(n) != mid {
		return 0, false
	}
	return n, true
}

// flycastEmuCfg lê o emu.cfg ao lado do executável. Sem ele (ou sem o caminho
// do executável), devolve um arquivo vazio: o chamador usa os padrões do
// Flycast, sem fingir que leu a configuração.
func flycastEmuCfg(install Installation) (*iniFile, bool) {
	if _, ok := flycastBiosDir(install); !ok {
		return parseINI(nil), false
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(install.BinaryPath), "emu.cfg"))
	if err != nil {
		return parseINI(nil), false
	}
	return parseINI(data), true
}

// flycastStateDirs são as pastas onde o Flycast procura states: a de dados e
// as de Dreamcast.SavestatePath (separadas por ';', como o próprio Flycast lê).
func flycastStateDirs(install Installation, cfg *iniFile) []string {
	dataDir, ok := flycastBiosDir(install)
	if !ok {
		return nil
	}
	dirs := []string{dataDir}
	if raw, has := cfg.get("Dreamcast", "SavestatePath"); has {
		for _, p := range strings.Split(raw, ";") {
			if p = strings.TrimSpace(p); p != "" {
				dirs = append(dirs, p)
			}
		}
	}
	return dirs
}

// flycastTruthy segue Config::getBool do Flycast: só "yes", "true", "on" e "1"
// ligam uma opção booleana; qualquer outro valor é desligado.
func flycastTruthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "yes", "true", "on", "1":
		return true
	}
	return false
}

// flycastVMU decide o que mostrar como cartão. Com PerGameVmu ligado (o padrão)
// ou com Dreamcast.VMUPath apontado, o arquivo do jogo não é localizável sem o
// código do disco: devolve unknown=true e nenhuma lista.
func flycastVMU(install Installation, cfg *iniFile) (cards []SaveFileInfo, shared bool, unknown bool) {
	dataDir, ok := flycastBiosDir(install)
	if !ok {
		return nil, false, true
	}
	if v, has := cfg.get("Dreamcast", "VMUPath"); has && strings.TrimSpace(v) != "" {
		return nil, false, true
	}
	perGame := true
	if v, has := cfg.get("config", "PerGameVmu"); has {
		perGame = flycastTruthy(v)
	}
	if perGame {
		return nil, false, true
	}
	if fi, ok := fileInfo(filepath.Join(dataDir, "vmu_save_A1.bin")); ok {
		return []SaveFileInfo{fi}, true, false
	}
	return []SaveFileInfo{}, true, false
}

// findFlycastGameSaves lista os states do jogo e o cartão (quando é localizável).
// Sem a pasta de dados (não Windows, ou binário desconhecido) devolve ok=false.
func findFlycastGameSaves(install Installation, romPath string) (GameSaves, bool) {
	dataDir, ok := flycastBiosDir(install)
	if !ok {
		return GameSaves{}, false
	}
	cfg, _ := flycastEmuCfg(install)
	cards, shared, unknown := flycastVMU(install, cfg)
	out := GameSaves{
		AdapterID:          "flycast",
		MemoryCards:        cards,
		MemoryCardShared:   shared,
		MemoryCardsUnknown: unknown,
		SaveStates:         []SaveFileInfo{},
		CardsDir:           dataDir,
		StatesDir:          dataDir,
	}
	if out.MemoryCards == nil {
		out.MemoryCards = []SaveFileInfo{}
	}
	base := romFileBase(romPath)
	for _, dir := range flycastStateDirs(install, cfg) {
		for slot := 0; slot <= flycastMaxSlot; slot++ {
			if fi, ok := fileInfo(filepath.Join(dir, flycastStateName(base, slot))); ok {
				fi.Slot = intPtr(slot)
				out.SaveStates = append(out.SaveStates, fi)
			}
		}
	}
	sortStates(out.SaveStates)
	return out, true
}

// flycastResumeFile acha o estado de retomada deste jogo: o mais novo entre os
// slots dele, gravado a partir de `since` (com a mesma folga de 2 s das outras
// retomadas). Um estado de antes da sessão não conta.
func flycastResumeFile(install Installation, romPath string, since time.Time) (string, time.Time, bool) {
	cfg, _ := flycastEmuCfg(install)
	var bestPath string
	var bestTime time.Time
	for _, dir := range flycastStateDirs(install, cfg) {
		for slot := 0; slot <= flycastMaxSlot; slot++ {
			p := filepath.Join(dir, flycastStateName(romFileBase(romPath), slot))
			info, err := os.Stat(p)
			if err != nil || info.IsDir() || info.ModTime().Before(since.Add(-2*time.Second)) {
				continue
			}
			if info.ModTime().After(bestTime) {
				bestPath, bestTime = p, info.ModTime()
			}
		}
	}
	return bestPath, bestTime, bestPath != ""
}
