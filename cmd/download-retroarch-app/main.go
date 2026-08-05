// Command download-retroarch-app baixa o app principal do RetroArch (não os
// cores — isso já é feito por scripts/download-retroarch-cores.mjs) do
// buildbot oficial, para empacotar dentro do instalador do ZeuX. É a peça
// que faltava do ADR 0012 (docs/decisoes/0012-empacotar-retroarch-e-cores.md):
// o ADR empacotou os cores, mas nunca o executável em si — achado testando o
// instalador de verdade em 2026-08-04 (a tela de emuladores mostrava
// "RetroArch não instalado" mesmo com os cores dentro do pacote).
//
// URL confirmada de verdade em 2026-08-04 (esta sessão de IA teve acesso
// pontual a buildbot.libretro.com, ao contrário das tentativas anteriores
// registradas no roadmap): diferente dos cores, o app do RetroArch NÃO fica
// em .../latest/<arquivo> — o buildbot guarda builds datadas
// (.../nightly/<plataforma>/2026-08-04_RetroArch.7z, uma por dia) e também
// publica um alias fixo sem data, .../nightly/<plataforma>/RetroArch.7z, que
// é o que este programa usa (sempre a build mais recente, sem precisar
// acompanhar a data).
//
// A estrutura interna do pacote também foi confirmada baixando e inspecionando
// de verdade (não é o mesmo formato nas duas plataformas):
//   - Linux: um único AppImage autocontido,
//     RetroArch-Linux-x86_64/RetroArch-Linux-x86_64.AppImage (~11 MB). O
//     pacote também traz uma pasta irmã enorme
//     (.../RetroArch-Linux-x86_64.AppImage.home/, ~19 mil arquivos de
//     assets/shaders/overlays — convenção "AppImage home" para modo
//     portátil) que este programa ignora de propósito: o ZeuX lança o jogo
//     direto por linha de comando, sem passar pelo menu do RetroArch.
//   - Windows: retroarch.exe precisa de ~65 DLLs ao lado dele
//     (RetroArch-Win64/*.dll, ~147 MB no total) — sem elas o executável não
//     abre. Só o nível de topo do pacote é extraído; as subpastas de assets
//     (shaders/, overlays/, assets/, database/, etc.) ficam de fora.
//
// macOS é deliberadamente pulado por enquanto: o buildbot confirma que
// distribui o app do RetroArch para macOS como .dmg
// (.../nightly/apple/osx/x86_64/RetroArch.dmg), não .7z, e montar um .dmg
// não tem rota simples em Go puro — precisa de decisão e implementação à
// parte, não uma aposta às cegas.
package main

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/bodgit/sevenzip"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "download-retroarch-app: %v\n", err)
		fmt.Fprintln(os.Stderr, "aviso: o build continua sem o app do RetroArch empacotado — a instalação dele segue manual até isto ser corrigido.")
		// Não falha o build: mesma filosofia não-fatal de
		// scripts/download-retroarch-cores.mjs — cores/app bundled ausentes
		// não podem travar quem só quer compilar o app.
	}
}

func run() error {
	platform, ext, err := buildbotTarget()
	if err != nil {
		return err
	}

	repoRoot, err := os.Getwd()
	if err != nil {
		return err
	}
	// Convenção: este programa é chamado via `go run
	// ./cmd/download-retroarch-app` a partir da raiz do repo, mesma
	// convenção de scripts/build-zeuxd.mjs.
	destDir := filepath.Join(repoRoot, "src-tauri", "resources", "retroarch", "bin")

	// Bug real achado em 2026-08-05, inspecionando o log de um build de
	// Windows na CI: len(entries) > 0 contava o .gitkeep versionado (ver
	// .gitignore, "src-tauri/resources/retroarch/bin/*" +
	// "!.../.gitkeep") como "já baixado" — todo checkout limpo (toda CI,
	// sempre) tinha exatamente esse 1 arquivo e o download era pulado
	// silenciosamente, sempre. Só não dava pra notar rodando localmente
	// porque a pasta deste ambiente já tinha o AppImage de verdade de uma
	// sessão anterior, escondendo o bug. Corrigido ignorando entradas que
	// começam com "." ao decidir se já existe algo de verdade.
	if entries, err := os.ReadDir(destDir); err == nil {
		for _, entry := range entries {
			if strings.HasPrefix(entry.Name(), ".") {
				continue
			}
			fmt.Println("download-retroarch-app: já presente em", destDir, "— pulando.")
			return nil
		}
	}
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return err
	}

	url := fmt.Sprintf("https://buildbot.libretro.com/nightly/%s/RetroArch%s", platform, ext)
	fmt.Println("download-retroarch-app:", url)

	tmpArchive, err := os.CreateTemp("", "retroarch-app-*"+ext)
	if err != nil {
		return err
	}
	tmpPath := tmpArchive.Name()
	defer os.Remove(tmpPath)

	if err := downloadTo(url, tmpArchive); err != nil {
		tmpArchive.Close()
		return err
	}
	tmpArchive.Close()

	return extractPortable(tmpPath, destDir)
}

