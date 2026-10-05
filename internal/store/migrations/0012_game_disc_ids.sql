-- Serial e CRC do disco de cada jogo, como o emulador os viu (2026-10-05).
-- O PCSX2 nomeia os save states por "<serial> (<CRC>)", e o ZeuX não lê o
-- disco: ao fim de cada sessão ele tira os dois do log do próprio emulador
-- (logs/emulog.txt, linhas "Serial:" e "CRC:") e guarda aqui, por jogo.
CREATE TABLE game_disc_ids (
    rom_path   TEXT PRIMARY KEY,
    adapter_id TEXT NOT NULL,
    serial     TEXT NOT NULL,
    crc        TEXT NOT NULL DEFAULT '',
    seen_at    TEXT NOT NULL
);
