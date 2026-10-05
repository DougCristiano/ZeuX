package api

import (
	"strings"

	"github.com/doufl/zeux/internal/verdict"
)

// normalizeConsoleMatch reduz um nome (de console ou de subpasta) a
// minúsculas sem separadores, para comparar "Mega Drive", "mega-drive" e
// "MEGADRIVE" como o mesmo texto — sem isso, a varredura em lote exigiria que
// o usuário nomeasse as subpastas exatamente como o catálogo interno.
func normalizeConsoleMatch(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Palavras que quem organiza uma coleção costuma acrescentar ao nome do
// console ("Sony - PlayStation 3", "PS3 Games", "Roms Nintendo 64"). Sem
// removê-las, "apontei a pasta certa" e o ZeuX não achava console nenhum
// (relato do Douglas, 2026-10-05, no Windows). Só são tiradas DEPOIS da
// tentativa exata, para que "Nintendo 64" não vire "64" antes de casar
// inteiro.
var (
	consoleNoisePrefixes = []string{"sony", "nintendo", "sega", "microsoft", "bandai", "snk", "nec", "roms", "rom", "jogos", "games"}
	consoleNoiseSuffixes = []string{"roms", "rom", "jogos", "games", "isos", "iso"}
)

// Apelidos que o catálogo não tem como nome nem sigla mas que são o nome
// corrente do console em coleções organizadas por conta própria (padrões
// No-Intro/Redump e abreviações de fórum). Chave já normalizada; o valor é o
// id do catálogo — ids que não existirem no catálogo são ignorados.
var consoleAliases = map[string]string{
	"psx": "ps1", "psone": "ps1", "playstation": "ps1", "sonyplaystation": "ps1",
	"playstation3": "ps3", "playstation2": "ps2", "psvita": "vita", "playstationvita": "vita",
	"famicom": "nes", "nintendofamicom": "nes", "fc": "nes",
	"sfc": "snes", "supernes": "snes", "superfamicom": "snes", "supernintendo": "snes",
	"genesis": "megadrive", "md": "megadrive", "segagenesis": "megadrive",
	"mastersystem": "mastersystem", "sms": "mastersystem",
	"gamecube": "gamecube", "gc": "gamecube", "ngc": "gamecube",
	"turbografx16": "pcengine", "tg16": "pcengine", "pce": "pcengine", "turbografx": "pcengine",
	"x360": "xbox360", "gameboycolour": "gbc", "gameboyadvance": "gba",
	"nintendods": "nds", "nds": "nds", "wiiu": "wiiu",
	"megacd": "segacd", "32x": "sega32x",
}

// consoleMatcher casa um nome de pasta com um console do catálogo, só pelo
// NOME — nunca por extensão de arquivo (ambígua entre consoles; ver o
// comentário de handleBulkAddLibraryFolders).
type consoleMatcher map[string]verdict.Console

func newConsoleMatcher(consoles []verdict.Console) consoleMatcher {
	m := make(consoleMatcher)
	byID := make(map[string]verdict.Console, len(consoles))
	for _, c := range consoles {
		byID[c.ID] = c
	}
	// Alias primeiro: id, nome e sigla do catálogo sobrescrevem se colidirem.
	for alias, id := range consoleAliases {
		if c, ok := byID[id]; ok {
			m[alias] = c
		}
	}
	for _, c := range consoles {
		m[normalizeConsoleMatch(c.ID)] = c
		m[normalizeConsoleMatch(c.ShortName)] = c
		m[normalizeConsoleMatch(c.Name)] = c
		// "Mega Drive / Genesis", "PC Engine / TurboGrafx-16": cada lado da
		// barra também é um nome válido de pasta.
		for _, part := range strings.Split(c.Name, "/") {
			m[normalizeConsoleMatch(part)] = c
		}
	}
	return m
}

func (m consoleMatcher) match(folderName string) (verdict.Console, bool) {
	name := normalizeConsoleMatch(folderName)
	if name == "" {
		return verdict.Console{}, false
	}
	if c, ok := m[name]; ok {
		return c, true
	}
	// Tira ruído nas pontas, uma palavra por vez, até casar ou esgotar.
	for changed := true; changed; {
		changed = false
		for _, p := range consoleNoisePrefixes {
			if strings.HasPrefix(name, p) && len(name) > len(p) {
				name, changed = strings.TrimPrefix(name, p), true
				break
			}
		}
		for _, s := range consoleNoiseSuffixes {
			if strings.HasSuffix(name, s) && len(name) > len(s) {
				name, changed = strings.TrimSuffix(name, s), true
				break
			}
		}
		if c, ok := m[name]; ok {
			return c, true
		}
	}
	return verdict.Console{}, false
}
