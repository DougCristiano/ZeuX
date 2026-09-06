# 0011 — SQLite local para biblioteca, sessões e BIOS

**Status:** Aceito · substitui [0002](0002-adiar-banco-de-dados.md) ·
implementação quase completa (reconferido em 2026-08-28): infraestrutura e
sessões desde 2026-08-02; **pastas e jogos da biblioteca prontos** —
`library_folders` e `library_games`, migrações `0002`–`0005` (as três últimas
somando `missing`, `cover` e `favorite`), com `internal/library` em uso pelas
rotas `/api/v1/library/*`. **Só o caminho do BIOS continua fora do banco:**
não há tabela nem coluna para ele, e o que existe hoje é
`emulator.BiosDir` (pasta onde colocar, só para os emuladores em que isso
foi verificado ao vivo) mais `requires_external_file` no catálogo de
consoles.

## Contexto

O [ADR 0002](0002-adiar-banco-de-dados.md) adiou qualquer banco de dados até
que a primeira das três condições do seu próprio gatilho de revisão
ocorresse. A primeira já ocorreu: a Fase 2 está de pé (consentimento → scan →
parecer → instalação 1-click) e o wireframe da biblioteca
(`docs/wireframe.md`, rodada de 2026-08-02) já mapeia telas que mostram dado
que precisa sobreviver a um reinício — pasta apontada por console, jogo
encontrado na varredura, caminho do BIOS.

Sem persistência, cada uma dessas telas reconstrói tudo do zero a cada vez
que o `zeuxd` sobe: o usuário apontaria a mesma pasta de novo, e o D3
(`docs/roadmap.md`) continuaria bloqueado — tempo de jogo e sessão morrem
com o processo.

## Decisão

**SQLite local, com driver Go puro (`modernc.org/sqlite`), sem CGO.**

A alternativa óbvia (`mattn/go-sqlite3`) exige CGO e, portanto, um compilador
C disponível em toda máquina que compilar o `zeuxd` — dev, CI e a máquina do
Douglas. Isso contraria o que o projeto já vem protegendo: o `go build`
sozinho funciona nos 3 SOs hoje (ver `CLAUDE.md`, compilação cruzada), e esta
própria sessão de trabalho não tem `gcc` disponível (nota já registrada em
`docs/roadmap.md`, D10, sobre o detector de corrida). Um driver puro-Go
mantém essa propriedade — zero dependência de toolchain C, em qualquer SO.

**Onde mora:** `<UserConfigDir>/ZeuX/zeux.db`, ao lado de `consent.json` e
`custom_emulators.json` — não embutido no binário, porque isso é dado do
usuário, não dado de leitura do app (diferente do catálogo de consoles).

**Migrações:** arquivos `.sql` embutidos via `//go:embed`, aplicados em
ordem e registrados numa tabela `schema_migrations` — mesmo espírito do
`schema_version` que o catálogo de consoles já usa, adaptado para o caso de
múltiplos incrementos em vez de um número só.

**O que passa a viver no banco:**

- Pastas de ROM apontadas por console (a ação da tela 04 do wireframe).
- Entradas de jogo encontradas na varredura: console, **referência ao
  caminho** do arquivo — nunca uma cópia, decisão já travada no
  [ADR 0010](0010-estrutura-de-diretorios-por-console.md) — e metadados
  mínimos (nome derivado do arquivo, já que o MVP não tem scraper).
- Caminho do BIOS configurado por console (tela "BIOS necessário").
- Sessões e tempo de jogo (D3) — sai da memória do `Launcher`, resolvendo o
  item de dívida que dependia justamente desta decisão.

**O que continua como está, de propósito — não é refatoração motivada por
esta decisão:**

- `consent.json`: pequeno, versionado, já funciona, sem motivo para mudar.
- Catálogo de consoles: dado de leitura, embutido no binário, sem motivo
  para virar linha de banco.
- `custom_emulators.json`: o próprio `CustomStore.Path()` existe para que
  quem prefira editar o JSON à mão consiga encontrar o arquivo — é um valor
  de produto declarado no código (`internal/emulator/custom.go`), não uma
  omissão. Fica fora do banco.

## Consequências

**Positivas**

- Nenhuma dependência de toolchain C é introduzida — a compilação cruzada
  continua sendo só `go build`.
- O esquema é desenhado a partir do wireframe real da biblioteca, não
  antecipado — exatamente o benefício que o ADR 0002 queria proteger ao
  adiar.
- Desbloqueia D3 (sessões e tempo de jogo) de graça, já que a tabela de
  sessão resolve os dois problemas com o mesmo mecanismo.

**Negativas / custos aceitos**

- Primeira dependência externa de runtime do projeto (ainda que pura-Go, sem
  CGO) — aumenta o binário e introduz uma categoria de bug nova (migração
  mal escrita corrompe dado real do usuário, algo que arquivos JSON
  atômicos não tinham como fazer).
- `Launcher` e `Server` precisam da camada de repositório que o ADR 0002 já
  havia previsto como custo — extrair o estado que hoje vive direto em
  slices/ponteiros protegidos por `sync.RWMutex`.
- Testes que hoje isolam estado via `XDG_CONFIG_HOME`/`AppData` apontando
  para um diretório temporário (`internal/consent`, `internal/emulator`)
  precisam do mesmo padrão aplicado ao banco — nenhum teste deve tocar o
  banco real do usuário.

## Gatilho para revisão

Reabrir quando a Sprint E (perfil e social) desenhar a sincronização
local↔nuvem — o plano de longo prazo já previa MySQL na nuvem, e a forma como
o SQLite local sincroniza (ou não) com ele ainda não foi pensada. Até lá,
este banco é **só local, só um usuário**, sem conceito de conta.
