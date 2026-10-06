package emulator

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
)

// Tecla de print por emulador (2026-10-06). O print é sempre do próprio
// emulador; o ZeuX só escolhe o atalho. Origem dos formatos, que importa
// para quem for mexer: levantamento do Douglas rodando os emuladores de
// verdade (DuckStation 0.1-12070, PCSX2 2.8.2, RetroArch com mGBA), exceto
// onde o comentário diz "código-fonte".
//
//   - DuckStation e PCSX2: [Hotkeys] Screenshot. Teclado "Keyboard/F10";
//     controle "SDL-0/Back & SDL-0/RightStick" (observado nos dois). Uma
//     ligação por atalho — a interface deles substitui a anterior; gravar
//     duas na mesma chave não foi testado, então o ZeuX grava teclado OU
//     controle.
//   - RetroArch: teclado e controle em chaves separadas, coexistem.
//     input_screenshot = "f8"; no controle, input_enable_hotkey_btn (o botão
//     que se segura) + input_screenshot_btn. Os números são índices do
//     driver xinput: Select+R3 gravou "7" e "9" (observado), o que bate com
//     a tabela de xinput_joypad.c (código-fonte). Com outro driver de
//     controle os números mudam — o ZeuX recusa em vez de chutar.
//
// Nunca entram: o botão Xbox/Guia (a Game Bar do Windows pega antes do
// emulador) e PrintScreen (do Windows). Por isso a lista de teclas é fechada
// (F1–F12) em vez de texto livre.

// ScreenshotHotkeyAdapters são os emuladores levantados. Flycast, RPCS3,
// Vita3K, xemu e os demais ficam de fora até terem levantamento próprio.
var screenshotHotkeyAdapters = map[string]bool{"duckstation": true, "pcsx2": true, "retroarch": true}

// SupportsScreenshotHotkey diz se o ZeuX sabe ajustar o print do emulador.
func SupportsScreenshotHotkey(adapterID string) bool { return screenshotHotkeyAdapters[adapterID] }

// ScreenshotKeys são as teclas oferecidas.
var ScreenshotKeys = []string{"F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"}

// ScreenshotButtons são os botões oferecidos, com nome neutro. Só botões que
// não são de ação de jogo nem do sistema: um combo com eles não aperta nada
// sem querer. A combinação é sempre de dois (segura o primeiro, aperta o
// segundo) — é o formato que o RetroArch exige e o que foi testado nos outros.
var ScreenshotButtons = []string{"back", "start", "l1", "r1", "l3", "r3"}

// sdlButtonNames: nomes SDL usados pelo DuckStation e pelo PCSX2 (os mesmos
// do preset de controle, controller_preset.go; Back e RightStick observados
// no atalho de print).
var sdlButtonNames = map[string]string{
	"back": "Back", "start": "Start", "l1": "LeftShoulder", "r1": "RightShoulder", "l3": "LeftStick", "r3": "RightStick",
}

// xinputButtonIndex: índices do driver xinput do RetroArch
// (xinput_joypad.c, código-fonte; 7 e 9 observados).
var xinputButtonIndex = map[string]string{
	"l1": "4", "r1": "5", "start": "6", "back": "7", "l3": "8", "r3": "9",
}

// ScreenshotHotkey é o atalho atual, no vocabulário neutro do ZeuX.
type ScreenshotHotkey struct {
	// Keyboard é a tecla ("F10") ou "" sem tecla.
	Keyboard string `json:"keyboard"`
	// Controller são os dois botões (segura, aperta), ou vazio.
	Controller []string `json:"controller"`
}

// ScreenshotHotkeyState é o que a tela mostra.
type ScreenshotHotkeyState struct {
	Current ScreenshotHotkey `json:"current"`
	// Unrecognized traz o valor cru quando o atalho gravado não cabe no que
	// o ZeuX oferece (ex.: outra tecla escolhida no próprio emulador). A tela
	// mostra como está; salvar troca.
	Unrecognized string `json:"unrecognized,omitempty"`
	// Coexist: teclado e controle podem ficar ligados juntos (só RetroArch).
	Coexist         bool   `json:"coexist"`
	DefaultKeyboard string `json:"default_keyboard"`
	// Folder é onde o emulador grava os prints (antes de o ZeuX movê-los para
	// a galeria do jogo, ao fim da sessão).
	Folder string `json:"folder,omitempty"`
	// FolderExists: o emulador só cria a pasta no primeiro print.
	FolderExists bool     `json:"folder_exists"`
	Warnings     []string `json:"warnings"`
	Keys         []string `json:"keys"`
	Buttons      []string `json:"buttons"`
}

