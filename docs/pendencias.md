# Pendências

Trabalho **planejado, mas ainda não implementado** — confirmado por leitura
do código em 2026-09-07 (itens O1 e B2b: 2026-09-09), não por suposição. Backlog honesto: se alguma coisa
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

### A1 — Página inicial de destaque (fase `home` nova) — **FEITO (2026-09-10)**

Implementado: `App.tsx` ganhou a fase `home`, sempre a tela de entrada
(decisão do Douglas em 2026-09-10 — sem histórico e sem pasta nenhuma, ela
vira o onboarding sozinha, sem tela separada). O item "Biblioteca" da
sidebar abre `home`; "Todos os jogos" (`AllGamesScreen`) virou sub-visão,
alcançada pelo botão "Ver todos os jogos" no rodapé. `HomeScreen.tsx` traz:

1. **Hero** (`GameHero`, reaproveitado) — só quando há jogo jogado.
2. **Prateleira "Seus consoles"** (`ConsoleCard`, tamanho `media`, rolagem
   horizontal) — só consoles com pasta apontada ou emulador já resolvido, não
   o catálogo dos 33.
3. **Rodapé de estatística** — tempo jogado total (`GET /sessions`) + "N de M
   consoles prontos" (`report.verdicts`, níveis `otimo`/`bom`), sem rota nova.

Ver o comentário no topo de `HomeScreen.tsx` para a nota sobre duplicação
proposital com `AllGamesScreen` (a cadeia de lançamento/instalação já mora
nos hooks; o que se repete é só a fiação dos modais em volta).

**Depende de:** decisão de produto sobre a "cara" da home · **Bloqueia:** A2
(compartilham o card de console)

### A2 — Cards de console grandes (Consoles + prateleira da home) — **FEITO**

`components/ConsoleCard.tsx` já existe (três tamanhos — `grande`/`media`/
`densa`), usado por `ConsolesScreen` (as três faixas por prontidão) e agora
também pela prateleira de `HomeScreen` (A1, tamanho `media`). `ConsoleIcon`
continua só para os lugares pequenos (badge de plataforma, chip).

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

### B2b — Ponto de entrada explícito para emulador que o ZeuX não conhece (P + decisão)

**Origem:** pedido do Douglas em 2026-09-09 — *"quero um local que deixe mais
explícito que se eu quiser tentar add um emulador de PS4 por exemplo, eu
posso fazer"*. **Vizinho do B2, mas não é o mesmo item:** B2 é "já tenho o
emulador **do console que o ZeuX conhece**, num drive que a varredura não
alcança". Este é "quero usar um emulador de um sistema que **não está no
catálogo**".

**O que já existe (verificado no código, 2026-09-09):**

- `internal/emulator/custom.go` foi escrito exatamente para isto, e o doc
  comment diz: *"Nada de lista de emuladores permitidos, nada de exigir que o
  console exista no catálogo."* `Validate` só exige id, nome, ao menos um
  console, caminho do executável e `{rom}` nos argumentos.
- `ManualEmulatorForm.tsx` já cobre nome, consoles (texto livre, separado por
  vírgula), executável (com seletor de arquivo), template de argumentos e
  notas.
- **A única porta é o rodapé de `EmulatorsScreen.tsx`** (linha ~1207), abaixo
  da grade paginada e de tudo o mais, atrás de um botão `ghost` cujo rótulo
  é `addEmulatorManuallyButton`. Uma tela que a sidebar despromoveu de
  propósito, com a porta no fim dela.

**O achado que muda o escopo — leia antes de estimar:** cadastrar um emulador
de PS4 hoje **funciona pela metade, e o app não avisa**. O `POST
/custom-emulators` aceita `"consoles": ["ps4"]` sem reclamar, e o emulador
passa a aparecer na lista. Mas `POST /library/folders` responde **400
`unknown_console`** ("O console informado não está no catálogo do ZeuX",
`server.go:1378`) — então não existe caminho na UI para apontar a pasta de
jogos desse sistema, nem para lançar. `syncLibraryFolder` varre por
`console.Extensions` do catálogo (`server.go:2187`), que não existem para um
console fora dele.

Ou seja: tornar o caminho mais visível **sem tratar isso** é promover um beco
sem saída de 4 cliques para um beco sem saída de 1 clique. Isso piora a
experiência, não melhora.

