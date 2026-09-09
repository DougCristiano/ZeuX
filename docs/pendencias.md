# Pendências

Trabalho **planejado, mas ainda não implementado** — confirmado por leitura
do código em 2026-09-07, não por suposição. Backlog honesto: se alguma coisa
aqui já tiver sido feita quando você ler isto, o documento está desatualizado
— confira contra o código antes de confiar.

Formato por item: o que é, por quê, critério de aceite (quando já foi
desenhado), do que depende.

---

# Roadmap de UX — "o app como app" (2026-09-09)

**Origem:** o Douglas instalou a v0.1.22 e testou com controle real, e uma
crítica de design (agente `critico-design`) percorreu as telas. Os dois
apontaram para o mesmo lugar. Resumo da conversa que gerou este bloco:

- O app é **consistente** (paleta com regra, vocabulário de botão fechado)
  mas não é **impactante** — falta o momento "uau". O pedido explícito do
  Douglas: *"quero que fique bem bonito e não tô sentindo isso. Dê mais
  destaque para o console."*
- Cair direto em "Todos os jogos" (grade de capas iguais) é uma primeira
  impressão fraca — falta uma página inicial de destaque.
- Duas trilhas em paralelo: **A — deixar bonito e console-forward**;
  **B — deixar completo e confiável** (os becos sem saída e o vocabulário
  sem tradução que a crítica achou).
- **Tema criado pelo usuário** é uma iniciativa à parte, maior (pesquisa
  feita, ver "Sistema de temas" abaixo).

Ordem proposta: B1 (foco do controle — **feito**, v0.1.23) → Sprint 1 (a
home) → Sprint 2 (não trava) → Sprint 3 (organização) → Sprint 4 (temas).

---

## Trilha A — bonito e console-forward

### A1 — Página inicial de destaque (fase `home` nova)

**O problema:** depois do scan, `App.tsx` cai direto em `all-games`
(`setPhase("all-games")`). Não há tela inicial. A grade de capas trata o
jogo de ontem igual ao que nunca foi aberto, e o console — o diferencial do
produto — não aparece em lugar nenhum de destaque.

**Direção levantada (o Douglas ainda não fechou a "cara"):** uma fase `home`
antes de `all-games`, com:

1. **Hero** — arte do último jogo jogado ao fundo (desfocada, tingida na cor
   do console), "▶ Continuar". Usuário sem histórico: o estado de boas-vindas
   / "aponte sua pasta" (encosta no item de onboarding, abaixo). Reaproveita
   `GameHero`.
2. **Prateleira "Seus consoles"** — cards grandes (~180px, contra os 64px de
   hoje) com a **imagem real do console** (`GET /consoles/{id}/image`, já
   embutida), nome, ano, e estado ("12 jogos · pronto pra jogar" /
   "3 jogos · falta emulador"). Clicar → os jogos daquele console. Rolável na
   horizontal.
3. **Rodapé de estatística** — "3 h 20 min jogados · 5 consoles prontos"
   (dados de `GET /sessions` + `GET /consoles/verdicts`, sem rota nova).

**Decisões em aberto antes de implementar:**
- A `home` é sempre a tela de entrada, ou só quando há histórico? (Sem
  histórico ela vira quase o onboarding — vale unir os dois?)
- Ela substitui `all-games` como destino do item "Biblioteca" da sidebar, ou
  é um sexto item / a "Biblioteca" abre a `home` e "todos os jogos" é uma
  sub-visão?
- Encaixe na máquina de estados de `App.tsx` sem somar tempo ao boot de quem
  só quer abrir o jogo de sempre (mesmo cuidado do splash).

**Depende de:** decisão de produto sobre a "cara" da home · **Bloqueia:** A2
(compartilham o card de console)

### A2 — Cards de console grandes (Consoles + prateleira da home)

**O problema:** `ConsoleIcon` é `h-16 w-16` (64px) — já subiu de `h-12`
uma vez (2026-09-07, achado do Douglas) e ainda está pequeno. A tela de
Consoles é uma grade desses selos.

