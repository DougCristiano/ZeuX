package emulator

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Firmware de console que não é "arquivo numa pasta" (2026-09-29, relato do
// Douglas: um usuário instalou o RPCS3 e não achou onde pôr o firmware do
// PS3). BiosDir não serve para esse caso — o RPCS3 não lê firmware de pasta
// nenhuma: o PS3UPDAT.PUP passa pelo instalador dele, que decifra e extrai
// para dev_flash (ver o comentário de BiosDir). O que dá para fazer é
// (1) dizer se o firmware já está instalado, pela mesma prova que o RPCS3
// usa, e (2) entregar o arquivo que o usuário escolher ao instalador dele.
//
// O ZeuX nunca sugere de onde tirar o firmware (princípio 6 do CLAUDE.md): o
// arquivo é o que o usuário já tem no disco.

// FirmwareInstalled diz se o firmware do console já está instalado no
// emulador. known=false quando o ZeuX não sabe dizer — adapter sem firmware
// instalável, ou uma configuração que desvia do padrão (princípio 4: não
// verificável não conta como instalado nem como faltando).
func FirmwareInstalled(adapterID string, install Installation) (installed, known bool) {
	if adapterID != "rpcs3" || install.BinaryPath == "" {
		return false, false
	}
	dir, ok := rpcs3ConfigDir(install)
	if !ok {
		return false, false
	}
	if rpcs3CustomDevFlash(dir) {
		return false, false
	}
	// A mesma prova que o RPCS3 usa antes de bootar um jogo: sem este
	// arquivo ele recusa com "Firmware is missing" (rpcs3/Emu/System.cpp,
	// game_boot_result::firmware_missing).
	_, err := os.Stat(filepath.Join(dir, "dev_flash", "sys", "external", "liblv2.sprx"))
	return err == nil, true
}

// FirmwareInstallable diz se o ZeuX sabe entregar um arquivo de firmware ao
// instalador deste emulador.
func FirmwareInstallable(adapterID string) bool {
	return adapterID == "rpcs3"
}

// rpcs3ConfigDir espelha fs::get_config_dir (Utilities/File.cpp do RPCS3):
// uma pasta "portable/" ao lado do executável vence; senão, no Windows, a
// variável RPCS3_CONFIG_DIR ou a pasta do próprio executável; no Linux,
// $XDG_CONFIG_HOME/rpcs3 ou ~/.config/rpcs3; no macOS, ~/Library/Application
// Support/rpcs3. O dev_flash padrão é "$(EmulatorDir)dev_flash/", e
// EmulatorDir padrão é essa pasta (rpcs3/Emu/vfs_config.h).
//
// Lido do código-fonte do RPCS3, não observado com o binário rodando — ver a
// ressalva em docs/decisoes.md.
func rpcs3ConfigDir(install Installation) (string, bool) {
	exeDir := filepath.Dir(install.BinaryPath)
	// No AppImage o "executável" que o RPCS3 enxerga está dentro do squashfs
	// montado, não ao lado do arquivo .AppImage — a pasta portable/ ao lado
	// do AppImage não é a que ele procura.
	if !strings.EqualFold(filepath.Ext(install.BinaryPath), ".appimage") {
		if info, err := os.Stat(filepath.Join(exeDir, "portable")); err == nil && info.IsDir() {
			return filepath.Join(exeDir, "portable"), true
		}
	}

	switch runtime.GOOS {
	case "windows":
		if dir := os.Getenv("RPCS3_CONFIG_DIR"); dir != "" {
			return dir, true
		}
		return exeDir, true
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", false
		}
		return filepath.Join(home, "Library", "Application Support", "rpcs3"), true
	default:
		if dir := os.Getenv("XDG_CONFIG_HOME"); dir != "" {
			return filepath.Join(dir, "rpcs3"), true
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return "", false
		}
		return filepath.Join(home, ".config", "rpcs3"), true
	}
}

// rpcs3CustomDevFlash diz se o vfs.yml do usuário tira o dev_flash (ou a
// pasta do emulador) do padrão. Nesse caso o ZeuX não sabe onde o firmware
// está e prefere dizer "não sei" a afirmar que falta.
func rpcs3CustomDevFlash(configDir string) bool {
	candidates := []string{filepath.Join(configDir, "vfs.yml")}
	if runtime.GOOS == "windows" {
		// No Windows os arquivos de configuração ficam em config/
		// (fs::get_config_dir(true)).
		candidates = append([]string{filepath.Join(configDir, "config", "vfs.yml")}, candidates...)
	}
	for _, path := range candidates {
		f, err := os.Open(path)
		if err != nil {
			continue
		}
		defer f.Close()
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			key, value, ok := strings.Cut(strings.TrimSpace(scanner.Text()), ":")
			if !ok {
				continue
			}
			value = strings.Trim(strings.TrimSpace(value), `"'`)
			switch key {
			case "$(EmulatorDir)":
				if value != "" {
					return true
				}
			case "/dev_flash/":
				if value != "" && value != "$(EmulatorDir)dev_flash/" {
					return true
				}
			}
		}
		return false
	}
	return false
}

// InstallFirmware entrega o arquivo de firmware escolhido pelo usuário ao
// instalador do próprio emulador. Hoje só o RPCS3: `rpcs3 --installfw
// <arquivo>` abre a janela dele com a barra de progresso da instalação.
//
// A opção está no código do RPCS3 (rpcs3/rpcs3.cpp, `arg_installfw`, "Forces
// the emulator to install this firmware file."), que chama o mesmo
// main_window::InstallPup do menu Arquivo → Install Firmware. Não foi
// executada contra o binário real nesta máquina (ver docs/decisoes.md).
//
// Como no jogo, o processo não é amarrado à requisição HTTP: a instalação
// leva alguns minutos e continua depois da resposta.
func (l *Launcher) InstallFirmware(ctx context.Context, adapterID, firmwarePath string) error {
	if !FirmwareInstallable(adapterID) {
		return fmt.Errorf("o ZeuX não sabe instalar firmware no emulador %q", adapterID)
	}
	adapter, ok := l.registry.ByID(adapterID)
	if !ok {
		return fmt.Errorf("o ZeuX não conhece o emulador %q", adapterID)
	}
	install, ok := adapter.Locate(ctx)
	if !ok || install.BinaryPath == "" {
		return fmt.Errorf("o %s não está instalado", adapter.Name())
	}

	info, err := os.Stat(firmwarePath)
	if err != nil || !info.Mode().IsRegular() {
		return fmt.Errorf("o arquivo de firmware não foi encontrado: %s", firmwarePath)
	}
	if !strings.EqualFold(filepath.Ext(firmwarePath), ".pup") {
		return fmt.Errorf("o firmware do PS3 é um arquivo .PUP (normalmente PS3UPDAT.PUP); o arquivo escolhido é outro tipo")
	}

	cmd, err := command(context.Background(), []string{install.BinaryPath, "--installfw", firmwarePath})
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("não foi possível abrir o %s para instalar o firmware: %w", adapter.Name(), err)
	}
	l.logger.Info("instalação de firmware entregue ao emulador", "emulador", adapter.Name(), "pid", cmd.Process.Pid)

	go func() {
		if err := cmd.Wait(); err != nil {
			l.logger.Debug("instalador de firmware encerrado com erro", "emulador", adapter.Name(), "detalhe", err)
		}
	}()
	return nil
}
