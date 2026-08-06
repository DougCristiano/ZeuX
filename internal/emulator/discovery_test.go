package emulator

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

// Emulador de console único (ex.: DuckStation, só ps1) fica dentro da pasta
// do seu console — é o que faz "olhar a pasta do PS1 e ver o que roda ali"
// funcionar, em vez de um diretório achatado por adapter.
func TestManagedEmulatorDirUsesConsoleFolderForSingleConsoleAdapter(t *testing.T) {
	got := ManagedEmulatorDir("/root", "duckstation", []string{"ps1"})
	want := filepath.Join("/root", "ps1", "emuladores", "duckstation")
	if got != want {
		t.Errorf("ManagedEmulatorDir = %q, queria %q", got, want)
	}
}

// RetroArch (24 consoles) e Dolphin (2) não têm "o console deles" — instalar
// dentro da pasta de cada console duplicaria o binário uma vez por console
// que atendem. Caem na pasta compartilhada.
func TestManagedEmulatorDirUsesSharedFolderForMultiConsoleAdapter(t *testing.T) {
	got := ManagedEmulatorDir("/root", "dolphin", []string{"gamecube", "wii"})
	want := filepath.Join("/root", SharedDirName, "dolphin")
	if got != want {
		t.Errorf("ManagedEmulatorDir = %q, queria %q", got, want)
	}
}

// Um adapter sem console conhecido (não deveria acontecer, mas a função não
// pode presumir) cai no caminho compartilhado por segurança — nunca numa
// pasta de console que pode nem existir.
func TestManagedEmulatorDirDefaultsToSharedForUnknownAdapter(t *testing.T) {
	got := ManagedEmulatorDir("/root", "desconhecido", nil)
	want := filepath.Join("/root", SharedDirName, "desconhecido")
	if got != want {
		t.Errorf("ManagedEmulatorDir = %q, queria %q", got, want)
	}
}

// findBinary precisa achar um binário de console único dentro da pasta do
// console dele, não mais num diretório achatado por adapter.
func TestFindBinaryLocatesSingleConsoleAdapterInsideConsoleFolder(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome) // AppData no Windows não se aplica aqui; testado em Linux.

	root, err := ManagedRoot()
	if err != nil {
		t.Fatalf("ManagedRoot: %v", err)
	}

	dir := ManagedEmulatorDir(root, "duckstation", []string{"ps1"})
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	binPath := filepath.Join(dir, "duckstation-qt")
	if err := os.WriteFile(binPath, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}

	path, managed, _, ok := findBinary(context.Background(), "duckstation", []string{"ps1"}, []string{"duckstation-qt"}, nil)
	if !ok {
		t.Fatal("esperava achar o binário gerenciado")
	}
	if !managed {
		t.Error("deveria estar marcado como managed")
	}
	if path != binPath {
		t.Errorf("path = %q, queria %q", path, binPath)
	}
}

// Achado testando de verdade (D11, 2026-08-03): o instalador 1-click mantém o
// nome original do release para AppImages (ex.:
// "pcsx2-v2.6.3-linux-appimage-x64-Qt.AppImage"), que nunca bate com o nome
// fixo que os adapters esperam (ex.: "pcsx2-qt"). Sem este caso, PCSX2,
// DuckStation, PPSSPP, Flycast, Cemu e Azahar ficavam "instalados" e ao mesmo
// tempo indetectáveis em qualquer sistema Linux.
func TestFindBinaryLocatesAppImageByGlobWhenExactNameDoesNotMatch(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	root, err := ManagedRoot()
	if err != nil {
		t.Fatalf("ManagedRoot: %v", err)
	}

	dir := ManagedEmulatorDir(root, "pcsx2", []string{"ps2"})
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	appImagePath := filepath.Join(dir, "pcsx2-v2.6.3-linux-appimage-x64-Qt.AppImage")
	if err := os.WriteFile(appImagePath, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}

	// "pcsx2-qt" é o nome que o adapter procura primeiro — não existe aqui, só
	// o AppImage, então a busca exata falha e precisa cair no glob.
	path, managed, _, ok := findBinary(context.Background(), "pcsx2", []string{"ps2"}, []string{"pcsx2-qt"}, nil)
	if !ok {
		t.Fatal("esperava achar o AppImage pelo glob")
	}
	if !managed {
		t.Error("deveria estar marcado como managed")
	}
	if path != appImagePath {
		t.Errorf("path = %q, queria %q", path, appImagePath)
	}
}

// Trava o critério de aceite do item de Sprint A "Installation.Version": uma
// instalação gerenciada com o marcador de versão gravado (internal/install
// grava isso depois de baixar um release) devolve a versão via findBinary,
// sem executar o binário para perguntar a ele.
func TestFindBinaryReadsVersionMarkerForManagedInstall(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	root, err := ManagedRoot()
	if err != nil {
		t.Fatalf("ManagedRoot: %v", err)
	}

	dir := ManagedEmulatorDir(root, "duckstation", []string{"ps1"})
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "duckstation-qt"), []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, VersionMarkerName), []byte("v0.10.1\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	_, managed, version, ok := findBinary(context.Background(), "duckstation", []string{"ps1"}, []string{"duckstation-qt"}, nil)
	if !ok || !managed {
		t.Fatalf("esperava achar o binário gerenciado: ok=%v managed=%v", ok, managed)
	}
	if version != "v0.10.1" {
		t.Errorf("version = %q, queria %q (sem espaço/quebra de linha à volta)", version, "v0.10.1")
	}
}

