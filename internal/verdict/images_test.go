package verdict

import (
	"os"
	"path/filepath"
	"testing"
)

// setAppDataEnv isola os.UserConfigDir() (via XDG_CONFIG_HOME/AppData) num
// diretório temporário — mesmo mecanismo de internal/igdb/scrape_test.go e
// internal/api/server_test.go, para CustomImagePath não gravar na pasta de
// dados real do usuário rodando o teste.
func setAppDataEnv(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("AppData", dir)
	return dir
}

// Trava o comportamento central de 2026-09-08: uma logo customizada pelo
// usuário (gravada fora do binário, ver CustomImagePath) vence a embutida
// no embed.FS, mesmo para um console que já tem imagem gerada por
// cmd/generate-console-images.
func TestConsoleImagePrefersCustomOverEmbedded(t *testing.T) {
	setAppDataEnv(t)

	// "n64" já tem imagem embutida (ver data/console-images/n64.png) — a
	// customização precisa vencer mesmo assim, não só preencher uma lacuna.
	embedded, ok := ConsoleImage("n64")
	if !ok {
		t.Fatalf("esperava n64 ter imagem embutida antes do teste")
	}

	dest, err := CustomImagePath("n64")
	if err != nil {
		t.Fatalf("CustomImagePath: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	custom := []byte("bytes customizados, não a logo real")
	if err := os.WriteFile(dest, custom, 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	got, ok := ConsoleImage("n64")
	if !ok {
		t.Fatalf("ConsoleImage(n64) = ok=false, esperava true com customização presente")
	}
	if string(got) != string(custom) {
		t.Fatalf("ConsoleImage(n64) devolveu a embutida (%d bytes), esperava a customizada (%d bytes)", len(embedded), len(custom))
	}
	if !HasConsoleImage("n64") {
		t.Fatalf("HasConsoleImage(n64) = false, esperava true")
	}
}

// Sem customização, o comportamento de sempre continua: cai para o embed,
// e um console sem nenhuma das duas devolve false.
func TestConsoleImageFallsBackToEmbedded(t *testing.T) {
	setAppDataEnv(t)

	if _, ok := ConsoleImage("n64"); !ok {
		t.Fatalf("ConsoleImage(n64) sem customização deveria cair pro embed")
	}
	if _, ok := ConsoleImage("console-que-nao-existe"); ok {
		t.Fatalf("ConsoleImage de console inexistente deveria devolver ok=false")
	}
	if HasConsoleImage("console-que-nao-existe") {
		t.Fatalf("HasConsoleImage de console inexistente deveria ser false")
	}
}
