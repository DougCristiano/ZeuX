// Package emulator orquestra emuladores externos pela linha de comando.
//
// O ZeuX não modifica emulador nenhum: ele localiza o binário já instalado,
// monta os argumentos corretos para o título e acompanha o processo enquanto
// roda. Cada emulador tem sua própria gramática de linha de comando, e é isso
// que o Adapter encapsula.
//
// A construção do comando é separada da execução de propósito. BuildCommand é
// uma função pura, testável sem nenhum emulador instalado; Launch é o que de
// fato toca o sistema. Sem essa divisão, a única forma de testar a tradução de
// opções em argumentos seria abrindo jogos de verdade.
package emulator

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// Renderer é o backend gráfico pedido ao emulador. Nem todo emulador suporta
// todos, e cada Adapter traduz ou ignora o que não se aplica a ele.
type Renderer string

const (
	RendererDefault  Renderer = ""
	RendererVulkan   Renderer = "vulkan"
	RendererOpenGL   Renderer = "opengl"
	RendererD3D12    Renderer = "d3d12"
	RendererSoftware Renderer = "software"
)

// Options é o preset de execução em forma legível por máquina.
//
// É a contraparte estruturada do texto de preset do catálogo: o texto existe
// para o usuário ler, estes campos existem para o emulador obedecer. Um preset
// que só existisse como prosa não configuraria nada.
type Options struct {
	// Fullscreen abre o jogo em tela cheia.
	Fullscreen bool `json:"fullscreen"`

	// InternalScale é o multiplicador de resolução interna. 0 ou 1 significam
	// resolução nativa do console.
	InternalScale int `json:"internal_scale,omitempty"`

	// Renderer é o backend gráfico desejado.
	Renderer Renderer `json:"renderer,omitempty"`

	// ExitOnClose faz o emulador encerrar junto com o jogo, em vez de voltar
	// para o menu dele. É o comportamento esperado por quem entrou pelo ZeuX:
	// o usuário escolheu um jogo, não um emulador.
	ExitOnClose bool `json:"exit_on_close"`

	// Extra são argumentos crus repassados ao final. Escape para configurações
	// que o ZeuX ainda não modela, sem obrigar o usuário a esperar por elas.
	Extra []string `json:"extra,omitempty"`
}

// Request descreve o que se quer executar.
type Request struct {
	// ROMPath é o caminho absoluto do arquivo de jogo na máquina do usuário.
	// O ZeuX nunca distribui nem transfere esse arquivo — ele só aponta o
	// emulador para o que já está no disco.
	ROMPath string

	// ConsoleID amarra a requisição ao catálogo, e diz ao RetroArch qual core
	// carregar.
	ConsoleID string

	// Core seleciona explicitamente o core do RetroArch. Vazio usa o padrão do
	// console. Ignorado por emuladores standalone.
	Core string

	Options Options
}

// Command é a linha de comando pronta, junto do que não coube nela.
//
// Unapplied existe porque os emuladores divergem muito no que aceitam por
// linha de comando: o Dolphin permite sobrescrever qualquer configuração, o
// PCSX2 aceita pouco mais que tela cheia. Inventar uma flag que não existe faz
// o emulador recusar a abrir, então preferimos não aplicar a opção e dizer
// isso — o usuário fica sabendo que aquele ajuste precisa ser feito dentro do
// próprio emulador, em vez de achar que o ZeuX aplicou e não funcionou.
type Command struct {
	Argv      []string `json:"argv"`
	Unapplied []string `json:"unapplied,omitempty"`
}

// Installation é um emulador encontrado no disco.
type Installation struct {
	AdapterID  string `json:"adapter_id"`
	Name       string `json:"name"`
	BinaryPath string `json:"binary_path"`

	// Version fica vazia quando não foi possível determinar. O sistema de
	// compatibilidade comunitário depende dela ("rodou bem na versão X"), então
	// vale registrar quando disponível — mas não vale bloquear o lançamento por
	// falta dela.
	Version string `json:"version,omitempty"`

	// Managed indica que o emulador foi instalado pelo próprio ZeuX, e não
	// encontrado numa instalação prévia do usuário. Só o que é gerenciado pode
	// ser atualizado ou removido pelo app.
	Managed bool `json:"managed"`
}

// PersistedOptions descreve o que um ConfigurableAdapter achou já gravado no
// arquivo de configuração do próprio emulador — nunca um palpite. Ponteiros
// nil de propósito: distinguem "não pôde ler" de "leu e o valor é
// false/0/default" (mesma disciplina do parecer parcial —
// docs/roadmap.md, princípio 4 do CLAUDE.md).
type PersistedOptions struct {
	Fullscreen    *bool     `json:"fullscreen,omitempty"`
	InternalScale *int      `json:"internal_scale,omitempty"`
	Renderer      *Renderer `json:"renderer,omitempty"`
}

