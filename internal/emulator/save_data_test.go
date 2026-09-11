package emulator

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Trava que só o PCSX2 devolve local conhecido — todo adapter não coberto
// ainda tem que sair com Known=false, nunca um caminho chutado (princípio 4).
func TestResolveSaveDataDirsUnknownAdapter(t *testing.T) {
	dirs := ResolveSaveDataDirs("duckstation", Installation{})
	if dirs.Known {
		t.Fatal("DuckStation não tem local de save verificado ainda; Known deveria ser false")
	}
	if dirs.MemoryCardsDir != "" || dirs.SaveStatesDir != "" {
		t.Fatal("adapter não coberto não deveria vir com caminho nenhum preenchido")
	}
}

// Trava que o PCSX2 aponta memcards/sstates dentro da mesma pasta de dados
// usada por pcsx2ConfigPath — nomes citados do teste ao vivo, não palpite
// (ver doc comment de ResolveSaveDataDirs).
func TestResolveSaveDataDirsPCSX2(t *testing.T) {
	dirs := ResolveSaveDataDirs("pcsx2", Installation{})
	if !dirs.Known {
		t.Fatal("PCSX2 tem local de save verificado ao vivo; Known deveria ser true")
	}
	if filepath.Base(dirs.MemoryCardsDir) != "memcards" {
		t.Fatalf("esperava subpasta memcards, veio %q", dirs.MemoryCardsDir)
	}
	if filepath.Base(dirs.SaveStatesDir) != "sstates" {
		t.Fatalf("esperava subpasta sstates, veio %q", dirs.SaveStatesDir)
	}
}

// Trava que o RetroArch só devolve Known=true quando o retroarch.cfg real
// tem um caminho fixo gravado — "default" (o sentinela do próprio
// retroarch.cfg-modelo para "salvar ao lado do jogo") continua Known=false,
// porque não existe uma pasta única para mostrar nesse caso.
func TestResolveSaveDataDirsRetroArchDefaultIsUnknown(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "retroarch.cfg")
	cfg := "savefile_directory = \"default\"\nsavestate_directory = \"default\"\n"
	if err := os.WriteFile(path, []byte(cfg), 0o644); err != nil {
		t.Fatal(err)
	}

	orig := retroArchConfigPath
	retroArchConfigPath = func(Installation) (string, error) { return path, nil }
	defer func() { retroArchConfigPath = orig }()

	dirs := ResolveSaveDataDirs("retroarch", Installation{})
	if dirs.Known {
		t.Fatalf("savefile_directory/savestate_directory = \"default\" não deveria contar como conhecido: %+v", dirs)
	}
}

// Trava que um retroarch.cfg com caminho fixo de verdade sai Known=true com
// o caminho lido do arquivo — sem tocar em ListSaveFiles/disco nenhum.
func TestResolveSaveDataDirsRetroArchWithFixedPaths(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "retroarch.cfg")
	cfg := "savefile_directory = \"/home/user/saves\"\nsavestate_directory = \"default\"\n"
	if err := os.WriteFile(path, []byte(cfg), 0o644); err != nil {
		t.Fatal(err)
	}

	orig := retroArchConfigPath
	retroArchConfigPath = func(Installation) (string, error) { return path, nil }
	defer func() { retroArchConfigPath = orig }()

	dirs := ResolveSaveDataDirs("retroarch", Installation{})
	if !dirs.Known {
		t.Fatal("savefile_directory com caminho fixo deveria bastar para Known=true")
	}
	if dirs.MemoryCardsDir != "/home/user/saves" {
		t.Fatalf("esperava o caminho lido do cfg, veio %q", dirs.MemoryCardsDir)
	}
	if dirs.SaveStatesDir != "" {
		t.Fatalf("savestate_directory = \"default\" deveria sair vazio, veio %q", dirs.SaveStatesDir)
	}
}

