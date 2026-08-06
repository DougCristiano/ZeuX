# Referência de layout: Playnite

Pesquisa no código-fonte do [Playnite](https://github.com/JosefNemec/Playnite)
(gerente de biblioteca de jogos multi-launcher, com suporte a emulação) para
extrair ideias de layout aproveitáveis no ZeuX — principalmente na tela de
biblioteca e na tela de detalhe do jogo. Este documento registra **o que foi
encontrado** e **o que disso vale a pena adotar aqui**, sem prometer nada que
ainda não foi decidido em `docs/roadmap.md`.

## Por que o Playnite é uma referência razoável

O Playnite resolve um problema adjacente ao do ZeuX: unificar launchers e
emuladores numa única biblioteca visual, com capa, metadado e um fluxo de
"Jogar" central. Ele não faz autoconfiguração de hardware (não é o
diferencial dele), mas o trabalho de exibição da biblioteca — grid de capas,
tela de detalhe, hierarquia de metadado — está maduro e é uma referência
melhor que reinventar do zero.

## Como o Playnite é construído (e por que isso importa para a leitura)

O Playnite **não é uma aplicação web** — é um app desktop WPF (.NET/C#), e a
"folha de estilo" dele é XAML (`ResourceDictionary`), não CSS. Os conceitos
traduzem bem para o nosso mundo Tailwind/React, mas os nomes não:

| Conceito Playnite (XAML) | Equivalente aproximado no ZeuX |
|---|---|
| `ResourceDictionary` / tema (`theme.yaml` + `.xaml`) | `src/index.css` (tokens `--color-*`) + Tailwind |
| `DynamicResource` (cor que muda com o tema) | variável CSS (`var(--accent)`) |
| `DataTrigger` / `Trigger` (estado hover/seleção) | `:hover`, `:focus-visible`, classes condicionais no React |
| `DropShadowEffect`, `BlurEffect` (efeito de render WPF) | `box-shadow`, `filter: blur()` em CSS |
| Tema tem uma pasta `Desktop` (mouse/teclado) e outra `Fullscreen` (controle, "modo TV") | não temos equivalente — o ZeuX é só desktop-com-mouse hoje |

Repositório: `source/Playnite.DesktopApp/Themes/Desktop/Default/` (tema
padrão do modo Desktop) e `source/Playnite.FullscreenApp/Themes/Fullscreen/Default/`
(modo TV/controle — mais parecido visualmente com o clima "arcade" que o
mockup em `layout/` persegue).

## O que a tela de biblioteca (grid) faz

Arquivo: `DerivedStyles/GridViewItemTemplate.xaml` (Desktop).

- Capa em `Stretch` configurável pelo usuário, escalada com
  `BitmapScalingMode="Fant"` (suavização — equivalente ao que o navegador já
  faz por padrão).
- **Sem capa**: um overlay escuro (`#99000000`) cobre o card e mostra o nome
  do jogo em texto — o mesmo papel que o nosso placeholder por sigla de
  console cumpre hoje em `GamesScreen.tsx`, só que por jogo em vez de por
  console (porque eles têm scraper; nós ainda não, ver seção "Sprint G"
  abaixo).
- **Hover**: overlay ainda mais escuro (`#AA000000`) sobre a capa, e dois
  botões (Jogar / Info) aparecem por cima, escondidos por padrão
  (`Trigger Property="IsMouseOver"`).
- Jogo não instalado: o botão de jogar vira ícone de download, e há uma opção
  de tema para escurecer capas de jogos não instalados
  (`DarkenUninstalledGamesGrid`).
- Nome do jogo pode aparecer abaixo da capa (`ShowNamesUnderCovers`), como
  texto simples, sem crop nem fade.

Isso é bem próximo do que `.game-cover` já faz em `src/index.css` (glow de
borda no hover) — a diferença é que o Playnite usa **escurecimento +
revelação de ação** no hover, não só glow de borda. Vale considerar como
evolução do componente `GameCover`.

## O que a tela de detalhe do jogo mostra

Dois arquivos relevantes, um por modo:

**Desktop** — `Views/DetailsViewGameOverview.xaml`: layout em três blocos.
Topo com capa (ancorada à direita), título grande com sombra, e os botões
Jogar/Ações. Depois, duas colunas: uma coluna fixa de ~300px com uma grade
label→valor de **~25 campos** (tempo jogado, última vez jogado, pasta de
instalação, biblioteca de origem, plataforma, categorias, tags, gêneros,
desenvolvedores, publicadoras, data de lançamento, série, versão, nota da
comunidade/crítica/usuário, faixa etária, fonte, região...) e outra coluna
com notas do usuário e a descrição (renderizada como HTML, via
`DescriptionView.html` — um template com `{foreground}`, `{font_family}`,
`{text}` etc., processado antes de exibir).

**Fullscreen** (`Views/GameDetails.xaml`, o modo mais próximo do clima que o
mockup em `layout/` busca) — em vez de fundo sólido, usa a **arte de fundo do
próprio jogo** (`FadeImage`) atrás de tudo, com um `Border` semi-opaco
(`GameDetailsBackgroundBrush`) cobrindo a metade inferior para o texto ficar
legível por cima da imagem. Capa com borda arredondada de 3px. Título a 38pt
com `DropShadowEffect`. Menos campos que o modo Desktop (foco em tempo
jogado, última atividade, lançamento, plataforma, descrição) — a versão
"TV/controle" deliberadamente mostra menos dado por tela.

## Nota (score) e trailer: **não são do núcleo do Playnite**

Isto é o achado mais importante para não prometer algo que não existe: nem
nota do Metacritic nem trailer/vídeo vêm do Playnite em si.

- **Nota**: o campo `TextBlockGameScore` na grade de metadado mostra
  `CommunityScore` / `CriticScore` / `UserScore` — campos genéricos que um
  scraper de metadado (plugin) preenche. O Playnite básico não fala com o
  Metacritic; existe um **plugin de terceiro** ("Metacritic Link") que só
  adiciona um link clicável para a página do jogo lá.
- **Trailer/vídeo**: também não é nativo. Vem de um plugin de terceiro
  ("Extra Metadata Loader") que busca vídeo/logo por fora e os deixa
  disponíveis para o tema exibir.

Ou seja: o próprio Playnite trata nota e vídeo como **dado de metadado
opcional**, dependente de uma fonte externa plugável — exatamente o formato
que o ZeuX já usa para capa (G1, abaixo). Não são recursos "de layout", são
recursos "de fonte de dado" com uma vitrine de layout em cima.

## Onde isso encosta no que já está planejado (`docs/roadmap.md`)

A Sprint G ("biblioteca visual") já cobre parte do que o Playnite faz hoje:

- **G1** — capas de jogo via scraper de metadado (IGDB, conta de terceiro do
  próprio usuário). Sem capa encontrada → cai no placeholder de sigla, nunca
  capa errada.
- **G2** — cache local de capas/metadado (caminho de arquivo, nunca binário
  em banco — mesma regra do resto do projeto).
- **G5** — identidade visual por console (já implementada, cor por console em
  `consoleColor.ts`).

**Descrição do jogo, nota (Metacritic/crítica) e trailer não estão na Sprint
G nem em nenhuma outra sprint do roadmap hoje.** São extensões naturais do
G1 (mesma fonte de metadado poderia trazer sinopse e nota junto com a capa),
mas isso é uma decisão de escopo do Douglas, não algo para inferir daqui —
sinalizando explicitamente para não presumir que existem, seguindo a regra
do `CLAUDE.md` sobre não presumir funcionalidade do PRD.

## Ideias concretas para o ZeuX, hoje

O que dá para adotar **sem esperar scraper**, só com layout, reaproveitando
os tokens que já existem em `src/index.css`:

1. **Hover do `GameCover`** (`src/components/ui.tsx` + `.game-cover` em
   `index.css`): hoje é só glow de borda. Adicionar um overlay escurecido
   (`bg-black/40` no hover) com o botão "Jogar" revelado por cima, no padrão
   do Playnite, deixaria a ação mais óbvia sem precisar de capa real — o
   placeholder de sigla continua funcionando por baixo do overlay.
2. **Grade de metadado label→valor** na `GameDetailScreen`: já existe algo
   parecido no bloco "Suas estatísticas" (`grid grid-cols-1 sm:grid-cols-3`).
   O padrão do Playnite (rótulo pequeno em cima, valor maior embaixo, uma
   coluna estreita e densa) é o mesmo formato que já usamos — não precisa
   mudar, só temos poucos campos por não termos metadado ainda (tempo
   jogado, última vez, sessões — exatamente os únicos três que temos dado
   real para preencher, e é isso que a tela já faz).
3. **Fundo com a própria imagem do jogo** (estilo Fullscreen do Playnite) só
   faz sentido depois de G1 existir (precisa da arte para desfocar/escurecer
   atrás do conteúdo). Registrar aqui como candidato natural de próxima
   sprint depois de G1, não implementar agora.

## O que **não** vale a pena copiar

- **Grade de ~25 campos de metadado do modo Desktop do Playnite.** A maior
  parte desses campos (categoria, tags, série, versão, faixa etária, região,
  fonte) não existe no domínio do ZeuX e não tem de onde vir — copiar a
  grade toda criaria campos vazios ou inventados. Prefira o modo Fullscreen
  deles como referência de densidade: menos campos, só os que têm dado real.
- **Link para Metacritic apontando para fora do app.** Cabe perguntar ao
  Douglas antes de adicionar — é a primeira vez que o ZeuX abriria um link
  externo de conteúdo de jogo, e isso é decisão de produto, não só de
  layout.
- Qualquer coisa que dependa de identificar/baixar o **arquivo do jogo** por
  fora — não é o caso de nada visto no Playnite (ele também só lê metadado),
  mas fica registrado por reforço do princípio 6 do `CLAUDE.md`.
