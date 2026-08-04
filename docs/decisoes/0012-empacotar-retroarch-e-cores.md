# 0012 — Empacotar RetroArch e cores selecionados no instalador do ZeuX

**Status:** Aceito (decisão apenas — implementação não começou)

## Contexto

O RetroArch é o adapter mais usado do catálogo: aparece em **40 dos
patamares** de consoles (contra 2–6 de cada um dos outros 13 adapters), porque
é ele que cobre a maioria dos sistemas mais antigos/leves onde ainda não existe
(ou nunca vai existir) um emulador dedicado — ver `defaultCoreByConsole` em
`internal/emulator/retroarch.go`, que hoje mapeia 20 consoles a um core
padrão.

Testando o D11 de verdade (2026-08-03), o Douglas esbarrou nisto na prática: o
N64 usa RetroArch, e o RetroArch **não é instalável pelo 1-click do ZeuX** —
`internal/install/data/sources.json` marca ele como `"kind": "manual"` porque
ele distribui pelo buildbot próprio, não por releases do GitHub, e a estrutura
de diretórios do buildbot muda sem aviso. Pior: mesmo instalado, o RetroArch
não roda nada sem um **core** — e baixar o core certo é outro passo manual,
feito de dentro do próprio RetroArch (Online Updater → Core Downloader).

Ou seja: para 24 dos 33 consoles do catálogo, a promessa central do produto
("o app configura sozinho, o usuário não precisa saber o nome do emulador")
não se cumpre hoje. O primeiro remédio (dar ao N64 um adapter dedicado — RMG,
ver `docs/adapters.md`, seção 2) resolve um console por vez, e exige a mesma
pesquisa de verificação (existe emulador dedicado real? tem release no
GitHub? qual licença?) a cada console — lento, e alguns consoles nunca vão
ter alternativa dedicada viável.

## Decisão

**Empacotar uma versão fixa do RetroArch, mais um conjunto selecionado de
cores, diretamente dentro do instalador do ZeuX** — mesmo padrão já usado para
o `zeuxd` (o núcleo Go vai embutido no instalador do Tauri como recurso
empacotado, não baixado em tempo de execução; ver
[ADR 0001](0001-ipc-http-local.md)).

**Por que isto é diferente de facilitar ROM:** RetroArch e os cores libretro
são software livre (RetroArch é GPL-3.0). Redistribuir código aberto dentro do
próprio instalador é uma prática comum e legalmente prevista pela licença —
categoria de problema completamente diferente de distribuir jogos protegidos
por direito autoral, que o ZeuX segue recusando categoricamente.

**Atualização é manual, por decisão explícita do Douglas:** o ZeuX **não**
verifica nem baixa uma versão nova do RetroArch/cores sozinho. A versão
empacotada fica fixa até alguém — hoje, o Douglas, ao cortar uma nova versão
do ZeuX — decidir deliberadamente atualizar o que vai empacotado. Isso evita
reintroduzir o problema que tornou o RetroArch "manual" para começo de
conversa: perseguir uma estrutura de distribuição de terceiros que muda sem
aviso. Uma cópia fixa e revisada por alguém, de tempos em tempos, é mais
previsível que perseguir "a última versão" automaticamente.

**Quais cores:** o ponto de partida é `defaultCoreByConsole`
(`internal/emulator/retroarch.go`) — os cores que o próprio ZeuX já escolhe
como padrão quando o usuário não especifica um:

```
mesen, snes9x, gambatte, mgba, mupen64plus-next, melonds, beetle vb,
genesis plus gx, picodrive, beetle saturn, flycast, beetle psx hw, ppsspp,
beetle pce, beetle ngp, beetle cygne, opera, stella, mame, fbneo,
sameboy, bsnes, parallel n64, yabause
```