**Escopo:** um componente `ConsoleCard` (~180px) com arte real do console,
nome, ano, cor da marca (`--console-accent`, já existe) e estado de
prontidão. Usado na prateleira da home (A1) e na grade da tela de Consoles.
`ConsoleIcon` continua para os lugares pequenos (badge de plataforma no tile
de jogo, chip).

**Critério de aceite:**
- [ ] Tela de Consoles usa `ConsoleCard`, não a grade de selos 64px.
- [ ] A arte real aparece; sem arte em cache, cai para `ConsoleIcon` (a
      lógica de fallback já existe).
- [ ] `lg`/`xl` da grade descontam sidebar + scrollbar (regra do CLAUDE.md).
- [ ] Alcançável e visivelmente realçado pelo controle (o cursor de
      `data-gamepad-focused`).

**Depende de:** nada · **Bloqueia:** nada

### A3 — Filtro por fabricante (Sony → todos os PlayStation)

**O problema:** não dá pra ver "só os consoles da Sony". E o catálogo
**não tem esse dado** — `internal/verdict/data/consoles.json` só tem
`id`, `name`, `short_name`, `year`, `extensions`, `tiers`.

**Escopo:**
1. Adicionar `manufacturer` às 33 entradas de `consoles.json` (Sony,
   Nintendo, Sega, SNK, Microsoft, NEC, Atari, Bandai…). Trabalho mecânico,
   sem pesquisa individual difícil.
2. Expor `manufacturer` em `GET /consoles` (e `verdicts`).
3. Chips de fabricante na tela de Consoles (e, se fizer sentido, na
   Biblioteca — filtrar jogos por fabricante do console).

**Critério de aceite:**
- [ ] `consoles.json` ganha `manufacturer` em toda entrada; um teste em
      `internal/verdict` trava que nenhuma fica sem.
- [ ] `GET /consoles` devolve o campo.
- [ ] Chips de fabricante filtram a tela de Consoles; "todos" limpa.
- [ ] Ordem alfabética por nome do fabricante nos chips.

**Depende de:** nada · **Bloqueia:** nada

### A4 — Ordenar consoles por ano de lançamento

**O problema:** a tela de Consoles não tem ordenação escolhível. `year` já
existe no catálogo — falta só a UI.

**Escopo:** seletor "Mais antigos / Mais novos / A–Z" na tela de Consoles,
espelhando o `?sort=` que a tela de jogos já tem. Preferência de tela,
guardada em `localStorage` (mesmo padrão de `AllGamesScreen`).

**Critério de aceite:**
- [ ] Três ordens; a escolha sobrevive a reabrir o app.
- [ ] Sem rota nova — a ordenação é no cliente (a lista de 33 é pequena).

**Depende de:** nada · **Bloqueia:** nada

### A5 — Polimento de impacto (o "uau")

Itens soltos de peso visual, sem uma entrega única:

- **Cor do console no `GameHero` e `GameDetailScreen`** — hoje só
  `ConsoleDetailScreen` usa `--console-accent`. Um filete de 3px na cor do
  console reaproveita o vocabulário já estabelecido (`ConsoleVerdictCard`,
  `EmulatorCard`).
- **Transição ao abrir um console** — a arte cresce em vez de um corte seco.
- **Revisar o peso do hero** — fonte maior, mais respiro, a arte ocupando
  mais da largura.

**Depende de:** nada · **Bloqueia:** nada · Não tem critério de aceite
fechado — é polimento contínuo.

---

## Trilha B — completo e confiável

Vieram da crítica de design (`critico-design`, 2026-09-09). Ordem por
gravidade.

### B1 — Foco visível na navegação por controle — **FEITO (v0.1.23)**

O `.focus()` programático não aciona `:focus-visible` no WebView2, e o
realce estava todo em `focus-visible:`. Resolvido com `data-gamepad-focused`
+ realce forte no `index.css`, pouso automático e exclusividade em relação a
mouse/teclado. Ver `decisoes.md`. **Continua em aberto:** marcar
`data-gamepad-start` nas telas que não receberam (Consoles, Emuladores,
Configurações) — uma linha por tela.

