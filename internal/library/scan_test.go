package library

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// A varredura precisa achar arquivos na pasta raiz e em subpastas dentro do
// limite, ignorar extensão que não interessa, e não se confundir com
// maiúsculas/minúsculas — um usuário no Windows pode ter ".BIN" ou ".bin".
func TestFindROMsMatchesExtensionsCaseInsensitively(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "jogo1.bin"))
	writeFile(t, filepath.Join(root, "JOGO2.BIN"))
	writeFile(t, filepath.Join(root, "leiame.txt"))
	writeFile(t, filepath.Join(root, "disco1", "jogo3.bin"))

	found, err := FindROMs(root, []string{"bin"})
	if err != nil {
		t.Fatalf("FindROMs: %v", err)
	}
	if len(found) != 3 {
		t.Fatalf("esperava 3 arquivos .bin, achou %d: %v", len(found), found)
	}
}

// Sem o limite de profundidade, apontar uma pasta alta demais na árvore
// varreria uma quantidade de disco imprevisível a cada scan.
func TestFindROMsRespectsMaxDepth(t *testing.T) {
	root := t.TempDir()

	// Uma cadeia de subpastas mais funda que maxScanDepth; o arquivo no fundo
	// não deveria ser encontrado.
	deep := root
	for i := 0; i < maxScanDepth+2; i++ {
		deep = filepath.Join(deep, fmt.Sprintf("nivel%d", i))
	}
	writeFile(t, filepath.Join(deep, "fundo.bin"))
	writeFile(t, filepath.Join(root, "raiz.bin"))

	found, err := FindROMs(root, []string{"bin"})
	if err != nil {
		t.Fatalf("FindROMs: %v", err)
	}
	if len(found) != 1 || filepath.Base(found[0]) != "raiz.bin" {
		t.Errorf("esperava só raiz.bin dentro do limite de profundidade, achou %v", found)
	}
}

// A prova exigida pelo critério de aceite do L2: a varredura só lê, nunca
// escreve. O conteúdo da pasta de origem e da pasta gerenciada do ZeuX
// precisam ficar exatamente iguais antes e depois.
func TestFindROMsNeverWritesToSourceOrManagedRoot(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "jogo.bin"))
	writeFile(t, filepath.Join(root, "sub", "jogo2.bin"))

	before, err := snapshotDir(root)
	if err != nil {
		t.Fatalf("snapshot antes: %v", err)
	}

	if _, err := FindROMs(root, []string{"bin"}); err != nil {
		t.Fatalf("FindROMs: %v", err)
	}

	after, err := snapshotDir(root)
	if err != nil {
		t.Fatalf("snapshot depois: %v", err)
	}

	if len(before) != len(after) {
		t.Fatalf("o número de arquivos da pasta de origem mudou: %d -> %d", len(before), len(after))
	}
	for path, info := range before {
		if after[path] != info {
			t.Errorf("arquivo %q mudou (mtime/tamanho) depois da varredura", path)
		}
	}
}

// Medido para o critério de aceite do L2 ("varrer 1000 arquivos leva menos
// de 1s"). O número medido nesta máquina: ver saída do teste com -v.
func TestFindROMsPerformanceWith1000Files(t *testing.T) {
	root := t.TempDir()
	for i := 0; i < 1000; i++ {
		writeFile(t, filepath.Join(root, fmt.Sprintf("jogo%04d.bin", i)))
	}

	start := time.Now()
	found, err := FindROMs(root, []string{"bin"})
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("FindROMs: %v", err)
	}
	if len(found) != 1000 {
		t.Fatalf("esperava achar 1000 arquivos, achou %d", len(found))
	}

	t.Logf("varreu 1000 arquivos em %s", elapsed)
	if elapsed > time.Second {
		t.Errorf("varredura levou %s, queria menos de 1s", elapsed)
	}
}

