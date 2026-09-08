# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Quem tem uma máquina qualquer (não presume PC de jogo) e uma pasta de jogos
já no disco, e quer que a distância entre "abrir o app" e "jogar" seja a
menor possível, sem precisar aprender vocabulário de emulador (resolução
interna, upscaling, backend gráfico, BIOS, cores do RetroArch) para chegar
lá.

## Product Purpose

ZeuX é a camada que decide em nome do usuário o que a máquina dele alcança
e monta a configuração certa sozinha — em vez de deixar a pessoa descobrir
por tentativa e erro qual emulador, preset e flags usar para cada console.
Sucesso é a distância entre instalar o app e o jogo abrir configurado
direito ser a menor possível: hoje, consentimento → scan → apontar uma
pasta → clicar num jogo, nada mais.

## Positioning

Não é mais um emulador — os emuladores já existem, maduros e gratuitos. O
que falta no mercado é uma camada honesta sobre o que o hardware do usuário
alcança e que autoconfigura a partir disso. Um launcher concorrente que
apenas lista emuladores sem dizer a verdade sobre o hardware, ou que
bloqueia/julga a máquina do usuário, não pode copiar essa posição sem
contradizer o próprio princípio.

## Operating Context

- App desktop (Tauri) com janela redimensionável — o usuário maximiza,
  encolhe ou troca de monitor a qualquer momento; layout precisa acompanhar
  (não é página web de largura fixa).
- Fluxo real: consentimento (texto versionado, checado no servidor) → scan
  de hardware (CPU/RAM/GPU) → apontar pasta de ROMs por console → grade
  "Todos os jogos" com selo de "pronto para jogar" ou aviso nomeando o
  componente que falta → clique abre o jogo já configurado.
  - Jogo pode ser jogado só de controle (padrão "standard" da Gamepad API):
    D-pad navega a grade por vizinho mais próximo na tela, A confirma, B
    volta (só quando a tela atual tem algo reconhecível como "Voltar").
    Falta hoje: nenhum prompt visual avisa que os botões fazem isso
    (pendência conhecida, não bug de UX a esconder).
- Camada social compartilha save states, texture packs, perfis de controle
  e lobby de netplay — nunca o jogo/ROM em si.

## Capabilities and Constraints

- Nunca facilita, sugere fonte ou compartilha ROM — nem por link nem por
  função utilitária entre máquinas.
- Nintendo Switch fica fora do catálogo de propósito (Yuzu/Ryujinx
  descontinuados por ação judicial) — não é lacuna a preencher.
- Falha de lançar um jogo é tratada como algo que o usuário pode resolver,
  nunca como erro opaco.
- Undecided: identidade visual de marca (paleta, tipografia, tom de voz)
  ainda está em aberto — é exatamente o que está sendo explorado agora.

## Brand Commitments

Nome do produto: ZeuX. Nenhuma paleta, tipografia ou tom de voz fixados
ainda (confirmado com o dono do produto) — em aberto de propósito.

## Evidence on Hand

- Logos oficiais de console (via IGDB) já embutidas em
  `internal/verdict/data/console-images/` para 30 dos 33 consoles do
  catálogo; os 3 restantes (Master System, Mega Drive, Sega CD) usam sigla
  estilizada (`ConsoleIcon`) por falta de logo cadastrada na fonte.
- Nenhum outro asset de marca (screenshot oficial, case, depoimento) a
  preservar como autoridade visual além do código já existente.

## Product Principles

1. **Informar, nunca julgar nem bloquear** — texto sobre hardware é
   descritivo (números e o que a máquina alcança), nunca "fraco"/"ruim"; um
   patamar não atingido nomeia o componente que falta, nunca uma nota opaca
   tipo "mediano". O ZeuX aconselha, quem decide é o usuário.
2. **Dado não verificável é declarado desconhecido** — nunca fingir certeza
   para deixar a resposta mais bonita.
3. **Consentimento é real, não decorativo** — verificado no servidor, versão
   sobe se o escopo do uso mudar.
4. **Zero vocabulário de emulador exigido do usuário** — qualquer tela nova
   precisa preservar o caminho "apontar pasta → clicar no jogo" sem inserir
   termos técnicos como obrigatórios.
5. **Legal por design** — a camada social nunca vira canal de distribuição
   de ROM, em nenhuma tela ou funcionalidade nova.

## Accessibility & Inclusion

Nenhum requisito específico confirmado além da navegação por controle
(D-pad/A/B) já implementada na Gamepad API. Não presumir suporte a leitor de
tela, daltonismo ou tamanho mínimo de fonte além do que o código já trata
(ver CLAUDE.md: piso de 11px da fonte pixel).
