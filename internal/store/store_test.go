package store

import (
	"path/filepath"
	"testing"
)

// Abrir o banco duas vezes seguidas no mesmo arquivo não pode falhar nem
// tentar reaplicar uma migração já registrada — é o caso normal de reiniciar
// o daemon.
func TestOpenAtIsIdempotentAcrossRestarts(t *testing.T) {
	path := filepath.Join(t.TempDir(), "zeux.db")

	db1, err := OpenAt(path)
	if err != nil {
		t.Fatalf("primeira abertura: %v", err)
	}
	if _, err := db1.Exec(`INSERT INTO sessions (console_id, adapter_id, emulator, rom_path, started_at) VALUES ('ps1', 'duckstation', 'DuckStation', '/jogo.bin', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatalf("gravando na primeira abertura: %v", err)
	}

	var migrationsAfterFirstOpen int
	if err := db1.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&migrationsAfterFirstOpen); err != nil {
		t.Fatalf("lendo schema_migrations na primeira abertura: %v", err)
	}
	if migrationsAfterFirstOpen == 0 {
		t.Fatal("esperava ao menos uma migração registrada")
	}

	if err := db1.Close(); err != nil {
		t.Fatalf("fechando a primeira abertura: %v", err)
	}

	db2, err := OpenAt(path)
	if err != nil {
		t.Fatalf("segunda abertura (reinício simulado): %v", err)
	}
	defer db2.Close()

	var count int
	if err := db2.QueryRow(`SELECT COUNT(*) FROM sessions`).Scan(&count); err != nil {
		t.Fatalf("lendo sessions após reabrir: %v", err)
	}
	if count != 1 {
		t.Errorf("esperava 1 linha sobrevivendo ao reinício, achou %d", count)
	}

	// A prova de idempotência não é um número fixo (o total de migrações
	// cresce a cada nova migração adicionada ao pacote) — é que reabrir não
	// tentou reaplicar nenhuma: o total não muda entre as duas aberturas.
	var migrationsAfterSecondOpen int
	if err := db2.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&migrationsAfterSecondOpen); err != nil {
		t.Fatalf("lendo schema_migrations na segunda abertura: %v", err)
	}
	if migrationsAfterSecondOpen != migrationsAfterFirstOpen {
		t.Errorf("total de migrações mudou ao reabrir: %d -> %d", migrationsAfterFirstOpen, migrationsAfterSecondOpen)
	}
}

// O schema precisa existir logo após Open — sem isso, o primeiro INSERT de
// qualquer repositório falharia com "no such table".
func TestOpenAtAppliesSchema(t *testing.T) {
	path := filepath.Join(t.TempDir(), "zeux.db")

	db, err := OpenAt(path)
	if err != nil {
		t.Fatalf("OpenAt: %v", err)
	}
	defer db.Close()

	var name string
	err = db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'`).Scan(&name)
	if err != nil {
		t.Fatalf("tabela sessions não existe após a migração: %v", err)
	}
}
