-- Marca que o usuário salvou configuração à mão para um emulador, pelo painel
-- "Configurações" (H1/H2). Só o fato, não os valores: os valores já vivem no
-- arquivo de configuração do próprio emulador, e uma segunda cópia deles aqui
-- seria uma fonte de verdade capaz de discordar da primeira.
--
-- Existe por causa do Q2 (docs/roadmap.md, Sprint Q): o lançamento passou a
-- aplicar o preset do catálogo antes de abrir o jogo, e sem esta linha ele
-- sobrescreveria em silêncio a escolha explícita de quem já tinha configurado.
-- É a mesma precedência que o Registry registra para emulador personalizado:
-- o que o usuário definiu à mão sempre vence o que vem de fábrica.
--
-- Apagada por DELETE /emulators/{id}/config (restaurar a configuração
-- original): quem desfez a própria configuração volta a aceitar o preset.
CREATE TABLE emulator_user_config (
    adapter_id TEXT PRIMARY KEY,
    set_at     TEXT NOT NULL
);