// Trava que SetSaveDataDirs grava as duas chaves com o caminho pedido, e
// que a pasta de destino é criada — sem depender do RetroArch criar
// sozinho.
func TestRetroArchSetSaveDataDirsWritesFixedPaths(t *testing.T) {
	base := t.TempDir()
	cfgPath := filepath.Join(base, "retroarch.cfg")

	orig := retroArchConfigPath
	retroArchConfigPath = func(Installation) (string, error) { return cfgPath, nil }
	defer func() { retroArchConfigPath = orig }()

	adapter := newRetroArch().(SaveDataConfigurableAdapter)

	memCards := filepath.Join(base, "meus-saves")
	states := filepath.Join(base, "meus-states")
	if err := adapter.SetSaveDataDirs(Installation{}, SaveDataDirs{
		MemoryCardsDir: memCards,
		SaveStatesDir:  states,
	}); err != nil {
		t.Fatalf("SetSaveDataDirs: %v", err)
	}

	if _, err := os.Stat(memCards); err != nil {
		t.Fatalf("pasta de memory card deveria ter sido criada: %v", err)
	}
	if _, err := os.Stat(states); err != nil {
		t.Fatalf("pasta de save state deveria ter sido criada: %v", err)
	}

	dirs := retroArchSaveDataDirs("retroarch", cfgPath)
	if !dirs.Known {
		t.Fatal("depois de SetSaveDataDirs com caminho fixo, Known deveria ser true")
	}
	if dirs.MemoryCardsDir != memCards || dirs.SaveStatesDir != states {
		t.Fatalf("caminhos gravados não batem: %+v", dirs)
	}
}

// Trava que um campo vazio volta a chave para "default" (sentinela do
// RetroArch para "ao lado do jogo"), nunca deixa a chave como estava.
func TestRetroArchSetSaveDataDirsEmptyResetsToDefault(t *testing.T) {
	base := t.TempDir()
	cfgPath := filepath.Join(base, "retroarch.cfg")
	initial := "savefile_directory = \"/algo/fixo\"\n"
	if err := os.WriteFile(cfgPath, []byte(initial), 0o644); err != nil {
		t.Fatal(err)
	}

	orig := retroArchConfigPath
	retroArchConfigPath = func(Installation) (string, error) { return cfgPath, nil }
	defer func() { retroArchConfigPath = orig }()

	adapter := newRetroArch().(SaveDataConfigurableAdapter)
	if err := adapter.SetSaveDataDirs(Installation{}, SaveDataDirs{}); err != nil {
		t.Fatalf("SetSaveDataDirs: %v", err)
	}

	dirs := retroArchSaveDataDirs("retroarch", cfgPath)
	if dirs.Known {
		t.Fatalf("campos vazios deveriam voltar para \"default\" (Known=false), veio %+v", dirs)
	}
}

// Trava que uma pasta ausente é lista vazia, não erro — é o estado normal
// de quem nunca salvou nada ali.
func TestListSaveFilesMissingDir(t *testing.T) {
	files, err := ListSaveFiles(filepath.Join(t.TempDir(), "nao-existe"))
	if err != nil {
		t.Fatalf("pasta ausente não deveria dar erro: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("esperava lista vazia, veio %d arquivos", len(files))
	}
}

// Trava a ordenação (mais recente primeiro) e que subpastas são ignoradas.
func TestListSaveFilesOrdersByModTimeDescending(t *testing.T) {
	dir := t.TempDir()

	old := filepath.Join(dir, "velho.mcd")
	if err := os.WriteFile(old, []byte("a"), 0o644); err != nil {
		t.Fatal(err)
	}
	oldTime := time.Now().Add(-time.Hour)
	if err := os.Chtimes(old, oldTime, oldTime); err != nil {
		t.Fatal(err)
	}

	recent := filepath.Join(dir, "recente.mcd")
	if err := os.WriteFile(recent, []byte("bb"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.Mkdir(filepath.Join(dir, "subpasta"), 0o755); err != nil {
		t.Fatal(err)
	}

	files, err := ListSaveFiles(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 {
		t.Fatalf("esperava 2 arquivos (subpasta ignorada), veio %d", len(files))
	}
	if files[0].Name != "recente.mcd" || files[1].Name != "velho.mcd" {
		t.Fatalf("ordem errada: %+v", files)
	}
}
