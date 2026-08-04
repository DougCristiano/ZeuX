// Package install baixa e instala emuladores a partir de suas fontes oficiais.
//
// Esta é a funcionalidade que baixa código executável da internet, então as
// regras aqui são deliberadamente rígidas:
//
//   - As fontes vêm de um catálogo embutido no binário. Nenhuma URL chega de
//     fora — nem do usuário, nem da futura API de nuvem, nem de sugestões da
//     comunidade. Se um dia a comunidade puder propor emuladores, ela propõe o
//     nome do projeto, e a URL continua saindo daqui.
//   - Só HTTPS, e só para hosts conhecidos de distribuição.
//   - A extração recusa caminhos que escapem do diretório de destino.
//   - Nada é instalado no lugar definitivo antes de a extração inteira dar
//     certo.
package install

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"runtime"
)

//go:embed data/sources.json
var sourcesJSON []byte

// Kind distingue as fontes que sabemos automatizar das que não.
type Kind string

const (
	// KindGitHub resolve a release mais recente pela API do GitHub.
	KindGitHub Kind = "github"

	// KindManual é o emulador cujo download não pode ser automatizado de forma
	// confiável. O ZeuX manda o usuário para a página oficial em vez de tentar
	// adivinhar uma URL que pode mudar sem aviso.
	KindManual Kind = "manual"

	// KindBundled é o emulador que já vem dentro do próprio instalador do
	// ZeuX (RetroArch, ver docs/decisoes/0012-empacotar-retroarch-e-cores.md)
	// — nunca precisa de download nem de um botão "instalar": Locate() já o
	// encontra assim que o daemon copia a cópia empacotada para o diretório
	// gerenciado (internal/emulator/bundled_retroarch.go).
	KindBundled Kind = "bundled"
)

// Archive é o formato do pacote baixado.
type Archive string

const (
	ArchiveZip      Archive = "zip"
	Archive7z       Archive = "7z"
	ArchiveTarGz    Archive = "tar.gz"
	ArchiveAppImage Archive = "appimage"
)

// AssetPattern descreve como achar o pacote certo dentro de uma release.
//
// Exclude não é detalhe: as releases publicam builds de depuração, pacotes de
// símbolos e instaladores com nomes muito parecidos com o do binário que
// queremos. Sem excluir explicitamente, é fácil baixar 900 MB de símbolos de
// depuração achando que é o emulador.
type AssetPattern struct {
	Include string  `json:"include"`
	Exclude string  `json:"exclude,omitempty"`
	Archive Archive `json:"archive"`

	// ChecksumSuffix aponta um asset irmão com a soma de verificação, quando o
	// projeto publica um.
	ChecksumSuffix string `json:"checksum_suffix,omitempty"`
}

// Source é a fonte oficial de um emulador.
type Source struct {
	AdapterID string `json:"adapter_id"`
	Name      string `json:"name"`
	Kind      Kind   `json:"kind"`
	Repo      string `json:"repo,omitempty"`
	Homepage  string `json:"homepage"`
	License   string `json:"license,omitempty"`

	// Reason explica, para fontes manuais, por que a automação não é possível.
	Reason string `json:"reason,omitempty"`

	// Assets é indexado por "goos/goarch".
	Assets map[string]AssetPattern `json:"assets,omitempty"`
}

// PatternForHost devolve o padrão de asset para a plataforma atual.
func (s Source) PatternForHost() (AssetPattern, bool) {
	pattern, ok := s.Assets[runtime.GOOS+"/"+runtime.GOARCH]
	return pattern, ok
}

// Catalog é o conjunto de fontes conhecidas.
type Catalog struct {
	SchemaVersion int      `json:"schema_version"`
	UpdatedAt     string   `json:"updated_at"`
	Sources       []Source `json:"sources"`
}

// LoadCatalog lê o catálogo embutido.
func LoadCatalog() (*Catalog, error) {
	var catalog Catalog
	if err := json.Unmarshal(sourcesJSON, &catalog); err != nil {
		return nil, fmt.Errorf("lendo catálogo de fontes: %w", err)
	}

	// Padrões inválidos precisam falhar na inicialização, e não na hora em que
	// o usuário clica em instalar.
	for _, source := range catalog.Sources {
		for platform, pattern := range source.Assets {
			if _, err := regexp.Compile(pattern.Include); err != nil {
				return nil, fmt.Errorf("%s/%s: padrão include inválido: %w", source.AdapterID, platform, err)
			}
			if pattern.Exclude != "" {
				if _, err := regexp.Compile(pattern.Exclude); err != nil {
					return nil, fmt.Errorf("%s/%s: padrão exclude inválido: %w", source.AdapterID, platform, err)
				}
			}
		}
	}

	return &catalog, nil
}

// ByAdapter busca a fonte de um emulador.
func (c *Catalog) ByAdapter(adapterID string) (Source, bool) {
	for _, source := range c.Sources {
		if source.AdapterID == adapterID {
			return source, true
		}
	}
	return Source{}, false
}

// matchAsset escolhe o asset que casa com o padrão.
//
// Não menciona a plataforma nas mensagens de erro de propósito: quem chama sabe
// qual plataforma está resolvendo, e uma versão anterior desta função usava
// runtime.GOOS — o que fazia a verificação dos padrões de Linux reportar
// "esperado para windows/amd64".
func matchAsset(names []string, pattern AssetPattern) (string, error) {
	include, err := regexp.Compile(pattern.Include)
	if err != nil {
		return "", err
	}

	var exclude *regexp.Regexp
	if pattern.Exclude != "" {
		if exclude, err = regexp.Compile(pattern.Exclude); err != nil {
			return "", err
		}
	}

	var matches []string
	for _, name := range names {
		if !include.MatchString(name) {
			continue
		}
		if exclude != nil && exclude.MatchString(name) {
			continue
		}
		matches = append(matches, name)
	}

	switch len(matches) {
	case 0:
		return "", fmt.Errorf("nenhum pacote desta release corresponde ao padrão %q", pattern.Include)
	case 1:
		return matches[0], nil
	default:
		// Ambiguidade é erro, não caso de desempate: baixar o arquivo errado
		// aqui significa instalar um build de depuração ou uma variante que o
		// adapter não sabe executar.
		return "", fmt.Errorf("mais de um pacote corresponde ao padrão (%v); o padrão precisa ser mais específico", matches)
	}
}
