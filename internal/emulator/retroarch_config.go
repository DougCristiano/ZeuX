package emulator

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// retroArchCfgFile é uma edição byte a byte de um retroarch.cfg — formato
// achatado (sem seção) de "chave = "valor"", uma por linha, confirmado
// contra o arquivo real desta máquina (~/.config/retroarch/retroarch.cfg,
// gerado por uma instalação de verdade). Mesma filosofia de iniFile
// (iniconfig.go): linha não tocada sai idêntica, comentário incluso —
// retroarch.cfg aceita comentários com "#".
type retroArchCfgFile struct {
	lines []retroArchCfgLine
}

type retroArchCfgLine struct {
	raw string
	key string // "" quando a linha não é "chave = valor" (comentário, em branco, etc.)
}

func parseRetroArchCfg(data []byte) *retroArchCfgFile {
	f := &retroArchCfgFile{}

	text := strings.ReplaceAll(string(data), "\r\n", "\n")
	text = strings.TrimSuffix(text, "\n")
	if text == "" {
		return f
	}

	for _, raw := range strings.Split(text, "\n") {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			f.lines = append(f.lines, retroArchCfgLine{raw: raw})
			continue
		}
		if idx := strings.Index(raw, "="); idx >= 0 {
			key := strings.TrimSpace(raw[:idx])
			if key != "" {
				f.lines = append(f.lines, retroArchCfgLine{raw: raw, key: key})
				continue
			}
		}
		f.lines = append(f.lines, retroArchCfgLine{raw: raw})
	}

	return f
}

// get devolve o valor **sem as aspas** de key (retroarch.cfg sempre grava
// valor entre aspas — `chave = "valor"`), e se a chave foi achada.
func (f *retroArchCfgFile) get(key string) (string, bool) {
	for _, line := range f.lines {
		if line.key == key {
			idx := strings.Index(line.raw, "=")
			return strings.Trim(strings.TrimSpace(line.raw[idx+1:]), `"`), true
		}
	}
	return "", false
}

// set sobrescreve (ou insere ao final do arquivo) key = "value", sempre
// com aspas — o formato que o RetroArch grava sozinho.
func (f *retroArchCfgFile) set(key, value string) {
	quoted := fmt.Sprintf("%s = %q", key, value)
	for i, line := range f.lines {
		if line.key == key {
			f.lines[i].raw = quoted
			return
		}
	}
	f.lines = append(f.lines, retroArchCfgLine{raw: quoted, key: key})
}

func (f *retroArchCfgFile) bytes() []byte {
	var buf bytes.Buffer
	for _, line := range f.lines {
		buf.WriteString(line.raw)
		buf.WriteByte('\n')
	}
	return buf.Bytes()
}

// retroArchRendererToDriver/retroArchDriverToRenderer traduzem entre o
// vocabulário de Renderer do ZeuX e o "video_driver" do retroarch.cfg.
// Só os dois mapeamentos confirmados contra o arquivo real desta máquina
// entram aqui (RendererOpenGL é o próprio driver ativo hoje,
// "gl" — RendererVulkan é o nome de driver documentado e estável do
// RetroArch, mesmo não sendo o ativo nesta máquina). D3D12 e Software
// ficam de fora de propósito: o id de driver exato não foi confirmado
// contra binário real, e um mapeamento errado quebraria o RetroArch em
// silêncio na próxima abertura — mesma disciplina do D1 para flags de
// linha de comando.
func retroArchRendererToDriver(r Renderer) (string, bool) {
	switch r {
	case RendererOpenGL:
		return "gl", true
	case RendererVulkan:
		return "vulkan", true
	default:
		return "", false
	}
}

func retroArchDriverToRenderer(driver string) (Renderer, bool) {
	switch driver {
	case "gl", "glcore":
		return RendererOpenGL, true
	case "vulkan":
		return RendererVulkan, true
	default:
		return "", false
	}
}

// retroArchConfigPath resolve o retroarch.cfg que o binário de fato lê.
//
// O RetroArch procura primeiro um retroarch.cfg ao lado do próprio
// executável (modo portátil) antes de cair no caminho padrão do sistema —
// comportamento documentado pelo próprio projeto. install.BinaryPath dá o
// primeiro; o segundo, confirmado contra o arquivo real desta máquina
// (Linux), é `~/.config/retroarch/retroarch.cfg`. Windows/macOS: caminho
// padrão **não verificado** contra binário real aqui — só a convenção que o
// próprio RetroArch documenta.
var retroArchConfigPath = func(install Installation) (string, error) {
	if install.BinaryPath != "" {
		portable := filepath.Join(filepath.Dir(install.BinaryPath), "retroarch.cfg")
		if _, err := os.Stat(portable); err == nil {
			return portable, nil
		}
	}

	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "retroarch", "retroarch.cfg"), nil
}

func retroArchReadConfig(path string) (PersistedOptions, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return PersistedOptions{}, nil
	}
	if err != nil {
		return PersistedOptions{}, fmt.Errorf("lendo %s: %w", path, err)
	}

	cfg := parseRetroArchCfg(data)
	var opts PersistedOptions

	if raw, ok := cfg.get("video_fullscreen"); ok {
		if v, err := strconv.ParseBool(raw); err == nil {
			opts.Fullscreen = &v
		}
	}
	if raw, ok := cfg.get("video_driver"); ok {
		if r, ok := retroArchDriverToRenderer(raw); ok {
			opts.Renderer = &r
		}
	}
	// InternalScale fica sempre ausente: video_scale no retroarch.cfg é a
	// escala da janela (modo não-tela-cheia), não a resolução interna do
	// core — os dois conceitos não são o mesmo campo, então mapear um pro
	// outro seria inventar um dado.

	return opts, nil
}

