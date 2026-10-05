package install

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Trava a regra: instalar o DuckStation grava portable.txt e as chaves que
// pulam o assistente de primeira execução e o prompt de criar atalho de
// launcher (este último só dispara rodando como AppImage no Linux —
// QtHost::CheckDesktopFile, achado incomodando o Douglas de verdade em
// 2026-08-04), sem tocar em mais nada.
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

	want := "[Main]\nSetupWizardIncomplete = false\nNoDesktopFile = true\n"
	if !strings.HasPrefix(string(got), want) {
		t.Errorf("settings.ini = %q, want prefixo %q", got, want)
	}
	// O jogador 1 nasce com controle E teclado: sem [Pad1] o DuckStation,
	// que não aplica os padrões dele quando o arquivo já existe, abria sem
	// bind nenhum.
	for _, line := range []string{"Cross = SDL-0/A\n", "Cross = Keyboard/K\n"} {
		if !strings.Contains(string(got), line) {
			t.Errorf("settings.ini sem %q:\n%s", line, got)
		}
	}
}

// Trava a regra de 2026-10-05: um settings.ini pré-existente (atualização
// preservada, ou criado pelo próprio DuckStation) é MESCLADO, nunca
// sobrescrito — o que a pessoa já tinha fica, o que falta (atalhos, botões,
// auto-update desligado) entra. Antes o seed pulava o arquivo inteiro e o
// jogador 1 ficava sem botões.
func TestSeedDuckStationPortableMergesExistingSettings(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.ini")

	custom := "[Main]\nSetupWizardIncomplete = false\n[Display]\nFullscreen = true\n[MemoryCards]\nCard1Type = Shared\n"
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
	for _, want := range []string{"Fullscreen = true", "Card1Type = Shared", "CheckAtStartup = false", "OpenPauseMenu = Keyboard/Escape", "Cross = Keyboard/K"} {
		if !strings.Contains(string(got), want) {
			t.Errorf("faltou %q no settings.ini mesclado:\n%s", want, got)
		}
	}
	if strings.Contains(string(got), "PerGameFileTitle") {
		t.Errorf("tipo de cartão de quem já jogava foi trocado:\n%s", got)
	}
}

