# 0014 — Navegação por controle sobre o layout de mesa, sem modo TV

**Status:** Aceito · **Emenda parcialmente o [ADR 0009](0009-desktop-agora-controle-depois.md)**

## Contexto

O [ADR 0009](0009-desktop-agora-controle-depois.md) decidiu construir a
interface do ZeuX "para mouse e teclado, sem modo TV, sem navegação
direcional e sem layout alternativo" — deliberadamente, para não dobrar o
escopo de toda tela construindo dois layouts (mesa e sofá) ao mesmo tempo.
Ele também previu a porta de saída: se um dia o produto precisasse de
navegação por controle, isso "merece ADR próprio".

Em 2026-08-06 o Douglas pediu que o controle (joystick) navegasse entre
telas, listas e jogos. Isso é exatamente a cláusula "sem navegação
direcional" do ADR 0009 — precisava ser reaberta, não ignorada.

A pergunta que faltava responder: navegação por controle significa **um
segundo layout completo** (o modo TV que o ADR 0009 também menciona — telas
alternativas, alvos grandes, densidade baixa, ao estilo do Playnite
Fullscreen, ver `docs/referencias-playnite.md`) ou **navegação sobre o
layout de mesa que já existe**? São decisões de tamanho muito diferentes: a
primeira é, nas palavras do próprio ADR 0009, "na prática, dois aplicativos
compartilhando uma API". Perguntado diretamente, o Douglas escolheu a
segunda — controle deve funcionar como um Tab/Enter/Esc alternativo sobre a
interface que já existe, não um redesenho.

## Decisão

O controle navega o **layout de mesa existente**, sem criar um modo TV
separado:

- **D-pad / analógico esquerdo** move o foco entre elementos focáveis,
  espacialmente (vizinho mais próximo na direção pressionada) em vez de só
  seguir a ordem do DOM — necessário porque grids 2D (a biblioteca de
  jogos) não navegam bem com um "próximo/anterior" linear.
- **Botão A** ativa o elemento focado (equivalente a Enter/clique).
- **Botão B** volta uma tela ou fecha o modal aberto (equivalente a Esc).
- Nada disso substitui teclado ou mouse — os três métodos de entrada
  convivem, sempre.

As três restrições do ADR 0009 continuam valendo e são **a base que torna
isto possível sem reescrever componente por componente**:

1. Nenhuma ação existe só em hover.
2. Nenhuma ação existe só em clique direito.
3. Foco é estado de primeira classe, visualmente distinto de hover, seguindo
   a ordem de leitura.

Sem essas três, navegação por controle teria exigido auditar e corrigir cada
componente da interface primeiro. Com elas já em vigor desde o ADR 0009,
"navegar por controle" se resume a traduzir entrada de controle em eventos
de foco/clique/Esc que a interface já sabe responder.

**O que isto explicitamente não é:** o modo TV completo que o ADR 0009
menciona como possibilidade futura — layout alternativo, alvos grandes,
densidade baixa, ativado por detecção de controle. Essa continua sendo uma
decisão maior, de escopo comparável a um segundo aplicativo, e não foi
tomada aqui. Se um dia for construída, ela merece seu próprio ADR, exatamente
como o ADR 0009 já previa.

## Consequências

**Positivas**

- Navegação por controle chega à v1.0 sem o custo de dois layouts — a
  interface de mesa continua sendo a única a manter.
- Reaproveita por completo as restrições de acessibilidade do ADR 0009: quem
  navega por teclado hoje já teria a experiência que o controle replica.
- Não fecha a porta para um modo TV completo depois — a base de foco/ordem
  de leitura continua sendo pré-requisito dele também.

**Negativas / custos aceitos**

- A experiência de controle herda a densidade e os alvos de clique
  desenhados para mouse — não é a experiência "sofá, três metros de
  distância" que um modo TV real ofereceria. O ZeuX continua sem competir
  com o modo Fullscreen do Playnite ou o Big Picture da Steam nesse quesito
  específico.
- Navegação espacial (vizinho mais próximo por direção) é heurística, não
  garantida — grids irregulares ou telas com poucos elementos focáveis podem
  produzir um salto de foco que não é o mais intuitivo. Sem verificação
  automatizada disso; só revisão humana, com controle físico real (a mesma
  limitação estrutural do D11/B11 — nenhuma sessão de IA tem hardware para
  testar).

## Nota de aplicação

O ADR 0009 continua **Aceito** — a maior parte dele (interface de mesa como
base, as três restrições de acessibilidade) não mudou. Só a frase "sem
navegação direcional" deixou de valer, substituída pela decisão registrada
aqui. Ver `docs/roadmap.md`, Sprint L.
