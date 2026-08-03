package emulator

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// ManagedDirName é a pasta onde o ZeuX instala os emuladores que ele mesmo
// gerencia. Fica separada das instalações do usuário para que a instalação
// 1-click nunca sobrescreva um emulador que a pessoa configurou à mão.
const ManagedDirName = "emulators"

// SharedDirName é onde ficam os emuladores que atendem mais de um console
// (RetroArch, com 24 sistemas; Dolphin, com GameCube e Wii). Um emulador
// desses não tem "o console dele" — instalá-lo dentro da pasta de cada
// console que atende duplicaria o binário uma vez por console (no caso do
// RetroArch, 24 cópias de ~100 MB) e multiplicaria o trabalho de atualizar.
// Ver docs/decisoes/, decisão de 2026-08-02 (Douglas): estrutura por console
// para o usuário achar as coisas, com uma válvula de escape para quem não
// pertence a um console só.
const SharedDirName = "compartilhados"

// ManagedRoot devolve a raiz das instalações gerenciadas pelo ZeuX.
func ManagedRoot() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "ZeuX", ManagedDirName), nil
}

// ManagedEmulatorDir devolve onde o binário deste adapter deve morar dentro
// da raiz gerenciada: junto do console que ele atende sozinho
// (<root>/<console>/emuladores/<adapter>), ou em SharedDirName quando atende
// mais de um. `consoles` vazio (adapter desconhecido) cai no caminho
// compartilhado por segurança — nunca em uma pasta de console que pode não
// fazer sentido para ele.
func ManagedEmulatorDir(root, adapterID string, consoles []string) string {
	if len(consoles) == 1 {
		return filepath.Join(root, consoles[0], "emuladores", adapterID)
	}
	return filepath.Join(root, SharedDirName, adapterID)
}

// findBinary procura o executável de um emulador e devolve o primeiro caminho
// encontrado.
//
// A ordem de busca é intencional: primeiro a instalação gerenciada pelo ZeuX,
// depois os diretórios padrão do sistema, e só então o PATH. Se o usuário
// deixou o ZeuX instalar uma versão, é ela que o app sabe configurar — cair
// numa instalação antiga do sistema traria comportamento que o app não previu.
//
// Quando o contexto carrega um *dirIndex (ver Survey, que varre os diretórios
// do sistema uma vez para todos os adapters em vez de uma vez por adapter), a
// etapa de diretórios do sistema consulta esse índice em memória em vez de
// refazer os os.ReadDir/os.Stat. Sem índice no contexto — uma chamada avulsa,
// fora de Survey —, o comportamento é o de sempre: constrói e testa os
// candidatos na hora.
func findBinary(ctx context.Context, adapterID string, consoles []string, names []string, extraDirs []string) (path string, managed bool, ok bool) {
	if root, err := ManagedRoot(); err == nil {
		managedDir := ManagedEmulatorDir(root, adapterID, consoles)
		for _, name := range names {
			cand := filepath.Join(managedDir, name)
			if isExecutableFile(cand) {
				return cand, true, true
			}
		}

		// Os AppImages baixados pelo instalador 1-click (internal/install)
		// mantêm o nome original do release do projeto — ex.:
		// "pcsx2-v2.6.3-linux-appimage-x64-Qt.AppImage" — que nunca bate com o
		// nome fixo em `names` (ex.: "pcsx2-qt"). Sem isso, todo emulador
		// distribuído como AppImage ficava "instalado" e ao mesmo tempo
		// indetectável no Linux — achado testando de verdade (D11). Como
		// managedDir pertence só a este adapter, um único .AppImage ali só
		// pode ser ele.
		if matches, _ := filepath.Glob(filepath.Join(managedDir, "*.AppImage")); len(matches) == 1 && isExecutableFile(matches[0]) {
			return matches[0], true, true
		}
	}

	// O índice foi construído sem extraDirs (nenhum adapter embutido passa
	// algo além de nil hoje); se algum dia um adapter passar diretórios
	// extras, cair no caminho não-indexado mantém a busca correta em vez de
	// arriscar um índice que não os cobre.
	if idx := discoveryIndexFromContext(ctx); idx != nil && len(extraDirs) == 0 {
		if cand, ok := idx.find(names); ok {
			return cand, false, true
		}
	} else {
		for _, cand := range buildCandidates(names, extraDirs) {
			if isExecutableFile(cand) {
				return cand, false, true
			}
		}
	}

	// Último recurso: o PATH do sistema. Cobre instalações por gerenciador de
	// pacotes no Linux, que não vivem numa pasta previsível.
	for _, name := range names {
		if resolved, err := exec.LookPath(name); err == nil {
			return resolved, false, true
		}
	}

	return "", false, false
}

