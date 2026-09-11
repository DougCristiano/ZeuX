package install

import (
	"archive/zip"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/doufl/zeux/internal/emulator"
)

// Trava os três formatos aceitos e a mensagem de rejeição pro resto — quem
// aponta um .exe solto aqui recebe uma frase dizendo pra usar o campo
// direto, não um erro genérico.
func TestArchiveKindFromExt(t *testing.T) {
	cases := []struct {
		path string
		want Archive
	}{
		{"meuemulador.zip", ArchiveZip},
		{"MeuEmulador.ZIP", ArchiveZip},
		{"meuemulador.7z", Archive7z},
		{"meuemulador.tar.gz", ArchiveTarGz},
		{"meuemulador.tgz", ArchiveTarGz},
	}
	for _, c := range cases {
		got, err := archiveKindFromExt(c.path)
		if err != nil {
			t.Errorf("%s: erro inesperado: %v", c.path, err)
		}
		if got != c.want {
			t.Errorf("%s: esperava %s, veio %s", c.path, c.want, got)
		}
	}

	if _, err := archiveKindFromExt("meuemulador.exe"); err == nil {
		t.Error(".exe deveria ser rejeitado — não é um pacote")
	}
}

// Trava que o nome de pasta derivado do arquivo nunca carrega caractere
// perigoso pra caminho, mesmo com um nome de arquivo hostil.
func TestCustomPackageDirNameSanitizes(t *testing.T) {
	name := customPackageDirName("../../etc/passwd; rm -rf ~.zip")
	if strings.ContainsAny(name, "/;~ ") {
		t.Fatalf("nome de pasta não sanitizado: %q", name)
	}
}

// Trava que a varredura acha o executável e ignora um arquivo comum ao
// lado dele — no Linux/macOS via bit de execução (o mesmo critério de
// emulator.IsExecutableFile); o filtro extra por ".exe" no Windows não é
// exercitado aqui porque a suíte roda em Linux, mas a lógica está isolada
// em looksLikeEmulatorBinary para poder ser revista.
func TestScanForExecutablesFindsBinaryIgnoresOthers(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("bit de execução não existe no Windows; ver looksLikeEmulatorBinary")
	}

	dir := t.TempDir()
	bin := filepath.Join(dir, "meuemulador")
	if err := os.WriteFile(bin, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	readme := filepath.Join(dir, "README.txt")
	if err := os.WriteFile(readme, []byte("oi"), 0o644); err != nil {
		t.Fatal(err)
	}

	found, err := scanForExecutables(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 || found[0] != bin {
		t.Fatalf("esperava só %q, veio %v", bin, found)
	}
}

// Ponta a ponta: um .zip de verdade, extraído e com o executável achado.
// Usa emulator.ManagedRoot() de propósito — mesmo padrão de
// manager_test.go, que já resolve esse caminho sem mock — e limpa o que
// criou.
func TestExtractCustomEmulatorPackageEndToEnd(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("bit de execução não existe no Windows; ver looksLikeEmulatorBinary")
	}

	zipPath := filepath.Join(t.TempDir(), "meuemulador-v1.zip")
	writeTestZip(t, zipPath, map[string]testZipEntry{
		"meuemulador-v1/meuemulador": {content: []byte("binario falso"), mode: 0o755},
		"meuemulador-v1/README.txt":  {content: []byte("oi"), mode: 0o644},
	})

	dest, candidates, err := ExtractCustomEmulatorPackage(zipPath)
	if err != nil {
		t.Fatalf("ExtractCustomEmulatorPackage: %v", err)
	}
	defer os.RemoveAll(dest)

	binPath := filepath.Join(dest, "meuemulador")
	if len(candidates) != 1 || candidates[0] != binPath {
		t.Fatalf("esperava só %q como candidato, veio %v", binPath, candidates)
	}
	if !emulator.IsExecutableFile(candidates[0]) {
		t.Fatal("candidato devolvido não é executável de verdade")
	}
}

type testZipEntry struct {
	content []byte
	mode    os.FileMode
}

// writeTestZip monta um .zip mínimo em memória, um arquivo por entrada, com
// o modo Unix gravado no header — archive/zip.Writer.Create() sozinho não
// marca bit de execução nenhum, e é exatamente esse bit que
// scanForExecutables usa fora do Windows.
func writeTestZip(t *testing.T, path string, files map[string]testZipEntry) {
	t.Helper()

	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	w := zip.NewWriter(f)
	for name, e := range files {
		header := &zip.FileHeader{Name: name, Method: zip.Deflate}
		header.SetMode(e.mode)
		entry, err := w.CreateHeader(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write(e.content); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
}
