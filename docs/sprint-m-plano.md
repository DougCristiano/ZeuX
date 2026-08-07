# Plano da Sprint M — Biblioteca de jogos: layout e usabilidade

Detalhamento da Sprint M do [roadmap](roadmap.md). Está em arquivo separado
pelo mesmo motivo do [`sprint-b-plano.md`](sprint-b-plano.md): o roadmap é um
índice de backlog — cabe a tabela e o critério de aceite, não os passos
técnicos de quinze itens.

**Objetivo:** a biblioteca de jogos deixa de ser duas telas que desenham o
mesmo acervo de dois jeitos e passa a ser uma só, com foco visível, ordenação,
estado preservado e sinal do que não vai abrir.

**De onde veio:** da crítica do subagente `critico-layout-biblioteca`
(2026-08-07), aprovada pelo Douglas. O contexto completo — inclusive o que o
crítico **não** sabia (não leu `CLAUDE.md`, ADRs nem roadmap) e os cortes
assumidos em M3, M6 e M9 — já está registrado na abertura da Sprint M no
roadmap. Não repetir aqui.

Escrito em 2026-08-07, contra o código verificado na mesma data (`go test
./...` e `npm run build` verdes antes de planejar).

---

## Estado verificado antes de planejar

Levantado lendo o código, não a memória. Toda linha citada nos itens da Sprint M
foi conferida — as que divergiram estão marcadas.

| Fato | Verificação |
|---|---|
| **O overlay ▶ é decorativo mesmo.** `ui.tsx` desenha o overlay dentro de uma `div` com `pointer-events-none` | `grep -n "pointer-events-none" src/components/ui.tsx` — o bloco de `showPlayOverlay` |
| **O `.game-cover:hover` está fora de layer.** `src/index.css:157-162` define a regra crua; o `@theme inline` começa em `:169` e o `@layer base` bem depois | leitura de `src/index.css`, linhas 146–170 |
| **`.game-cover:focus-visible` não tem como disparar.** O elemento focável é o `<button className="group block w-full text-left">` que envolve a capa (`AllGamesScreen.tsx:281`); a `div.game-cover` não tem `tabindex` | leitura dos dois arquivos |
| **`focus-within:border-[var(--console-accent)]` também não salva:** o botão é **pai** da `div`, não filho | mesma leitura |
| **O servidor já ordena antes de paginar**, e é o lugar certo para o `?sort=` | `internal/api/server.go`, `handleListLibraryGames` — `sort.SliceStable` roda antes do `result[start:end]` |
| **`platformsOnPage` é calculado sobre a página** (`AllGamesScreen.tsx:162`) e o filtro é resetado a cada `loadGames` (`:84`) | `grep -n "platformsOnPage\|setPlatformFilter"` |
| **`GamesScreen` ignora `cover_url`** e desenha um quadrado 64×64 de `font-mono` | leitura de `GamesScreen.tsx`, bloco do `Card` por jogo |
| **`useLaunchGame` já existe e é o caminho certo do M1** — `launch(game)` chama `POST /games/launch` sem `options` | `src/hooks/useLaunchGame.ts` |
| **`useLaunchGame` deliberadamente NÃO cobre** instalar inline / confirmar hardware / confirmar BIOS — isso só existe em `GamesScreen.handlePlay` | doc comment do próprio hook, e `GamesScreen.tsx:177-191` |
| **`useGamepadNavigation()` não devolve nada** — confirma a correção que o M14 já registra | `src/hooks/useGamepadNavigation.ts`, assinatura e `return` do `useEffect` |
| **`consoleAccentColor` usa hash sobre 10 cores** para 33 consoles | `src/lib/consoleColor.ts`, `PALETTE` |
| **`Sidebar.tsx:109` deriva o rótulo por `slice(0, 3)`** | `grep -n "slice(0, 3)" src/components/Sidebar.tsx` |
| **`PAGE_SIZE = 24` no front** (`AllGamesScreen.tsx:8`) **e `defaultLibraryPageSize = 24` no servidor** | os dois arquivos — o M15 só cita o do front; ver nota no item |
| `shadcn` já tem `Dialog`, `Select` e `Button` instalados; **não tem `DropdownMenu`** (J5 não aplicado) | `ls src/components/ui/` |

**O que isto muda no plano, e não estava na tabela da Sprint M:**

1. O M1 tem um consumidor pronto (`useLaunchGame`) para o caminho simples, mas
   **`AllGamesScreen` não tem** o caminho rico (instalar inline, confirmar
   BIOS). Isso é exatamente o que o M8 pede — então **M8 é o item que exige
   extrair `handlePlay` para um lugar compartilhado**, e M1 deve deixar essa
   porta aberta em vez de amarrar o overlay ao `useLaunchGame` para sempre.
2. O `PAGE_SIZE` do M15 tem um irmão no servidor. Mudar só o front deixa o
   default do servidor divergente — decisão a tomar no item.

---

## Ordem de execução

A Sprint M já registra a ordem resumida (`M2 → M1 → M4 → M3 → M5 → resto`).
Aqui ela vira sequência com o porquê técnico de cada aresta:

```
M2 (glow: @layer + seletor morto)          <-- promessa descoberta, poucas horas
 └─> M1 (overlay lança; sai o botão Jogar)  <-- reescreve GameCover; M2 antes evita conflito
      ├─> M7 (pixel font + título duplicado) <-- mesmo componente, mesma passada
      └─> M4 (estado preservado + chips honestos)
           └─> M3 (ordenação, modo lista, barra única)
                └─> M5 (tile único entre as duas telas)  <-- G, o maior da sprint
                     ├─> M8 (sinal de "não vai abrir")   <-- extrai handlePlay
                     ├─> M11 (object-contain + fundo desfocado)
                     └─> M12 (skeleton + vazio + contagem)

Independentes, podem entrar em qualquer folga:
  M6 (detalhe do jogo)      M9 (tela de pastas)     M10 (cor por console)
  M13 (rótulos da sidebar)  M14 (prompts de botão)  M15 (arestas cosméticas)
```

