-- Um jogo cujo arquivo sumiu do disco entre uma varredura e outra precisa
-- ser marcado como ausente, não apagado em silêncio (o usuário pode ter só
-- desconectado um HD externo) nem exibido como se ainda estivesse lá.
ALTER TABLE library_games ADD COLUMN missing INTEGER NOT NULL DEFAULT 0;
