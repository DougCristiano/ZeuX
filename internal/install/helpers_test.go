package install

import (
	"io"
	"log/slog"
)

// discardLogger evita poluir a saída dos testes com logs de instalação.
func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
