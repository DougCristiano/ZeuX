package emulator

import (
	"fmt"
	"os"
)

// configBackupSuffix marca o backup do arquivo de configuração original —
// gravado uma vez, antes da primeira escrita do ZeuX (H1, docs/roadmap.md).
// Nunca sobrescrito depois: se sobrescrevêssemos a cada WriteConfig, uma
// segunda escrita apagaria a única cópia do que o usuário tinha antes do
// ZeuX existir, e RestoreConfig devolveria um estado que já não é o
// original.
const configBackupSuffix = ".zeux-backup"

// backupBeforeFirstWrite copia path para path+configBackupSuffix, mas só se
// esse backup ainda não existir — é o que faz a operação idempotente entre
// várias chamadas de WriteConfig.
//
// Arquivo de configuração ainda inexistente (emulador nunca rodou) grava um
// backup **vazio** (0 bytes), não deixa de gravar backup nenhum: é o que
// permite restoreFromBackup diferenciar "original tinha conteúdo" de
// "original não existia" — apagando o arquivo em vez de escrever conteúdo
// vazio nele, que para um .ini poderia ter efeito diferente de "arquivo
// ausente" dependendo do emulador.
func backupBeforeFirstWrite(path string) error {
	if _, err := os.Stat(path + configBackupSuffix); err == nil {
		return nil // já existe um backup — é o original, preservado
	}

	original, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		original = nil // sentinela: 0 bytes = "não existia"
	} else if err != nil {
		return fmt.Errorf("lendo configuração original para backup: %w", err)
	}

	if err := os.WriteFile(path+configBackupSuffix, original, 0o644); err != nil {
		return fmt.Errorf("gravando backup da configuração: %w", err)
	}
	return nil
}

// restoreFromBackup devolve path ao estado salvo por backupBeforeFirstWrite
// — apaga o arquivo se o original era ausência (backup de 0 bytes), ou
// grava o conteúdo salvo de volta. Erro explícito se nunca houve backup —
// nunca finge sucesso silencioso numa operação que o usuário pediu para
// desfazer algo.
func restoreFromBackup(path string) error {
	backup := path + configBackupSuffix
	data, err := os.ReadFile(backup)
	if os.IsNotExist(err) {
		return fmt.Errorf("não há uma configuração original salva para restaurar (o ZeuX nunca alterou %s)", path)
	}
	if err != nil {
		return fmt.Errorf("lendo o backup da configuração: %w", err)
	}

	if len(data) == 0 {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("removendo configuração para restaurar o estado original (ausente): %w", err)
		}
		return nil
	}

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("restaurando a configuração original: %w", err)
	}
	return nil
}
