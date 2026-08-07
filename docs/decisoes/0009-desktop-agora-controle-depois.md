# 0009 — Interface de mouse e teclado agora, sem fechar a porta para controle

**Status:** Aceito — cláusula "sem navegação direcional" emendada pelo
[ADR 0014](0014-navegacao-por-controle.md) (2026-08-06). O resto deste
documento (interface de mesa como base, as três restrições de
acessibilidade) continua valendo sem mudança.

## Contexto

Front-ends de emulação vivem em dois mundos ao mesmo tempo. Um é a mesa, com
mouse e teclado, onde a pessoa organiza a biblioteca, instala emulador e ajusta
configuração. O outro é o sofá, com controle na mão e a TV a três metros —
território do Big Box (LaunchBox), do modo Fullscreen do Playnite e do Steam Big
Picture.

Os dois têm exigências que se contradizem no detalhe:

| | Mesa | Sofá |
|---|---|---|
| Alvo de clique | pequeno, denso | grande, espaçado |
| Navegação | ponteiro livre, qualquer ordem | foco linear, direcional |
| Texto | 14 px a 60 cm | 24 px a 3 m |
| Ações secundárias | hover, clique direito, menu de contexto | precisam de botão explícito |
| Densidade | muita informação por tela | pouca, uma decisão por vez |

Construir os dois desde o início dobraria o escopo de toda tela — na prática,
dois aplicativos compartilhando uma API. Construir só o de mesa e adaptar depois
é o caminho que historicamente sai caro: quando uma interface nasce presumindo
ponteiro, a dependência de hover e de clique direito se espalha por dezenas de
componentes, e cada um vira uma correção individual.

O agravante é que o ZeuX tem razões fortes para acabar no sofá. Emulação é
cultura de sala de estar, o app já lança jogo em tela cheia, e o roadmap prevê
suporte a controles como pré-requisito dos perfis de controle compartilháveis.

## Decisão

A interface é construída **para mouse e teclado**, sem modo TV, sem navegação
direcional e sem layout alternativo.

Mas três restrições valem desde já, para que o modo controle continue possível
sem reescrita:

1. **Nenhuma ação existe apenas em hover.** Se aparece ao passar o mouse, tem que
   existir também como elemento alcançável por foco. Hover pode antecipar, nunca
   revelar em exclusividade.
2. **Nenhuma ação existe apenas em clique direito.** Menu de contexto é atalho,
   e todo item dele precisa de outro caminho visível.
3. **Foco é estado de primeira classe.** Todo elemento interativo tem estado de
   foco visível e desenhado, e a ordem de foco segue a ordem de leitura. Isso já
   aparece no wireframe de propósito.

Estas restrições **não** exigem alvos grandes, tipografia de TV, densidade baixa
nem navegação por setas. Essas são decisões do modo TV, e ficam para quando (e
se) ele for construído.

## Consequências

**Positivas**

- Metade do trabalho de interface, coerente com o objetivo de manter o produto
  simples e leve.
- As três restrições são, sozinhas, boas práticas de acessibilidade — quem navega
  por teclado se beneficia hoje, não só o hipotético usuário de controle amanhã.
- Um modo TV futuro herda uma base sem dependência estrutural de ponteiro, e vira
  um trabalho de layout e navegação em vez de arqueologia de componente.

**Negativas / custos aceitos**

- **O ZeuX não compete com Big Box e Playnite Fullscreen** enquanto isso durar.
  É uma ausência que usuário de sofá vai notar.
- As três restrições custam algum atrito no dia a dia: soluções que dependeriam
  de hover precisam de alternativa, o que às vezes significa mais um botão na
  tela.
- Restrição sem teste automatizado tende a erodir. Não há hoje verificação que
  impeça alguém de introduzir uma ação só de hover — a garantia é revisão humana,
  e isso é frágil por natureza.

## Nota de aplicação

Isto **não** é uma decisão contra o modo TV. É uma decisão sobre **ordem**: a
interface de mesa vem primeiro porque é onde o produto se prova, e o modo TV é
candidato normal de roadmap quando houver interface de mesa funcionando e suporte
a controles implementado.

Se o modo TV for construído, ele merece ADR próprio — a decisão de fazer dois
layouts, com que grau de compartilhamento de componente, é maior que esta.
