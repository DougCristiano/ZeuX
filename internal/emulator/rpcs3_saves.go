package emulator

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"
)

// Saves e retomada do RPCS3 por jogo (2026-10-09). Fontes lidas no código-fonte
// oficial (raw.githubusercontent.com/RPCS3/rpcs3, master), não observadas com o
// binário rodando — ver a ressalva em docs/decisoes.md.
//
//   - Identificação do jogo: o RPCS3 registra em <config>/games.yml um mapa
//     "ID do título: caminho" (games_config.cpp, load/save_nl; no Windows o
//     arquivo fica em <config>/config/, get_config_dir(true)). É por esse
//     mapa que o ZeuX descobre o ID (ex.: BLUS30443) de um jogo sem ler o
//     PARAM.SFO de dentro do ISO. Antes da primeira vez que o jogo roda pelo
//     RPCS3 o mapa não tem a entrada, e o ZeuX diz "não sei" em vez de chutar.
//   - Cartão (saves de jogo): <config>/dev_hdd0/home/00000001/savedata/<pasta>/
//     (rpcs3.cpp, System.cpp: "/dev_hdd0/home/%08u/savedata/"; usuário padrão
//     00000001). A pasta do save é escolhida pelo jogo (SAVEDATA_DIRECTORY no
//     PARAM.SFO), então o ZeuX a casa por prefixo do ID — por isso o resultado
//     sai marcado como aproximado.
//   - Save states: <config>/savestates/<ID>/<ID>_<prefixo>_<id>.SAVESTAT
//     (savestate_utils.cpp, get_savestate_file). Note que a pasta de estados usa
//     fs::get_config_dir() sem o subdiretório "config/" — diferente do games.yml.
//   - Retomada: `--savestate <arquivo>` (rpcs3.cpp, "Path for directly loading
//     a savestate."). Ver RPCS3 em standalone.go.

// rpcs3SaveUser é o usuário padrão do RPCS3 (Emu.GetUsrId() sem --user-id).
// Usuário diferente exigiria ler a configuração do próprio RPCS3; o ZeuX não
// faz isso, e por isso o resultado continua aproximado.
const rpcs3SaveUser = "00000001"

// rpcs3GamesEntry casa uma linha "ID: caminho" do games.yml, com o ID de título
// do PS3 (4 letras + 5 dígitos, ex.: BLUS30443). O emitter do RPCS3 não põe
// aspas nas chaves, mas aceitá-las evita perder uma entrada se a forma mudar.
var rpcs3GamesEntry = regexp.MustCompile(`^["']?([A-Z]{4}\d{5})["']?:\s*(.+?)\s*$`)

// rpcs3GamesYMLPath devolve onde o RPCS3 grava o games.yml. No Windows fica em
// <config>/config/ (get_config_dir(true) acrescenta "config/"); no Linux e no
// macOS fica na própria pasta de configuração.
func rpcs3GamesYMLPath(install Installation) (string, bool) {
	dir, ok := rpcs3ConfigDir(install)
	if !ok {
		return "", false
	}
	if runtime.GOOS == "windows" {
		return filepath.Join(dir, "config", "games.yml"), true
	}
	return filepath.Join(dir, "games.yml"), true
}

// rpcs3ParseGamesYML lê o games.yml como um mapa plano, sem parser YAML: o
// arquivo é gravado pelo próprio RPCS3 com uma entrada por linha, e uma
// biblioteca YAML inteira só para isto não se paga. Função pura, para o teste
// travar o formato sem disco.
func rpcs3ParseGamesYML(data []byte) map[string]string {
	out := map[string]string{}
	for _, line := range strings.Split(string(data), "\n") {
		m := rpcs3GamesEntry.FindStringSubmatch(strings.TrimRight(line, "\r"))
		if m == nil {
			continue
		}
		if path := strings.Trim(m[2], `"'`); path != "" {
			out[m[1]] = path
		}
	}
	return out
}

// rpcs3SamePath compara o caminho que o RPCS3 guardou com o caminho da ROM.
// O RPCS3 grava jogos em pasta com a barra final e um "/./" (games_config,
// "new_ps3_game + \"/./\""); Clean desfaz isso. No Windows a comparação ignora
// maiúsculas, como o próprio sistema de arquivos.
func rpcs3SamePath(registered, romPath string) bool {
	a := filepath.Clean(filepath.ToSlash(strings.TrimSpace(registered)))
	b := filepath.Clean(filepath.ToSlash(romPath))
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	return a == b
}

