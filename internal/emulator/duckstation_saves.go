package emulator

import (
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Saves do DuckStation por jogo (2026-10-05). Caminhos relativos à pasta do
// .exe por causa do portable.txt (observado):
//
//   - Cartão de memória: <Directory>\<nome>_<slot>.mcd, com [MemoryCards]
//     Directory = "memcards" por padrão. Com Card1Type = PerGameFileTitle (o
//     que o ZeuX grava em instalação nova), <nome> é o nome do arquivo da ROM
//     sem extensão, passado por Path::SanitizeFileName — código-fonte
//     (core/system.cpp, GetGameMemoryCardPath; core/settings.cpp,
//     Settings::GetGameMemoryCardPath "{}_{}.mcd"). Com PerGameTitle (padrão
//     do DuckStation, instalações antigas) o nome vem do banco interno dele,
//     que o ZeuX não tem: aí só dá para tentar o nome da ROM e o título limpo,
//     e o resultado sai marcado como aproximado.
//   - Save states: <SaveStates>\<SERIAL>_<slot>.sav e <SERIAL>_resume.sav
//     (observado). O serial vem do estado de retomada que o ZeuX já liga ao
//     jogo pela sessão (resume.go) — sem ele, o ZeuX não sabe o serial.

// DuckStationGameSaves é o que existe no disco para um jogo.
type DuckStationGameSaves struct {
	// MemoryCards são os cartões encontrados, um por slot existente.
	MemoryCards []string `json:"memory_cards"`
	// MemoryCardsApproximate: o tipo de cartão não é por nome de arquivo, e o
	// nome foi adivinhado pelo título da ROM.
	MemoryCardsApproximate bool `json:"memory_cards_approximate,omitempty"`
	// Serial do disco, quando conhecido (vem do estado de retomada).
	Serial string `json:"serial,omitempty"`
	// SaveStates são os states do jogo (slots e retomada).
	SaveStates []string `json:"save_states"`
}

// duckStationSanitizeFileName espelha Path::SanitizeFileName do DuckStation
// (common/file_system.cpp): troca por "_" caractere de controle e, no
// Windows, / \ < > : " | ? * e ponto final; fora dele, / e *.
func duckStationSanitizeFileName(name string) string {
	var b strings.Builder
	for _, r := range name {
		bad := r <= 31 || r == '/' || r == '*'
		if runtime.GOOS == "windows" {
			bad = bad || strings.ContainsRune(`\<>:"|?`, r)
		} else if runtime.GOOS == "darwin" {
			bad = bad || r == ':'
		}
		if bad || r == utf8.RuneError {
			b.WriteRune('_')
		} else {
			b.WriteRune(r)
		}
	}
	out := b.String()
	if runtime.GOOS == "windows" && strings.HasSuffix(out, ".") {
		out = strings.TrimSuffix(out, ".") + "_"
	}
	return out
}

// duckStationFileTitle é Path::GetFileTitle: o nome sem a última extensão.
func duckStationFileTitle(romPath string) string {
	base := filepath.Base(romPath)
	if i := strings.LastIndex(base, "."); i > 0 {
		return base[:i]
	}
	return base
}

// duckStationDataDirs devolve a pasta de cartões e a de states, lendo os
// overrides do settings.ini quando existirem.
func duckStationDataDirs(install Installation) (cards, states, cardType string, ok bool) {
	settings, ok := duckStationSettingsPath(install)
	if !ok {
		return "", "", "", false
	}
	root := filepath.Dir(settings)
	cards = filepath.Join(root, "memcards")
	states = filepath.Join(root, "savestates")
	cardType = "PerGameTitle" // padrão do DuckStation (observado)
	data, err := os.ReadFile(settings)
	if err == nil {
		ini := parseINI(data)
		resolve := func(v string) string {
			v = strings.TrimSpace(v)
			if filepath.IsAbs(v) {
				return v
			}
			return filepath.Join(root, v)
		}
		if v, has := ini.get("MemoryCards", "Directory"); has && strings.TrimSpace(v) != "" {
			cards = resolve(v)
		}
		if v, has := ini.get("Folders", "SaveStates"); has && strings.TrimSpace(v) != "" {
			states = resolve(v)
		}
		if v, has := ini.get("MemoryCards", "Card1Type"); has && strings.TrimSpace(v) != "" {
			cardType = strings.TrimSpace(v)
		}
	}
	return cards, states, cardType, true
}

// FindDuckStationGameSaves localiza cartões e states de um jogo. `serial`
// pode vir vazio — aí os states ficam de fora.
func FindDuckStationGameSaves(install Installation, romPath, serial string) (DuckStationGameSaves, bool) {
	cardsDir, statesDir, cardType, ok := duckStationDataDirs(install)
	if !ok {
		return DuckStationGameSaves{}, false
	}
	out := DuckStationGameSaves{MemoryCards: []string{}, SaveStates: []string{}, Serial: serial}

	names := []string{duckStationSanitizeFileName(duckStationFileTitle(romPath))}
	if cardType != "PerGameFileTitle" {
		out.MemoryCardsApproximate = true
		if t := duckStationSanitizeFileName(titleWithoutTags(romPath)); t != names[0] {
			names = append(names, t)
		}
	}
	for _, name := range names {
		for slot := 1; slot <= 2; slot++ {
			p := filepath.Join(cardsDir, name+"_"+strconv.Itoa(slot)+".mcd")
			if _, err := os.Stat(p); err == nil {
				out.MemoryCards = append(out.MemoryCards, p)
			}
		}
	}

	if serial != "" {
		if entries, err := os.ReadDir(statesDir); err == nil {
			prefix := strings.ToLower(serial) + "_"
			for _, e := range entries {
				name := strings.ToLower(e.Name())
				if !e.IsDir() && strings.HasPrefix(name, prefix) && strings.HasSuffix(name, ".sav") {
					out.SaveStates = append(out.SaveStates, filepath.Join(statesDir, e.Name()))
				}
			}
		}
	}
	return out, true
}

// DuckStationSerialFromResumeState extrai o serial de "<SERIAL>_resume.sav".
func DuckStationSerialFromResumeState(statePath string) string {
	name := filepath.Base(statePath)
	if i := strings.LastIndex(strings.ToLower(name), "_resume.sav"); i > 0 {
		return name[:i]
	}
	return ""
}

// titleWithoutTags tira etiquetas entre parênteses/colchetes ("(USA)",
// "[SLUS-00594]") do nome da ROM — segundo palpite para o cartão quando ele
// é nomeado pelo banco do DuckStation, que às vezes guarda o título limpo.
func titleWithoutTags(romPath string) string {
	var b strings.Builder
	depth := 0
	for _, r := range duckStationFileTitle(romPath) {
		switch r {
		case '(', '[':
			depth++
		case ')', ']':
			if depth > 0 {
				depth--
			}
		default:
			if depth == 0 {
				b.WriteRune(r)
			}
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}
