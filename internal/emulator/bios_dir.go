package emulator

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
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
//   - PCSX2 (ps2), Linux: achado um bug real do próprio PCSX2 nesta sessão —
//     mesmo com o marcador `portable.txt` presente e a variável de ambiente
//     `$APPIMAGE` corretamente setada pelo bootstrap do AppImage, o binário
//     real (que roda dentro do squashfs montado) não herda essa variável, e
//     o PCSX2 cai sempre no diretório global do sistema
//     (`os.UserConfigDir()/PCSX2/bios`), nunca na pasta gerenciada pelo
//     ZeuX — independente de `Managed`. Confirmado lendo
//     `/proc/<pid>/environ` do processo real, não do processo de bootstrap.
//     Por isso este caso devolve o caminho global, não
//     `ManagedEmulatorDir`: é para onde o PCSX2 realmente olha hoje.
//   - PCSX2 (ps2), Windows: convenção documentada pelo próprio projeto
//     PCSX2 (pasta "Documentos\PCSX2\bios", não modo portátil — mesma razão
//     que o Linux: seedPCSX2 não ativa portable.ini para o PCSX2). Não
//     verificado contra um binário Windows real nesta sessão (2026-09-11) —
//     ver o comentário de pcsx2DataDir em pcsx2_config.go, que é quem
//     calcula este caminho para as duas plataformas.
//   - Flycast (dreamcast), Windows: verificado ao vivo em 2026-09-11 —
//     ver flycastBiosDir abaixo.
//
// Três emuladores foram investigados na mesma sessão de 2026-09-11 e ficaram
// de fora por conclusão própria, não por esquecimento (detalhes em
// docs/decisoes.md):
//
//   - RPCS3 (ps3): não usa uma pasta de destino — o firmware (PS3UPDAT.PUP) é
//     processado pelo próprio instalador do RPCS3 (menu Arquivo → Install
//     Firmware, `main_window::InstallPup` no código-fonte dele), que abre um
//     diálogo de arquivo e extrai/decifra internamente. Não há pasta correta
//     para apontar.
//   - xemu (xbox): mesma categoria do RPCS3, confirmado rodando o binário de
//     verdade nesta máquina. O xemu guarda cada arquivo como um caminho
//     absoluto e individual em `[sys.files]` do xemu.toml
//     (`bootrom_path`, `flashrom_path`, `eeprom_path`, `hdd_path`,
//     `dvd_path`), escolhidos pelo usuário num diálogo de arquivo; ele não
//     varre pasta nenhuma atrás de BIOS. Apontar uma pasta aqui faria o
//     usuário largar o MCPX e a imagem de flash num lugar que o xemu nunca
//     lê.
//   - Vita3K (vita): inconclusivo, não "sem pasta". O binário não chega a
//     iniciar nesta máquina (sai na hora, sem janela e sem log), porque o
//     Vita3K.exe importa VCRUNTIME140.dll, VCRUNTIME140_1.dll e MSVCP140.dll
//     e o runtime do MSVC não está instalado aqui. Sem conseguir observar o
//     emulador rodando, não dá para afirmar onde ele lê o firmware — e a
//     regra da casa é não chutar.
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
		// Linux e Windows resolvidos por pcsx2DataDir (pcsx2_config.go), que
		// também alimenta o painel de configurações — as duas nunca podem
		// divergir sobre onde o PCSX2 realmente olha. macOS continua sem
		// caminho: melhor não apontar do que apontar errado.
		dir, err := pcsx2DataDir()
		if err != nil {
			return "", false
		}
		return filepath.Join(dir, "bios"), true

	case "flycast":
		return flycastBiosDir(install)

	default:
		return "", false
	}
}

