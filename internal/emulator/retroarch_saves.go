package emulator

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Saves por jogo no RetroArch (2026-10-09). Os diretórios vêm do próprio
// retroarch.cfg (retroArchSaveDataDirs), com a chave vazia ou "default" caindo
// na pasta da ROM — o comportamento que o próprio RetroArch documenta no
// arquivo-modelo ("salvar ao lado do conteúdo").
//
// O nome do arquivo de cada jogo NÃO vem de documentação oficial: o levantamento
// (docs/decisoes.md, 2026-10-09) achou só fontes secundárias (fóruns e readme de
// core) dizendo que o save leva o nome da ROM sem extensão — "<jogo>.srm" e
// "<jogo>.state", "<jogo>.stateN" para os slots, "<jogo>.state.auto" para o
// auto-save. Por isso o resultado sai marcado como aproximado, igual ao cartão
// do DuckStation com tipo de cartão por título.

// retroArchContentName é o nome do conteúdo que o RetroArch usa para montar o
// caminho do save: o nome do arquivo da ROM sem a última extensão (zip e 7z
// incluídos, já que o RetroArch usa o nome do arquivo compactado).
func retroArchContentName(romPath string) string {
	base := filepath.Base(romPath)
	if ext := filepath.Ext(base); ext != "" {
		return strings.TrimSuffix(base, ext)
	}
	return base
}

// retroArchStateSlot reconhece um arquivo de save state do jogo `name`.
// Devolve ok=false para qualquer outro arquivo — inclusive os de outro jogo cujo
// nome começa igual, como "Jogo 2.state" para "Jogo" (por isso o prefixo é
// conferido com o ponto e com o sufixo logo depois).
//
// Slot: "<nome>.stateN" é o slot N; "<nome>.state" sem número é tratado como
// slot 0 (dedução, não documentada). "<nome>.state.auto" não é slot — é o
// auto-save ao fechar o RetroArch — e sai com slot nil.
func retroArchStateSlot(file, name string) (slot *int, ok bool) {
	prefix := name + ".state"
	if !strings.HasPrefix(file, prefix) {
		return nil, false
	}
	rest := file[len(prefix):]
	switch {
	case rest == "":
		return intPtr(0), true
	case rest == ".auto":
		return nil, true
	}
	n, err := strconv.Atoi(rest)
	if err != nil || n < 0 || strings.ContainsAny(rest, "+- ") {
		return nil, false
	}
	return intPtr(n), true
}

// findRetroArchGameSaves lista o cartão (.srm) e os states do jogo no RetroArch.
// Sempre devolve ok=true quando há uma instalação para consultar: a ausência de
// arquivos é um resultado válido (o jogo nunca foi salvo), não um "não sei".
// ok=false só se o caminho da config não puder ser resolvido.
func findRetroArchGameSaves(install Installation, romPath string) (GameSaves, bool) {
	cfgPath, err := retroArchConfigPath(install)
	if err != nil {
		return GameSaves{}, false
	}
	dirs := retroArchSaveDataDirs("retroarch", cfgPath)

	cardsDir, statesDir := dirs.MemoryCardsDir, dirs.SaveStatesDir
	romDir := filepath.Dir(romPath)
	if cardsDir == "" {
		cardsDir = romDir
	}
	if statesDir == "" {
		statesDir = romDir
	}

	name := retroArchContentName(romPath)
	out := GameSaves{
		AdapterID:              "retroarch",
		MemoryCards:            []SaveFileInfo{},
		SaveStates:             []SaveFileInfo{},
		MemoryCardsApproximate: true,
		CardsDir:               cardsDir,
		StatesDir:              statesDir,
	}

	if fi, ok := fileInfo(filepath.Join(cardsDir, name+".srm")); ok {
		out.MemoryCards = append(out.MemoryCards, fi)
	}

	// Pasta de states ausente é o estado normal de quem nunca salvou: ReadDir
	// com erro só deixa a lista vazia, sem transformar isso em falha.
	if entries, err := os.ReadDir(statesDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			slot, ok := retroArchStateSlot(e.Name(), name)
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
	return out, true
}
