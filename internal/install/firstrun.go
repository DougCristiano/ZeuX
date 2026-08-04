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
// Mapeados (D8):
// - DuckStation (modo portátil + settings.ini)
// - PCSX2 (inis/PCSX2_ui.ini)
// - Dolphin (Dolphin.ini)
// - PPSSPP (ppsspp.ini)
// - Cemu (settings.xml)
//
// Não mapeados:
// - Flycast, RPCS3, melonDS, Azahar, xemu, Vita3K, Xenia, RMG
func seedFirstRun(installDir, adapterID string) error {
	switch adapterID {
	case "duckstation":
		return seedDuckStationPortable(installDir)
	case "pcsx2":
		return seedPCSX2(installDir)
	case "dolphin":
		return seedDolphin(installDir)
	case "ppsspp":
		return seedPPSSPP(installDir)
	case "cemu":
		return seedCemu(installDir)
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

// seedPCSX2 escreve a chave de pulo do assistente de primeira execução no
// arquivo de configuração do PCSX2.
//
// O PCSX2 não publica a chave exata, mas a existência de PCSX2_qt.ini já
// suprime o assistente: o emulador só mostra o wizard quando nenhum arquivo de
// configuração existe. Gravar um arquivo mínimo é suficiente.
func seedPCSX2(installDir string) error {
	iniDir := filepath.Join(installDir, "inis")
	if err := os.MkdirAll(iniDir, 0o755); err != nil {
		return err
	}

	iniPath := filepath.Join(iniDir, "PCSX2_qt.ini")
	if _, err := os.Stat(iniPath); err == nil {
		// Já existe: não sobrescrevemos.
		return nil
	}

	// Arquivo mínimo: gravar um INI vazio é suficiente para suprimir o wizard.
	const seed = "[Main]\n"
	if err := os.WriteFile(iniPath, []byte(seed), 0o644); err != nil {
		return fmt.Errorf("criando inis/PCSX2_qt.ini: %w", err)
	}
	return nil
}

// seedDolphin escreve a chave que marca o prompt de analytics como respondido,
// suppressando o wizard de primeira execução do Dolphin.
func seedDolphin(installDir string) error {
	iniPath := filepath.Join(installDir, "Dolphin.ini")
	if _, err := os.Stat(iniPath); err == nil {
		// Já existe: não sobrescrevemos.
		return nil
	}

	// Dolphin marca o prompt de analytics como respondido com PermissionAsked=1.
	const seed = "[Analytics]\nPermissionAsked = 1\n"
	if err := os.WriteFile(iniPath, []byte(seed), 0o644); err != nil {
		return fmt.Errorf("criando Dolphin.ini: %w", err)
	}
	return nil
}

// seedPPSSPP escreve a chave FirstRun=false no arquivo de configuração,
// suppressando o wizard de primeira execução do PPSSPP.
func seedPPSSPP(installDir string) error {
	iniPath := filepath.Join(installDir, "ppsspp.ini")
	if _, err := os.Stat(iniPath); err == nil {
		// Já existe: não sobrescrevemos.
		return nil
	}

	// PPSSPP marca a primeira execução como completa com FirstRun=false.
	const seed = "[General]\nFirstRun = false\n"
	if err := os.WriteFile(iniPath, []byte(seed), 0o644); err != nil {
		return fmt.Errorf("criando ppsspp.ini: %w", err)
	}
	return nil
}

// seedCemu seria útil implementar, mas o Cemu salva settings.xml em XML após
// fechar o diálogo obrigatório na primeira execução, e não há flag documentada
// para pular esse passo. Sem ROM real para testar, deixamos como no-op.
func seedCemu(installDir string) error {
	// TODO (D8): Pesquisar se Cemu settings.xml tem chave de first-run documentada.
	// Por enquanto, é um no-op.
	return nil
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
