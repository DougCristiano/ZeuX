# Arquitetura do código

Este documento é sobre **como o código está organizado** — pastas, pacotes,
fronteiras de dependência, convenções. Não é sobre o que o produto faz (isso
está em `visao-do-produto.md`) nem sobre as rotas HTTP (isso está em
`api.md`).

Gerado a partir do código em 2026-09-07. Sem verificação periódica isto
envelhece como o conjunto anterior de documentos envelheceu — se você está
lendo isto muitos meses depois de setembro de 2026, desconfie e confira contra
o código antes de confiar cegamente.

---

## 1. As duas metades do repositório

O ZeuX é dois programas que conversam por HTTP local:

- **`zeuxd`** (Go, `cmd/zeuxd` + `internal/*`) — o daemon. Tudo que decide
  alguma coisa (ler hardware, calcular veredito, montar linha de comando de
  emulador, gravar no banco) vive aqui. Roda sozinho, sem UI — dá pra falar
  com ele inteiro via `curl`/`Invoke-RestMethod`.
- **A interface** (`src/` React + `src-tauri/` Rust/Tauri) — sobe o `zeuxd`
  como processo filho e fala com ele pela mesma API HTTP que qualquer outro
  cliente usaria. Não tem lógica de produto própria; é consumidora da API.

Motivo dessa separação (não é só gosto): o `zeuxd` inteiro foi construído e
testado por meses **antes de existir uma linha de React** — cada rota nova
era exercitada com `curl` no terminal. Isso só é possível porque a interface
não é dona de nenhuma regra; ela só chama a API e mostra o que volta.

---

## 2. `internal/` — pacote por pacote

| Pacote | O que faz | Escreve em disco? |
|---|---|---|
| `internal/api` | Roteamento HTTP (`http.ServeMux` do Go 1.22+), decodificação de corpo, formato de erro estável (`code` + `message`), CORS de lista fechada. Todo handler mora em `server.go`. | Não — delega para os pacotes abaixo. |
| `internal/consent` | Consentimento do usuário para ler hardware: registro persistido e **versionado** por política (`PolicyVersion`). | `consent.json` |
| `internal/hardware` | Detecção de CPU/RAM (via `gopsutil`, multiplataforma de graça) e GPU/monitor (um arquivo por SO, com build tags — `gpu_windows.go`, `gpu_linux.go`, `gpu_darwin.go`, e o par `display_*.go`). | Não — só lê o sistema. |
| `internal/verdict` | O catálogo de consoles embutido (`go:embed data/consoles.json`) e o motor que cruza `HardwareInfo` contra os requisitos de cada patamar, produzindo o parecer (`Report`). Também embute a logo oficial de cada console (`go:embed data/console-images/*`, `images.go`) — gerada por `cmd/generate-console-images`, servida via `GET /consoles/{id}/image`. | Não — tudo embutido no binário, é leitura. |
| `internal/emulator` | Os *adapters* de emulador (contrato `Adapter`), descoberta de binário no disco, montagem de linha de comando (`BuildCommand`), lançamento de processo (`Launcher`), sessões, perfis de controle, backup/restauração de config de emulador. É o pacote mais grosso do repositório — concentra tudo que fala com o mundo externo (emuladores). | `custom_emulators.json`, sessões no SQLite, configs de emulador que o ZeuX escreve. |
| `internal/install` | Instalação 1-click: manifesto de fontes (`data/sources.json`), download verificado por hash, extração, promoção atômica, supressão do assistente de primeira execução. Também baixa cores do RetroArch sob demanda pelo mesmo mecanismo de job. | Binários de emulador, dentro da raiz gerenciada (`ManagedRoot()`, em `internal/emulator/discovery.go`). |
| `internal/igdb` | Busca de capa de jogo no IGDB. Credencial é **do próprio usuário** (nunca uma chave do ZeuX compartilhada — evita estourar cota de todo mundo de uma vez). | Credencial local, arquivo de capa em cache. |
| `internal/library` | Pastas de ROM que o usuário apontou, jogos encontrados na varredura, favoritos. Guarda **referência** de caminho, nunca cópia do arquivo. | Via `internal/store` (SQLite). |
| `internal/store` | Abre e migra o banco SQLite local (`modernc.org/sqlite`, driver Go puro — sem CGO, para manter compilação cruzada só com `go build`). Migrações `.sql` embutidas em `migrations/`, aplicadas em ordem e registradas em `schema_migrations`. | `zeux.db` |

### A regra de dependência que não pode virar ciclo

```
                    cmd/zeuxd
                        │
                       api
        ┌───────┬───────┼────────┬─────────┬─────────┐
     consent  hardware  verdict  install  emulator  library
                        │  │      │
                        │  └──────┼──> emulator
                        └─────────┴──> hardware
```

`verdict` importa `emulator` (o catálogo carrega `emulator.Options` direto, é
o que permite o parecer devolver um preset já aplicável). **`emulator` nunca
importa `verdict`.** Se algum dia isso for necessário, é sinal de que um
adapter começou a decidir política de produto — trabalho que é do `verdict`,
não do adapter.