### B2 — Saída no `ErrorModal` de lançamento + cadastro manual acessível

**O problema:** clicar em "Jogar" e falhar com "emulador não encontrado"
(`AllGamesScreen`/`GamesScreen`/`GameDetailScreen`) leva a um modal com só
"Fechar" e "Tentar de novo" — relançar exatamente o que falhou. Quem **já
tem** o emulador instalado num drive que o `findBinary` não alcança (outro
disco, pasta pessoal — armadilha do CLAUDE.md) não tem saída nenhuma dentro
do app. E o `ManualEmulatorForm` está a 4 cliques, no rodapé de uma tela
(`EmulatorsScreen`) que a sidebar despromoveu de propósito.

**Escopo:**
1. `ManualEmulatorForm` acessível de `ConsoleDetailScreen` — um botão ao fim
   da coluna "Como rodar": *"Já tenho um emulador de PS1 — apontar o
   executável."* O componente já é reusável; é montá-lo ali. **Fazer
   primeiro.**
2. Terceira ação no `ErrorModal` de lançamento quando o motivo é emulador
   ausente: *"Já tenho esse emulador — apontar onde ele está"*, levando ao
   form pré-preenchido com console + adapter esperados.
3. `ManualInstallModal` (fonte manual) ganha o mesmo botão "já está
   instalado — apontar" — hoje só o caminho "instalar por fora" tem
   superfície guiada.

**Critério de aceite:**
- [ ] De `ConsoleDetailScreen`, chega-se ao `ManualEmulatorForm` em 1 clique.
- [ ] O `ErrorModal` de "emulador não encontrado" oferece apontar o binário.
- [ ] O form abre pré-preenchido (console + adapter) quando vem desses
      caminhos.
- [ ] `ErrorModal` aceita uma ação extra sem quebrar as chamadas atuais.

**Depende de:** nada · **Bloqueia:** nada

### B3 — Frases de tradução no ponto de uso

**O problema:** o produto se vende como "sem precisar aprender vocabulário
de emulador", mas quando *core*, *BIOS* e *preset* aparecem, não há uma
frase que os traduza. O único texto explicativo é "O ZeuX baixa este core
sozinho…" — que explica o comportamento, não o conceito. E os 2 emuladores
de PS1 aparecem com "é o escolhido" sem um *porquê*.

**Escopo (custo quase só de redação):**
1. **"Por que este emulador"** — subtexto ao lado de `isChosenEmulator` em
   `ConsoleDetailScreen`, vindo do catálogo: *"Dedicado ao PS1 — o ZeuX
   configura upscaling e controle sozinho. O RetroArch também roda, com mais
   ajuste manual."* (~10 frases, só os consoles multi-emulador.)
2. **Aposto no "core" e no "BIOS"** no lugar onde aparecem:
   *"Core (a peça do RetroArch que emula este console)"* ·
   *"O BIOS é um arquivo original do console; o ZeuX não distribui — vem do
   aparelho de quem tem um."* Reusa o `Callout`.
3. **Opcional, só se (1) e (2) não bastarem em teste real:** um "?" no
   cabeçalho de `ConsoleDetailScreen` com 4 parágrafos "o que o ZeuX faz por
   você". **Um** na hierarquia toda, não um por card.

**Não fazer:** tooltip em hover (viola ADR 0009), item de glossário na
sidebar.

**Critério de aceite:**
- [ ] Todo console multi-emulador tem a frase "por que este".
- [ ] "core" e "BIOS" aparecem sempre com o aposto na primeira menção da
      tela.
- [ ] i18n pt-BR/en.

**Depende de:** A3 (o campo do catálogo pode carregar junto a frase) ·
**Bloqueia:** nada

### B4 — Rail da sidebar com rótulo permanente

