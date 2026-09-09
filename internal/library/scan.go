package library

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// maxScanDepth limita quantos níveis de subpasta a varredura desce a partir
// da pasta apontada. Sem limite, um usuário que aponta uma pasta alta demais
// na árvore (por engano, ou porque organiza tudo dentro de uma única "Jogos")
// faria o ZeuX varrer uma árvore de tamanho imprevisível a cada scan. Games
// costumam ficar no máximo 2-3 níveis abaixo da pasta do console (ex.:
// "ps1/discos/jogo 1/jogo.cue"), então 4 dá folga sem abrir a porta para uma
// varredura sem fim.
const maxScanDepth = 4

// FindROMs varre root (e suas subpastas, até maxScanDepth) procurando
// arquivos cuja extensão bate com extensions (comparação sem diferenciar
// maiúsculas/minúsculas). Devolve caminhos absolutos.
//
// Esta função só lê o sistema de arquivos — nunca escreve, copia, move nem
// renomeia nada. É o que garante que apontar uma pasta não move a coleção do
// usuário para dentro da estrutura gerenciada do ZeuX (ADR 0010, ADR 0011).
func FindROMs(root string, extensions []string) ([]string, error) {
	if len(extensions) == 0 {
		return nil, fmt.Errorf("nenhuma extensão informada para a varredura")
	}

	wanted := make(map[string]bool, len(extensions))
	for _, ext := range extensions {
		wanted["."+strings.ToLower(ext)] = true
	}

	rootDepth := strings.Count(filepath.Clean(root), string(filepath.Separator))

	var found []string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			// Uma subpasta sem permissão de leitura não pode derrubar a
			// varredura inteira — pula e continua com o resto da árvore.
			if entry != nil && entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		if entry.IsDir() {
			if path == root {
				return nil
			}
			depth := strings.Count(filepath.Clean(path), string(filepath.Separator)) - rootDepth
			if depth >= maxScanDepth {
				return filepath.SkipDir
			}
			return nil
		}

		if wanted[strings.ToLower(filepath.Ext(path))] {
			found = append(found, path)
		}

		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("varrendo %s: %w", root, err)
	}

	return filterShadowedDiscTracks(found), nil
}

// Formatos de disco óptico que são só o "índice" — o arquivo que o emulador
// abre — e apontam para as faixas de dados ao lado (`.cue` -> `.bin`,
// `.m3u` -> vários `.cue`/`.chd`, `.ccd` -> `.img`/`.sub`, `.gdi` -> faixas).
var discIndexExts = map[string]bool{".cue": true, ".m3u": true, ".ccd": true, ".gdi": true}

// Formatos que costumam ser só faixa de dados de um disco descrito por um
// índice acima — nunca o que o usuário quer ver como "um jogo" quando o
// índice está presente na mesma pasta.
var discTrackExts = map[string]bool{".bin": true, ".img": true, ".iso": true, ".sub": true, ".mdf": true, ".raw": true}

// filterShadowedDiscTracks tira do resultado as faixas de dados de um disco
// quando o arquivo-índice correspondente está ao lado (o caso do PS1 em
// `.bin`+`.cue`: só o `.cue` é jogável, e era ele que devia aparecer — os
// dois entravam como jogos separados). Regras, todas restritas a arquivos da
// **mesma pasta**:
//
//   - Todo caminho listado dentro de um `.m3u` (playlist de multi-disco)
//     some da biblioteca: o `.m3u` é a entrada única.
//   - Todo arquivo `FILE "..."` citado dentro de um `.cue`/`.ccd` some.
//   - Como rede de segurança para um `.cue` que não pôde ser lido: um `.bin`
//     de mesmo nome-base que um `.cue` irmão também some.
//
// Um `.chd`/`.pbp` (imagem única, sem faixa solta) nunca é afetado, a menos
// que apareça citado num `.m3u`. Se não houver nenhum índice na varredura, a
// função devolve a lista intacta — consoles que não usam disco não pagam
// nada por isto.
func filterShadowedDiscTracks(paths []string) []string {
	hasIndex, hasTrack := false, false
	for _, p := range paths {
		ext := strings.ToLower(filepath.Ext(p))
		if discIndexExts[ext] {
			hasIndex = true
		}
		if discTrackExts[ext] {
			hasTrack = true
		}
	}
	if !hasIndex || !hasTrack {
		return paths
	}

	// Chave: pasta + nome de arquivo em minúsculas (Windows não diferencia
	// maiúsculas; a comparação precisa acompanhar).
	shadowed := make(map[string]bool)
	mark := func(dir, name string) {
		shadowed[dir+"\x00"+strings.ToLower(name)] = true
	}

	for _, p := range paths {
		ext := strings.ToLower(filepath.Ext(p))
		if !discIndexExts[ext] {
			continue
		}
		dir := filepath.Dir(p)
		for _, ref := range referencedFiles(p, ext) {
			// Só sombreia arquivo na mesma pasta — um `.cue` nunca deveria
			// apontar para fora dela, e um `.m3u` que aponte para outra
			// pasta é raro o bastante para não valer o risco.
			mark(dir, filepath.Base(ref))
		}
	}

	// Rede de segurança: `.bin` com `.cue` irmão de mesmo nome-base, mesmo
	// que a leitura do `.cue` não tenha rendido nada.
	cueBase := make(map[string]bool)
	for _, p := range paths {
		if strings.ToLower(filepath.Ext(p)) == ".cue" {
			cueBase[filepath.Dir(p)+"\x00"+strings.ToLower(RawBaseName(p))] = true
		}
	}
	for _, p := range paths {
		if strings.ToLower(filepath.Ext(p)) != ".bin" {
			continue
		}
		if cueBase[filepath.Dir(p)+"\x00"+strings.ToLower(RawBaseName(p))] {
			mark(filepath.Dir(p), filepath.Base(p))
		}
	}

	if len(shadowed) == 0 {
		return paths
	}

	kept := paths[:0:0]
	for _, p := range paths {
		if shadowed[filepath.Dir(p)+"\x00"+strings.ToLower(filepath.Base(p))] {
			continue
		}
		kept = append(kept, p)
	}
	return kept
}

