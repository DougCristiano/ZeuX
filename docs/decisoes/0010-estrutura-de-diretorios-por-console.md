# 0010 — Estrutura de diretórios gerenciados por console

**Status:** Aceito (implementado — emuladores e jogos)

## Contexto

`emulator.ManagedRoot()` organizava as instalações 1-click de forma achatada:
`<UserConfigDir>/ZeuX/emulators/<adapter_id>/`, um diretório por emulador,
sem nenhuma relação visível com o console que ele atende.

O Douglas apontou que isso não é intuitivo para quem for abrir a pasta
manualmente: encontrar "onde está o PS2" exige saber que o adapter se chama
`pcsx2`, não `ps2`. A proposta foi organizar por console — uma pasta por
console, com os emuladores dela dentro, e (quando a biblioteca existir)
jogos, saves e capas também dentro da mesma pasta.

O complicador: alguns emuladores atendem mais de um console. RetroArch
sozinho cobre 24 sistemas (`internal/emulator/retroarch.go`,
`defaultCoreByConsole`); Dolphin cobre GameCube e Wii. Uma pasta por console
com o emulador "dentro" duplicaria o RetroArch 24 vezes — dezenas de vezes
o tamanho do binário, e uma atualização precisaria sincronizar 24 cópias.

## Decisão

**Estrutura de emuladores (implementada em 2026-08-02):**

```
<ManagedRoot>/
  <console_id>/emuladores/<adapter_id>/   # emulador de console único
  compartilhados/<adapter_id>/            # emulador de mais de um console
```

Um adapter cai em um lado ou outro conforme `len(adapter.Consoles())`:
exatamente 1 console vai para dentro da pasta desse console; 0 ou mais de 1
vai para `compartilhados/` (`emulator.ManagedEmulatorDir`). Hoje só RetroArch
e Dolphin caem em `compartilhados/` — os outros 11 adapters embutidos
atendem um console cada.

`console_id` é o mesmo identificador do catálogo (`ps1`, `ps2`, `n64`...),
não um nome de exibição — estabilidade importa mais que fricção
(ver `defaultCoreByConsole` e `consoles.json` para a mesma convenção).

**Estrutura de jogos (implementada em 2026-08-05, G1 — `docs/roadmap.md`,
Sprint G):**

```
<ManagedRoot>/
  <console_id>/emuladores/<adapter_id>/   # emulador de console único
  <console_id>/jogos/<game_id>/           # capa (e no futuro saves) de um jogo
  compartilhados/<adapter_id>/            # emulador de mais de um console
```

`emulator.GameCoverDir(root, consoleID, gameID)` resolve o caminho. A chave é
o **id do jogo** (`library.Game.ID`), não o título — estável mesmo que uma
busca posterior corrija o título, e sem preocupação com caractere inválido
de nome de arquivo. Hoje só guarda `cover.jpg` (a capa baixada pelo scraper
de metadados IGDB); saves continuam fora de escopo, sem desenho ainda.

O banco (`library_games.cover_path`, migração `0004`) guarda o caminho
**relativo a `ManagedRoot()`**, nunca absoluto — resolvido pela API
(`GET /api/v1/covers/...`) na hora de montar `cover_url`. Isso mantém o
banco portável entre reinstalações em pastas diferentes, mesmo princípio já
usado para o caminho da ROM.

**Pendência resolvida em 2026-08-02:** o pedido original era guardar o arquivo
do jogo (a ROM) dentro da estrutura gerenciada. Isso contraria a regra
não-negociável do `CLAUDE.md` ("o ZeuX nunca copia, distribui, sugere fonte ou
facilita transferência de ROMs") — regra que existe por risco legal (a maioria
das ROMs é material protegido por direito autoral; copiar o arquivo para
dentro de uma estrutura que o próprio ZeuX gerencia passa a "manusear" o
conteúdo, não só apontar para ele). Apresentado o conflito, o Douglas optou
pelo caminho compatível com a regra: `jogos/<console>/` guarda metadados
(saves, capas, informações) e uma **referência ao caminho onde a ROM já está
no disco do usuário** — nunca uma cópia do arquivo. Implementado pelo G1: o
scraper de metadados (`internal/igdb`) só fala com hosts de metadado/imagem
do IGDB (trava estrutural testada em `internal/igdb/allowlist_test.go`) e
grava só a capa baixada — nunca um caminho, link ou cópia do jogo em si.

## Consequências

**Positivas**

- Abrir a pasta gerenciada e achar "onde está o PS1" não exige saber o nome
  interno do adapter.
- Nenhuma duplicação de binário para RetroArch/Dolphin.
- A regra é dirigida por dado (`len(consoles)`), não por uma lista
  hardcoded de exceções — um adapter novo com mais de um console cai em
  `compartilhados/` automaticamente, sem precisar lembrar de adicioná-lo a
  lugar nenhum.

**Negativas / custos aceitos**

- Dois emuladores (RetroArch, Dolphin) não ficam "dentro" de nenhum console
  específico — quem for procurar o RetroArch pela pasta do NES não vai achar
  o binário lá, só (quando a Sprint D existir) os jogos/saves daquele
  console. Custo aceito: a alternativa (duplicar) é pior.
- `findBinary` e `ManagedEmulatorDir` (`internal/emulator/discovery.go`) e
  `promote`/`Uninstall` (`internal/install/manager.go`) agora precisam saber
  quantos consoles um adapter atende antes de resolver o caminho — mais uma
  consulta ao registro de adapters (`emulator.NewRegistry().ByID`), que era
  desnecessária na estrutura achatada.
- `jogos/<console_id>/<game_id>/` guarda a capa baixada, nunca o arquivo do
  jogo — `library_games.path` continua sendo a única referência à ROM, sem
  mudança de comportamento aqui.
- Remover uma pasta da biblioteca (`DELETE /library/folders/{id}`) agora
  também apaga as subpastas de capa dos jogos removidos, para não acumular
  imagem órfã (G2) — `internal/api/server.go`, `removeCoverDirs`.

## Resolvido em 2026-08-05 (G1)

A pendência de "estrutura de jogos" desta ADR está fechada: implementada
exatamente como decidido acima (metadados + referência, nunca cópia da ROM).
Ver `docs/roadmap.md`, Sprint G, itens G1/G2, e `internal/igdb/`.