**Por que M2 antes de M1**, e não o contrário: os dois tocam `GameCover`, mas o
M2 é correção de duas linhas de CSS mais a remoção de um seletor morto. Fazer
depois do M1 significaria depurar cascade layers dentro de um componente que
acabou de ser reescrito, sem saber qual das duas mudanças quebrou o quê.

**Por que M7 logo depois do M1**, fora da ordem do roadmap: os dois mexem no
mesmo bloco de `GameCover` (badge `9px`, título `11px` sobre a capa, overlay).
Separá-los custa duas leituras do mesmo arquivo e um conflito garantido.
Sugestão de ajuste à ordem original — **não é decisão tomada**, só recomendação.

**Por que M4 antes de M3:** o roadmap já registra (sem estado preservado,
escolher uma ordem, abrir um jogo e voltar reseta tudo — a barra de controle do
M3 pareceria quebrada no primeiro uso). Além disso os dois mexem no mesmo
handler Go (`handleListLibraryGames`) e no mesmo `useEffect` de carga: M4 tira
o `setPlatformFilter(null)` de lá, M3 acrescenta o `sort` — ordem inversa
produz merge conflict em cima de si mesmo.

**Por que M5 depois de M1/M2/M4:** M5 é o item G da sprint. Unificar dois tiles
antes de o tile certo existir é unificar dois erros.

**Por que M8/M11/M12 depois de M5:** os três acrescentam comportamento à célula
de jogo. Antes do M5, cada um vira duas implementações — a razão que o próprio
Douglas já apontou.

---

## Os itens

### M2 — Glow de foco/hover: regra de `@layer` e seletor morto (P)

**Decisão de design necessária antes de codar:** nenhuma. O comportamento
desejado já está escrito no critério de aceite (cor do console no hover **e** no
foco, mesma intensidade).

**Passos:**

1. `src/index.css` — decidir entre duas correções, **e a menor ganha**:
   - **(a)** envolver a regra `.game-cover:hover` em `@layer components`, para
     que as utilities do Tailwind (que vivem em `@layer utilities`) possam
     vencê-la por ordem de layer; ou
   - **(b)** apagar a regra de `border-color` do CSS e deixar o Tailwind fazer
     o trabalho inteiro (`hover:border-[var(--console-accent)]` já está escrito
     em `ui.tsx`), mantendo no CSS só o `box-shadow`, que a utility não cobre —
     e fazendo o `box-shadow` usar `var(--console-accent, var(--accent))` para
     herdar a cor do card.
   A **(b)** é menor e elimina a duplicação de responsabilidade. Recomendada.
2. `src/index.css` — apagar `.game-cover:focus-visible`. Ele nunca disparou;
   manter é deixar uma armadilha para quem ler o CSS depois.
3. `src/components/ui.tsx` — trocar `focus-within:border-…` (que não pode
   disparar, o focável é o pai) por `group-focus-visible:border-…`, no mesmo
   mecanismo que o J4 já usa para o overlay de escurecimento. **Isto depende do
   `group` no `<button>` externo, que o J4 já adicionou em
   `AllGamesScreen.tsx:281`** — ao usar o tile em outra tela (M5), o `group`
   precisa vir junto, senão o bug do J4 renasce.
4. Comentar no CSS **por que** a regra está (ou não está) num layer — é
   exatamente o tipo de armadilha que o `CLAUDE.md` pede que vire comentário de
   porquê.

**Verificação:**
- `npm run build` passa.
- `grep -n "focus-visible" src/index.css` não devolve seletor apontando para
  elemento não focável (critério do próprio item).
- **Precisa do Douglas olhando a tela:** dois jogos de consoles diferentes lado
  a lado mostrando duas cores de borda; e o glow no foco de teclado com o mouse
  fora da janela. Uma sessão de IA pode verificar isso com Chromium/Playwright
  (`page.keyboard.press("Tab")` + captura de tela), mas **julgar se as duas
  cores são distinguíveis** é olho humano.

---

### M1 — O overlay ▶ não lança, e o botão embaixo do tile custa densidade (M)

**Decidido pelo Douglas em 2026-08-07:** o `ErrorModal` ganha um botão "Tentar
de novo" — não basta deixar o usuário clicar o ▶ de novo por conta própria.

**Passos:**

1. `src/components/ui.tsx`, `GameCover` — o overlay de play vira `<button
   type="button">` com `aria-label={"Jogar " + title}`, recebendo um
   `onPlay?: () => void` novo. **Sem `onPlay`, o overlay continua decorativo e
   `pointer-events-none`** (o `GameDetailScreen` também usa `GameCover`, e ali
   um segundo botão de jogar dentro da capa não faz sentido).
2. Botão dentro de botão é HTML inválido — hoje o `GameCover` está dentro de um
   `<button>` em `AllGamesScreen.tsx:281`. **O wrapper externo precisa deixar de
   ser `<button>`**: vira `<div role="link" tabIndex={0}>` com handler de
   Enter/Espaço, ou (melhor) o clique na capa passa a ser um botão irmão
   posicionado por baixo do overlay. **Esta é a parte de risco real do item** —
   qualquer solução tem que preservar: `group` (M2/J4), foco por Tab, foco por
   D-pad (`useGamepadNavigation` procura `FOCUSABLE_SELECTOR`) e o
   `FavoriteToggle` que já vive sobreposto.
3. `src/screens/AllGamesScreen.tsx` — passar `onPlay={() => launch(game)}` do
   `useLaunchGame` que a tela já usa; remover o `<Button variant="primary">`
   full-width.
4. `src/components/ui.tsx`, `ErrorModal` — ganha uma prop opcional
   `onRetry?: () => void`; quando presente, renderiza um segundo botão "Tentar
   de novo" ao lado de "Fechar", com `autoFocus` nele (mesmo padrão que o botão
   principal já usa). `GameDetailScreen` (que já usa `ErrorModal` sem retry)
   continua funcionando sem passar a prop.
