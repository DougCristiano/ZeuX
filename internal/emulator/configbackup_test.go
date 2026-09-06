package emulator

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBackupBeforeFirstWriteIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.ini")
	if err := os.WriteFile(path, []byte("original"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := backupBeforeFirstWrite(path); err != nil {
		t.Fatalf("primeiro backup: %v", err)
	}
	// Simula uma segunda escrita mudando o arquivo real, depois chamando
	// backupBeforeFirstWrite de novo — o backup não pode ser sobrescrito
	// pelo conteúdo já modificado.
	if err := os.WriteFile(path, []byte("modificado"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := backupBeforeFirstWrite(path); err != nil {
		t.Fatalf("segundo backup: %v", err)
	}

	backup, err := os.ReadFile(path + configBackupSuffix)
	if err != nil {
		t.Fatal(err)
	}
	if string(backup) != "original" {
		t.Fatalf("backup = %q, esperado o conteúdo original (%q), não o modificado", backup, "original")
	}
}

// Trava o caso "emulador nunca rodou": não há arquivo para fazer backup, e
// restaurar depois de escrever precisa apagar o arquivo (voltar à ausência),
// não deixar um arquivo vazio no lugar.
func TestBackupAndRestoreWhenOriginalDidNotExist(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.ini")

	if err := backupBeforeFirstWrite(path); err != nil {
		t.Fatalf("backup de arquivo ausente: %v", err)
	}
	if err := os.WriteFile(path, []byte("gravado pelo ZeuX"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := restoreFromBackup(path); err != nil {
		t.Fatalf("restore: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("esperava o arquivo ausente depois do restore, stat = %v", err)
	}
}

func TestRestoreFromBackupWithoutBackupFails(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.ini")
	if err := restoreFromBackup(path); err == nil {
		t.Fatal("restaurar sem backup deveria falhar")
	}
}

// Exercita backup/restore pelo Adapter de PCSX2 de verdade (não só as
// funções puras), incluindo a preservação de chaves desconhecidas no
// round-trip write→restore.
func TestPCSX2ConfigurableAdapterWriteAndRestore(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "PCSX2.ini")
	original := "[UI]\nStartFullscreen = false\nTheme = darkfusionblue\n"
	if err := os.WriteFile(path, []byte(original), 0o644); err != nil {
		t.Fatal(err)
	}

	orig := pcsx2ConfigPath
	pcsx2ConfigPath = func() (string, error) { return path, nil }
	defer func() { pcsx2ConfigPath = orig }()

	adapter := newPCSX2().(ConfigurableAdapter)

	if _, err := adapter.WriteConfig(Installation{}, Options{Fullscreen: true, InternalScale: 2}); err != nil {
		t.Fatalf("WriteConfig: %v", err)
	}

	read, err := adapter.ReadConfig(Installation{})
	if err != nil {
		t.Fatalf("ReadConfig: %v", err)
	}
	if read.Fullscreen == nil || !*read.Fullscreen {
		t.Fatalf("ReadConfig depois de WriteConfig: Fullscreen = %v, esperado true", read.Fullscreen)
	}
	if read.InternalScale == nil || *read.InternalScale != 2 {
		t.Fatalf("ReadConfig depois de WriteConfig: InternalScale = %v, esperado 2", read.InternalScale)
	}

	if err := adapter.RestoreConfig(Installation{}); err != nil {
		t.Fatalf("RestoreConfig: %v", err)
	}
	restored, _ := os.ReadFile(path)
	if string(restored) != original {
		t.Fatalf("RestoreConfig não devolveu o conteúdo original:\nquer: %q\nveio: %q", original, string(restored))
	}
}

// Emulador recém-instalado que o usuário nunca abriu não tem pasta de
// configuração nenhuma. Antes desta correção, a PRIMEIRA tentativa de gravar
// configuração ou mapeamento morria no backup, com um erro de sistema de
// arquivos cru chegando à tela como 500 — achado mapeando um controle num
// RetroArch que nunca tinha rodado (2026-08-28). É o caminho de quem acabou de
// instalar pelo ZeuX e vai configurar antes de jogar.
func TestBackupCriaAPastaQuandoOEmuladorNuncaRodou(t *testing.T) {
	// Dois níveis inexistentes de propósito: MkdirAll precisa criar a árvore
	// toda, não só o último diretório.
	path := filepath.Join(t.TempDir(), "retroarch", "config", "retroarch.cfg")

	if err := backupBeforeFirstWrite(path); err != nil {
		t.Fatalf("backupBeforeFirstWrite numa pasta inexistente: %v", err)
	}

	data, err := os.ReadFile(path + configBackupSuffix)
	if err != nil {
		t.Fatalf("o backup não foi criado: %v", err)
	}
	// 0 bytes é a sentinela de "o original não existia" — restoreFromBackup
	// depende disso para apagar o arquivo em vez de gravar conteúdo vazio.
	if len(data) != 0 {
		t.Errorf("backup tem %d bytes, esperava 0 (sentinela de original ausente)", len(data))
	}
}

// E o ciclo fecha: restaurar depois disso apaga o arquivo, devolvendo o estado
// "não existia" em vez de deixar um arquivo vazio para trás.
func TestRestauraParaAusenciaDepoisDeBackupEmPastaNova(t *testing.T) {
	path := filepath.Join(t.TempDir(), "novo", "retroarch.cfg")

	if err := backupBeforeFirstWrite(path); err != nil {
		t.Fatalf("backupBeforeFirstWrite: %v", err)
	}
	if err := os.WriteFile(path, []byte("input_player1_a_btn = \"0\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := restoreFromBackup(path); err != nil {
		t.Fatalf("restoreFromBackup: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("o arquivo deveria ter sido apagado — o original não existia")
	}
}
