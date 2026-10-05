-- Estado de "retomar" de cada jogo: o save state que o emulador grava sozinho
-- ao fechar (DuckStation "SaveStateOnExit", PCSX2 "SaveStateOnShutdown").
-- O ZeuX não sabe o código do jogo (serial) que esses emuladores usam no nome
-- do arquivo, então liga estado e jogo pela sessão: ao fim de cada sessão,
-- o arquivo de retomada que mudou durante ela é deste jogo.
--
-- Uma linha por jogo (rom_path), sempre o estado mais recente. Apagar a linha
-- não apaga o arquivo — o arquivo é do emulador.
CREATE TABLE resume_states (
    rom_path   TEXT PRIMARY KEY,
    adapter_id TEXT NOT NULL,
    state_path TEXT NOT NULL,
    saved_at   TEXT NOT NULL
);