> **Feito (2026-09-09).** Partes 1 e 2 implementadas.
> - `ManualEmulatorForm` ganhou, no topo, a nota de que o ZeuX não valida flag
>   nem hardware, e sob o campo de consoles a frase `consolesHint` declarando o
>   limite de biblioteca para console fora do catálogo (pt-BR + en).
> - `EmulatorsScreen`: a porta de cadastro manual saiu do rodapé e virou um
>   bloco tracejado no topo (kicker + título + texto descritivo + botão
>   `chrome` com `data-gamepad-start`), acima da grade e visível sem rolar. O
>   bloco também hospeda o formulário aberto (novo ou em edição). O
>   `Button variant="ghost"` do rodapé foi removido.
> - **Backend: escolha conservadora.** O item deixa "adicionar console novo ao
>   catálogo" fora de escopo — e essa é a única forma de a pasta de jogos
>   funcionar para um sistema fora do catálogo. Então o backend não mudou de
>   comportamento; só a mensagem de `unknown_console` em
>   `POST /library/folders` (`handleAddLibraryFolder`) virou frase completa:
>   explica que o console não está no catálogo, que por isso a indexação de
>   pasta não está disponível, e que o emulador segue cadastrável/lançável à
>   mão. As outras ocorrências de `unknown_console` (preview, launch) ficaram
>   como estavam — contexto diferente.
> - **Resta:** nada desta rodada. "Adicionar console ao catálogo" (item G)
>   continua fora, como o item já previa.

**Escopo mínimo, em duas partes — a ordem importa:**

