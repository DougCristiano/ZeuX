package emulator

import (
	"encoding/binary"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
)

// Saves do Azahar por jogo (2026-10-09). Azahar é o fork do Citra, e o layout
// vem do código-fonte dele (github.com/azahar-emu/azahar), lido em 2026-10-09 —
// não observado com o binário rodando, ver docs/decisoes.md.
//
//   - Pasta do usuário (src/common/file_util.cpp, SetUserPath): no Windows,
//     "user" ao lado do executável se essa pasta existir; senão
//     %AppData%\Azahar\. Linux e macOS usam XDG/Library e não foram lidos.
//   - Save de jogo (src/core/file_sys/archive_source_sd_savedata.cpp,
//     GetSaveDataPath): <usuário>\sdmc\Nintendo 3DS\<id0>\<id1>\title\<alto>\
//     <baixo>\data\00000001\, com alto e baixo as metades do ID do programa em
//     8 dígitos hex minúsculos. <id0> e <id1> não aparecem como constantes no
//     código lido, então a pasta é procurada entre as que existem.
//   - Save states (src/core/savestate.cpp, GetSaveStatePath):
//     <usuário>\states\<ID do programa, 16 hex MAIÚSCULOS>.<slot, 2 dígitos>.cst
//   - ID do programa: lido do cabeçalho do .3ds. Offsets em
//     src/core/file_sys/ncch_container.h: NCSD com a tabela de partições em
//     0x120 (unidade de 0x200 bytes); NCCH com program_id em 0x118. O .cia
//     guarda o ID no TMD e não é lido aqui — para ele o ZeuX declara desconhecido.

// azaharMediaUnit é a unidade de endereçamento do NCSD (kBlockSize em
// ncch_container.cpp).
const azaharMediaUnit = 0x200

// azaharStateName reconhece "<ID>.<slot>.cst". O ID sai em maiúsculas porque o
// Azahar formata com {:016X}.
var azaharStateName = regexp.MustCompile(`^([0-9A-F]{16})\.(\d{2})\.cst$`)

// azaharProgramID lê o ID do programa de um .3ds (NCSD, partição 0) ou de um
// NCCH direto. Lê só os bytes do cabeçalho: o arquivo do jogo pode ter gigabytes.
func azaharProgramID(r io.ReaderAt) (uint64, bool) {
	var magic [4]byte
	if _, err := r.ReadAt(magic[:], 0x100); err != nil {
		return 0, false
	}
	var ncch int64
	switch string(magic[:]) {
	case "NCSD":
		var off [4]byte
		if _, err := r.ReadAt(off[:], 0x120); err != nil {
			return 0, false
		}
		ncch = int64(binary.LittleEndian.Uint32(off[:])) * azaharMediaUnit
		if _, err := r.ReadAt(magic[:], ncch+0x100); err != nil || string(magic[:]) != "NCCH" {
			return 0, false
		}
	case "NCCH":
	default:
		return 0, false
	}
	var id [8]byte
	if _, err := r.ReadAt(id[:], ncch+0x118); err != nil {
		return 0, false
	}
	pid := binary.LittleEndian.Uint64(id[:])
	return pid, pid != 0
}

// azaharROMProgramID abre o .3ds e lê o ID do programa. Só o .3ds: o .cia
// fica de fora de propósito (ver o cabeçalho deste arquivo).
func azaharROMProgramID(romPath string) (uint64, bool) {
	if strings.ToLower(filepath.Ext(romPath)) != ".3ds" {
		return 0, false
	}
	f, err := os.Open(romPath)
	if err != nil {
		return 0, false
	}
	defer f.Close()
	return azaharProgramID(f)
}

// azaharUserDir devolve a pasta do usuário do Azahar. Só o Windows foi lido:
// "user" ao lado do executável tem prioridade, senão %AppData%\Azahar. Nos
// outros sistemas o caminho depende de XDG e fica sem apontamento.
func azaharUserDir(install Installation) (string, bool) {
	if runtime.GOOS != "windows" || install.BinaryPath == "" {
		return "", false
	}
	return azaharUserDirIn(filepath.Dir(install.BinaryPath), os.Getenv("APPDATA"))
}

