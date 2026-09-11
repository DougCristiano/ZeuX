package emulator

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// SaveDataDirs é onde um adapter grava memory cards e save states nesta
// máquina. Os dois campos vêm vazios ("", false) quando o local não foi
// verificado contra um binário real — mesma regra de BiosDir
// (bios_dir.go): uma pasta errada é pior que nenhuma, porque o usuário para
// de procurar. Isto é o princípio 4 do CLAUDE.md aplicado a save de jogo, e
// não a hardware: dado não verificado sai declarado como desconhecido, nunca
// chutado.
type SaveDataDirs struct {
	AdapterID      string `json:"adapter_id"`
	MemoryCardsDir string `json:"memory_cards_dir,omitempty"`
	SaveStatesDir  string `json:"save_states_dir,omitempty"`
	Known          bool   `json:"known"`
}

// SaveFile é uma entrada dentro de um dos diretórios de SaveDataDirs — sem
// tentativa de casar com um jogo específico da biblioteca, porque o nome de
// arquivo que cada emulador usa para isso não foi confirmado (ver o doc
// comment de ResolveSaveDataDirs). É inspeção, não gerência: o ZeuX mostra o
// que existe na pasta, não decide o que apagar.
type SaveFile struct {
	Name       string    `json:"name"`
	SizeBytes  int64     `json:"size_bytes"`
	ModifiedAt time.Time `json:"modified_at"`
}

// ResolveSaveDataDirs devolve onde procurar save de um adapter, quando já
// verificado ao vivo ou lido de dentro da própria config do emulador —
// PCSX2 e RetroArch.
//
// PCSX2 (ps2): pcsx2DataDir() já é fato observado, não convenção — medido
// contra o PCSX2 v2.8.2 real no Windows em 2026-09-11 (comentário de
// pcsx2DataDir, pcsx2_config.go), e o mesmo teste viu o binário criar
// "memcards" e "sstates" dentro dessa pasta ao rodar um jogo de verdade. Por
// isso os dois nomes de subpasta abaixo são citação do que foi visto, não
// palpite.
//
// RetroArch: diferente do PCSX2, aqui não há palpite nenhum — o ZeuX lê
// "savefile_directory"/"savestate_directory" direto do retroarch.cfg real
// deste `install` (mesmo arquivo que retroArchReadConfig/WriteConfig já
// editam), via retroArchSaveDataDirs. Known só vira true quando o próprio
// RetroArch tem um caminho fixo gravado ali — quando a chave está ausente
// ou vale "default" (o sentinela que o RetroArch documenta no próprio
// arquivo-modelo para "salvar ao lado do jogo"), não existe uma pasta única
// para mostrar, e a resposta certa é dizer isso, não inventar uma.
//
// Todo o resto (DuckStation, Dolphin, PPSSPP...) devolve Known=false: cada
// um guarda save num lugar e formato diferentes, e nenhum foi confirmado
// rodando o binário de verdade como o PCSX2 foi. Adicionar um adapter aqui
// exige o mesmo método: executar o emulador de verdade, fotografar
// antes/depois, documentar em decisoes.md — nunca supor pelo nome do
// arquivo de config.
func ResolveSaveDataDirs(adapterID string, install Installation) SaveDataDirs {
	switch adapterID {
	case "pcsx2":
		dir, err := pcsx2DataDir()
		if err != nil {
			return SaveDataDirs{AdapterID: adapterID}
		}
		return SaveDataDirs{
			AdapterID:      adapterID,
			MemoryCardsDir: filepath.Join(dir, "memcards"),
			SaveStatesDir:  filepath.Join(dir, "sstates"),
			Known:          true,
		}
	case "retroarch":
		path, err := retroArchConfigPath(install)
		if err != nil {
			return SaveDataDirs{AdapterID: adapterID}
		}
		return retroArchSaveDataDirs(adapterID, path)
	default:
		return SaveDataDirs{AdapterID: adapterID}
	}
}

// ListSaveFiles lista os arquivos direto dentro de dir (sem descer
// subpastas — memcards e sstates do PCSX2 são achatados), do mais recente
// para o mais antigo. Pasta ausente devolve lista vazia, não erro: é o
// estado normal de quem nunca salvou nada ali ainda.
func ListSaveFiles(dir string) ([]SaveFile, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("lendo %s: %w", dir, err)
	}

	files := make([]SaveFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		files = append(files, SaveFile{
			Name:       entry.Name(),
			SizeBytes:  info.Size(),
			ModifiedAt: info.ModTime(),
		})
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].ModifiedAt.After(files[j].ModifiedAt)
	})
	return files, nil
}
