// Package library persiste as pastas de ROM que o usuário apontou e os jogos
// encontrados nelas — o alicerce da Sprint D (docs/roadmap.md, item L1).
//
// Duas regras não-negociáveis do CLAUDE.md moldam este pacote inteiro: o ZeuX
// nunca copia, distribui ou facilita transferência de ROM, e um dado que não
// pôde ser confirmado é declarado como tal, nunca fingido. Por isso Game.Path
// é sempre uma referência a um arquivo que já está no disco do usuário — este
// pacote nunca lê, copia nem move o conteúdo desse arquivo — e um jogo cujo
// arquivo sumiu de uma varredura para a outra fica marcado em Game.Missing,
// nunca apagado em silêncio nem exibido como se ainda estivesse lá.
package library

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// Folder é uma pasta de ROM que o usuário apontou para um console.
type Folder struct {
	ID        int64     `json:"id"`
	ConsoleID string    `json:"console_id"`
	Path      string    `json:"path"`
	AddedAt   time.Time `json:"added_at"`
}

// Game é uma entrada encontrada na varredura de uma Folder. Path aponta para
// o arquivo no disco do usuário — nunca uma cópia.
type Game struct {
	ID        int64     `json:"id"`
	FolderID  int64     `json:"folder_id"`
	ConsoleID string    `json:"console_id"`
	Path      string    `json:"path"`
	Title     string    `json:"title"`
	AddedAt   time.Time `json:"added_at"`

	// Missing é true quando uma varredura mais recente não achou mais o
	// arquivo neste caminho — o usuário pode ter movido, apagado, ou só
	// desconectado o disco onde ele estava. A entrada continua existindo em
	// vez de sumir, porque o tempo de jogo já registrado (D3) referencia este
	// jogo pelo caminho.
	Missing bool `json:"missing"`
}

// NewGame é o que a varredura (L2) precisa fornecer para gravar uma entrada;
// separado de Game porque ID, FolderID e AddedAt são responsabilidade do
// Store, não de quem varre a pasta.
type NewGame struct {
	ConsoleID string
	Path      string
	Title     string
}

// Store persiste pastas e jogos no banco local (ver internal/store).
type Store struct {
	db *sql.DB
}

// NewStore cria o repositório sobre um banco já aberto e migrado
// (internal/store.Open ou internal/store.OpenAt).
func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// AddFolder grava a pasta, ou devolve a que já existia — apontar a mesma
// pasta duas vezes para o mesmo console não pode criar uma segunda linha,
// nem duplicar os jogos que a próxima varredura encontrar nela.
func (s *Store) AddFolder(ctx context.Context, consoleID, path string) (Folder, error) {
	existing, err := s.folderByPath(ctx, consoleID, path)
	if err != nil {
		return Folder{}, err
	}
	if existing != nil {
		return *existing, nil
	}

	addedAt := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, `
		INSERT INTO library_folders (console_id, path, added_at) VALUES (?, ?, ?)
	`, consoleID, path, addedAt.Format(time.RFC3339Nano))
	if err != nil {
		return Folder{}, fmt.Errorf("gravando pasta: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return Folder{}, fmt.Errorf("lendo o id da pasta gravada: %w", err)
	}

	return Folder{ID: id, ConsoleID: consoleID, Path: path, AddedAt: addedAt}, nil
}

func (s *Store) folderByPath(ctx context.Context, consoleID, path string) (*Folder, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, console_id, path, added_at FROM library_folders
		WHERE console_id = ? AND path = ?
	`, consoleID, path)

	var (
		folder  Folder
		addedAt string
	)
	if err := row.Scan(&folder.ID, &folder.ConsoleID, &folder.Path, &addedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("procurando pasta existente: %w", err)
	}

	parsed, err := time.Parse(time.RFC3339Nano, addedAt)
	if err != nil {
		return nil, fmt.Errorf("interpretando added_at da pasta %d: %w", folder.ID, err)
	}
	folder.AddedAt = parsed

	return &folder, nil
}

// FolderByID devolve a pasta pelo identificador, ou false se não existir —
// usado para reencontrar console e caminho antes de repetir uma varredura.
func (s *Store) FolderByID(ctx context.Context, id int64) (Folder, bool, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, console_id, path, added_at FROM library_folders WHERE id = ?
	`, id)

	var (
		folder  Folder
		addedAt string
	)
	if err := row.Scan(&folder.ID, &folder.ConsoleID, &folder.Path, &addedAt); err != nil {
		if err == sql.ErrNoRows {
			return Folder{}, false, nil
		}
		return Folder{}, false, fmt.Errorf("procurando a pasta %d: %w", id, err)
	}

	parsed, err := time.Parse(time.RFC3339Nano, addedAt)
	if err != nil {
		return Folder{}, false, fmt.Errorf("interpretando added_at da pasta %d: %w", folder.ID, err)
	}
	folder.AddedAt = parsed

	return folder, true, nil
}

