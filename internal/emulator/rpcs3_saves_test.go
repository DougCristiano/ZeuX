package emulator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// rpcs3PortableInstall cria uma instalação do RPCS3 com pasta portable/ ao lado
// do executável, em uma pasta temporária. A pasta é criada ANTES de qualquer
// caminho de configuração ser calculado: sem ela, rpcs3ConfigDir cai na
// configuração real do usuário (~/.config/rpcs3), e o teste escreveria lá.
func rpcs3PortableInstall(t *testing.T) (Installation, string) {
	t.Helper()
	root := t.TempDir()
	cfg := filepath.Join(root, "portable")
	// config/ existe para o games.yml no Windows (rpcs3GamesYMLPath).
	if err := os.MkdirAll(filepath.Join(cfg, "config"), 0o755); err != nil {
		t.Fatal(err)
	}
	return install("rpcs3", filepath.Join(root, "rpcs3")), cfg
}

// Trava o formato do games.yml que o ZeuX lê: um mapa "ID: caminho" por linha,
// com ou sem aspas, e linhas que não são entradas são ignoradas.
func TestRPCS3ParseGamesYMLReadsIDsAndPaths(t *testing.T) {
	raw := []byte("BLUS30443: /roms/Jogo.iso\r\n'BCUS98174': \"/roms/Outro/./\"\nnada aqui\n")
	got := rpcs3ParseGamesYML(raw)
	if got["BLUS30443"] != "/roms/Jogo.iso" {
		t.Errorf("BLUS30443 = %q", got["BLUS30443"])
	}
	if got["BCUS98174"] != "/roms/Outro/./" {
		t.Errorf("BCUS98174 = %q", got["BCUS98174"])
	}
	if len(got) != 2 {
		t.Errorf("esperava 2 entradas, veio %d: %v", len(got), got)
	}
}

// Trava que o caminho gravado pelo RPCS3 para jogo em pasta (com "/./" no fim)
// casa com o caminho que o ZeuX tem para a mesma pasta.
func TestRPCS3SamePathIgnoresFolderSuffix(t *testing.T) {
	if !rpcs3SamePath("/roms/Jogo/./", "/roms/Jogo") {
		t.Error("pasta com \"/./\" deveria casar com a pasta limpa")
	}
	if rpcs3SamePath("/roms/Jogo.iso", "/roms/Outro.iso") {
		t.Error("jogos diferentes não podem casar")
	}
}

// Trava que, se dois IDs apontarem para o mesmo caminho, a escolha é sempre a
// mesma (ordem alfabética), e não depende da ordem aleatória do mapa.
func TestRPCS3SerialFromRegistryIsDeterministic(t *testing.T) {
	registry := map[string]string{"BLUS30443": "/roms/x.iso", "BCUS98174": "/roms/x.iso"}
	for i := 0; i < 20; i++ {
		id, ok := rpcs3SerialFromRegistry(registry, "/roms/x.iso")
		if !ok || id != "BCUS98174" {
			t.Fatalf("rodada %d: id = %q, ok = %v; esperava BCUS98174", i, id, ok)
		}
	}
}