// Trava a regra: adapters desconhecidos não são tocados.
func TestSeedFirstRunNoOpForUnknownAdapter(t *testing.T) {
	dir := t.TempDir()

	// Usar um adapter que não existe no registry.
	if err := seedFirstRun(dir, "unknown-emulator"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Errorf("esperava diretório vazio para adapter desconhecido, achou %v", entries)
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

	if err := preservePortableUserData(oldDir, newDir, "duckstation"); err != nil {
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

	if err := preservePortableUserData(oldDir, newDir, "duckstation"); err != nil {
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

// pcsx2SeedEmTempDir aponta a semeadura do PCSX2 para um arquivo temporário
// e devolve o caminho. Existe porque o alvo de verdade é o diretório de
// dados do usuário (Documentos\PCSX2 no Windows): sem esta troca, o teste
// escreveria na configuração real de quem roda a suíte — exatamente o tipo
// de vazamento que já apagou dados de verdade nesta máquina (2026-09-11,
// docs/decisoes.md).
func pcsx2SeedEmTempDir(t *testing.T) string {
	t.Helper()

	iniPath := filepath.Join(t.TempDir(), "PCSX2", "inis", "PCSX2.ini")
	original := pcsx2SeedPath
	pcsx2SeedPath = func() (string, error) { return iniPath, nil }
	t.Cleanup(func() { pcsx2SeedPath = original })
	return iniPath
}

// Trava a regra: instalar PCSX2 grava, no arquivo que o binário real lê, as
// DUAS chaves medidas contra o PCSX2 v2.8.2 em 2026-09-11 — "SettingsVersion"
// (sem ela o PCSX2 ignora o arquivo, não cria a árvore de dados e não dá
// boot em jogo nenhum) e "SetupWizardIncomplete = false" (o assistente em si,
// que só é lido quando a primeira está presente).
func TestSeedPCSX2WritesWizardSkip(t *testing.T) {
	iniPath := pcsx2SeedEmTempDir(t)

	if err := seedFirstRun(t.TempDir(), "pcsx2"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	got, err := os.ReadFile(iniPath)
	if err != nil {
		t.Fatalf("PCSX2.ini não foi criado em %s: %v", iniPath, err)
	}

	want := "[UI]\nSettingsVersion = 1\nSetupWizardIncomplete = false\n"
	if !strings.HasPrefix(string(got), want) {
		t.Errorf("PCSX2.ini = %q, want prefixo %q", got, want)
	}
	// Mesma regra do DuckStation: com SettingsVersion presente o PCSX2 não
	// aplica os padrões dele, então o [Pad1] precisa nascer aqui.
	for _, line := range []string{"Cross = SDL-0/FaceSouth\n", "Cross = Keyboard/K\n"} {
		if !strings.Contains(string(got), line) {
			t.Errorf("PCSX2.ini sem %q:\n%s", line, got)
		}
	}
}

// Trava a regra que nasceu do bug: a semeadura NÃO pode cair na pasta
// gerenciada pelo ZeuX. O arquivo que ficava em "<instalação>/inis/" nunca
// era lido pelo binário real — era código morto que deixava o assistente
// aparecer assim mesmo.
func TestSeedPCSX2DoesNotWriteInsideManagedDir(t *testing.T) {
	pcsx2SeedEmTempDir(t)

	installDir := t.TempDir()
	if err := seedFirstRun(installDir, "pcsx2"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	entries, err := os.ReadDir(installDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Errorf("a pasta gerenciada foi tocada: %v", entries)
	}
}

// Trava a regra: um PCSX2.ini pré-existente é a configuração de verdade do
// usuário (jogos, controle, BIOS) e nunca é sobrescrito.
func TestSeedPCSX2DoesNotOverwriteExistingSettings(t *testing.T) {
	iniPath := pcsx2SeedEmTempDir(t)
	if err := os.MkdirAll(filepath.Dir(iniPath), 0o755); err != nil {
		t.Fatal(err)
	}

	custom := "[UI]\nSettingsVersion = 1\nTheme = darkfusionblue\n"
	if err := os.WriteFile(iniPath, []byte(custom), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := seedFirstRun(t.TempDir(), "pcsx2"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	got, err := os.ReadFile(iniPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != custom {
		t.Errorf("PCSX2.ini existente foi alterado: got %q, want %q", got, custom)
	}
}

// Trava a regra: num sistema operacional onde o caminho do PCSX2 não foi
// confirmado (macOS), instalar não falha — só não semeia nada.
func TestSeedPCSX2SkipsWhenPathUnknown(t *testing.T) {
	original := pcsx2SeedPath
	pcsx2SeedPath = func() (string, error) {
		return "", errCaminhoDesconhecidoNoTeste
	}
	t.Cleanup(func() { pcsx2SeedPath = original })

	installDir := t.TempDir()
	if err := seedFirstRun(installDir, "pcsx2"); err != nil {
		t.Fatalf("seedFirstRun deveria ser no-op, devolveu: %v", err)
	}

	entries, err := os.ReadDir(installDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Errorf("nada deveria ter sido escrito: %v", entries)
	}
}

var errCaminhoDesconhecidoNoTeste = errors.New("caminho não confirmado neste sistema operacional")

// Trava a regra: instalar Dolphin grava a chave que marca o prompt de
// analytics como respondido, suprimindo o wizard.
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

// Trava a regra: instalar PPSSPP grava a chave FirstRun=false, suprimindo
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

// Trava a regra: instalar Flycast grava o arquivo de configuração mínimo.
func TestSeedFlycastWritesConfigFile(t *testing.T) {
	dir := t.TempDir()

	if err := seedFirstRun(dir, "flycast"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	cfgPath := filepath.Join(dir, "emu.cfg")
	got, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("emu.cfg não foi criado: %v", err)
	}

	want := "[config]\n"
	if string(got) != want {
		t.Errorf("emu.cfg = %q, want %q", got, want)
	}
}

// Trava a regra: instalar RPCS3 grava o arquivo config.yml.
func TestSeedRPCS3WritesConfigFile(t *testing.T) {
	dir := t.TempDir()

	if err := seedFirstRun(dir, "rpcs3"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	cfgPath := filepath.Join(dir, "config.yml")
	_, err := os.Stat(cfgPath)
	if err != nil {
		t.Fatalf("config.yml não foi criado: %v", err)
	}
}

// Trava a regra: instalar melonDS grava o arquivo de configuração mínimo.
func TestSeedMelonDSWritesConfigFile(t *testing.T) {
	dir := t.TempDir()

	if err := seedFirstRun(dir, "melonds"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	cfgPath := filepath.Join(dir, "melonDS.ini")
	got, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("melonDS.ini não foi criado: %v", err)
	}

	want := "[General]\n"
	if string(got) != want {
		t.Errorf("melonDS.ini = %q, want %q", got, want)
	}
}

// Trava a regra: instalar Azahar grava o arquivo de configuração mínimo.
func TestSeedAzaharWritesConfigFile(t *testing.T) {
	dir := t.TempDir()

	if err := seedFirstRun(dir, "azahar"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	cfgPath := filepath.Join(dir, "qt-config.ini")
	got, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("qt-config.ini não foi criado: %v", err)
	}

	want := "[General]\n"
	if string(got) != want {
		t.Errorf("qt-config.ini = %q, want %q", got, want)
	}
}

// Trava a regra: instalar xemu grava o arquivo de configuração TOML.
func TestSeedXemuWritesConfigFile(t *testing.T) {
	dir := t.TempDir()

	if err := seedFirstRun(dir, "xemu"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	cfgPath := filepath.Join(dir, "xemu.toml")
	got, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("xemu.toml não foi criado: %v", err)
	}

	want := "[general]\nbootrom_path = \"\"\nflash_path = \"\"\nhdd_path = \"\"\n"
	if string(got) != want {
		t.Errorf("xemu.toml = %q, want %q", got, want)
	}
}

// Trava a regra: instalar Vita3K grava o arquivo de configuração.
func TestSeedVita3KWritesConfigFile(t *testing.T) {
	dir := t.TempDir()

	if err := seedFirstRun(dir, "vita3k"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	cfgPath := filepath.Join(dir, "config.yml")
	_, err := os.Stat(cfgPath)
	if err != nil {
		t.Fatalf("config.yml não foi criado: %v", err)
	}
}

// Trava a regra: instalar Xenia grava o arquivo de configuração TOML.
func TestSeedXeniaWritesConfigFile(t *testing.T) {
	dir := t.TempDir()

	if err := seedFirstRun(dir, "xenia"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	cfgPath := filepath.Join(dir, "xenia.config.toml")
	got, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("xenia.config.toml não foi criado: %v", err)
	}

	want := "[General]\ngpu = \"vulkan\"\nvsync = false\n"
	if string(got) != want {
		t.Errorf("xenia.config.toml = %q, want %q", got, want)
	}
}

// Trava a regra: instalar Cemu cria a estrutura de diretórios necessária.
func TestSeedCemuCreatesDirectoryStructure(t *testing.T) {
	dir := t.TempDir()

	if err := seedFirstRun(dir, "cemu"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	mlcPath := filepath.Join(dir, "mlc01")
	if _, err := os.Stat(mlcPath); err != nil {
		t.Fatalf("mlc01 não foi criado: %v", err)
	}
}

// Trava a regra: instalar RMG grava o arquivo de configuração mínimo.
func TestSeedRMGWritesConfigFile(t *testing.T) {
	dir := t.TempDir()

	if err := seedFirstRun(dir, "rmg"); err != nil {
		t.Fatalf("seedFirstRun: %v", err)
	}

	cfgPath := filepath.Join(dir, "config.ini")
	got, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("config.ini não foi criado: %v", err)
	}

	want := "[General]\n"
	if string(got) != want {
		t.Errorf("config.ini = %q, want %q", got, want)
	}
}

// Trava a lista protegida da atualização do DuckStation: config, cartões e
// states vêm SEMPRE da instalação anterior, mesmo que o pacote novo traga um
// arquivo de mesmo nome; o binário novo continua vencendo o velho.
func TestPreservePortableUserDataProtectsDuckStationUserFiles(t *testing.T) {
	oldDir, newDir := t.TempDir(), t.TempDir()
	write := func(dir, rel, content string) {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(oldDir, "portable.txt", "")
	write(oldDir, "settings.ini", "do usuario")
	write(oldDir, "memcards/Jogo_1.mcd", "cartao do usuario")
	write(oldDir, "duckstation-qt-x64-ReleaseLTCG.exe", "binario velho")
	write(newDir, "settings.ini", "padrao do pacote")
	write(newDir, "memcards/Jogo_1.mcd", "cartao vazio do pacote")
	write(newDir, "duckstation-qt-x64-ReleaseLTCG.exe", "binario novo")

	if err := preservePortableUserData(oldDir, newDir, "duckstation"); err != nil {
		t.Fatal(err)
	}
	for rel, want := range map[string]string{
		"settings.ini":                       "do usuario",
		"memcards/Jogo_1.mcd":                "cartao do usuario",
		"duckstation-qt-x64-ReleaseLTCG.exe": "binario novo",
	} {
		got, _ := os.ReadFile(filepath.Join(newDir, filepath.FromSlash(rel)))
		if string(got) != want {
			t.Errorf("%s = %q, esperado %q", rel, got, want)
		}
	}
}
