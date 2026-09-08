package verdict

import (
	"embed"
	"os"
	"path/filepath"

	"github.com/doufl/zeux/internal/emulator"
)

// consoleImages embute a logo de cada console que já foi gerada por
// cmd/generate-console-images — ver data/console-images/README.md para o
// porquê e como gerar. `all:` não é necessário aqui (nenhum arquivo com "_"
// ou "." no início a esconder); o padrão sem prefixo já pega README.md e
// qualquer <id>.png presente.
//
//go:embed data/console-images/*
var consoleImages embed.FS

// customImageDir é onde uma logo trocada pelo usuário (2026-09-08) mora —
// fora do binário, na mesma pasta de dados do zeuxd (zeux.db,
// consent.json), para sobreviver a uma atualização do app. Erro ao resolver
// a pasta (raro: só falha se os.UserConfigDir() falhar) é tratado como "sem
// customização", nunca como fatal — a logo embutida/ícone de sigla continua
// funcionando.
func customImageDir() (string, error) {
	dir, err := emulator.AppDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "console-images"), nil
}

// customImagePath é o caminho do arquivo customizado de um console, se
// existir. CustomImagePath é exportado para o handler HTTP gravar/apagar no
// mesmo lugar que ConsoleImage lê.
func CustomImagePath(consoleID string) (string, error) {
	dir, err := customImageDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, consoleID+".png"), nil
}

// ConsoleImage devolve os bytes da logo de um console — uma logo
// customizada pelo usuário (ver CustomImagePath) tem prioridade sobre a
// embutida, que por sua vez é o estado normal antes de rodar o gerador, ou
// para um console que o IGDB não tem logo cadastrada. Sem nenhuma das duas,
// a interface cai para ConsoleIcon (sigla), nunca quebra.
func ConsoleImage(consoleID string) ([]byte, bool) {
	if path, err := CustomImagePath(consoleID); err == nil {
		if data, err := os.ReadFile(path); err == nil {
			return data, true
		}
	}

	data, err := consoleImages.ReadFile("data/console-images/" + consoleID + ".png")
	if err != nil {
		return nil, false
	}
	return data, true
}

// HasConsoleImage é ConsoleImage sem carregar os bytes — usado por
// GET /consoles para anunciar has_image sem servir o arquivo inteiro na
// mesma resposta.
func HasConsoleImage(consoleID string) bool {
	if path, err := CustomImagePath(consoleID); err == nil {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}

	_, err := consoleImages.ReadFile("data/console-images/" + consoleID + ".png")
	return err == nil
}