// rpcs3SerialFromRegistry procura no mapa o ID cujo caminho é o da ROM. Ordem
// fixa (chaves ordenadas) para que, se dois IDs apontarem para o mesmo
// caminho, a escolha não dependa da ordem aleatória do mapa.
func rpcs3SerialFromRegistry(registry map[string]string, romPath string) (string, bool) {
	ids := make([]string, 0, len(registry))
	for id := range registry {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		if rpcs3SamePath(registry[id], romPath) {
			return id, true
		}
	}
	return "", false
}

// rpcs3SerialForROM lê o games.yml e devolve o ID do jogo. ok=false quando o
// arquivo não existe (instalação nova, o jogo nunca rodou pelo RPCS3) ou
// quando o caminho não está nele — nesse caso o ZeuX não sabe o ID.
func rpcs3SerialForROM(install Installation, romPath string) (string, bool) {
	path, ok := rpcs3GamesYMLPath(install)
	if !ok {
		return "", false
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", false
	}
	return rpcs3SerialFromRegistry(rpcs3ParseGamesYML(data), romPath)
}

// rpcs3IsSaveState reconhece um save state do RPCS3, com ou sem compressão
// zstd (o leitor do RPCS3 aceita os dois: make_savestate_reader).
func rpcs3IsSaveState(name string) bool {
	lower := strings.ToLower(name)
	return strings.HasSuffix(lower, ".savestat") || strings.HasSuffix(lower, ".savestat.zst")
}

// findRPCS3GameSaves lista os saves de um jogo. Sem ID conhecido, não há como
// achar a pasta: devolve ok=false ("não sei"), e não uma lista vazia que
// pareceria "o jogo nunca foi salvo".
func findRPCS3GameSaves(install Installation, romPath string) (GameSaves, bool) {
	serial, ok := rpcs3SerialForROM(install, romPath)
	if !ok {
		return GameSaves{}, false
	}
	root, ok := rpcs3ConfigDir(install)
	if !ok {
		return GameSaves{}, false
	}
	cardsDir := filepath.Join(root, "dev_hdd0", "home", rpcs3SaveUser, "savedata")
	statesDir := filepath.Join(root, "savestates", serial)
	out := GameSaves{
		AdapterID:              "rpcs3",
		MemoryCards:            []SaveFileInfo{},
		SaveStates:             []SaveFileInfo{},
		MemoryCardsApproximate: true,
		Serial:                 serial,
		CardsDir:               cardsDir,
		StatesDir:              statesDir,
	}

	// Pastas de save do jogo: o nome começa com o ID. Só arquivos soltos dentro
	// de cada pasta entram — o backup copia arquivo a arquivo (game_saves.go),
	// e subpastas não têm caminho de restauração definido aqui.
	if entries, err := os.ReadDir(cardsDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() || !strings.HasPrefix(strings.ToUpper(e.Name()), serial) {
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

	// Pasta de states ausente é o estado de quem nunca salvou — lista vazia.
	if entries, err := os.ReadDir(statesDir); err == nil {
		for _, e := range entries {
			if e.IsDir() || !rpcs3IsSaveState(e.Name()) {
				continue
			}
			if fi, ok := fileInfo(filepath.Join(statesDir, e.Name())); ok {
				out.SaveStates = append(out.SaveStates, fi)
			}
		}
	}
	sortStates(out.SaveStates)
	return out, true
}

// rpcs3ResumeFile acha o save state gravado durante a sessão. O RPCS3 não tem
// um arquivo de retomada fixo como o DuckStation: o estado sai do próprio
// usuário (salvar pelo menu) ou do "suspend" ao fechar. Por isso o ZeuX só
// registra o que apareceu depois de a sessão começar, na pasta do ID do jogo.
func rpcs3ResumeFile(install Installation, romPath string, since time.Time) (string, time.Time, bool) {
	serial, ok := rpcs3SerialForROM(install, romPath)
	if !ok {
		return "", time.Time{}, false
	}
	root, ok := rpcs3ConfigDir(install)
	if !ok {
		return "", time.Time{}, false
	}
	return newestResumeFile(filepath.Join(root, "savestates", serial), rpcs3IsSaveState, since)
}
