package emulator

import (
	"context"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
)

// Registry reúne todos os adapters conhecidos.
//
// Os embutidos e os personalizados ficam separados porque a precedência entre
// eles é uma regra de produto: o que o usuário definiu à mão sempre vence o que
// vem de fábrica. Se a pessoa se deu ao trabalho de configurar um emulador, é
// porque o padrão não servia para ela — e o app não deveria insistir.
type Registry struct {
	mu      sync.RWMutex
	builtin []Adapter
	custom  []Adapter
}

// NewRegistry devolve o registro com os adapters embutidos.
func NewRegistry() *Registry {
	return &Registry{
		builtin: []Adapter{
			newRetroArch(),
			newDuckStation(),
			newPCSX2(),
			newDolphin(),
			newPPSSPP(),
			newFlycast(),
			newRPCS3(),
			newCemu(),
			newMelonDS(),
			newAzahar(),
			newXemu(),
			newVita3K(),
			newXenia(),
			newRMG(),
		},
	}
}

// SetCustom substitui os adapters personalizados. Chamado na inicialização e
// sempre que o usuário altera suas definições.
func (r *Registry) SetCustom(adapters []Adapter) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.custom = adapters
}

// Adapters lista todos os adapters registrados, personalizados primeiro.
func (r *Registry) Adapters() []Adapter {
	r.mu.RLock()
	defer r.mu.RUnlock()

	all := make([]Adapter, 0, len(r.custom)+len(r.builtin))
	all = append(all, r.custom...)
	return append(all, r.builtin...)
}

// ByID busca um adapter pelo identificador. Personalizados vêm primeiro, então
// um ID repetido resolve para a definição do usuário.
func (r *Registry) ByID(id string) (Adapter, bool) {
	for _, adapter := range r.Adapters() {
		if adapter.ID() == id {
			return adapter, true
		}
	}
	return nil, false
}

// ForConsole lista os adapters que atendem um console.
//
// A ordem importa: adapters standalone vêm antes do RetroArch, porque um
// emulador dedicado costuma ter compatibilidade e desempenho melhores no seu
// console do que o core equivalente. O RetroArch entra como alternativa, não
// como primeira escolha.
func (r *Registry) ForConsole(consoleID string) []Adapter {
	var matches []Adapter
	for _, adapter := range r.Adapters() {
		if supportsConsole(adapter, consoleID) {
			matches = append(matches, adapter)
		}
	}

	sort.SliceStable(matches, func(i, j int) bool {
		return matches[i].ID() != "retroarch" && matches[j].ID() == "retroarch"
	})

	return matches
}

// Status descreve a situação de instalação de um emulador.
type Status struct {
	AdapterID string   `json:"adapter_id"`
	Name      string   `json:"name"`
	Consoles  []string `json:"consoles"`
	Installed bool     `json:"installed"`
	Custom    bool     `json:"custom"`

	// Installation vem preenchida apenas quando Installed é verdadeiro.
	Installation *Installation `json:"installation,omitempty"`

	// BiosDir vem preenchida só quando alguém já verificou de verdade onde
	// este emulador lê o BIOS/firmware — ver BiosDir() em bios_dir.go.
	// Ausente (não "") na maioria dos adapters: a interface não deve mostrar
	// um botão de pasta que ninguém confirmou estar certo.
	BiosDir string `json:"bios_dir,omitempty"`

	// BiosDirEmpty só é significativo quando BiosDir está preenchida. Achado
	// em 2026-08-04: o botão "Jogar" continuava disponível mesmo com a pasta
	// de BIOS vazia, e diferente de hardware fraco (que pode rodar mal, mas
	// roda), sem BIOS o jogo nunca abre — a interface usa este campo para
	// confirmar antes de tentar, em vez de deixar o usuário descobrir só
	// depois de clicar.
	BiosDirEmpty bool `json:"bios_dir_empty,omitempty"`

	// Configurable/Bindable (H1/H3/H4, docs/roadmap.md) dizem se este
	// adapter satisfaz ConfigurableAdapter/KeyBindableAdapter — a interface
	// usa isso para mostrar ou esconder os botões de configurar/mapear sem
	// precisar tentar a rota e tratar erro (mesmo raciocínio de BiosDir:
	// declarar a capacidade real, não descobrir por tentativa).
	Configurable bool `json:"configurable"`
	Bindable     bool `json:"bindable"`
}

