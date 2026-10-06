-- Print da galeria escolhido como banner do jogo (2026-10-06). Guarda só o
-- nome do arquivo: a galeria tem caminho derivado do console e do nome da
-- ROM (emulator.GameScreenshotsSubdir). Vazio = sem banner, a tela usa a capa.
ALTER TABLE library_games ADD COLUMN banner_name TEXT NOT NULL DEFAULT '';
