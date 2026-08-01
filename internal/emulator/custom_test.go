package emulator

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func sampleDefinition() CustomDefinition {
	return CustomDefinition{
		ID:         "meu-emulador",
		Name:       "Meu Emulador",
		Consoles:   []string{"ps1"},
		BinaryPath: "/opt/meu-emu/run",
		Args:       []string{"--fullscreen", "--scale", PlaceholderScale, PlaceholderROM},
	}
}

func TestCustomAdapterBuildsCommandFromTemplate(t *testing.T) {
	adapter, err := NewCustomAdapter(sampleDefinition())
	if err != nil {
		t.Fatalf("criando adapter: %v", err)
	}

	cmd, err := adapter.BuildCommand(
		install("meu-emulador", "/opt/meu-emu/run"),
		Request{ROMPath: "/roms/jogo.chd", ConsoleID: "ps1", Options: Options{InternalScale: 5}},
	)
	if err != nil {
		t.Fatalf("BuildCommand falhou: %v", err)
	}

	want := "/opt/meu-emu/run --fullscreen --scale 5 /roms/jogo.chd"
	if got := argvString(cmd); got != want {
		t.Errorf("comando = %q, esperado %q", got, want)
	}
}

// O usuário precisa poder atender consoles que o ZeuX nem conhece — é o ponto
// da válvula de escape. Exigir que o console exista no catálogo seria uma trava.
func TestCustomAdapterAcceptsConsoleOutsideCatalog(t *testing.T) {
	def := sampleDefinition()
	def.Consoles = []string{"meu-console-exotico"}

	adapter, err := NewCustomAdapter(def)
	if err != nil {
		t.Fatalf("criando adapter: %v", err)
	}

	if _, err := adapter.BuildCommand(
		install(def.ID, def.BinaryPath),
		Request{ROMPath: "/roms/jogo.bin", ConsoleID: "meu-console-exotico"},
	); err != nil {
		t.Errorf("console fora do catálogo deveria ser aceito: %v", err)
	}
}

// A validação existe só para pegar definições impossíveis de executar.
func TestCustomValidationOnlyBlocksTheImpossible(t *testing.T) {
	cases := []struct {
		name    string
		mutate  func(*CustomDefinition)
		wantErr bool
	}{
		{"completa", func(*CustomDefinition) {}, false},
		{"sem id", func(d *CustomDefinition) { d.ID = "" }, true},
		{"sem nome", func(d *CustomDefinition) { d.Name = "" }, true},
		{"sem binário", func(d *CustomDefinition) { d.BinaryPath = "" }, true},
		{"sem console", func(d *CustomDefinition) { d.Consoles = nil }, true},
		{"sem placeholder de rom", func(d *CustomDefinition) { d.Args = []string{"--fullscreen"} }, true},

		// Estes precisam passar: são escolhas do usuário, não erros.
		{"sem argumentos além da rom", func(d *CustomDefinition) { d.Args = []string{PlaceholderROM} }, false},
		{"console desconhecido", func(d *CustomDefinition) { d.Consoles = []string{"qualquer-coisa"} }, false},
		{"binário com caminho estranho", func(d *CustomDefinition) { d.BinaryPath = "C:\\Meus Emus\\x (beta).exe" }, false},
		{"muitos argumentos", func(d *CustomDefinition) {
			d.Args = []string{"-a", "-b", "-c", "--opcao=valor", PlaceholderROM, "--depois"}
		}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			def := sampleDefinition()
			tc.mutate(&def)

			err := def.Validate()
			if tc.wantErr && err == nil {
				t.Error("esperava erro de validação")
			}
			if !tc.wantErr && err != nil {
				t.Errorf("não deveria haver trava aqui: %v", err)
			}
		})
	}
}

// Quem define o próprio emulador manda: o embutido de mesmo ID sai de cena.
func TestCustomOverridesBuiltin(t *testing.T) {
	registry := NewRegistry()

	original, ok := registry.ByID("duckstation")
	if !ok {
		t.Fatal("duckstation embutido deveria existir")
	}
	if original.Name() != "DuckStation" {
		t.Fatalf("nome inesperado do embutido: %s", original.Name())
	}

	def := sampleDefinition()
	def.ID = "duckstation"
	def.Name = "DuckStation (meu build)"

	adapter, err := NewCustomAdapter(def)
	if err != nil {
		t.Fatalf("criando adapter: %v", err)
	}
	registry.SetCustom([]Adapter{adapter})

	override, _ := registry.ByID("duckstation")
	if override.Name() != "DuckStation (meu build)" {
		t.Errorf("nome = %q, esperava a definição do usuário vencer", override.Name())
	}
}

