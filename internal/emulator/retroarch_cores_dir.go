package emulator

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// RetroArchManagedCoresDir devolve o diretório de cores gerido pelo ZeuX — o
// mesmo que coreDirs() (retroarch.go) confere primeiro ao procurar um core.
//
// Até o ADR 0015 (R4), este diretório também recebia cópia de cores
// empacotados no instalador (ADR 0012, ver histórico em
// docs/decisoes/0012-empacotar-retroarch-e-cores.md) — essa cópia foi
// removida junto com bundled_cores.go, mas o diretório em si continua
// existindo: agora é só destino do download sob demanda
// (internal/install.Manager.StartCore, R2), sem nenhum outro produtor.
func RetroArchManagedCoresDir() (string, error) {
	dirs := bundledCoreDirsForWrite()
	if len(dirs) == 0 {
		return "", fmt.Errorf("não foi possível determinar o diretório de cores do RetroArch neste sistema")
	}
	return dirs[0], nil
}

// bundledCoreDirsForWrite retorna o diretório de escrita dos cores do
// RetroArch geridos pelo ZeuX. Nome mantido ("bundled") por só ser trocado
// numa refatoração maior — o que importa é que bate com o primeiro caminho
// de bundledCoreDirs() (coreDirs(), abaixo), então um core baixado sob
// demanda é achado exatamente onde um bundled seria procurado.
func bundledCoreDirsForWrite() []string {
	if home, err := os.UserHomeDir(); err == nil {
		switch runtime.GOOS {
		case "windows":
			appData := os.Getenv("APPDATA")
			if appData != "" {
				return []string{filepath.Join(appData, "ZeuX", "RetroArch", "cores")}
			}
		case "darwin":
			return []string{filepath.Join(home, "Library", "Application Support", "ZeuX", "RetroArch", "cores")}
		default:
			return []string{filepath.Join(home, ".local", "share", "zeux", "retroarch", "cores")}
		}
	}
	return []string{}
}
