-- "Remover jogo da biblioteca" (2026-09-09, a pedido do Douglas): ocultar
-- permanentemente um jogo que o usuário não quer ver na lista, sem apagar o
-- arquivo no disco (o ZeuX nunca toca a ROM) e sem que ele reapareça no
-- próximo rescan automático. Um DELETE da linha não serviria: SyncFolder
-- regrava todo caminho encontrado na varredura seguinte, então o jogo
-- voltaria sozinho. A flag sobrevive à varredura; o filtro "mostrar ocultos"
-- da tela é o caminho de volta (mesma ideia de `missing`, migração 0003).
ALTER TABLE library_games ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0;
