// Package store abre e migra o banco SQLite local do ZeuX.
//
// O driver é modernc.org/sqlite — puro Go, sem CGO — para que a compilação
// cruzada continue sendo só `go build`, em qualquer SO, sem exigir um
// compilador C na máquina de quem compila. Ver ADR 0011
// (docs/decisoes/0011-sqlite-local-para-biblioteca.md), que substitui o
// adiamento do ADR 0002.
//
// O banco fica no diretório de configuração do usuário, ao lado de
// consent.json e custom_emulators.json — nunca embutido no binário, porque
// isso é dado do usuário, não dado de leitura do app.
package store

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// FileName é o nome do arquivo do banco dentro do diretório de configuração.
const FileName = "zeux.db"

// Path devolve onde o banco deve morar.
func Path() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("localizando diretório de configuração: %w", err)
	}

	appDir := filepath.Join(dir, "ZeuX")
	if err := os.MkdirAll(appDir, 0o755); err != nil {
		return "", fmt.Errorf("criando diretório de configuração: %w", err)
	}

	return filepath.Join(appDir, FileName), nil
}

// Open abre o banco no caminho padrão e aplica as migrações pendentes.
func Open() (*sql.DB, error) {
	path, err := Path()
	if err != nil {
		return nil, err
	}
	return OpenAt(path)
}

// OpenAt abre o banco num caminho específico. Existe separado de Open para
// que os testes apontem para um arquivo num diretório temporário em vez do
// diretório de configuração real do usuário.
func OpenAt(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("abrindo o banco: %w", err)
	}

	// SQLite só aceita um escritor por vez. Sem isso, duas goroutines
	// escrevendo ao mesmo tempo (ex.: duas sessões terminando juntas)
	// devolveriam "database is locked" em vez de serializar as escritas —
	// o app já é local e de um usuário só, então serializar não é gargalo.
	db.SetMaxOpenConns(1)

	if _, err := db.Exec(`PRAGMA foreign_keys = ON`); err != nil {
		db.Close()
		return nil, fmt.Errorf("ativando foreign_keys: %w", err)
	}

	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrando o banco: %w", err)
	}

	return db, nil
}

// migrate aplica, em ordem, cada migração que ainda não foi registrada em
// schema_migrations. O nome do arquivo é a chave: "0001_sessions.sql" só
// roda uma vez, mesmo que o processo reinicie entre uma migração e outra.
func migrate(db *sql.DB) error {
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY,
			applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`); err != nil {
		return err
	}

	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return err
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	sort.Strings(names)

	for _, name := range names {
		var applied int
		if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE name = ?`, name).Scan(&applied); err != nil {
			return fmt.Errorf("checando migração %s: %w", name, err)
		}
		if applied > 0 {
			continue
		}

		// embed.FS (e fs.FS em geral) usa sempre "/", mesmo no Windows.
		// filepath.Join geraria "migrations\0001_...." e o ReadFile falharia
		// com "file does not exist" — o zeuxd nunca chegava a escutar a
		// porta e a UI ficava em "lendo o consentimento…" (issue #6).
		sqlBytes, err := migrationsFS.ReadFile(path.Join("migrations", name))
		if err != nil {
			return err
		}

		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(string(sqlBytes)); err != nil {
			tx.Rollback()
			return fmt.Errorf("aplicando migração %s: %w", name, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations (name) VALUES (?)`, name); err != nil {
			tx.Rollback()
			return fmt.Errorf("registrando migração %s: %w", name, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("efetivando migração %s: %w", name, err)
		}
	}

	return nil
}
