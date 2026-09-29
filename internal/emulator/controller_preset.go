package emulator

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// ControllerSupport diz o que o usuário precisa fazer para o controle
// funcionar num emulador — a pergunta da tela "Configurar controle"
// (2026-09-29: "a configuração de controle dos outros consoles precisa
// aparecer também"). Três respostas, e só elas, porque são as três situações
// que o código-fonte de cada emulador mostrou:
//
//   - "auto": o emulador já liga o controle sozinho na primeira execução,
//     sem arquivo nenhum do ZeuX. Lido no código de cada um (setembro de
//     2026): RetroArch (autoconfig por vendor/product), PPSSPP (RestoreDefault
//     mapeia XInput e controle genérico), Flycast (DefaultInputMapping a partir
//     do SDL_GameController), xemu (`input.auto_bind`, ligado por padrão),
//     Vita3K (abre os controles SDL que achar) e Xenia (`hid = "any"`).
//   - "preset": o emulador começa só no teclado (ou sem nada), mas o formato
//     do bind é **posicional** — "o botão de baixo do primeiro controle", não
//     "o controle X da marca Y" — então um mapeamento padrão escrito pelo ZeuX
//     serve para qualquer controle. É o caso de PCSX2 e DuckStation (SDL, em
//     qualquer sistema) e do RPCS3 no Windows (handler XInput).
//   - "manual": o bind carrega o nome ou o GUID do aparelho (Dolphin, RMG,
//     Cemu, RPCS3 fora do Windows) ou o formato não foi lido ainda (melonDS,
//     Azahar). Escrever um palpite ali deixaria o controle mudo sem ninguém
//     entender por quê — o ZeuX diz para configurar dentro do emulador.
//
// Emulador personalizado (Custom) não tem resposta: o ZeuX não sabe o que ele
// é, e dizer "manual" seria afirmar algo não verificado.
type ControllerSupport string

const (
	ControllerSupportAuto   ControllerSupport = "auto"
	ControllerSupportPreset ControllerSupport = "preset"
	ControllerSupportManual ControllerSupport = "manual"
)

// ErrControllerPresetUnavailable é devolvido quando o ZeuX não sabe gravar
// um mapeamento padrão para este emulador nesta instalação.
var ErrControllerPresetUnavailable = errors.New("o ZeuX não sabe gravar um mapeamento de controle para este emulador — configure dentro dele")

// ErrControllerPresetExisting é devolvido quando o arquivo de controle já
// tem configuração do usuário que o ZeuX não sabe editar sem estragar (hoje,
// o YAML do RPCS3).
var ErrControllerPresetExisting = errors.New("este emulador já tem uma configuração de controle salva — ajuste dentro dele")

// ControllerSupportFor responde a pergunta de ControllerSupport para uma
// instalação concreta. Depende da instalação porque o mesmo emulador muda de
// resposta: o DuckStation só é "preset" quando o ZeuX sabe onde fica o
// settings.ini dele (instalação gerenciada, portátil), e o RPCS3 só no
// Windows.
func ControllerSupportFor(adapterID string, install Installation) (ControllerSupport, bool) {
	switch adapterID {
	case "retroarch", "ppsspp", "flycast", "xemu", "vita3k", "xenia":
		return ControllerSupportAuto, true
	case "pcsx2":
		if _, err := pcsx2ConfigPath(); err != nil {
			return ControllerSupportManual, true
		}
		return ControllerSupportPreset, true
	case "duckstation":
		if _, ok := duckStationSettingsPath(install); !ok {
			return ControllerSupportManual, true
		}
		return ControllerSupportPreset, true
	case "rpcs3":
		if _, ok := rpcs3InputConfigPath(install); !ok {
			return ControllerSupportManual, true
		}
		return ControllerSupportPreset, true
	case "dolphin", "rmg", "cemu", "melonds", "azahar":
		return ControllerSupportManual, true
	default:
		return "", false
	}
}

