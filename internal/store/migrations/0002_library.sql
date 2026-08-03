-- Pastas de ROM apontadas pelo usuário, uma por console (decisão de
-- 2026-08-02: pasta por console, não arquivo avulso — sem isso o ZeuX teria
-- que adivinhar de qual sistema é cada arquivo achado numa pasta misturada).
--
-- UNIQUE(console_id, path) é o que faz apontar a mesma pasta duas vezes não
-- duplicar nada — internal/library.AddFolder depende disso para ser
-- idempotente.
CREATE TABLE library_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    console_id TEXT NOT NULL,
    path TEXT NOT NULL,
    added_at TEXT NOT NULL,
    UNIQUE (console_id, path)
);

-- Entradas de jogo encontradas na varredura de uma pasta. "path" é uma
-- REFERÊNCIA ao arquivo que já está no disco do usuário — nunca uma cópia
-- (ADR 0010, ADR 0011, e a regra legal do CLAUDE.md sobre nunca facilitar
-- transferência de ROM). Nenhuma coluna desta tabela guarda conteúdo de
-- arquivo, só caminho e metadado derivado do nome.
--
-- ON DELETE CASCADE em folder_id é o que faz remover uma pasta remover só os
-- jogos que vieram dela, sem exigir uma segunda instrução em quem chama.
CREATE TABLE library_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id INTEGER NOT NULL REFERENCES library_folders(id) ON DELETE CASCADE,
    console_id TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    added_at TEXT NOT NULL
);

CREATE INDEX idx_library_games_console_id ON library_games(console_id);
CREATE INDEX idx_library_games_folder_id ON library_games(folder_id);