// azaharUserDirIn é a regra de azaharUserDir sem depender do sistema: recebe a
// pasta do executável e a do AppData, para o teste rodar em qualquer SO.
func azaharUserDirIn(exeDir, appData string) (string, bool) {
	local := filepath.Join(exeDir, "user")
	if st, err := os.Stat(local); err == nil && st.IsDir() {
		return local, true
	}
	if appData == "" {
		return "", false
	}
	return filepath.Join(appData, "Azahar"), true
}

// azaharSaveDataDir procura a pasta de save do jogo entre os <id0>/<id1> que
// existem dentro de sdmc\Nintendo 3DS. Sem nenhuma, o jogo ainda não tem save.
func azaharSaveDataDir(userDir string, pid uint64) (string, bool) {
	titles := filepath.Join(userDir, "sdmc", "Nintendo 3DS")
	rel := filepath.Join("title", fmt.Sprintf("%08x", uint32(pid>>32)), fmt.Sprintf("%08x", uint32(pid)), "data", "00000001")
	id0s, err := os.ReadDir(titles)
	if err != nil {
		return "", false
	}
	for _, a := range id0s {
		if !a.IsDir() {
			continue
		}
		id1s, err := os.ReadDir(filepath.Join(titles, a.Name()))
		if err != nil {
			continue
		}
		for _, b := range id1s {
			if !b.IsDir() {
				continue
			}
			dir := filepath.Join(titles, a.Name(), b.Name(), rel)
			if st, err := os.Stat(dir); err == nil && st.IsDir() {
				return dir, true
			}
		}
	}
	return "", false
}

// azaharSaveFiles lista todos os arquivos da pasta de save, em qualquer
// subpasta. O save do 3DS é uma árvore, não um arquivo único; cada arquivo
// vira uma entrada, e o backup do ZeuX copia uma a uma.
func azaharSaveFiles(dir string) []SaveFileInfo {
	out := []SaveFileInfo{}
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if fi, ok := fileInfo(p); ok {
			out = append(out, fi)
		}
		return nil
	})
	return out
}

// azaharStateSlot diz o slot de um arquivo de save state deste jogo. O nome
// precisa casar com o ID do programa — um estado de outro jogo na mesma pasta
// não entra.
func azaharStateSlot(name string, pid uint64) (int, bool) {
	m := azaharStateName.FindStringSubmatch(name)
	if m == nil || m[1] != fmt.Sprintf("%016X", pid) {
		return 0, false
	}
	n, err := strconv.Atoi(m[2])
	if err != nil {
		return 0, false
	}
	return n, true
}

// findAzaharGameSaves localiza o save e os states de um .3ds no Azahar. Sem o
// ID do programa (ROM que não é .3ds, ou cabeçalho ilegível) devolve ok=false.
func findAzaharGameSaves(install Installation, romPath string) (GameSaves, bool) {
	userDir, ok := azaharUserDir(install)
	if !ok {
		return GameSaves{}, false
	}
	pid, ok := azaharROMProgramID(romPath)
	if !ok {
		return GameSaves{}, false
	}
	statesDir := filepath.Join(userDir, "states")
	out := GameSaves{
		AdapterID:   "azahar",
		MemoryCards: []SaveFileInfo{},
		SaveStates:  []SaveFileInfo{},
		// O ID do programa é o identificador do jogo aqui, como o serial no
		// PS2: a tela usa o campo para saber que os states já podem ser listados.
		Serial:    fmt.Sprintf("%016X", pid),
		StatesDir: statesDir,
	}
	if dir, found := azaharSaveDataDir(userDir, pid); found {
		out.CardsDir = dir
		out.MemoryCards = azaharSaveFiles(dir)
	}
	entries, _ := os.ReadDir(statesDir)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		slot, ok := azaharStateSlot(e.Name(), pid)
		if !ok {
			continue
		}
		if fi, ok := fileInfo(filepath.Join(statesDir, e.Name())); ok {
			fi.Slot = intPtr(slot)
			out.SaveStates = append(out.SaveStates, fi)
		}
	}
	sortStates(out.SaveStates)
	return out, true
}
