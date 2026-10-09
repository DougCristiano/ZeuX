package emulator

import (
	"os"
	"path/filepath"
	"testing"
)

// Regra travada: um core que está no `libretro_directory` do retroarch.cfg do
// usuário conta como instalado, porque é onde o RetroArch de fato o carrega.
// Sem isso o ZeuX acusava "core ausente" com o jogo rodando normalmente.
func TestLocateCoreHonorsConfiguredLibretroDirectory(t *testing.T) {
	root := t.TempDir()
	coresDir := filepath.Join(root, "meus-cores")
	if err := os.MkdirAll(coresDir, 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := filepath.Join(root, "retroarch.cfg")
	if err := os.WriteFile(cfg, []byte("libretro_directory = \""+coresDir+"\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	orig := retroArchConfigPath
	retroArchConfigPath = func(Installation) (string, error) { return cfg, nil }
	defer func() { retroArchConfigPath = orig }()
	t.Setenv("LIBRETRO_DIRECTORY", "")

	// Confere a lista (e não locateCore) porque a máquina de quem roda o teste
	// pode ter o core na pasta gerida, que vem antes.
	found := false
	for _, dir := range coreDirs(filepath.Join(root, "bin", "retroarch")) {
		if dir == coresDir {
			found = true
		}
	}
	if !found {
		t.Fatalf("coreDirs não inclui o libretro_directory %q", coresDir)
	}
}

// Regra travada: "default", vazio e caminho relativo não viram diretório; ":"
// significa a pasta do executável.
func TestResolveCfgCoreDir(t *testing.T) {
	bin := filepath.Join(string(filepath.Separator), "opt", "ra", "retroarch")
	exeCores := filepath.Join(filepath.Dir(bin), "cores")
	abs := filepath.Join(string(filepath.Separator), "abs", "cores")
	cases := map[string]string{
		"":        "",
		"default": "",
		"cores":   "",
		":/cores": exeCores,
		`:\cores`: exeCores,
		abs:       abs,
	}
	for in, want := range cases {
		if got := resolveCfgCoreDir(in, bin); got != want {
			t.Errorf("resolveCfgCoreDir(%q) = %q, esperava %q", in, got, want)
		}
	}
}