// ControllerPresetApplied diz se o jogador 1 deste emulador já tem um
// controle físico mapeado — pelo ZeuX ou pelo próprio usuário, tanto faz: a
// pergunta da tela é "falta alguma coisa?", não "quem fez". known=false
// quando o emulador não é "preset" ou o arquivo não pôde ser lido.
func ControllerPresetApplied(adapterID string, install Installation) (applied, known bool) {
	switch adapterID {
	case "pcsx2":
		ok, err := pcsx2ControllerConfigured()
		return ok, err == nil
	case "duckstation":
		path, ok := duckStationSettingsPath(install)
		if !ok {
			return false, false
		}
		ok, err := iniSectionHasPrefix(path, "Pad1", duckStationPadActions(), "SDL-")
		return ok, err == nil
	case "rpcs3":
		path, ok := rpcs3InputConfigPath(install)
		if !ok {
			return false, false
		}
		handler, err := rpcs3Player1Handler(path)
		if err != nil {
			return false, false
		}
		return handler != "" && handler != "Keyboard" && handler != "Null", true
	default:
		return false, false
	}
}

// ApplyControllerPreset grava o mapeamento padrão do ZeuX no jogador 1.
//
// Em PCSX2 e DuckStation cada ação recebe **dois** binds: o botão do
// primeiro controle (SDL-0) e a tecla que o próprio emulador usaria por
// padrão. O teclado não some ao ligar o controle — quem joga no teclado não
// perde nada, e quem pluga um controle depois não precisa voltar aqui.
//
// Faz backup antes da primeira escrita (backupBeforeFirstWrite), como toda
// escrita de configuração de emulador pelo ZeuX.
func ApplyControllerPreset(adapterID string, install Installation) error {
	switch adapterID {
	case "pcsx2":
		path, err := pcsx2ConfigPath()
		if err != nil {
			return ErrControllerPresetUnavailable
		}
		return writePadPreset(path, "Pad1", pcsx2ControllerPreset)
	case "duckstation":
		path, ok := duckStationSettingsPath(install)
		if !ok {
			return ErrControllerPresetUnavailable
		}
		return writePadPreset(path, "Pad1", duckStationControllerPreset)
	case "rpcs3":
		path, ok := rpcs3InputConfigPath(install)
		if !ok {
			return ErrControllerPresetUnavailable
		}
		return writeRPCS3XInputPreset(path)
	default:
		return ErrControllerPresetUnavailable
	}
}