func TestCustomComesFirstForConsole(t *testing.T) {
	registry := NewRegistry()

	adapter, err := NewCustomAdapter(sampleDefinition())
	if err != nil {
		t.Fatalf("criando adapter: %v", err)
	}
	registry.SetCustom([]Adapter{adapter})

	candidates := registry.ForConsole("ps1")
	if len(candidates) == 0 {
		t.Fatal("esperava candidatos para ps1")
	}
	if candidates[0].ID() != "meu-emulador" {
		t.Errorf("primeiro candidato = %q, esperava o personalizado", candidates[0].ID())
	}
}

// Uma definição quebrada não pode derrubar as outras.
func TestBuildAdaptersIsolatesBadDefinitions(t *testing.T) {
	good := sampleDefinition()

	bad := sampleDefinition()
	bad.ID = "quebrado"
	bad.Args = []string{"--sem-placeholder"}

	adapters, problems := BuildAdapters([]CustomDefinition{good, bad})

	if len(adapters) != 1 {
		t.Errorf("adapters válidos = %d, esperado 1", len(adapters))
	}
	if len(problems) != 1 {
		t.Fatalf("problemas relatados = %d, esperado 1", len(problems))
	}
	if !strings.Contains(problems[0], "quebrado") {
		t.Errorf("o problema deveria nomear a definição: %q", problems[0])
	}
}

func TestCustomStoreRoundTrip(t *testing.T) {
	store := &CustomStore{path: filepath.Join(t.TempDir(), "custom.json")}

	// Arquivo ausente é lista vazia, não erro.
	definitions, err := store.Load()
	if err != nil {
		t.Fatalf("carregando arquivo ausente: %v", err)
	}
	if len(definitions) != 0 {
		t.Errorf("esperava lista vazia, veio %d", len(definitions))
	}

	if _, err := store.Upsert(sampleDefinition()); err != nil {
		t.Fatalf("inserindo: %v", err)
	}

	// Upsert com o mesmo ID substitui em vez de duplicar.
	updated := sampleDefinition()
	updated.Name = "Nome Novo"
	definitions, err = store.Upsert(updated)
	if err != nil {
		t.Fatalf("atualizando: %v", err)
	}
	if len(definitions) != 1 {
		t.Fatalf("definições = %d, esperado 1 após atualizar", len(definitions))
	}
	if definitions[0].Name != "Nome Novo" {
		t.Errorf("nome = %q, esperado o atualizado", definitions[0].Name)
	}

	definitions, err = store.Delete("meu-emulador")
	if err != nil {
		t.Fatalf("removendo: %v", err)
	}
	if len(definitions) != 0 {
		t.Errorf("esperava lista vazia após remover, veio %d", len(definitions))
	}

	if _, err := store.Delete("nao-existe"); err == nil {
		t.Error("esperava erro ao remover id inexistente")
	}
}

// O arquivo é editável à mão, então um JSON quebrado precisa apontar o erro em
// vez de sumir silenciosamente com as definições.
func TestCustomStoreReportsInvalidJSON(t *testing.T) {
	path := filepath.Join(t.TempDir(), "custom.json")
	if err := os.WriteFile(path, []byte("{isso nao e json"), 0o644); err != nil {
		t.Fatalf("preparando arquivo: %v", err)
	}

	store := &CustomStore{path: path}
	if _, err := store.Load(); err == nil {
		t.Error("esperava erro apontando o JSON inválido")
	}
}

// Locate confia no caminho informado, sem heurística de bit de execução.
func TestCustomLocateTrustsUserPath(t *testing.T) {
	dir := t.TempDir()
	binary := filepath.Join(dir, "emulador-sem-bit-de-execucao")
	if err := os.WriteFile(binary, []byte("x"), 0o644); err != nil {
		t.Fatalf("preparando binário: %v", err)
	}

	def := sampleDefinition()
	def.BinaryPath = binary

	adapter, err := NewCustomAdapter(def)
	if err != nil {
		t.Fatalf("criando adapter: %v", err)
	}

	if _, ok := adapter.Locate(context.Background()); !ok {
		t.Error("o caminho informado pelo usuário deveria ser aceito como está")
	}

	def.BinaryPath = filepath.Join(dir, "nao-existe")
	missing, _ := NewCustomAdapter(def)
	if _, ok := missing.Locate(context.Background()); ok {
		t.Error("arquivo inexistente não deveria ser reportado como instalado")
	}
}
