package emulator

import (
	"os"
	"path/filepath"
	"runtime"
)

// BiosDir devolve a pasta onde o BIOS/firmware exigido por um console deve
// ser colocado, quando alguém já verificou de verdade — rodando o emulador —
// exatamente onde ele lê esse arquivo. Devolve ("", false) para todo o
// resto: nunca um palpite por convenção. Uma pasta errada é pior que
// nenhuma — o usuário coloca o arquivo, o jogo continua não abrindo, e agora
// ele nem sabe mais por quê.
//
// Cobertura verificada ao vivo em 2026-08-04 (Douglas testando um jogo de
// verdade, ver docs/roadmap.md):
//
//   - DuckStation (ps1): a pasta `bios/` fica dentro do diretório onde o
//     ZeuX instalou o AppImage, só quando foi o próprio ZeuX que instalou
//     (Managed) — nunca presumido para uma instalação alheia do usuário, que
//     pode não estar em modo portátil e usar outro lugar qualquer.
//   - PCSX2 (ps2): achado um bug real do próprio PCSX2 nesta sessão — mesmo
//     com o marcador `portable.txt` presente e a variável de ambiente
//     `$APPIMAGE` corretamente setada pelo bootstrap do AppImage, o binário
//     real (que roda dentro do squashfs montado) não herda essa variável, e
//     o PCSX2 cai sempre no diretório global do sistema
//     (`os.UserConfigDir()/PCSX2/bios`), nunca na pasta gerenciada pelo
//     ZeuX — independente de `Managed`. Confirmado lendo
//     `/proc/<pid>/environ` do processo real, não do processo de bootstrap.
//     Por isso este caso devolve o caminho global, não
//     `ManagedEmulatorDir`: é para onde o PCSX2 realmente olha hoje.
//
// RPCS3 (ps3) fica de fora de propósito: não usa uma pasta de destino — o
// firmware (PS3UPDAT.PUP) é processado pelo próprio instalador do RPCS3
// (menu Arquivo → Install Firmware, `main_window::InstallPup` no código-fonte
// dele), que abre um diálogo de arquivo e extrai/decifra internamente. Não
// há pasta correta para apontar.
func BiosDir(adapterID string, install Installation) (string, bool) {
	dir, ok := biosDirFor(adapterID, install)
	if !ok {
		return "", false
	}

	// Best-effort: cria a pasta se ainda não existir, para que "Abrir pasta"
	// na interface sempre tenha algo pra abrir, mesmo num emulador que nunca
	// rodou ainda. Erro aqui não é fatal — Survey continua funcionando, só
	// sem a garantia de que a pasta já existe (o próprio emulador ou o
	// usuário podem criá-la depois).
	_ = os.MkdirAll(dir, 0o755)

	return dir, true
}

func biosDirFor(adapterID string, install Installation) (string, bool) {
	switch adapterID {
	case "duckstation":
		if !install.Managed || install.BinaryPath == "" {
			return "", false
		}
		return filepath.Join(filepath.Dir(install.BinaryPath), "bios"), true

	case "pcsx2":
		// Só verificado no Linux nesta sessão. No Windows o PCSX2 usa outra
		// convenção (documentos do usuário, não %AppData%) que ninguém
		// confirmou ainda — melhor não apontar do que apontar errado.
		if runtime.GOOS != "linux" {
			return "", false
		}
		configDir, err := os.UserConfigDir()
		if err != nil {
			return "", false
		}
		return filepath.Join(configDir, "PCSX2", "bios"), true

	default:
		return "", false
	}
}