// flycastBiosDir devolve a pasta "data" ao lado do flycast.exe — a única
// verificada de verdade, e só no Windows.
//
// Verificação ao vivo em 2026-09-11, contra o binário que o próprio ZeuX
// instalou (Flycast para Windows x64):
//
//   - Rodado o flycast.exe e comparados os diretórios candidatos (pasta da
//     instalação, %AppData%, %LocalAppData%, Documentos, %UserProfile%) antes
//     e depois: o Flycast criou "data/" e reescreveu "emu.cfg" ao lado do
//     executável, e não tocou em nada fora dali.
//   - Repetido depois de apagar "emu.cfg" e "data/": o comportamento não
//     mudou. Diferente do xemu (onde xemu.toml é um marcador de verdade: sem
//     ele o xemu passa a gravar em %AppData%\xemu\), o Flycast no Windows é
//     portátil incondicionalmente — não depende de `seedFlycast` ter rodado,
//     e por isso este caminho vale também para a instalação que o usuário já
//     tinha por conta própria, não só para a gerenciada.
//   - Repetido com o diretório de trabalho apontando para outra pasta: o
//     "data/" continuou nascendo ao lado do executável. A âncora é o caminho
//     do binário, não o CWD — o que importa porque o launcher do ZeuX não
//     promete rodar o emulador de dentro da pasta dele.
//   - Quem diz que é ali que o BIOS entra é o próprio binário: a string de
//     ajuda embutida no flycast.exe (e traduzida para português no mesmo
//     arquivo) é "A pasta onde o Flycast salva os arquivos de configuração e
//     VMUs. Os arquivos de BIOS devem estar em uma subpasta chamada \"data\"",
//     ao lado de "Pastas que contêm arquivos BIOS (por exemplo, dc_boot.bin
//     ou dc_bios.bin)".
//
// Ressalva honesta: o Flycast tem uma chave de configuração
// (`Dreamcast.BiosPath`) que deixa o usuário acrescentar outras pastas de
// BIOS pela própria interface. Se ele fizer isso, o BIOS também funciona de
// lá — esta função devolve o padrão, que é onde o Flycast procura sem
// ninguém configurar nada.
//
// Linux e macOS ficam de fora: lá o Flycast não é portátil (usa o diretório
// de dados do usuário), e isso não foi verificado nesta sessão. Mesma regra
// de sempre — melhor não apontar do que apontar errado.
func flycastBiosDir(install Installation) (string, bool) {
	if runtime.GOOS != "windows" || install.BinaryPath == "" {
		return "", false
	}
	return filepath.Join(filepath.Dir(install.BinaryPath), "data"), true
}

// flycastBootROMs são os dois nomes que o próprio flycast.exe cita como o
// arquivo de boot do Dreamcast ("Pastas que contêm arquivos BIOS (por
// exemplo, dc_boot.bin ou dc_bios.bin)"). Comparados em minúsculas porque o
// caso verificado é o Windows, onde o nome no disco pode vir com qualquer
// caixa.
var flycastBootROMs = []string{"dc_boot.bin", "dc_bios.bin"}

// BiosDirLooksEmpty diz se a pasta de BIOS ainda está esperando o arquivo que
// o emulador procura. O segundo retorno é false quando não deu para olhar a
// pasta (ela não existe, ou o sistema recusou a leitura) — aí o ZeuX não
// afirma nem que falta nem que está lá, pelo princípio 4: dado que não pôde
// ser lido não conta como atendido nem como não atendido.
//
// O critério padrão é "a pasta não tem nada dentro", que serve para
// DuckStation e PCSX2 porque a pasta deles é dedicada ao BIOS e mais nada.
//
// O Flycast precisa de um critério próprio (achado de 2026-09-11): a pasta
// dele é "data", que é também onde o próprio Flycast guarda o cache de
// shaders e as capas — depois da primeira execução ela nunca está vazia. Com
// o critério padrão, o ZeuX diria que o BIOS do Dreamcast está no lugar sem
// nenhum BIOS existir, que é pior do que não dizer nada. Então aqui a
// pergunta é pelo arquivo de boot em si, não pela pasta.
func BiosDirLooksEmpty(adapterID, dir string) (bool, bool) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false, false
	}

	if adapterID != "flycast" {
		return len(entries) == 0, true
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := strings.ToLower(entry.Name())
		for _, rom := range flycastBootROMs {
			if name == rom {
				return false, true
			}
		}
	}
	return true, true
}
