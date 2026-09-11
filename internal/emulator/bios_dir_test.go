package emulator

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// DuckStation só recebe a pasta de BIOS quando foi o ZeuX quem instalou —
// uma instalação alheia do usuário pode não estar em modo portátil, e
// presumir a convenção erraria o palpite.
func TestBiosDirDuckStationOnlyWhenManaged(t *testing.T) {
	installDir := t.TempDir()
	binPath := filepath.Join(installDir, "DuckStation-x64.AppImage")

	managed := Installation{BinaryPath: binPath, Managed: true}
	dir, ok := BiosDir("duckstation", managed)
	if !ok {
		t.Fatal("esperava BiosDir para DuckStation managed")
	}
	want := filepath.Join(installDir, "bios")
	if dir != want {
		t.Errorf("BiosDir = %q, queria %q", dir, want)
	}
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		t.Errorf("BiosDir deveria ter criado a pasta: %v", err)
	}

	unmanaged := Installation{BinaryPath: "/usr/bin/duckstation-qt", Managed: false}
	if _, ok := BiosDir("duckstation", unmanaged); ok {
		t.Error("não deveria ter BiosDir para instalação não gerenciada pelo ZeuX")
	}
}

// PCSX2 (achado real em 2026-08-04): mesmo com portable.txt presente, o
// binário real não entra em modo portátil — sempre usa o diretório global do
// sistema, independente de Managed. Só verificado no Linux.
func TestBiosDirPCSX2UsesGlobalDirRegardlessOfManaged(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("BiosDir de pcsx2 só verificado no Linux")
	}

	// Isola XDG_CONFIG_HOME: sem isso, BiosDir criaria de verdade
	// ~/.config/PCSX2/bios na máquina de quem roda o teste.
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	for _, managed := range []bool{true, false} {
		install := Installation{BinaryPath: "/anywhere/pcsx2.AppImage", Managed: managed}
		dir, ok := BiosDir("pcsx2", install)
		if !ok {
			t.Fatalf("esperava BiosDir para pcsx2 (managed=%v)", managed)
		}
		if filepath.Base(filepath.Dir(dir)) != "PCSX2" || filepath.Base(dir) != "bios" {
			t.Errorf("BiosDir = %q, esperava terminar em .../PCSX2/bios", dir)
		}
		if info, err := os.Stat(dir); err != nil || !info.IsDir() {
			t.Errorf("BiosDir deveria ter criado a pasta: %v", err)
		}
	}
}

// PCSX2 no Windows (2026-09-11): mesma convenção "Documentos\PCSX2\bios" da
// pcsx2DataDir (pcsx2_config.go) — não verificada contra um binário Windows
// real, mas documentada pelo próprio projeto PCSX2. Trava que BiosDir e
// pcsx2ConfigPath nunca divergem sobre a pasta base.
func TestBiosDirPCSX2UsesDocumentsOnWindows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("BiosDir de pcsx2 no Windows usa Documentos, só faz sentido testar lá")
	}

	// Isola USERPROFILE: sem isso, BiosDir criaria de verdade
	// Documentos\PCSX2\bios na máquina de quem roda o teste.
	home := t.TempDir()
	t.Setenv("USERPROFILE", home)

	for _, managed := range []bool{true, false} {
		install := Installation{BinaryPath: `C:\anywhere\pcsx2-qt.exe`, Managed: managed}
		dir, ok := BiosDir("pcsx2", install)
		if !ok {
			t.Fatalf("esperava BiosDir para pcsx2 (managed=%v)", managed)
		}
		want := filepath.Join(home, "Documents", "PCSX2", "bios")
		if dir != want {
			t.Errorf("BiosDir = %q, queria %q", dir, want)
		}
		if info, err := os.Stat(dir); err != nil || !info.IsDir() {
			t.Errorf("BiosDir deveria ter criado a pasta: %v", err)
		}
	}
}

