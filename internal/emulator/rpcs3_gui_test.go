package emulator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Trava que o ZeuX silencia a tela de boas-vindas do RPCS3 sem pisar numa
// escolha que a pessoa já fez no arquivo de interface.
func TestSuppressRPCS3WelcomeKeepsExistingChoice(t *testing.T) {
	exeDir := t.TempDir()
	// A pasta portable/ ao lado do executável vence em qualquer SO — deixa o
	// teste independente de variável de ambiente e de diretório do usuário.
	dir := filepath.Join(exeDir, "portable")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	install := Installation{BinaryPath: filepath.Join(exeDir, "rpcs3.exe")}

	if err := suppressRPCS3Welcome(install); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "GuiConfigs", "CurrentSettings.ini")
	data, err := os.ReadFile(path)
	if err != nil || !strings.Contains(string(data), "showWelcome = false") {
		t.Fatalf("esperava showWelcome gravado em %s, leu %q (err %v)", path, data, err)
	}

	// Escolha explícita de quem quer ver a janela: não é sobrescrita.
	if err := os.WriteFile(path, []byte("[infoBox]\nshowWelcome=true\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := suppressRPCS3Welcome(install); err != nil {
		t.Fatal(err)
	}
	data, _ = os.ReadFile(path)
	if !strings.Contains(string(data), "showWelcome=true") {
		t.Fatalf("a escolha existente foi sobrescrita: %q", data)
	}
}
