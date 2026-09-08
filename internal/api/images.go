package api

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

// maxUploadedImageBytes limita o tamanho de uma imagem que o usuário troca
// à mão (capa de jogo ou logo de console) — mesmo teto que o scraper do
// IGDB já aceita para capa (internal/igdb/client.go, maxCoverBytes). Um
// arquivo muito maior que isso quase sempre é o usuário escolhendo o
// arquivo errado por engano, não uma imagem de alta resolução legítima.
const maxUploadedImageBytes int64 = 8 << 20 // 8 MiB

// errInvalidImage e errImageTooLarge distinguem os dois jeitos de recusar
// um arquivo escolhido pelo usuário — handleSetConsoleImage/
// handleSetGameCover traduzem cada um para o código de erro HTTP certo
// (invalid_image / image_too_large), em vez de um genérico só.
var (
	errInvalidImage  = errors.New("o arquivo escolhido não parece ser uma imagem")
	errImageTooLarge = fmt.Errorf("a imagem escolhida passa do limite de %d bytes aceito", maxUploadedImageBytes)
)

// copyValidatedImage lê sourcePath — um caminho local, escolhido pelo
// usuário no diálogo nativo de arquivo do próprio SO (o front nunca lê
// bytes de arquivo arbitrário: mesma fronteira de confiança já usada para
// pasta de ROM e binário de emulador manual, só que aqui o Go é quem abre o
// arquivo) — confirma que os bytes começam como uma imagem de verdade, e
// copia atomicamente (arquivo .tmp + rename, mesmo padrão de
// internal/igdb/client.go:downloadImage) para destPath. Não decodifica nem
// reencoda: os bytes originais são preservados como vieram, do jeito que o
// próprio scraper já trata capas baixadas.
func copyValidatedImage(sourcePath, destPath string) error {
	source, err := os.Open(sourcePath)
	if err != nil {
		return fmt.Errorf("abrindo %q: %w", sourcePath, err)
	}
	defer source.Close()

	// http.DetectContentType só precisa dos primeiros 512 bytes (ou menos,
	// se o arquivo for menor) — lê isso, valida, e continua a cópia do
	// mesmo ponto sem reabrir o arquivo.
	head := make([]byte, 512)
	n, err := io.ReadFull(source, head)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return fmt.Errorf("lendo %q: %w", sourcePath, err)
	}
	head = head[:n]
	if !bytes.HasPrefix([]byte(http.DetectContentType(head)), []byte("image/")) {
		return errInvalidImage
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return fmt.Errorf("criando a pasta de destino: %w", err)
	}

	temp := destPath + ".tmp"
	dest, err := os.Create(temp)
	if err != nil {
		return fmt.Errorf("gravando a imagem: %w", err)
	}

	written := int64(len(head))
	if _, err := dest.Write(head); err != nil {
		dest.Close()
		os.Remove(temp)
		return fmt.Errorf("gravando a imagem: %w", err)
	}

	// +1 pelo mesmo motivo de downloadImage: detecta excesso mesmo sem um
	// Content-Length confiável, já que aqui nem existe um — é leitura de
	// arquivo local.
	remaining := maxUploadedImageBytes - written + 1
	copied, err := io.Copy(dest, io.LimitReader(source, remaining))
	closeErr := dest.Close()
	if err != nil {
		os.Remove(temp)
		return fmt.Errorf("gravando a imagem: %w", err)
	}
	if closeErr != nil {
		os.Remove(temp)
		return fmt.Errorf("gravando a imagem: %w", closeErr)
	}
	if written+copied > maxUploadedImageBytes {
		os.Remove(temp)
		return errImageTooLarge
	}

	if err := os.Rename(temp, destPath); err != nil {
		os.Remove(temp)
		return fmt.Errorf("finalizando a gravação da imagem: %w", err)
	}

	return nil
}
