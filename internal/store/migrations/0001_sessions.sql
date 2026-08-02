-- Sessão de jogo: uma execução acompanhada do processo do emulador, do
-- momento em que abre até o momento em que fecha. Ver
-- internal/emulator/session_store.go.
--
-- "seq" é o rowid autoincrement do SQLite, não um id de aplicação: o ID
-- externo ("s1", "s2"...) é formatado a partir dele (formatSessionID), para
-- que sobreviva a um reinício do daemon sem colidir com sessões gravadas
-- antes dele — um contador em memória reiniciaria do zero e duplicaria IDs.
CREATE TABLE sessions (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    console_id TEXT NOT NULL,
    adapter_id TEXT NOT NULL,
    emulator TEXT NOT NULL,
    rom_path TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    exit_error TEXT NOT NULL DEFAULT '',
    unapplied TEXT NOT NULL DEFAULT '[]'
);

-- Launcher.Playtime soma sobre esta coluna a cada chamada; sem índice, isso
-- seria uma varredura completa da tabela toda vez que o perfil pedir o total.
CREATE INDEX idx_sessions_console_id ON sessions(console_id);
