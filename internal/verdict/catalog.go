// Package verdict cruza o hardware detectado com os requisitos de cada console
// e produz um parecer descritivo.
//
// A regra de comunicação do produto é deliberada: o parecer nunca julga o PC do
// usuário ("seu PC é fraco"), apenas descreve o que ele alcança ("esta CPU tem
// 4 núcleos a 2.4 GHz, o que atende ao patamar X deste console"). Quando algo
// impede um patamar melhor, o gargalo é nomeado explicitamente em vez de virar
// uma nota única e opaca.
package verdict

import (
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/doufl/zeux/internal/emulator"
)

//go:embed data/consoles.json
var catalogJSON []byte

// Level é o patamar de compatibilidade alcançado num console.
type Level string

const (
	LevelOtimo      Level = "otimo"
	LevelBom        Level = "bom"
	LevelLimitado   Level = "limitado"
	LevelImprovavel Level = "improvavel"
)

// Headline é a frase de vitrine do patamar, exibida junto ao badge do console.
func (l Level) Headline() string {
	switch l {
	case LevelOtimo:
		return "Ótima possibilidade de rodar a maioria dos jogos conhecidos deste console."
	case LevelBom:
		return "Boa possibilidade de rodar a maioria dos jogos conhecidos deste console."
	case LevelLimitado:
		return "Possibilidade limitada: os jogos mais leves deste console devem rodar, os mais pesados provavelmente não."
	default:
		return "Este hardware não alcança o mínimo necessário para rodar este console de forma jogável."
	}
}

// Requirements são os patamares mínimos de hardware. Campos zerados não são
// verificados — nem todo console impõe exigência de VRAM, por exemplo.
type Requirements struct {
	LogicalCores int     `json:"logical_cores"`
	ClockMHz     float64 `json:"clock_mhz"`
	RAMGiB       float64 `json:"ram_gib"`
	VRAMGiB      float64 `json:"vram_gib"`
	DedicatedGPU bool    `json:"dedicated_gpu"`
}

// Tier é um patamar de qualidade de emulação para um console, com o emulador e
// o preset de configuração correspondentes.
type Tier struct {
	Level Level `json:"level"`

	// Emulator é o nome de exibição; AdapterID é o identificador que o pacote
	// emulator entende. Os dois existem porque o nome mostrado ao usuário
	// inclui o core ("RetroArch (core Mesen)"), o que não serve como chave.
	Emulator  string `json:"emulator"`
	AdapterID string `json:"adapter_id"`
	Core      string `json:"core,omitempty"`

	// Preset é a descrição legível; Options é a mesma configuração em forma que
	// o emulador obedece. Um preset que só existisse como texto não
	// configuraria nada — e a autoconfiguração é a promessa central do produto.
	Preset  string           `json:"preset"`
	Options emulator.Options `json:"options"`

	Requires Requirements `json:"requires"`
}

// Console é a entrada do catálogo. Os tiers vêm ordenados do mais exigente para
// o menos exigente, e a avaliação para no primeiro que a máquina atende.
type Console struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ShortName string `json:"short_name"`
	Year      int    `json:"year"`

	// Extensions são as extensões de arquivo reconhecidas na varredura de
	// biblioteca (internal/library), em minúsculas e sem o ponto. Existe aqui,
	// e não hardcoded no scanner, para que o catálogo continue sendo a única
	// fonte de verdade sobre um console — mesmo raciocínio de Options.
	Extensions []string `json:"extensions"`

	Tiers []Tier `json:"tiers"`
}

// Catalog é o dicionário de requisitos por console.
type Catalog struct {
	SchemaVersion int       `json:"schema_version"`
	UpdatedAt     string    `json:"updated_at"`
	Consoles      []Console `json:"consoles"`
}

// LoadCatalog lê o dicionário embutido no binário. Embutir garante que o app
// funcione offline no primeiro uso; a atualização via nuvem prevista no PRD
// entra depois, substituindo este conteúdo em tempo de execução.
func LoadCatalog() (*Catalog, error) {
	var catalog Catalog
	if err := json.Unmarshal(catalogJSON, &catalog); err != nil {
		return nil, fmt.Errorf("lendo catálogo de consoles: %w", err)
	}

	if len(catalog.Consoles) == 0 {
		return nil, fmt.Errorf("catálogo de consoles está vazio")
	}

	return &catalog, nil
}