// ConfigurableAdapter é a capacidade opcional (H1, docs/roadmap.md) de ler e
// escrever a configuração que o emulador persiste em disco — diferente de
// Options/BuildCommand, que só valem para uma execução via linha de comando.
// Nem todo Adapter implementa isto; verificar com asserção de tipo
// (`if c, ok := adapter.(ConfigurableAdapter); ok { ... }`), nunca presumir.
type ConfigurableAdapter interface {
	// ReadConfig lê o estado hoje gravado no arquivo do emulador para esta
	// Installation. Um campo ausente em PersistedOptions é "não pôde ler",
	// nunca um valor inventado.
	ReadConfig(install Installation) (PersistedOptions, error)

	// WriteConfig funde opts no arquivo do emulador, preservando byte a
	// byte tudo que o ZeuX não modela — config de emulador é do usuário, o
	// ZeuX é visita. Faz backup do arquivo original antes da primeira
	// escrita (ver RestoreConfig). Devolve, no mesmo espírito do Unapplied
	// de BuildCommand (ADR 0006), o que este adapter não sabe persistir.
	WriteConfig(install Installation, opts Options) (unapplied []string, err error)

	// RestoreConfig devolve o arquivo de configuração ao estado anterior à
	// primeira escrita do ZeuX feita por WriteConfig — reversão simétrica.
	// Erro quando nunca houve um backup para restaurar (WriteConfig nunca
	// rodou para esta Installation).
	RestoreConfig(install Installation) error
}

// InputBinding é o mapeamento de uma ação para uma tecla e/ou botão de
// controle, sempre na **vocabulário do próprio emulador** — nunca traduzido
// para um layout genérico do ZeuX. "Cross" no PCSX2 não é necessariamente o
// mesmo botão físico que "b" no RetroArch, e uma correspondência entre os
// dois não foi verificada contra hardware real (H3/H4, docs/roadmap.md);
// inventar essa tradução seria o mesmo erro que o parecer parcial proíbe
// para hardware.
type InputBinding struct {
	// Action é o nome da ação, no vocabulário deste adapter — ver
	// KeyBindableAdapter.Actions().
	Action string `json:"action"`

	// Key é a tecla de teclado vinculada, no formato que o próprio
	// emulador grava (ex.: "K" no PCSX2 — sem o prefixo "Keyboard/", que é
	// detalhe de arquivo, não de domínio — "x" no RetroArch). Ausente
	// (nunca uma string vazia) quando não foi lida/não está vinculada.
	Key *string `json:"key,omitempty"`

	// Button é o botão de controle vinculado, como o próprio emulador o
	// identifica (ex.: um índice numérico em string). Ausente quando não
	// lido/não vinculado.
	Button *string `json:"button,omitempty"`
}

// KeyBindableAdapter é a capacidade opcional (H3/H4, docs/roadmap.md) de
// ler e escrever o mapeamento de teclado/controle de um emulador. Mesmo
// princípio de ConfigurableAdapter: nem todo Adapter implementa: verificar
// com asserção de tipo, nunca presumir.
type KeyBindableAdapter interface {
	// Actions lista as ações que este adapter sabe mapear, na vocabulário
	// do próprio emulador (não um layout genérico do ZeuX — ver
	// InputBinding).
	Actions() []string

	// ReadBindings lê o mapeamento hoje gravado no arquivo do emulador.
	ReadBindings(install Installation) ([]InputBinding, error)

	// WriteBindings grava bindings, preservando o resto do arquivo — mesma
	// disciplina de ConfigurableAdapter.WriteConfig, inclusive backup antes
	// da primeira escrita (compartilha o mesmo arquivo e o mesmo mecanismo
	// de backupBeforeFirstWrite/restoreFromBackup do H1 quando o adapter
	// também é ConfigurableAdapter sobre o mesmo arquivo). Devolve o que
	// não pôde ser aplicado — ex.: um Button pedido para um adapter cujo
	// formato de botão de controle não foi confirmado contra hardware real.
	WriteBindings(install Installation, bindings []InputBinding) (unapplied []string, err error)
}

// Adapter traduz uma Request na linha de comando de um emulador específico.
type Adapter interface {
	// ID é o identificador estável usado em configuração e API.
	ID() string

	// Name é o nome de exibição.
	Name() string

	// Consoles lista os IDs de console do catálogo que este emulador atende.
	Consoles() []string

	// Locate procura o binário no sistema. Devolve ok=false quando o emulador
	// não está instalado, o que é uma resposta normal e não um erro.
	Locate(ctx context.Context) (Installation, bool)

	// BuildCommand monta o executável e os argumentos. Função pura: não toca no
	// sistema de arquivos nem executa nada.
	BuildCommand(install Installation, req Request) (Command, error)
}

// ErrUnsupportedConsole indica que o adapter não atende o console pedido.
type ErrUnsupportedConsole struct {
	AdapterID string
	ConsoleID string
}

func (e ErrUnsupportedConsole) Error() string {
	return fmt.Sprintf("o emulador %s não atende o console %q", e.AdapterID, e.ConsoleID)
}

// validateRequest aplica as checagens comuns a todos os adapters.
func validateRequest(adapter Adapter, req Request) error {
	if strings.TrimSpace(req.ROMPath) == "" {
		return fmt.Errorf("o caminho do jogo não pode estar vazio")
	}

	if req.ConsoleID != "" && !supportsConsole(adapter, req.ConsoleID) {
		return ErrUnsupportedConsole{AdapterID: adapter.ID(), ConsoleID: req.ConsoleID}
	}

	return nil
}

func supportsConsole(adapter Adapter, consoleID string) bool {
	for _, id := range adapter.Consoles() {
		if id == consoleID {
			return true
		}
	}
	return false
}

// command converte a linha de comando montada num *exec.Cmd pronto para rodar.
func command(ctx context.Context, argv []string) (*exec.Cmd, error) {
	if len(argv) == 0 {
		return nil, fmt.Errorf("linha de comando vazia")
	}
	return exec.CommandContext(ctx, argv[0], argv[1:]...), nil
}
