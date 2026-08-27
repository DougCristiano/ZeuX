// Command generate-retroarch-manifest baixa cada core do buildbot do
// libretro, mede tamanho e SHA256, e escreve
// internal/install/data/retroarch_cores_manifest.json — o manifesto que o
// download sob demanda (ADR 0015, R1/R2) usa para saber o que baixar e
// recusar um arquivo que não bate.
//
// Não roda em CI nem no build normal: precisa de acesso de rede a
// buildbot.libretro.com, que está bloqueado neste ambiente de
// desenvolvimento desde 2026-08-02 (mesma restrição que já bloqueava
// scripts/download-retroarch-cores.mjs). Uso esperado: o Douglas roda isto
// numa máquina com acesso real ao buildbot, sempre que decidir cortar uma
// nova versão do manifesto — nunca automaticamente.
//
// Um core que falhar (rede indisponível, 404, timeout) não derruba o
// programa: fica registrado no manifesto com "generated": false, size 0 e
// sha256 vazio, e o resumo final lista o que faltou. R2 deve recusar
// instalar a partir de uma entrada não gerada — "generated": false não é
// "sem verificação", é "ninguém mediu isto ainda".
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/doufl/zeux/internal/emulator"
	"github.com/doufl/zeux/internal/install"
)

func main() {
	timeout := flag.Duration("timeout", 30*time.Second, "tempo máximo por download")
	out := flag.String("out", defaultManifestPath(), "caminho do manifesto a escrever")
	flag.Parse()

	cores := emulator.KnownCores()
	names := make([]string, 0, len(cores))
	for name := range cores {
		names = append(names, name)
	}
	sort.Strings(names)

	manifest := install.RetroArchCoreManifest{
		SchemaVersion: 1,
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		HashSource: "Nenhum hash oficial publicado pelo buildbot foi confirmado " +
			"(host bloqueado no ambiente de desenvolvimento desde 2026-08-02, " +
			"ver ADR 0015). O SHA256 abaixo é medido pelo próprio ZeuX no " +
			"momento da geração, não conferido contra uma soma publicada pela " +
			"origem.",
		Cores: make(map[string]install.RetroArchCoreEntry, len(names)),
	}

	client := &http.Client{Timeout: *timeout}

	var failed []string
	for _, name := range names {
		libretroName := cores[name]
		entry := install.RetroArchCoreEntry{
			LibretroName: libretroName,
			Platforms:    make(map[string]install.RetroArchCoreAsset),
		}

		for _, platform := range install.RetroArchManifestPlatforms() {
			goos, goarch, _ := strings.Cut(platform, "/")
			url, filename, err := install.BuildBotCoreURL(goos, goarch, libretroName)
			if err != nil {
				fmt.Fprintf(os.Stderr, "%s/%s: %v\n", name, platform, err)
				continue
			}

			asset := install.RetroArchCoreAsset{URL: url, Filename: filename}
			size, sum, err := downloadAndHash(client, url)
			if err != nil {
				fmt.Fprintf(os.Stderr, "%s/%s: %v\n", name, platform, err)
				failed = append(failed, name+"/"+platform)
			} else {
				asset.Size = size
				asset.SHA256 = sum
				asset.Generated = true
			}
			entry.Platforms[platform] = asset
		}

		manifest.Cores[name] = entry
	}

	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "serializando manifesto: %v\n", err)
		os.Exit(1)
	}
	data = append(data, '\n')

	if err := os.WriteFile(*out, data, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "escrevendo %s: %v\n", *out, err)
		os.Exit(1)
	}

	total := len(names) * len(install.RetroArchManifestPlatforms())
	fmt.Printf("manifesto escrito em %s: %d/%d combinações core/plataforma medidas\n", *out, total-len(failed), total)
	if len(failed) > 0 {
		fmt.Printf("faltaram (rede indisponível ou 404): %s\n", strings.Join(failed, ", "))
	}
}

// downloadAndHash baixa o corpo inteiro para medir tamanho e SHA256. O core
// mais pesado do manifesto (mame_libretro) fica na casa de dezenas de MB, o
// que cabe em memória sem problema — mesma ordem de grandeza que
// internal/install/download.go já processa em disco.
func downloadAndHash(client *http.Client, url string) (int64, string, error) {
	resp, err := client.Get(url)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, "", fmt.Errorf("status %d", resp.StatusCode)
	}

	hasher := sha256.New()
	size, err := io.Copy(hasher, resp.Body)
	if err != nil {
		return 0, "", fmt.Errorf("baixando: %w", err)
	}

	return size, hex.EncodeToString(hasher.Sum(nil)), nil
}

// defaultManifestPath acha internal/install/data/retroarch_cores_manifest.json
// a partir da localização deste arquivo-fonte, para que o comando funcione
// não importa de onde `go run` seja invocado — mesma técnica que
// scripts/download-retroarch-cores.mjs usa com import.meta.url.
func defaultManifestPath() string {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		return "internal/install/data/retroarch_cores_manifest.json"
	}
	repoRoot := filepath.Join(filepath.Dir(thisFile), "..", "..")
	return filepath.Join(repoRoot, "internal", "install", "data", "retroarch_cores_manifest.json")
}