func retroArchWriteConfig(path string, opts Options) ([]string, error) {
	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("lendo %s: %w", path, err)
	}

	cfg := parseRetroArchCfg(data)
	var unapplied []string

	cfg.set("video_fullscreen", strconv.FormatBool(opts.Fullscreen))

	if opts.Renderer != RendererDefault {
		if driver, ok := retroArchRendererToDriver(opts.Renderer); ok {
			cfg.set("video_driver", driver)
		} else {
			unapplied = append(unapplied,
				"Este backend gráfico precisa ser escolhido dentro do próprio RetroArch — o mapeamento para video_driver não foi confirmado contra o binário real.")
		}
	}

	if opts.InternalScale > 1 {
		unapplied = append(unapplied,
			"A resolução interna é responsabilidade do core carregado, não do RetroArch — ajuste dentro do core (Quick Menu → Configurações de Vídeo).")
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("criando a pasta de configuração do RetroArch: %w", err)
	}
	if err := os.WriteFile(path, cfg.bytes(), 0o644); err != nil {
		return nil, fmt.Errorf("gravando %s: %w", path, err)
	}

	return unapplied, nil
}

// ReadConfig/WriteConfig/RestoreConfig satisfazem ConfigurableAdapter (H1)
// para retroArchAdapter — o segundo dos dois pilotos, com um formato de
// arquivo genuinamente diferente do INI seccionado do PCSX2 (sem seção,
// valores sempre entre aspas), provando que a abstração não é feita sob
// medida para um formato só.
func (retroArchAdapter) ReadConfig(install Installation) (PersistedOptions, error) {
	path, err := retroArchConfigPath(install)
	if err != nil {
		return PersistedOptions{}, err
	}
	return retroArchReadConfig(path)
}

func (retroArchAdapter) WriteConfig(install Installation, opts Options) ([]string, error) {
	path, err := retroArchConfigPath(install)
	if err != nil {
		return nil, err
	}
	if err := backupBeforeFirstWrite(path); err != nil {
		return nil, err
	}
	return retroArchWriteConfig(path, opts)
}

func (retroArchAdapter) RestoreConfig(install Installation) error {
	path, err := retroArchConfigPath(install)
	if err != nil {
		return err
	}
	return restoreFromBackup(path)
}

// retroArchPadActions são as 16 ações "input_player1_<ação>" confirmadas
// contra o retroarch.cfg real desta máquina (up/down/left/right, a/b/x/y,
// l/r/l2/r2/l3/r3, select/start — todas presentes no arquivo real, com
// tecla de teclado e slot de botão de controle).
var retroArchPadActions = []string{
	"up", "down", "left", "right",
	"a", "b", "x", "y",
	"select", "start",
	"l", "r", "l2", "r2", "l3", "r3",
}

func (retroArchAdapter) Actions() []string {
	return append([]string(nil), retroArchPadActions...)
}

// retroArchReadBindings lê tanto a tecla (`input_player1_<ação>`) quanto o
// botão de controle (`input_player1_<ação>_btn`) — os dois confirmados
// presentes no arquivo real. "nul" (o valor que o próprio RetroArch grava
// para "sem vínculo") vira ausência (nil), não a string literal "nul".
func (retroArchAdapter) ReadBindings(install Installation) ([]InputBinding, error) {
	path, err := retroArchConfigPath(install)
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

	cfg := parseRetroArchCfg(data)
	bindings := make([]InputBinding, 0, len(retroArchPadActions))
	for _, action := range retroArchPadActions {
		binding := InputBinding{Action: action}
		if raw, ok := cfg.get("input_player1_" + action); ok && raw != "nul" && raw != "" {
			key := raw
			binding.Key = &key
		}
		if raw, ok := cfg.get("input_player1_" + action + "_btn"); ok && raw != "nul" && raw != "" {
			btn := raw
			binding.Button = &btn
		}
		bindings = append(bindings, binding)
	}
	return bindings, nil
}

// retroArchWriteBindings grava `input_player1_<ação>` e/ou
// `input_player1_<ação>_btn`, preservando o resto do arquivo.
//
// **Ressalva registrada, não escondida:** a CHAVE `_btn` é confirmada
// (existe no arquivo real, aceita um índice numérico em string), mas a
// SEMÂNTICA do índice — qual número corresponde a qual botão físico num
// controle real — não foi verificada nesta sessão por falta de hardware.
// Escrever aqui é seguro (não quebra o arquivo), mas o valor gravado só
// deve ser confiado depois de testado com um controle de verdade — mesma
// exigência que H3 já registra ("verificação só o Douglas pode fechar").
func (retroArchAdapter) WriteBindings(install Installation, bindings []InputBinding) ([]string, error) {
	path, err := retroArchConfigPath(install)
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

	cfg := parseRetroArchCfg(data)
	var unapplied []string

	knownActions := make(map[string]bool, len(retroArchPadActions))
	for _, a := range retroArchPadActions {
		knownActions[a] = true
	}

	for _, b := range bindings {
		if !knownActions[b.Action] {
			unapplied = append(unapplied, fmt.Sprintf("O RetroArch não tem a ação %q.", b.Action))
			continue
		}
		if b.Key != nil {
			cfg.set("input_player1_"+b.Action, *b.Key)
		}
		if b.Button != nil {
			cfg.set("input_player1_"+b.Action+"_btn", *b.Button)
		}
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("criando a pasta de configuração do RetroArch: %w", err)
	}
	if err := os.WriteFile(path, cfg.bytes(), 0o644); err != nil {
		return nil, fmt.Errorf("gravando %s: %w", path, err)
	}

	return unapplied, nil
}
