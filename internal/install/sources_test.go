package install

import (
	"strings"
	"testing"

	"github.com/doufl/zeux/internal/emulator"
)

func TestLoadCatalog(t *testing.T) {
	catalog, err := LoadCatalog()
	if err != nil {
		t.Fatalf("carregando catálogo: %v", err)
	}
	if len(catalog.Sources) == 0 {
		t.Fatal("catálogo vazio")
	}

	for _, source := range catalog.Sources {
		if source.Homepage == "" {
			t.Errorf("%s: sem página oficial — o usuário precisa poder conferir a origem", source.AdapterID)
		}

		switch source.Kind {
		case KindGitHub:
			if source.Repo == "" {
				t.Errorf("%s: fonte do GitHub sem repositório", source.AdapterID)
			}
			if len(source.Assets) == 0 {
				t.Errorf("%s: fonte do GitHub sem nenhum padrão de pacote", source.AdapterID)
			}
		case KindManual:
			if source.Reason == "" {
				t.Errorf("%s: fonte manual precisa explicar por que não é automatizável", source.AdapterID)
			}
		default:
			t.Errorf("%s: tipo de fonte desconhecido %q", source.AdapterID, source.Kind)
		}
	}
}

// Cada fonte precisa apontar para um adapter que existe, senão o botão de
// instalar aparece para um emulador que o ZeuX não sabe executar.
func TestEverySourcePointsToKnownAdapter(t *testing.T) {
	catalog, err := LoadCatalog()
	if err != nil {
		t.Fatalf("carregando catálogo: %v", err)
	}

	registry := emulator.NewRegistry()
	for _, source := range catalog.Sources {
		if _, ok := registry.ByID(source.AdapterID); !ok {
			t.Errorf("fonte %q não corresponde a nenhum adapter", source.AdapterID)
		}
	}
}

// Todo adapter embutido precisa de fonte — nem que seja manual. Sem isso, o
// usuário fica sem resposta sobre onde conseguir aquele emulador.
func TestEveryBuiltinAdapterHasASource(t *testing.T) {
	catalog, err := LoadCatalog()
	if err != nil {
		t.Fatalf("carregando catálogo: %v", err)
	}

	for _, adapter := range emulator.NewRegistry().Adapters() {
		if _, ok := catalog.ByAdapter(adapter.ID()); !ok {
			t.Errorf("o adapter %q não tem fonte de download declarada", adapter.ID())
		}
	}
}

// matchAsset é o que decide qual arquivo é baixado. Os casos abaixo usam nomes
// reais das releases — inclusive as armadilhas que convivem com o binário certo.
func TestMatchAssetAvoidsDebugAndSymbolPackages(t *testing.T) {
	cases := []struct {
		name    string
		assets  []string
		pattern AssetPattern
		want    string
	}{
		{
			name: "duckstation ignora instalador e símbolos",
			assets: []string{
				"duckstation-windows-x64-installer.exe",
				"duckstation-windows-x64-release-symbols.7z",
				"duckstation-windows-x64-release.zip",
				"duckstation-windows-arm64-release.zip",
			},
			pattern: AssetPattern{Include: `^duckstation-windows-x64-release\.zip$`},
			want:    "duckstation-windows-x64-release.zip",
		},
		{
			name: "pcsx2 ignora o pacote de símbolos",
			assets: []string{
				"pcsx2-v2.6.3-windows-x64-Qt-symbols.7z",
				"pcsx2-v2.6.3-windows-x64-Qt.7z",
				"PCSX2-v2.6.3-windows-x64-installer.exe",
			},
			pattern: AssetPattern{Include: `windows-x64-Qt\.7z$`, Exclude: "symbols|installer"},
			want:    "pcsx2-v2.6.3-windows-x64-Qt.7z",
		},
		{
			name: "xemu ignora builds de depuração",
			assets: []string{
				"xemu-0.8.136-dbg-windows-x86_64-pdb.zip",
				"xemu-0.8.136-dbg-windows-x86_64.zip",
				"xemu-0.8.136-windows-x86_64.zip",
			},
			pattern: AssetPattern{Include: `windows-x86_64\.zip$`, Exclude: "dbg|pdb"},
			want:    "xemu-0.8.136-windows-x86_64.zip",
		},
		{
			name: "azahar ignora instalador e variante libretro",
			assets: []string{
				"azahar-libretro-windows-x86_64-2125.1.3.zip",
				"azahar-windows-msvc-2125.1.3-installer.exe",
				"azahar-windows-msvc-2125.1.3.zip",
				"azahar-windows-msys2-2125.1.3.zip",
			},
			pattern: AssetPattern{Include: `windows-msvc-[0-9.]+\.zip$`, Exclude: "installer|libretro|debug"},
			want:    "azahar-windows-msvc-2125.1.3.zip",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := matchAsset(tc.assets, tc.pattern)
			if err != nil {
				t.Fatalf("nenhum pacote escolhido: %v", err)
			}
			if got != tc.want {
				t.Errorf("escolheu %q, esperado %q", got, tc.want)
			}
		})
	}
}