// ErrScreenshotHotkey é a família de erros de validação: a mensagem já é a
// frase que a tela mostra.
type ErrScreenshotHotkey struct{ msg string }

func (e ErrScreenshotHotkey) Error() string { return e.msg }

func hotkeyErr(format string, args ...any) error {
	return ErrScreenshotHotkey{fmt.Sprintf(format, args...)}
}

// ErrScreenshotHotkeyUnavailable: não há arquivo que o ZeuX saiba editar.
var ErrScreenshotHotkeyUnavailable = errors.New("o ZeuX não sabe onde fica a configuração deste emulador")

func validKey(k string) bool {
	for _, v := range ScreenshotKeys {
		if v == k {
			return true
		}
	}
	return false
}

func validateHotkey(h ScreenshotHotkey, coexist bool) error {
	if h.Keyboard != "" && !validKey(h.Keyboard) {
		// PrintScreen e Win nunca chegam aqui pela tela; a recusa no servidor
		// cobre quem chama a API direto.
		return hotkeyErr("A tecla %q não pode ser usada: escolha uma entre F1 e F12. PrintScreen e as teclas do Windows são capturadas pelo sistema antes do emulador.", h.Keyboard)
	}
	if len(h.Controller) != 0 {
		if len(h.Controller) != 2 {
			return hotkeyErr("A combinação do controle precisa de dois botões: um para segurar e outro para apertar.")
		}
		if h.Controller[0] == h.Controller[1] {
			return hotkeyErr("Os dois botões da combinação precisam ser diferentes.")
		}
		for _, b := range h.Controller {
			if _, ok := sdlButtonNames[b]; !ok {
				return hotkeyErr("O botão %q não pode ser usado no atalho de print. O botão Xbox fica de fora: a Game Bar do Windows pega ele antes do emulador.", b)
			}
		}
	}
	if !coexist && h.Keyboard != "" && len(h.Controller) != 0 {
		return hotkeyErr("Este emulador aceita uma ligação só por atalho: escolha a tecla OU a combinação do controle.")
	}
	return nil
}

// --- DuckStation e PCSX2 ---

func sdlHotkeyPath(adapterID string, install Installation) (string, string, error) {
	switch adapterID {
	case "duckstation":
		path, ok := duckStationSettingsPath(install)
		if !ok {
			return "", "", ErrDuckStationNotManaged
		}
		return path, "F10", nil
	case "pcsx2":
		path, err := pcsx2ConfigPath()
		if err != nil {
			return "", "", ErrScreenshotHotkeyUnavailable
		}
		return path, "F8", nil
	}
	return "", "", ErrScreenshotHotkeyUnavailable
}

func sdlEncode(h ScreenshotHotkey) string {
	if h.Keyboard != "" {
		return "Keyboard/" + h.Keyboard
	}
	if len(h.Controller) == 2 {
		return "SDL-0/" + sdlButtonNames[h.Controller[0]] + " & SDL-0/" + sdlButtonNames[h.Controller[1]]
	}
	return ""
}

// sdlDecode interpreta o valor gravado; ok=false quando não cabe no
// vocabulário do ZeuX.
func sdlDecode(v string) (ScreenshotHotkey, bool) {
	v = strings.TrimSpace(v)
	if v == "" {
		return ScreenshotHotkey{}, true
	}
	if k, found := strings.CutPrefix(v, "Keyboard/"); found && validKey(k) {
		return ScreenshotHotkey{Keyboard: k}, true
	}
	parts := strings.Split(v, "&")
	if len(parts) != 2 {
		return ScreenshotHotkey{}, false
	}
	var btns []string
	for _, p := range parts {
		name, found := strings.CutPrefix(strings.TrimSpace(p), "SDL-0/")
		if !found {
			return ScreenshotHotkey{}, false
		}
		id := ""
		for k, n := range sdlButtonNames {
			if n == name {
				id = k
			}
		}
		if id == "" {
			return ScreenshotHotkey{}, false
		}
		btns = append(btns, id)
	}
	return ScreenshotHotkey{Controller: btns}, true
}

// normalizeBinding torna comparáveis "A & B" e "B & A".
func normalizeBinding(v string) string {
	parts := strings.Split(v, "&")
	for i := range parts {
		parts[i] = strings.ToLower(strings.TrimSpace(parts[i]))
	}
	sort.Strings(parts)
	return strings.Join(parts, "&")
}