**O problema:** `Sidebar.tsx` esconde o rótulo (`max-w-0 opacity-0` até
`hover`/`focus-within`). Cinco ícones lucide genéricos — `Cpu` =
"Especificações"? `Gamepad2` = "Consoles"? — não são adivinháveis, e a
sigla já foi tentada e descartada (comentário no arquivo). Quem usa mouse e
não passa o cursor por cima nunca sabe onde está.

**Escopo:** `w-16` → `w-20`, ícone 18px + `text-[10px]` do rótulo por baixo,
centralizado. "Especificações" não cabe — renomear para **"Máquina"** (o
conteúdo é "o que este PC alcança", comunica melhor). Isso elimina a
expansão em hover inteira e, junto, o `e.currentTarget.blur()` defensivo
documentado no arquivo.

**Critério de aceite:**
- [ ] Rótulo visível em repouso, sem hover.
- [ ] "Especificações" → "Máquina" em `PHASE_TITLES`, `Sidebar.i18n.ts` e
      onde mais aparecer.
- [ ] A expansão em hover e o `blur()` defensivo saem.
- [ ] Cursor do controle alcança cada item.

**Depende de:** nada · **Bloqueia:** nada

### B5 — Indicador "um jogo está rodando agora" no shell

**O problema:** o backend tem sessão e `is_running` (`GET /sessions`), a
tela de Histórico existe, mas o shell não mostra nada. Quem minimiza o ZeuX
com o emulador aberto volta a uma tela idêntica à de antes.

**Escopo:** uma faixa fina no topo do `<main>` (ou reusar o `Toast`) —
*"PlayStation 2 · Shadow of the Colossus · em andamento"* — enquanto
`GET /sessions` reporta uma sessão `is_running`.

**Critério de aceite:**
- [ ] Com sessão em andamento, a faixa aparece; sem, some e não reserva
      espaço.
- [ ] Some sozinha quando o emulador fecha (o poll de `GET /sessions` já
      existe em várias telas).

**Depende de:** nada · **Bloqueia:** nada

### B6 — `prefers-contrast` + toggle "Efeitos visuais"

**O problema:** `index.css` respeita `prefers-reduced-motion` com rigor e
**ignora `prefers-contrast`**. As scanlines/glow são decorativas fixas, sem
escape — problema real para quem joga em sala clara ou tem fotossensibilidade.

**Escopo:**
1. Um bloco `@media (prefers-contrast: more)` em `index.css`: sobe `--muted`
   para perto de `--ink`, troca `--line` por `--control-border`, zera
   `.zeux-scanlines` e a opacidade do `AmbientGlow`. ~15 linhas, zero UI nova.
2. Em Configurações, um controle **"Efeitos visuais: completo / reduzido"**
   (não "Tema") que aplica a mesma classe via `data-*` no root + uma linha
   em `localStorage`.

**Isto é pré-requisito de "tema claro"** (Sprint 4): um tema que vira o app
claro de verdade precisa que scanline/glow/logo-sobre-branco tenham um modo
desligado.

**Critério de aceite:**
- [ ] `prefers-contrast: more` do SO já muda o app sem nenhum clique.
- [ ] O toggle em Configurações sobrevive a reabrir o app.
- [ ] "reduzido" desliga scanlines e glow, mantém o escuro.

**Depende de:** nada · **Bloqueia:** Sprint 4 (temas claros)

### B7 — Chave i18n `weakHardware` → `hardwareBelowRecommended`

**O problema:** a mesma string ("Hardware abaixo do recomendado") vive em 6
dicionários sob **duas chaves**: `weakHardware`
(`AllGamesScreen.i18n.ts`, `EmulatorsScreen.i18n.ts`) e
`hardwareBelowRecommended` (`ConsoleDetailScreen`, `GameDetailScreen`,
`GamesScreen`). O texto respeita o princípio 2, mas o **nome da chave
`weakHardware` contradiz o princípio 2 por escrito** e vai puxar a tradução
para "weak hardware" quando alguém traduzir sem ler o valor.

**Escopo:** padronizar em `hardwareBelowRecommended` nos arquivos que usam
`weakHardware`. Considerar um dicionário compartilhado para as ~8 strings de
confirmação de instalação replicadas em 5 telas.

