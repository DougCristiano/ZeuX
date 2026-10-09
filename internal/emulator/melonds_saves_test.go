package emulator

import (
	"os"
	"path/filepath"
	"testing"
)

// Trava que, sem SaveFilePath/SavestatePath gravados, save e states ficam ao
// lado da ROM (getAssetPath com configpath vazio).
func TestMelonDSDefaultsKeepSavesBesideROM(t *testing.T) {
	saveDir, stateDir := melonDSDirs("/jogos/nds/Jogo.nds", map[string]string{})
	if saveDir != "/jogos/nds" || stateDir != "/jogos/nds" {
		t.Errorf("pastas = %q, %q; esperava a pasta da ROM", saveDir, stateDir)
	}
}

// Trava que o nome do save e dos states sai do nome da ROM sem a ÚLTIMA
// extensão (rfind('.') no melonDS), não da primeira.
func TestMelonDSFileNameCutsOnlyLastExtension(t *testing.T) {
	if got := romFileBase("/jogos/Pokemon.v2.nds"); got != "Pokemon.v2" {
		t.Errorf("romFileBase = %q; esperava Pokemon.v2", got)
	}
	if got := romFileBase("/jogos/SemExtensao"); got != "SemExtensao" {
		t.Errorf("romFileBase sem extensão = %q", got)
	}
}

// Trava a leitura da raiz do melonDS.toml: SaveFilePath com barras invertidas
// escapadas (como o toml grava caminhos do Windows), SavestatePath literal, e
// nada de uma tabela [seção] vazar para a raiz.
func TestMelonDSRootStringsReadsEscapedAndLiteralPaths(t *testing.T) {
	data := []byte("" +
		"# config\r\n" +
		"SaveFilePath = \"D:\\\\Saves\\\\nds\"\r\n" +
		"SavestatePath = 'C:\\Estados'\n" +
		"EnableCheats = true\n" +
		"[Instance]\n" +
		"SaveFilePath = \"nao-deve-entrar\"\n")
	got := melonDSRootStrings(data, "SaveFilePath", "SavestatePath")
	if got["SaveFilePath"] != `D:\Saves\nds` {
		t.Errorf("SaveFilePath = %q", got["SaveFilePath"])
	}
	if got["SavestatePath"] != `C:\Estados` {
		t.Errorf("SavestatePath = %q", got["SavestatePath"])
	}
}

// Trava que os saves são achados por nome: <ROM>.sav e <ROM>.ml<slot> (0 a 9),
// e que um state de outro jogo na mesma pasta não entra. Sem melonDS.toml o
// resultado sai aproximado, porque a pasta configurada não foi lida.
func TestMelonDSFindsSaveAndStatesByROMName(t *testing.T) {
	exeDir := t.TempDir()
	romDir := t.TempDir()
	// Isola do melonDS.toml que pode existir na máquina de quem roda o teste.
	t.Setenv("LOCALAPPDATA", t.TempDir())
	rom := filepath.Join(romDir, "Jogo.nds")
	for _, name := range []string{"Jogo.sav", "Jogo.ml0", "Jogo.ml3", "Outro.ml1"} {
		if err := os.WriteFile(filepath.Join(romDir, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	saves, ok := findMelonDSGameSaves(Installation{BinaryPath: filepath.Join(exeDir, "melonDS.exe")}, rom)
	if !ok {
		t.Fatal("esperava saves conhecidos")
	}
	if len(saves.MemoryCards) != 1 || saves.MemoryCards[0].Name != "Jogo.sav" {
		t.Errorf("cartões = %+v", saves.MemoryCards)
	}
	if len(saves.SaveStates) != 2 || *saves.SaveStates[0].Slot != 0 || *saves.SaveStates[1].Slot != 3 {
		t.Errorf("states = %+v; esperava slots 0 e 3 deste jogo", saves.SaveStates)
	}
	if !saves.MemoryCardsApproximate {
		t.Error("sem melonDS.toml o resultado deveria sair aproximado")
	}
}