// Trava que o modo "do zero" do RPCS3 leva o jogo na linha e nenhum --savestate.
func TestRPCS3FreshBootsGameWithoutSavestate(t *testing.T) {
	cmd, err := newRPCS3().BuildCommand(install("rpcs3", "/opt/rpcs3/rpcs3"),
		Request{ROMPath: "/jogos/Jogo.iso", ConsoleID: "ps3", Mode: ModeFresh, StatePath: "/estados/sobra.SAVESTAT"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(argvString(cmd), "--savestate") || strings.Contains(argvString(cmd), "sobra.SAVESTAT") {
		t.Errorf("modo fresh carregou estado: %s", argvString(cmd))
	}
	if !strings.HasSuffix(argvString(cmd), "/jogos/Jogo.iso") {
		t.Errorf("modo fresh deveria abrir o jogo pelo caminho: %s", argvString(cmd))
	}
}

// Trava que "Continuar" no RPCS3 usa --savestate com o caminho exato e deixa o
// caminho do jogo de fora: com --savestate o RPCS3 não lê o caminho posicional
// (rpcs3.cpp, else-if antes do boot por caminho).
func TestRPCS3ResumeUsesSavestateAndOmitsGame(t *testing.T) {
	cmd, err := newRPCS3().BuildCommand(install("rpcs3", "/opt/rpcs3/rpcs3"),
		Request{ROMPath: "/jogos/Jogo.iso", ConsoleID: "ps3", Mode: ModeResume, StatePath: "/cfg/savestates/BLUS30443/BLUS30443_1_0.SAVESTAT"})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"/opt/rpcs3/rpcs3", "--savestate", "/cfg/savestates/BLUS30443/BLUS30443_1_0.SAVESTAT"}
	if strings.Join(cmd.Argv, "|") != strings.Join(want, "|") {
		t.Errorf("argv = %v, quer %v", cmd.Argv, want)
	}
}

// Trava que a prévia de "Continuar" (sem caminho do estado) mantém o jogo na
// linha e avisa que o estado é localizado só na hora de abrir.
func TestRPCS3ResumePreviewKeepsGameAndSaysStateComesLater(t *testing.T) {
	cmd, err := newRPCS3().BuildCommand(install("rpcs3", "/opt/rpcs3/rpcs3"),
		Request{ROMPath: "/jogos/Jogo.iso", ConsoleID: "ps3", Mode: ModeResume})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(argvString(cmd), "--savestate") {
		t.Errorf("prévia sem StatePath não deveria ter --savestate: %s", argvString(cmd))
	}
	if !strings.HasSuffix(argvString(cmd), "/jogos/Jogo.iso") {
		t.Errorf("a prévia deveria manter o jogo: %s", argvString(cmd))
	}
	if len(cmd.Unapplied) != 1 || !strings.Contains(cmd.Unapplied[0], "na hora de abrir o jogo") {
		t.Errorf("Unapplied = %v", cmd.Unapplied)
	}
}

// Trava que só os arquivos de save state do RPCS3 entram na lista, com ou sem
// compressão zstd.
func TestRPCS3IsSaveStateAcceptsOnlySavestats(t *testing.T) {
	for _, name := range []string{"BLUS30443_1_0.SAVESTAT", "BLUS30443_1_0.SAVESTAT.zst", "x.savestat"} {
		if !rpcs3IsSaveState(name) {
			t.Errorf("%s deveria ser save state", name)
		}
	}
	for _, name := range []string{"BLUS30443_1_0.ppst", "PARAM.SFO", "BLUS30443_1_0.SAVESTAT.bak"} {
		if rpcs3IsSaveState(name) {
			t.Errorf("%s não deveria ser save state", name)
		}
	}
}

// Trava que o ZeuX só lista saves de um jogo com o ID dele: pasta de save de
// outro ID e state de outro ID ficam de fora, e o resultado sai aproximado.
// O RPCS3 fica num "portable/" ao lado do executável, que o ZeuX já reconhece
// em qualquer sistema operacional (rpcs3ConfigDir).
func TestRPCS3FindsOnlyOwnSavesAndStates(t *testing.T) {
	inst, cfg := rpcs3PortableInstall(t)
	rom := "/jogos/Jogo.iso"

	gamesYML, ok := rpcs3GamesYMLPath(inst)
	if !ok {
		t.Fatal("sem caminho do games.yml")
	}
	if err := os.WriteFile(gamesYML, []byte("BLUS30443: "+rom+"\nBCUS98174: /outro.iso\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	cards := filepath.Join(cfg, "dev_hdd0", "home", rpcs3SaveUser, "savedata")
	writeFile(t, filepath.Join(cards, "BLUS30443-SAVE", "PARAM.SFO"))
	writeFile(t, filepath.Join(cards, "BLUS30443-SAVE", "data.bin"))
	writeFile(t, filepath.Join(cards, "BCUS98174-SAVE", "data.bin"))
	states := filepath.Join(cfg, "savestates", "BLUS30443")
	writeFile(t, filepath.Join(states, "BLUS30443_1_0.SAVESTAT"))
	writeFile(t, filepath.Join(states, "lixo.txt"))

	out, known := findRPCS3GameSaves(inst, rom)
	if !known {
		t.Fatal("o ID do jogo está no games.yml; deveria achar os saves")
	}
	if out.Serial != "BLUS30443" || !out.MemoryCardsApproximate {
		t.Errorf("Serial = %q, aproximado = %v", out.Serial, out.MemoryCardsApproximate)
	}
	if len(out.MemoryCards) != 2 {
		t.Errorf("cartões = %d, quer 2 (PARAM.SFO e data.bin do jogo): %+v", len(out.MemoryCards), out.MemoryCards)
	}
	if len(out.SaveStates) != 1 || out.SaveStates[0].Name != "BLUS30443_1_0.SAVESTAT" {
		t.Errorf("states = %+v", out.SaveStates)
	}

	if _, known := findRPCS3GameSaves(inst, "/jogos/Desconhecido.iso"); known {
		t.Error("jogo fora do games.yml não pode ser tratado como conhecido")
	}
}

// Trava que o "Continuar" do RPCS3 só pega o state gravado depois de a sessão
// começar, e um state antigo da mesma pasta não vira "onde você parou".
func TestRPCS3ResumeFileIgnoresStatesFromBeforeSession(t *testing.T) {
	inst, cfg := rpcs3PortableInstall(t)
	rom := "/jogos/Jogo.iso"

	gamesYML, _ := rpcs3GamesYMLPath(inst)
	if err := os.WriteFile(gamesYML, []byte("BLUS30443: "+rom+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	old := filepath.Join(cfg, "savestates", "BLUS30443", "BLUS30443_1_0.SAVESTAT")
	writeFile(t, old)

	since := time.Now()
	old2 := since.Add(-time.Hour)
	if err := os.Chtimes(old, old2, old2); err != nil {
		t.Fatal(err)
	}
	if _, _, ok := rpcs3ResumeFile(inst, rom, since); ok {
		t.Fatal("state de antes da sessão não deveria virar retomada")
	}

	fresh := filepath.Join(cfg, "savestates", "BLUS30443", "BLUS30443_1_1.SAVESTAT.zst")
	writeFile(t, fresh)
	later := since.Add(time.Minute)
	if err := os.Chtimes(fresh, later, later); err != nil {
		t.Fatal(err)
	}
	path, _, ok := rpcs3ResumeFile(inst, rom, since)
	if !ok || path != fresh {
		t.Errorf("retomada = %q, ok = %v; quer %q", path, ok, fresh)
	}
}
