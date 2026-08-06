-- Favorito é uma escolha do usuário sobre o jogo, independente do arquivo
-- estar presente agora (missing) ou ter capa (cover_path/cover_status) —
-- coluna própria, mesmo padrão de missing (0003). "Jogado por último" (L11)
-- não resolve quem tem 300 ROMs e joga 8: ordena por acaso recente, não por
-- escolha (docs/roadmap.md, G4).
ALTER TABLE library_games ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