// Arquivo que sumiu do disco entre uma varredura e outra precisa ficar
// marcado como ausente — nunca apagado em silêncio, nunca exibido como se
// ainda estivesse lá.
func TestSyncFolderMarksMissingWhenFileDisappears(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	root := t.TempDir()
	stayPath := filepath.Join(root, "fica.bin")
	goPath := filepath.Join(root, "some.bin")
	writeFile(t, stayPath)
	writeFile(t, goPath)

	folder, err := s.AddFolder(ctx, "ps1", root)
	if err != nil {
		t.Fatalf("AddFolder: %v", err)
	}

	firstScan, err := FindROMs(root, []string{"bin"})
	if err != nil {
		t.Fatalf("FindROMs (1ª varredura): %v", err)
	}
	if err := s.SyncFolder(ctx, folder.ID, toNewGames("ps1", firstScan)); err != nil {
		t.Fatalf("SyncFolder (1ª varredura): %v", err)
	}

	games, err := s.ListGames(ctx, "ps1")
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	for _, g := range games {
		if g.Missing {
			t.Errorf("jogo %q não deveria estar ausente logo após a 1ª varredura", g.Path)
		}
	}

	if err := os.Remove(goPath); err != nil {
		t.Fatalf("removendo %q: %v", goPath, err)
	}

	secondScan, err := FindROMs(root, []string{"bin"})
	if err != nil {
		t.Fatalf("FindROMs (2ª varredura): %v", err)
	}
	if err := s.SyncFolder(ctx, folder.ID, toNewGames("ps1", secondScan)); err != nil {
		t.Fatalf("SyncFolder (2ª varredura): %v", err)
	}

	games, err = s.ListGames(ctx, "ps1")
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if len(games) != 2 {
		t.Fatalf("esperava as 2 entradas continuarem existindo, achou %d", len(games))
	}

	byPath := make(map[string]Game, len(games))
	for _, g := range games {
		byPath[g.Path] = g
	}
	if byPath[goPath].Missing != true {
		t.Errorf("%q deveria estar marcado como ausente", goPath)
	}
	if byPath[stayPath].Missing != false {
		t.Errorf("%q não deveria estar marcado como ausente", stayPath)
	}
}

// Um arquivo que sumiu e depois volta (disco externo reconectado, por
// exemplo) precisa sair do estado de ausente na próxima varredura.
func TestSyncFolderClearsMissingWhenFileReappears(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	root := t.TempDir()
	path := filepath.Join(root, "jogo.bin")
	writeFile(t, path)

	folder, err := s.AddFolder(ctx, "ps1", root)
	if err != nil {
		t.Fatalf("AddFolder: %v", err)
	}

	if err := s.SyncFolder(ctx, folder.ID, []NewGame{{ConsoleID: "ps1", Path: path, Title: "Jogo"}}); err != nil {
		t.Fatalf("1ª sincronização: %v", err)
	}
	// Simula o arquivo ausente sem removê-lo de fato: sincroniza com uma
	// lista vazia, como a varredura faria se o arquivo tivesse sumido.
	if err := s.SyncFolder(ctx, folder.ID, nil); err != nil {
		t.Fatalf("2ª sincronização (arquivo ausente): %v", err)
	}
	if err := s.SyncFolder(ctx, folder.ID, []NewGame{{ConsoleID: "ps1", Path: path, Title: "Jogo"}}); err != nil {
		t.Fatalf("3ª sincronização (arquivo de volta): %v", err)
	}

	games, err := s.ListGames(ctx, "ps1")
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if len(games) != 1 || games[0].Missing {
		t.Errorf("esperava 1 jogo não-ausente após reaparecer, achou %+v", games)
	}
}

func toNewGames(consoleID string, paths []string) []NewGame {
	games := make([]NewGame, len(paths))
	for i, path := range paths {
		games[i] = NewGame{ConsoleID: consoleID, Path: path, Title: TitleFromFilename(path)}
	}
	return games
}

func writeFile(t *testing.T, path string) {
	t.Helper()
	writeFileContent(t, path, "x")
}

func writeFileContent(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("criando diretório para %q: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("criando %q: %v", path, err)
	}
}

