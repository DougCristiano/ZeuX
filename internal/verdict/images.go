package verdict

import "embed"

// consoleImages embute a logo de cada console que já foi gerada por
// cmd/generate-console-images — ver data/console-images/README.md para o
// porquê e como gerar. `all:` não é necessário aqui (nenhum arquivo com "_"
// ou "." no início a esconder); o padrão sem prefixo já pega README.md e
// qualquer <id>.png presente.
//
//go:embed data/console-images/*
var consoleImages embed.FS

// ConsoleImage devolve os bytes da logo de um console, se ela já foi gerada.
// Ausência não é erro — é o estado normal antes de rodar o gerador, ou para
// um console que o IGDB não tem logo cadastrada. A interface cai para
// ConsoleIcon (sigla) nesse caso, nunca quebra.
func ConsoleImage(consoleID string) ([]byte, bool) {
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
	_, err := consoleImages.ReadFile("data/console-images/" + consoleID + ".png")
	return err == nil
}
