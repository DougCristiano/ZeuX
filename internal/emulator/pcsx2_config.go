package emulator

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

// pcsx2DataDir resolve a pasta base onde o PCSX2 grava configuração, BIOS e
// memory cards nesta plataforma. Usada tanto por pcsx2ConfigPath (abaixo)
// quanto por BiosDir (bios_dir.go), para as duas nunca divergirem sobre onde
// o PCSX2 realmente olha.
//
// Linux: verificado contra binário real em 2026-08-05 (PCSX2 2.6.3,
// inclusive a cópia instalada pelo próprio ZeuX): mesmo a instalação
// gerenciada (AppImage) não roda em modo portátil — grava em
// "~/.config/PCSX2/" (padrão XDG, via os.UserConfigDir()), não em
// "<diretório da instalação>/inis/". `seedPCSX2` (firstrun.go) grava um
// "inis/PCSX2_qt.ini" dentro do diretório gerenciado partindo do
// pressuposto de modo portátil — achado real desta sessão mostra que esse
// arquivo nunca é lido pelo binário de verdade nesta plataforma; a correção
// de seedPCSX2 fica fora do escopo do H1, registrada aqui para não se
// perder.
//
// Windows: convenção documentada pelo próprio projeto PCSX2 — pasta
// "Documentos\PCSX2\", não "%AppData%\PCSX2\" (esse era o palpite anterior
// deste arquivo, errado: PCSX2 no Windows sem modo portátil usa a pasta de
// Documentos, não AppData; seedPCSX2 não ativa modo portátil para o PCSX2,
// só suprime o assistente de primeira execução). Não verificado contra um
// binário Windows real nesta sessão (2026-09-11, achado reportado pelo
// Douglas: o painel de configurações do PCSX2 parecia não funcionar — o
// caminho antigo lia/gravava em AppData, onde o PCSX2 nunca escreveu nada).
// Se o "Documentos" do usuário estiver redirecionado (OneDrive, política de
// empresa), este caminho erra — não há como descobrir isso sem a API nativa
// de pastas conhecidas do Windows, que o projeto evita para não crescer a
// superfície de dependências.
//
// macOS: sem confirmação nenhuma — devolve erro, e BiosDir/pcsx2ConfigPath
// continuam recusando apontar qualquer caminho. Mesma regra de "melhor não
// apontar do que apontar errado" que já vale para o resto do arquivo.
func pcsx2DataDir() (string, error) {
	switch runtime.GOOS {
	case "linux":
		dir, err := os.UserConfigDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(dir, "PCSX2"), nil
	case "windows":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, "Documents", "PCSX2"), nil
	default:
		return "", fmt.Errorf("caminho de configuração do PCSX2 não confirmado neste sistema operacional")
	}
}

// pcsx2ConfigPath resolve o arquivo que o PCSX2 de fato lê/grava.
//
// var, não const/func fixa: testes substituem por um caminho temporário,
// sem tocar no diretório de configuração real da máquina que roda o teste
// (mesmo padrão de internal/consent, internal/igdb).
var pcsx2ConfigPath = func() (string, error) {
	dir, err := pcsx2DataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "inis", "PCSX2.ini"), nil
}

// pcsx2ReadConfig lê Fullscreen e InternalScale — os dois campos
// confirmados contra um PCSX2.ini gerado por uma execução real (chaves
// `[UI] StartFullscreen` e `[EmuCore/GS] upscale_multiplier`). Renderer não
// é lido: a chave real (`[EmuCore/GS] Renderer`) guarda um id numérico cujo
// mapeamento não foi confirmado contra o comportamento do binário — melhor
// declarar "não sei" do que arriscar um mapeamento errado silencioso.
func pcsx2ReadConfig(path string) (PersistedOptions, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return PersistedOptions{}, nil
	}
	if err != nil {
		return PersistedOptions{}, fmt.Errorf("lendo %s: %w", path, err)
	}

	ini := parseINI(data)
	var opts PersistedOptions

	if raw, ok := ini.get("UI", "StartFullscreen"); ok {
		if v, err := strconv.ParseBool(raw); err == nil {
			opts.Fullscreen = &v
		}
	}
	if raw, ok := ini.get("EmuCore/GS", "upscale_multiplier"); ok {
		if v, err := strconv.Atoi(raw); err == nil {
			opts.InternalScale = &v
		}
	}

	return opts, nil
}

// pcsx2WriteConfig grava Fullscreen/InternalScale, preservando tudo mais no
// arquivo byte a byte (via iniFile). Renderer sempre vai para Unapplied —
// mesma ressalva de pcsx2ReadConfig.
func pcsx2WriteConfig(path string, opts Options) ([]string, error) {
	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("lendo %s: %w", path, err)
	}

	ini := parseINI(data)
	var unapplied []string

	ini.set("UI", "StartFullscreen", strconv.FormatBool(opts.Fullscreen))

	if opts.InternalScale > 0 {
		ini.set("EmuCore/GS", "upscale_multiplier", strconv.Itoa(opts.InternalScale))
	}

	if opts.Renderer != RendererDefault {
		unapplied = append(unapplied,
			"O backend gráfico do PCSX2 precisa ser ajustado dentro do próprio emulador — o mapeamento da chave Renderer não foi confirmado contra o binário real.")
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("criando a pasta de configuração do PCSX2: %w", err)
	}
	if err := os.WriteFile(path, ini.bytes(), 0o644); err != nil {
		return nil, fmt.Errorf("gravando %s: %w", path, err)
	}

	return unapplied, nil
}

