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
// - PCSX2 (inis/PCSX2_qt.ini)
// - Dolphin (Dolphin.ini)
// - PPSSPP (ppsspp.ini)
// - Flycast (emu.cfg)
// - RPCS3 (config.yml vazio)
// - melonDS (melonDS.ini vazio)
// - Azahar (qt-config.ini vazio)
// - xemu (xemu.toml mínimo)
// - Vita3K (config.yml + estrutura)
// - Xenia (xenia.config.toml)
// - Cemu (settings.xml + estrutura)
// - RMG (config.ini mínimo)
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
	case "flycast":
		return seedFlycast(installDir)
	case "rpcs3":
		return seedRPCS3(installDir)
	case "melonds":
		return seedMelonDS(installDir)
	case "azahar":
		return seedAzahar(installDir)
	case "xemu":
		return seedXemu(installDir)
	case "vita3k":
		return seedVita3K(installDir)
	case "xenia":
		return seedXenia(installDir)
	case "cemu":
		return seedCemu(installDir)
	case "rmg":
		return seedRMG(installDir)
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

// seedFlycast cria um arquivo de configuração mínimo. Flycast é portátil e
// não tem um wizard formal de primeira execução.
func seedFlycast(installDir string) error {
	cfgPath := filepath.Join(installDir, "emu.cfg")
	if _, err := os.Stat(cfgPath); err == nil {
		return nil
	}

	const seed = "[config]\n"
	if err := os.WriteFile(cfgPath, []byte(seed), 0o644); err != nil {
		return fmt.Errorf("criando emu.cfg: %w", err)
	}
	return nil
}

// seedRPCS3 cria o arquivo config.yml. RPCS3 não tem wizard formal — a
// configuração é feita via GUI, e o arquivo é criado quando o usuário salva
// configurações. Um arquivo vazio permite que RPCS3 gere defaults na primeira
// execução.
func seedRPCS3(installDir string) error {
	cfgPath := filepath.Join(installDir, "config.yml")
	if _, err := os.Stat(cfgPath); err == nil {
		return nil
	}

	// Arquivo vazio: RPCS3 vai gerar configurações padrão.
	const seed = ""
	if err := os.WriteFile(cfgPath, []byte(seed), 0o644); err != nil {
		return fmt.Errorf("criando config.yml: %w", err)
	}
	return nil
}

// seedMelonDS cria um arquivo de configuração mínimo. melonDS não tem wizard
// de primeira execução.
func seedMelonDS(installDir string) error {
	cfgPath := filepath.Join(installDir, "melonDS.ini")
	if _, err := os.Stat(cfgPath); err == nil {
		return nil
	}

	const seed = "[General]\n"
	if err := os.WriteFile(cfgPath, []byte(seed), 0o644); err != nil {
		return fmt.Errorf("criando melonDS.ini: %w", err)
	}
	return nil
}

// seedAzahar cria um arquivo de configuração mínimo. Azahar (sucessor de
// Citra) não tem wizard formal de primeira execução.
func seedAzahar(installDir string) error {
	cfgPath := filepath.Join(installDir, "qt-config.ini")
	if _, err := os.Stat(cfgPath); err == nil {
		return nil
	}

	const seed = "[General]\n"
	if err := os.WriteFile(cfgPath, []byte(seed), 0o644); err != nil {
		return fmt.Errorf("criando qt-config.ini: %w", err)
	}
	return nil
}

// seedXemu cria um arquivo de configuração mínimo em TOML. xemu tem um wizard
// GUI na primeira execução, mas um arquivo pré-existente permite que o
// emulador use configuração padrão.
func seedXemu(installDir string) error {
	cfgPath := filepath.Join(installDir, "xemu.toml")
	if _, err := os.Stat(cfgPath); err == nil {
		return nil
	}

	const seed = "[general]\nbootrom_path = \"\"\nflash_path = \"\"\nhdd_path = \"\"\n"
	if err := os.WriteFile(cfgPath, []byte(seed), 0o644); err != nil {
		return fmt.Errorf("criando xemu.toml: %w", err)
	}
	return nil
}

// seedVita3K cria um arquivo de configuração e estrutura mínima. Vita3K tem
// um wizard GUI obrigatório na primeira execução, mas pré-criar o arquivo
// permite que use defaults.
func seedVita3K(installDir string) error {
	cfgPath := filepath.Join(installDir, "config.yml")
	if _, err := os.Stat(cfgPath); err == nil {
		return nil
	}

	const seed = ""
	if err := os.WriteFile(cfgPath, []byte(seed), 0o644); err != nil {
		return fmt.Errorf("criando config.yml (Vita3K): %w", err)
	}
	return nil
}

// seedXenia cria um arquivo de configuração TOML. Xenia gera este arquivo
// automaticamente com defaults na primeira execução.
func seedXenia(installDir string) error {
	cfgPath := filepath.Join(installDir, "xenia.config.toml")
	if _, err := os.Stat(cfgPath); err == nil {
		return nil
	}

	const seed = "[General]\ngpu = \"vulkan\"\nvsync = false\n"
	if err := os.WriteFile(cfgPath, []byte(seed), 0o644); err != nil {
		return fmt.Errorf("criando xenia.config.toml: %w", err)
	}
	return nil
}

// seedCemu cria um arquivo de configuração e estrutura mínima. Cemu tem um
// diálogo obrigatório na primeira execução, mas pré-criar a estrutura de
// diretórios permite que use defaults.
func seedCemu(installDir string) error {
	// Criar diretório de MLC (emulated console storage).
	mlcPath := filepath.Join(installDir, "mlc01")
	if err := os.MkdirAll(mlcPath, 0o755); err != nil {
		return err
	}

	// Cemu gera settings.xml após fechar o diálogo inicial. Por enquanto,
	// apenas criamos a estrutura de diretórios necessária.
	return nil
}

// seedRMG cria um arquivo de configuração mínimo. RMG é um frontend sem
// wizard formal de primeira execução.
func seedRMG(installDir string) error {
	cfgPath := filepath.Join(installDir, "config.ini")
	if _, err := os.Stat(cfgPath); err == nil {
		return nil
	}

	const seed = "[General]\n"
	if err := os.WriteFile(cfgPath, []byte(seed), 0o644); err != nil {
		return fmt.Errorf("criando config.ini (RMG): %w", err)
	}
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
