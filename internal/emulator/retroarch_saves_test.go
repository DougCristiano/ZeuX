package emulator

import (
	"os"
	"path/filepath"
	"testing"
)

// useRetroArchCfg aponta retroArchConfigPath para um retroarch.cfg de teste e
// devolve a função de limpeza. Sem isso o teste leria o retroarch.cfg real de
// quem roda a suíte.
func useRetroArchCfg(t *testing.T, cfg string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "retroarch.cfg")
	if err := os.WriteFile(path, []byte(cfg), 0o644); err != nil {
		t.Fatal(err)
	}
	old := retroArchConfigPath
	retroArchConfigPath = func(Installation) (string, error) { return path, nil }
	t.Cleanup(func() { retroArchConfigPath = old })
	return dir
}

func writeFile(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
}

// A regra do nome: o save do RetroArch leva o nome do arquivo da ROM sem a
// última extensão, e um zip conta pelo nome do próprio zip.
func TestRetroArchContentNameStripsLastExtension(t *testing.T) {
	cases := map[string]string{
		"/roms/Super Game (USA).sfc": "Super Game (USA)",
		"/roms/Jogo.7z":              "Jogo",
		"/roms/semext":               "semext",
	}
	for in, want := range cases {
		if got := retroArchContentName(in); got != want {
			t.Errorf("retroArchContentName(%q) = %q, quer %q", in, got, want)
		}
	}
}

// Só os arquivos do próprio jogo entram: "Jogo 2.state" e "Jogo.statefoo" não
// podem ser lidos como states de "Jogo".
func TestRetroArchStateSlotOnlyMatchesOwnGame(t *testing.T) {
	if _, ok := retroArchStateSlot("Jogo 2.state", "Jogo"); ok {
		t.Error("state de outro jogo com nome parecido não deve casar")
	}
	if _, ok := retroArchStateSlot("Jogo.statefoo", "Jogo"); ok {
		t.Error("sufixo que não é número nem .auto não deve casar")
	}
	slot, ok := retroArchStateSlot("Jogo.state3", "Jogo")
	if !ok || slot == nil || *slot != 3 {
		t.Errorf("Jogo.state3 deve ser o slot 3, veio ok=%v slot=%v", ok, slot)
	}
	auto, ok := retroArchStateSlot("Jogo.state.auto", "Jogo")
	if !ok || auto != nil {
		t.Errorf("Jogo.state.auto deve casar sem slot, veio ok=%v slot=%v", ok, auto)
	}
}

// Com savefile_directory e savestate_directory fixos no retroarch.cfg, o ZeuX
// procura o cartão e os states nessas pastas, não ao lado da ROM.
func TestRetroArchFindsSavesInConfiguredDirectories(t *testing.T) {
	useRetroArchCfg(t, "savefile_directory = \"/x/srm\"\nsavestate_directory = \"/x/states\"\n")
	saves, ok := findRetroArchGameSaves(Installation{}, "/roms/Jogo.sfc")
	if !ok {
		t.Fatal("RetroArch com config deve sempre responder ok")
	}
	if saves.CardsDir != "/x/srm" || saves.StatesDir != "/x/states" {
		t.Errorf("pastas erradas: cartões %q, states %q", saves.CardsDir, saves.StatesDir)
	}
	if !saves.MemoryCardsApproximate {
		t.Error("o nome do save é convenção de fonte secundária: tem que sair aproximado")
	}
	// As pastas /x/... não existem: a lista sai vazia, sem erro.
	if len(saves.MemoryCards) != 0 || len(saves.SaveStates) != 0 {
		t.Errorf("pasta inexistente deve dar lista vazia, veio %d cartões e %d states",
			len(saves.MemoryCards), len(saves.SaveStates))
	}
}

// Com "default" (o padrão do RetroArch), o save fica ao lado da ROM: o ZeuX
// tem que procurar lá, e não numa pasta inventada.
func TestRetroArchDefaultDirectoriesLookBesideTheRom(t *testing.T) {
	romDir := t.TempDir()
	useRetroArchCfg(t, "savefile_directory = \"default\"\nsavestate_directory = \"default\"\n")
	romPath := filepath.Join(romDir, "Jogo.sfc")

	writeFile(t, filepath.Join(romDir, "Jogo.srm"))
	writeFile(t, filepath.Join(romDir, "Jogo.state"))
	writeFile(t, filepath.Join(romDir, "Jogo.state2"))
	writeFile(t, filepath.Join(romDir, "Outro.srm"))

	saves, ok := findRetroArchGameSaves(Installation{}, romPath)
	if !ok {
		t.Fatal("deve responder ok")
	}
	if len(saves.MemoryCards) != 1 || saves.MemoryCards[0].Name != "Jogo.srm" {
		t.Errorf("cartão deve ser só Jogo.srm, veio %+v", saves.MemoryCards)
	}
	if len(saves.SaveStates) != 2 {
		t.Fatalf("esperava 2 states (Jogo.state e Jogo.state2), veio %d", len(saves.SaveStates))
	}
	// Ordenação por slot: o slot 0 (".state") vem antes do slot 2.
	if *saves.SaveStates[0].Slot != 0 || *saves.SaveStates[1].Slot != 2 {
		t.Errorf("states fora de ordem por slot: %+v", saves.SaveStates)
	}
}