// buildCandidates lista os caminhos de sistema (sem o diretório gerenciado,
// tratado à parte em findBinary) onde um binário pode estar, na ordem em que
// devem ser testados.
func buildCandidates(names []string, extraDirs []string) []string {
	var candidates []string

	dirs := append(systemDirs(), extraDirs...)
	for _, dir := range dirs {
		if dir == "" {
			continue
		}

		for _, name := range names {
			candidates = append(candidates, filepath.Join(dir, name))
		}

		// Emuladores quase nunca ficam soltos no diretório: o normal é
		// C:\Program Files\DuckStation\duckstation-qt.exe, não
		// C:\Program Files\duckstation-qt.exe. Sem descer um nível, a busca no
		// Windows praticamente nunca encontraria nada.
		//
		// Um nível é suficiente e mantém o custo previsível — varrer o Program
		// Files inteiro seria lento e ainda assim não cobriria instalações em
		// lugares arbitrários, que é o que o cadastro manual resolve.
		for _, sub := range subdirectories(dir) {
			for _, name := range names {
				candidates = append(candidates, filepath.Join(sub, name))
			}
		}
	}

	return candidates
}

// dirIndex é o resultado de varrer os diretórios de sistema uma única vez —
// em vez de uma vez por adapter, que é o que a busca fazia antes. Construído
// por Registry.Survey e descartado ao fim da chamada: não é cache
// persistente, só evita reler os mesmos diretórios 13 vezes na mesma
// requisição.
//
// Medido em 2026-08-01: a versão sem índice gastava 1880 os.Stat e 44ms por
// chamada de Survey; indexar uma vez (ReadDir de ~90 diretórios) e consultar
// em memória caiu para ~8,5ms — a mesma ordem de grandeza do ReadDir sozinho,
// porque o resto virou lookup em mapa. Ver docs/roadmap.md, item D9.
type dirIndex struct {
	// dirs preserva a mesma ordem de precedência que buildCandidates sempre
	// usou: diretório de sistema, depois as subpastas diretas dele, depois o
	// próximo diretório de sistema.
	dirs []indexedDir
}

type indexedDir struct {
	path  string
	files map[string]bool
}

// buildDirIndex varre cada diretório de sistema e suas subpastas diretas uma
// única vez, reaproveitando o mesmo os.ReadDir tanto para achar os arquivos
// do diretório quanto para descobrir suas subpastas — subdirectories()
// sozinha faria uma segunda leitura do mesmo diretório.
func buildDirIndex() *dirIndex {
	idx := &dirIndex{}

	for _, dir := range systemDirs() {
		if dir == "" {
			continue
		}

		files, subs := scanDirEntries(dir)
		idx.dirs = append(idx.dirs, indexedDir{path: dir, files: files})

		for _, sub := range subs {
			subFiles, _ := scanDirEntries(sub)
			idx.dirs = append(idx.dirs, indexedDir{path: sub, files: subFiles})
		}
	}

	return idx
}

