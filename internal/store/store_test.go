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

// Trava a atualização de um banco que JÁ EXISTE — o caso de quem já usava o
// ZeuX e instala uma versão nova, não o do primeiro uso. Simula isso removendo
// a migração mais recente (tabela e registro) de um banco já migrado e
// reabrindo: é exatamente o que acontece na máquina de quem atualiza.
//
// Escrito ao preparar a instalação da Sprint Q (2026-08-28), que trouxe a
// migração 0006: um banco que não aceitasse a migração nova deixaria o app
// sem subir, e isso não aparece em nenhum teste que só abre banco novo.
func TestOpenAtAplicaMigracaoNovaEmBancoExistente(t *testing.T) {
	path := filepath.Join(t.TempDir(), "zeux.db")

	db, err := OpenAt(path)
	if err != nil {
		t.Fatalf("primeira abertura: %v", err)
	}

	// Volta o banco ao estado anterior à última migração.
	const ultima = "0006_emulator_user_config.sql"
	if _, err := db.Exec(`DROP TABLE emulator_user_config`); err != nil {
		t.Fatalf("removendo a tabela da última migração: %v", err)
	}
	if _, err := db.Exec(`DELETE FROM schema_migrations WHERE name = ?`, ultima); err != nil {
		t.Fatalf("removendo o registro da migração: %v", err)
	}
	db.Close()

	// Reabrir precisa reaplicar só o que falta, sem tropeçar no que já existe.
	db, err = OpenAt(path)
	if err != nil {
		t.Fatalf("reabertura do banco existente: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`INSERT INTO emulator_user_config (adapter_id, set_at) VALUES ('pcsx2', '2026-08-28')`); err != nil {
		t.Fatalf("a tabela da migração nova não voltou: %v", err)
	}

	// E os dados das migrações antigas continuam de pé — reaplicar não pode
	// recriar tabela que já tinha conteúdo.
	var tabelas int
	if err := db.QueryRow(
		`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('sessions', 'library_folders', 'library_games')`,
	).Scan(&tabelas); err != nil {
		t.Fatalf("conferindo as tabelas antigas: %v", err)
	}
	if tabelas != 3 {
		t.Errorf("tabelas antigas presentes = %d, esperava 3", tabelas)
	}
}
