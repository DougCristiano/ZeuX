package install

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Estes testes cobrem o caminho em que o ZeuX escreve no disco arquivos vindos
// da internet. Um erro aqui não é um bug de conveniência: é sobrescrever
// arquivos fora do diretório de instalação.

// makeZip monta um zip em memória com as entradas dadas.
func makeZip(t *testing.T, entries map[string]string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "pacote.zip")
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("criando zip: %v", err)
	}
	defer file.Close()

	writer := zip.NewWriter(file)
	for name, content := range entries {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatalf("criando entrada %q: %v", name, err)
		}
		if _, err := entry.Write([]byte(content)); err != nil {
			t.Fatalf("escrevendo entrada %q: %v", name, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("fechando zip: %v", err)
	}

	return path
}

// Zip slip: uma entrada com ".." escaparia do destino e sobrescreveria
// arquivos do usuário. O nome da entrada é sempre controlado por quem montou o
// pacote, e nós baixamos pacotes da internet.
func TestExtractRefusesPathTraversal(t *testing.T) {
	malicious := []string{
		"../escapou.txt",
		"../../escapou.txt",
		"pasta/../../escapou.txt",
		"./../escapou.txt",
	}

	for _, name := range malicious {
		t.Run(name, func(t *testing.T) {
			archive := makeZip(t, map[string]string{name: "conteudo malicioso"})
			dest := filepath.Join(t.TempDir(), "destino")

			err := Extract(archive, dest, ArchiveZip)
			if err == nil {
				t.Fatalf("a extração de %q deveria ter sido recusada", name)
			}
			if !strings.Contains(err.Error(), "escapar") && !strings.Contains(err.Error(), "fora do destino") {
				t.Errorf("erro deveria indicar tentativa de escape, veio: %v", err)
			}

			// Confirma que nada foi escrito fora do destino.
			parent := filepath.Dir(dest)
			if _, err := os.Stat(filepath.Join(parent, "escapou.txt")); err == nil {
				t.Error("arquivo foi escrito FORA do diretório de destino")
			}
		})
	}
}

func TestSafeJoinRejectsAbsolutePaths(t *testing.T) {
	dest := t.TempDir()

	for _, name := range []string{"/etc/passwd", "C:\\Windows\\System32\\drivers\\etc\\hosts", "/tmp/x"} {
		if _, err := safeJoin(dest, name); err == nil {
			t.Errorf("caminho absoluto %q deveria ser recusado", name)
		}
	}
}

// Um destino cujo nome é prefixo textual de outro não pode ser confundido:
// "/tmp/destino-malicioso" começa com "/tmp/destino", mas está fora dele.
func TestSafeJoinIsNotFooledByPrefix(t *testing.T) {
	base := t.TempDir()
	dest := filepath.Join(base, "destino")

	if _, err := safeJoin(dest, "../destino-malicioso/arquivo.txt"); err == nil {
		t.Error("caminho irmão com prefixo comum deveria ser recusado")
	}
}

func TestExtractZipHappyPath(t *testing.T) {
	archive := makeZip(t, map[string]string{
		"duckstation-qt.exe":       "binario",
		"cores/mesen_libretro.dll": "core",
		"docs/leiame.txt":          "texto",
	})

	dest := filepath.Join(t.TempDir(), "destino")
	if err := Extract(archive, dest, ArchiveZip); err != nil {
		t.Fatalf("extraindo: %v", err)
	}

	for _, expected := range []string{"duckstation-qt.exe", filepath.Join("cores", "mesen_libretro.dll")} {
		if _, err := os.Stat(filepath.Join(dest, expected)); err != nil {
			t.Errorf("arquivo %q não foi extraído: %v", expected, err)
		}
	}
}

// Trava um bug real, achado ao instalar o Azahar de verdade: o pacote dele
// usa "\" dentro do nome da entrada (em vez do "/" que o padrão ZIP exige)
// para o marcador de pasta vazia "plugins\", sem o atributo de pasta do
// MS-DOS. entry.FileInfo().IsDir() do archive/zip não reconhece isso como
// diretório — sem a checagem extra em isDirEntry, o marcador vira um arquivo
// vazio chamado "plugins", e a extração falha ao tentar criar
// "plugins/generic/arquivo.dll" dentro dele.
func TestExtractZipRecognizesBackslashDirectoryMarker(t *testing.T) {
	archive := makeZip(t, map[string]string{
		"plugins\\":                "",
		"plugins\\generic\\qt.dll": "conteudo",
	})

	dest := filepath.Join(t.TempDir(), "destino")
	if err := Extract(archive, dest, ArchiveZip); err != nil {
		t.Fatalf("extraindo: %v", err)
	}

	info, err := os.Stat(filepath.Join(dest, "plugins"))
	if err != nil {
		t.Fatalf("pasta plugins não foi criada: %v", err)
	}
	if !info.IsDir() {
		t.Fatal("plugins deveria ser um diretório, não um arquivo")
	}

	got, err := os.ReadFile(filepath.Join(dest, "plugins", "generic", "qt.dll"))
	if err != nil {
		t.Fatalf("arquivo dentro de plugins não foi extraído: %v", err)
	}
	if string(got) != "conteudo" {
		t.Errorf("conteúdo = %q, want %q", got, "conteudo")
	}
}

// Vários pacotes trazem tudo dentro de uma única pasta raiz. Achatar deixa o
// binário onde a descoberta espera encontrá-lo.
func TestFlattenSingleRoot(t *testing.T) {
	dest := t.TempDir()
	inner := filepath.Join(dest, "DuckStation-1.0")

	if err := os.MkdirAll(filepath.Join(inner, "cores"), 0o755); err != nil {
		t.Fatalf("preparando: %v", err)
	}
	if err := os.WriteFile(filepath.Join(inner, "duckstation-qt.exe"), []byte("x"), 0o644); err != nil {
		t.Fatalf("preparando: %v", err)
	}

	if err := flattenSingleRoot(dest); err != nil {
		t.Fatalf("achatando: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dest, "duckstation-qt.exe")); err != nil {
		t.Errorf("o executável deveria ter subido um nível: %v", err)
	}
	if _, err := os.Stat(inner); !os.IsNotExist(err) {
		t.Error("a pasta intermediária deveria ter sumido")
	}
}

// Achatar só vale para uma única pasta raiz. Com o binário já na raiz, mexer
// seria errado.
func TestFlattenLeavesMultipleEntriesAlone(t *testing.T) {
	dest := t.TempDir()

	if err := os.WriteFile(filepath.Join(dest, "emulador.exe"), []byte("x"), 0o644); err != nil {
		t.Fatalf("preparando: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dest, "cores"), 0o755); err != nil {
		t.Fatalf("preparando: %v", err)
	}

	if err := flattenSingleRoot(dest); err != nil {
		t.Fatalf("achatando: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dest, "emulador.exe")); err != nil {
		t.Errorf("o executável na raiz deveria ter ficado onde estava: %v", err)
	}
}
