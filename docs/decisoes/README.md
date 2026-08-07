# Registros de decisão de arquitetura (ADRs)

Um arquivo por decisão significativa já tomada. Formato:
**Contexto / Decisão / Consequências**.

Um ADR registra o raciocínio no momento em que a decisão foi tomada. Ele não é
atualizado quando a realidade muda — se uma decisão for revista, escreva um novo
ADR que a substitua e marque o antigo como *Substituído por 00XX*.

| # | Decisão | Status |
|---|---|---|
| [0001](0001-ipc-http-local.md) | IPC via HTTP local em vez de sidecar do Tauri | Aceito |
| [0002](0002-adiar-banco-de-dados.md) | Adiar o banco de dados | Substituído por 0011 |
| [0003](0003-mise-como-toolchain.md) | `mise` como gerenciador de toolchain | Aceito |
| [0004](0004-adiar-rust-e-tauri.md) | Adiar a instalação de Rust e Tauri | Aceito |
| [0005](0005-buildcommand-separado-de-launch.md) | Separar `BuildCommand` de `Launch` | Aceito |
| [0006](0006-campo-unapplied.md) | Campo `Unapplied` em vez de inventar flags | Aceito |
| [0007](0007-options-estruturado-no-catalogo.md) | `options` estruturado no catálogo, ao lado do texto | Aceito |
| [0008](0008-excluir-switch-do-catalogo.md) | Excluir o Nintendo Switch do catálogo | Aceito |
| [0009](0009-desktop-agora-controle-depois.md) | Mouse e teclado agora, sem fechar a porta para controle | Aceito |
| [0010](0010-estrutura-de-diretorios-por-console.md) | Estrutura de diretórios gerenciados por console | Aceito (parcial) |
| [0011](0011-sqlite-local-para-biblioteca.md) | SQLite local para biblioteca, sessões e BIOS | Aceito (parcial) |
| [0012](0012-empacotar-retroarch-e-cores.md) | Empacotar RetroArch e cores selecionados no instalador | Aceito (decisão apenas, implementação não começou) |
| [0013](0013-tema-neon-unico.md) | Identidade visual neon única, substituindo os três temas escolhíveis | Aceito |
| [0014](0014-navegacao-por-controle.md) | Navegação por controle sobre o layout de mesa, sem modo TV | Aceito — emenda parcial do 0009 |