// NeedsControllerPreset diz se vale aplicar o mapeamento padrão sem
// perguntar: o arquivo existe e o jogador 1 não tem **bind nenhum**, nem de
// teclado. É o estado que o próprio ZeuX criava ao semear PCSX2/DuckStation
// só com a chave do assistente (o emulador lê o arquivo, não acha [Pad1] e
// fica sem controle nenhum — nem o teclado padrão). Nesse estado não há
// escolha do usuário a preservar, então consertar ao abrir o jogo não passa
// por cima de ninguém. Arquivo ausente conta como "não": o emulador ainda
// vai criar os padrões dele na primeira execução.
func NeedsControllerPreset(adapterID string, install Installation) bool {
	var path string
	var actions []string
	switch adapterID {
	case "pcsx2":
		p, err := pcsx2ConfigPath()
		if err != nil {
			return false
		}
		path, actions = p, pcsx2PresetActions()
	case "duckstation":
		p, ok := duckStationSettingsPath(install)
		if !ok {
			return false
		}
		path, actions = p, duckStationPadActions()
	default:
		return false
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	ini := parseINI(data)
	for _, action := range actions {
		for _, v := range ini.getAll("Pad1", action) {
			if v != "" {
				return false
			}
		}
	}
	return true
}

// padPresetEntry é uma ação do jogador 1 com os binds, em ordem.
type padPresetEntry struct {
	action string
	values []string
}

// pcsx2ControllerPreset é o que o próprio PCSX2 gravaria ao clicar em
// "Mapeamento automático" com um controle SDL (Pad::MapController +
// SDLInputSource::GetGenericBindingMapping, pcsx2/SIO/Pad/PadDualshock2.cpp)
// somado ao mapeamento padrão de teclado dele
// (GetKeyboardGenericBindingMapping, pcsx2/Input/InputManager.cpp). O formato
// "SDL-0/FaceSouth" foi confirmado com um controle Xbox de verdade em
// 2026-09-08 (ver pcsx2ReadBindings); o resto dos nomes vem da mesma tabela
// do código-fonte.
var pcsx2ControllerPreset = []padPresetEntry{
	{"Up", []string{"SDL-0/DPadUp", "Keyboard/Up"}},
	{"Right", []string{"SDL-0/DPadRight", "Keyboard/Right"}},
	{"Down", []string{"SDL-0/DPadDown", "Keyboard/Down"}},
	{"Left", []string{"SDL-0/DPadLeft", "Keyboard/Left"}},
	{"Triangle", []string{"SDL-0/FaceNorth", "Keyboard/I"}},
	{"Circle", []string{"SDL-0/FaceEast", "Keyboard/L"}},
	{"Cross", []string{"SDL-0/FaceSouth", "Keyboard/K"}},
	{"Square", []string{"SDL-0/FaceWest", "Keyboard/J"}},
	{"Select", []string{"SDL-0/Back", "Keyboard/Backspace"}},
	{"Start", []string{"SDL-0/Start", "Keyboard/Return"}},
	{"L1", []string{"SDL-0/LeftShoulder", "Keyboard/Q"}},
	{"L2", []string{"SDL-0/+LeftTrigger", "Keyboard/1"}},
	{"R1", []string{"SDL-0/RightShoulder", "Keyboard/E"}},
	{"R2", []string{"SDL-0/+RightTrigger", "Keyboard/3"}},
	{"L3", []string{"SDL-0/LeftStick", "Keyboard/2"}},
	{"R3", []string{"SDL-0/RightStick", "Keyboard/4"}},
	{"Analog", []string{"SDL-0/Guide"}},
	{"LUp", []string{"SDL-0/-LeftY", "Keyboard/W"}},
	{"LRight", []string{"SDL-0/+LeftX", "Keyboard/D"}},
	{"LDown", []string{"SDL-0/+LeftY", "Keyboard/S"}},
	{"LLeft", []string{"SDL-0/-LeftX", "Keyboard/A"}},
	{"RUp", []string{"SDL-0/-RightY", "Keyboard/T"}},
	{"RRight", []string{"SDL-0/+RightX", "Keyboard/H"}},
	{"RDown", []string{"SDL-0/+RightY", "Keyboard/G"}},
	{"RLeft", []string{"SDL-0/-RightX", "Keyboard/F"}},
	{"LargeMotor", []string{"SDL-0/LargeMotor"}},
	{"SmallMotor", []string{"SDL-0/SmallMotor"}},
}

// duckStationControllerPreset é o equivalente para o controle analógico do
// DuckStation (AnalogController, o tipo padrão da porta 1). Mesma origem —
// MapController + mapeamento genérico SDL e de teclado
// (src/util/input_manager.cpp, src/util/sdl_input_source.cpp) —, com duas
// diferenças de vocabulário que o código mostra e que não dá para copiar do
// PCSX2: os botões de face são "A/B/X/Y" (a tabela de nomes que o DuckStation
// lê do arquivo é sempre a posicional do Xbox, mesmo com controle de
// PlayStation) e as teclas são "UpArrow"/"Enter", não "Up"/"Return".
// Diferente do PCSX2, este formato **não** foi conferido com controle físico
// — é leitura de código-fonte.
var duckStationControllerPreset = []padPresetEntry{
	{"Up", []string{"SDL-0/DPadUp", "Keyboard/UpArrow"}},
	{"Right", []string{"SDL-0/DPadRight", "Keyboard/RightArrow"}},
	{"Down", []string{"SDL-0/DPadDown", "Keyboard/DownArrow"}},
	{"Left", []string{"SDL-0/DPadLeft", "Keyboard/LeftArrow"}},
	{"Triangle", []string{"SDL-0/Y", "Keyboard/I"}},
	{"Circle", []string{"SDL-0/B", "Keyboard/L"}},
	{"Cross", []string{"SDL-0/A", "Keyboard/K"}},
	{"Square", []string{"SDL-0/X", "Keyboard/J"}},
	{"Select", []string{"SDL-0/Back", "Keyboard/Backspace"}},
	{"Start", []string{"SDL-0/Start", "Keyboard/Enter"}},
	{"Analog", []string{"SDL-0/Guide"}},
	{"L1", []string{"SDL-0/LeftShoulder", "Keyboard/Q"}},
	{"R1", []string{"SDL-0/RightShoulder", "Keyboard/E"}},
	{"L2", []string{"SDL-0/+LeftTrigger", "Keyboard/1"}},
	{"R2", []string{"SDL-0/+RightTrigger", "Keyboard/3"}},
	{"L3", []string{"SDL-0/LeftStick", "Keyboard/2"}},
	{"R3", []string{"SDL-0/RightStick", "Keyboard/4"}},
	{"LLeft", []string{"SDL-0/-LeftX", "Keyboard/A"}},
	{"LRight", []string{"SDL-0/+LeftX", "Keyboard/D"}},
	{"LDown", []string{"SDL-0/+LeftY", "Keyboard/S"}},
	{"LUp", []string{"SDL-0/-LeftY", "Keyboard/W"}},
	{"RLeft", []string{"SDL-0/-RightX", "Keyboard/F"}},
	{"RRight", []string{"SDL-0/+RightX", "Keyboard/H"}},
	{"RDown", []string{"SDL-0/+RightY", "Keyboard/G"}},
	{"RUp", []string{"SDL-0/-RightY", "Keyboard/T"}},
	{"LargeMotor", []string{"SDL-0/LargeMotor"}},
	{"SmallMotor", []string{"SDL-0/SmallMotor"}},
}

func presetActions(preset []padPresetEntry) []string {
	actions := make([]string, len(preset))
	for i, e := range preset {
		actions[i] = e.action
	}
	return actions
}

func pcsx2PresetActions() []string    { return presetActions(pcsx2ControllerPreset) }
func duckStationPadActions() []string { return presetActions(duckStationControllerPreset) }

// writePadPreset troca, em [section], só as ações do preset — tipo de
// controle, sensibilidade e o resto do arquivo ficam como estavam.
func writePadPreset(path, section string, preset []padPresetEntry) error {
	if err := backupBeforeFirstWrite(path); err != nil {
		return err
	}
	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("lendo %s: %w", path, err)
	}
	ini := parseINI(data)
	for _, e := range preset {
		ini.setAll(section, e.action, e.values)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("criando a pasta de %s: %w", path, err)
	}
	if err := os.WriteFile(path, ini.bytes(), 0o644); err != nil {
		return fmt.Errorf("gravando %s: %w", path, err)
	}
	return nil
}

