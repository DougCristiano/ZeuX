package emulator

import (
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

// Saves do melonDS por jogo (2026-10-09). Lido no código-fonte do melonDS
// (github.com/melonDS-emu/melonDS, src/frontend/qt_sdl), não observado com o
// binário rodando — ver docs/decisoes.md.
//
//   - Pasta de configuração (main.cpp, pathInit): "portable" ao lado do
//     executável, se existir. Senão, a pasta de configuração do Qt + "melonDS"
//     (no Windows, a documentação do Qt aponta %LocalAppData%).
//   - Arquivo: melonDS.toml (Config.cpp, kConfigFile). SaveFilePath e
//     SavestatePath ficam na raiz do arquivo (Config.cpp, tabela de entradas).
//   - Save (EmuInstance.cpp, getAssetPath): se SaveFilePath estiver vazio, vale
//     a pasta da ROM; o nome é o da ROM sem a última extensão + ".sav".
//   - Save states (EmuInstance.cpp, getSavestateName): mesma regra com
//     SavestatePath e o nome "<ROM sem extensão>.ml<slot 0 a 9>".
//
// O melonDS não tem opção de linha de comando para abrir num estado (CLI.cpp
// só tem -b, -f, -a e -A), então este arquivo cuida só dos saves.

// melonDSConfigPath acha o melonDS.toml. Sem ele, o ZeuX assume os padrões
// (saves ao lado da ROM) e marca o resultado como aproximado.
func melonDSConfigPath(install Installation) (string, bool) {
	if install.BinaryPath == "" {
		return "", false
	}
	candidates := []string{filepath.Join(filepath.Dir(install.BinaryPath), "portable", "melonDS.toml")}
	if local := os.Getenv("LOCALAPPDATA"); local != "" && runtime.GOOS == "windows" {
		candidates = append(candidates, filepath.Join(local, "melonDS", "melonDS.toml"))
	}
	for _, p := range candidates {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p, true
		}
	}
	return "", false
}

// melonDSRootStrings lê, da raiz de um melonDS.toml (antes do primeiro
// [cabeçalho]), as chaves de texto pedidas. Cobre só o que o ZeuX usa: valor
// entre aspas duplas (com \\ e \" escapados, como o toml grava caminhos do
// Windows) ou entre aspas simples (literal).
func melonDSRootStrings(data []byte, keys ...string) map[string]string {
	want := map[string]bool{}
	for _, k := range keys {
		want[k] = true
	}
	out := map[string]string{}
	for _, raw := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") {
			break
		}
		eq := strings.Index(line, "=")
		if eq < 0 {
			continue
		}
		key := strings.TrimSpace(line[:eq])
		if !want[key] {
			continue
		}
		if v, ok := tomlBasicOrLiteral(strings.TrimSpace(line[eq+1:])); ok {
			out[key] = v
		}
	}
	return out
}

// tomlBasicOrLiteral extrai uma string TOML de uma linha: "..." (com escapes
// \\, \" e \t) ou '...' (literal). Devolve false para qualquer outra coisa.
func tomlBasicOrLiteral(v string) (string, bool) {
	if len(v) < 2 {
		return "", false
	}
	switch v[0] {
	case '\'':
		end := strings.IndexByte(v[1:], '\'')
		if end < 0 {
			return "", false
		}
		return v[1 : 1+end], true
	case '"':
		var b strings.Builder
		for i := 1; i < len(v); i++ {
			c := v[i]
			if c == '"' {
				return b.String(), true
			}
			if c == '\\' && i+1 < len(v) {
				i++
				switch v[i] {
				case 'n':
					b.WriteByte('\n')
				case 't':
					b.WriteByte('\t')
				default:
					b.WriteByte(v[i])
				}
				continue
			}
			b.WriteByte(c)
		}
	}
	return "", false
}

// romFileBase é o nome da ROM sem a última extensão. É a regra do melonDS para
// nomear save e states (romname.substr(0, romname.rfind('.')) em
// EmuInstance.cpp) e a do Flycast (get_file_basename em core/stdclass.h).
func romFileBase(romPath string) string {
	name := filepath.Base(romPath)
	if i := strings.LastIndex(name, "."); i >= 0 {
		return name[:i]
	}
	return name
}

// melonDSDirs devolve a pasta do save e a dos states. Vazio na configuração
// quer dizer "ao lado da ROM", como em getAssetPath.
func melonDSDirs(romPath string, cfg map[string]string) (saveDir, stateDir string) {
	romDir := filepath.Dir(romPath)
	saveDir, stateDir = romDir, romDir
	if v := strings.TrimSpace(cfg["SaveFilePath"]); v != "" {
		saveDir = v
	}
	if v := strings.TrimSpace(cfg["SavestatePath"]); v != "" {
		stateDir = v
	}
	return saveDir, stateDir
}

// findMelonDSGameSaves lista o save (.sav) e os states (.ml0 a .ml9) de uma ROM.
func findMelonDSGameSaves(install Installation, romPath string) (GameSaves, bool) {
	if install.BinaryPath == "" {
		return GameSaves{}, false
	}
	cfg := map[string]string{}
	approximate := true
	if path, ok := melonDSConfigPath(install); ok {
		if data, err := os.ReadFile(path); err == nil {
			cfg = melonDSRootStrings(data, "SaveFilePath", "SavestatePath")
			approximate = false
		}
	}
	saveDir, stateDir := melonDSDirs(romPath, cfg)
	base := romFileBase(romPath)
	out := GameSaves{
		AdapterID:              "melonds",
		MemoryCards:            []SaveFileInfo{},
		SaveStates:             []SaveFileInfo{},
		MemoryCardsApproximate: approximate,
		CardsDir:               saveDir,
		StatesDir:              stateDir,
	}
	if fi, ok := fileInfo(filepath.Join(saveDir, base+".sav")); ok {
		out.MemoryCards = append(out.MemoryCards, fi)
	}
	for slot := 0; slot <= 9; slot++ {
		if fi, ok := fileInfo(filepath.Join(stateDir, base+".ml"+strconv.Itoa(slot))); ok {
			fi.Slot = intPtr(slot)
			out.SaveStates = append(out.SaveStates, fi)
		}
	}
	return out, true
}
