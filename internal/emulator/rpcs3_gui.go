package emulator

import (
	"fmt"
	"os"
	"path/filepath"
)

// suppressRPCS3Welcome grava `showWelcome=false` na seção [infoBox] do
// GuiConfigs/CurrentSettings.ini do RPCS3. Sem isso o emulador mostra a
// janela de boas-vindas a cada abertura até a pessoa marcar "não mostrar
// novamente" — e quem abre o RPCS3 pelo ZeuX não deveria passar pela
// introdução toda vez (relato do Douglas, 2026-10-05).
//
// Só escreve quando a chave ainda não existe: se a pessoa (ou o próprio
// RPCS3) já decidiu, a decisão dela vale. Chave e seção vêm do código do
// RPCS3 (gui_settings.h: `ib_show_welcome`, grupo `infoBox`), não de um
// binário observado rodando — ver a ressalva em docs/decisoes.md.
func suppressRPCS3Welcome(install Installation) error {
	dir, ok := rpcs3ConfigDir(install)
	if !ok {
		return nil
	}
	path := filepath.Join(dir, "GuiConfigs", "CurrentSettings.ini")

	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("lendo %s: %w", path, err)
	}
	ini := parseINI(data)
	if _, has := ini.get("infoBox", "showWelcome"); has {
		return nil
	}
	ini.set("infoBox", "showWelcome", "false")

	if err := backupBeforeFirstWrite(path); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("criando a pasta de configuração da interface do RPCS3: %w", err)
	}
	return os.WriteFile(path, ini.bytes(), 0o644)
}