// Trava o lado "dado desconhecido, nunca um palpite": uma instalação
// gerenciada sem o marcador (ex.: gravada antes desta funcionalidade
// existir) devolve versão vazia, não erro nem valor inventado.
func TestFindBinaryVersionEmptyWithoutMarker(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	root, err := ManagedRoot()
	if err != nil {
		t.Fatalf("ManagedRoot: %v", err)
	}

	dir := ManagedEmulatorDir(root, "duckstation", []string{"ps1"})
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "duckstation-qt"), []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}

	_, _, version, ok := findBinary(context.Background(), "duckstation", []string{"ps1"}, []string{"duckstation-qt"}, nil)
	if !ok {
		t.Fatal("esperava achar o binário gerenciado")
	}
	if version != "" {
		t.Errorf("version = %q, esperava vazio sem marcador gravado", version)
	}
}

// Duas AppImages no mesmo diretório gerenciado não deveriam acontecer na
// prática (o instalador substitui a anterior), mas se acontecer, escolher
// uma às cegas seria pior que não achar nenhuma.
func TestFindBinaryDoesNotGuessBetweenMultipleAppImages(t *testing.T) {
	configHome := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configHome)

	root, err := ManagedRoot()
	if err != nil {
		t.Fatalf("ManagedRoot: %v", err)
	}

	dir := ManagedEmulatorDir(root, "pcsx2", []string{"ps2"})
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"pcsx2-v2.6.2.AppImage", "pcsx2-v2.6.3.AppImage"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	_, _, _, ok := findBinary(context.Background(), "pcsx2", []string{"ps2"}, []string{"pcsx2-qt"}, nil)
	if ok {
		t.Error("não deveria escolher entre duas AppImages ambíguas")
	}
}

// A precedência é: diretório de sistema antes de suas subpastas, e um
// diretório de sistema inteiro antes do próximo. Testa isso plugando um
// dirIndex construído à mão, para não depender de PATH real da máquina.
func TestDirIndexRespectsDirectoryPrecedence(t *testing.T) {
	root := t.TempDir()
	primeiro := filepath.Join(root, "primeiro")
	segundo := filepath.Join(root, "segundo")
	subDoPrimeiro := filepath.Join(primeiro, "sub")

	for _, dir := range []string{primeiro, segundo, subDoPrimeiro} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	// O binário "certo" mora no subdiretório do primeiro dir. Um binário de
	// mesmo nome no segundo dir não deve vencer, porque "primeiro" precede
	// "segundo" — mesmo que a subpasta seja varrida depois do próprio
	// "primeiro" no índice.
	certo := filepath.Join(subDoPrimeiro, "emu.bin")
	errado := filepath.Join(segundo, "emu.bin")
	for _, p := range []string{certo, errado} {
		if err := os.WriteFile(p, []byte("x"), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	idx := &dirIndex{}
	filesPrimeiro, subs := scanDirEntries(primeiro)
	idx.dirs = append(idx.dirs, indexedDir{path: primeiro, files: filesPrimeiro})
	for _, sub := range subs {
		subFiles, _ := scanDirEntries(sub)
		idx.dirs = append(idx.dirs, indexedDir{path: sub, files: subFiles})
	}
	filesSegundo, _ := scanDirEntries(segundo)
	idx.dirs = append(idx.dirs, indexedDir{path: segundo, files: filesSegundo})

	got, ok := idx.find([]string{"emu.bin"})
	if !ok {
		t.Fatal("esperava achar o binário")
	}
	if got != certo {
		t.Errorf("achou %q, queria %q (precedência de diretório violada)", got, certo)
	}
}

// Dentro do MESMO diretório, a ordem dos nomes pedidos pelo adapter também
// importa: se duckstation-qt-x64-ReleaseLTCG.exe e duckstation-qt.exe
// existem no mesmo lugar, o primeiro nome da lista vence.
func TestDirIndexRespectsNameOrderWithinSameDir(t *testing.T) {
	dir := t.TempDir()
	preferido := filepath.Join(dir, "preferido.exe")
	alternativo := filepath.Join(dir, "alternativo.exe")
	for _, p := range []string{preferido, alternativo} {
		if err := os.WriteFile(p, []byte("x"), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	files, _ := scanDirEntries(dir)
	idx := &dirIndex{dirs: []indexedDir{{path: dir, files: files}}}

	got, ok := idx.find([]string{"preferido.exe", "alternativo.exe"})
	if !ok || got != preferido {
		t.Errorf("esperava %q (primeiro nome da lista), achou %q (ok=%v)", preferido, got, ok)
	}
}

// scanDirEntries devolve os arquivos e as subpastas numa única leitura —
// trava que a otimização não perdeu nenhuma das duas informações.
func TestScanDirEntriesSeparatesFilesFromSubdirs(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "arquivo.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "subpasta"), 0o755); err != nil {
		t.Fatal(err)
	}

	files, subs := scanDirEntries(dir)

	if !files["arquivo.txt"] {
		t.Error("arquivo.txt deveria estar em files")
	}
	if files["subpasta"] {
		t.Error("subpasta não deveria aparecer em files")
	}
	if len(subs) != 1 || subs[0] != filepath.Join(dir, "subpasta") {
		t.Errorf("subs = %v, queria [%q]", subs, filepath.Join(dir, "subpasta"))
	}
}

// Trava que Survey de fato usa o índice: sem ele no contexto, cada Locate
// cairia no caminho não-indexado. O teste não mede tempo (variável demais em
// CI); confirma que o resultado de Survey continua correto quando builds do
// PATH ou de diretórios de sistema não existem — caminho comum em CI.
func TestSurveyDoesNotPanicWithoutAnyInstalledEmulator(t *testing.T) {
	r := NewRegistry()
	statuses := r.Survey(context.Background())

	if len(statuses) != len(r.Adapters()) {
		t.Errorf("Survey devolveu %d status, esperava %d (um por adapter)", len(statuses), len(r.Adapters()))
	}
}
