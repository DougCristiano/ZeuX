package install

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
)

// seedFirstRun grava, para os emuladores em que já mapeamos o mecanismo, um
// arquivo de configuração mínimo que evita o assistente de primeira execução
// travar a entrada do usuário — o diferencial de "plug and play" do ZeuX.
//
// Isto NÃO é fingir que configuramos o emulador: só a chave que suprime o
// assistente é gravada. Vídeo, controle e BIOS continuam por conta do próprio
// emulador, preenchidos com os defaults dele no primeiro uso real.
//
// Hoje só o DuckStation está mapeado. PCSX2 e Dolphin também abrem assistente
// de primeira execução, mas cada um guarda esse estado num lugar e formato
// diferente — ainda não pesquisado. Ver docs/roadmap.md.
func seedFirstRun(installDir, adapterID string) error {
	switch adapterID {
	case "duckstation":
		return seedDuckStationPortable(installDir)
	default:
		return nil
	}
}

// seedDuckStationPortable ativa o modo portátil do DuckStation e grava a
// chave que pula o assistente de primeira execução.
//
// O DuckStation só mostra o assistente quando nem "SetupWizardIncomplete" nem
// "SettingsVersion" existem em [Main] (src/duckstation-qt/qthost.cpp,
// InitializeFoldersAndConfig). Gravar SetupWizardIncomplete=false já é
// suficiente — não precisamos simular SettingsVersion.
//
// O modo portátil (portable.txt ao lado do executável) é necessário para que
// o DuckStation leia esse settings.ini em vez do de %APPDATA%\DuckStation,
// que pertence a uma instalação manual do usuário e não deve ser tocado.
func seedDuckStationPortable(installDir string) error {
	portableMarker := filepath.Join(installDir, "portable.txt")
	if _, err := os.Stat(portableMarker); os.IsNotExist(err) {
		if err := os.WriteFile(portableMarker, nil, 0o644); err != nil {
			return fmt.Errorf("criando portable.txt: %w", err)
		}
	}

	settingsPath := filepath.Join(installDir, "settings.ini")
	if _, err := os.Stat(settingsPath); err == nil {
		// Já existe: veio de uma atualização (preservado por
		// preservePortableUserData) ou foi editado pelo usuário. Não
		// sobrescrevemos configuração que não é nossa.
		return nil
	}

	const seed = "[Main]\nSetupWizardIncomplete = false\n"
	if err := os.WriteFile(settingsPath, []byte(seed), 0o644); err != nil {
		return fmt.Errorf("criando settings.ini: %w", err)
	}
	return nil
}

// preservePortableUserData copia da instalação anterior para a nova qualquer
// arquivo que o pacote novo não trouxe — saves, memory cards, screenshots,
// settings.ini já configurado pelo usuário.
//
// Sem isso, ativar modo portátil para um emulador teria um efeito colateral
// grave: como promote() apaga o diretório antigo depois de trocar pelo novo,
// atualizar o DuckStation pelo ZeuX apagaria o progresso salvo do usuário
// junto com o binário velho. Só roda quando a instalação anterior tem
// portable.txt — emuladores sem modo portátil não guardam nada de usuário no
// diretório gerenciado, então não há o que preservar.
func preservePortableUserData(oldDir, newDir string) error {
	if _, err := os.Stat(filepath.Join(oldDir, "portable.txt")); err != nil {
		return nil
	}

	return filepath.WalkDir(oldDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		rel, err := filepath.Rel(oldDir, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}

		target := filepath.Join(newDir, rel)

		if d.IsDir() {
			if _, err := os.Stat(target); os.IsNotExist(err) {
				return os.MkdirAll(target, 0o755)
			}
			return nil
		}

		if _, err := os.Stat(target); err == nil {
			// O pacote novo já traz este arquivo (ex.: um binário
			// atualizado) — ele tem prioridade sobre o antigo.
			return nil
		}

		return copyFile(path, target)
	})
}

func copyFile(from, to string) error {
	source, err := os.Open(from)
	if err != nil {
		return err
	}
	defer source.Close()

	info, err := source.Stat()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(to), 0o755); err != nil {
		return err
	}

	dest, err := os.OpenFile(to, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, info.Mode().Perm())
	if err != nil {
		return err
	}
	defer dest.Close()

	_, err = io.Copy(dest, source)
	return err
}
