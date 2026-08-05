# 0013 — Identidade visual neon única, substituindo os três temas escolhíveis

**Status:** Aceito

## Contexto

O ZeuX tinha três identidades visuais escuras trocáveis (fósforo/cartucho/
sala escura, via `ThemePicker`) — cada uma com temperatura e acento
próprios, decisão registrada só como comentário em `src/index.css` e no
docstring de `ThemePicker.tsx` (nunca teve ADR dedicado).

Em 2026-08-04 o Douglas trouxe um mockup de referência (pasta `layout/`,
export do Figma Make) com uma identidade "arcade retrô neon" única: fundo
quase-preto azulado (`#080C17`), acento roxo neon (`#9D4EFF`), fonte pixel
`'Press Start 2P'` para chrome de navegação. O pedido foi migrar o app real
para essa direção, questionando/melhorando o que o mockup faz mal (ver
plano de sprints — inline style com hex fixo em vez de tokens, fonte pixel
em corpo de texto, fonte carregada por CDN em runtime).

## Decisão

Os três temas saem. Uma paleta neon única entra no lugar, mantendo os
*mesmos nomes* de token que já existiam (`--paper`, `--panel`, `--ink`,
`--muted`, `--line`/`--line-strong`, `--fill`/`--fill-strong`, `--accent`/
`--accent-hover`/`--accent-ink`, `--amber`*, `--danger`) — nenhuma classe
Tailwind precisou mudar por causa disso, só os valores em `src/index.css`.

`ThemePicker.tsx`/`useTheme` foram removidos, junto com o script de
prevenção de flash em `index.html` (não há mais tema pra escolher, então
não há mais flash a evitar) e o atributo `data-theme`.

Token novo: `--accent-secondary` (ciano `#00E5FF`), decorativo — nunca
reaproveitado para foco ou interação primária. Documentado explicitamente
porque o próprio mockup em `layout/` cai nessa armadilha (define um
`--secondary` e quase não usa).

Fontes: `Press Start 2P` e `Inter` (pesos 400/500/600/700) via
`@fontsource/*`, self-hospedadas — nunca `@import url('https://fonts.
googleapis.com/...')`, que é como o mockup carrega (inviável para um app
desktop que precisa continuar legível sem rede depois de instalado). A
fonte pixel fica restrita a chrome de navegação (labels da sidebar, títulos
de seção curtos, badges) — nunca parágrafo, descrição ou mensagem de erro —
com piso de 11px (o mockup usa a partir de 5.5px, ilegível fora de uma tela
de design).

Contraste verificado (WCAG, luminância relativa) contra `--paper`: roxo
`--accent` 4.62:1 (passa AA para texto normal, relevante porque o ADR 0009
exige foco perceptível por teclado), ciano 12.7:1, laranja `--amber` 6.85:1.

## Consequências

**Positivas**

- Uma identidade visual só, sem a decisão "qual tema escolher" no primeiro
  uso — o mockup do Douglas já resolveu essa pergunta de produto.
- Vocabulário de token preservado: telas escritas contra `--accent`/
  `--paper`/etc. continuam funcionando sem reescrita, só a paleta embaixo
  mudou.
- Fontes offline-safe, ao contrário do mockup de referência.

**Negativas / custos aceitos**

- Perde a opção de personalização visual que os 3 temas ofereciam — decisão
  de produto do Douglas, não técnica.
- Quem já tinha uma preferência salva (`localStorage["zeux-theme"]`) perde
  esse valor silenciosamente — a chave simplesmente não é mais lida. Não
  há migração porque não há mais nada para migrar para.

## Gatilho para revisão

Se o produto algum dia quiser voltar a oferecer identidades visuais
trocáveis (ex.: um tema "claro" para quem prefere, ou variações da própria
paleta neon), reabrir esta decisão — o vocabulário de token já está pronto
para isso, só faltaria reintroduzir o seletor e um segundo (ou terceiro)
conjunto de valores.
