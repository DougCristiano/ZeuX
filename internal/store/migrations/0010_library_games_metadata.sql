-- Informações do jogo vindas do IGDB (2026-09-28, a pedido do Douglas): ano
-- de lançamento, resumo, gêneros e desenvolvedora. Separadas da capa de
-- propósito — a capa pode vir do libretro-thumbnails (sem conta), mas só o
-- IGDB tem estes dados; antes, o IGDB só era consultado quando o libretro
-- não achava a capa, e mesmo então o ano era descartado.
--
-- `metadata_status` segue a mesma ideia de `cover_status`: '' = nunca
-- tentou, 'found', 'not_found' ou 'error' — sem ele o lote reconsultaria
-- para sempre um jogo que o IGDB não tem. `genres` é um array JSON de nomes
-- (o IGDB tem gêneros com vírgula no nome, então texto separado por vírgula
-- não serviria). Zero/vazio = desconhecido, nunca um valor inventado.
ALTER TABLE library_games ADD COLUMN release_year INTEGER NOT NULL DEFAULT 0;
ALTER TABLE library_games ADD COLUMN summary TEXT NOT NULL DEFAULT '';
ALTER TABLE library_games ADD COLUMN genres TEXT NOT NULL DEFAULT '[]';
ALTER TABLE library_games ADD COLUMN developer TEXT NOT NULL DEFAULT '';
ALTER TABLE library_games ADD COLUMN metadata_status TEXT NOT NULL DEFAULT '';
