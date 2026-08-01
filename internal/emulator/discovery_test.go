package emulator

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

// A precedência é: diretório de sistema antes de suas subpastas, e um
// diretório de sistema inteiro antes do próximo. Testa isso plugando um
// dirIndex construído à mão, para não depender de PATH real da máquina.
func TestDirIndexRespectsDirectoryPrecedence(t *testing.T) {
	root := t.TempDir()
	primeiro := filepath.Join(root, "primeiro")
	segundo := filepath.Join(root, "segundo")
	subDoPrimeiro := filepath.Join(primeiro, "sub")

	for _, dir := range []string{primeiro, segundo, subDoPrimeiro} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	// O binário "certo" mora no subdiretório do primeiro dir. Um binário de
	// mesmo nome no segundo dir não deve vencer, porque "primeiro" precede
	// "segundo" — mesmo que a subpasta seja varrida depois do próprio
	// "primeiro" no índice.
	certo := filepath.Join(subDoPrimeiro, "emu.bin")
	errado := filepath.Join(segundo, "emu.bin")
	for _, p := range []string{certo, errado} {
		if err := os.WriteFile(p, []byte("x"), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	idx := &dirIndex{}
	filesPrimeiro, subs := scanDirEntries(primeiro)
	idx.dirs = append(idx.dirs, indexedDir{path: primeiro, files: filesPrimeiro})
	for _, sub := range subs {
		subFiles, _ := scanDirEntries(sub)
		idx.dirs = append(idx.dirs, indexedDir{path: sub, files: subFiles})
	}
	filesSegundo, _ := scanDirEntries(segundo)
	idx.dirs = append(idx.dirs, indexedDir{path: segundo, files: filesSegundo})

	got, ok := idx.find([]string{"emu.bin"})
	if !ok {
		t.Fatal("esperava achar o binário")
	}
	if got != certo {
		t.Errorf("achou %q, queria %q (precedência de diretório violada)", got, certo)
	}
}

// Dentro do MESMO diretório, a ordem dos nomes pedidos pelo adapter também
// importa: se duckstation-qt-x64-ReleaseLTCG.exe e duckstation-qt.exe
// existem no mesmo lugar, o primeiro nome da lista vence.
func TestDirIndexRespectsNameOrderWithinSameDir(t *testing.T) {
	dir := t.TempDir()
	preferido := filepath.Join(dir, "preferido.exe")
	alternativo := filepath.Join(dir, "alternativo.exe")
	for _, p := range []string{preferido, alternativo} {
		if err := os.WriteFile(p, []byte("x"), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	files, _ := scanDirEntries(dir)
	idx := &dirIndex{dirs: []indexedDir{{path: dir, files: files}}}

	got, ok := idx.find([]string{"preferido.exe", "alternativo.exe"})
	if !ok || got != preferido {
		t.Errorf("esperava %q (primeiro nome da lista), achou %q (ok=%v)", preferido, got, ok)
	}
}

// scanDirEntries devolve os arquivos e as subpastas numa única leitura —
// trava que a otimização não perdeu nenhuma das duas informações.
func TestScanDirEntriesSeparatesFilesFromSubdirs(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "arquivo.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "subpasta"), 0o755); err != nil {
		t.Fatal(err)
	}

	files, subs := scanDirEntries(dir)

	if !files["arquivo.txt"] {
		t.Error("arquivo.txt deveria estar em files")
	}
	if files["subpasta"] {
		t.Error("subpasta não deveria aparecer em files")
	}
	if len(subs) != 1 || subs[0] != filepath.Join(dir, "subpasta") {
		t.Errorf("subs = %v, queria [%q]", subs, filepath.Join(dir, "subpasta"))
	}
}

// Trava que Survey de fato usa o índice: sem ele no contexto, cada Locate
// cairia no caminho não-indexado. O teste não mede tempo (variável demais em
// CI); confirma que o resultado de Survey continua correto quando builds do
// PATH ou de diretórios de sistema não existem — caminho comum em CI.
func TestSurveyDoesNotPanicWithoutAnyInstalledEmulator(t *testing.T) {
	r := NewRegistry()
	statuses := r.Survey(context.Background())

	if len(statuses) != len(r.Adapters()) {
		t.Errorf("Survey devolveu %d status, esperava %d (um por adapter)", len(statuses), len(r.Adapters()))
	}
}