// pcsx2ConfigurableAdapter envolve o standaloneAdapter do PCSX2 (definido em
// standalone.go) com a capacidade de ler/escrever a config persistida
// (ConfigurableAdapter, H1) — sem alterar nenhum outro adapter: os outros 11
// continuam sendo `standaloneAdapter` puro, que não satisfaz
// ConfigurableAdapter (a asserção de tipo falha neles de propósito).
type pcsx2ConfigurableAdapter struct {
	Adapter
}

func (pcsx2ConfigurableAdapter) ReadConfig(install Installation) (PersistedOptions, error) {
	path, err := pcsx2ConfigPath()
	if err != nil {
		return PersistedOptions{}, err
	}
	return pcsx2ReadConfig(path)
}

func (pcsx2ConfigurableAdapter) WriteConfig(install Installation, opts Options) ([]string, error) {
	path, err := pcsx2ConfigPath()
	if err != nil {
		return nil, err
	}
	if err := backupBeforeFirstWrite(path); err != nil {
		return nil, err
	}
	return pcsx2WriteConfig(path, opts)
}

func (pcsx2ConfigurableAdapter) RestoreConfig(install Installation) error {
	path, err := pcsx2ConfigPath()
	if err != nil {
		return err
	}
	return restoreFromBackup(path)
}

// pcsx2PadActions são as 16 ações de "[Pad1]" confirmadas contra um
// PCSX2.ini real (gerado por uma execução de verdade, ver comentário de
// pcsx2ConfigPath) — nome exato da chave, maiúscula inicial inclusive.
var pcsx2PadActions = []string{
	"Up", "Down", "Left", "Right",
	"Triangle", "Circle", "Cross", "Square",
	"Select", "Start",
	"L1", "L2", "L3", "R1", "R2", "R3",
}

func (pcsx2ConfigurableAdapter) Actions() []string {
	return append([]string(nil), pcsx2PadActions...)
}

// pcsx2ReadBindings lê "[Pad1] Ação = Keyboard/Tecla" ou
// "[Pad1] Ação = SDL-N/NomePosicional" (ex.: "SDL-0/FaceSouth") — o segundo
// formato foi confirmado em 2026-09-08 mapeando um controle físico de
// verdade (Xbox Series S/X) direto no Pad1 padrão do PCSX2, sem perfil de
// entrada separado. Um valor "SDL-" vira Button (valor bruto, com o índice
// de dispositivo incluído — não é o vocabulário do ZeuX, é o do PCSX2);
// qualquer outro valor continua sendo tratado como tecla.
func (pcsx2ConfigurableAdapter) ReadBindings(install Installation) ([]InputBinding, error) {
	path, err := pcsx2ConfigPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("lendo %s: %w", path, err)
	}

	ini := parseINI(data)
	bindings := make([]InputBinding, 0, len(pcsx2PadActions))
	for _, action := range pcsx2PadActions {
		binding := InputBinding{Action: action}
		if raw, ok := ini.get("Pad1", action); ok {
			if strings.HasPrefix(raw, "SDL-") {
				value := raw
				binding.Button = &value
			} else {
				key := strings.TrimPrefix(raw, "Keyboard/")
				binding.Key = &key
			}
		}
		bindings = append(bindings, binding)
	}
	return bindings, nil
}

// pcsx2ControllerConfigured diz se o Pad1 padrão tem, agora, pelo menos uma
// ação vinculada a um botão físico (prefixo "SDL-") em vez de teclado —
// sinal de que o usuário já mapeou um controle de verdade dentro do próprio
// PCSX2 (Configurações → Controladores → Pad1). Arquivo ausente conta como
// "ainda não configurado", não como erro — o PCSX2 pode nunca ter sido
// aberto.
func pcsx2ControllerConfigured() (bool, error) {
	path, err := pcsx2ConfigPath()
	if err != nil {
		return false, err
	}

	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("lendo %s: %w", path, err)
	}

	ini := parseINI(data)
	for _, action := range pcsx2PadActions {
		if raw, ok := ini.get("Pad1", action); ok && strings.HasPrefix(raw, "SDL-") {
			return true, nil
		}
	}
	return false, nil
}

func (pcsx2ConfigurableAdapter) ControllerConfigured(install Installation) (bool, error) {
	return pcsx2ControllerConfigured()
}

// pcsx2WriteBindings grava "[Pad1] Ação = Keyboard/Tecla" para cada binding
// com Key preenchida, preservando o resto do arquivo. Um binding com Button
// (não Key) vai para Unapplied — o formato de botão de controle do PCSX2
// não foi confirmado contra hardware real nesta sessão.
func (pcsx2ConfigurableAdapter) WriteBindings(install Installation, bindings []InputBinding) ([]string, error) {
	path, err := pcsx2ConfigPath()
	if err != nil {
		return nil, err
	}
	if err := backupBeforeFirstWrite(path); err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("lendo %s: %w", path, err)
	}

	ini := parseINI(data)
	var unapplied []string

	knownActions := make(map[string]bool, len(pcsx2PadActions))
	for _, a := range pcsx2PadActions {
		knownActions[a] = true
	}

	for _, b := range bindings {
		if !knownActions[b.Action] {
			unapplied = append(unapplied, fmt.Sprintf("O PCSX2 não tem a ação %q em [Pad1].", b.Action))
			continue
		}
		if b.Key != nil {
			ini.set("Pad1", b.Action, "Keyboard/"+*b.Key)
		}
		if b.Button != nil {
			unapplied = append(unapplied, fmt.Sprintf(
				"O botão de controle para %q precisa ser mapeado dentro do próprio PCSX2 — o formato de botão físico não foi confirmado contra hardware real.", b.Action))
		}
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("criando a pasta de configuração do PCSX2: %w", err)
	}
	if err := os.WriteFile(path, ini.bytes(), 0o644); err != nil {
		return nil, fmt.Errorf("gravando %s: %w", path, err)
	}

	return unapplied, nil
}