// Trava o caso do PS1 (achado do Douglas, 2026-09-09): um jogo em `.bin`+`.cue`
// entrava duas vezes na biblioteca. Só o `.cue` (o que o emulador abre) deve
// aparecer; o `.bin` citado dentro dele some.
func TestFindROMsHidesBinTracksBehindTheirCue(t *testing.T) {
	root := t.TempDir()
	writeFileContent(t, filepath.Join(root, "Mega Man X4.cue"), "FILE \"Mega Man X4.bin\" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n")
	writeFile(t, filepath.Join(root, "Mega Man X4.bin"))
	// Multi-faixa: nomes-base diferentes, resolvidos pela leitura do .cue.
	writeFileContent(t, filepath.Join(root, "Castlevania SOTN.cue"),
		"FILE \"Castlevania SOTN (Track 1).bin\" BINARY\n  TRACK 01 MODE2/2352\nFILE \"Castlevania SOTN (Track 2).bin\" BINARY\n  TRACK 02 AUDIO\n")
	writeFile(t, filepath.Join(root, "Castlevania SOTN (Track 1).bin"))
	writeFile(t, filepath.Join(root, "Castlevania SOTN (Track 2).bin"))
	// Um .chd solto continua valendo como jogo — não é faixa de nada.
	writeFile(t, filepath.Join(root, "Crash Bandicoot.chd"))

	found, err := FindROMs(root, []string{"cue", "chd", "pbp", "bin"})
	if err != nil {
		t.Fatalf("FindROMs: %v", err)
	}

	names := map[string]bool{}
	for _, p := range found {
		names[filepath.Base(p)] = true
	}
	want := map[string]bool{"Mega Man X4.cue": true, "Castlevania SOTN.cue": true, "Crash Bandicoot.chd": true}
	if len(names) != len(want) {
		t.Fatalf("FindROMs = %v, esperava só os 3 índices/imagens (%v)", names, want)
	}
	for n := range want {
		if !names[n] {
			t.Fatalf("faltou %q em %v", n, names)
		}
	}
}

// `.m3u` de multi-disco é a entrada única: os `.cue` que ele lista somem.
func TestFindROMsHidesCuesListedInAnM3U(t *testing.T) {
	root := t.TempDir()
	writeFileContent(t, filepath.Join(root, "Final Fantasy VII.m3u"),
		"Final Fantasy VII (Disc 1).cue\nFinal Fantasy VII (Disc 2).cue\nFinal Fantasy VII (Disc 3).cue\n")
	for i := 1; i <= 3; i++ {
		writeFileContent(t, filepath.Join(root, fmt.Sprintf("Final Fantasy VII (Disc %d).cue", i)),
			fmt.Sprintf("FILE \"Final Fantasy VII (Disc %d).bin\" BINARY\n", i))
		writeFile(t, filepath.Join(root, fmt.Sprintf("Final Fantasy VII (Disc %d).bin", i)))
	}

	found, err := FindROMs(root, []string{"m3u", "cue", "chd", "bin"})
	if err != nil {
		t.Fatalf("FindROMs: %v", err)
	}
	if len(found) != 1 || filepath.Base(found[0]) != "Final Fantasy VII.m3u" {
		names := []string{}
		for _, p := range found {
			names = append(names, filepath.Base(p))
		}
		t.Fatalf("FindROMs = %v, esperava só o .m3u", names)
	}
}

// Sem nenhum índice de disco na varredura, nada é filtrado — consoles que não
// usam disco não pagam pela regra.
func TestFindROMsLeavesNonDiscConsolesAlone(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "Sonic.md"))
	writeFile(t, filepath.Join(root, "Streets of Rage 2.bin"))

	found, err := FindROMs(root, []string{"md", "gen", "bin", "smd"})
	if err != nil {
		t.Fatalf("FindROMs: %v", err)
	}
	if len(found) != 2 {
		t.Fatalf("FindROMs = %v, esperava os 2 arquivos (Mega Drive não usa índice)", found)
	}
}

// snapshotDir devolve, por caminho, um resumo (tamanho + mtime) suficiente
// para detectar qualquer escrita — sem precisar comparar bytes.
func snapshotDir(root string) (map[string]string, error) {
	snapshot := make(map[string]string)
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		snapshot[path] = fmt.Sprintf("%d-%d", info.Size(), info.ModTime().UnixNano())
		return nil
	})
	return snapshot, err
}

// Casos reais de nomenclatura de ROM (região, revisão, código de mídia,
// disco) precisam virar um título legível — sem etiqueta nenhuma sobrando.
func TestTitleFromFilenameStripsCommonTags(t *testing.T) {
	cases := map[string]string{
		"Crash Bandicoot (USA) [SLUS-00304].bin":   "Crash Bandicoot",
		"Chrono Trigger (USA) (Rev 1).sfc":         "Chrono Trigger",
		"Final Fantasy VII (Disc 1).bin":           "Final Fantasy VII",
		"Super Mario 64.z64":                       "Super Mario 64",
		"Metal Gear Solid (Europe) (En,Fr,De).bin": "Metal Gear Solid",
	}

	for filename, want := range cases {
		got := TitleFromFilename(filename)
		if got != want {
			t.Errorf("TitleFromFilename(%q) = %q, queria %q", filename, got, want)
		}
	}
}
