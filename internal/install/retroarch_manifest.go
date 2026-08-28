package install

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

// Manifesto de cores do RetroArch para o download sob demanda decidido no
// ADR 0015 (docs/decisoes/0015-baixar-retroarch-e-cores-sob-demanda.md, R1).
//
// Diferente do catálogo de Source em sources.go — que resolve a release mais
// recente pela API do GitHub — o buildbot do libretro não tem API de release:
// cada core é um arquivo fixo por plataforma em
// "nightly/<plataforma>/latest/<arquivo>.zip". "latest" é um nome de caminho
// literal, não uma versão resolvida; o conteúdo por trás dele muda sem aviso
// (é o problema que o ADR 0012 registrou originalmente). Por isso o ZeuX não
// confia na URL sozinha: o SHA256 é medido uma vez, por alguém rodando
// cmd/generate-retroarch-manifest com acesso real ao buildbot, e fica fixado
// aqui até a próxima geração deliberada. Um core cujo conteúdo mudou no
// buildbot sem o manifesto ser regenerado passa a falhar o download por hash
// divergente (R2) — isso é o comportamento pretendido, não um bug: o ZeuX
// nunca deveria carregar um binário que ninguém revisou.
//
//go:embed data/retroarch_cores_manifest.json
var retroArchCoreManifestJSON []byte

// RetroArchCoreAsset é o que o ZeuX precisa para baixar e validar um core numa
// plataforma específica.
type RetroArchCoreAsset struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`

	// Size e SHA256 ficam zerados/vazios enquanto Generated for false — estado
	// honesto de "a URL é conhecida, mas ninguém mediu o arquivo ainda" (ex.:
	// gerado num ambiente sem acesso ao buildbot). R2 deve recusar instalar a
	// partir de uma entrada com Generated == false, não tratar SHA256 vazio
	// como "sem verificação".
	Size      int64  `json:"size"`
	SHA256    string `json:"sha256"`
	Generated bool   `json:"generated"`
}

// RetroArchCoreEntry é um core do catálogo (internal/emulator.KnownCores),
// com um asset por plataforma suportada.
type RetroArchCoreEntry struct {
	LibretroName string                        `json:"libretro_name"`
	Platforms    map[string]RetroArchCoreAsset `json:"platforms"`
}

// RetroArchCoreManifest é o documento inteiro embutido no binário.
type RetroArchCoreManifest struct {
	SchemaVersion int    `json:"schema_version"`
	GeneratedAt   string `json:"generated_at"`

	// HashSource documenta a proveniência do SHA256: o buildbot não publica
	// soma oficial por core (não verificado — o host está bloqueado neste
	// ambiente desde 2026-08-02, ver ADR 0015). Enquanto isso não mudar, o
	// SHA256 é medido pelo próprio ZeuX no momento da geração, não conferido
	// contra uma soma de terceiro.
	HashSource string `json:"hash_source"`

	Cores map[string]RetroArchCoreEntry `json:"cores"`
}

// RetroArchManifestPlatforms são as combinações goos/goarch que o manifesto
// cobre. O vocabulário do buildbot para cada uma está em buildBotPlatform,
// abaixo — ele chama linux/arm64 de "aarch64" e darwin de "osx".
func RetroArchManifestPlatforms() []string {
	return []string{"linux/amd64", "linux/arm64", "windows/amd64", "darwin/amd64", "darwin/arm64"}
}

// buildBotPlatform e buildBotExt traduzem goos/goarch para o vocabulário do
// buildbot (internal/emulator/retroarch.go já faz o mesmo tipo de tradução
// para runtime.GOOS ao decidir a extensão do core instalado). Os nomes vêm
// do que o buildbot publica de verdade, verificado em 2026-08-04.
func buildBotPlatform(goos, goarch string) (string, error) {
	switch goos {
	case "linux":
		switch goarch {
		case "amd64":
			return "linux/x86_64", nil
		case "arm64":
			return "linux/aarch64", nil
		}
	case "windows":
		if goarch == "amd64" {
			return "windows/x86_64", nil
		}
	case "darwin":
		switch goarch {
		case "amd64":
			return "osx/x86_64", nil
		case "arm64":
			return "osx/arm64", nil
		}
	}
	return "", fmt.Errorf("plataforma %s/%s não é coberta pelo manifesto de cores do RetroArch", goos, goarch)
}

func buildBotExt(goos string) (string, error) {
	switch goos {
	case "linux":
		return ".so", nil
	case "windows":
		return ".dll", nil
	case "darwin":
		return ".dylib", nil
	}
	return "", fmt.Errorf("SO %q sem extensão de core conhecida", goos)
}

// BuildBotCoreURL monta a URL e o nome de arquivo esperado para um core numa
// plataforma. Usado pelo gerador (cmd/generate-retroarch-manifest) e pelos
// testes de cobertura — nunca deveria ser recalculado por um terceiro
// caminho, ou os dois podem divergir sem ninguém notar.
func BuildBotCoreURL(goos, goarch, libretroName string) (rawURL string, filename string, err error) {
	platform, err := buildBotPlatform(goos, goarch)
	if err != nil {
		return "", "", err
	}
	ext, err := buildBotExt(goos)
	if err != nil {
		return "", "", err
	}
	filename = libretroName + ext
	// Formato real, confirmado pelo Douglas em 2026-08-04 numa máquina com
	// acesso ao host:
	//
	//	https://buildbot.libretro.com/nightly/linux/x86_64/latest/mesen_libretro.so.zip
	//
	// "nightly" e "latest" são segmentos literais do caminho, não valores a
	// resolver — "latest" fica no FIM, antes do arquivo. A estrutura que
	// parecia óbvia (".../latest/<plataforma>/cores/<arquivo>") devolvia 404
	// em todo core. Isto estava documentado em
	// scripts/download-retroarch-cores.mjs, apagado no R4 junto com o
	// empacotamento; ficou registrado aqui para não se perder com ele.
	rawURL = fmt.Sprintf("https://buildbot.libretro.com/nightly/%s/latest/%s.zip", platform, filename)
	return rawURL, filename + ".zip", nil
}

// LoadRetroArchCoreManifest lê o manifesto embutido.
func LoadRetroArchCoreManifest() (*RetroArchCoreManifest, error) {
	var manifest RetroArchCoreManifest
	if err := json.Unmarshal(retroArchCoreManifestJSON, &manifest); err != nil {
		return nil, fmt.Errorf("lendo manifesto de cores do RetroArch: %w", err)
	}
	return &manifest, nil
}