// scanDirEntries lê um diretório uma vez e separa arquivos de subpastas.
func scanDirEntries(dir string) (files map[string]bool, subdirs []string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, nil
	}

	files = make(map[string]bool, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			if len(subdirs) < maxSubdirsScanned {
				subdirs = append(subdirs, filepath.Join(dir, entry.Name()))
			}
			continue
		}
		files[entry.Name()] = true
	}

	return files, subdirs
}

// find procura, na mesma ordem de precedência de sempre (diretório antes de
// nome), o primeiro nome presente no índice. A confirmação final é sempre um
// os.Stat — o índice só sabe que o nome existe no diretório, não que é um
// arquivo executável.
func (idx *dirIndex) find(names []string) (string, bool) {
	for _, d := range idx.dirs {
		for _, name := range names {
			if !d.files[name] {
				continue
			}
			cand := filepath.Join(d.path, name)
			if isExecutableFile(cand) {
				return cand, true
			}
		}
	}
	return "", false
}

type discoveryContextKey struct{}

// withDiscoveryIndex embute um índice pré-calculado no contexto, para que os
// Locate() disparados dentro da mesma chamada de Survey dividam o custo de
// ler os diretórios do sistema em vez de cada adapter reler os mesmos
// diretórios.
func withDiscoveryIndex(ctx context.Context, idx *dirIndex) context.Context {
	return context.WithValue(ctx, discoveryContextKey{}, idx)
}

func discoveryIndexFromContext(ctx context.Context) *dirIndex {
	idx, _ := ctx.Value(discoveryContextKey{}).(*dirIndex)
	return idx
}

// maxSubdirsScanned limita a varredura para que um diretório com muitas
// entradas não torne a descoberta cara.
const maxSubdirsScanned = 400

// subdirectories lista as subpastas diretas de um diretório.
func subdirectories(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}

	var subs []string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if len(subs) >= maxSubdirsScanned {
			break
		}
		subs = append(subs, filepath.Join(dir, entry.Name()))
	}

	return subs
}

// systemDirs lista os diretórios onde emuladores costumam ser instalados em
// cada sistema operacional.
func systemDirs() []string {
	home, _ := os.UserHomeDir()

	switch runtime.GOOS {
	case "windows":
		return []string{
			os.Getenv("ProgramFiles"),
			os.Getenv("ProgramFiles(x86)"),
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs"),
			filepath.Join(home, "Desktop"),
			filepath.Join(home, "Downloads"),
		}
	case "darwin":
		return []string{
			"/Applications",
			filepath.Join(home, "Applications"),
			"/opt/homebrew/bin",
			"/usr/local/bin",
		}
	default:
		return []string{
			"/usr/bin",
			"/usr/local/bin",
			"/usr/games",
			filepath.Join(home, ".local", "bin"),
			// Flatpak é a forma mais comum de instalar emuladores no Linux hoje.
			"/var/lib/flatpak/exports/bin",
			filepath.Join(home, ".local", "share", "flatpak", "exports", "bin"),
			filepath.Join(home, "Applications"),
		}
	}
}

// isExecutableFile confirma que o caminho existe e é um arquivo. No Windows a
// extensão já basta; nos demais sistemas exigimos o bit de execução, para não
// confundir um README com o binário.
func isExecutableFile(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}

	if runtime.GOOS == "windows" {
		return true
	}

	return info.Mode().Perm()&0o111 != 0
}

// binaryNames adapta os nomes de executável ao sistema operacional. No macOS os
// emuladores vêm empacotados em .app, e o binário real fica enterrado dentro do
// bundle.
func binaryNames(base string, windowsNames []string, macBundle string) []string {
	switch runtime.GOOS {
	case "windows":
		return windowsNames
	case "darwin":
		if macBundle != "" {
			return []string{filepath.Join(macBundle+".app", "Contents", "MacOS", base), base}
		}
		return []string{base}
	default:
		return []string{base}
	}
}