// referencedFiles lê um arquivo-índice de disco e devolve os nomes de arquivo
// que ele cita. `.cue`/`.ccd`: linhas `FILE "nome" TIPO`. `.m3u`: uma linha
// por caminho (ignora linhas em branco e comentários `#`). `.gdi`: a primeira
// coluna após o número da faixa é o nome do arquivo. Falha de leitura devolve
// lista vazia — a rede de segurança de nome-base cobre o caso comum.
func referencedFiles(indexPath, ext string) []string {
	f, err := os.Open(indexPath)
	if err != nil {
		return nil
	}
	defer f.Close()

	var refs []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		switch ext {
		case ".m3u":
			refs = append(refs, filepath.FromSlash(line))
		case ".cue", ".ccd":
			upper := strings.ToUpper(line)
			if !strings.HasPrefix(upper, "FILE ") {
				continue
			}
			rest := strings.TrimSpace(line[len("FILE "):])
			if i := strings.Index(rest, "\""); i >= 0 {
				if j := strings.Index(rest[i+1:], "\""); j >= 0 {
					refs = append(refs, rest[i+1:i+1+j])
					continue
				}
			}
			// Sem aspas: o nome vai até o último espaço (o token final é o tipo).
			if i := strings.LastIndex(rest, " "); i > 0 {
				refs = append(refs, rest[:i])
			}
		case ".gdi":
			fields := strings.Fields(line)
			if len(fields) >= 5 {
				// faixa lba tipo setor NOME ...
				refs = append(refs, fields[4])
			}
		}
	}
	return refs
}

// RawBaseName devolve o nome do arquivo sem a pasta nem a extensão, mas
// preservando etiquetas entre parênteses/colchetes (região, revisão, código
// de mídia) — ao contrário de TitleFromFilename, que as remove para exibir
// ao usuário. Extraído para uso em internal/igdb/thumbnails.go: o
// libretro-thumbnails indexa a capa pelo nome de arquivo completo em
// convenção No-Intro (ex. "Super Mario Bros. (World)"), etiqueta incluída —
// removê-la faria a busca por lá nunca bater com nada.
func RawBaseName(path string) string {
	return strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
}

// TitleFromFilename deriva um título de exibição a partir do nome do
// arquivo, removendo a extensão e etiquetas comuns entre parênteses/colchetes
// (região, revisão, código de mídia — ex. "(USA)", "[SLUS-00304]"). É a
// versão mínima que o MVP precisa (decisão de 2026-08-02: sem scraper); L10
// é quem deve refinar isto se etiquetas novas aparecerem na prática.
func TitleFromFilename(path string) string {
	name := RawBaseName(path)

	var cleaned strings.Builder
	depth := 0
	for _, r := range name {
		switch r {
		case '(', '[':
			depth++
		case ')', ']':
			if depth > 0 {
				depth--
			}
		default:
			if depth == 0 {
				cleaned.WriteRune(r)
			}
		}
	}

	return strings.TrimSpace(strings.Join(strings.Fields(cleaned.String()), " "))
}