5. `AllGamesScreen.tsx` — guardar o jogo da última tentativa (o `launch(game)`
   já sabe qual foi) e passar `onRetry={() => launch(lastGame)}` ao
   `ErrorModal`; clicar "Tentar de novo" chama `launch` de novo sem fechar a
   tela nem recarregar a grade.
6. Conferir que o `ErrorModal` continua sendo aberto por `launchError` (a tela
   já faz isso) — o caminho de erro não pode sumir junto com o botão.

**Verificação:**
- `npm run build` passa.
- `grep -n "Jogar" src/screens/AllGamesScreen.tsx` só acha o rótulo acessível
  do overlay (critério do item).
- Navegação por Tab: do primeiro jogo de uma fileira ao primeiro da seguinte em
  **1** parada, não 2 — contável com Playwright.
- **Precisa do Douglas:** "pelo menos 3 fileiras de capa visíveis sem rolar em
  1280×800 com 30 jogos". Uma sessão de IA consegue medir isso com viewport
  fixo no Chromium e escrever o número medido no roadmap — mas a janela real do
  Tauri tem chrome próprio, então o número final é o dele.

---

### M7 — Pixel font abaixo do piso, e título duplicado sobre a capa (P)

**Decidido pelo Douglas em 2026-08-07:** o badge de plataforma sobe de `9px`
para `11px` (mantém a fonte pixel), aceitando o aumento de ~20% sobre a capa.
Ajuste fica em aberto para depois se não ficar legível na prática ("podemos
alterar depois se não ficar bom").

**Passos:**

1. `src/components/ui.tsx` — badge de plataforma (`text-[9px]` → `text-[11px]`)
   e `ConsoleIcon` (`text-[8px]` → `text-[11px]`, mesma regra do piso).
2. `GameCover` — o bloco de título sobre a capa passa a renderizar **só quando
   não há `coverUrl`**, com truncamento (`line-clamp-3`).
3. `AllGamesScreen.tsx` — o rótulo em Inter embaixo do tile ganha
   `line-clamp-2` e permanece nos dois casos (é ele que passa a ser o único
   título quando há capa).
4. Reler o comentário de `src/index.css:120-127` e, se a regra mudar, atualizar
   **o comentário junto** — a regra do piso é registro de decisão, não enfeite.

**Verificação:**
- `grep -rn "font-pixel" src --include="*.tsx"` sem `text-[Npx]` com N < 11.
- `npm run build`.
- **Precisa do Douglas:** se o badge menor/maior ficou legível de verdade.

---

### M4 — Voltar do detalhe perde tudo, e os chips de plataforma mentem (M)

Este item tem **duas metades independentes** que o roadmap empacotou juntas:
estado preservado (front) e chips honestos (back + front). Podem ser feitas em
ordem, na mesma branch, mas falham por motivos diferentes.

**Decidido pelo Douglas em 2026-08-07:** opção (a) — subir
`page`/`search`/`platformFilter` para `App.tsx` e passar como prop. A
rolagem (que essa opção não cobre de graça) se resolve com `ref` no container
rolável e restauração no `useEffect`, como o passo 7 abaixo já previa.

**Passos — metade servidor:**

1. `internal/api/server.go`, `handleListLibraryGames` — acrescentar ao corpo da
   resposta um campo com os consoles presentes no **`result` completo**
   (antes do fatiamento), não na página. O handler já tem `result` em mãos.
2. Mesmo handler — aceitar filtro por console no modo "todos os jogos"
   (`?platform=` ou reusar `?console_id=`; **escolher um e documentar**), de
   modo que a paginação seja sobre o conjunto já filtrado.
3. [`docs/api.md`](api.md) — documentar o campo novo e o parâmetro novo
   **antes** de a tela consumir, como o L5 (Sprint D) fez.
4. `internal/api/library_test.go` — teste do campo novo e do filtro combinado
   com paginação (critério do item).

**Passos — metade front:**

5. `AllGamesScreen.tsx` — apagar `platformsOnPage` (`:162`) e consumir o campo
   novo; apagar o `setPlatformFilter(null)` de `loadGames` (`:84`).
6. Mudar o filtro de plataforma de client-side para parâmetro da requisição.
7. Implementar a preservação de estado conforme a decisão acima, incluindo
   `scrollTop` (nenhuma das duas opções o cobre sozinha na opção (a) — precisa
   de `ref` no container rolável e restauração no `useEffect`).

**Verificação:**
- `go test ./internal/api` e `npm run build` passam.
- Roteiro pelo terminal, no espírito do fim de `api.md`: `GET
  /library/games?platform=<x>&page=2` devolve a segunda página **de jogos
  daquele console**.
- **Verificável por sessão de IA:** o roteiro "página 3 + busca + filtro →
  abrir jogo → voltar" com Playwright contra um `zeuxd` real, incluindo a
  posição de rolagem (`el.scrollTop`). Não precisa do Douglas.

---

### M3 — Sem ordenação, sem modo lista, sem barra de controle única (G)

**Decisões, tomadas pelo Douglas em 2026-08-07:**
- **Nomes de `?sort=`: português**, mesmo contrariando a convenção do
  `CLAUDE.md` de valor de enum em inglês sem acento. Ficam `recentes` (padrão,
  hoje implícito), `titulo` e `tempo_jogado`. **Isto é uma exceção explícita à
  convenção**, no mesmo espírito de `level: "otimo"` — registrar aqui e no
  `CLAUDE.md` (tabela de convenções de idioma) para não virar "erro" numa
  auditoria futura. O Douglas pretende criar uma tradução para inglês depois;
  até lá, `?sort=` fica em português como o resto da API que é consumida só
  pela própria UI do ZeuX.
- **Grade virtualizada entra nesta sprint**, ao contrário da recomendação
  deste plano (que sugeria deixar fora por falta de problema medido). O
  Douglas quer validar virtualização já, não só quando um acervo real travar a
  rolagem.

**Passos:**

1. `internal/api/server.go`, `handleListLibraryGames` — `?sort=` entra
   **exatamente onde o `sort.SliceStable` de hoje está**, antes do fatiamento.
   Valor desconhecido cai no padrão sem erro (critério do item) — não devolver
   400: é preferência de tela, não contrato quebrado.
2. `internal/api/library_test.go` — um caso por valor de `sort`, com 3 jogos de
   título, tempo e data diferentes.
3. [`docs/api.md`](api.md) — documentar antes da tela.
4. `AllGamesScreen.tsx` — **uma** barra no topo: busca (já existe), `Select` do
   shadcn para a ordem (J3 já instalou), alternância grade/lista, favoritos
   (já existe) e chips (já existem). Nada solto fora dela.
5. Componente novo de linha para o modo lista, em `src/components/`.
6. `localStorage` para ordem e modo — **explicitamente não é tabela nova**
   (o roadmap já fecha isso, ADR 0002 / orçamento de complexidade). Ler no
   primeiro render, gravar no `onChange`, com fallback silencioso se o valor
   salvo for lixo.
7. Rótulo da ordem padrão dizendo o que ela é ("jogados por último").
8. **Virtualização da grade e da lista** — isto é dependência de Node nova
   (nenhuma lib de virtualização está no `package.json` hoje), então por
   `CLAUDE.md` ("não instale dependências de Node sem pedir") registra-se
   aqui que **o pedido já foi feito** por este item, não é decisão unilateral
   da sessão. Candidata: `@tanstack/react-virtual` (headless, sem CSS
   próprio para conflitar com Tailwind, mantida ativamente). Aplicar nos dois
   modos (grade e lista), calculando altura de linha/célula a partir do
   `PAGE_SIZE` (M15) e das colunas atuais do grid responsivo. Como a página já
   é paginada pelo servidor (30 por página), a virtualização aqui é sobre o
   **DOM da página carregada**, não substitui a paginação — os dois mecanismos
   coexistem.

**Verificação:**
- `go test ./internal/api`, `npm run build`.
- Roteiro de terminal por valor de `sort`.
- Virtualização: contagem de nós DOM renderizados (`document.querySelectorAll`
  dos tiles/linhas) enquanto a página tem `PAGE_SIZE` itens, confirmando que
  fica abaixo do total quando a grade não cabe inteira na viewport —
  verificável por sessão de IA com Playwright.
- **Precisa do Douglas:** "cabe pelo menos 12 linhas em 1280×800" — mensurável
  com Playwright, mas o julgamento de "a lista densa ficou legível" é dele; e
  se a virtualização não introduziu soluço perceptível ao rolar rápido (jank),
  que é julgamento de sensação, não de número.

---

### M5 — Duas telas desenham o mesmo jogo de dois jeitos (G)

O maior item da sprint, e o de maior risco de regressão: `GamesScreen` carrega
o fluxo mais rico do app (instalar inline do L8, confirmar hardware, confirmar
BIOS vazio) e nada disso pode quebrar.

**Decisão de design necessária:** nenhuma nova — o critério já fixa que o tile
único é o de `AllGamesScreen` (capa 3/4 com badge, cor, favorito, detalhe) e
que o exclusivo de `GamesScreen` **fica fora** do componente compartilhado.

**Passos:**

1. Criar `src/components/GameTile.tsx` (nome a confirmar) com a célula
   completa: `GameCover` + `FavoriteToggle` + badge + rótulo + overlay de play
   (M1) + o `group` no elemento certo (M2/J4).
2. `AllGamesScreen.tsx` — trocar a montagem inline pelo componente.
3. `GamesScreen.tsx` — trocar o quadrado 64×64 `font-mono` pelo componente.
   Passar `cover_url` (hoje ignorado) e ligar o clique ao `GameDetailScreen`
   (caminho que hoje não existe a partir da tela por console — precisa de um
   `onOpenGame` novo vindo de `App.tsx`).
4. **Preservar em `GamesScreen`, fora do componente compartilhado:** o
   cabeçalho de parecer/BIOS, a instalação inline (L8) e a confirmação de BIOS
   vazio. Eles hoje vivem **dentro** do `Card` por jogo — mover para fora, ou
   para um bloco irmão do tile, sem perder o vínculo com
   `installState.pendingGamePath`.
5. `grep -rn "GameCover" src/screens/` deve achar só o componente novo
   (critério do item).

**Verificação:**
- `npm run build` — e ele **não pega** prop passada e ignorada, que é o outro
  critério do item. Isso é leitura de código, não build.
- **Verificável por sessão de IA:** o roteiro inteiro de `GamesScreen`
  (apontar pasta → ver jogos → Jogar → instalar inline → erro de instalação)
  com Playwright contra um `zeuxd` real — foi assim que L7/L8 foram fechados.
  Só o caminho de **sucesso** da instalação continua fora (exige rede de
  download), mesma ressalva que L8 já carrega.

---

### M8 — A grade não sinaliza o jogo que não vai abrir (M)

**Decidido pelo Douglas em 2026-08-07:** a proposta de texto ("o ZeuX ainda
não escolheu uma configuração para este console") foi aprovada **com uma
condição** — o badge precisa trazer o motivo, não só o fato. "Não deixa claro
o pq zeux nao escolheu. Traga um motivo."

Isto só se aplica ao caso `!canAutoConfigure` — "instalar emulador" e "arquivo
ausente" **já são motivos** (nomeiam exatamente o que falta, princípio 3 do
`CLAUDE.md`). O caso sem preset é o único genérico, e o produto já tem de onde
tirar o motivo: `ConsoleVerdict.Bottlenecks` nomeia o componente que barra
(GPU/CPU/RAM), a mesma regra que a tela de veredito por console já usa. A
resolução:
- Badge curto: `"sem preset — {bottleneck}"` (ex.: `"sem preset — GPU"`), lido
  do primeiro item de `verdict.bottlenecks` quando existir.
- Sem `bottlenecks` (nível `"nada"` sem gargalo nomeado, ou dado `"parcial"`
  por informação que não pôde ser lida — princípio 4) o badge cai no texto
  genérico aprovado: `"sem preset automático para este console"`.
- O `title` (tooltip nativo) do badge sempre carrega a frase completa, no
  mesmo padrão que o caminho truncado do M9: `"O ZeuX ainda não escolheu uma
  configuração para este console porque {frase do bottleneck, ou o texto
  genérico}."` — descritivo, nunca julgador, sem adjetivo sobre a máquina.

**Passos:**

1. Extrair a regra de decisão para **um** lugar — `src/hooks/useGameLaunchability.ts`
   ou uma função pura em `src/lib/`. Ela precisa dos mesmos insumos que
   `GamesScreen.handlePlay` usa hoje: `game.missing`, `canAutoConfigure` (do
   verdict do console), `adapterEntry.installed`, `adapterEntry.bios_dir_empty`
   — mais `verdict.bottlenecks`, que `handlePlay` hoje não consulta (só o
   `Callout` da tela por console usa a frase pronta; o badge precisa do dado
   estruturado). **`AllGamesScreen` hoje não carrega `EmulatorEntry` nenhum** —
   vai precisar de `GET /emulators` (a tela de emuladores já o consome; o dado
   existe).
2. `GamesScreen.handlePlay` passa a chamar a mesma função, em vez de repetir a
   cadeia de `if` — é o "só uma implementação de 'este jogo pode abrir?'" que o
   critério exige por `grep`.
3. `GameTile` (M5) ganha o esmaecimento e o badge, a partir do resultado,
   compondo o texto curto + o `title` conforme a regra acima.
4. Clicar no badge de "instalar emulador" na grade dispara a instalação inline
   do L8. **Isso significa que o fluxo de instalação precisa sair de
   `GamesScreen` para um lugar compartilhado** — é o maior pedaço deste item, e
   o motivo de ele ser M e não P.

**Verificação:**
- `grep` mostrando uma só implementação (critério do item).
- `npm run build`.
- **Verificável por sessão de IA:** com o RetroArch (fonte que falha de
  propósito neste ambiente), clicar no badge da grade e ver o erro real do
  servidor — mesmo truque que fechou o L8.

---

### M11 — `object-cover` corta a capa real (P)

**Decisão de design necessária:** nenhuma — o critério já fixa `object-contain`
com a própria capa desfocada por trás, e a célula continuando `aspect-[3/4]`.

**Passos:**

1. `GameTile`/`GameCover` — a `<img>` vira duas: uma de fundo com
   `object-cover` + `blur` + `brightness`, `aria-hidden`, e a de frente com
   `object-contain`.
2. Conferir que o gradiente inferior e a scanline continuam por cima da
   composição certa (a scanline vai sair da capa real no M15 — se M15 vier
   antes, um passo a menos aqui).
3. Placeholder de sigla intocado (critério do item).

**Verificação:** `npm run build`; **precisa do Douglas ou de uma capa real
baixada pelo G1** — uma capa quadrada e uma alta lado a lado. Uma sessão de IA
pode montar isso com duas imagens de teste sem depender do IGDB.

---

### M12 — Carregando fica em branco; vazio é uma frase cinza (M)

**Decisão de design necessária:** nenhuma essencial. O critério fixa skeleton na
mesma grade, painel centralizado com ação principal no vazio, contagem no
cabeçalho, e os dois estados vazios de hoje preservados e distintos.

**Passos:**

1. `src/components/` — skeleton de célula reaproveitando as medidas do
   `GameTile` (mesma `aspect-[3/4]`, mesmo `gap`), quantidade = `PAGE_SIZE`.
2. `AllGamesScreen.tsx` — trocar o `games === null` que não renderiza nada pelo
   skeleton.
3. Painel de biblioteca vazia com a ação principal levando ao fluxo de apontar
   pasta que já existe (`LibraryScreen`) — o botão precisa navegar, não só
   descrever.
4. Cabeçalho com o `total` que a tela **já guarda em estado** (`:56`, `:89`) —
   sem chamada nova, como o critério exige.
5. Não colapsar os três estados vazios num só (critério do item).

**Verificação:** `npm run build`; roteiro com Playwright cobrindo os três
estados (carregando com rede lenta, biblioteca vazia, busca sem resultado) —
**verificável por sessão de IA**, sem depender do Douglas.

---

### M6 — O detalhe do jogo não diz com o que ele vai rodar (M)

**Decisão de design necessária:** nenhuma nova — o corte (usar a capa que já
está no disco como fundo desfocado, em vez de scraping novo de artwork) já está
assumido no roadmap, com a verificação de `internal/igdb/client.go` que o
sustenta.

**Passos:**

1. `GameDetailScreen.tsx` — receber o `verdict` do console (mesmo dado que
   `GamesScreen` usa) e mostrar emulador + preset, e o aviso de "sem preset
   automático" no mesmo caso em que `GamesScreen` mostra.
2. **Revisar o texto contra o princípio 2 do `CLAUDE.md`** antes de escrever:
   descritivo, nunca julgador. Reaproveitar as frases que a API já devolve
   sempre que possível, em vez de inventar redação nova.
3. `autoFocus` no botão "▶ Jogar" — mesmo padrão que o `ErrorModal` já usa.
4. Ações secundárias: abrir a pasta do jogo (`openPath` do
   `@tauri-apps/plugin-opener`, já usado em `GamesScreen.tsx:88` e já com a
   permissão de escopo resolvida — ver a armadilha do Tauri registrada no
   roadmap) e exibir `game.path`. **Nenhum link, nenhuma sugestão de origem.**
5. Fundo do topo com a própria `cover_url` desfocada e escurecida; sem capa, o
   topo fica como está.

**Verificação:** `npm run build`; leitura do texto novo contra o `grep` de
adjetivos de valor que o B9 estabeleceu
(`grep -riE "fraco|ruim|insuficiente|não aguenta|incapaz" src/`).
**Verificável por sessão de IA.**

---

### M9 — "Onde estão minhas ROMs" tratado como formulário administrativo (G)

**Decidido pelo Douglas em 2026-08-07:** `Select` do shadcn (J3 já instalou).

**Passos:**

1. `LibraryScreen.tsx` — separar em duas seções, como o critério manda.
   "Consoles configurados" = uma linha por console **com pasta apontada**,
   derivado de `GET /library/folders` (já existe), não dos 33 do catálogo.
2. Linha compacta: `ConsoleIcon` + `consoleAccentColor` (a tela hoje não usa
   nenhum dos dois — é a única assim), nome, caminho truncado com `title`
   completo, contagem de jogos, revarrer, remover.
3. "Adicionar console": seletor de console + "Escolher pasta" (o botão nativo
   já existe, I3/2026-08-04).
4. **Não construir assistente novo** — o `BulkFolderPicker` (`:22-83`) já é
   ele. Reposicionar, não reescrever.
5. Remover o `Pagination` (`:344`) e o `PAGE_SIZE = 6` (`:12`).
6. Preservar o caminho para `GamesScreen` mesmo com 0 jogos — é lá que fica
   "Abrir pasta do BIOS" (o critério é explícito nisto, e é fácil de perder na
   reorganização).
7. Reler a tela buscando qualquer texto que sugira origem de ROM — a atual
   respeita a regra 6 e a nova precisa continuar respeitando.

**Verificação:** `npm run build`; roteiro com Playwright (apontar pasta →
aparece 1 linha → revarrer → remover), **verificável por sessão de IA**, mesmo
caminho que fechou o L6.

---

### M10 — Cor por console: hash sobre 10 cores para 33 consoles (M)

**Decidido pelo Douglas em 2026-08-07:** usar cor associada à marca do
fabricante (azul PlayStation, vermelho Nintendo, azul Sega etc.). Onde duas
cores de marcas diferentes ficarem parecidas demais para distinguir na grade,
resolver por **tom ou brilho**, não trocando de matiz — a mesma regra que já
valia para famílias do mesmo fabricante (PS1/PS2/PS3, GB/GBC/GBA) agora também
serve para desempatar marcas vizinhas (ex.: azul PlayStation vs. azul Sega).

**Passos:**

1. Escrever a tabela em `src/lib/consoleColor.ts` como mapa explícito
   `console_id → cor`, cobrindo pelo menos 15 consoles.
2. Manter `consoleAccentColor` com a mesma assinatura e o hash atual como
   **fallback** — console adicionado depois nunca fica sem cor.
3. Famílias (PS1/PS2/PS3, GB/GBC/GBA) variando em **tom, não em matiz**
   (critério do item).
4. Escrever no roadmap, no próprio M10, **qual foi a regra adotada** para onde
   a cor aparece — o critério pede isso explicitamente (não competir borda
   colorida + badge colorido + estrela âmbar + botão roxo no mesmo tile).
5. Teste (ou verificação escrita) de que nenhum `console_id` do catálogo fica
   sem cor — no espírito de `TestEveryConsoleDeclaresAtLeastOneExtension`. Um
   teste TS exigiria runner de teste no front, **que o projeto não tem**;
   alternativa menor: um script `node` no `package.json`, ou verificação
   escrita no roadmap. **Não introduzir Vitest só por isto.**

**Verificação:** `npm run build`; **precisa do Douglas** — "duas cores não se
confundem na grade" é julgamento visual.

---

### M13 — Rótulos da sidebar derivados por `slice(0, 3)` (P)

**Decidido pelo Douglas em 2026-08-07:** rail que expande no hover/foco,
mostrando o nome inteiro — a opção mais comunicativa, aceitando o trabalho
extra de garantir que a expansão não reflua a grade de conteúdo.

**Passos:**

1. `Sidebar.tsx` — a sidebar (`w-16` hoje) ganha um estado de
   hover/foco-dentro (`group` no `<nav>` ou `useState` em
   `onMouseEnter`/`onFocus`/`onBlur`) que expande sua própria largura (ex.:
   `w-16` → `w-48`) e revela o `item.label` completo ao lado do ícone.
2. **A expansão precisa ser `position: absolute`/sobreposta ao conteúdo, não
   `position: static` empurrando o `<main>`.** É exatamente o risco de
   refluxo que o `CLAUDE.md` já registra para breakpoints: a sidebar expandida
   não pode mudar a largura da área de conteúdo (`flex-1` em `App.tsx`) a cada
   passada de mouse — isso re-dispara os breakpoints de colunas da grade
   (M3/M15) em tempo real, o que é pior que a sigla truncada que este item
   resolve.
3. Expande também no **foco de teclado/gamepad** (`focus-within`), não só no
   `:hover` — ADR 0009: nada só-hover. Ao perder o foco/hover, recolhe.
4. Apagar o `slice(0, 3).toUpperCase()` de `:109` — o rótulo completo some
   quando recolhida (só o ícone fica visível, como hoje) e aparece por inteiro
   quando expandida; sem sigla derivada em nenhum dos dois estados.
5. Atualizar o comentário de `:35-37`, que registra a escolha de 2026-08-04 —
   ele passa a registrar **por que ela foi revertida**, não some.

**Verificação:** `npm run build`; leitura. Medir com Playwright que a
`boundingClientRect` do `<main>` não muda ao expandir a sidebar (critério do
passo 2) — **verificável por sessão de IA**. Julgar se a expansão em si "lê
bem" fica com o Douglas.

---

### M14 — Nada na tela diz quais botões do controle fazem o quê (P)

**Decisão de design necessária:** nenhuma essencial. O critério fixa: rodapé
fino, só com controle conectado, sem reservar espaço quando não há, e prompts
que refletem o que o hook faz **de verdade** — incluindo a limitação de "B
procura um botão cujo texto começa com 'Voltar'".

**Passos:**

1. `src/hooks/useGamepadNavigation.ts` — passar a devolver
   `{ gamepadConnected: boolean }`. Hoje o hook não devolve nada e detecta o
   pad **dentro do laço de poll**; o estado precisa de `useState` +
   listeners de `gamepadconnected`/`gamepaddisconnected` (mesmo padrão que
   `EmulatorBindingsPanel.tsx` já usa).
2. `App.tsx` — consumir o retorno e renderizar o rodapé condicionalmente.
3. Componente de prompt em `src/components/`. Texto conservador: prometer só o
   que o hook entrega.
4. **Depende de `L1 (Sprint L)`** — o hook de gamepad, não o L1 da Sprint D
   (biblioteca). Ver a nota de colisão de numeração no roadmap.

**Verificação:** `npm run build`; **precisa do Douglas** para confirmar que o
prompt aparece/some ao plugar e desplugar — nenhuma sessão de IA tem controle
físico (mesma limitação estrutural de L3/H3). O caminho "sem controle, nada
aparece" **é** verificável por IA.

---

### M15 — Arestas cosméticas (P)

**Decidido pelo Douglas em 2026-08-07:** os dois acompanham — front e
`defaultLibraryPageSize` do servidor vão a 30 juntos.

**Passos:**

1. `AllGamesScreen.tsx:8` — `PAGE_SIZE` para 30 (múltiplo de 5 e 6, abaixo de
   `maxLibraryPageSize = 100`). `internal/api/server.go`,
   `defaultLibraryPageSize` — também para 30, e [`docs/api.md`](api.md)
   atualizado onde o valor padrão de página é citado.
2. `ui.tsx` — a scanline (`opacity-40`) passa a ser renderizada só quando **não
   há** `coverUrl`.
3. `AllGamesScreen.tsx` — o progresso de "Buscar capas" sai do rótulo do botão
   e vai para a `ProgressBar` que já existe (`ui.tsx`), abaixo dele.

**Verificação:** `npm run build`; **verificável por sessão de IA** (o botão
parar de mudar de largura é mensurável com `getBoundingClientRect`).

---

## Riscos

| Risco | Onde ele aparece | Como este plano o antecipa |
|---|---|---|
| **Botão dentro de botão (M1)** — HTML inválido, e o overlay virar botão exige reestruturar o wrapper | M1 quebra o foco por Tab e por D-pad de uma vez, e a regressão só aparece navegando por teclado | M1 tem o passo 2 explícito, e M2 (antes) garante que o `group`/foco já esteja correto para comparar antes/depois |
| **M5 quebra o fluxo rico de `GamesScreen`** (instalar inline, BIOS vazio) | O caminho mais valioso do produto (L8) some sem ninguém notar, porque `npm run build` passa | M5 tem passo dedicado a preservar esses três blocos, e a verificação repete o roteiro Playwright que fechou o L7/L8 |
| **M8 exige `GET /emulators` numa tela que nunca o carregou** | Uma requisição a mais por abertura da biblioteca, em cima de uma rota que já custou uma otimização inteira (D9) | Registrado no "Estado verificado"; se pesar, cachear na camada de `App.tsx` em vez de por tela |
| **M4 e M3 no mesmo handler Go** | Merge conflict em cima de si mesmo, ou um desfazendo o outro | Ordem fixada (M4 → M3), com o motivo escrito |
| **M3 ganha dependência de Node nova (virtualização)** | Primeira lib de virtualização do front; risco de regressão de acessibilidade se a lib não preservar foco/D-pad ao rolar | Escolher lib headless (`@tanstack/react-virtual`) e testar `Tab`/D-pad explicitamente depois de integrar — mesma verificação dos outros itens de foco |
| **Regressão de acessibilidade acumulada** — M1, M5, M9 e M13 mexem em foco, e o ADR 0009/0014 é o que mais erode | Cada item passa sozinho, o conjunto quebra a navegação por controle | Cada item tem `Tab`/D-pad na verificação, e L3 (verificação com hardware real, aberto) fica como rede final — **mas ela é do Douglas** |
| **Escopo crescer para "prateleiras" e "modo TV"** | A sprint deixa de ter fim | O roadmap já cortou os dois explicitamente (M3 e a nota de inspiração no fim da sprint); este plano não os reabre |

---

## Decisões tomadas pelo Douglas em 2026-08-07

As dez decisões de produto que bloqueavam itens desta sprint foram todas
resolvidas na mesma conversa. Nenhuma ficou pendente — a sprint inteira pode
ser codada sem parar para perguntar de novo. O detalhe de cada uma, com o
raciocínio e os passos que ela muda, está na seção do próprio item; aqui fica
só o registro compacto, na ordem em que foram perguntadas.

| # | Item | Decisão |
|---|---|---|
| 1 | **M10** | Cor associada à marca do fabricante (azul PlayStation, vermelho Nintendo, azul Sega). Marcas vizinhas com cores parecidas se resolvem por tom/brilho, não por matiz |
| 2 | **M3** | `?sort=` em português (`recentes`/`titulo`/`tempo_jogado`) — exceção deliberada à convenção de enum em inglês do `CLAUDE.md`, registrada como tal; tradução para inglês fica para depois |
| 3 | **M3** | Grade virtualizada **entra** nesta sprint, para validar já — ao contrário da recomendação deste plano. Precisa de dependência de Node nova (candidata: `@tanstack/react-virtual`); o pedido explícito do Douglas já cobre a exigência do `CLAUDE.md` de não instalar dependência sem pedir |
| 4 | **M1** | Botão "Tentar de novo" dentro do `ErrorModal`, não só clicar o ▶ de novo |
| 5 | **M4** | Estado preservado sobe para `App.tsx` (opção a) |
| 6 | **M7** | Badge de plataforma sobe de `9px` para `11px`, mantendo a fonte pixel. "Podemos alterar depois se não ficar bom" |
| 7 | **M8** | Texto aprovado, com uma condição: o badge precisa trazer o motivo, não só o fato. Resolvido reaproveitando `verdict.bottlenecks` (ver item M8) |
| 8 | **M9** | `Select` do shadcn |
| 9 | **M13** | Rail que expande no hover/foco (não a sigla escrita à mão) |
| 10 | **M15** | `PAGE_SIZE` do front e `defaultLibraryPageSize` do servidor vão juntos a 30 |

---

## O que uma sessão de IA consegue fechar sozinha, e o que não

Mesma honestidade que o D11, o B11 e o L3 já impõem a este roadmap.

**Atualizado em 2026-08-07 (Lote 2):** M1, M2, M3 e M4 já passaram pela parte
"fechável por sessão de IA" — código pronto e testado ao vivo com
Chromium/Playwright contra um `zeuxd` real (não só `go test`/`npm run build`),
biblioteca semeada com 45 ROMs falsas em 2 consoles. O teste ao vivo achou e
corrigiu um bug real (restauração de rolagem do M4, ver o item no roadmap) —
prova de que "compila" não é o mesmo que "funciona". Os itens da lista abaixo
que precisam do Douglas continuam precisando; o que mudou é que a parte
mecânica de M1/M2/M3 saiu de "não verificado" para "verificado, falta só o
julgamento visual" — e o M1 especificamente teve a densidade de fileiras
**medida e não batendo o alvo** (2 fileiras cheias em 1280×800, não 3),
registrado no próprio item do roadmap.

**Atualizado em 2026-08-07 (Lote 3): M5 fechou** — zero checkbox aberto,
único item da sprint sem nenhuma ressalva pendente do Douglas. Testado ao
vivo o roteiro inteiro previsto na verificação do item: apontar pasta →
`GamesScreen` com o tile novo → favoritar → abrir detalhe → voltar pro lugar
certo → clicar no ▶ e disparar `handlePlay` de verdade (bateu no erro real
do RetroArch empacotado, ADR 0012 — a mesma armadilha que fechou o L8). Uma
decisão de arquitetura não prevista no plano original: o botão "Jogar"
full-width de `GamesScreen` saiu, para consistência com o M1 — ver a nota no
próprio item do roadmap sobre a lacuna de teclado/controle que isso herda
(fica para o M6 fechar).

**Atualizado em 2026-08-07 (Lote 4): M6.** Reaproveitou `ConsoleVerdictCard`
em vez de escrever texto novo — corrige de quebra uma afirmação errada do
próprio plano ("esse dado só aparece hoje em `GamesScreen`": conferido no
código, nunca apareceu lá, só era usado internamente). Testado ao vivo com
um jogo em patamar "ótimo" (emulador+preset visíveis) e um em "improvável"
(headline + gargalos nomeados, sem preset) — os dois batendo o esperado.
**Uma peça não pôde ser verificada nesta sessão:** "abrir a pasta do jogo"
precisou de `revealItemInDir` (não `openPath`) e de uma permissão nova em
`src-tauri/capabilities/default.json` — mudança em `src-tauri`, que esta
sessão não pode compilar nem rodar (sem Rust instalado, ADR 0004). O lado do
front foi confirmado (falha graciosa fora do Tauri), a permissão em si
precisa do Douglas num build real.

**Atualizado em 2026-08-07 (Lote 5): M8 fechou** — zero checkbox aberto no
critério original (a checagem "este jogo pode abrir?" e a instalação inline
compartilhadas entre as duas telas, confirmadas por `grep`). Testado ao vivo
com biblioteca semeada (SNES sem emulador instalado, PS Vita sem preset): a
grade e a lista de `AllGamesScreen` mostraram os badges certos, e clicar em
"instalar emulador" disparou a mesma chamada real que já fechava o L8 em
`GamesScreen` — o erro genuíno do RetroArch empacotado (ADR 0012) apareceu no
`ErrorModal`, não um texto inventado. Peça nova, registrada como não
verificável nesta sessão: os dois estados de confirmação
(`confirm-hardware`/`confirm-bios`) viraram `ConfirmModal` em vez do painel
inline de `GamesScreen` — decisão forçada pela virtualização (M3), não pelo
critério do item — mas o hardware desta máquina de teste não bloqueia nenhum
adapter instalável, então a transição não pôde ser observada ao vivo (só por
`npm run build`/revisão de código). Ver a nota completa no item do roadmap.

**Fechável por sessão de IA** (Playwright/Chromium contra um `zeuxd` real, mais
`go test` e `npm run build`): M4, M5, M6, M8, M9, M12, M13, M15 — e as partes
mecânicas de M1, M2, M3, M11.

**Precisa do Douglas olhando a tela de verdade:**
- **M2** — se as cores de dois consoles são distinguíveis lado a lado.
- **M1** — quantas fileiras cabem na janela real do Tauri (o número medido
  entra no critério de aceite do item, no roadmap).
- **M3** — se o modo lista ficou legível na densidade escolhida.
- **M7** — se o badge menor/maior ficou legível.
- **M10** — a tabela de cores inteira. É decisão de design.
- **M14** — o prompt aparecendo e sumindo ao plugar/desplugar um controle.
  Nenhuma sessão de IA tem controle físico (mesma limitação de L3/H3).

**Fora do alcance de qualquer sessão desta sprint:** confirmar que a navegação
por controle continua correta depois de M1/M5/M9/M13 mexerem no foco. Isso é o
**L3 (Sprint L)**, que já está aberto e é do Douglas — mas vale rerodá-lo
**depois** da Sprint M, não antes, porque os itens acima mudam exatamente os
elementos focáveis que ele testa.

---

## Critério de saída

O da Sprint M já está escrito no [roadmap](roadmap.md) e não se repete aqui.
O que este plano acrescenta é **quando ele pode ser avaliado**: só depois de
M5, porque é ele que faz "as duas telas de jogos desenharem o mesmo jogo do
mesmo jeito" — a última cláusula do critério, e a que não tem como ser
aproximada por nenhum outro item.