// iniSectionHasPrefix diz se alguma das ações tem um bind começando com
// prefix. Arquivo ausente é "não", sem erro.
func iniSectionHasPrefix(path, section string, actions []string, prefix string) (bool, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("lendo %s: %w", path, err)
	}
	ini := parseINI(data)
	for _, action := range actions {
		for _, v := range ini.getAll(section, action) {
			if strings.HasPrefix(v, prefix) {
				return true, nil
			}
		}
	}
	return false, nil
}

// duckStationSettingsPath só responde para a instalação gerenciada em modo
// portátil: é o único settings.ini cujo lugar o ZeuX conhece com certeza
// (ele mesmo criou o portable.txt — seedDuckStationPortable). O DuckStation
// que o usuário instalou por conta própria guarda a config numa pasta de
// dados que muda entre versões e sistemas; apontar um palpite ali seria
// gravar num arquivo que ninguém lê.
func duckStationSettingsPath(install Installation) (string, bool) {
	if !install.Managed || install.BinaryPath == "" {
		return "", false
	}
	dir := filepath.Dir(install.BinaryPath)
	if _, err := os.Stat(filepath.Join(dir, "portable.txt")); err != nil {
		return "", false
	}
	return filepath.Join(dir, "settings.ini"), true
}

// rpcs3InputConfigPath é o arquivo de controle global do RPCS3
// (rpcs3::utils::get_input_config_dir + "Default.yml"). Só no Windows: lá o
// handler XInput nomeia o aparelho por posição ("XInput Pad #1"), então um
// arquivo escrito pelo ZeuX serve para qualquer controle compatível. No
// Linux e no macOS o handler é SDL, e o nome do aparelho inclui o nome do
// produto ("Xbox Series X Controller 1") — não há texto genérico que sirva.
func rpcs3InputConfigPath(install Installation) (string, bool) {
	if runtime.GOOS != "windows" {
		return "", false
	}
	dir, ok := rpcs3ConfigDir(install)
	if !ok {
		return "", false
	}
	// No Windows fs::get_config_dir(true) acrescenta "config/".
	return filepath.Join(dir, "config", "input_configs", "global", "Default.yml"), true
}