**Depende de:** nada · **Bloqueia:** nada · Dívida barata.

---

## Sistema de temas criados pelo usuário

**Origem:** pedido do Douglas em 2026-09-09 — *"queria dar a possibilidade
do usuário fazer um tema e enviar. Existem vários projetos que deixam fazer
isso."* Pesquisa feita nesta data.

**Como os projetos de referência fazem:**

- **Obsidian** (`docs.obsidian.md/Themes`): tema = `manifest.json`
  (metadados) + `theme.css` que **sobrescreve variáveis CSS**. Distribuição
  por um diretório da comunidade backed no GitHub; instala e atualiza de
  dentro do app; a equipe **escaneia** os temas por segurança.
- **EmulationStation / Playnite / LaunchBox** (`THEMES.md`): tema = pasta
  com **XML** descrevendo posição/cor/tamanho de cada elemento por "view".
  Muito mais poderoso e muito mais caro de manter.
- **VS Code**: tema = JSON de tokens de cor, publicado no marketplace.

**O ZeuX já está no formato certo:** todo o visual do `index.css` são custom
properties (`--accent`, `--ink`, `--console-accent`, opacidade de scanline…).
Um tema é literalmente um mapa de token → valor.

**Recomendação — em fases:**

### T1 — Tema local por `theme.json` (sem servidor)

O ZeuX lê arquivos de uma pasta `themes/` no config do usuário. Cada tema é
um **mapa de tokens validado** — `{"accent": "#e11d48", "scanline_opacity":
0.1, ...}`, **nada de CSS cru**. Em Configurações: escolher tema, "Exportar
meu tema" (copia o JSON), "Importar" (aponta arquivo / cola). Um amigo manda
o `.json` por qualquer meio. **Zero infra.** O "efeitos reduzidos" do B6
vira um tema embutido.

**Por que `theme.json` e não CSS cru:** CSS de terceiro num WebView Tauri
pode ter `url()`/`@import` apontando pra fora (vazamento) ou quebrar layout
inteiro. Um mapa de tokens validado no máximo deixa o app feio, nunca
inseguro. CSS cru + sanitização (o caminho do Obsidian) fica para T2+.

**Critério de aceite:**
- [ ] `theme.json` inválido (token desconhecido, cor malformada) é recusado
      com erro nomeado em pt-BR — não aplica pela metade.
- [ ] Sem tema escolhido, o app usa o embutido; a escolha sobrevive a
      reabrir.
- [ ] "Exportar" produz um `theme.json` que "Importar" aceita de volta
      idêntico (round-trip).
- [ ] Um tema só mexe em cor/opacidade/raio — nunca em layout, fonte de
      terceiro, ou qualquer coisa que faça requisição.
- [ ] Testes: token válido aplica / token inválido recusa / round-trip.

### T2 — Editor visual de tema

Uma tela "Criar tema" com color pickers ao vivo — a mudança aparece na hora.

### T3 — Compartilhar de verdade (diretório da comunidade)

Estilo Obsidian — mas **isto é a parte de servidor** que fica fora deste
documento por enquanto (ver "O que fica fora"). T1 entrega o compartilhamento
por arquivo; T3 é o índice navegável.

**Limite honesto:** o redesenho arcade/CRT tem lógica que não é só cor
(scanlines, glow, logos sobre fundo branco). Um tema de tokens muda cores e
intensidade de efeito bem; um tema que vira o app "claro" de verdade precisa
do B6 primeiro.

**Depende de:** B6 (para temas claros) · **Bloqueia:** nada

---

## RetroAchievements — nada implementado ainda

**Status confirmado:** zero linha de código (`grep -rli retroachievements
internal/ src/` não acha nada).

**Origem:** especificação externa trazida pelo Douglas em 2026-08-26. Fica
**pós-v1.0** por prioridade — não é o primeiro item da fila.

**Duas coisas precisam ser confirmadas antes de qualquer estimativa virar
compromisso** (nenhuma foi verificada):

