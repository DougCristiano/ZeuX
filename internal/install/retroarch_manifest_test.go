package install

import (
	"strings"
	"testing"

	"github.com/doufl/zeux/internal/emulator"
)

// Trava a cobertura do manifesto contra a lista real de cores que o adapter
// do RetroArch conhece (ADR 0015, R1): nenhum core que algum tier do
// catálogo pode recomendar via RetroArch deveria ficar de fora do download
// sob demanda. Mesmo espírito de verdict/catalog_integration_test.go — um
// contrato entre dois pacotes que só um teste automatizado consegue travar,
// porque nada no compilador força as duas listas a andarem juntas.
func TestRetroArchManifestCoversAllKnownCores(t *testing.T) {
	manifest, err := LoadRetroArchCoreManifest()
	if err != nil {
		t.Fatalf("carregando manifesto: %v", err)
	}

	known := emulator.KnownCores()
	if len(known) == 0 {
		t.Fatal("emulator.KnownCores() devolveu vazio — o teste não travaria nada")
	}

	for name, libretroName := range known {
		entry, ok := manifest.Cores[name]
		if !ok {
			t.Errorf("core %q (conhecido pelo adapter) não está no manifesto", name)
			continue
		}
		if entry.LibretroName != libretroName {
			t.Errorf("core %q: manifesto diz libretro_name %q, adapter diz %q", name, entry.LibretroName, libretroName)
		}
	}

	for name := range manifest.Cores {
		if _, ok := known[name]; !ok {
			t.Errorf("manifesto lista o core %q, que o adapter não conhece — entrada órfã", name)
		}
	}
}

// Cada core precisa de um asset por plataforma do manifesto, com URL apontando
// para o host permitido (checkHost, ADR 0015) e nome de arquivo coerente.
// Não exige Generated == true nem SHA256 preenchido — isso depende de rodar
// cmd/generate-retroarch-manifest com acesso real ao buildbot, que este
// ambiente não tem (ver comentário do pacote em retroarch_manifest.go).
func TestRetroArchManifestEntriesAreWellFormed(t *testing.T) {
	manifest, err := LoadRetroArchCoreManifest()
	if err != nil {
		t.Fatalf("carregando manifesto: %v", err)
	}

	platforms := RetroArchManifestPlatforms()

	for name, entry := range manifest.Cores {
		for _, platform := range platforms {
			asset, ok := entry.Platforms[platform]
			if !ok {
				t.Errorf("core %q não tem asset para a plataforma %q", name, platform)
				continue
			}
			if err := checkHost(asset.URL); err != nil {
				t.Errorf("core %q/%s: URL recusada pela lista de hosts permitidos: %v", name, platform, err)
			}
			if !strings.HasSuffix(asset.URL, ".zip") {
				t.Errorf("core %q/%s: URL não termina em .zip: %s", name, platform, asset.URL)
			}
			if asset.Generated && asset.SHA256 == "" {
				t.Errorf("core %q/%s: marcado generated=true mas sem SHA256", name, platform)
			}
			if !asset.Generated && (asset.SHA256 != "" || asset.Size != 0) {
				t.Errorf("core %q/%s: generated=false mas tem SHA256/tamanho — estado inconsistente", name, platform)
			}
		}
	}
}

// BuildBotCoreURL é a única função que deveria montar essa URL — trava o
// formato para que uma mudança futura na estrutura do buildbot (já aconteceu
// uma vez, ver o comentário de BuildBotCoreURL) precise editar aqui e
// só aqui, tanto para o gerador quanto para o manifesto embutido.
func TestBuildBotCoreURLMatchesKnownFormat(t *testing.T) {
	url, filename, err := BuildBotCoreURL("linux", "amd64", "mesen_libretro")
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	wantURL := "https://buildbot.libretro.com/nightly/linux/x86_64/latest/mesen_libretro.so.zip"
	if url != wantURL {
		t.Errorf("URL = %q, esperava %q", url, wantURL)
	}
	if filename != "mesen_libretro.so.zip" {
		t.Errorf("filename = %q, esperava %q", filename, "mesen_libretro.so.zip")
	}

	if _, _, err := BuildBotCoreURL("plan9", "amd64", "mesen_libretro"); err == nil {
		t.Error("esperava erro para plataforma não coberta")
	}
}
