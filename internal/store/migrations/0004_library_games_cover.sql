-- A capa de um jogo é um arquivo local já baixado pelo scraper de metadados
-- (IGDB) — o banco guarda só o caminho, nunca a URL de terceiro nem o
-- binário da imagem (mesma regra que Game.Path já trava para a ROM em si).
-- cover_status distingue "nunca tentou" (''), "tentou e o IGDB não achou"
-- ('not_found') e "tentou e falhou" ('error') — sem isso o lote de busca
-- reprocessaria para sempre um jogo que o IGDB genuinamente não tem.
ALTER TABLE library_games ADD COLUMN cover_path TEXT NOT NULL DEFAULT '';
ALTER TABLE library_games ADD COLUMN cover_status TEXT NOT NULL DEFAULT '';
