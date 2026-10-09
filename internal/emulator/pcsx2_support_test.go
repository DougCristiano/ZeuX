package emulator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTree(t *testing.T, root string, files map[string]string) {
	t.Helper()
	for rel, content := range files {
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

// Trava a migração Documentos\PCSX2 → pasta do emulador: copia tudo, deixa
// o lixo de zip do Mac para trás, nunca sobrescreve o que já existe no
// destino, e troca caminho absoluto de [Folders] pelo relativo.
func TestMigratePCSX2Dirs(t *testing.T) {
	legacy, target := t.TempDir(), t.TempDir()
	writeTree(t, legacy, map[string]string{
		"inis/PCSX2.ini":                       "[Folders]\nBios = " + filepath.Join(legacy, "bios", "usa") + "\nMemoryCards = memcards\n",
		"memcards/Mcd001.ps2":                  "cartao",
		"sstates/SLUS-21369 (67963EA7).02.p2s": "state",
		"bios/usa/SCPH.BIN":                    "bios",
		"bios/usa/.DS_Store":                   "lixo",
		"bios/__MACOSX/._SCPH.BIN":             "lixo",
		"logs/emulog.txt":                      "log",
	})
	writeTree(t, target, map[string]string{"memcards/Mcd001.ps2": "ja estava"})

	if err := migratePCSX2Dirs(legacy, target); err != nil {
		t.Fatal(err)
	}
	read := func(rel string) string {
		b, _ := os.ReadFile(filepath.Join(target, filepath.FromSlash(rel)))
		return string(b)
	}
	if read("sstates/SLUS-21369 (67963EA7).02.p2s") != "state" || read("bios/usa/SCPH.BIN") != "bios" {
		t.Error("arquivos não foram copiados")
	}
	if read("memcards/Mcd001.ps2") != "ja estava" {
		t.Error("sobrescreveu arquivo que já existia no destino")
	}
	for _, junk := range []string{"bios/usa/.DS_Store", "bios/__MACOSX", "logs"} {
		if _, err := os.Stat(filepath.Join(target, filepath.FromSlash(junk))); err == nil {
			t.Errorf("%s não deveria ter ido para o destino", junk)
		}
	}
	if ini := read("inis/PCSX2.ini"); !strings.Contains(ini, "Bios = "+filepath.Join("bios", "usa")) || strings.Contains(ini, legacy) {
		t.Errorf("[Folders] Bios continuou absoluto:\n%s", ini)
	}
	if missing := missingInTarget(filepath.Join(legacy, "bios"), filepath.Join(target, "bios")); missing != "" {
		t.Errorf("conferência acusou falta de %q", missing)
	}
}

// Trava a leitura de serial e CRC do log do PCSX2 — a ligação jogo ↔ states.
func TestPCSX2LogIDs(t *testing.T) {
	p := filepath.Join(t.TempDir(), "emulog.txt")
	os.WriteFile(p, []byte("(qualquer coisa)\n  Serial: SLUS-20001\n  CRC: 11111111\n...\n  Serial: SLUS-21369\n  CRC: 67963ea7\n"), 0o644)
	serial, crc := pcsx2LogIDs(p)
	if serial != "SLUS-21369" || crc != "67963EA7" {
		t.Fatalf("got %q %q — deveria ser o último jogo do log", serial, crc)
	}
}

// Trava o reconhecimento dos states do PCSX2 por serial+CRC: slots, backup e
// retomada; states de outro jogo ficam de fora; o cartão é o compartilhado.
func TestFindPCSX2GameSaves(t *testing.T) {
	data := t.TempDir()
	writeTree(t, data, map[string]string{
		"inis/PCSX2.ini":                              "[MemoryCards]\nSlot1_Filename = Mcd001.ps2\n",
		"memcards/Mcd001.ps2":                         "c",
		"sstates/SLUS-21369 (67963EA7).02.p2s":        "s",
		"sstates/SLUS-21369 (67963EA7).02.p2s.backup": "b",
		"sstates/SLUS-21369 (67963EA7).resume.p2s":    "r",
		"sstates/SLUS-20001 (11111111).01.p2s":        "outro",
	})
	orig := pcsx2ConfigPath
	pcsx2ConfigPath = func() (string, error) { return filepath.Join(data, "inis", "PCSX2.ini"), nil }
	defer func() { pcsx2ConfigPath = orig }()
	t.Setenv("XDG_CONFIG_HOME", filepath.Dir(data))
	// pcsx2DataDir no Linux é $XDG_CONFIG_HOME/PCSX2: aponta para `data`.
	if err := os.Rename(data, filepath.Join(filepath.Dir(data), "PCSX2")); err != nil {
		t.Fatal(err)
	}
	data = filepath.Join(filepath.Dir(data), "PCSX2")
	pcsx2ConfigPath = func() (string, error) { return filepath.Join(data, "inis", "PCSX2.ini"), nil }

	saves, ok := findPCSX2GameSaves("/jogos/gow.iso", GameDiscID{Serial: "SLUS-21369", CRC: "67963EA7"})
	if !ok {
		t.Fatal("não localizou")
	}
	if !saves.MemoryCardShared || len(saves.MemoryCards) != 1 {
		t.Errorf("cartão compartilhado: %+v", saves.MemoryCards)
	}
	if len(saves.SaveStates) != 3 {
		t.Fatalf("states = %d, esperado 3 (slot, backup, retomada)", len(saves.SaveStates))
	}
	if *saves.SaveStates[0].Slot != -1 {
		t.Errorf("a retomada deveria vir primeiro: %+v", saves.SaveStates[0])
	}
}

// Trava backup e restauração: restaura states; o cartão compartilhado só
// volta se pedido explicitamente.
func TestBackupAndRestoreGameSaves(t *testing.T) {
	dir := t.TempDir()
	card := filepath.Join(dir, "Mcd001.ps2")
	state := filepath.Join(dir, "SLUS (00000000).01.p2s")
	os.WriteFile(card, []byte("cartao-v1"), 0o644)
	os.WriteFile(state, []byte("state-v1"), 0o644)
	saves := GameSaves{MemoryCards: []SaveFileInfo{{Path: card, Name: "Mcd001.ps2"}}, SaveStates: []SaveFileInfo{{Path: state, Name: filepath.Base(state)}}}

	base := filepath.Join(dir, "backups")
	b, err := BackupGameSaves(base, saves)
	if err != nil || b.Files != 2 || !b.HasMemoryCard {
		t.Fatalf("backup: %+v %v", b, err)
	}
	os.WriteFile(card, []byte("cartao-v2"), 0o644)
	os.WriteFile(state, []byte("state-v2"), 0o644)

	if n, err := RestoreGameSaves(base, b.ID, false); err != nil || n != 1 {
		t.Fatalf("restore sem cartão: n=%d err=%v", n, err)
	}
	if got, _ := os.ReadFile(state); string(got) != "state-v1" {
		t.Errorf("state não voltou: %q", got)
	}
	if got, _ := os.ReadFile(card); string(got) != "cartao-v2" {
		t.Errorf("cartão compartilhado voltou sem ser pedido: %q", got)
	}
	if _, err := RestoreGameSaves(base, "../fora", true); err == nil {
		t.Error("aceitou id de backup com caminho")
	}
	if len(ListGameSaveBackups(base)) != 1 {
		t.Error("listagem de backups")
	}
}

// Trava o espelho: InhibitScreensaver do PCSX2 é gravado em [EmuCore] e [UI].
func TestPCSX2SettingMirror(t *testing.T) {
	path := filepath.Join(t.TempDir(), "PCSX2.ini")
	os.WriteFile(path, []byte("[UI]\nStartFullscreen = true\n# comentario\n[EmuCore]\nEnableDiscordPresence = false\n"), 0o644)
	orig := pcsx2ConfigPath
	pcsx2ConfigPath = func() (string, error) { return path, nil }
	defer func() { pcsx2ConfigPath = orig }()

	if err := WriteEmulatorSettings("pcsx2", Installation{}, map[string]string{"EmuCore.InhibitScreensaver": "false"}); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(path)
	s := string(got)
	if strings.Count(s, "InhibitScreensaver = false") != 2 || !strings.Contains(s, "# comentario") || !strings.Contains(s, "StartFullscreen = true") {
		t.Errorf("espelho ou preservação falhou:\n%s", s)
	}
	if err := WriteEmulatorSettings("pcsx2", Installation{}, map[string]string{"EmuCore/GS.upscale_multiplier": "16"}); err == nil {
		t.Error("aceitou multiplicador fora da faixa")
	}
}

// Trava o achado do Douglas (PCSX2.ini.zeux-backup com 0 bytes): um backup
// vazio ("não existia") é trocado pelo conteúdo real antes da próxima
// escrita — senão "restaurar" apagaria a config inteira do emulador.
func TestEmptyBackupIsReplacedByRealContent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "PCSX2.ini")
	if err := backupBeforeFirstWrite(path); err != nil { // arquivo ainda não existe
		t.Fatal(err)
	}
	os.WriteFile(path, []byte("[UI]\nconfig = completa\n"), 0o644)
	if err := backupBeforeFirstWrite(path); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(path + configBackupSuffix); string(got) != "[UI]\nconfig = completa\n" {
		t.Errorf("backup continuou vazio: %q", got)
	}
}

// Trava que a mesclagem do PCSX2 força o auto-update desligado e não mexe no
// resto das opções que a pessoa já tem. A única chave acrescentada é o
// salvamento ao fechar, e só porque ela faltava (decisão de 2026-10-09).
func TestMergePCSX2DefaultsOnlyAutoUpdater(t *testing.T) {
	in := "[UI]\nSettingsVersion = 1\nStartFullscreen = true\n[AutoUpdater]\nCheckAtStartup = true\n"
	got := string(MergePCSX2Defaults([]byte(in), false))
	want := strings.Replace(in, "CheckAtStartup = true", "CheckAtStartup = false", 1)
	if !strings.Contains(got, "CheckAtStartup = false") || !strings.Contains(got, "StartFullscreen = true") {
		t.Errorf("auto-update ou opção existente não ficou como deveria:\n%s", got)
	}
	if strings.Replace(got, "\n[EmuCore]\nSaveStateOnShutdown = true\n", "", 1) != want {
		t.Errorf("além do auto-update, só o salvamento ao fechar pode ser acrescentado:\n%s", got)
	}
}