// sdlConflict devolve o atalho do emulador que já usa `value`.
func sdlConflict(ini *iniFile, value string) string {
	if value == "" {
		return ""
	}
	want := normalizeBinding(value)
	for _, line := range ini.lines {
		if line.section != "Hotkeys" || line.key == "" || line.key == "Screenshot" {
			continue
		}
		for _, v := range ini.getAll("Hotkeys", line.key) {
			if normalizeBinding(v) == want {
				return line.key
			}
		}
	}
	return ""
}

// --- RetroArch ---

func retroArchKeyName(k string) string { return strings.ToLower(k) }

func retroArchUnset(v string) bool { v = strings.TrimSpace(v); return v == "" || v == "nul" }

// retroArchKeyConflict acha outro atalho de teclado com a mesma tecla.
// Chaves de controle (_btn, _axis, _mbtn) e a do próprio print ficam de fora.
func retroArchKeyConflict(cfg *retroArchCfgFile, key string) string {
	for _, line := range cfg.lines {
		k := line.key
		if !strings.HasPrefix(k, "input_") || k == "input_screenshot" ||
			strings.HasSuffix(k, "_btn") || strings.HasSuffix(k, "_axis") || strings.HasSuffix(k, "_mbtn") {
			continue
		}
		if v, _ := cfg.get(k); strings.EqualFold(v, key) {
			return k
		}
	}
	return ""
}

// retroArchButtonConflict acha outro atalho (hotkey) de controle no mesmo
// botão — com o botão de ativação seguro, os dois disparariam juntos. Os
// botões do jogador (input_player*) não contam: sem segurar o de ativação,
// eles seguem para o jogo.
func retroArchButtonConflict(cfg *retroArchCfgFile, idx string) string {
	for _, line := range cfg.lines {
		k := line.key
		if !strings.HasPrefix(k, "input_") || !strings.HasSuffix(k, "_btn") || strings.HasPrefix(k, "input_player") ||
			k == "input_screenshot_btn" || k == "input_enable_hotkey_btn" {
			continue
		}
		if v, _ := cfg.get(k); v == idx {
			return k
		}
	}
	return ""
}

// --- Leitura e escrita ---

// ReadScreenshotHotkey lê o atalho atual do emulador.
func ReadScreenshotHotkey(adapterID string, install Installation) (ScreenshotHotkeyState, error) {
	if !SupportsScreenshotHotkey(adapterID) {
		return ScreenshotHotkeyState{}, ErrScreenshotHotkeyUnavailable
	}
	st := ScreenshotHotkeyState{Warnings: []string{}, Keys: ScreenshotKeys, Buttons: ScreenshotButtons}
	if dirs, _ := screenshotSourceDirs(adapterID, install); len(dirs) > 0 {
		st.Folder = dirs[0]
		if info, err := os.Stat(st.Folder); err == nil && info.IsDir() {
			st.FolderExists = true
		}
	}

	if adapterID == "retroarch" {
		st.Coexist = true
		st.DefaultKeyboard = "F8"
		path, err := retroArchConfigPath(install)
		if err != nil {
			return st, ErrScreenshotHotkeyUnavailable
		}
		raw, err := os.ReadFile(path)
		if err != nil && !os.IsNotExist(err) {
			return st, fmt.Errorf("lendo %s: %w", path, err)
		}
		cfg := parseRetroArchCfg(raw)
		if v, has := cfg.get("input_screenshot"); !has {
			st.Current.Keyboard = "F8" // padrão de fábrica (observado)
		} else if !retroArchUnset(v) {
			if k := strings.ToUpper(v); validKey(k) {
				st.Current.Keyboard = k
			} else {
				st.Unrecognized = "input_screenshot = " + v
			}
		}
		shot, _ := cfg.get("input_screenshot_btn")
		enable, _ := cfg.get("input_enable_hotkey_btn")
		if !retroArchUnset(shot) {
			mod, btn := "", ""
			for id, idx := range xinputButtonIndex {
				if idx == enable {
					mod = id
				}
				if idx == shot {
					btn = id
				}
			}
			if mod != "" && btn != "" {
				st.Current.Controller = []string{mod, btn}
			} else if st.Unrecognized == "" {
				st.Unrecognized = fmt.Sprintf("input_enable_hotkey_btn = %s, input_screenshot_btn = %s", enable, shot)
			}
		}
		if v, _ := cfg.get("input_enable_hotkey"); !retroArchUnset(v) {
			st.Warnings = append(st.Warnings, fmt.Sprintf("O RetroArch está com a tecla de ativação de atalhos \"%s\": os atalhos de teclado, inclusive o de print, podem exigir segurá-la. O ZeuX não mexe nessa opção.", v))
		}
		if d, _ := cfg.get("input_joypad_driver"); d != "" && d != "xinput" {
			st.Warnings = append(st.Warnings, fmt.Sprintf("O driver de controle do RetroArch é \"%s\"; o ZeuX só conhece os números de botão do driver xinput, então a combinação do controle fica indisponível.", d))
		}
		return st, nil
	}

	path, def, err := sdlHotkeyPath(adapterID, install)
	if err != nil {
		return st, err
	}
	st.DefaultKeyboard = def
	raw, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return st, fmt.Errorf("lendo %s: %w", path, err)
	}
	v, has := parseINI(raw).get("Hotkeys", "Screenshot")
	if !has {
		// Sem a chave, vale o padrão de fábrica — o DuckStation ganha F10 pelo
		// próprio ZeuX antes de abrir (duckStationDefaults).
		st.Current.Keyboard = def
		return st, nil
	}
	if h, ok := sdlDecode(v); ok {
		st.Current = h
	} else {
		st.Unrecognized = v
	}
	return st, nil
}