`hardware` e `consent` são folhas: não importam nada interno do projeto.
`library` importa só `store` — nem `verdict` nem `emulator` sabem que
`library` existe; é a camada `api` quem cruza dado de um pacote com o outro
(ex.: `library.NewGame` com as extensões de arquivo do catálogo de
`verdict`).

## 3. `cmd/` — os dois binários

- **`cmd/zeuxd`** — entrypoint do daemon. Monta as dependências (probe de
  hardware, catálogo, registry de emulador, stores), sobe o `http.Server` em
  `127.0.0.1:7777`, escuta `SIGTERM`/`os.Interrupt` com 5s de janela de
  shutdown.
- **`cmd/generate-retroarch-manifest`** — ferramenta de manutenção, não roda
  no build nem em produção. Mede URL/tamanho/SHA256 de cada core do
  RetroArch contra o buildbot oficial e escreve o manifesto embutido em
  `internal/install/data/retroarch_cores_manifest.json`. Precisa rodar à mão
  numa máquina com acesso à internet quando o manifesto ficar obsoleto
  (hash mismatch é o sintoma — o buildbot reconstrói `latest` periodicamente).
- **`cmd/generate-console-images`** — mesma natureza (ferramenta de
  manutenção, roda à mão). Busca no IGDB a logo oficial de cada console do
  catálogo e escreve `internal/verdict/data/console-images/<id>.png`, que
  `internal/verdict/images.go` embute no binário. Precisa de credencial IGDB
  (`-client-id`/`-client-secret`) e rede real. Ver `docs/decisoes.md`,
  "Identidade visual por console".

## 4. `src/` — a interface

| Pasta | Conteúdo |
|---|---|
| `src/screens/` | Uma tela por arquivo (`ConsolesScreen`, `GamesScreen`, `LibraryScreen`, `SettingsScreen`...). Cada tela tem um `.i18n.ts` irmão — os textos vivem separados do componente. |
| `src/components/` | O que mais de uma tela usa. `ui.tsx` concentra os componentes genéricos (`Button`, `Card`, `Badge`, `ConsoleIcon`...); os demais arquivos são componentes específicos (painel de bindings de emulador, formulário de cadastro manual, sidebar). |
| `src/hooks/` | Lógica de estado reaproveitável — instalação inline de emulador/core, lançamento de jogo, gamepad e navegação por gamepad, toast, status do IGDB. |
| `src/lib/` | Funções puras sem estado de React — cor por console, se um jogo pode ser lançado (`gameLaunchability.ts`, a fonte única dessa regra, consumida por mais de uma tela), mapeamento de tecla, polling de job assíncrono, revarredura automática de pasta. |
| `src/api/` | Cliente HTTP para o `zeuxd` (`client.ts`) e os tipos TypeScript das respostas (`types.ts`) — o par que precisa acompanhar `internal/api/server.go` quando uma rota muda de formato. |

`src-tauri/` é a casca nativa: sobe o `zeuxd` como processo filho
(`src-tauri/src/lib.rs`), gerencia o ciclo de vida da janela, e desde a
v0.1.10 também o plugin de auto-update assinado.

## 5. Convenções que valem para código novo

- **Comentário explica o porquê, nunca o quê.** O código já diz o que faz; o
  comentário existe pra registrar a razão, o trade-off ou a armadilha que
  motivou aquela linha.
- **Português no que o humano lê** (comentários, mensagens de erro,
  mensagens de UI); **inglês nos identificadores** (tipos, funções, campos,
  chaves de JSON). Ver a tabela completa e a única exceção documentada
  (`sort=` de `GET /library/games`) no `CLAUDE.md`.
- **Erro devolvido ao usuário é frase completa em português, já exibível.**
  Erros da API têm `code` estável em inglês (`snake_case`) + `message` em
  português.
- **Todo teste tem um comentário dizendo qual regra ele trava**, não o que
  ele testa mecanicamente.
- **Estado compartilhado no `Server` é protegido por `sync.RWMutex`.**
- **O processo do emulador nunca é amarrado ao contexto da requisição HTTP**
  — o jogo precisa sobreviver à resposta (`session.go` usa
  `context.Background()` de propósito).
- **`BuildCommand` é pura**: não toca disco, não executa nada, só traduz
  `Installation` + `Request` em `Command`. É o que permite testar 14
  adapters sem nenhum binário de emulador instalado, e é o que faz a rota de
  preview (`POST /games/preview`) existir de graça — ela é `BuildCommand`
  sem o `Launch`.

## 6. O critério de desempate: simples e leve

Quando duas soluções resolvem o mesmo problema, ganha a menor. Uma camada de
abstração a mais, um cache a mais, uma interface "para o futuro" — tudo isso
é peso, e peso é regressão. **Não introduza abstração para um segundo caso
que ainda não existe.** Espere o segundo caso aparecer.

O ZeuX roda em um processo Go só (mais a casca Tauri), sem serviço externo
além do que o próprio usuário conecta (IGDB). Isso é uma qualidade a
defender, não um estágio a superar rumo a "arquitetura de verdade".

## 7. O que este documento não cobre

- **Por que** cada decisão acima foi tomada daquele jeito e não de outro —
  isso é `decisoes.md`.
- **O que o produto faz e por quê** — isso é `visao-do-produto.md`.
- **Formato exato de request/response de cada rota** — isso é `api.md`.