// Ambiguidade precisa ser erro. Desempatar sozinho poderia instalar um build de
// depuração no lugar do binário de verdade, e o usuário não teria como saber.
func TestMatchAssetRefusesAmbiguity(t *testing.T) {
	_, err := matchAsset(
		[]string{"emu-windows-x64.zip", "emu-windows-x64-beta.zip"},
		AssetPattern{Include: `windows-x64.*\.zip$`},
	)
	if err == nil {
		t.Fatal("dois candidatos deveriam gerar erro em vez de escolha automática")
	}
	if !strings.Contains(err.Error(), "mais de um") {
		t.Errorf("a mensagem deveria explicar a ambiguidade: %v", err)
	}
}

func TestMatchAssetReportsWhenNothingFits(t *testing.T) {
	_, err := matchAsset([]string{"emu-linux.tar.gz"}, AssetPattern{Include: `windows.*\.zip$`})
	if err == nil {
		t.Error("esperava erro quando nenhum pacote serve para o sistema")
	}
}

// A lista de hosts é a defesa contra um download redirecionado para outro
// lugar. Ela precisa recusar tudo que não seja HTTPS de origem conhecida.
func TestCheckHostRejectsUntrustedOrigins(t *testing.T) {
	rejected := []string{
		"http://github.com/x/y.zip",
		"https://exemplo-malicioso.com/emu.zip",
		"https://github.com.atacante.net/x.zip",
		"ftp://github.com/x.zip",
		"file:///etc/passwd",
	}

	for _, rawURL := range rejected {
		if err := checkHost(rawURL); err == nil {
			t.Errorf("a URL %q deveria ter sido recusada", rawURL)
		}
	}

	accepted := []string{
		"https://api.github.com/repos/x/y/releases/latest",
		"https://github.com/x/y/releases/download/v1/emu.zip",
		"https://objects.githubusercontent.com/algo",
	}

	for _, rawURL := range accepted {
		if err := checkHost(rawURL); err != nil {
			t.Errorf("a URL %q deveria ser aceita: %v", rawURL, err)
		}
	}
}

func TestJobPercent(t *testing.T) {
	if got := (Job{Downloaded: 50, Total: 200}).Percent(); got != 25 {
		t.Errorf("percentual = %d, esperado 25", got)
	}
	if got := (Job{Downloaded: 50, Total: 0}).Percent(); got != -1 {
		t.Errorf("sem tamanho total o percentual deveria ser -1, veio %d", got)
	}
}

// Emulador sem automação precisa devolver a página oficial em vez de tentar
// adivinhar uma URL.
func TestManualSourceRefusesWithLink(t *testing.T) {
	catalog, err := LoadCatalog()
	if err != nil {
		t.Fatalf("carregando catálogo: %v", err)
	}

	manager := NewManager(catalog, discardLogger())

	if _, err := manager.Start("retroarch"); err == nil {
		t.Fatal("fonte manual não deveria iniciar instalação automática")
	} else if !strings.Contains(err.Error(), "retroarch.com") {
		t.Errorf("o erro deveria apontar a página oficial: %v", err)
	}
}

func TestStartRefusesUnknownAdapter(t *testing.T) {
	catalog, _ := LoadCatalog()
	manager := NewManager(catalog, discardLogger())

	if _, err := manager.Start("emulador-que-nao-existe"); err == nil {
		t.Error("esperava recusa para adapter desconhecido")
	}
}