// ListFolders devolve todas as pastas apontadas, das mais recentes para as
// mais antigas.
func (s *Store) ListFolders(ctx context.Context) ([]Folder, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, console_id, path, added_at FROM library_folders ORDER BY id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("lendo pastas: %w", err)
	}
	defer rows.Close()

	var folders []Folder
	for rows.Next() {
		var (
			folder  Folder
			addedAt string
		)
		if err := rows.Scan(&folder.ID, &folder.ConsoleID, &folder.Path, &addedAt); err != nil {
			return nil, fmt.Errorf("lendo linha de pasta: %w", err)
		}
		parsed, err := time.Parse(time.RFC3339Nano, addedAt)
		if err != nil {
			return nil, fmt.Errorf("interpretando added_at da pasta %d: %w", folder.ID, err)
		}
		folder.AddedAt = parsed
		folders = append(folders, folder)
	}

	return folders, rows.Err()
}

// RemoveFolder apaga a pasta e, por ON DELETE CASCADE (internal/store,
// migração 0002), só os jogos que vieram dela — nunca o arquivo no disco do
// usuário, só a referência guardada no banco.
func (s *Store) RemoveFolder(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM library_folders WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("removendo pasta %d: %w", id, err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("confirmando remoção da pasta %d: %w", id, err)
	}
	if affected == 0 {
		return fmt.Errorf("nenhuma pasta com o id %d", id)
	}

	return nil
}

