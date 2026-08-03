package library

import (
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

	return found, nil
}

// TitleFromFilename deriva um título de exibição a partir do nome do
// arquivo, removendo a extensão e etiquetas comuns entre parênteses/colchetes
// (região, revisão, código de mídia — ex. "(USA)", "[SLUS-00304]"). É a
// versão mínima que o MVP precisa (decisão de 2026-08-02: sem scraper); L10
// é quem deve refinar isto se etiquetas novas aparecerem na prática.
func TitleFromFilename(path string) string {
	name := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))

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
