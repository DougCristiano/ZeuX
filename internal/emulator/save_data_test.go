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
	dirs := ResolveSaveDataDirs("duckstation")
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
	dirs := ResolveSaveDataDirs("pcsx2")
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
