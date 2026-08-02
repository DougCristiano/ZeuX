package install

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/bodgit/sevenzip"
)

// maxExtractedBytes limita o total descompactado, defesa contra um arquivo
// pequeno que se expande até encher o disco.
const maxExtractedBytes int64 = 8 << 30 // 8 GiB

// safeJoin resolve o caminho de uma entrada do arquivo dentro do destino e
// recusa qualquer coisa que escape dele.
//
// É a defesa contra zip slip: uma entrada chamada "../../../.bashrc" faria a
// extração sobrescrever arquivos fora do diretório de instalação. Vale para
// todo formato, porque o nome da entrada é sempre controlado por quem montou o
// pacote — e nós baixamos pacotes da internet.
func safeJoin(destDir, entryName string) (string, error) {
	if entryName == "" {
		return "", fmt.Errorf("entrada sem nome")
	}

	// Caminhos absolutos e nomes de dispositivo do Windows nunca são válidos
	// dentro de um pacote.
	if filepath.IsAbs(entryName) || strings.HasPrefix(entryName, "/") || strings.Contains(entryName, ":") {
		return "", fmt.Errorf("entrada com caminho absoluto: %q", entryName)
	}

	// Alguns pacotes (o do Azahar, por exemplo) usam "\" como separador mesmo
	// vindo de um build feito no Windows, mas rodamos extração também em
	// Linux/macOS, onde filepath.FromSlash não faz nada com "\" — ele só
	// normaliza "/". Sem esta troca, "plugins\generic\qt.dll" viraria um único
	// nome de arquivo com barras invertidas literais, em vez de duas pastas.
	normalized := strings.ReplaceAll(entryName, "\\", "/")
	cleaned := filepath.Clean(filepath.FromSlash(normalized))
	target := filepath.Join(destDir, cleaned)

	// A comparação com o separador no final evita que "/destino-malicioso"
	// passe por ser prefixo textual de "/destino".
	rel, err := filepath.Rel(destDir, target)
	if err != nil {
		return "", fmt.Errorf("entrada fora do destino: %q", entryName)
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("entrada tentando escapar do destino: %q", entryName)
	}

	return target, nil
}

// isDirEntry decide se uma entrada do pacote é um diretório.
//
// O padrão ZIP usa "/" como separador e marca diretórios com esse sufixo, mas
// nem todo empacotador segue isso à risca: o pacote do Azahar usa "\" dentro
// do próprio nome da entrada (comum em builds geradas no Windows) e não marca
// o atributo de pasta do MS-DOS. entry.FileInfo().IsDir() do archive/zip não
// reconhece esse caso — o marcador de pasta vazio vira um arquivo, e a
// extração trava ao tentar criar algo dentro dele. Checar o sufixo cru do
// nome, antes de qualquer normalização, cobre os dois formatos.
func isDirEntry(rawName string, reportedDir bool) bool {
	return reportedDir || strings.HasSuffix(rawName, "/") || strings.HasSuffix(rawName, "\\")
}

// Extract descompacta o pacote no diretório de destino.
func Extract(archivePath, destDir string, kind Archive) error {
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return err
	}

	switch kind {
	case ArchiveZip:
		return extractZip(archivePath, destDir)
	case Archive7z:
		return extract7z(archivePath, destDir)
	case ArchiveTarGz:
		return extractTarGz(archivePath, destDir)
	case ArchiveAppImage:
		return installAppImage(archivePath, destDir)
	default:
		return fmt.Errorf("formato de pacote não suportado: %q", kind)
	}
}

func extractZip(archivePath, destDir string) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return fmt.Errorf("abrindo o zip: %w", err)
	}
	defer reader.Close()

	var written int64
	for _, entry := range reader.File {
		target, err := safeJoin(destDir, entry.Name)
		if err != nil {
			return err
		}

		if isDirEntry(entry.Name, entry.FileInfo().IsDir()) {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}

		source, err := entry.Open()
		if err != nil {
			return err
		}

		n, err := writeEntry(target, source, entry.Mode())
		source.Close()
		if err != nil {
			return err
		}

		if written += n; written > maxExtractedBytes {
			return fmt.Errorf("o pacote descompactado passou do tamanho aceito")
		}
	}

	return nil
}

func extract7z(archivePath, destDir string) error {
	reader, err := sevenzip.OpenReader(archivePath)
	if err != nil {
		return fmt.Errorf("abrindo o 7z: %w", err)
	}
	defer reader.Close()

	var written int64
	for _, entry := range reader.File {
		target, err := safeJoin(destDir, entry.Name)
		if err != nil {
			return err
		}

		if isDirEntry(entry.Name, entry.FileInfo().IsDir()) {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}

		source, err := entry.Open()
		if err != nil {
			return err
		}

		n, err := writeEntry(target, source, entry.Mode())
		source.Close()
		if err != nil {
			return err
		}

		if written += n; written > maxExtractedBytes {
			return fmt.Errorf("o pacote descompactado passou do tamanho aceito")
		}
	}

	return nil
}

func extractTarGz(archivePath, destDir string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()

	gz, err := gzip.NewReader(file)
	if err != nil {
		return fmt.Errorf("abrindo o tar.gz: %w", err)
	}
	defer gz.Close()

	reader := tar.NewReader(gz)
	var written int64

	for {
		header, err := reader.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}

		target, err := safeJoin(destDir, header.Name)
		if err != nil {
			return err
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			n, err := writeEntry(target, reader, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if written += n; written > maxExtractedBytes {
				return fmt.Errorf("o pacote descompactado passou do tamanho aceito")
			}
		default:
			// Links simbólicos são ignorados de propósito: um link apontando
			// para fora do destino seria outra forma de escapar do diretório.
			continue
		}
	}
}

// installAppImage trata o caso do AppImage, que não é um pacote e sim o próprio
// executável — basta colocá-lo no lugar com permissão de execução.
func installAppImage(archivePath, destDir string) error {
	target := filepath.Join(destDir, filepath.Base(archivePath))

	source, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer source.Close()

	if _, err := writeEntry(target, source, 0o755); err != nil {
		return err
	}

	return os.Chmod(target, 0o755)
}

// writeEntry grava uma entrada do pacote, criando os diretórios necessários.
func writeEntry(target string, source io.Reader, mode os.FileMode) (int64, error) {
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return 0, err
	}

	if mode == 0 {
		mode = 0o644
	}

	file, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode.Perm())
	if err != nil {
		return 0, err
	}
	defer file.Close()

	return io.Copy(file, io.LimitReader(source, maxExtractedBytes))
}

// flattenSingleRoot resolve o caso comum de o pacote conter uma única pasta
// raiz — "DuckStation-1.0/duckstation-qt.exe" em vez do executável na raiz.
//
// Sem isso, a descoberta encontraria o binário só por causa da busca de um
// nível, e a pasta gerenciada ficaria com um nível a mais que o esperado.
func flattenSingleRoot(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	if len(entries) != 1 || !entries[0].IsDir() {
		return nil
	}

	inner := filepath.Join(dir, entries[0].Name())
	innerEntries, err := os.ReadDir(inner)
	if err != nil {
		return err
	}

	for _, entry := range innerEntries {
		from := filepath.Join(inner, entry.Name())
		to := filepath.Join(dir, entry.Name())
		if err := os.Rename(from, to); err != nil {
			return err
		}
	}

	return os.Remove(inner)
}