1. **Dizer a verdade sobre o limite (obrigatório, é o que destrava o resto).**
   O `ManualEmulatorForm` ganha, no campo de consoles, uma frase descritiva:
   *"Consoles fora do catálogo do ZeuX (por exemplo, `ps4`) são aceitos: o
   emulador fica cadastrado e você pode lançá-lo. O que ainda não existe é
   apontar uma pasta de jogos para um console que o ZeuX não conhece — a
   biblioteca só varre os consoles do catálogo."* Tom descritivo, sem
   julgar a escolha (o próprio `custom.go` já estabeleceu esse tom: *"o ZeuX
   não julga a escolha, só executa"*).
2. **Tornar a porta visível.** Uma faixa/card no **topo** de
   `EmulatorsScreen`, não no rodapé: *"Usa um emulador que o ZeuX não conhece?
   Aponte o executável e ele entra na lista."* + o botão que abre o form.
   O rodapé atual some (uma porta só, não duas).

**Alternativa de 80% que eu cortaria, se o item crescer:** parte 1 sozinha já
resolve o pior problema (a promessa quebrada), e custa minutos. A parte 2 é
posicionamento de UI, barata. Nada além disso deveria entrar nesta rodada.

**Critério de aceite:**
- [ ] `EmulatorsScreen` mostra a porta de cadastro manual **acima** da grade,
      visível sem rolar, e não há mais a versão do rodapé.
- [ ] O texto do form declara o limite de biblioteca para console fora do
      catálogo, em pt-BR e en.
- [ ] Cadastrar `{"consoles":["ps4"], ...}` pelo form salva sem erro e o
      emulador aparece em `GET /custom-emulators` e na lista da tela
      (comportamento atual do backend, agora com a expectativa certa na tela).
- [ ] Nenhum texto diz que o emulador "vai funcionar" — o ZeuX não valida
      flags de terceiros (regra do CLAUDE.md sobre não afirmar que as flags
      dos adapters funcionam vale mais ainda aqui).
- [ ] Nenhum texto julga a escolha do usuário nem sugere onde obter o
      emulador ou o jogo.
- [ ] Alcançável pelo controle (`data-gamepad-focused`).

**Fica de fora (de propósito):**
- **Adicionar console novo ao catálogo por essa via** (um "cadastrar console"
  com extensões, patamares de hardware e parecer). É item G, mexe em
  `consoles.json`, no motor de parecer e na biblioteca — e é a única forma de
  fazer a pasta de jogos funcionar para um sistema fora do catálogo. Se o
  Douglas quiser isso, é uma pendência própria, não um crescimento desta.
- Nintendo Switch, Yuzu, Ryujinx — fora do catálogo por decisão registrada, e
  esta porta não é rota de contorno disso. O texto da tela não cita nenhum
  console fora do catálogo como sugestão; `ps4` aparece só como exemplo de
  formato de id.
- Validar o binário apontado executando-o para descobrir versão/compatibilidade.

**Depende de:** nada (B2 mexe nas mesmas telas — fazer os dois na mesma
rodada evita retrabalho) · **Bloqueia:** nada

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

O que continuava sem especificação — o modo tutorial dedicado — virou o item
O1 abaixo (pedido do Douglas em 2026-09-09: *"quero telas com prints
explicando o que é cada coisa"*).

### O1 — Tour de primeira execução (M)

> **Feito (2026-09-09).** `src/components/TourOverlay.tsx` (+ `.i18n.ts`):
> sobreposição no molde do `SplashScreen`, fora do `switch (phase)`, marca
> `zeux.tour-seen` no `localStorage`. Aparece quando `phase` entra em
> `all-games` ou `declined` e o tour ainda não foi visto (efeito em
> `App.tsx`); "Pular" em toda tela, `Escape`/setas navegam, botão "Próximo"
> com `data-gamepad-start`. Quatro telas (autoconfiguração · parecer honesto ·
> biblioteca local · camada social — esta última diz por texto que save
> state/texture pack/perfil de controle/netplay se compartilham e a ROM
> nunca). Ilustrações: SVG esquemático em tokens do tema (janela de emulador,
> medidor segmentado com a chave apontando o componente que barra, pasta →
> grade de capas, nós da rede + cartucho riscado), sem texto embutido, sem
> número de hardware inventado. Transição entre telas usa keyframe já
> existente, zerada pelo bloco global de `prefers-reduced-motion`.
> Reabertura: Configurações → "Rever apresentação" (`onReplayTour`), card novo
> no topo de `SettingsScreen`. **Resta:** nada do escopo mínimo. Não foi feito
> teste com máquina limpa de verdade (nenhuma sessão de IA tem o app rodando);
> a lógica de `localStorage` espelha a do splash, que já roda em produção.



**O problema:** o percurso de um usuário novo hoje é consentimento → scan →
app (`App.tsx`: `handleConsent` termina em `setPhase("all-games")`, linha
291). Em nenhum momento alguém diz o que o ZeuX **faz** — o usuário concorda
com um scan de hardware e cai numa grade de jogos sem saber que o app
autoconfigura emulador, que o parecer nomeia o componente que barra, ou que
existe camada social. Quem nunca emulou não tem como inferir isso da tela.

**Escopo mínimo (4 telas, overlay, não `Phase`):** um `TourOverlay` no mesmo
molde do `SplashScreen` — componente de sobreposição, **fora do `switch (phase)`**,
com marca de "já vi" em `localStorage`. Esta escolha não é detalhe de
implementação: uma `Phase` nova soma tempo ao boot de quem só quer abrir o
jogo de sempre, e o `SplashScreen` já resolveu esse mesmo problema desse
mesmo jeito (ver o doc comment dele).

Conteúdo, uma tela por pilar, alinhado a `visao-do-produto.md`:

1. **O ZeuX configura o emulador por você** — você aponta o jogo, ele escolhe
   emulador e preset.
2. **Ele diz a verdade sobre esta máquina** — números e o componente que
   barra, sem nota opaca (princípios 2 e 3).
3. **Sua biblioteca é sua** — as ROMs que já estão no seu disco; o ZeuX só lê
   a pasta.
4. **A camada social** — save states, texture packs, perfis de controle e
   lobby de netplay. **Dizer explicitamente que jogo não se compartilha** —
   esta tela é o único lugar do app onde a regra 6 aparece como promessa ao
   usuário, e não só como ausência de funcionalidade.

**Decisões tomadas (não reabrir sem motivo):**

- **Depois do scan, antes da primeira tela do app.** Antes do consentimento,
  quatro telas vendendo o produto viram pressão para consentir — e o
  consentimento precisa ser um "sim" frio. Depois do scan, o tour é
  apresentação, não persuasão.
- **Só na primeira execução**, `localStorage` (mesmo critério do splash), com
  **"Pular" visível em toda tela** e reabertura por Configurações → "Ver a
  apresentação de novo". Não reaparece por biblioteca vazia: quem esvaziou a
  biblioteca já conhece o app.
- **Quem recusou o consentimento também vê** (a partir de `DeclinedScreen`),
  porque é justamente quem tem menos contexto sobre o que o app faz.

**Sobre os "prints": corte proposto.** O escopo mínimo usa **arte esquemática**
(blocos/wireframe no vocabulário visual do app), não captura de tela real.
Motivo medido, não estético: o visual foi refeito duas vezes em três dias
(`decisoes.md`, redesenho de 2026-09-07 e a extensão de 2026-09-09) — print
real envelhece sozinho e passa a mentir sobre o app, o que é pior que não ter
print. E print tem texto de UI embutido, ou seja, precisaria de um jogo de
imagens por idioma (`pt-BR`/`en`), dobrando o peso no binário e o trabalho de
manutenção. Arte esquemática não tem texto dentro: a legenda vem do i18n.

Se o Douglas mantiver captura real (é decisão dele), o custo vem junto:
`src/assets/tour/`, um jogo por idioma, e um procedimento de recaptura
registrado em `decisoes.md` para rodar a cada redesenho — senão o item volta
como dívida.

**Critério de aceite:**
- [ ] Primeira execução em máquina limpa (`localStorage` vazio): depois do
      scan, o tour aparece antes de `all-games`; ao terminar ou pular, cai em
      `all-games`.
- [ ] Segunda execução: o tour **não** aparece — o app vai direto do scan à
      biblioteca.
- [ ] Configurações tem "Ver a apresentação de novo" e o tour reabre por ali,
      em qualquer execução.
- [ ] "Pular" está visível nas 4 telas e é alcançável só pelo controle
      (`data-gamepad-start` + cursor de `data-gamepad-focused`).
- [ ] Nenhuma `Phase` nova em `App.tsx`; o tour é overlay (mesmo padrão de
      `SplashScreen`), e o boot de quem já viu não ganha nenhuma requisição
      nem espera adicional.
- [ ] A tela da camada social diz, em texto, que save state / texture pack /
      perfil de controle / netplay são compartilháveis e **jogo não é**.
- [ ] Nenhum texto do tour julga hardware, e nenhum número de hardware
      inventado aparece nas ilustrações (nada de "RTX 4090 · Ótimo" de
      exemplo, que lê como parecer real).
- [ ] i18n pt-BR/en; nenhuma frase embutida em imagem.
- [ ] `prefers-reduced-motion` zera a transição entre telas.

**Fica de fora (de propósito):**
- Console/jogo de exemplo com dado plausível — a preocupação já registrada
  acima: lê como dado falso. Ilustração esquemática não corre esse risco.
- Tour contextual por tela ("dicas" que aparecem na primeira visita a cada
  tela). É outro produto, e multiplica a superfície de manutenção.
- Vídeo, animação de produto, narração.
- Repetir o tour por biblioteca vazia — isso já é coberto pelo `EmptyState`
  com passos numerados, entregue em 2026-09-09.

**Depende de:** nada · **Bloqueia:** nada (A1, a home, encosta neste item: se
a `home` ganhar estado de boas-vindas, os dois textos precisam concordar)

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

## Rodada retrô/pixelada multiagente (2026-09-09)

**Concluído em 2026-09-09** (ver `decisoes.md`, "Direção visual retrô/pixelada,
e o layout das telas deixa de ser lei"). Quatro frentes, todas no mesmo commit:

- ~~**Fundação de tema**~~ — `--font-mono` real (IBM Plex Mono embutida; o
  `@theme` nunca a declarava e ~40 elementos de identidade caíam na mono do
  SO), componente `ZeuXMark` com `image-rendering: pixelated` + asset só-Zeus
  (`logo-zeux-mark.png`), wordmark pixel na sidebar expandida, `EmptyState`
  reescrito com hierarquia + marca CRT e propagado a 9 telas, chips de filtro
  padronizados em roxo via constantes compartilhadas (`FILTER_CHIP_*` em
  `ui.tsx`), contraste WCAG do estado OFF corrigido.
- ~~**Consoles**~~ — 3 faixas por engajamento (Prontos para jogar / Falta
  configurar / Catálogo), `ConsoleCard` novo tratado como arte de sistema,
  `consoleFamily()` em `consoleColor.ts` como fonte única de cor e
  agrupamento, régua de filtros fabricante/época/"tenho jogos", paginação
  removida, core de-aninhado no `ConsoleDetailScreen`.
- ~~**Biblioteca**~~ — `LibraryToolbar` compartilhada entre `AllGamesScreen` e
  `GamesScreen` (busca, ordenação, grade/lista, densidade de capa P/M/G
  persistida), `GameListRow` com miniatura + colunas alinhadas, `GameTile`
  com rodapé de altura fixa e badge de bloqueio sobre a capa, `LibraryScreen`
  achatada em linhas de gerência (fim do card-dentro-de-card).
- ~~**Onboarding + emulador**~~ — `TourOverlay` de 4 telas (overlay pós-scan,
  `localStorage` `zeux.tour-seen`, reabre em Configurações), frase honesta no
  `ManualEmulatorForm`, bloco "emulador fora da lista" visível na
  `EmulatorsScreen`, mensagem `unknown_console` do `POST /library/folders`
  virou frase completa. Itens `O1` e `B2b` fechados.

### Ajustes de polimento notados rodando o app — abertos

Vistos em screenshots reais do build de dev (2026-09-09), não tratados nesta
rodada:

- [ ] **Fonte pixel sem glifo acentuado.** `Press Start 2P` não tem `á/é/í/ó/ú`
      — rótulos como "MEMÓRIA", "VÍDEO", "PARÂMETROS" em `SpecsPanel` /
      `SectionHeading` caem no fallback no meio da palavra e ficam feios.
      Opção A: caixa-alta sem acento nesses rótulos (mesma lógica de
      `level: "otimo"`). Opção B: trocar a fonte só dos rótulos. Decidir com
      o Douglas — é escolha de identidade.
- [ ] **`GameTile` sem capa mostra o título duas vezes.** O placeholder de
      `GameCover` desenha título (em fonte pixel) + sigla do console grande
      sobre a arte, e o rodapé do tile repete o título. Poluído. Placeholder
      deveria mostrar só a sigla do console e deixar o título para o rodapé.
- [ ] **`GameListRow`: coluna da miniatura solta.** Gap grande entre a
      miniatura de 40px e o badge de plataforma; a coluna parece descolada.
      Ajuste fino de `grid-template-columns` / alinhamento.
- [ ] **`ZeuXMark` pequeno fica denso.** Em ~32px (tela "lendo o
      consentimento…") o recorte automático de `logo-zeux-mark.png` embola.
      Pede uma pixel art própria simplificada — o componente já aceita o novo
      PNG sem mudança de código.

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

## Manifesto vivo dos cores do RetroArch (2026-09-09)

**O que é:** um workflow agendado (diário) roda `cmd/generate-retroarch-manifest`
contra o `buildbot.libretro.com`, comita/publica o `retroarch_cores_manifest.json`
resultante como asset versionado, e o ZeuX passa a **buscar esse manifesto em
runtime**, caindo no embutido no binário só quando estiver offline.

**Por quê:** hoje o SHA256 do manifesto embutido envelhece sozinho — ele é
medido contra `.../nightly/<plat>/latest/`, um alvo que o buildbot reconstrói
sem aviso, e não existe URL imutável por core (só o bundle `RetroArch_cores.7z`
de centenas de MB). Na decisão de 2026-09-09 (`decisoes.md`) o mismatch deixou
de ser fatal — o core instala com um `warning` — mas isso é o **estado
honesto de um remendo**, não o alvo. Com o manifesto vivo, o hash volta a ser
medido há menos de 24h e `checksum_verified` volta a significar algo; o
`warning` vira raro de verdade.

**Critério de aceite (quando for implementado):**
- [ ] Um workflow (fora do build normal, como o gerador já é) regenera e
      publica o manifesto num intervalo fixo.
- [ ] O ZeuX busca o manifesto remoto no início e usa o embutido como
      fallback silencioso quando a busca falha (sem travar nenhum fluxo).
- [ ] O manifesto remoto é cacheado localmente para não baixar a cada
      `StartCore`.
- [ ] `generated: false` continua recusando instalação (é outra coisa).
- [ ] Testes cobrindo: remoto ok, remoto indisponível (usa embutido),
      remoto malformado (usa embutido).

**Depende de:** infraestrutura de CI/hospedagem do asset · **Bloqueia:** nada
(o remendo do `warning` já desbloqueia o usuário)

## Pesquisa (não verificada): save/continuidade e configuração 100% pelo ZeuX, por emulador (2026-09-11)

**Origem:** pedido do Douglas na mesma sessão — "veja como funciona o save de
todos os emuladores... quero um resumo de como podemos configurar cada
emulador por dentro do zeux somente. como persistiria para cada emulador."

**Método e aviso, leia antes de usar isto para estimar algo:** tudo abaixo
vem de busca na web (wikis oficiais, docs, fórum) numa sessão sem Windows e
sem os binários instalados — **nada foi confirmado rodando o emulador de
verdade**, o único padrão que este projeto aceita como fato (ver o método de
`pcsx2DataDir`/`flycastBiosDir` em `bios_dir.go` e `pcsx2_config.go`, e a
ressalva já registrada para o Vita3K/`decisoes.md`). Trate cada linha como
"o que a documentação diz", não "o que o ZeuX vai encontrar" — a tabela erra
sozinha se o Documentos do usuário estiver redirecionado (OneDrive), se a
versão instalada mudou de comportamento (Cemu passou de portátil-por-padrão
a não-portátil entre versões, achado abaixo), ou se a distro/instalador
divergir do que o wiki descreve. Antes de qualquer um destes virar código
real, repetir o método já usado para PCSX2/Flycast: rodar o binário de
verdade, fotografar antes/depois, registrar em `decisoes.md`.

### Onde cada emulador guarda save (memory card / cartão + save state)

| Adapter | Save "nativo" (memory card / SAVEDATA / .sav) | Save state | Config principal | Portátil? |
|---|---|---|---|---|
| **duckstation** | `<user dir>/memcards/*.mcd` | `<user dir>/savestates/` | `settings.ini` | Sim, via `portable.txt` — já é o que `seedDuckStationPortable` ativa; sem ele, hoje o padrão passou de `Documents\DuckStation` para `%LocalAppData%\DuckStation` (mudou de versão para versão — mais um motivo para manter modo portátil). |
| **pcsx2** | `Documents\PCSX2\memcards\` | `Documents\PCSX2\sstates\` | `Documents\PCSX2\inis\PCSX2.ini` | **Não** — confirmado ao vivo em 2026-09-11 que o PCSX2 ignora modo portátil nesta máquina (ver `pcsx2_config.go`). Único já com `ResolveSaveDataDirs` implementado. |
| **ppsspp** | `<memstick>/PSP/SAVEDATA/` | `<memstick>/PSP/PPSSPP_STATE/` | `ppsspp.ini` (dentro do memstick) | Sim — sem instalador, o "Memory Stick" já fica ao lado do `.exe`; só cai em `Documents\PPSSPP` se a pasta do exe não for gravável (ex.: Program Files). |
| **dolphin** | cartão de memória GC é um **arquivo único** (`MemcardA.raw` etc.), caminho gravado em `Dolphin.ini` (`MemcardAPath`) — padrão em `Documents\Dolphin Emulator\GC\`; saves de Wii ficam dentro de `Wii/title/.../data/` (estrutura NAND emulada) | `Documents\Dolphin Emulator\StateSaves\` | `Documents\Dolphin Emulator\Config\Dolphin.ini` (+ `GFX.ini`, `GameSettings/*.ini` por jogo) | Existe modo portátil (`portable.txt`), não pesquisado a fundo aqui. |
| **flycast** | `vmu_save_A1.bin` (e B1/C1/D1) soltos na pasta `data/` ao lado do executável (standalone) — **por design, um VMU por slot, compartilhado entre jogos**, não por jogo | não encontrado documentado para o standalone nesta pesquisa | `emu.cfg` | Comportamento standalone parece já ser "ao lado do exe" por padrão — precisa confirmar. |
| **rpcs3** | `dev_hdd0/home/00000001/savedata/<ID do jogo>/` dentro da pasta de instalação (a árvore `dev_hdd0` é o "HD emulado") | citado como existente (RPCS3 tem save state próprio), local não confirmado nesta pesquisa | `config.yml` | RPCS3 é portátil por padrão (tudo relativo à pasta do executável), mas há um bug conhecido no macOS que grava fora dela — vale checar o equivalente no Windows antes de confiar. |
| **melonds** | `.sav` ao lado da ROM, ou pasta configurável (`Documents\melonDS\saves\` como default comum) — **local final é o que o usuário configurou na primeira execução**, não fixo | não pesquisado a fundo | `melonDS.ini` | Sem confirmação de portátil. |
| **azahar** | `sdmc/Nintendo 3DS/.../title/.../data/` dentro do "User Directory" (`%AppData%\Azahar\` no Windows) | não pesquisado a fundo | `qt-config.ini` (dentro de `config/`) | `seedAzahar` grava `qt-config.ini` na pasta gerenciada — mas se o User Directory real é `%AppData%\Azahar`, o mesmo risco do PCSX2 pode se aplicar aqui (arquivo semeado no lugar errado). **Precisa do mesmo teste ao vivo que corrigiu o PCSX2.** |
| **xemu** | disco rígido emulado (`xbox_hdd.qcow2`, formato qcow2) guarda tudo, caminho em `sys.files.hdd_path` no `xemu.toml`; `eeprom.bin` guarda config de console (região, etc.), não save de jogo | não pesquisado | `xemu.toml` | Caminho default citado (`$HOME/.local/share/xemu/...`) é de Linux; Windows não confirmado. |
| **vita3k** | `ux0/user/00/savedata/<Title ID>/`, dentro de `%AppData%/Vita3K/` (caminho customizável via `pref-path` no `config.yml`) | não pesquisado | `config.yml` (ao lado do exe) | Filesystem emulado fica em AppData por padrão, não ao lado do exe — atenção, mesmo padrão de risco do PCSX2/Azahar. |
| **xenia** | `Documents\Xenia\content\` (ou ao lado do exe, se houver `portable.txt`) | não pesquisado a fundo | `Documents\Xenia\xenia.config.toml` (ou ao lado do exe em modo portátil) | Sim, via `portable.txt` — mesmo mecanismo que `seedXenia` já pressupõe, mas **não confirmado se o ZeuX ativa esse portable.txt** (não vi isso no `firstrun.go` atual). |
| **cemu** | `mlc01/usr/save/` dentro do MLC (path configurável) | não pesquisado | `settings.xml` | **Mudou de comportamento entre versões**: Cemu passou a ser não-portátil por padrão no Windows (`%AppData%\Roaming\Cemu`), com portátil ainda disponível via pasta `portable` ao lado do exe — `seedCemu` hoje só cria `mlc01` dentro do `installDir`, o que pode não ser onde o Cemu moderno olha. **Precisa verificação ao vivo, mesmo padrão do PCSX2.** |
| **rmg** | não pesquisado a fundo (Mupen64Plus core guarda save por jogo, formato `.sra`/`.mpk` conforme o tipo) | `.../RMG/Save/State` | `.../RMG/config/mupen64plus.cfg` (ou local, se portátil) | A doc citada diz que a versão portátil guarda tudo dentro da própria pasta — consistente com `seedRMG`. |
| **retroarch** | `savefile_directory` no `retroarch.cfg` (pode ser `default` = ao lado da ROM, ou um caminho fixo) | `savestate_directory`, mesma regra | `retroarch.cfg` | O ZeuX ainda **não lê nem grava** essas duas chaves (`retroarch_config.go` não as menciona) — é o maior buraco da lista, porque RetroArch cobre a maioria dos consoles do catálogo. |

### O padrão de risco que se repete

Pelo menos três adapters (**cemu, azahar, vita3k**) guardam o "diretório de
usuário" de verdade em `%AppData%`, não na pasta onde o ZeuX instala — o
mesmo formato de erro que já foi encontrado e corrigido no PCSX2
(`decisoes.md`, "O assistente do PCSX2 aparecia porque `seedPCSX2` semeava
no lugar errado", 2026-09-11). Antes de prometer save states desses três,
vale repetir o teste ao vivo que resolveu o PCSX2 — sem isso, `seedCemu` e
`seedAzahar` de hoje podem estar semeando um arquivo que o binário real nunca
lê, do mesmo jeito que `seedPCSX2` fazia antes da correção.

### Resumo: configurar cada emulador só pelo ZeuX (sem abrir a GUI dele)

O mecanismo já existe e está em produção para **um** adapter: `ConfigurableAdapter`
(`adapter.go`) + `iniconfig.go` (parser de INI que preserva o resto do
arquivo) + `configbackup.go` (backup do original antes da primeira escrita,
restaurável). Hoje só `pcsx2` implementa — `TestOrdinaryStandaloneAdapterDoesNotSatisfyConfigurableAdapter`
trava explicitamente que DuckStation **não** satisfaz a interface ainda.

Como cada formato de config se encaixaria no mesmo padrão (parser +
backup), por formato de arquivo:

- **INI** (duckstation `settings.ini`, dolphin `Dolphin.ini`, ppsspp
  `ppsspp.ini`, flycast `emu.cfg`, melonds `melonDS.ini`, azahar
  `qt-config.ini`, vita3k tem seu próprio, rmg `mupen64plus.cfg`, retroarch
  `retroarch.cfg`) — `iniconfig.go` já é genérico o bastante para ler
  qualquer um destes; falta só mapear, por adapter, **quais chaves** valem a
  pena expor (mesmo trabalho que `pcsx2ReadConfig` fez: achar a chave real
  rodando o binário, nunca supor pelo nome). É o maior grupo — a maioria dos
  emuladores do catálogo usa INI.
- **YAML** (rpcs3 `config.yml`, vita3k `config.yml`) — precisa de um parser
  novo (`internal/emulator` não tem um hoje); Go tem `gopkg.in/yaml.v3` como
  opção, mas isso é dependência nova, então checar com o Douglas antes (regra
  do CLAUDE.md sobre não somar dependência sem perguntar não é só para
  Rust/Node).
- **TOML** (xemu `xemu.toml`, xenia `xenia.config.toml`) — mesma situação:
  parser novo, dependência nova (`BurntSushi/toml` ou similar), perguntar
  antes.
- **XML** (cemu `settings.xml`) — `encoding/xml` já é biblioteca padrão do Go,
  sem dependência nova; mas XML é mais verboso para edição pontual que
  preserve o resto do arquivo intacto (o que `parseINI` faz de propósito) —
  precisaria de um cuidado equivalente para não perder configuração que o
  usuário já tinha.

**Ordem sugerida, se isto virar trabalho de verdade:** RetroArch primeiro —
não por ser tecnicamente mais simples (é INI, então empata com o grupo
grande), mas porque é o adapter que **mais consoles atende**, então mapear
`savefile_directory`/`savestate_directory` ali destrava "onde estão os
saves" para o maior naco do catálogo de uma vez, em vez de emulador por
emulador. Cemu, Azahar e Vita3K vêm depois **e primeiro precisam da
verificação ao vivo** da seção acima — mapear chave de config antes de saber
se o arquivo semeado é sequer o que o binário lê seria trabalho perdido.

**Depende de:** acesso a uma máquina Windows com cada emulador de verdade
(o método que já resolveu PCSX2/Flycast não tem atalho) · **Bloqueia:**
qualquer promessa de "voltar de onde parou" além do PCSX2.

Sources: [DuckStation README](https://github.com/stenzek/duckstation/blob/master/README.md) ·
[PulseGeek — DuckStation save folders](https://pulsegeek.com/articles/duckstation-save-folders-on-windows-mac-and-linux/) ·
[Dolphin Emulator Wiki — GameINI](https://wiki.dolphin-emu.org/index.php?title=GameINI) ·
[PCGamingWiki — Dolphin](https://www.pcgamingwiki.com/wiki/Dolphin) ·
[PPSSPP — Save data and storage on Windows](https://www.ppsspp.org/docs/getting-started/save-data-and-storage-windows/) ·
[Libretro Docs — Directory Configuration](https://docs.libretro.com/guides/change-directories/) ·
[RPCS3 Wiki — Help:Save State](https://wiki.rpcs3.net/index.php?title=Help%3ASave_State) ·
[RPCS3 Quickstart](https://rpcs3.net/quickstart) ·
[Cemu Wiki — Folder structure](https://wiki.cemu.info/wiki/Folder_structure) ·
[Cemu PR #1252 — Windows default to non-portable](https://github.com/cemu-project/Cemu/pull/1252) ·
[Xenia Manager Wiki — FAQ](https://github.com/xenia-manager/xenia-manager/wiki/FAQ) ·
[Xenia Manager — Save Files guide](https://xeniamanager.wiki/xenia-save-files/) ·
[melonDS board — save file location](https://melonds.kuribo64.net/board/thread.php?id=245) ·
[GitHub issue — Flycast VMU save location](https://github.com/libretro/flycast/issues/1017) ·
[RetroPie forum — lr-flycast VMU data](https://retropie.org.uk/forum/topic/24848/where-does-lr-flycast-store-vmu-data) ·
[Vita3K FAQ](https://vita3k.org/faq) ·
[Vita3K Wiki — FAQ](https://github.com/Vita3K/Vita3K/wiki/FAQ) ·
[xemu Docs — EEPROM Settings](https://xemu.app/docs/eeprom/) ·
[xemu Docs — Troubleshooting](https://xemu.app/docs/troubleshooting/) ·
[Azahar — User Directory (Citra wiki archive)](https://citra.azahar-emu.org/wiki/user-directory/) ·
[EmuDeck — Azahar tips](https://manual.emudeck.com/tricks/azahar/) ·
[RMG GitHub](https://github.com/rosalie241/RMG) ·
[EmuDeck — RMG](https://emudeck.github.io/emulators/steamos/rmg/)

## Backend pronto, interface pendente: VC++ Redistributable e visão de saves (2026-09-11)

**Origem:** pedido do Douglas na sessão remota de 2026-09-11 (ambiente Linux,
sem acesso a uma máquina Windows para testar de ponta a ponta).

### VC++ Redistributable — auto-instalação

`internal/install/vcredist.go` (`InstallVCRedist`) e a rota
`POST /system/vcredist/install` (ver `docs/api.md`) já baixam o instalador
oficial da Microsoft e o iniciam, com confirmação do usuário sendo o próprio
clique que dispara a rota. **Nunca testado ao vivo** — foi escrito sem
Windows disponível; o doc comment da função e a entrada correspondente em
`decisoes.md` (a fazer quando alguém verificar) carregam essa ressalva.

**Falta:**
- Testar de verdade numa máquina Windows: o download, a elevação UAC, o
  instalador abrindo, o comportamento se o runtime já estiver instalado.
- **Frontend:** o `ErrorModal` de lançamento que mostra a frase de
  `describeExitCode` (0xC0000135) precisa ganhar um botão "Instalar o
  Visual C++ Redistributable" que chama a rota nova — hoje o usuário só lê a
  instrução em texto e precisa achar o link sozinho.

### Ver saves dentro do ZeuX — MVP de inspeção (não gerência)

`internal/emulator/save_data.go` (`ResolveSaveDataDirs`, `ListSaveFiles`) e a
rota `GET /emulators/{id}/save-data` (ver `docs/api.md`) listam o que existe
nos diretórios de memory card e save state — hoje só para o **PCSX2**, porque
é o único cujo local (`memcards`/`sstates` dentro de `pcsx2DataDir()`) foi
confirmado contra um binário real (docs/decisoes.md, entrada de
2026-09-11). Todo outro adapter devolve `known:false` de propósito — nenhum
palpite de caminho, princípio 4.

**Decisão do Douglas:** começar só por listar/inspecionar (memory card e
save state juntos), sem gerência (apagar/exportar) nesta primeira rodada.

**Falta:**
- **Frontend:** nenhuma tela consome a rota ainda. Um lugar razoável é uma
  seção "Saves" em `ConsoleDetailScreen` (ou `EmulatorsScreen`) para
  consoles cujo adapter resolvido tem `known:true` — mostrando os arquivos
  com tamanho e data, e a frase honesta de "ainda não sei onde procurar"
  para o resto.
- **Ampliar cobertura:** cada adapter novo (DuckStation, RetroArch, Dolphin…)
  exige o mesmo método já registrado em `pcsx2DataDir()` — rodar o binário
  de verdade, fotografar antes/depois, documentar em `decisoes.md`. Não dá
  para fazer isso sem Windows/os binários reais; é trabalho para uma sessão
  com a máquina do Douglas.
- Ainda não existe tentativa de casar um arquivo de save com um jogo
  específico da biblioteca — os nomes de arquivo que cada emulador usa para
  isso não foram confirmados. A lista hoje é "o que tem na pasta", não "o
  save deste jogo".

### Outros emuladores mapeados para o onde-clicar-direto

Conferido nesta sessão (`internal/install/firstrun.go`): 13 adapters já têm
`seedFirstRun` — DuckStation, PCSX2, Dolphin, PPSSPP, Flycast, RPCS3,
melonDS, Azahar, xemu, Vita3K, Xenia, Cemu, RMG. Quem instala pelo ZeuX hoje
(`GET /emulator-sources`) e ainda não aparece nessa lista teria assistente
de primeira execução na cara — não achei nenhum nesta conferência rápida,
mas vale checar contra `internal/install/data/sources.json` sempre que um
adapter novo entrar no catálogo de instalação automática.

## O que fica fora deste documento

- Trabalho já feito, mesmo que recente — isso vive só no código e no
  histórico de commits, não aqui.
- Ideia sem especificação nenhuma ainda (não é pendência, é ainda-não-ideia).