1. **O ZeuX não desbloqueia conquista nenhuma.** Quem faz isso é o emulador
   (RetroArch e alguns standalone têm suporte próprio a RetroAchievements).
   O escopo aqui é **exibir**, e possivelmente **configurar as credenciais
   dentro do emulador** pela tela do ZeuX (a rota de config de emulador já
   existe, ver `api.md`). Se alguém desenhar isto como "o ZeuX rastreia o
   jogo e concede a conquista", o item está errado.
2. **O hash do RetroAchievements não é um MD5 do arquivo.** Eles usam um
   cálculo próprio por sistema (cabeçalho descartado, trilha de CD
   específica, etc.). Antes de assumir que a busca de capas (IGDB) resolve
   isso de graça, alguém precisa ler a documentação/implementação de
   referência deles. Pode ser que sejam dois hashes diferentes convivendo.

### P1 — Conectar a conta do RetroAchievements

Sem credencial não há nada para mostrar. Mesmo princípio das capas via IGDB:
conta **do usuário**, nunca uma chave do ZeuX compartilhada — uma credencial
de teste compartilhada já se mostrou custar caro antes (ver `decisoes.md`).

**Critério de aceite:**
- [ ] Tela em Configurações aceita usuário + chave de API, guardada
      localmente com o mesmo cuidado da credencial do IGDB (nunca no
      repositório, nunca embutida no binário).
- [ ] Credencial inválida devolve erro nomeado e em português, distinguindo
      "credencial recusada" de "o serviço não respondeu".
- [ ] Sem conta conectada, nada na interface muda — nenhuma seção vazia
      ocupando espaço.
- [ ] Teste roda sem rede, contra servidor de mentira: conectou / recusou /
      caiu.

**Depende de:** nada · **Bloqueia:** P2, P3

### P2 — Resolver o jogo pelo hash e trazer as conquistas

**Critério de aceite:**
- [ ] Dado um jogo da biblioteca, calcula o identificador que o
      RetroAchievements espera **para aquele console** e consulta conquistas
      + o que já foi desbloqueado.
- [ ] Jogo não reconhecido devolve **desconhecido**, nunca as conquistas de
      um jogo parecido — mesma regra do parecer parcial.
- [ ] Resultado cacheado localmente (tabela nova, migração em
      `internal/store/migrations/`); abrir a mesma tela duas vezes não
      dispara duas requisições.
- [ ] Consulta é sob demanda (abrir o jogo), nunca varredura silenciosa da
      biblioteca inteira.
- [ ] Código comenta **qual** algoritmo de hash foi implementado e contra
      qual documentação foi conferido. Console não coberto devolve
      desconhecido, nunca chuta.
- [ ] Testes sem rede: reconhecido / não reconhecido / resposta malformada /
      serviço fora.

**Depende de:** P1 · **Bloqueia:** P3

### P3 — Badges na tela do jogo

**Critério de aceite:**
- [ ] Tela de detalhe do jogo ganha seção com conquistas: ícone, título,
      descrição, desbloqueada ou não, contador (`12/40`).
- [ ] Imagens de badge vêm de arquivo local já baixado, nunca URL de
      terceiro direto no WebView — mesma regra da capa de jogo.
- [ ] Alcançável só com Tab/Enter e pelo controle, sem depender de hover.
- [ ] Texto não julga o jogador: "12 de 40 conquistas", nunca "você só
      conseguiu 12".
- [ ] Sem rede, mostra o que já está em cache; sem cache, a seção some — a
      tela de jogo nunca quebra por causa disto.

**Depende de:** P2 · **Bloqueia:** nada

---

## Onboarding para quem abre o app sem nenhuma ROM ainda

**Origem:** achado do Douglas em 2026-09-07, depois do redesenho visual —
"o app fica muito cru para esse público que vai entrar e não ver nada".

