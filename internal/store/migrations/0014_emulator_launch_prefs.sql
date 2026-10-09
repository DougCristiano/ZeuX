-- Preferências de lançamento que o ZeuX guarda por conta própria, para
-- emuladores que não têm onde gravar a opção no arquivo de configuração do
-- próprio emulador. Hoje: "Salvar estado ao fechar o jogo" do RetroArch e do
-- Flycast. Os dois recebem a escolha por arquivo de override e -config
-- transitório, então o valor precisa morar aqui.
--
-- Uma linha só quando a pessoa mudou o padrão. Sem linha, vale o padrão do
-- ZeuX (ligado). auto_save_state: 1 = ligado, 0 = desligado.
CREATE TABLE emulator_launch_prefs (
    adapter_id      TEXT PRIMARY KEY,
    auto_save_state INTEGER NOT NULL
);