// Flycast no Windows (verificado ao vivo em 2026-09-11, ver flycastBiosDir):
// a pasta de BIOS é "data" ao lado do flycast.exe, e não depende de Managed —
// o Flycast para Windows é portátil incondicionalmente, então a instalação
// que o usuário já tinha por conta própria também ganha o caminho certo.
func TestBiosDirFlycastUsesDataNextToBinaryOnWindows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("o modo portátil do Flycast só foi verificado no Windows")
	}

	installDir := t.TempDir()
	binPath := filepath.Join(installDir, "flycast.exe")

	for _, managed := range []bool{true, false} {
		dir, ok := BiosDir("flycast", Installation{BinaryPath: binPath, Managed: managed})
		if !ok {
			t.Fatalf("esperava BiosDir para flycast (managed=%v)", managed)
		}
		want := filepath.Join(installDir, "data")
		if dir != want {
			t.Errorf("BiosDir = %q, queria %q", dir, want)
		}
		if info, err := os.Stat(dir); err != nil || !info.IsDir() {
			t.Errorf("BiosDir deveria ter criado a pasta: %v", err)
		}
	}

	// Sem caminho de binário não há âncora: o Flycast se ancora no
	// executável, não no diretório de trabalho.
	if _, ok := BiosDir("flycast", Installation{Managed: true}); ok {
		t.Error("sem BinaryPath não deveria haver BiosDir para flycast")
	}
}

// A pasta "data" do Flycast guarda o cache de shaders e as capas dele
// mesmo, então "tem arquivo dentro" não significa "o BIOS está lá". Trava a
// regra de 2026-09-11: para o Flycast a pergunta é pelo arquivo de boot
// (dc_boot.bin/dc_bios.bin), senão o ZeuX diria que o Dreamcast está pronto
// sem nenhum BIOS existir. Os outros adapters continuam no critério "pasta
// vazia".
func TestBiosDirLooksEmptyIgnoresFlycastOwnFiles(t *testing.T) {
	dir := t.TempDir()

	empty, ok := BiosDirLooksEmpty("flycast", dir)
	if !ok || !empty {
		t.Fatalf("pasta recém-criada: empty=%v ok=%v, queria true/true", empty, ok)
	}

	// Arquivo do próprio Flycast não conta como BIOS.
	if err := os.WriteFile(filepath.Join(dir, "dx11_shader_cache.bin"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if empty, ok := BiosDirLooksEmpty("flycast", dir); !ok || !empty {
		t.Errorf("cache de shaders não deveria contar como BIOS: empty=%v ok=%v", empty, ok)
	}
	// Mas para qualquer outro adapter o critério continua sendo a pasta vazia.
	if empty, ok := BiosDirLooksEmpty("duckstation", dir); !ok || empty {
		t.Errorf("duckstation deveria usar o critério de pasta vazia: empty=%v ok=%v", empty, ok)
	}

	// O arquivo de boot, em qualquer caixa, conta.
	if err := os.WriteFile(filepath.Join(dir, "DC_BOOT.BIN"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if empty, ok := BiosDirLooksEmpty("flycast", dir); !ok || empty {
		t.Errorf("dc_boot.bin deveria contar como BIOS presente: empty=%v ok=%v", empty, ok)
	}

	// Pasta que não dá para ler não afirma nada (princípio 4).
	if _, ok := BiosDirLooksEmpty("flycast", filepath.Join(dir, "nao-existe")); ok {
		t.Error("pasta inexistente não deveria afirmar nada sobre o BIOS")
	}
}

// RPCS3, xemu e Vita3K não recebem pasta, cada um por um motivo próprio
// registrado em bios_dir.go: os dois primeiros porque o firmware é escolhido
// arquivo a arquivo num diálogo (não há pasta varrida), o Vita3K porque não
// foi possível observar o binário rodando. Nenhum adapter fora dos
// verificados deve devolver um caminho.
func TestBiosDirUnknownForEverythingElse(t *testing.T) {
	for _, id := range []string{"rpcs3", "vita3k", "xemu", "retroarch"} {
		if _, ok := BiosDir(id, Installation{BinaryPath: "/x", Managed: true}); ok {
			t.Errorf("%s não deveria ter BiosDir verificado", id)
		}
	}
}