// Survey verifica quais emuladores estão instalados na máquina.
//
// Constrói o índice de diretórios uma vez e o carrega no contexto antes de
// perguntar a cada adapter — sem isso, cada um dos 13 releria os mesmos
// diretórios de sistema (ver dirIndex em discovery.go e D9 em
// docs/roadmap.md).
func (r *Registry) Survey(ctx context.Context) []Status {
	adapters := r.Adapters()
	statuses := make([]Status, 0, len(adapters))

	ctx = withDiscoveryIndex(ctx, buildDirIndex())

	for _, adapter := range adapters {
		consoles := append([]string{}, adapter.Consoles()...)
		sort.Strings(consoles)

		_, isCustom := adapter.(customAdapter)
		_, configurable := adapter.(ConfigurableAdapter)
		_, bindable := adapter.(KeyBindableAdapter)
		status := Status{
			AdapterID:    adapter.ID(),
			Name:         adapter.Name(),
			Consoles:     consoles,
			Custom:       isCustom,
			Configurable: configurable,
			Bindable:     bindable,
		}

		if install, ok := adapter.Locate(ctx); ok {
			status.Installed = true
			status.Installation = &install

			if dir, ok := BiosDir(adapter.ID(), install); ok {
				status.BiosDir = dir
				if entries, err := os.ReadDir(dir); err == nil {
					status.BiosDirEmpty = len(entries) == 0
				}
			}
		}

		statuses = append(statuses, status)
	}

	return statuses
}

// Resolve escolhe o adapter para uma requisição e confirma que ele está
// instalado. Quando preferredID vem vazio, usa o melhor adapter disponível
// para o console.
func (r *Registry) Resolve(ctx context.Context, consoleID, preferredID string) (Adapter, Installation, error) {
	if preferredID != "" {
		adapter, ok := r.ByID(preferredID)
		if !ok {
			return nil, Installation{}, fmt.Errorf("emulador %q não é conhecido pelo ZeuX", preferredID)
		}
		if consoleID != "" && !supportsConsole(adapter, consoleID) {
			return nil, Installation{}, ErrUnsupportedConsole{AdapterID: adapter.ID(), ConsoleID: consoleID}
		}

		install, ok := adapter.Locate(ctx)
		if !ok {
			return nil, Installation{}, fmt.Errorf("o emulador %s não foi encontrado nesta máquina", adapter.Name())
		}
		return adapter, install, nil
	}

	candidates := r.ForConsole(consoleID)
	if len(candidates) == 0 {
		return nil, Installation{}, fmt.Errorf("nenhum emulador conhecido atende o console %q", consoleID)
	}

	for _, adapter := range candidates {
		if install, ok := adapter.Locate(ctx); ok {
			return adapter, install, nil
		}
	}

	return nil, Installation{}, fmt.Errorf(
		"nenhum emulador para este console está instalado; o ZeuX conhece %s",
		joinNames(candidates))
}

func joinNames(adapters []Adapter) string {
	names := make([]string, 0, len(adapters))
	for _, adapter := range adapters {
		names = append(names, adapter.Name())
	}

	switch len(names) {
	case 1:
		return names[0]
	case 2:
		return names[0] + " e " + names[1]
	default:
		return fmt.Sprintf("%s e %s", joinComma(names[:len(names)-1]), names[len(names)-1])
	}
}

func joinComma(names []string) string {
	// strings.Builder em vez de "+=": concatenar string dentro de laço realoca e
	// copia o acumulado a cada volta, o que é O(n²) nos bytes. Aqui o n é sempre
	// pequeno, mas o padrão não deve aparecer no repositório nem em caso inócuo —
	// ele é copiado para onde o n não é pequeno.
	var b strings.Builder
	for i, name := range names {
		if i > 0 {
			b.WriteString(", ")
		}
		b.WriteString(name)
	}
	return b.String()
}