**O problema:** hoje o percurso de zero é consentimento → scan → tela "Todos
os jogos" **vazia**, com um `EmptyState` e um botão "Escolher pasta com
jogos" (ver `docs/visao-do-produto.md`, história "Do zero ao primeiro
jogo"). Isso cobre a ação mínima, mas não apresenta o app: quem nunca usou
emulador não sabe o que esperar depois de apontar a pasta, o que é um
"parecer de compatibilidade", ou que o ZeuX resolve emulador/preset sozinho.
A primeira impressão de quem não tem ROM nenhuma ainda é uma tela quase em
branco, sem contexto.

**Feito em parte (2026-09-09):** o `EmptyState` de "Todos os jogos" virou a
versão com passos numerados (opção "só uma versão mais rica do `EmptyState`
atual", abaixo) — aponte a pasta · o ZeuX lê o hardware e diz o que cada
console alcança · clique no jogo. Ver `decisoes.md`. O que **continua em
aberto**: o modo tutorial/wizard dedicado e as perguntas de quando exibir /
onde entra na máquina de estados de `App.tsx` / console de exemplo.

**Ideia levantada, não desenhada ainda:** um modo tutorial/passo-a-passo
logo após a instalação (ou logo após o consentimento, antes do scan) que
explique o que o app faz, sem story vazio. Nada disto foi decidido:

- Quando exibir: só na primeira execução (mesmo padrão do splash,
  `localStorage`), ou sempre que a biblioteca estiver vazia (repete se a
  pessoa remover todas as pastas depois)?
- Conteúdo: um carrossel/wizard curto explicando consentimento → scan →
  apontar pasta → parecer → jogar? Ou só uma versão mais rica do
  `EmptyState` atual, com passos numerados em vez de um botão solto?
- Onde entra na máquina de estados de `App.tsx` (mesmo cuidado do splash:
  não pode atrasar quem já tem pasta apontada, e não pode ser uma `Phase`
  que soma tempo ao boot de quem só quer abrir o jogo de sempre).
- Vale mostrar um console de exemplo (sem jogo de verdade — nunca ROM) só
  pra ilustrar como fica um card "pronto pra jogar" vs. "falta componente
  X"? Isso pode ler como dado falso se não ficar claro que é ilustrativo —
  cuidado editorial, não só técnico.

**Depende de:** nada · **Bloqueia:** nada. Não teve critério de aceite
desenhado ainda — é ideia registrada, não especificação pronta para
implementar.

## Redesenho visual — telas restantes

**Concluído em 2026-09-09** (ver `decisoes.md`, "Redesenho arcade/CRT
estendido às telas do início e a Configurações"). O redesenho de 2026-09-07
cobriu 7 telas; esta rodada terminou o restante:

- ~~`ConsentScreen.tsx`, `DeclinedScreen.tsx`, `StatusScreen.tsx`~~ — kicker
  monoespaçado em ciano, linhas de CRT decorativas, "Agora não"/"Continuar
  sem autorizar"/"Ver emuladores" descidos para `chrome`, erro de conexão
  agora no `InlineError` do app.
- ~~`VerdictScreen.tsx`~~ — subtítulo no cabeçalho e `SectionHeading`
  ("Componentes") antes da grade de specs; texto de hardware continua
  descritivo e o aviso `parcial` intacto.
- ~~`SettingsScreen.tsx`~~ — passada completa: todo `secondary` de chrome de
  app virou `chrome`, subtítulos `text-primary` viraram kicker monoespaçado,
  "Desconectar" ganhou `CHROME_TINT_DANGER`.
- ~~`ControllerTestScreen.tsx`~~ — já estava no vocabulário novo (refeita em
  2026-09-08 com foto real + realce ciano); só o botão "Parar teste" solto em
  `secondary` virou `chrome`.

**Limpeza feita junto:** `LibraryScreen.tsx` passou a importar
`CHROME_TINT_INFO`/`CHROME_TINT_DANGER` de `ui.tsx` no lugar das duas strings
de tingimento inline (sem mudança visual).

**Depende de:** nada · **Bloqueia:** nada

## Manifesto de cores do RetroArch: decisão de escopo em aberto

Não é uma feature faltando — é uma escolha de arquitetura ainda não tomada.
Detalhe completo em `decisoes.md` ("RetroArch: cores baixados sob demanda").
Resumo: o manifesto de hash fica obsoleto sozinho porque a URL de origem é
`latest` (o buildbot reconstrói periodicamente). Duas saídas possíveis,
nenhuma escolhida ainda:

- Aceitar que isso volta a acontecer e regenerar manualmente quando alguém
  reportar (caminho atual, sem trabalho extra).
- Buildar contra uma versão pinada/datada do core em vez de "latest"
  (elimina o problema, muda a URL do manifesto e o gerador).

---

## Multi-disco: agrupar "(Disc 1)"/"(Disc 2)" e lançar como playlist

**Origem:** pedido do Douglas em 2026-09-09, junto do título editável. O
título editável foi entregue nessa rodada; o multi-disco foi separado por
esbarrar na regra de `BuildCommand` pura (ver `decisoes.md`, "Multi-disco:
adiado").

**O problema:** jogos de PS1/PS2 divididos em vários discos entram como
entradas independentes na biblioteca — "Final Fantasy VII (Disc 1)",
"(Disc 2)", "(Disc 3)" viram três cards, e trocar de disco no meio do jogo
não tem caminho.

**Escopo mínimo desenhado (não implementado):**

1. **Detecção na varredura** (`internal/library/scan.go`): agrupar arquivos
   do mesmo diretório cujo nome só difere pelo trecho `(Disc N)` / `(Disco N)`
   (aparar essa etiqueta e comparar o resto, do mesmo jeito que
   `TitleFromFilename` já apara `(USA)` etc.). Um grupo com 2+ discos vira
   um jogo só; disco único continua entrada normal.
2. **Modelo:** um jogo multi-disco precisa guardar os N caminhos ordenados.
   Opções em aberto: linha "pai" + coluna `disc_paths` (JSON) na `library_games`,
   ou tabela nova `library_game_discs` (migração em `internal/store/migrations/`).
   Nenhuma escolhida — a segunda é mais limpa mas mais peso; decidir com o
   "orçamento de simplicidade" (arquitetura-do-codigo.md §6) na mão.
3. **Lançamento — a parte que travou:** RetroArch/DuckStation aceitam um
   `.m3u` com um caminho por linha. `BuildCommand` **não pode** gerar esse
   arquivo (regra: função pura, não toca o FS além da exceção do RetroArch;
   ver `decisoes.md`). Duas saídas a avaliar:
   - Gerar o `.m3u` numa área gerenciada do ZeuX (`emulator.ManagedRoot()`,
     nunca a pasta de ROM do usuário — regra 6) numa camada **antes** de
     `BuildCommand` (no `Launcher`, que já toca o FS), passando o caminho do
     `.m3u` como se fosse o `rom_path`.
   - Confirmar se algum dos dois emuladores aceita múltiplos caminhos de
     disco direto por linha de comando (sem `.m3u`) — se sim, nada é escrito
     em disco. **Não verificado.**
4. **Fallback aceitável se (3) ficar grande:** só detecção + agrupamento
   visual — um card "God of War (2 discos)" que ao abrir pergunta qual
   disco lançar (lançamento de disco único, que já funciona). A playlist
   automática fica como continuação desta pendência.

**Critério de aceite (quando for implementado):**
- [ ] Três arquivos `(Disc 1..3)` na mesma pasta viram um card só.
- [ ] Revarredura não duplica nem desagrupa.
- [ ] Nenhum arquivo é escrito na pasta de ROM do usuário em hipótese
      nenhuma (regra 6 + `BuildCommand` pura).
- [ ] Testes em `internal/library` (agrupamento) e, se a playlist for feita,
      em `internal/emulator`/`internal/api` (o `.m3u` sai na área gerenciada,
      com um caminho por linha, na ordem certa).

**Depende de:** nada · **Bloqueia:** nada

## O que fica fora deste documento

- Trabalho já feito, mesmo que recente — isso vive só no código e no
  histórico de commits, não aqui.
- Ideia sem especificação nenhuma ainda (não é pendência, é ainda-não-ideia).
