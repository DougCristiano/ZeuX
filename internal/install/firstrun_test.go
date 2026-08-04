package install

import (
	"os"
	"path/filepath"
	"testing"
)

// Trava a regra: instalar o DuckStation grava portable.txt e a chave que
// pula o assistente de primeira execução, sem tocar em mais nada.
func TestSeedDuckStationPortableWritesWizardSkip(t *testing.T) {
	dir := t.TempDir()

	if err := seedFirstRun(dir, "duckstation"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, "portable.txt")); err != nil {
		t.Errorf("portable.txt não foi criado: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(dir, "settings.ini"))
	if err != nil {
		t.Fatalf("settings.ini não foi criado: %v", err)
	}

	want := "[Main]\nSetupWizardIncomplete = false\n"
	if string(got) != want {
		t.Errorf("settings.ini = %q, want %q", got, want)
	}
}

// Trava a regra: um settings.ini pré-existente (de uma atualização
// preservada, ou editado pelo usuário) nunca é sobrescrito.
func TestSeedDuckStationPortableDoesNotOverwriteExistingSettings(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.ini")

	custom := "[Main]\nSetupWizardIncomplete = false\n[Display]\nFullscreen = true\n"
	if err := os.WriteFile(settingsPath, []byte(custom), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := seedFirstRun(dir, "duckstation"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	got, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != custom {
		t.Errorf("settings.ini existente foi alterado: got %q, want %q", got, custom)
	}
}

// Trava a regra: emuladores sem mapeamento de first-run não são tocados.
func TestSeedFirstRunNoOpForUnmappedAdapter(t *testing.T) {
	dir := t.TempDir()

	// Usar um adapter que não está mapeado (flycast, rpcs3, etc.)
	if err := seedFirstRun(dir, "flycast"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Errorf("esperava diretório vazio para adapter sem mapeamento, achou %v", entries)
	}
}

// Trava a regra: atualizar um emulador em modo portátil preserva saves e
// configuração do usuário que o pacote novo não trouxe.
func TestPreservePortableUserDataCarriesForwardSavesAndSettings(t *testing.T) {
	oldDir := t.TempDir()
	newDir := t.TempDir()

	if err := os.WriteFile(filepath.Join(oldDir, "portable.txt"), nil, 0o644); err != nil {
		t.Fatal(err)
	}

	customSettings := "[Main]\nSetupWizardIncomplete = false\n[Display]\nFullscreen = true\n"
	if err := os.WriteFile(filepath.Join(oldDir, "settings.ini"), []byte(customSettings), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.MkdirAll(filepath.Join(oldDir, "memcards"), 0o755); err != nil {
		t.Fatal(err)
	}
	saveContent := "conteudo-do-save"
	if err := os.WriteFile(filepath.Join(oldDir, "memcards", "slot1.mcd"), []byte(saveContent), 0o644); err != nil {
		t.Fatal(err)
	}

	// O binário novo já existe no staging e não deve ser sobrescrito pelo antigo.
	newBinary := "binario-novo"
	if err := os.WriteFile(filepath.Join(oldDir, "duckstation-qt.exe"), []byte("binario-velho"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(newDir, "duckstation-qt.exe"), []byte(newBinary), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := preservePortableUserData(oldDir, newDir); err != nil {
		t.Fatalf("preservePortableUserData: %v", err)
	}

	gotSettings, err := os.ReadFile(filepath.Join(newDir, "settings.ini"))
	if err != nil {
		t.Fatalf("settings.ini não foi preservado: %v", err)
	}
	if string(gotSettings) != customSettings {
		t.Errorf("settings.ini preservado incorretamente: got %q, want %q", gotSettings, customSettings)
	}

	gotSave, err := os.ReadFile(filepath.Join(newDir, "memcards", "slot1.mcd"))
	if err != nil {
		t.Fatalf("save não foi preservado: %v", err)
	}
	if string(gotSave) != saveContent {
		t.Errorf("save preservado incorretamente: got %q, want %q", gotSave, saveContent)
	}

	gotBinary, err := os.ReadFile(filepath.Join(newDir, "duckstation-qt.exe"))
	if err != nil {
		t.Fatal(err)
	}
	if string(gotBinary) != newBinary {
		t.Errorf("o binário do pacote novo deveria ter prioridade sobre o antigo: got %q", gotBinary)
	}
}

// Trava a regra: instalação anterior sem portable.txt não aciona a
// preservação — emuladores fora do modo portátil não guardam dado de usuário
// no diretório gerenciado.
func TestPreservePortableUserDataSkipsNonPortableInstalls(t *testing.T) {
	oldDir := t.TempDir()
	newDir := t.TempDir()

	if err := os.WriteFile(filepath.Join(oldDir, "algum-arquivo.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := preservePortableUserData(oldDir, newDir); err != nil {
		t.Fatalf("preservePortableUserData: %v", err)
	}

	entries, err := os.ReadDir(newDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Errorf("não deveria ter copiado nada sem portable.txt, achou %v", entries)
	}
}

// Trava a regra: instalar PCSX2 grava a chave que pula o assistente de
// primeira execução no arquivo de configuração.
func TestSeedPCSX2WritesWizardSkip(t *testing.T) {
	dir := t.TempDir()

	if err := seedFirstRun(dir, "pcsx2"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	iniPath := filepath.Join(dir, "inis", "PCSX2_qt.ini")
	got, err := os.ReadFile(iniPath)
	if err != nil {
		t.Fatalf("inis/PCSX2_qt.ini não foi criado: %v", err)
	}

	want := "[Main]\n"
	if string(got) != want {
		t.Errorf("PCSX2_qt.ini = %q, want %q", got, want)
	}
}

// Trava a regra: um arquivo PCSX2_qt.ini pré-existente nunca é sobrescrito.
func TestSeedPCSX2DoesNotOverwriteExistingSettings(t *testing.T) {
	dir := t.TempDir()
	iniDir := filepath.Join(dir, "inis")
	if err := os.MkdirAll(iniDir, 0o755); err != nil {
		t.Fatal(err)
	}

	iniPath := filepath.Join(iniDir, "PCSX2_qt.ini")
	custom := "[Main]\nGPURenderer=Vulkan\n"
	if err := os.WriteFile(iniPath, []byte(custom), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := seedFirstRun(dir, "pcsx2"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	got, err := os.ReadFile(iniPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != custom {
		t.Errorf("PCSX2_qt.ini existente foi alterado: got %q, want %q", got, custom)
	}
}

// Trava a regra: instalar Dolphin grava a chave que marca o prompt de
// analytics como respondido, suppressando o wizard.
func TestSeedDolphinWritesAnalyticsPermission(t *testing.T) {
	dir := t.TempDir()

	if err := seedFirstRun(dir, "dolphin"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	iniPath := filepath.Join(dir, "Dolphin.ini")
	got, err := os.ReadFile(iniPath)
	if err != nil {
		t.Fatalf("Dolphin.ini não foi criado: %v", err)
	}

	want := "[Analytics]\nPermissionAsked = 1\n"
	if string(got) != want {
		t.Errorf("Dolphin.ini = %q, want %q", got, want)
	}
}

// Trava a regra: um arquivo Dolphin.ini pré-existente nunca é sobrescrito.
func TestSeedDolphinDoesNotOverwriteExistingSettings(t *testing.T) {
	dir := t.TempDir()
	iniPath := filepath.Join(dir, "Dolphin.ini")

	custom := "[Analytics]\nPermissionAsked = 1\nID = someid\n"
	if err := os.WriteFile(iniPath, []byte(custom), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := seedFirstRun(dir, "dolphin"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	got, err := os.ReadFile(iniPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != custom {
		t.Errorf("Dolphin.ini existente foi alterado: got %q, want %q", got, custom)
	}
}

// Trava a regra: instalar PPSSPP grava a chave FirstRun=false, suppressando
// o wizard de primeira execução.
func TestSeedPPSSPPWritesFirstRunFlag(t *testing.T) {
	dir := t.TempDir()

	if err := seedFirstRun(dir, "ppsspp"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	iniPath := filepath.Join(dir, "ppsspp.ini")
	got, err := os.ReadFile(iniPath)
	if err != nil {
		t.Fatalf("ppsspp.ini não foi criado: %v", err)
	}

	want := "[General]\nFirstRun = false\n"
	if string(got) != want {
		t.Errorf("ppsspp.ini = %q, want %q", got, want)
	}
}

// Trava a regra: um arquivo ppsspp.ini pré-existente nunca é sobrescrito.
func TestSeedPPSSPPDoesNotOverwriteExistingSettings(t *testing.T) {
	dir := t.TempDir()
	iniPath := filepath.Join(dir, "ppsspp.ini")

	custom := "[General]\nFirstRun = false\nInternalResolution=2\n"
	if err := os.WriteFile(iniPath, []byte(custom), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := seedFirstRun(dir, "ppsspp"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	got, err := os.ReadFile(iniPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != custom {
		t.Errorf("ppsspp.ini existente foi alterado: got %q, want %q", got, custom)
	}
}
