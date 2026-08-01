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