**Revisado em 2026-08-04, depois de um erro real:** a frase original aqui dizia
que os cores de patamar "ótimo" que não são o padrão (bsnes, ParaLLEl N64,
etc.) continuariam exigindo o Online Updater. Na prática isso quebrava a
autoconfiguração em hardware bom: o catálogo (`internal/verdict/data/consoles.json`)
recomenda `sameboy` para o tier "ótimo" de GB/GBC, `bsnes` para SNES, `parallel
n64` para N64 e `yabause` para um tier de Saturn — nenhum desses 4 estava na
lista original, e um hardware que atingisse esse patamar recebia "instale pelo
Online Updater" só para abrir um jogo, pior experiência que hardware mediano
(que cai nos cores padrão, esses sim empacotados). **Os 4 cores extras foram
adicionados** à lista abaixo por isso — o critério deixou de ser só
"`defaultCoreByConsole`" e passou a ser "todo core que algum tier do catálogo
pode recomendar via RetroArch", para que a autoconfiguração nunca esbarre
nessa mensagem.

## O que este ADR **não** decide — segue em aberto para quando a implementação começar

- **Licença de cada core, individualmente.** RetroArch é GPL-3.0, mas cada
  core do libretro tem a própria licença (a maioria GPL/MIT-like, mas isso
  precisa ser conferido core a core antes de empacotar — mesmo rigor do D1,
  não presumir que "é libretro, logo é GPL").
- ~~**Mecanismo técnico de empacotamento.**~~ **Resolvido em 2026-08-04** (ver
  `docs/adr-0012-implementation.md`, Etapa 5): recurso do Tauri
  (`"resources": ["resources/"]` em `tauri.conf.json`, mesmo padrão do
  `externalBin` do `zeuxd`). `Locate()` não precisou de nenhuma mudança — a
  cópia bundled cai no mesmo diretório gerenciado que uma instalação 1-click
  usaria, e `findBinary` já sabia procurar lá.
  **Ressalva:** só cobre Linux e Windows por enquanto; macOS (`.dmg`, não
  `.7z`) ficou de fora, decisão de escopo registrada na mesma etapa.
- **Tamanho medido do instalador** depois de empacotar — cada plataforma
  (Windows/Linux/macOS) só carrega o RetroArch + cores do próprio SO, do mesmo
  jeito que `build-zeuxd.mjs` só compila para o alvo do runner, então o
  crescimento é por instalador, não multiplicado pelos 3 SOs somados — mas o
  número real não foi medido ainda.
- **Arquivo de avisos de licença** (`NOTICES`/`THIRD-PARTY-LICENSES`) que a
  distribuição de GPL exige — precisa existir antes do primeiro instalador
  com RetroArch embutido sair, não depois.
- **`Installation.Version`** (item de dívida já conhecido, nunca preenchido
  por nenhum adapter) passa a importar de verdade aqui: como a versão não
  atualiza sozinha, o usuário precisa conseguir ver qual versão do RetroArch
  ele tem, num contexto onde isso nunca vai mudar sem uma ação humana.

## Consequências

**Positivas**

- Resolve de uma vez os 24 consoles que dependem do RetroArch, em vez de um
  por um — a comparação direta com o esforço do N64 (uma pesquisa inteira só
  para um console) é o que torna esta opção mais barata no total.
- Nenhuma dependência de rede no primeiro uso para esses consoles — o
  RetroArch e os cores já estão lá quando o app abre pela primeira vez.
- Reaproveita um padrão que o projeto já confia (o sidecar do `zeuxd`).

**Negativas / custos aceitos**

- Instalador maior — quanto, ainda não medido.
- Manutenção nova e recorrente: alguém precisa lembrar de atualizar a cópia
  empacotada de tempos em tempos. Isso é trabalho manual aceito de propósito
  (ver decisão acima), não um processo automatizado a construir depois.
- Superfície de conformidade de licença nova (avisos, atribuição) que o
  projeto não tinha até aqui — `consent`, `custom_emulators` e o catálogo são
  todos código próprio; isto é a primeira vez que binário de terceiro é
  distribuído dentro do próprio instalador do ZeuX.

## Gatilho para revisão

Reabrir se o RetroArch algum dia passar a publicar releases estáveis no
GitHub com estrutura previsível — nesse caso, a instalação 1-click dinâmica
(o mesmo mecanismo que já atende os outros 13 adapters) pode voltar a ser
preferível ao empacotamento fixo, sem o custo de manutenção manual.