// SaveGames grava os jogos encontrados numa varredura de folderID. Um jogo
// com o mesmo Path de um já gravado tem só o título atualizado e volta a
// `missing = 0` — reaparecer no mesmo caminho desfaz o estado de ausente
// sem criar uma segunda linha.
func (s *Store) SaveGames(ctx context.Context, folderID int64, games []NewGame) error {
	if len(games) == 0 {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("iniciando gravação dos jogos: %w", err)
	}
	defer tx.Rollback()

	addedAt := time.Now().UTC().Format(time.RFC3339Nano)
	for _, game := range games {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO library_games (folder_id, console_id, path, title, added_at, missing)
			VALUES (?, ?, ?, ?, ?, 0)
			ON CONFLICT (path) DO UPDATE SET title = excluded.title, missing = 0
		`, folderID, game.ConsoleID, game.Path, game.Title, addedAt); err != nil {
			return fmt.Errorf("gravando o jogo %q: %w", game.Path, err)
		}
	}

	return tx.Commit()
}

// SyncFolder reconcilia o resultado de uma varredura com o que já estava
// gravado para folderID: grava os jogos encontrados (via SaveGames) e marca
// como ausente (Missing) qualquer jogo desta pasta que não apareceu na lista
// — nunca apaga a entrada, porque tempo de jogo (D3) referencia o jogo pelo
// caminho, e um HD externo desconectado não deveria custar esse histórico.
func (s *Store) SyncFolder(ctx context.Context, folderID int64, found []NewGame) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("iniciando sincronização da pasta %d: %w", folderID, err)
	}
	defer tx.Rollback()

	foundPaths := make(map[string]bool, len(found))
	addedAt := time.Now().UTC().Format(time.RFC3339Nano)
	for _, game := range found {
		foundPaths[game.Path] = true
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO library_games (folder_id, console_id, path, title, added_at, missing)
			VALUES (?, ?, ?, ?, ?, 0)
			ON CONFLICT (path) DO UPDATE SET title = excluded.title, missing = 0
		`, folderID, game.ConsoleID, game.Path, game.Title, addedAt); err != nil {
			return fmt.Errorf("gravando o jogo %q: %w", game.Path, err)
		}
	}

	rows, err := tx.QueryContext(ctx, `SELECT id, path FROM library_games WHERE folder_id = ?`, folderID)
	if err != nil {
		return fmt.Errorf("lendo jogos existentes da pasta %d: %w", folderID, err)
	}

	var staleIDs []int64
	for rows.Next() {
		var (
			id   int64
			path string
		)
		if err := rows.Scan(&id, &path); err != nil {
			rows.Close()
			return fmt.Errorf("lendo linha ao reconciliar a pasta %d: %w", folderID, err)
		}
		if !foundPaths[path] {
			staleIDs = append(staleIDs, id)
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, id := range staleIDs {
		if _, err := tx.ExecContext(ctx, `UPDATE library_games SET missing = 1 WHERE id = ?`, id); err != nil {
			return fmt.Errorf("marcando o jogo %d como ausente: %w", id, err)
		}
	}

	return tx.Commit()
}

// ListAllGames devolve os jogos de todos os consoles juntos, dos mais
// recentes para os mais antigos, opcionalmente filtrados por título. Existe
// separado de ListGames porque a tela "Todos os jogos" (2026-08-04) precisa
// listar sem escolher console primeiro. Sem paginação aqui de propósito: a
// ordenação que importa para o usuário é por último jogado, não por id —
// isso só é calculável depois de juntar com as sessões (que este pacote não
// conhece, ver docs/arquitetura-a-preservar.md), então a paginação de
// verdade acontece em internal/api, depois dessa junção e ordenação. Paginar
// aqui, antes da ordenação certa, devolveria páginas com jogos fora de
// ordem.
//
// query vazia devolve todos os jogos; caso contrário filtra por título,
// sem diferenciar maiúsculas/minúsculas (2026-08-04, busca da tela
// "Todos os jogos" — precisa achar o jogo em qualquer página, não só na
// carregada, por isso o filtro é no SQL, não no cliente).
func (s *Store) ListAllGames(ctx context.Context, query string) ([]Game, error) {
	var (
		rows *sql.Rows
		err  error
	)
	if query == "" {
		rows, err = s.db.QueryContext(ctx, `
			SELECT id, folder_id, console_id, path, title, added_at, missing
			FROM library_games
			ORDER BY id DESC
		`)
	} else {
		rows, err = s.db.QueryContext(ctx, `
			SELECT id, folder_id, console_id, path, title, added_at, missing
			FROM library_games
			WHERE title LIKE ? ESCAPE '\'
			ORDER BY id DESC
		`, "%"+escapeLike(query)+"%")
	}
	if err != nil {
		return nil, fmt.Errorf("lendo jogos: %w", err)
	}
	defer rows.Close()

	var games []Game
	for rows.Next() {
		var (
			game    Game
			addedAt string
			missing int
		)
		if err := rows.Scan(&game.ID, &game.FolderID, &game.ConsoleID, &game.Path, &game.Title, &addedAt, &missing); err != nil {
			return nil, fmt.Errorf("lendo linha de jogo: %w", err)
		}
		parsed, err := time.Parse(time.RFC3339Nano, addedAt)
		if err != nil {
			return nil, fmt.Errorf("interpretando added_at do jogo %d: %w", game.ID, err)
		}
		game.AddedAt = parsed
		game.Missing = missing != 0
		games = append(games, game)
	}

	return games, rows.Err()
}

// escapeLike escapa os curingas do SQLite LIKE (`%`, `_`) e o próprio
// caractere de escape (`\`) num termo de busca digitado pelo usuário, para
// que um título com "%" ou "_" de verdade não vire um curinga por acidente.
func escapeLike(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, "%", `\%`)
	s = strings.ReplaceAll(s, "_", `\_`)
	return s
}

// ListGames devolve os jogos de um console, dos mais recentes para os mais
// antigos.
func (s *Store) ListGames(ctx context.Context, consoleID string) ([]Game, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, folder_id, console_id, path, title, added_at, missing
		FROM library_games
		WHERE console_id = ?
		ORDER BY id DESC
	`, consoleID)
	if err != nil {
		return nil, fmt.Errorf("lendo jogos: %w", err)
	}
	defer rows.Close()

	var games []Game
	for rows.Next() {
		var (
			game    Game
			addedAt string
			missing int
		)
		if err := rows.Scan(&game.ID, &game.FolderID, &game.ConsoleID, &game.Path, &game.Title, &addedAt, &missing); err != nil {
			return nil, fmt.Errorf("lendo linha de jogo: %w", err)
		}
		parsed, err := time.Parse(time.RFC3339Nano, addedAt)
		if err != nil {
			return nil, fmt.Errorf("interpretando added_at do jogo %d: %w", game.ID, err)
		}
		game.AddedAt = parsed
		game.Missing = missing != 0
		games = append(games, game)
	}

	return games, rows.Err()
}
