// Command generate-console-images busca no IGDB a logo oficial de cada
// console do catálogo e escreve internal/verdict/data/console-images/<id>.png
// — as imagens que internal/verdict/images.go embute no binário via
// go:embed.
//
// Não roda em CI nem no build normal, mesmo padrão de
// cmd/generate-retroarch-manifest: precisa de credencial IGDB e acesso de
// rede reais. Uso esperado: o Douglas roda isto à mão, sempre que decidir
// atualizar as imagens — nunca automaticamente.
//
// Decisão que motiva este comando: docs/decisoes.md, "Identidade visual por
// console" (revertido em 2026-09-07) — usar logo oficial é uso de marca de
// terceiro, risco aceito conscientemente pelo dono do produto. `ConsoleIcon`
// (sigla estilizada) continua a reserva na interface para qualquer console
// sem arquivo aqui.
//
// Um console que falhar (IGDB sem essa plataforma, sem platform_logo
// cadastrado, rede indisponível) não derruba o programa: fica sem arquivo, e
// o resumo final lista o que faltou — a interface trata "sem imagem" como
// estado normal (GET /consoles já anuncia has_image), nunca como erro.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/doufl/zeux/internal/igdb"
	"github.com/doufl/zeux/internal/verdict"
)

func main() {
	clientID := flag.String("client-id", os.Getenv("IGDB_CLIENT_ID"), "client_id do IGDB (ou variável IGDB_CLIENT_ID)")
	clientSecret := flag.String("client-secret", os.Getenv("IGDB_CLIENT_SECRET"), "client_secret do IGDB (ou variável IGDB_CLIENT_SECRET)")
	outDir := flag.String("out", defaultImagesDir(), "pasta onde escrever as imagens")
	timeout := flag.Duration("timeout", 30*time.Second, "tempo máximo por requisição")
	force := flag.Bool("force", false, "baixa de novo mesmo o console que já tem arquivo")
	flag.Parse()

	if *clientID == "" || *clientSecret == "" {
		fmt.Fprintln(os.Stderr, "informe -client-id e -client-secret (ou IGDB_CLIENT_ID/IGDB_CLIENT_SECRET) — a mesma credencial pessoal que Configurações > IGDB aceita.")
		os.Exit(1)
	}

	catalog, err := verdict.LoadCatalog()
	if err != nil {
		fmt.Fprintf(os.Stderr, "lendo o catálogo embutido: %v\n", err)
		os.Exit(1)
	}

	if err := os.MkdirAll(*outDir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "criando %s: %v\n", *outDir, err)
		os.Exit(1)
	}

	client := igdb.NewClient(igdb.Credentials{ClientID: *clientID, ClientSecret: *clientSecret})

	var ok, skipped []string
	var failed []string
	for _, console := range catalog.Consoles {
		dest := filepath.Join(*outDir, console.ID+".png")

		if !*force {
			if _, err := os.Stat(dest); err == nil {
				skipped = append(skipped, console.ID)
				continue
			}
		}

		searchName := console.Name
		if alt, ok := igdbNameOverrides[console.ID]; ok {
			searchName = alt
		}

		ctx, cancel := context.WithTimeout(context.Background(), *timeout)
		if err := fetchConsoleImage(ctx, client, searchName, dest); err != nil {
			cancel()
			fmt.Fprintf(os.Stderr, "%s (%q): %v\n", console.ID, searchName, err)
			failed = append(failed, console.ID)
			continue
		}
		cancel()
		ok = append(ok, console.ID)
	}

	fmt.Printf("imagens geradas: %d novas, %d já existiam, %d faltaram, de %d consoles\n",
		len(ok), len(skipped), len(failed), len(catalog.Consoles))
	if len(failed) > 0 {
		fmt.Printf("sem imagem (IGDB não tem a plataforma, sem platform_logo cadastrado, ou falha de rede): %s\n",
			strings.Join(failed, ", "))
		fmt.Println("não é erro fatal — esses consoles continuam mostrando o ícone de sigla na interface.")
	}
}

// igdbNameOverrides existe porque consoles.json usa nomes em português (ou
// com apelidos como "Mega Drive / Genesis") pensados para a interface, e a
// busca do IGDB é por nome de plataforma cadastrado lá, em inglês. Sem isto,
// a busca dá "não encontrado" mesmo quando a plataforma existe no IGDB —
// mapeamento feito à mão conferindo o nome oficial em igdb.com/platforms.
var igdbNameOverrides = map[string]string{
	"arcade":       "Arcade",
	"mastersystem": "Sega Master System/Mark III",
	"pcengine":     "TurboGrafx-16/PC Engine",
	"megadrive":    "Sega Mega Drive/Genesis",
	"ps1":          "PlayStation",
	"virtualboy":   "Virtual Boy",
	"dreamcast":    "Dreamcast",
	"wonderswan":   "WonderSwan",
	"xbox":         "Xbox",
	"xbox360":      "Xbox 360",
	"wii":          "Wii",
	"wiiu":         "Wii U",
}

// fetchConsoleImage busca a plataforma pelo nome e baixa a logo, se existir.
// "não encontrado" (SearchPlatform devolve ok=false, ou a plataforma existe
// mas sem platform_logo) vira erro explícito aqui — só para aparecer no
// resumo final, nunca porque é inesperado.
func fetchConsoleImage(ctx context.Context, client *igdb.Client, name, dest string) error {
	match, found, err := client.SearchPlatform(ctx, name)
	if err != nil {
		return fmt.Errorf("buscando no IGDB: %w", err)
	}
	if !found {
		return fmt.Errorf("nenhuma plataforma chamada %q no IGDB", name)
	}
	if match.ImageID == "" {
		return fmt.Errorf("plataforma %q encontrada, mas sem platform_logo cadastrado", match.Name)
	}

	if err := client.DownloadPlatformLogo(ctx, match.ImageID, dest); err != nil {
		return fmt.Errorf("baixando a logo: %w", err)
	}
	return nil
}

// defaultImagesDir acha internal/verdict/data/console-images a partir da
// localização deste arquivo-fonte, para que o comando funcione não importa
// de onde `go run` seja invocado — mesmo truque de
// cmd/generate-retroarch-manifest.
func defaultImagesDir() string {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		return "internal/verdict/data/console-images"
	}
	repoRoot := filepath.Join(filepath.Dir(thisFile), "..", "..")
	return filepath.Join(repoRoot, "internal", "verdict", "data", "console-images")
}
