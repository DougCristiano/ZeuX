package install

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"

	"github.com/doufl/zeux/internal/emulator"
)

// ExtractCustomEmulatorPackage é a válvula de escape para quem tem um
// emulador que o ZeuX não instala sozinho (fora do catálogo dos 14 de
// sources.json) mas baixou um pacote compactado, não o executável avulso —
// a forma como a maioria dos emuladores é distribuída de verdade. Sem isto,
// o cadastro manual (ManualEmulatorForm) obrigava a pessoa a extrair na mão
// e navegar pastas até achar o binário certo, o que é fricção real para
// quem não é da área.
//
// Extrai o pacote para uma pasta nova dentro da raiz gerenciada do ZeuX
// (nunca a pasta de Downloads do usuário — mesma regra de nunca escrever
// fora de áreas que o ZeuX controla) e devolve os executáveis achados lá
// dentro, para a tela oferecer como opção em vez de inventar qual é o
// certo. Zero, um ou vários candidatos são todos desfechos esperados: um
// pacote pode trazer só o emulador, ou o emulador junto de utilitários
// (atualizador, descompactador de BIOS, etc.) — a escolha final continua
// sendo do usuário, o ZeuX só poupa a navegação de pasta.
func ExtractCustomEmulatorPackage(archivePath string) (destDir string, candidates []string, err error) {
	info, err := os.Stat(archivePath)
	if err != nil {
		return "", nil, fmt.Errorf("lendo %s: %w", archivePath, err)
	}
	if info.IsDir() {
		return "", nil, fmt.Errorf("%q é uma pasta, não um pacote — aponte o arquivo .zip/.7z/.tar.gz baixado", archivePath)
	}

	kind, err := archiveKindFromExt(archivePath)
	if err != nil {
		return "", nil, err
	}

	root, err := emulator.ManagedRoot()
	if err != nil {
		return "", nil, fmt.Errorf("localizando a pasta gerenciada do ZeuX: %w", err)
	}

	dest := filepath.Join(root, "_custom", customPackageDirName(archivePath))
	if err := Extract(archivePath, dest, kind); err != nil {
		return "", nil, err
	}
	// Muitos pacotes têm uma única pasta-raiz por dentro (ex.:
	// "MeuEmulador-v1.2/"); achatar deixa o executável mais raso, mesmo
	// tratamento que a instalação 1-click já aplica (manager.go).
	if err := flattenSingleRoot(dest); err != nil {
		return "", nil, err
	}

	candidates, err = scanForExecutables(dest)
	if err != nil {
		return dest, nil, err
	}
	if len(candidates) == 0 {
		return dest, nil, fmt.Errorf(
			"o pacote foi extraído em %s, mas nenhum executável foi encontrado dentro dele — aponte o arquivo manualmente", dest)
	}

	return dest, candidates, nil
}

// archiveKindFromExt detecta o formato do pacote pela extensão — não tem
// release conhecida aqui (diferente de sources.go) para dizer o formato de
// outro jeito.
func archiveKindFromExt(path string) (Archive, error) {
	lower := strings.ToLower(path)
	switch {
	case strings.HasSuffix(lower, ".zip"):
		return ArchiveZip, nil
	case strings.HasSuffix(lower, ".7z"):
		return Archive7z, nil
	case strings.HasSuffix(lower, ".tar.gz"), strings.HasSuffix(lower, ".tgz"):
		return ArchiveTarGz, nil
	default:
		return "", fmt.Errorf(
			"formato de pacote não reconhecido (aceito: .zip, .7z, .tar.gz/.tgz) — se o que você tem já é o executável, aponte ele direto, não esta rota")
	}
}

// customPackageIDPattern restringe o nome de pasta derivado do arquivo a
// caracteres seguros — o nome do arquivo baixado é texto que o usuário
// escolheu (ou o site de origem), não confiável para virar caminho sem
// filtrar.
var customPackageIDPattern = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

// customPackageDirName gera um nome de pasta de destino único e seguro a
// partir do nome do arquivo — o timestamp evita colisão entre duas
// extrações do mesmo pacote (ex.: o usuário tentando de novo depois de
// escolher o candidato errado).
func customPackageDirName(archivePath string) string {
	base := filepath.Base(archivePath)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	base = strings.TrimSuffix(base, ".tar") // cobre o ".tar.gz" (duas extensões)
	base = customPackageIDPattern.ReplaceAllString(base, "-")
	if base == "" {
		base = "pacote"
	}
	return fmt.Sprintf("%s-%d", base, time.Now().UnixNano())
}

// maxCustomPackageScanDepth e maxCustomPackageCandidates limitam a varredura
// dentro do pacote extraído — ele é pequeno e já é nosso (acabamos de
// escrevê-lo), então não precisa do orçamento de findBinary
// (discovery.go), mas um teto continua sendo defesa barata contra um
// pacote patológico (milhares de arquivos, ou um `.exe` solto em cada
// subpasta de um instalador NSIS mal comportado).
const (
	maxCustomPackageScanDepth      = 6
	maxCustomPackageCandidates int = 20
)

// scanForExecutables devolve, em ordem de profundidade (mais raso primeiro
// — o binário principal costuma estar mais perto da raiz que utilitários
// internos), os arquivos executáveis dentro de root.
func scanForExecutables(root string) ([]string, error) {
	var found []string

	rootDepth := strings.Count(filepath.Clean(root), string(filepath.Separator))

	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if len(found) >= maxCustomPackageCandidates {
			return filepath.SkipAll
		}

		depth := strings.Count(filepath.Clean(path), string(filepath.Separator)) - rootDepth
		if d.IsDir() {
			if path != root && depth >= maxCustomPackageScanDepth {
				return filepath.SkipDir
			}
			return nil
		}

		if looksLikeEmulatorBinary(path) {
			found = append(found, path)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("varrendo %s: %w", root, err)
	}

	return found, nil
}

// looksLikeEmulatorBinary é emulator.IsExecutableFile mais uma checagem que
// só importa aqui: no Windows, IsExecutableFile devolve true pra qualquer
// arquivo (lá não existe bit de execução no sistema de arquivos — a função
// existe para validar um caminho que o usuário já escolheu de propósito, um
// candidato só). Varrer um pacote inteiro com esse critério devolveria
// DLL, .txt, .ini, tudo — inútil como lista de opções. Aqui, restrito a
// ".exe" no Windows; nos outros SOs o bit de execução (o que
// IsExecutableFile já checa) segue sendo o filtro.
func looksLikeEmulatorBinary(path string) bool {
	if !emulator.IsExecutableFile(path) {
		return false
	}
	if runtime.GOOS == "windows" {
		return strings.EqualFold(filepath.Ext(path), ".exe")
	}
	return true
}