// rpcs3Player1Handler lê só o "Handler:" do bloco "Player 1 Input:" — o
// suficiente para saber se há controle ligado, sem precisar de um parser
// YAML inteiro. Arquivo ausente ou vazio devolve "" (o RPCS3 cai no teclado).
func rpcs3Player1Handler(path string) (string, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	inPlayer1 := false
	for _, raw := range strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n") {
		if raw == "" {
			continue
		}
		if !strings.HasPrefix(raw, " ") {
			inPlayer1 = strings.TrimSpace(raw) == "Player 1 Input:"
			continue
		}
		trimmed := strings.TrimSpace(raw)
		// Só o nível logo abaixo de "Player 1 Input:" (dois espaços) — o
		// "Handler" não se repete mais fundo, mas conferir a indentação evita
		// ler outra coisa se isso mudar.
		if inPlayer1 && strings.HasPrefix(raw, "  ") && !strings.HasPrefix(raw, "   ") && strings.HasPrefix(trimmed, "Handler:") {
			return strings.TrimSpace(strings.TrimPrefix(trimmed, "Handler:")), nil
		}
	}
	return "", nil
}

// rpcs3XInputPreset liga o jogador 1 ao primeiro controle XInput. Só
// Handler e Device: o RPCS3 carrega o arquivo, aplica os padrões do handler
// escolhido (pad_thread::InitPadConfig → init_config) e carrega o arquivo de
// novo por cima (rpcs3/Input/pad_thread.cpp) — então as chaves ausentes
// ganham o mapeamento padrão do XInput, e não os valores do teclado.
const rpcs3XInputPreset = "Player 1 Input:\n  Handler: XInput\n  Device: XInput Pad #1\n"

// writeRPCS3XInputPreset só grava quando não há configuração nenhuma: o
// Default.yml é YAML aninhado, e editar um arquivo do usuário sem um parser
// de verdade arriscaria corromper os outros jogadores. Trocar o teclado pelo
// controle **desliga o teclado** no jogador 1 — é o preço do handler único
// por jogador no RPCS3, e por isso este preset nunca é aplicado sem o
// usuário pedir.
func writeRPCS3XInputPreset(path string) error {
	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("lendo %s: %w", path, err)
	}
	if strings.TrimSpace(string(data)) != "" {
		return ErrControllerPresetExisting
	}
	if err := backupBeforeFirstWrite(path); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("criando a pasta de controles do RPCS3: %w", err)
	}
	if err := os.WriteFile(path, []byte(rpcs3XInputPreset), 0o644); err != nil {
		return fmt.Errorf("gravando %s: %w", path, err)
	}
	return nil
}

// ControllerPresetSeed devolve a seção "[Pad1]" do mapeamento padrão pronta
// para entrar no arquivo que `internal/install` semeia numa instalação nova
// (seedPCSX2, seedDuckStationPortable). Sai como texto, e não por
// ApplyControllerPreset, de propósito: o seed é o **primeiro** conteúdo do
// arquivo, e passar por backupBeforeFirstWrite guardaria como "original do
// usuário" um arquivo que o próprio ZeuX acabou de escrever — o "restaurar"
// voltaria para um PCSX2 sem controle nenhum.
func ControllerPresetSeed(adapterID string) (string, bool) {
	var preset []padPresetEntry
	switch adapterID {
	case "pcsx2":
		preset = pcsx2ControllerPreset
	case "duckstation":
		preset = duckStationControllerPreset
	default:
		return "", false
	}
	var b strings.Builder
	b.WriteString("[Pad1]\n")
	for _, e := range preset {
		for _, v := range e.values {
			fmt.Fprintf(&b, "%s = %s\n", e.action, v)
		}
	}
	return b.String(), true
}

// ApplyControllerPreset é a ação do botão "Aplicar mapeamento padrão" da tela
// Configurar controle (POST /emulators/{id}/controller-preset): resolve a
// instalação e grava. O Launcher é quem já sabe achar o emulador instalado
// (mesmo caminho de InstallFirmware).
func (l *Launcher) ApplyControllerPreset(ctx context.Context, adapterID string) error {
	adapter, ok := l.registry.ByID(adapterID)
	if !ok {
		return fmt.Errorf("o ZeuX não conhece o emulador %q", adapterID)
	}
	install, ok := adapter.Locate(ctx)
	if !ok {
		return fmt.Errorf("o %s não está instalado", adapter.Name())
	}
	if support, _ := ControllerSupportFor(adapterID, install); support != ControllerSupportPreset {
		return ErrControllerPresetUnavailable
	}
	if err := ApplyControllerPreset(adapterID, install); err != nil {
		return err
	}
	l.logger.Info("mapeamento padrão de controle gravado a pedido do usuário", "emulador", adapter.Name())
	return nil
}
