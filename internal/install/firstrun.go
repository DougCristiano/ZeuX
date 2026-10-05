package install

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/doufl/zeux/internal/emulator"
)

// seedFirstRun grava, para os emuladores em que já mapeamos o mecanismo, um
// arquivo de configuração mínimo que evita o assistente de primeira execução
// travar a entrada do usuário — o diferencial de "plug and play" do ZeuX.
//
// Isto NÃO é fingir que configuramos o emulador: só a chave que suprime o
// assistente é gravada. Vídeo e BIOS continuam por conta do próprio
// emulador, preenchidos com os defaults dele no primeiro uso real. A exceção
// é o controle do PCSX2 e do DuckStation (2026-09-29): com o arquivo semeado
// eles deixam de aplicar os padrões de controle deles, então o seed leva o
// [Pad1] junto — ver emulator.ControllerPresetSeed.
//
// Mapeados (D8):
//   - DuckStation (modo portátil + settings.ini)
//   - PCSX2 (inis/PCSX2.ini no diretório de dados do usuário, não na pasta
//     gerenciada — ver seedPCSX2)
//   - Dolphin (Dolphin.ini)
//   - PPSSPP (ppsspp.ini)
//   - Flycast (emu.cfg)
//   - RPCS3 (config.yml vazio)
//   - melonDS (melonDS.ini vazio)
//   - Azahar (qt-config.ini vazio)
//   - xemu (xemu.toml mínimo)
//   - Vita3K (config.yml + estrutura)
//   - Xenia (xenia.config.toml)
//   - Cemu (settings.xml + estrutura)
//   - RMG (config.ini mínimo)
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
// Um segundo diálogo, diferente do assistente, aparece na primeira execução
// como AppImage no Linux: "Would you like to create a launcher shortcut?"
// (QtHost::CheckDesktopFile, src/duckstation-qt/qthost.cpp — só dispara
// quando a variável de ambiente APPIMAGE existe). Achado testando de verdade
// em 2026-08-04: o ZeuX instala como AppImage no Linux, então esse prompt
// sempre apareceria sem esta chave. Suprimido gravando
// "NoDesktopFile = true" — a mesma chave que o próprio DuckStation grava se
// o usuário marcar "Don't ask again" e clicar "Não".
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

	// Mescla, não "cria se não existir" (2026-10-05): a versão anterior
	// pulava o seed quando o settings.ini já existia — numa atualização, ou
	// num arquivo que o próprio DuckStation tinha criado —, e o jogador 1
	// ficava sem botões e sem atalhos, com o auto-update do DuckStation
	// ligado. A mesclagem só acrescenta o que falta (e força o auto-update
	// desligado); ver emulator.MergeDuckStationDefaults.
	settingsPath := filepath.Join(installDir, "settings.ini")
	data, err := os.ReadFile(settingsPath)
	fresh := os.IsNotExist(err)
	if err != nil && !fresh {
		return fmt.Errorf("lendo settings.ini: %w", err)
	}
	merged := emulator.MergeDuckStationDefaults(data, fresh)
	if !fresh && string(merged) == string(data) {
		return nil
	}
	if err := os.WriteFile(settingsPath, merged, 0o644); err != nil {
		return fmt.Errorf("gravando settings.ini: %w", err)
	}
	return nil
}

// portableUserPaths são os arquivos e pastas (primeiro nível da instalação,
// em minúsculas) que pertencem ao usuário e vêm SEMPRE da instalação
// anterior numa atualização, mesmo que o pacote novo traga um item com o
// mesmo nome — config, cartões, states, BIOS, ajustes por jogo, perfis de
// controle e tempo de jogo. Lista do DuckStation observada no Windows
// (2026-10-05); outros emuladores seguem a regra antiga até terem a sua.
var portableUserPaths = map[string]map[string]bool{
	"duckstation": {
		"settings.ini": true, "portable.txt": true, "memcards": true, "savestates": true,
		"bios": true, "gamesettings": true, "inputprofiles": true, "playtime.dat": true,
	},
	// PCSX2 em modo portátil (2026-10-05): tudo que a migração leva de
	// Documentos\PCSX2, mais o marcador. Logs ficam de fora (recriados).
	"pcsx2": {
		"portable.ini": true, "portable.txt": true, "inis": true, "memcards": true, "sstates": true,
		"bios": true, "cache": true, "cheats": true, "covers": true, "gamesettings": true,
		"inputprofiles": true, "patches": true, "textures": true, "snaps": true, "videos": true,
	},
}

// isPortableInstall: DuckStation usa portable.txt; o PCSX2, portable.ini.
func isPortableInstall(dir string) bool {
	for _, marker := range []string{"portable.txt", "portable.ini"} {
		if _, err := os.Stat(filepath.Join(dir, marker)); err == nil {
			return true
		}
	}
	return false
}