func downloadTo(url string, dst *os.File) error {
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("baixando %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s respondeu %s", url, resp.Status)
	}

	if _, err := io.Copy(dst, resp.Body); err != nil {
		return fmt.Errorf("gravando download: %w", err)
	}

	return nil
}

// buildbotTarget devolve o segmento de plataforma do buildbot e a extensão
// do pacote. Mesma tabela de plataformas usada em
// scripts/download-retroarch-cores.mjs — exceto que macOS ainda não está
// coberto (ver comentário do pacote).
func buildbotTarget() (platform string, ext string, err error) {
	switch runtime.GOOS {
	case "linux":
		if runtime.GOARCH == "arm64" {
			return "linux/aarch64", ".7z", nil
		}
		return "linux/x86_64", ".7z", nil
	case "windows":
		return "windows/x86_64", ".7z", nil
	case "darwin":
		return "", "", errors.New("empacotamento do app do RetroArch para macOS ainda não implementado (buildbot distribui .dmg, não .7z) — ver comentário do pacote")
	default:
		return "", "", fmt.Errorf("SO desconhecido: %s/%s", runtime.GOOS, runtime.GOARCH)
	}
}

// extractPortable extrai só o que o ZeuX precisa para lançar jogos pelo
// RetroArch, nunca a árvore inteira do pacote (ver comentário do pacote para
// a estrutura real de cada SO, confirmada baixando os pacotes de verdade).
//
// Só olha arquivos diretamente dentro do diretório de topo do pacote (ex.:
// "RetroArch-Win64/retroarch.exe", profundidade 2) — nunca dentro de uma
// subpasta (".../shaders/...", ".../AppImage.home/...", que são assets que o
// ZeuX não usa).
func extractPortable(archivePath, destDir string) error {
	reader, err := sevenzip.OpenReader(archivePath)
	if err != nil {
		return fmt.Errorf("abrindo o 7z: %w", err)
	}
	defer reader.Close()

	extracted := 0
	for _, entry := range reader.File {
		if entry.FileInfo().IsDir() {
			continue
		}

		parts := strings.Split(entry.Name, "/")
		if len(parts) != 2 {
			continue
		}
		name := parts[1]

		// No Linux o app é um único AppImage autocontido — não precisa de
		// mais nada ao lado. No Windows, retroarch.exe só funciona com as
		// DLLs junto, então todo o nível de topo entra.
		if runtime.GOOS != "windows" && !strings.HasSuffix(name, ".AppImage") {
			continue
		}

		dst := filepath.Join(destDir, name)
		if err := copyEntryTo(entry, dst); err != nil {
			return fmt.Errorf("extraindo %s: %w", name, err)
		}

		if runtime.GOOS != "windows" {
			if err := os.Chmod(dst, 0o755); err != nil {
				return fmt.Errorf("marcando %s como executável: %w", name, err)
			}
		}

		extracted++
	}

	if extracted == 0 {
		return fmt.Errorf("nenhum arquivo reconhecido dentro do pacote baixado — a estrutura do buildbot pode ter mudado desde 2026-08-04")
	}

	fmt.Printf("download-retroarch-app: %d arquivo(s) extraído(s) para %s\n", extracted, destDir)
	return nil
}

func copyEntryTo(entry *sevenzip.File, dst string) error {
	src, err := entry.Open()
	if err != nil {
		return err
	}
	defer src.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, src)
	return err
}