// WriteScreenshotHotkey grava o atalho. Edita só as chaves do print, com
// backup antes da primeira escrita do ZeuX. Quem chama garante o emulador
// fechado — ele regrava a configuração ao sair.
func WriteScreenshotHotkey(adapterID string, install Installation, h ScreenshotHotkey) error {
	if !SupportsScreenshotHotkey(adapterID) {
		return ErrScreenshotHotkeyUnavailable
	}
	coexist := adapterID == "retroarch"
	if err := validateHotkey(h, coexist); err != nil {
		return err
	}

	if adapterID == "retroarch" {
		path, err := retroArchConfigPath(install)
		if err != nil {
			return ErrScreenshotHotkeyUnavailable
		}
		raw, err := os.ReadFile(path)
		if err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("lendo %s: %w", path, err)
		}
		cfg := parseRetroArchCfg(raw)
		key := "nul"
		if h.Keyboard != "" {
			key = retroArchKeyName(h.Keyboard)
			if c := retroArchKeyConflict(cfg, key); c != "" {
				return hotkeyErr("A tecla %s já é usada pelo atalho %q do RetroArch. Escolha outra.", h.Keyboard, c)
			}
		}
		cfg.set("input_screenshot", key)
		if len(h.Controller) == 2 {
			if d, _ := cfg.get("input_joypad_driver"); d != "xinput" {
				return hotkeyErr("A combinação do controle só pode ser gravada com o driver de controle xinput do RetroArch (o atual é %q): com outro driver os números dos botões mudam.", d)
			}
			mod, btn := xinputButtonIndex[h.Controller[0]], xinputButtonIndex[h.Controller[1]]
			if c := retroArchButtonConflict(cfg, btn); c != "" {
				return hotkeyErr("O botão escolhido para apertar já é usado pelo atalho %q do RetroArch. Escolha outro.", c)
			}
			cfg.set("input_enable_hotkey_btn", mod)
			cfg.set("input_screenshot_btn", btn)
		} else if v, has := cfg.get("input_screenshot_btn"); has && !retroArchUnset(v) {
			// O botão de ativação fica como está: outros atalhos de controle
			// podem depender dele.
			cfg.set("input_screenshot_btn", "nul")
		}
		// input_enable_hotkey (teclado) nunca é criada nem alterada: quando o
		// RetroArch a liga sozinho ("alt"), os atalhos de teclado passam a
		// exigir segurar a tecla (observado no levantamento).
		return writeIfChanged(path, raw, cfg.bytes())
	}

	path, _, err := sdlHotkeyPath(adapterID, install)
	if err != nil {
		return err
	}
	raw, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("lendo %s: %w", path, err)
	}
	ini := parseINI(raw)
	value := sdlEncode(h)
	if c := sdlConflict(ini, value); c != "" {
		return hotkeyErr("Esse atalho já é usado por %q neste emulador. Escolha outro.", c)
	}
	// Vazio, não remover a chave: sem ela o DuckStation ganharia F10 de novo
	// na próxima abertura (duckStationDefaults só preenche o que falta). Que
	// o emulador leia "Screenshot =" como "sem atalho" não foi testado.
	// set() cria a seção [Hotkeys] quando ela não existe — o caso do
	// DuckStation com o assistente pulado.
	ini.set("Hotkeys", "Screenshot", value)
	return writeIfChanged(path, raw, ini.bytes())
}

func writeIfChanged(path string, before, after []byte) error {
	if bytes.Equal(before, after) {
		return nil
	}
	if err := backupBeforeFirstWrite(path); err != nil {
		return err
	}
	return os.WriteFile(path, after, 0o644)
}