// removeKeepingUserData apaga a instalação, menos o que é do usuário
// (portableUserPaths) — "o desinstalador nunca apaga config, cartões,
// states nem BIOS" (pedido do Douglas, 2026-10-05). Devolve se sobrou algo.
func removeKeepingUserData(dir, adapterID string) (kept bool, err error) {
	protected := portableUserPaths[adapterID]
	if len(protected) == 0 || !isPortableInstall(dir) {
		return false, os.RemoveAll(dir)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false, err
	}
	for _, e := range entries {
		if protected[strings.ToLower(e.Name())] {
			kept = true
			continue
		}
		if err := os.RemoveAll(filepath.Join(dir, e.Name())); err != nil {
			return kept, err
		}
	}
	if !kept {
		return false, os.Remove(dir)
	}
	return true, nil
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
func preservePortableUserData(oldDir, newDir, adapterID string) error {
	if !isPortableInstall(oldDir) {
		return nil
	}
	protected := portableUserPaths[adapterID]

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

		if _, err := os.Stat(target); err == nil && !protected[strings.ToLower(strings.Split(filepath.ToSlash(rel), "/")[0])] {
			// O pacote novo já traz este arquivo (ex.: um binário
			// atualizado) — ele tem prioridade sobre o antigo. Exceto o que
			// é do usuário (portableUserPaths): esse vem sempre do antigo.
			return nil
		}

		return copyFile(path, target)
	})
}

// pcsx2SeedPath diz onde semear a configuração do PCSX2. Aponta para o
// arquivo que o binário real lê (Documentos\PCSX2\inis\PCSX2.ini no Windows,
// ~/.config/PCSX2/inis/PCSX2.ini no Linux), calculado por um único lugar no
// projeto — internal/emulator, que já é dependência de internal/install.
//
// var, não chamada direta: o teste substitui por um caminho temporário e
// assim nunca encosta na configuração real de quem roda a suíte (mesmo
// padrão de pcsx2ConfigPath em internal/emulator).
var pcsx2SeedPath = emulator.PCSX2ConfigPath

// seedPCSX2 grava a configuração mínima que faz o PCSX2 abrir direto no
// jogo, sem o "Assistente de Configuração do PCSX2" na frente.
//
// Duas chaves, as duas necessárias, medidas contra o binário real (PCSX2
// v2.8.2, Windows, 2026-09-11 — o método e os oito experimentos estão em
// docs/decisoes.md):
//
//   - "SettingsVersion = 1" é a que manda. Sem ela o PCSX2 trata o arquivo
//     como se não existisse config válida: não mostra o assistente, mas
//     também não cria a árvore de dados (memcards, sstates, logs…) e recusa
//     dar boot em qualquer jogo, em silêncio. É a armadilha do arquivo
//     "mínimo demais" — parecia funcionar porque o assistente sumia.
//   - "SetupWizardIncomplete = false" é a chave do assistente propriamente
//     dita, e só é lida quando a de cima está presente: com
//     "SettingsVersion = 1" e "SetupWizardIncomplete = true" o assistente
//     volta a aparecer. Gravá-la explícita (em vez de contar com o default)
//     é o que deixa a intenção legível.
//
// O que NÃO é semeado, de propósito: o BIOS. O ZeuX não tem como saber qual
// arquivo o usuário possui, e inventar um caminho faria o PCSX2 falhar de um
// jeito pior. Com o assistente suprimido o PCSX2 procura o BIOS só na raiz
// da pasta apontada por BiosDir — quem cobre esse buraco é o aviso de BIOS
// do próprio ZeuX, não este arquivo.
func seedPCSX2(installDir string) error {
	// Modo portátil (2026-10-05): numa instalação nova, sem configuração em
	// Documentos\PCSX2, liga o portable.ini já — tudo do PCSX2 passa a morar
	// na pasta do ZeuX. Com configuração lá, quem liga é a migração, com
	// confirmação do usuário (ligar antes faria o PCSX2 "esquecer" BIOS,
	// cartões e states). Ver emulator/pcsx2_portable.go.
	if pcsx2PortableSupported() && !emulator.PCSX2HasLegacyData() {
		if err := os.WriteFile(filepath.Join(installDir, emulator.PCSX2PortableMarker), nil, 0o644); err != nil {
			return fmt.Errorf("ligando o modo portátil do PCSX2: %w", err)
		}
	}

	iniPath, err := pcsx2SeedPath()
	if err != nil {
		// Sistema operacional em que o caminho do PCSX2 não foi confirmado
		// (macOS). Semear um palpite seria pior do que não semear nada: o
		// assistente continua aparecendo, mas nenhum arquivo estranho é
		// deixado para trás. Instalar não falha por causa disso.
		return nil
	}

	// Mescla (2026-10-05): arquivo existente é a config de verdade do
	// usuário — só o auto-update é forçado desligado (o ZeuX gerencia a
	// versão). Arquivo novo ganha o esboço mínimo + [Pad1]. Nunca reescreve.
	data, err := os.ReadFile(iniPath)
	fresh := os.IsNotExist(err)
	if err != nil && !fresh {
		return fmt.Errorf("lendo %s: %w", iniPath, err)
	}
	merged := emulator.MergePCSX2Defaults(data, fresh)
	if !fresh && string(merged) == string(data) {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(iniPath), 0o755); err != nil {
		return fmt.Errorf("criando a pasta de configuração do PCSX2: %w", err)
	}
	if err := os.WriteFile(iniPath, merged, 0o644); err != nil {
		return fmt.Errorf("gravando %s: %w", iniPath, err)
	}
	return nil
}

// pcsx2PortableSupported: var para os testes rodarem a regra do Windows em
// qualquer sistema.
var pcsx2PortableSupported = func() bool { return runtime.GOOS == "windows" }

// seedDolphin escreve a chave que marca o prompt de analytics como respondido,
// suprimindo o wizard de primeira execução do Dolphin.
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
// suprimindo o wizard de primeira execução do PPSSPP.
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
