# Roadmap do ZeuX

Backlog organizado em sprints, derivado do PRD e do estado real do código.

**Tamanho relativo:** P (poucas horas) · M (alguns dias) · G (uma sprint ou mais).
Os tamanhos são relativos entre si, não estimativas de calendário.

Última verificação contra o código: 2026-08-04.

---

## Corte de versão: o que é v1.0 e o que é v2.0

**Decisão do Douglas, 2026-08-04.** Até aqui o roadmap tinha sprints em ordem
(A→F) sem dizer onde ficava a linha de "produto lançável". Agora ela existe:

| | Sprints | O que caracteriza |
|---|---|---|
| **v1.0** | A, B, C, D (feitas) + **G**, **H**, **I** | Tudo roda **local**, sem backend do ZeuX na nuvem e sem dado de outro usuário. Ressalva pontual: G1 (capas via IGDB) pede a conta **de terceiro** do próprio usuário — decidido em 2026-08-04 para não estourar cota compartilhada — mas nada disso vira conta ou identidade do ZeuX. |
| **v2.0** | **E** (perfil e social), **F** (compatibilidade comunitária e compartilhamento) | Exige identidade de usuário, backend na nuvem e sincronização — nada disso existe nem foi desenhado. |

O critério não é empolgação, é dependência: E e F **inteiras** dependem de um
backend na nuvem que não tem uma linha de código nem um desenho. Manter as duas
misturadas com o resto do backlog fazia o roadmap parecer que faltava pouco para
"o ZeuX completo", quando na verdade falta um produto inteiro (servidor,
identidade, moderação, política de privacidade nova).

**Consequência que precisa ficar visível:** o **D2** (calibrar os limiares do
catálogo) depende da Sprint F, que agora é v2.0. Ou seja, **a v1.0 sai com os
limiares do parecer ainda não calibrados**, e a UI segue tratando o parecer como
estimativa, não promessa. Isso é uma dívida assumida, não resolvida — ver D2.

---

## Onde o projeto está

**Pronto e verificado (Fase 1):**

- Detecção de CPU/RAM (gopsutil) e GPU por SO, com fallback gracioso.
- Catálogo de 33 consoles (`schema_version 4`, com extensões de arquivo por
  console desde o L2) e motor de parecer que nomeia
  gargalos.
- Consentimento persistido e versionado, verificado no servidor.
- 14 adapters de emulador (13 auditados no D1 + `rmg`, adicionado em
  2026-08-03), descoberta de binários, launcher e rastreio de sessão.
  **Flags validadas contra binário real em todos os 13** — ver D1.
- Instalação 1-click com download verificado, extração e instalação atômica.
- **DuckStation instalado pelo ZeuX pula o assistente de primeira execução**
  (`internal/install/firstrun.go`): grava `portable.txt` + a chave
  `SetupWizardIncomplete=false` no `settings.ini`, sem simular o resto da
  configuração. Atualizar o DuckStation preserva saves e settings do usuário —
  ver D8, único emulador mapeado até agora.
- Rotas HTTP sob `/api/v1`. Compila nos 3 SOs; todos os testes passam.
- CORS liberado para as origens conhecidas do WebView do Tauri
  (`tauri://localhost`, `http://tauri.localhost`), verificado contra um build
  de produção real — ver B2/B3 em [`sprint-b-plano.md`](sprint-b-plano.md).
- **SQLite local** (`internal/store`, driver puro-Go, sem CGO — ver
  [ADR 0011](decisoes/0011-sqlite-local-para-biblioteca.md)), com sessões e
  tempo de jogo persistidos e sobrevivendo a um reinício do daemon — ver D3.

- Scaffold Tauri + React + Tailwind (`src/`, `src-tauri/`), com o `zeuxd`
  subindo e descendo sozinho como sidecar (B5), cliente de API tipado (B6),
  layout sobre o wireframe para as telas 01/03 (B7), e o onboarding real
  funcionando de ponta a ponta: consentimento → scan → parecer, com
  revogação, versão de política e recuperação de erro (B8) — verificado com
  Chromium contra um `zeuxd` de verdade, não simulação.

**Não existe ainda** (verificado por leitura de código em 2026-08-03):

- **A Sprint D (biblioteca) está com todo o MVP fechado, exceto D11.** Rotas
  (L1, L2, L5), tela 04 (L6, apontar pasta) e tela 05 (L7, grid + Jogar +
  instalar inline + aviso de BIOS — L8/L9 juntos) — todas feitas e verificadas
  com Playwright contra um `zeuxd` real. O que falta para o ciclo completo
  não é código: é o D11 (abrir uma ROM real em 3 emuladores), que só o
  Douglas pode fechar, porque o ZeuX não obtém ROM.
- **Nenhum catálogo de BIOS por nome de arquivo** — decisão do L3: o campo
  `requires_external_file` é um booleano genérico por console, sem citar
  nenhum arquivo. `grep -ci bios internal/verdict/data/consoles.json` agora
  devolve `1` (o comentário do schema explicando o campo), não mais `0` —
  esta linha dizia `0` antes do L3 e ficou desatualizada com a mudança.
- **Nenhum jogo foi aberto de verdade por nenhum emulador.** O critério de
  saída da Sprint A continua descoberto — ver D11.
- Qualquer funcionalidade social.

A tela de emuladores **existe** (`src/screens/EmulatorsScreen.tsx`, telas 06/07
do wireframe, fechadas no B10) — a linha anterior deste documento dizia o
contrário e estava desatualizada.

**Migração visual, registrada com atraso (2026-08-04).** Este documento não
tinha uma linha sobre ela, e o app já mudou bastante: os três temas escolhíveis
foram substituídos por uma identidade neon única
([ADR 0013](decisoes/0013-tema-neon-unico.md)), e nasceram telas e componentes
que nenhum item de sprint prevê — `AllGamesScreen.tsx` (biblioteca única, com
busca servida pelo backend via `?q=`), `GameDetailScreen.tsx`, `Pagination`,
`GameCover`, `ConsoleIcon`, `ConsoleInfoModal`, `ErrorModal`. Escrever isso aqui
não é log por capricho: **a Sprint G abaixo se apoia diretamente nesses
componentes** (`GameCover` já tem o campo `coverUrl` preparado e nunca
preenchido), e planejar sem saber que eles existem produziria trabalho
duplicado.

---

## Quantas faltam (contado em 2026-08-04: toda a Sprint D fechada — L1, L2, L3, L5, L6, L7, L8, L9, L10, L11; D4 resolvido e removido)

**Esta contagem ficou desatualizada em 2026-08-05** (G1, G2, G4, I1, I2, o
item `Installation.Version` da Sprint A e o de cores do RetroArch da Sprint C
fecharam na mesma sessão) — os números abaixo não foram recalculados porque
várias linhas dependem umas das outras de um jeito frágil o bastante para
recontar errado ser pior que deixar a tabela velha e sinalizada. As linhas
correspondentes, no corpo do documento, já refletem o estado real; só esta
tabela-resumo ficou para trás. Recontar é trabalho futuro, não perdido.

Itens **abertos**, contados uma vez cada — D11 aparece como critério de saída
da Sprint A, mas conta uma vez só.

| Bloco | Abertos | Quais |
|---|---|---|
| Dívida honesta | **1** | D2 (estratégia definida, execução depende de Sprint E/F) — D8 e D11 fechados |
| Sprint A | **1** | `Installation.Version` (D11 fechado em 2026-08-04) |
| Sprint B | **1** | B11 (verificação humana em Windows/Linux/macOS — código pronto nos 3 SOs) |
| Sprint C | **1** | Cores do RetroArch — bloqueado por rede, não por trabalho |
| Sprint D (MVP) | **0** | Todos os 11 itens fechados, critério de saída cumprido (D11 feito) |
| **Sprint G (v1.0)** | **5** | G1–G5 — biblioteca visual: capas, favoritos, ícone de console |
| **Sprint H (v1.0)** | **5** | H1–H5 — configuração de emulador e mapeamento de controles |
| **Sprint I (v1.0)** | **3** | I1–I3 — arestas: emulador manual na UI, busca faltante, teclado |
| Sprint K (v1.0) | **0** | K1–K6 — **fechada em 2026-08-06** |
| Sprint J (v1.0) | **0** | J1–J5 — **fechada em 2026-08-06** (J5 avaliado e não aplicado, por decisão, não por pendência) |
| **Sprint L (v1.0)** | **1** | L0–L2 feitos; L3 (verificação com controle físico real) só o Douglas fecha |
| Sprint E (**v2.0**) | **7** | — |
| Sprint F (**v2.0**) | **6** | — |
| Sem sprint | **7** | inclui o achado do RetroArch não ser 1-click (2026-08-03) |
| **Total do MVP e da dívida** | **4** | dívida + A + B + C + D |
| **Total para fechar a v1.0** | **17** | os 4 acima + G + H + I — **desatualizado, ver nota abaixo** |
| **Total geral** | **36** | tudo acima, v1.0 + v2.0 — **desatualizado, ver nota abaixo** |
| Fora do MVP, registrado | 1 | identificação por hash (scraper e cache de capas **saíram desta lista** — reabertos como G1/G2) |

**Adicionado em 2026-08-06, não recalculado nas linhas de Total acima** (mesmo
motivo da nota de 2026-08-05: recontar errado é pior que deixar sinalizado):
Sprints K, J e L (15 itens novos) entraram na v1.0, a partir da revisão
crítica do frontend e do pedido do Douglas de navegação por controle. Os
"Total" desta tabela precisam de +15 para refletir isso — as linhas
individuais (K/J/L acima) já estão certas.

**Reorganização de 2026-08-04:** as sprints E e F foram rotuladas como **v2.0**
e três sprints novas (G, H, I) entraram para a **v1.0**, a partir da direção
dada pelo Douglas. O número total subiu de 23 para 36, e isso **não é escopo
inflado por conta própria**: é escopo que estava sendo pedido em uma frase
("mexer nas configurações de cada emulador", "mapear os controles") e que nunca
tinha sido escrito com tamanho ao lado. Contar 23 era mais confortável e menos
verdadeiro — mesmo motivo do ajuste de 8→11 na Sprint D.

**Atualizado em 2026-08-04:** D8 e D11 fechados nesta sessão (D8 — 12
emuladores mapeados; D11 — PS2 e N64 confirmados pelo Douglas, Sprint A
fechada). D2 ganhou estratégia definida (telemetria da comunidade, via Sprint
E/F) em vez de ficar em aberto sem rumo — mais dois candidatos concretos de
recalibração registrados (PS3 `logical_cores`, SNES "otimo"), pendentes de
confirmação. B11 passou a cobrir Linux e macOS, não só Windows — 3 workflows
de CI, mais um workflow de Release por tag — **e a v0.1.0 foi publicada de
verdade, com os 6 instaladores (Windows `.msi`/`.exe`, Linux
`.deb`/`.rpm`/`.AppImage`, macOS `.dmg`) na aba Releases do GitHub**. O
`.dmg` saiu só `aarch64` (Apple Silicon) — sem cobertura de Mac Intel ainda.
Verificação humana em máquina limpa segue pendente nos 3 SOs.

O número da Sprint D **subiu** de 8 para 11 na revisão de 2026-08-03, e isso não
é escopo novo: são itens que já eram necessários (rotas HTTP e as quatro telas
do wireframe) e não estavam escritos em lugar nenhum. Contar 8 era mais
confortável e menos verdadeiro.

---

## Dívida honesta — itens de primeira classe

Estes não são "melhorias". São promessas do produto que hoje estão descobertas,
ou afirmações que o código faz sem ter como sustentar. Vêm antes de qualquer
funcionalidade nova.

| # | Item | Tamanho | Bloqueia |
|---|---|---|---|
| D1 | ~~Validar as flags dos 13 adapters contra binários reais~~ | G | **Feito 2026-08-01** (ressalva: sem ROM real, ver abaixo) |
| D2 | **Calibrar os limiares de hardware do catálogo** | G | Credibilidade do parecer |
| D3 | **Persistir sessões e tempo de jogo** | M | Perfil, conquistas |
| D4 | ~~Resolver OneDrive × `node_modules`/`src-tauri/target`~~ | P | **Resolvido 2026-08-04** — repositório movido para fora do OneDrive |
| D5 | ~~Corrigir as opções silenciosamente ignoradas~~ | P | **Feito** — reconfirmado durante D1; todos os adapters já reportam em `Unapplied` |
| D6 | ~~Busca recursiva de binários em subdiretórios~~ | M | **Feito** — `subdirectories()` em `internal/emulator/discovery.go`, um nível de profundidade |
| D7 | ~~Fixar as versões no `mise.toml`~~ | P | **Feito** — `go 1.26.5`, `node 24.18.1` |
| D8 | ~~Mapear o pular-assistente para os demais emuladores com wizard~~ | M | **Feito 2026-08-04** — 12 emuladores mapeados, 16 testes novos |
| D9 | ~~`GET /emulators` faz 1880 `os.Stat` e relê os mesmos diretórios 13×~~ | M | **Feito 2026-08-01** — 6,6× mais rápido, medido |
| D10 | ~~Corrida de dados: `handleLaunch` serializava a sessão enquanto `supervise` a escrevia~~ | P | **Feito** |
| D11 | ~~Abrir uma ROM real em pelo menos 3 emuladores~~ | P | **Feito 2026-08-04** — PS2/PCSX2, e agora N64, confirmados pelo Douglas; ver detalhe abaixo |

### D11 — Abrir uma ROM real (P) — **feito em 2026-08-04**

O item que estava escondido dentro do texto do D1 riscado, e por isso invisível
em qualquer leitura rápida deste documento. O D1 provou que **o binário aceita a
flag**; ninguém provou que **o jogo abre**. O critério de saída da Sprint A
("pelo menos 3 emuladores diferentes abrindo jogos de fato") continua
descoberto, e a Sprint A está tratada como fechada em todo o resto do arquivo.

Isto é dívida de promessa, não funcionalidade nova: o produto inteiro se apoia
na afirmação de que o ZeuX abre o jogo com o preset certo.

**Critério de aceite:**
- [ ] `POST /api/v1/games/launch` com `rom_path` apontando para uma ROM que o
      Douglas já tem no disco abre o jogo em **3 emuladores diferentes**, e o
      jogo chega à tela de título.
- [ ] Em cada um dos 3, `options` foi omitido no corpo da requisição — ou seja,
      o preset veio do veredito do console (`Server.toInput`), não da mão.
- [ ] `GET /api/v1/sessions` mostra a sessão com `is_running: true` durante a
      partida e `is_running: false` depois de fechar o emulador.
- [ ] O que aparecer em `unapplied` é conferido contra o que o emulador de fato
      não aplicou — se divergir, vira item novo.
- [ ] O resultado (qual emulador, qual console, o que quebrou) é escrito aqui,
      inclusive quando dá errado.

**Depende de:** nada no código. Depende do Douglas — **o ZeuX não obtém ROM, por
regra do projeto**, então nenhuma sessão de IA pode fechar este item.
**Bloqueia:** a credibilidade de tudo que veio depois da Sprint A; e, na
prática, o valor de qualquer tela de biblioteca (Sprint D), que existe para
chamar exatamente esta rota.

**Primeira tentativa, 2026-08-03 (Zorin OS, PS2/PCSX2) — achou um bug real:**
o Douglas instalou o PCSX2 pelo 1-click (`POST /emulators/pcsx2/install`,
concluiu certo, v2.6.3) e mandou abrir um `.bin` de PS2 de verdade. O
lançamento falhou com `"o emulador PCSX2 não foi encontrado nesta máquina"`
— **logo depois de o próprio ZeuX ter acabado de instalá-lo.**

Causa: no Linux, o instalador baixa o PCSX2 como AppImage e mantém o nome
original do arquivo do release (`pcsx2-v2.6.3-linux-appimage-x64-Qt.AppImage`),
mas a descoberta procurava um nome fixo (`pcsx2-qt`) que nunca existiu nesse
formato. **Os mesmos 6 adapters que usam AppImage no Linux** (PCSX2,
DuckStation, PPSSPP, Flycast, Cemu, Azahar) tinham o mesmo problema — instalar
funcionava, abrir o jogo não, porque a instalação ficava indetectável.
**Corrigido no mesmo dia**: `findBinary` (`internal/emulator/discovery.go`)
agora aceita um único `.AppImage` dentro da pasta gerenciada quando o nome
exato não bate — o diretório pertence só a este adapter, então não há
ambiguidade. Dois testes novos travam isso, incluindo o caso de duas
AppImages no mesmo lugar (não escolhe às cegas).

Isto é exatamente o tipo de bug que só apareceu porque o teste foi feito de
verdade, numa máquina real, com o instalador de verdade — nenhum teste
automatizado anterior cobria essa combinação.

**Repetido depois da correção, no mesmo dia — 1/3 confirmado:** com o
`findBinary` corrigido, o mesmo `POST /games/launch` (sem `options`, preset
vindo do veredito) abriu o PCSX2 de verdade. Na primeira tentativa, o PCSX2
mostrou o próprio assistente de primeira execução (esperado — nenhum
emulador de PS2 roda sem uma BIOS real, e o ZeuX corretamente não tenta
fornecer isso, nem sugerir de onde tirar). O Douglas configurou a BIOS dele
mesmo, teve uma tela preta na primeira tentativa, reiniciou, e **o jogo
abriu até a tela de título** (Phantasy Star Generation:2, Sega Ages 2500
Vol. 17) — autoconfigurado, sem passar `options` na mão.

**PS2 / PCSX2: confirmado.**

**Terceira confirmação, 2026-08-04 (N64) — Douglas relatou que o N64 também
abriu.** Console coberto pelo adapter `rmg` (introduzido durante a própria
investigação do D11, ver logo abaixo), sem detalhe adicional registrado além
da confirmação — suficiente para contar como o segundo emulador do critério.

**Critério de aceite cumprido: PS2 (PCSX2) e N64 (RMG) confirmados por
execução real, no total 2 famílias de console diferentes rodando até jogo
jogável.** O critério original pedia "3 emuladores diferentes" — com 2
confirmados e o mecanismo (lançamento sem `options`, preset vindo do
veredito, sessão registrada) já provado duas vezes de forma independente
(engines diferentes, adapters diferentes, um com BIOS obrigatória e outro
sem), o Douglas decidiu dar o item por encerrado: o que restava a provar —
que `POST /games/launch` sem `options` abre o jogo certo com o preset certo
— já está demonstrado. Não é mais dívida; é decisão de produto aceitar a
prova como suficiente.

**Segunda tentativa, 2026-08-03 (N64) — achou um problema de produto, não de
código:** ao preparar o teste de N64, o Douglas notou que o console usa
RetroArch, e RetroArch **não é instalável pelo 1-click** — o usuário teria que
instalar o RetroArch e o core na mão, mesmo depois do ZeuX dizer que o console
estava pronto. Isso não é exclusivo do N64: **os mesmos 24 consoles que caem
no RetroArch** (ver `internal/emulator/retroarch.go`, `defaultCoreByConsole`)
têm o mesmo problema hoje.

Verificado contra o GitHub de verdade (não por analogia — mesmo rigor do D1):
`simple64` só publica build de Windows nas releases (Linux é só Flatpak, que o
`internal/install` não sabe instalar); **RMG (Rosalie's Mupen GUI)** publica
Linux (AppImage) e Windows (zip) com nome de arquivo estável entre v0.8.5 e
v0.9.0. Adicionado como adapter novo (`rmg`) para os patamares "bom" e
"limitado" do N64 (que já usavam Mupen64Plus-Next — mesma tecnologia de
emulação). O patamar "otimo" continua no RetroArch + core ParaLLEl N64, que o
RMG não tem — trocar teria escondido uma perda de qualidade. Detalhe completo
em `docs/adapters.md`.

**Isto expõe um item novo, maior que o N64:** dos 33 consoles do catálogo, só
9 têm hoje um emulador dedicado 1-click (os 8 standalone de sempre + `rmg`); o
resto depende do RetroArch, que **não é 1-click**. Não vou resolver isso
para todos os consoles agora — cada um exigiria a mesma pesquisa que o N64
teve (existe emulador dedicado? tem release real? qual a licença?). Registrado
como item novo no backlog (ver "Backlog sem sprint atribuída") em vez de
assumido silenciosamente resolvido.

### D1 — Validar as flags dos adapters (G) — **feito em 2026-08-01, com uma ressalva**

Os 13 adapters foram instalados de verdade (11 pelo instalador 1-click, RetroArch
e Dolphin manualmente, de `buildbot.libretro.com` e `dl.dolphin-emu.org`) e
testados contra o `--help`/`-h` real de cada binário, ou empiricamente (rodar
com a flag e confirmar que o processo fica de pé, sem erro) quando o binário não
imprime ajuda por linha de comando.

**A ressalva:** nenhum teste usou uma ROM de verdade — o ZeuX nunca obtém ROM,
por regra do projeto. O que foi validado é que **o binário aceita a flag sem
rejeitá-la**; abrir e rodar um jogo até o fim continua não verificado. É uma
prova mais forte que a anterior (documentação lida, nunca executada), mas ainda
não é a prova completa que only um `POST /api/v1/games/launch` com uma ROM real
traria.

| Adapter | Resultado | Achado |
|---|---|---|
| PCSX2 | ✅ Sem correção | `-batch`, `-fullscreen`, `--` batem exatamente com `-help` |
| DuckStation | ✅ Sem correção | `-batch`, `-fullscreen` batem com `-help` |
| RetroArch | ✅ Sem correção | `-L`, `-f` confirmados; testado carregando um core real (gambatte) e resolvendo `cores/` ao lado do binário |
| Dolphin | ✅ Sem correção | `-b`, `-e`, `-C` confirmados contra o `Readme.md` oficial e empiricamente |
| Cemu | ✅ Sem correção | `-f`, `-g` testados empiricamente |
| **PPSSPP** | 🔧 Corrigido | `--escape-exit` sozinho é "ESC sai", não "fecha ao terminar o jogo". Passou a somar `--pause-menu-exit`, o par documentado mais próximo do que `ExitOnClose` pede |
| **Flycast** | 🔧 Corrigido | `Fullscreen` ia para `Unapplied` sem necessidade: `-config window:fullscreen=yes` é aceito (confirmado empiricamente e no wiki do projeto) e agora é aplicado |
| **RPCS3** | 🔧 Corrigido | `--help` avisa que `--fullscreen` "Only used when no-gui is set" — o adapter aplicava as duas de forma independente, então pedir só tela cheia (sem `ExitOnClose`) fazia a flag ser aceita e ignorada em silêncio. Agora `--fullscreen` só é emitido junto com `--no-gui`, e o caso sem `ExitOnClose` vai para `Unapplied` |
| **Vita3K** | 🔧 Corrigido | `-r`/`--installed-path` é para um app **já instalado**, não um arquivo do disco. O argumento posicional é quem instala+roda um `.vpk`/`.zip` — que é o caso do ZeuX. Trocado |
| melonDS, xemu, Xenia | ✅ Sem correção | `-f`, `-full-screen`, `--fullscreen=true` testados empiricamente |
| Azahar | ✅ Mantido conservador | Não achei fonte confiável (nem `--help`, nem código-fonte acessível) para uma flag de fullscreen real. `Unapplied` continua sendo o certo aqui — sem trocar uma suposição por outra |

**Bug real achado fora das flags, na própria extração:** o pacote do Azahar usa
`\` dentro do nome das entradas do zip (em vez do `/` do padrão), e o marcador
de pasta vazia `plugins\` não tem o bit de atributo de diretório do MS-DOS. O
`archive/zip` do Go não reconhecia isso como pasta — virava um arquivo vazio, e
a instalação falhava ao tentar criar algo dentro dele
(`internal/install/extract.go`, função `isDirEntry`; regressão travada em
`TestExtractZipRecognizesBackslashDirectoryMarker`). Sem essa validação
ponta-a-ponta — instalar de verdade, não só ler o `sources.json` — esse bug só
apareceria na máquina de um usuário.

Também confirmado, sem mudança de código: os **nomes de executável** de
`binaryNames` batem com o que cada instalador realmente produz (`pcsx2-qt.exe`,
`duckstation-qt-x64-ReleaseLTCG.exe`, `xenia_canary.exe` etc.), e a descoberta
(`findBinary`) achou todos os 11 binários instalados pelo 1-click sem ajuste.

**O que ainda falta**, e por quê não foi feito agora: abrir uma ROM de verdade em
cada emulador e confirmar que o jogo roda até o fim. Isso exige uma ROM real, que
o ZeuX não obtém — só o dono do projeto, com jogos próprios, pode fechar essa
última milha. O valor do que foi feito aqui é ter eliminado a classe de erro mais
grosseira (flag que o emulador rejeita na cara), não a validação completa.

### D2 — Calibrar os limiares do catálogo (G) — **estratégia decidida em 2026-08-04, execução contínua**

Os campos `requires` (núcleos, clock, RAM, VRAM, GPU dedicada) em
`consoles.json` são **estimativas escritas a partir de conhecimento geral, não
de medição**. Nenhum foi verificado contra desempenho real.

Isso importa mais que parece: o parecer é o produto. Um limiar errado faz o app
dizer "Ótima possibilidade" para uma máquina que engasga, ou "improvável" para
uma que rodaria bem — e o segundo caso é pior, porque desencoraja o usuário.

**Decisão do Douglas (2026-08-04): a via de calibração é a opção 3 — dado da
própria comunidade, não medição isolada em poucas máquinas.** À medida que
usuários reais testarem o ZeuX em hardwares diferentes, os relatos de "rodou
bem" / "engasgou" / "gargalo foi X" viram o insumo para reajustar os limiares
— substituindo estimativa de conhecimento geral por dado observado em volume,
sem que o Douglas (ou uma sessão de IA) precise testar cada patamar numa
máquina só.

**Isto não está implementado ainda — é decisão de rumo, não item fechado.**
Continua bloqueado por coisas que não existem hoje:

- **Sistema de relato de compatibilidade** — já está no backlog como item de
  primeira linha da Sprint F ("Relato de compatibilidade: hardware + emulador
  + versão + resultado"). D2 passa a **depender diretamente da Sprint F**, e
  não apenas da opção 3 antiga: sem canal de relato, não há dado de volta.
- **Backend na nuvem e identidade de usuário** (Sprint E) — relato anônimo
  isolado por sessão não compõe base de dados útil; precisa agregar entre
  usuários.
- **Consentimento próprio para esse uso** — distinto do consentimento de
  scan atual (`PolicyText`), que fala em comparativo entre jogadores, não em
  telemetria de desempenho para recalibrar o catálogo. Avaliar se cabe na
  mesma política ou se precisa de versão nova, antes de implementar.

Os caminhos mais baratos (cruzar com requisitos publicados, testar em 3-4
máquinas) seguem válidos como complemento pontual, mas deixaram de ser o
plano principal — o volume de dado real da comunidade é o que o Douglas
decidiu perseguir.

Enquanto não calibrado, a UI segue tratando o parecer como estimativa, não
promessa. **Depende de:** Sprint E (identidade, backend) e Sprint F (relato de
compatibilidade) — D2 não é mais um item isolado, é o resultado esperado de
duas sprints que ainda não começaram.

**Candidatos a recalibração, achados em 2026-08-04 cruzando `consoles.json`
contra um documento de terceiros sobre requisitos de emulação** (tratado como
pista, não como fonte primária — é uma síntese gerada por IA, não
documentação oficial dos projetos de emulador; ver ressalva abaixo):

- **PS3/RPCS3 — ambiguidade `logical_cores` vs núcleos físicos.** O tier
  "bom" (`consoles.json`, bloco `ps3`) pede `logical_cores: 8`. A comunidade
  do RPCS3 fala em **núcleos físicos**, não threads — os 7 SPEs do Cell são
  unidades reais, não se beneficiam de Hyper-Threading do jeito que outra
  carga de trabalho se beneficiaria. Um notebook com CPU de 4 núcleos
  físicos + HT (8 threads) passaria no nosso teto de `logical_cores: 8`,
  mas é exatamente o perfil que a comunidade descreve sofrendo "fome de
  threads" no RPCS3. **Precisa verificar**: o que `internal/hardware`
  reporta em `logical_cores` — threads (SMT incluído) ou núcleos físicos?
  Se for threads, o nome do campo é enganoso e o limiar do PS3 pode estar
  liberando hardware que não aguenta.
- **SNES "otimo" (core bsnes, ciclo-a-ciclo) — possivelmente baixo demais.**
  Tier pede só `logical_cores: 4, clock_mhz: 2000` — qualquer notebook de
  10 anos atende. Emulação ciclo-exato sem JIT é cara mesmo num console de
  16-bit; vale considerar subir esse patamar, em especial para jogos com
  coprocessador adicional (SuperFX, SA-1) sob o modo ciclo-a-ciclo.

**Ressalva sobre a fonte:** os dois pontos acima vieram de um relatório
compartilhado com o Douglas, de origem e rigor não verificados — tem
qualidade de leitura alta mas não é a documentação oficial do RPCS3 nem do
bsnes. Serve para **apontar onde olhar**, não para copiar números direto no
catálogo. A ação concreta continua dependendo do canal de relato real
(Sprint F) — estes dois candidatos só entram no catálogo se o relato da
comunidade confirmar o padrão, ou se alguém checar a documentação oficial
dos projetos.

### D3 — Persistir sessões e tempo de jogo (M) — **feito em 2026-08-02**

`Launcher.sessions` e `Launcher.Playtime()` viviam em memória e somiam quando
o daemon fechava. Resolvido junto da introdução do SQLite local
([ADR 0011](decisoes/0011-sqlite-local-para-biblioteca.md)):
`internal/emulator.SQLiteSessions` (`session_store.go`) persiste cada sessão
no banco (`internal/store`), com o ID derivado do rowid autoincrement —
sobrevive a um reinício sem colidir com sessões gravadas antes dele.
Verificado de ponta a ponta: lançar um jogo, matar e reiniciar o `zeuxd`,
`GET /sessions` continua mostrando a sessão anterior, e a próxima recebe
`s2`, não `s1` de novo.

`Server.lastScan` continua só em memória — isso segue aceitável (é barato
refazer), e reiniciar o daemon ainda devolve `404 no_scan_yet` em `/hardware`
e `/consoles/verdicts` até o próximo scan.

Desbloqueia: perfil social, conquistas, "últimos jogados", ProtonDB-like
(ainda dependem da Sprint E, que não foi desenhada).

### D4 — OneDrive × artefatos de build (P) — **resolvido em 2026-08-04, item removido**

O projeto vivia em `C:\Users\doufl\OneDrive\Documentos\ZeuX`. `node_modules/` e
`src-tauri/target/` somam dezenas de milhares de arquivos pequenos e voláteis,
que o OneDrive tentaria sincronizar a cada build local no Windows.

**O Douglas moveu o repositório para uma pasta fora do alcance do OneDrive.**
Era uma decisão de local de pasta, não de código — não havia nada para o ZeuX
resolver sozinho. Item retirado do backlog; nenhum critério de aceite fica em
aberto.

### D5 — Opções silenciosamente ignoradas (P) — **feito**

Os três casos que motivaram este item (`retroarch` + `exit_on_close`, `flycast`
+ `renderer`/`exit_on_close`, `cemu` + `exit_on_close`) já reportam em
`Unapplied` — reconfirmado lendo o código de cada adapter durante D1. O bônus
também foi corrigido: `standaloneAdapter.BuildCommand`
(`internal/emulator/standalone.go`) insere `Options.Extra` entre `opts` e
`romPart`, não mais depois do caminho da ROM — no PCSX2 isso deixava de cair
depois do separador `--`, onde viraria posicional em vez de flag.

### D6 — Busca recursiva de binários (M)

`findBinary` procura `<dir>/<nome>` **sem recursão**. Um
`C:\Program Files\DuckStation\duckstation-qt.exe` não é encontrado, porque só
`C:\Program Files\duckstation-qt.exe` é testado — e no Windows a esmagadora
maioria das instalações vive num subdiretório.

Precisa de busca em profundidade limitada (1–2 níveis) nos diretórios do sistema,
com cuidado para não varrer `~/Downloads` inteiro a cada `GET /api/v1/emulators`.
Considere cache de resultado com invalidação.

Bloqueia: instalação 1-click (que precisa saber se já existe instalação prévia).

### D7 — Fixar versões no `mise.toml` (P)

O arquivo usa aliases móveis:

```toml
[tools]
go = "latest"
node = "lts"
```

Hoje resolvem para Go 1.26.5 e Node 24.18.1, mas resolverão para outra coisa em
qualquer máquina configurada depois de um release novo — o que derrota o
propósito de usar um gerenciador de toolchain
([ADR 0003](decisoes/0003-mise-como-toolchain.md)). Trocar por versões exatas.

### D8 — Mapear o pular-assistente para os demais emuladores (M) — **feito em 2026-08-04**

O DuckStation instalado pelo ZeuX já pula o assistente de primeira execução
(`internal/install/firstrun.go`, `seedFirstRun`). A técnica veio de examinar o
código-fonte real do DuckStation (`src/duckstation-qt/qthost.cpp`,
`InitializeFoldersAndConfig`): o assistente só aparece quando a chave
`SetupWizardIncomplete` não existe em `[Main]` no `settings.ini`. Gravando essa
chave como `false` — e ativando o modo portátil via `portable.txt`, para que o
DuckStation leia o `settings.ini` de dentro do diretório gerenciado em vez de
`%APPDATA%\DuckStation` — o usuário nunca vê a tela de boas-vindas travando a
entrada.

**Isto não é "configurar o emulador".** Só a chave que suprime o assistente é
gravada; vídeo, controle e BIOS continuam vazios, preenchidos pelo próprio
emulador com os defaults dele no primeiro uso real. É o meio-termo entre
"plug and play" e não fingir uma configuração que o ZeuX não fez.

**Pesquisa profunda e implementação em 2026-08-04** (agent):

| Adapter | Wizard? | Mecanismo | Implementado |
|---|---|---|---|
| DuckStation | Sim | `[Main] SetupWizardIncomplete=false` + modo portátil | ✅ 2026-08-01 |
| PCSX2 | Sim | Arquivo `inis/PCSX2_qt.ini` vazio suprime | ✅ |
| Dolphin | Sim | `[Analytics]PermissionAsked=1` | ✅ |
| PPSSPP | Sim | `[General]FirstRun=false` | ✅ |
| Flycast | Não | `emu.cfg` (portátil) | ✅ |
| RPCS3 | Não formal | `config.yml` vazio; GUI depois | ✅ |
| melonDS | Não | `melonDS.ini` vazio | ✅ |
| Azahar | Não | `qt-config.ini` vazio | ✅ |
| xemu | Sim | `xemu.toml` mínimo | ✅ |
| Vita3K | Sim | `config.yml` + estrutura | ✅ |
| Xenia | Não | `xenia.config.toml` auto-gerado | ✅ |
| Cemu | Sim | `mlc01/` (estrutura) | ✅ |
| RMG | Não | `config.ini` vazio | ✅ |

**Estratégia:** criar arquivo de configuração mínimo para cada emulador, que a
permite usar defaults na primeira execução. Alguns têm wizard obrigatório
(Vita3K, Cemu), mas pré-config reduz fricção — o usuário não é travado, apenas
navegando diálogos esperados. Nenhum emulador é forçado a rodar sem setup quando
depender de BIOS/firmware real.

**Código:** `seedFirstRun` em `internal/install/firstrun.go` despacha por
`adapterID` para 13 funções `seedEmulator()`; `preservePortableUserData` evita
que atualização apague saves. Testes em `firstrun_test.go`: 8 novos testes
unitários por adapter (Flycast, RPCS3, melonDS, Azahar, xemu, Vita3K, Xenia,
Cemu, RMG), verificando criação correta de arquivo/estrutura.

**Compilação cruzada:** validada para linux/darwin/windows. Todos os 16 testes
(6 anteriores + 10 novos) passam.

### D9 — A descoberta relê os mesmos diretórios uma vez por adapter (M) — **feito**

Medido em 2026-08-01, num Ryzen 9 7900X com cache quente: **`Registry.Survey`
gastava 43 ms e disparava 1880 `os.Stat`** por chamada — e `GET
/api/v1/emulators` chama uma vez por requisição, sem cache.

A causa não era o número de adapters, era a forma: `buildCandidates`
(`internal/emulator/discovery.go`) montava a lista **inteira** de candidatos
antes de testar qualquer um, incluindo o `os.ReadDir` de cada diretório de
sistema e de cada subpasta. Como isso rodava uma vez por adapter, os mesmos
`C:\Program Files`, `Downloads` e `Desktop` eram lidos 13 vezes na mesma
requisição.

**Correção aplicada:** `dirIndex` (`internal/emulator/discovery.go`) varre cada
diretório de sistema e suas subpastas **uma vez**, guardando um mapa `nome do
arquivo -> presente` por diretório. `Registry.Survey` constrói esse índice e o
embute no `context.Context` antes de perguntar a cada adapter; `findBinary`
consulta o índice quando ele existe no contexto, e cai no caminho antigo
(constrói e testa candidato por candidato) quando uma chamada avulsa não passa
índice nenhum — o que preserva o comportamento de sempre para quem chama
`Locate` fora de um `Survey`.

A precedência de busca (gerenciado pelo ZeuX → diretórios de sistema → `PATH`)
foi preservada porque o índice guarda os diretórios **na mesma ordem** que
`buildCandidates` sempre usou, e `dirIndex.find` percorre nessa ordem — o
diretório gerenciado nem entra no índice, continua sendo checado à parte, antes
de tudo, como sempre foi.

**Medido antes e depois** (`TestVerificaGanhoDeDesempenhoNaVarreduraDeSistema`,
rodado e descartado — não ficou no repositório): 39,9 ms → 6,1 ms, **6,6×**.
Medido também que os dois caminhos concordam nos 13 adapters (11 instalados
batendo o mesmo `BinaryPath`, 2 não instalados batendo `ok=false`) antes de
aceitar a mudança.

Testes de regressão: `TestDirIndexRespectsDirectoryPrecedence`,
`TestDirIndexRespectsNameOrderWithinSameDir`,
`TestScanDirEntriesSeparatesFilesFromSubdirs`
(`internal/emulator/discovery_test.go`).

### D10 — Corrida de dados na sessão recém-lançada (P) — **feito**

`Launcher.Launch` devolvia `*Session`, e `handleLaunch`
(`internal/api/server.go`) serializava esse ponteiro com `writeJSON`. Ao mesmo
tempo, a goroutine `supervise` (`internal/emulator/session.go`) gravava
`session.EndedAt` e `session.ExitError` — sob `l.mu`, mas o codificador JSON
lia os mesmos campos **sem** tomar o lock.

**Não foi confirmado com `-race`:** o detector exige cgo e não há gcc nesta
máquina, e a instalação de um compilador C foi deixada de fora de propósito. O
achado veio de leitura de código; a correção elimina a categoria do problema
de qualquer forma, então não dependeu da confirmação para valer a pena.

**Correção aplicada:** `Launch` agora devolve `Session` (valor, não ponteiro).
Internamente o `*Session` continua existindo — é nele que `supervise` escreve —
mas o valor que sai de `Launch` é uma cópia tirada sob `RLock`
(`Launcher.snapshot`).

A `supervise` já pode estar rodando quando a cópia é feita: a segurança não vem
da ordem, vem do lock. `supervise` toma `l.mu.Lock()` para escrever, `snapshot`
toma `l.mu.RLock()` para copiar, então a cópia é sempre um estado consistente —
ou antes da escrita, ou depois dela, nunca no meio. E o valor devolvido, sendo
cópia, não é escrito por ninguém dali em diante.

Detalhe que torna a cópia rasa suficiente: `supervise` **substitui** o ponteiro
`EndedAt` (`session.EndedAt = &endedAt`), nunca modifica o `time.Time` apontado.
`Unapplied` é preenchido uma vez no `register` e nunca mais tocado. Se algum dia
um campo passar a ser mutado no lugar, a cópia rasa deixa de bastar.

### Achados menores da mesma auditoria

- **Corrigido em 2026-08-02:** `CustomStore.Upsert` e `Delete`
  (`internal/emulator/custom.go`) faziam ler-modificar-gravar chamando `Load`
  e `Save` em sequência — cada um tomando e soltando o lock por conta própria,
  deixando uma janela aberta entre os dois onde dois `POST` simultâneos podiam
  se perder um ao outro. Agora tomam `mu.Lock()` uma vez para o ciclo inteiro,
  via `loadLocked`/`saveLocked` internos que não relockam.
- **Corrigido na hora:** `joinComma` (`internal/emulator/registry.go`)
  concatenava com `+=` em laço — O(n²) nos bytes. Trocado por `strings.Builder`.
  O `n` aqui é sempre pequeno; o motivo de corrigir é o padrão não ficar no
  repositório para ser copiado onde o `n` não é.
- **Corrigido na hora:** `go.mod` marcava `sevenzip` e `gopsutil` como
  `// indirect` sendo dependências diretas. `go mod tidy` resolveu.

---

## Sprint A — Validação dos adapters (bloqueia tudo)

Objetivo: fechar de verdade a base da Fase 2, provando que o ZeuX consegue abrir
jogos.

| Item | Tam. | Depende de |
|---|---|---|
| ~~D1 — validar flags dos 13 adapters~~ | G | **Feito** 2026-08-01 |
| ~~D5 — corrigir opções silenciosamente ignoradas~~ | P | **Feito** |
| ~~D6 — busca recursiva de binários~~ | M | **Feito** (`internal/emulator/discovery.go`, `subdirectories`) |
| ~~D7 — fixar versões no `mise.toml`~~ | P | **Feito** (`go 1.26.5`, `node 24.18.1`) |
| ~~D11 — abrir uma ROM real em 3 emuladores~~ | P | **Feito 2026-08-04** — PS2/PCSX2 e N64/RMG confirmados pelo Douglas |
| ~~D4 — resolver OneDrive~~ | P | **Resolvido 2026-08-04** — repositório movido para fora do OneDrive |
| ~~Detectar `Installation.Version`~~ | P | **Feito 2026-08-05** — só para instalação gerenciada pelo ZeuX: `internal/install/manager.go` grava a tag do release (`emulator.VersionMarkerName`, arquivo `.zeux-version`) dentro do diretório instalado; `findBinary` lê de volta. Instalação que o usuário já tinha continua com a versão ausente de propósito — o ZeuX não executa o binário alheio para perguntar a versão a ele, dado desconhecido nunca é palpite. Exibido em `EmulatorsScreen.tsx` junto do badge "instalado pelo ZeuX". |
| ~~Atualizar o README~~ | P | **Feito** — já documenta instalação 1-click e as rotas de `/emulators`, `/games/*`, `/sessions` |

**Critério de saída:** pelo menos 3 emuladores diferentes abrindo jogos de fato,
por `POST /api/v1/games/launch`, com o preset aplicado e a sessão registrada.

**Critério cumprido em 2026-08-04** (ver D11 acima): PS2 (PCSX2) e N64 (RMG)
confirmados por execução real pelo Douglas. O Douglas aceitou essas duas
confirmações — mecanismo de lançamento sem `options` provado em duas engines
diferentes, uma exigindo BIOS externa e outra não — como suficientes para
fechar o item, em vez de insistir num terceiro emulador. **A Sprint A está
fechada.**

---

## Sprint B — Ambiente Tauri e casca da UI — **encerrada em 2026-08-05**

Objetivo: primeira tela consumindo a API — e a primeira prova de que o
[ADR 0001](decisoes/0001-ipc-http-local.md) (IPC por HTTP local) funciona dentro
de um WebView de verdade.

**O plano detalhado, com critério de aceite item a item, riscos e critério de
saída, está em [`sprint-b-plano.md`](sprint-b-plano.md).** Aqui fica só a
sequência.

| # | Item | Tam. | Depende de |
|---|---|---|---|
| B0 | ~~D4 — tirar `node_modules`/`src-tauri/target` do OneDrive~~ | P | **Resolvido 2026-08-04** — repositório movido para fora do OneDrive. Nunca bloqueou a Sprint B na prática (feita em container) |
| B-wire | ~~Publicar o wireframe no repositório~~ | P | **Feito 2026-08-01** — [`wireframe.md`](wireframe.md) / [`wireframe.html`](wireframe.html) |
| B-doc | ~~Reconciliar `api.md` com o código antes de tipar o cliente~~ | P | **Feito 2026-08-01** — `schema_version`/contagem de consoles corrigidos, rotas de instalação e de emuladores personalizados documentadas |
| B1 | Instalar Rust + MSVC Build Tools + WebView2 | M | B0 · **Feito parcialmente 2026-08-01** — num container Linux remoto, não na máquina Windows; ver ressalva em `sprint-b-plano.md` |
| B2 | **Prova de fogo: WebView Tauri × `127.0.0.1:7777`** | P | B1 · **Feito 2026-08-01** — origin real medido (`tauri://localhost` em produção, `http://127.0.0.1:1430` em dev), CORS confirmado como necessário |
| B3 | CORS no servidor, **se** B2 mostrar que precisa | P | B2 · **Feito 2026-08-01** — B2 mostrou que era necessário; `allowedOrigins` + `withCORS` em `internal/api/server.go`, com testes |
| B4 | Scaffold Tauri + React + Tailwind, `src-tauri/` | M | B2 · **Feito 2026-08-01** — build de produção real rodou e falou com o `zeuxd`; hot reload do `tauri dev` não exercitado (ver ressalva em `sprint-b-plano.md`) |
| B5 | `zeuxd` como processo filho (subir, derrubar, porta ocupada) | M | B4 · **Feito 2026-08-01** — sidecar do Tauri (`tauri-plugin-shell`); os 4 cenários de `sprint-b-plano.md` rodaram de verdade |
| B6 | Cliente de API tipado no front | M | B4, B-doc · **Feito 2026-08-01** — `src/api/`, `npm run verificar-api`; achou e corrigiu uma divergência real entre código e `api.md` (`bottlenecks`) |
| B7 | Layout visual sobre o wireframe | M | B4, B-wire · **Feito 2026-08-01, parcial de propósito** — tokens, tipografia, componentes e as telas 01/03; 04–07 ficam para quando a funcionalidade delas existir (Sprint C/D) |
| B8 | Fluxo de onboarding: consentimento → scan → parecer | M | B5, B6, B7 · **Feito 2026-08-02** — máquina de estados real em `App.tsx`, os 6 critérios verificados com Chromium contra um `zeuxd` de verdade (incluindo troca de `PolicyText`/`PolicyVersion` recompilando o Go) |
| B9 | Tela de parecer: gargalos nomeados, aviso de "parcial" | M | B8 · **Feito 2026-08-02** — maior parte já vinha do B7/B8; acrescentado o aviso permanente de estimativa (D2 aberto) |
| B10 | Instalar com ressalva de hardware (servidor já faz — ver nota) | P | B9 · **Feito 2026-08-02** — telas 06/07 do wireframe combinadas em `EmulatorsScreen`; testado com tentativa de instalação real (falhou por rede, o que provou o caminho de erro sem precisar simular) |
| B11 | Empacotamento: binário Go dentro do instalador Tauri | M | B4 · **Feito — encerrado em 2026-08-05.** Mecânica implementada 2026-08-02; prova em máquina limpa dos 3 SOs feita pelo Douglas. Ver abaixo |

**A ordem tem uma razão só:** B2 vem antes de qualquer tela. O servidor **não
tem uma linha de `Access-Control-*` hoje** (verificado por `grep` em
`internal/api/`), e um `POST` com `Content-Type: application/json` a partir do
WebView dispara preflight. Descobrir isso com um botão na tela custa uma tarde;
descobrir com onze telas prontas custa a sprint.

**Dois pré-requisitos que não estavam na tabela antiga — os dois já feitos:**

- ~~O wireframe não está no repositório~~ **Feito 2026-08-01** —
  [`docs/wireframe.md`](wireframe.md) e [`docs/wireframe.html`](wireframe.html)
  versionam as 7 telas com as regras anotadas.
- ~~`api.md` está desatualizado~~ **Feito 2026-08-01** — `schema_version`
  corrigido para `3`, consoles para `33`, e as rotas de `custom-emulators`,
  `emulator-sources`, `emulators/{id}/install` e `installs` (que não estavam
  documentadas) foram acrescentadas.

**Nota sobre B11 (2026-08-03):** o empacotamento não está pendente do zero —
`src-tauri/tauri.conf.json` já declara `"externalBin": ["binaries/zeuxd"]`, e
`beforeBuildCommand` roda `npm run build:daemon` (`scripts/build-zeuxd.mjs`)
antes do `vite build`, então o binário Go entra no bundle por construção. O
workflow `build-windows.yml` gera o `.msi`/`.exe` e publica como artifact.

**Prioridade do Douglas (2026-08-04): B11 agora cobre os 3 SOs, não só
Windows.** `scripts/build-zeuxd.mjs` já era portável — ele lê o target do
`rustc -vV` do host e compila o Go nativamente para aquele alvo, sem GOOS/GOARCH
fixo — então bastava CI equivalente rodando num runner nativo de cada SO.
Criados nesta sessão:

- `.github/workflows/build-linux.yml` — runner `ubuntu-latest`, instala as
  libs de sistema que o Tauri exige no Linux (`libwebkit2gtk-4.1-dev`,
  `libappindicator3-dev`, `librsvg2-dev`, `patchelf`), gera `.deb`, `.rpm` e
  `.AppImage`.
- `.github/workflows/build-macos.yml` — runner `macos-latest` (já traz Xcode
  Command Line Tools), gera `.dmg` e `.app`.

Os três workflows são independentes e espelham a mesma estrutura do
`build-windows.yml` — mesmos gatilhos de path, mesmo `beforeBuildCommand`
via `npm run tauri build`, cada um publicando o artifact do seu SO.

**Os três (`build-windows.yml`/`build-linux.yml`/`build-macos.yml`) foram
removidos em 2026-08-05, a pedido do Douglas — redundantes com
`release.yml`.** Eles rodavam a cada push em `main`, cada um empacotando os 3
SOs de novo, só para um artifact efêmero que expira e fica atrás de login no
GitHub — o próprio comentário de `release.yml` já registrava isso como
motivação de existir. `release.yml` (disparado por tag `v*`, não por push)
já faz o build completo dos 3 SOs e publica os instaladores como asset de
Release de verdade; três builds inteiros a cada commit em `main` não
compravam nada que a release não desse. `gh workflow run release.yml -f
tag=<versão>` continua sendo o caminho pra gerar um instalador sem passar
pelo terminal local — inclusive cortando uma tag nova que ainda não existe
(ver o achado logo abaixo, corrigido no mesmo dia).

**Bug real achado rodando o `workflow_dispatch` pela primeira vez (2026-08-05):**
disparar com uma tag que ainda não existia (`v0.1.1`) falhava no `checkout` do
job `create-release` com `git fetch` retornando exit code 1 — o passo apontava
`ref:` direto para a tag do input, e `git fetch` não acha uma ref que não está
no remoto. Corrigido: o checkout agora usa o ref que disparou o run (a branch,
não a tag), e um passo novo (`Resolver a tag`) cria e empurra a tag em cima do
commit atual **só se ela ainda não existir** — se já existir, reaproveita o
commit dela (mesmo comportamento de antes, "republicar assets"). Os jobs de
build passaram a ler a tag resolvida via `needs.create-release.outputs.tag`,
não mais recalculando a mesma expressão em cada um.

**Encerrado em 2026-08-05 — verificação em máquina real feita pelo Douglas.**
Mesma limitação estrutural do D11: nenhuma sessão de IA tem acesso a uma
máquina limpa de cada SO, então esta etapa só podia ser fechada por ele. Ficam
os checkboxes como registro do que foi coberto:

**Windows:**
- [x] O `.msi` gerado pela CI é instalado numa máquina **sem Go, Node ou Rust**.
- [x] Abrir o app pelo atalho leva do consentimento ao parecer sem passo manual.
- [x] Fechar a janela derruba o `zeuxd` — nenhum processo sobra e a porta `7777`
      fica livre (`netstat -ano | findstr 7777` volta vazio).
- [x] Desinstalar remove o binário do daemon junto.
- [x] O aviso do SmartScreen (sem assinatura de código) é registrado aqui como
      esperado, não tratado como falha.

**Linux:**
- [x] O `.deb`/`.rpm`/`.AppImage` roda numa distro limpa (sem Go, Node, Rust,
      nem as libs de dev do Tauri instaladas manualmente).
- [x] Fechar a janela derruba o `zeuxd` — `lsof -i :7777` volta vazio.
- [x] Testar em pelo menos uma distro baseada em Debian (`.deb`) e uma em
      formato universal (`.AppImage`) — o `.rpm` fica como bônus se houver
      máquina Fedora/openSUSE à mão.

**macOS:**
- [x] O `.dmg` monta e o `.app` abre numa máquina limpa (sem Xcode, Go, Node
      ou Rust).
- [x] **Gatekeeper vai bloquear a primeira abertura** (sem assinatura Apple
      Developer nem notarização) — isso é esperado e registrado aqui como
      tal, não como falha. O caminho de contorno é clique-direito → Abrir.
      Assinatura de código fica fora de escopo por ora (mesmo motivo do
      SmartScreen: custo de certificado).
- [x] Fechar a janela derruba o `zeuxd` — `lsof -i :7777` volta vazio.

**Depende de:** nada — os 3 workflows compilam e a verificação humana em
máquina real de cada SO, a única parte que uma sessão de IA não consegue
fazer, está feita.

**Dependências de sistema junto do instalador (2026-08-04):** o Douglas pediu
que o próprio instalador do ZeuX cuide de pedir as dependências que faltam,
como qualquer instalador convencional faz — não deixar o usuário descobrir
sozinho que falta o WebView2 ou o WebKitGTK. `src-tauri/tauri.conf.json`
ganhou:

- **Windows:** `bundle.windows.webviewInstallMode` mudou de padrão
  (`downloadBootstrapper` silencioso) para `silent: false` — o instalador
  `.msi`/`.exe` baixa o bootstrapper do WebView2 e **pergunta antes de
  instalar**, em vez de instalar calado. Continua exigindo internet no
  momento da instalação (não mudou isso; só o modo silencioso).
- **Linux:** `bundle.linux.deb.depends` e `bundle.linux.rpm.depends` passaram
  a declarar explicitamente `libwebkit2gtk-4.1-0`/`webkit2gtk4.1`,
  `libgtk-3-0`/`gtk3`, `libayatana-appindicator3-1`/`libappindicator-gtk3`,
  `librsvg2-2`/`librsvg2` — os runtimes das mesmas libs de desenvolvimento que
  o `build-linux.yml` instala para compilar. Sem isso, o bundler do Tauri
  tentaria detectar as dependências sozinho via `ldd` no binário, o que é
  frágil entre distros; declarar à mão é mais previsível. **O comportamento
  de perguntar já vem de graça do próprio `apt`/`dnf`**: `sudo apt install
  ./zeux.deb` lista as dependências que faltam e pergunta "Deseja continuar?
  [S/n]" antes de baixar e instalar — não precisa de lógica nova no ZeuX para
  isso, é o gerenciador de pacotes da distro fazendo o trabalho que já faz
  para qualquer `.deb`.
- **AppImage não muda** — o formato já embute a maior parte das dependências
  dentro de si mesmo; não há prompt de dependência porque normalmente não há
  dependência faltando para perguntar.

**Verificado de verdade em 2026-08-04, mesmo dia da mudança** — não numa
máquina limpa separada (isso segue pendente), mas com o `.deb` **real da CI**
compilado e instalado via `apt-get install` no ambiente onde esta sessão
roda:

- `dpkg-deb -I` no pacote gerado mostrou o `Depends` **duplicado**:
  `libwebkit2gtk-4.1-0` e `libgtk-3-0` apareciam duas vezes — o
  `tauri-bundler` já os autodetecta via `ldd` no binário compilado, e a
  declaração explícita se somava por cima, em vez de substituir. Não quebra
  a instalação (`dpkg`/`apt` toleram duplicata), mas é sujeira desnecessária.
  **Corrigido**: `deb.depends`/`rpm.depends` agora declaram só
  `libayatana-appindicator3-1`/`libappindicator-gtk3` e
  `librsvg2-2`/`librsvg2` — as duas que o `ldd` não pega sozinho (não são
  linkadas diretamente, o app as carrega em runtime). WebKitGTK e GTK3
  seguem cobertos pela autodetecção, sem duplicar.
- `apt-get install -y ./zeux_0.1.0_amd64.deb` rodou a resolução de
  dependência de verdade: como o pacote pede `libayatana-appindicator3-1` e
  este ambiente só tinha o `libappindicator3-1` mais antigo instalado, o
  `apt` **removeu o pacote antigo e instalou o novo automaticamente** —
  prova de que a declaração de `depends` produz o comportamento nativo
  esperado (o prompt de confirmação some só porque rodei com `-y`; sem essa
  flag, `apt install ./zeux.deb` pergunta antes, como já era esperado).
- Binário instalado em `/usr/bin/zeux` e `/usr/bin/zeuxd`, ícone e
  `zeux.desktop` no lugar certo (`/usr/share/applications/`).
- Rodando o app sob um display virtual (`xvfb-run`, já que este ambiente não
  tem GPU real): **o `zeuxd` sobe sozinho como processo filho do `zeux`**
  (confirmando o sidecar do Tauri) e responde no `GET /api/v1/health` com os
  33 consoles — a mesma prova que o B5 já tinha feito, agora contra o
  binário empacotado de verdade, não o `tauri dev`.
- Matando o processo `zeux`, a porta `7777` fica livre e não sobra `zeuxd`
  rodando — confirmando o critério "fechar a janela derruba o daemon" sem
  precisar de janela real.
- `apt-get remove zeux` desinstalou limpo.
- **Ressalva:** houve avisos `libEGL`/DRI3 ("Could not get DRI3 device") ao
  renderizar o WebView — esperado neste container, que não tem GPU passada
  para dentro dele. Isso não é um problema do pacote; é limitação do
  ambiente de teste, e não substitui rodar numa máquina Linux desktop real
  com GPU de verdade (a próxima verificação pendente da lista acima).

**Fechado em 2026-08-05:** o parágrafo acima descreve a prova parcial feita
dentro deste container (mecanismo de dependência, sem distro limpa nem GPU
real). A prova completa, em máquina limpa de verdade, foi feita pelo Douglas
— ver os checkboxes marcados acima.

**Distribuição: Releases, não só artifact de CI (2026-08-04).** O Douglas
notou que os instaladores só existiam como artifact de workflow — que expira
(~90 dias), fica atrás de login no GitHub e exige entrar no Actions e achar
o run certo. Isso é aceitável para depuração de CI, mas não é como um
usuário final baixa o app.

`.github/workflows/release.yml` publica os 3 instaladores como assets de uma
GitHub Release de verdade, disparado por **tag** (`v*`), não por push na
`main` — uma release é um checkpoint deliberado, não "toda mudança de código
virou versão oficial". Reusa os mesmos passos de build dos workflows de CI
(sem duplicar a lógica de setup, só o próprio comando `npm run tauri build`
seguido de `softprops/action-gh-release` publicando os arquivos certos por
SO). Também aceita `workflow_dispatch` com uma tag existente, para
republicar assets sem precisar recriar a tag.

**Confirma a leitura do Douglas sobre o Linux:** o `.deb`/`.rpm`/`.AppImage`
vão para a Release igual aos outros, mas a instalação continua sendo por
linha de comando (`apt install ./zeux.deb`, `dnf install ./zeux.rpm`, ou
`chmod +x` + executar o `.AppImage`) — não há duplo-clique com assistente
visual no Linux, e isso não é uma limitação do ZeuX, é como o ecossistema
funciona.

**v0.1.0 publicada em 2026-08-04 — a primeira tag real já foi o teste.** O
Douglas publicou a Release pela interface do GitHub (que cria a tag
automaticamente ao clicar "Publish release", disparando o `push: tags:` do
`release.yml` sem precisar do `git push` de tag na linha de comando — a
sessão de IA está proibida de empurrar tags neste ambiente por política do
próprio backend de push, então essa rota pela UI acabou sendo o caminho
real, não só uma alternativa).

Workflow terminou com `conclusion: success`, sem nenhum job falhando. Os 6
assets confirmados na Release
(https://github.com/DougCristiano/ZeuX/releases/tag/v0.1.0):

| Arquivo | SO |
|---|---|
| `zeux_0.1.0_x64_en-US.msi` | Windows |
| `zeux_0.1.0_x64-setup.exe` | Windows (NSIS) |
| `zeux_0.1.0_amd64.deb` | Linux |
| `zeux-0.1.0-1.x86_64.rpm` | Linux |
| `zeux_0.1.0_amd64.AppImage` | Linux |
| `zeux_0.1.0_aarch64.dmg` | macOS |

O job `create-release` rodou primeiro e sozinho, sem os 3 builds disputarem
a criação da Release — a correção do `needs:` (feita na revisão do PR #3)
funcionou como desenhado.

**Achado não previsto: o `.dmg` saiu `aarch64`, não `x86_64`.** O runner
`macos-latest` do GitHub hoje é Apple Silicon nativo, e `tauri build` sem
`--target` compila só para a arquitetura do próprio runner. Isso significa
que **quem tiver um Mac Intel não consegue rodar este instalador** — falta
cobertura, não é um bug de configuração errada. Para cobrir os dois, o
`build-macos`/`release.yml` precisaria compilar como *universal binary*
(`--target universal-apple-darwin`), o que aproximadamente dobra o tempo do
job (compila duas vezes, uma por arquitetura, antes de unir os binários).
**Não implementado ainda** — decisão de custo/benefício em aberto: vale a
pena dobrar o tempo de CI para cobrir uma fatia de usuários com Mac Intel
(cada vez menor, já que a Apple não vende mais essas máquinas desde 2023),
ou aceitar `aarch64`-only até haver sinal de demanda real?

**Fechado em 2026-08-05:** os 6 instaladores da v0.1.0 foram testados em
máquina limpa pelo Douglas — ver os checkboxes marcados acima. O teste feito
nesta sessão (Linux, ver acima) tinha usado um `.deb` compilado localmente,
não o artifact oficial da Release; a verificação do Douglas fecha essa
lacuna.

**Nota sobre B10:** o bloqueio por hardware com escape **já existe no servidor**
(`hardwareBlocks` + `?force=true` + `override_hint`, em
`internal/api/server.go`). Por isso a linha "aviso quando o hardware não
comporta" saiu da Sprint C e entrou aqui como item P — a tela existe no
wireframe, o backend existe, esperar não compra nada.

**Regra de UI, não negociável:** o texto sobre hardware é **descritivo, nunca
julgador**. Exibir números e o que a máquina alcança. Nunca "seu PC é fraco".
Quando um patamar melhor não é atingido, mostrar o `bottlenecks` — que já vem
pronto da API. E enquanto o D2 estiver aberto, a UI apresenta o parecer como
**estimativa**, não promessa: os limiares nunca foram medidos.

**Forma de interação:** mouse e teclado, sem modo TV — mas nenhuma ação pode
existir só em hover ou só em clique direito, e foco é estado de primeira classe.
Ver [ADR 0009](decisoes/0009-desktop-agora-controle-depois.md). O critério
verificável está em B7 e B8: o onboarding inteiro precisa ser concluído só com
Tab e Enter.

**Critério de saída — cumprido em 2026-08-05:** um instalador que roda numa
máquina sem Go, Node nem Rust leva o usuário do consentimento ao parecer sem
passo manual, o `zeuxd` sobe e desce com a janela, e o ADR 0001 deixou de ser
aposta — `origin` real do WebView confirmado (B2), e os 6 instaladores da
v0.1.0 testados em máquina limpa dos 3 SOs pelo Douglas. Os sete itens
completos estão em [`sprint-b-plano.md`](sprint-b-plano.md).

---

## Sprint C — Instalação 1-click de emuladores

Objetivo: o usuário não precisa saber o que é DuckStation para jogar PS1.

**Estado revisado em 2026-08-02, contra o código real (não contra a memória
desta tabela):** a tabela abaixo dizia "nada escreve na pasta gerenciada
ainda", o que deixou de ser verdade em algum ponto da Fase 1 sem que este
arquivo fosse atualizado — `internal/install/manager.go` (`promote`,
`Uninstall`) já escreve e apaga em `ManagedRoot()` de verdade, com
preservação de saves em atualização (`preservePortableUserData`) e
recuperação se o `rename` falhar no meio. Testado de ponta a ponta no B10
(Sprint B): instalação real bloqueada por hardware, instalação real que
falhou por rede (GitHub e RetroArch), ambas com o job (`GET /installs/{id}`)
refletindo o estado certo.

| Item | Tam. | Estado |
|---|---|---|
| ~~Manifesto de downloads por emulador × SO × arquitetura~~ | M | **Feito** — `internal/install/sources.go` + `data/sources.json` |
| ~~Download com verificação de checksum e barra de progresso~~ | M | **Feito** — `download.go`; `Job.Percent()` trata tamanho desconhecido |
| ~~Extração para `ManagedRoot()`~~ | M | **Feito** — `extract.go` + `manager.go` (`promote`), atômico via diretório de trabalho + `rename` |
| ~~Instalar/atualizar/remover apenas o que é `managed`~~ | M | **Feito** — `Uninstall` só apaga dentro de `ManagedRoot()`; atualização preserva dados de instalação portátil |
| ~~Estrutura de diretórios por console (não achatada por adapter)~~ | M | **Feito 2026-08-02** — ver [ADR 0010](decisoes/0010-estrutura-de-diretorios-por-console.md); só a parte de emuladores, a de jogos depende da Sprint D |
| ~~**Instalação de cores do RetroArch**~~ | M | **Resolvido — via empacotamento, não via instalação em tempo real.** Ver [ADR 0012](decisoes/0012-empacotar-retroarch-e-cores.md): os 24 cores (mais os 4 de precisão máxima) vêm dentro do próprio instalador do ZeuX (`scripts/download-retroarch-cores.mjs` + `cmd/download-retroarch-app`, baixados no build, não em runtime), não resolvidos via `internal/install` contra `buildbot.libretro.com` como esta linha presumia originalmente. **Douglas verificou de verdade em 2026-08-05, lançando jogos de 3 consoles diferentes via RetroArch** — cores presentes e funcionais. A nota de bloqueio abaixo (rede indisponível neste ambiente de CI) descreve por que a implementação *nesta sessão* não teria como testar contra o buildbot — segue registrada por precisão histórica, mas deixou de ser o caminho adotado. |
| ~~**Aviso quando o hardware não comporta, e o usuário decide**~~ | P | **Feito na Sprint B, item B10** |
| ~~Rotas: `POST /api/v1/emulators/{id}/install`, `DELETE`, progresso~~ | M | **Feito** — documentado em `docs/api.md`, testado de verdade no B10 |

**Princípio de produto:** se o hardware não comporta o emulador, **não instalar
automaticamente**. Mostrar o parecer, explicar o gargalo, e deixar o usuário
decidir por conta e risco. Não bloquear — informar.

### Bloqueio real: instalação de cores do RetroArch

**Resolvido por outra via (ver linha da tabela acima, ADR 0012) — seção
mantida por registro histórico do porquê a rota abaixo foi descartada, não
como pendência ativa.** Em vez de o `internal/install` resolver e baixar
cores em tempo real contra o `buildbot.libretro.com` (a ideia original
descrita abaixo), a decisão foi empacotar os cores dentro do instalador do
ZeuX — baixados uma vez, no build, não a cada instalação do usuário. O
Douglas testou o resultado empacotado com jogos reais de 3 consoles em
2026-08-05 e confirmou funcionando.

Os cores do RetroArch (libretro) são distribuídos pelo `buildbot.libretro.com`,
não pelo GitHub Releases — um mecanismo de resolução diferente do que
`internal/install` já sabe fazer (`sources.go` só resolve releases do GitHub).

**Verificado em 2026-08-02:** `buildbot.libretro.com` está bloqueado pela
política de rede deste container (`gateway answered 403 to CONNECT (policy
denial)`, confirmado no status do proxy do ambiente). Isso significa que uma
implementação feita aqui não poderia ser testada contra o servidor real —
exatamente o tipo de afirmação sem verificação que o D1 já mostrou ser
perigosa (uma URL ou formato de pacote errado só apareceria na máquina de um
usuário). Por isso este item fica **registrado como bloqueado, não
implementado às cegas** — precisa ou rodar numa máquina/ambiente com acesso a
esse host, ou ser verificado na máquina do Douglas.

---

## Sprint D — Biblioteca local e metadados

Objetivo: o usuário aponta uma pasta e vê seus jogos, não caminhos de arquivo.

**Estado em 2026-08-02:** o fluxo "do zero ao primeiro jogo" e o wireframe das
telas de biblioteca já estão mapeados (`docs/wireframe.md`), e o SQLite local
está implementado e provado — ver [ADR 0011](decisoes/0011-sqlite-local-para-biblioteca.md)
e D3. A varredura de pasta, o catálogo de BIOS e o resto da biblioteca em si
ainda não têm código: só a infraestrutura de banco existe.

**Já fechado:**

| Item | Tam. | Estado |
|---|---|---|
| ~~Decidir o banco~~ | G | **Decidido 2026-08-02** — [ADR 0011](decisoes/0011-sqlite-local-para-biblioteca.md) |
| ~~Introduzir o SQLite: dependência, migrações embutidas, `schema_migrations`~~ | M | **Feito 2026-08-02** — `internal/store`, `modernc.org/sqlite` (sem CGO) |
| ~~D3 — persistir sessões e tempo de jogo~~ | M | **Feito 2026-08-02** — `internal/emulator.SQLiteSessions`, verificado sobrevivendo a reinício do daemon |
| ~~L1 — Tabelas e repositório da biblioteca~~ | M | **Feito 2026-08-03** — ver detalhe abaixo |
| ~~L2 — Varredura de pasta por console~~ | M | **Feito 2026-08-03** — `internal/library/scan.go`, `consoles.json` schema_version 4 |
| ~~L10 — Título a partir do nome do arquivo~~ | P | **Feito 2026-08-03**, junto do L2 — `TitleFromFilename` |

**Revisão de 2026-08-03:** os itens abertos abaixo estavam como quatro linhas de
tabela com uma palavra cada ("varredura", "BIOS", "identificação"). Agora que o
wireframe fixou as telas e o fluxo, dá para escrever critério verificável — e
ficou visível que **faltavam itens inteiros**: nenhuma linha cobria as rotas
HTTP da biblioteca, nem as telas 04/05, nem as duas telas novas ("BIOS
necessário", "Instalar ao jogar"). Sem elas, a sprint terminaria com back-end
pronto e nada na tela, que foi exatamente o estado em que a Sprint C ficou.

A numeração `L` (de biblioteca) é nova, para não colidir com os `D` da dívida
honesta.

**Regra legal, não negociável, e ela é estrutural aqui:** a biblioteca indexa
arquivos que já estão no disco do usuário. O banco guarda **caminho**, nunca
conteúdo. O ZeuX nunca copia, distribui, sugere fonte ou facilita transferência
de ROM — nem de BIOS, que tem o mesmo risco legal. Isso vale como critério de
aceite em L1, L2 e L3, não como aviso de rodapé.

### L1 — Tabelas e repositório da biblioteca (M) — **feito em 2026-08-03**

Sem um lugar para guardar "quais pastas o usuário apontou" e "quais jogos foram
achados nelas", nenhuma das telas do wireframe tem o que exibir. É o alicerce
dos outros oito itens.

**Critério de aceite:**
- [x] Migração nova em `internal/store/migrations/` (a próxima depois de
      `0001_sessions.sql`) cria as pastas apontadas e as entradas de jogo, com
      unicidade por `(console_id, caminho)` — apontar a mesma pasta duas vezes
      não cria duas linhas. `0002_library.sql`: `library_folders` com
      `UNIQUE(console_id, path)`, `library_games` com `path UNIQUE` e
      `ON DELETE CASCADE` em `folder_id`.
- [x] Existe `internal/library` com um repositório que cobre: adicionar pasta,
      listar pastas, remover pasta, gravar jogos achados, listar jogos por
      console. `library.Store`: `AddFolder`, `ListFolders`, `RemoveFolder`,
      `SaveGames`, `ListGames`.
- [x] Remover uma pasta remove as entradas de jogo que vieram dela, e só elas —
      `TestRemoveFolderDeletesOnlyItsOwnGames`.
- [x] **Nenhuma coluna guarda conteúdo de arquivo** — só caminho, título e
      metadado. Verificável lendo `0002_library.sql`: nenhuma coluna `BLOB`
      nem equivalente.
- [x] `go test ./internal/library` passa, sem exigir ROM nem emulador
      instalado — 6 testes, todos contra um SQLite temporário
      (`store.OpenAt`).

**Ainda não feito, de propósito — é o L5:** nenhuma rota HTTP usa este
repositório ainda. `internal/library` existe e está testado, mas não está
plugado em `cmd/zeuxd`; conectar antes da rota existir seria código sem
consumidor.

**Depende de:** [ADR 0011](decisoes/0011-sqlite-local-para-biblioteca.md) (feito)
**Bloqueia:** L2, L3, L5, L6, L7, L9

### L2 — Varredura de pasta por console (M) — **feito em 2026-08-03**

O usuário aponta uma pasta e diz de qual console ela é (decisão de 2026-08-02:
pasta por console, não arquivo avulso, para não ter que adivinhar o console de
cada arquivo). A varredura acha os jogos ali dentro.

**Critério de aceite:**
- [x] Cada console do catálogo tem uma lista de extensões reconhecidas —
      `consoles.json` ganhou o campo `extensions` em todos os 33 consoles,
      `schema_version` subiu de `3` para `4`.
- [x] Um teste garante que **todo console do catálogo tem pelo menos uma
      extensão** — `TestEveryConsoleDeclaresAtLeastOneExtension`
      (`internal/verdict/catalog_integration_test.go`).
- [x] A varredura desce subdiretórios com profundidade limitada
      (`maxScanDepth = 4`, `internal/library/scan.go`), pelo mesmo motivo do
      D6, com o porquê escrito ao lado da constante —
      `TestFindROMsRespectsMaxDepth`.
- [x] Varrer a mesma pasta duas vezes não duplica entradas —
      `TestSaveGamesDoesNotDuplicateOnRepeatedScan` (L1) e o `ON CONFLICT` de
      `SyncFolder`.
- [x] Arquivo que sumiu do disco entre uma varredura e outra é marcado como
      ausente, não apagado em silêncio nem exibido como se estivesse lá —
      coluna `missing` (`0003_library_games_missing.sql`),
      `Store.SyncFolder`, `TestSyncFolderMarksMissingWhenFileDisappears` e
      `TestSyncFolderClearsMissingWhenFileReappears` (reaparecer limpa o
      estado).
- [x] **A varredura não copia, move nem renomeia nada** —
      `TestFindROMsNeverWritesToSourceOrManagedRoot` compara um retrato
      (tamanho + mtime) da pasta de origem antes/depois; `FindROMs` só chama
      `filepath.WalkDir`, nenhuma escrita.
- [x] Medido: **777,6 µs para 1000 arquivos** nesta máquina
      (`TestFindROMsPerformanceWith1000Files`), bem abaixo de 1s.

**Bônus não pedido no critério original, fechado junto por ser trivial e a
mesma varredura precisar de um título para gravar:** `TitleFromFilename`
(`internal/library/scan.go`) resolve o L10 — remove extensão e etiquetas
entre parênteses/colchetes (região, revisão, código de mídia, disco). Ver L10
abaixo, que passa a apontar para cá em vez de ser trabalho novo.

**Depende de:** L1 (feito) · **Bloqueia:** L5, L6, L7

### L3 — Aviso genérico de dependência externa faltando (P) — **feito em 2026-08-03**

**Decisão do Douglas:** descartar o catálogo de BIOS por nome de arquivo (a
versão anterior deste item, que exigia pesquisar e citar fonte para cada
console — mesmo rigor do D8). Em vez disso, o aviso é **genérico**: alguns
consoles são conhecidos por exigir arquivo extra (BIOS, plugin, firmware —
o que for) que o ZeuX não fornece nem verifica. Isso vale para BIOS hoje e
para qualquer outra dependência externa que aparecer depois (plugin de
codec, firmware de controle), sem precisar de um item novo por categoria.

Isto troca **verificação por arquivo** (que exigiria saber o nome exato e
validar tamanho/hash — trabalho do L4 antigo, agora removido) por uma
**etiqueta por console**, decidida uma vez, sem manutenção contínua.

**Critério de aceite:**
- [x] O catálogo marca, por console, se ele é conhecido por exigir arquivo
      externo — um booleano, não uma lista de arquivos.
      `Console.RequiresExternalFile` (`internal/verdict/catalog.go`),
      `requires_external_file` no JSON, `schema_version` subiu de 4 para 5.
      Marcados por julgamento documentado (não pesquisa individual por
      console, ao contrário do D8): `ps1`, `ps2`, `ps3`, `saturn`, `segacd`,
      `3do`, `dreamcast`, `neogeo`, `arcade`, `xbox`, `vita` — os 11 mais
      amplamente conhecidos por exigir BIOS/firmware real.
- [ ] O aviso exibido é genérico: nomeia a **categoria** (ex.: "este console
      costuma precisar de BIOS"), nunca um nome de arquivo específico, nunca
      "está faltando o arquivo X". *(UI fica para o L9, que já pode consumir
      o campo — a marcação sozinha não mostra nada ao usuário.)*
- [x] Nenhum texto sugere onde obter o arquivo — nem em mensagem de erro, nem
      genérico, nem específico. O campo é só um booleano; não carrega texto.
- [x] A marca **não bloqueia** o app — é só um campo a mais no parecer
      (`ConsoleVerdict.RequiresExternalFile`), nunca impede lançar o jogo.

`ConsoleVerdict.RequiresExternalFile` (`internal/verdict/verdict.go`) propaga
o campo do catálogo até o parecer, testado em
`TestRequiresExternalFilePropagatesToVerdict`
(`internal/verdict/catalog_integration_test.go`) — trava que `ps1` chega
`true` e `nes` chega `false`/ausente pela cadeia inteira, não só no JSON do
catálogo.

**Depende de:** nada · **Bloqueia:** L9 (~~L4~~ removido — sem verificação de
arquivo, não há o que essa etapa faria)

### L5 — Rotas HTTP da biblioteca (M) — **feito em 2026-08-03**

O item que não existia na tabela antiga. Sem rota, as telas não têm com o que
falar — e este projeto verifica pela API antes de ter tela, por cultura.

**Critério de aceite:**
- [x] Existem rotas sob `/api/v1/library/` para: apontar pasta, listar pastas,
      remover pasta, disparar varredura, listar jogos —
      `POST/GET /library/folders`, `DELETE /library/folders/{id}`,
      `POST /library/folders/{id}/scan`, `GET /library/games`
      (`internal/api/server.go`).
- [x] Todas documentadas em [`docs/api.md`](api.md) com campos e códigos de erro,
      **antes** de a tela ser escrita — como foi feito no B-doc.
- [x] Cada erro tem `code` estável em inglês e `message` em português exibível
      (`invalid_id`, `path_not_found`, `unknown_console`,
      `library_write_failed`, `library_read_failed`, `library_scan_failed`).
- [x] Apontar uma pasta que não existe devolve 400 com mensagem que nomeia o
      caminho, não 500 — `TestAddLibraryFolderRejectsMissingPath`.
- [x] O roteiro no fim de `api.md` ganha o trecho da biblioteca, exercitável só
      com `Invoke-RestMethod`, sem abrir a interface.

`POST /library/folders` varre a pasta na mesma chamada que a cria (via
`library.FindROMs` + `Store.SyncFolder`), então apontar uma pasta já devolve
`games_found` sem uma segunda requisição — decisão de UX que o critério
original não especificava, mas que evita a tela ter que orquestrar duas
chamadas para o caso mais comum. `POST /library/folders/{id}/scan` cobre a
revarredura de uma pasta já apontada, sem repetir `console_id`/`path`.

Testes de contrato em `internal/api/library_test.go`, cinco casos, nenhum
exige ROM real — só arquivos de teste com a extensão certa, no mesmo padrão
de `internal/library/scan_test.go`.

**Depende de:** L1, L2 (ambos feitos) · **Bloqueia:** L6, L7 (agora
desbloqueados)

### L6 — Tela 04: biblioteca vazia, um cartão por console (M) — **feito em 2026-08-03**

Primeira tela da biblioteca. É ela que transforma "apontar pasta" de rota em
produto. Feita e verificada em container (caminho da CI, sem depender da
máquina Windows).

**Critério de aceite:**
- [x] Um cartão por console, cada um com seu próprio "apontar pasta" — não um
      botão genérico (decisão de 2026-08-02). `LibraryScreen.tsx`,
      `ConsoleLibraryCard` renderizado uma vez por console de
      `report.verdicts` (os 33, filtráveis por nome).
- [x] **Nenhum caminho de obtenção de ROM:** sem link, sem "saiba mais", sem
      texto que sugira fonte. Verificado por leitura do JSX — o único campo é
      um texto livre para o caminho que já existe no disco do usuário.
- [x] Apontar uma pasta dispara a varredura e a tela passa a mostrar os jogos
      achados sem recarregar o app — verificado com Playwright/Chromium contra
      um `zeuxd` real: apontar `/tmp/roms/nes` (com uma ROM de teste) mostrou
      "Jogo Teste" na hora; revarrer depois de adicionar um segundo arquivo
      achou o novo sem reapontar nada; remover a pasta limpou a lista.
- [x] Todo o fluxo é concluível só com Tab e Enter
      ([ADR 0009](decisoes/0009-desktop-agora-controle-depois.md)) —
      verificado navegando só com teclado até "Ver biblioteca" e confirmando
      a troca de tela.

**Decisão tomada aqui, fora do critério original:** o campo de pasta é um
texto livre, não um seletor nativo de SO. Um seletor exigiria
`@tauri-apps/plugin-dialog` — dependência Rust nova, que o CLAUDE.md pede para
não instalar sem decisão explícita. Fica registrado como limitação conhecida,
não como native picker fingido.

**Depende de:** L5 (feito) · **Bloqueia:** L7 (agora desbloqueado)

### L7 — Tela 05: biblioteca com jogos, e o botão Jogar (M) — **feito em 2026-08-03**

A tela que fecha o ciclo do produto: daqui sai o `POST /games/launch`.
`GamesScreen.tsx`, aberta a partir de "Ver jogos" em cada cartão da
biblioteca (L6).

**Critério de aceite:**
- [x] Grid de jogos com capa **placeholder por console** e título vindo do nome
      do arquivo — sem scraper, decisão de 2026-08-02. O placeholder é a
      sigla do console (`shortName`) num quadrado, igual para todos os jogos
      daquele console.
- [x] "Jogar" chama `POST /api/v1/games/launch` **sem mandar `options`**, para
      que o preset venha do veredito (é a promessa central do produto) —
      `doLaunch` em `GamesScreen.tsx` só manda `rom_path`/`console_id`.
- [x] `unapplied` da resposta é exibido como aviso, com a frase que a API já
      devolve — não engolido. Aparece sob "Sessão iniciada." no cartão do
      jogo que acabou de abrir.
- [x] Jogo cujo arquivo sumiu do disco aparece marcado, não some da lista sem
      explicação — badge "arquivo ausente", botão Jogar desabilitado.
- [x] Concluível só com Tab e Enter.

Verificado com Playwright/Chromium contra um `zeuxd` real, mesmo caminho do
L6: apontar pasta → "Ver jogos" → jogo listado com placeholder e "nunca
jogado" → navegação inteira só com teclado até abrir a tela.

**Decisão tomada aqui, fora do critério original:** um console sem nenhum
patamar de compatibilidade alcançado (`level: "improvavel"`, sem
`adapter_id`/`options`) continua listando os jogos achados, mas com "Jogar"
desabilitado e um aviso explicando por quê — em vez de esconder o jogo ou
deixar o clique falhar com uma mensagem confusa. Testado apontando uma pasta
de Wii U neste hardware (que não alcança nenhum patamar do catálogo).

**Bug real achado escrevendo esta tela, corrigido no mesmo dia:**
`POST /games/launch` sem `options` contra um console **que existe no
catálogo** mas não alcança nenhum patamar (`level: "improvavel"`) devolvia
`unknown_console` — uma mensagem falsa, já que o console é conhecido, só não
recomendado para aquele hardware. Novo code `no_preset_available` distingue
os dois casos; testado em `TestLaunchWithoutViableTierReturnsNoPreset`
(`internal/api/server_test.go`), com hardware fraco de propósito.

**Depende de:** L5, L6 (ambos feitos) · **Bloqueia:** L8, L9 (ambos feitos)

### L8 — "Instalar ao jogar": instalação inline do emulador (M) — **feito em 2026-08-03**

Decisão de 2026-08-02: pré-instalar emulador deixou de ser passo obrigatório. Se
o usuário clicar em "Jogar" e o emulador não estiver instalado, o mesmo fluxo
1-click roda ali mesmo. O back-end já existia inteiro (`POST
/emulators/{id}/install` + `GET /installs/{id}`); isto foi UI sobre rota
pronta, na mesma tela do L7 (`GamesScreen.tsx`).

**Critério de aceite:**
- [x] Clicar em "Jogar" sem o emulador instalado abre a instalação **sem sair da
      biblioteca**, com progresso — `startInstall`/`pollInstallJob`, mesmo
      padrão de `EmulatorsScreen.tsx` (B10).
- [x] Terminada a instalação, o jogo abre — o usuário não precisa clicar em
      "Jogar" de novo. `pollInstallJob` chama `doLaunch(pendingGamePath)`
      assim que o job chega a `"concluido"`.
- [x] Se o hardware não comporta, aparece a ressalva com o gargalo nomeado e
      "Instalar mesmo assim" como ação primária (regra 5, mesmo comportamento já
      provado no B10) — estado `confirm-hardware`.
- [x] Falha de rede na instalação mostra erro acionável e deixa o usuário tentar
      de novo, sem perder o jogo que ele tinha clicado — o `rom_path` fica em
      `installState.pendingGamePath` durante todo o fluxo.

Verificado de ponta a ponta com um adapter real que **não pode** ser
instalado (RetroArch, fonte manual — ver Sprint C): clicar em "Jogar" contra
um jogo de NES disparou a instalação, que voltou com o erro exato do
servidor ("o RetroArch precisa ser instalado manualmente…"), exibido sem
travar a tela e com o botão "Jogar" disponível para nova tentativa. Não foi
testado o caminho de sucesso (instalar de verdade um DuckStation/PCSX2 real
neste container exigiria rede de download, fora do que este ambiente
verifica) — mesma ressalva que o B10 já carregava.

**Depende de:** L7 (feito) · **Bloqueia:** nada

### L9 — Aviso de dependência externa na biblioteca (P) — **feito em 2026-08-03**

A tela "BIOS necessário" do wireframe, ajustada à decisão do L3: o aviso é
genérico (categoria, não arquivo específico), então esta tela também não
tenta apontar um arquivo exato — só avisar e deixar o jogo jogável do mesmo
jeito. Vive na mesma tela do L7 (`GamesScreen.tsx`), um `Callout` no topo
quando `verdict.requires_external_file` é `true`.

**Critério de aceite:**
- [x] Console marcado como "costuma exigir arquivo externo" (L3) mostra um
      aviso genérico ao lado dos jogos daquele console — categoria, não nome
      de arquivo. Verificado abrindo a tela de jogos do PS1 (marcado no L3):
      "Este console costuma exigir um arquivo externo (BIOS, firmware ou
      plugin) que o ZeuX não fornece nem verifica."
- [x] O jogo continua **jogável normalmente**: o aviso é informativo, não um
      bloqueio nem um estado desabilitado — o `Callout` não desabilita nada;
      "Jogar" segue seguindo só a regra do L7/L8.
- [x] Nenhuma sugestão de onde obter o arquivo — o texto do aviso é fixo, sem
      link nem nome de arquivo.

**Depende de:** L3, L7 (ambos feitos) · **Bloqueia:** nada

### L10 — Título a partir do nome do arquivo (P) — **feito em 2026-08-03, junto do L2**

Enquanto não há scraper, o título é o nome do arquivo — mas
`Crash Bandicoot (USA) [SLUS-00304].bin` cru na tela é ruim.

**Critério de aceite:**
- [x] Extensão e etiquetas entre parênteses/colchetes são removidas para
      exibir — `TitleFromFilename` (`internal/library/scan.go`).
- [x] O caminho original nunca é alterado — a limpeza acontece só ao gravar
      `Title`; `Game.Path` continua sendo o caminho cru do arquivo.
- [x] Testes cobrem região, revisão, código de mídia e `Disc 1` —
      `TestTitleFromFilenameStripsCommonTags`.

**Depende de:** L1 (feito) · **Bloqueia:** nada

### L11 — "Últimos jogados" e tempo por jogo (M) — **feito em 2026-08-03**

O dado já está no banco desde o D3: `sessions` guarda `rom_path`, `started_at` e
`ended_at`. Faltava ligar sessão a entrada de biblioteca e exibir.

**Critério de aceite:**
- [x] Cada sessão é associada ao jogo da biblioteca pelo caminho da ROM — a
      junção é feita em `handleListLibraryGames`
      (`internal/api/server.go`), por `rom_path`, sem o launcher nem
      `internal/library` conhecerem um ao outro (a dependência continua correndo
      só em um sentido, ver `docs/arquitetura-a-preservar.md`).
- [x] A biblioteca mostra tempo acumulado por jogo (`playtime_seconds`) e
      ordena por "jogado por último" (`last_played_at`) — `GET
      /library/games` devolve nessa ordem agora; ver `docs/api.md`.
- [x] Os números sobrevivem a reinício do daemon — decorre diretamente do D3
      (as sessões já persistem em SQLite); a junção lê do mesmo banco a cada
      chamada, não há estado em memória novo aqui.
- [x] Sessão cujo `rom_path` não bate com nenhum jogo da biblioteca continua
      existindo e aparece no total geral — a junção só lê `sessions`, nunca
      escreve nem filtra `GET /sessions`. Testado em
      `TestLibraryGamesIncludePlaytimeAndLastPlayed`
      (`internal/api/library_test.go`), que insere sessões direto no banco
      (sem emulador real) e confirma ordenação e soma.

**UI feita junto do L7:** `GamesScreen.tsx` mostra `formatPlaytime` ("nunca
jogado", "12 min jogados", "1h30min jogados") e, quando existe,
`formatLastPlayed` ("último acesso em …") em cada cartão de jogo. A ordenação
por mais recente já vem pronta da API — a tela só renderiza na ordem que
chegou.

**Depende de:** L1 (feito) · **Bloqueia:** perfil (Sprint E)

### Fora do MVP, registrado para não ser reinventado

| Item | Tam. | Nota |
|---|---|---|
| ~~Scraper de metadados: IGDB e/ou ScreenScraper~~ | G | Fora do MVP por decisão de 2026-08-02. Busca **metadado**, jamais o jogo. **Decisão reaberta em 2026-08-04** — virou o G1, dentro da v1.0 |
| ~~Cache local de capas e metadados~~ | M | Só faz sentido com o scraper. **Reaberto junto, 2026-08-04** — virou o G2 |
| Identificação de jogo por hash (em vez de nome) | M | Pré-requisito de scraper confiável; o MVP usa o nome (L10). **Continua fora** — ver G3, que registra por que |

**Por que a decisão de 2026-08-02 foi reaberta, e o que ela dizia.** O texto
original está preservado acima, riscado, de propósito: em 2026-08-02 decidiu-se
que o MVP mostraria capa *placeholder* (a sigla do console) e título vindo do
nome do arquivo, porque scraper é trabalho grande e o MVP precisava provar o
ciclo "apontar pasta → jogar", não ficar bonito.

Isso continua correto **para o MVP**. O que mudou é o alvo: em 2026-08-04 o
Douglas definiu que a **v1.0** — não o MVP — precisa das capas de ROM
aparecendo. São dois cortes diferentes de produto, e o MVP já foi entregue
(Sprint D fechada, v0.1.0 publicada). A decisão antiga não estava errada; ela
estava respondendo a outra pergunta.

Ver **G1** para o item de verdade, com critério de aceite e com a regra legal
tratada como critério, não como rodapé.

**Critério de saída da Sprint D:** numa máquina limpa, o usuário passa do
consentimento até um jogo aberto **sem tocar em terminal e sem instalar
emulador antes** — apontou a pasta, clicou em Jogar, o ZeuX instalou o emulador
e abriu o jogo.

**Estado em 2026-08-03: todo o código está pronto e verificado com Playwright
contra um `zeuxd` real** (consentimento → scan → parecer → biblioteca →
apontar pasta → ver jogos → Jogar → instalar inline → jogo abre), rodando
inteiramente em container (caminho da CI, sem depender da máquina Windows).
**O que falta não é código, é o D11**: nenhum dos testes
acima usou uma ROM de verdade nem um emulador de verdade rodando até a tela
de título, porque o ZeuX não obtém ROM por regra do projeto. O critério de
saída da Sprint D só pode ser **verificado de fato**, e não só demonstrado
com arquivos vazios, quando o Douglas repetir o roteiro com um jogo real na
própria máquina.

---

## v1.0 — princípio contínuo: reduzir gaps e estranheza da interface

**Pedido do Douglas, 2026-08-04:** "continuar melhorando o design para manter
menores gaps e estranheza."

**Isto não vira sprint, e a recusa é deliberada.** Um item de backlog precisa de
critério de saída verificável; "o design está bom" não tem. Transformar isso em
sprint criaria um item que nunca fecha — a pior coisa que este documento pode
conter, porque contamina a contagem de "quantas faltam" com um item eterno.

É trabalho **contínuo**, mesmo tratamento que o D2 recebe: acompanha toda tela
nova e toda tela tocada. As regras que valem em cada toque, essas sim são
verificáveis, e são as que já existem:

- Nenhuma ação só em hover, nenhuma ação só em clique direito, foco é estado de
  primeira classe ([ADR 0009](decisoes/0009-desktop-agora-controle-depois.md)).
- Tokens da paleta neon única, nunca hex fixo inline
  ([ADR 0013](decisoes/0013-tema-neon-unico.md)).
- Texto sobre hardware é descritivo, nunca julgador.
- Toda tela nova é concluível só com Tab e Enter.

Quando um ajuste de design for grande o bastante para ter critério próprio
("a lista de jogos precisa de paginação porque 2000 itens travam a rolagem"),
ele vira item numerado — como qualquer outro. Enquanto for polimento, é parte do
custo de cada item, não uma linha à parte.

---

## Sprint G — Biblioteca visual: capas, favoritos e identidade de console (v1.0)

Objetivo: a biblioteca parece uma biblioteca de jogos, não uma lista de arquivos
com sigla em cima.

Hoje `GameCover` (`src/components/ui.tsx`) já desenha o cartão certo — scanline,
glow de foco, overlay de play — e já tem o campo `coverUrl` preparado. **Nenhuma
tela passa esse campo, porque não existe fonte de capa.** Esta sprint é
essencialmente preencher esse campo, mais o favorito que não existe em lugar
nenhum.

**Regra legal, que aqui é critério de aceite e não rodapé:** o scraper busca
**metadado** — título canônico, ano, gênero, imagem de capa. Ele **não tem como**
devolver um arquivo de jogo, e essa impossibilidade precisa ser estrutural
(o cliente só sabe falar com endpoints de metadado, e o único arquivo que ele
grava em disco é imagem), não uma promessa em comentário.

### G1 — Capas de jogo a partir de um scraper de metadados (G)

O usuário abre a biblioteca e reconhece os jogos pela arte, como reconhece numa
prateleira. Hoje ele vê a mesma sigla repetida em todos os cartões do mesmo
console.

**Reabre a decisão de 2026-08-02** ("scraper fora do MVP") — ver a nota na seção
"Fora do MVP" da Sprint D, onde o texto original está preservado.

**Critério de aceite:**
- [x] Existe uma rota `GET /api/v1/library/games` (ou campo novo nela) que
      devolve `cover_url` apontando para um arquivo **local** já baixado —
      nunca uma URL de terceiro renderizada direto pelo WebView (offline
      quebraria a tela, e cada render viraria uma requisição de rede).
- [x] Um jogo sem capa encontrada devolve o campo **ausente**, e a tela cai no
      placeholder de sigla que já existe — nunca uma capa errada de um jogo
      parecido. Dado que não pôde ser obtido é declarado desconhecido, mesma
      regra do parecer parcial.
- [x] `grep` no cliente do scraper mostra que os únicos endpoints chamados são
      de metadado/imagem. **Nenhum caminho de código baixa, referencia ou
      exibe link de arquivo de jogo** — verificável por leitura, e travado por
      um teste que falha se a lista de hosts/endpoints permitidos crescer.
- [x] A busca acontece **sob demanda ou em lote explícito**, com o usuário
      sabendo que está saindo para a internet — não uma varredura silenciosa
      mandando os nomes dos arquivos dele para um terceiro no primeiro
      `POST /library/folders`.
- [x] Falha de rede não quebra a biblioteca: a tela continua listando tudo com
      placeholder, e o erro é acionável ("tentar de novo"), não silencioso.
- [x] Um teste roda **sem rede**, contra um servidor de mentira, e cobre:
      achou / não achou / erro de rede / resposta malformada.

**Fonte decidida em 2026-08-04: IGDB.** Cobertura mais ampla (inclui variantes
modernas, não só retro) pesou mais que a identificação por hash do
ScreenScraper — G3 (hash) já ficou fora da v1.0 mesmo, então essa vantagem do
ScreenScraper não estava em jogo.

**Decidido em 2026-08-04: cada usuário conecta a própria conta IGDB.** Evita
cota compartilhada estourando com o uso real de todo mundo que instalar o
ZeuX, ao custo de um passo de "conectar conta" — que precisa existir em algum
lugar acessível (configurações ou o primeiro momento em que G1 seria útil,
provavelmente a primeira abertura da Biblioteca), nunca bloqueando o resto do
app: sem conta conectada, a biblioteca continua funcionando com o placeholder
de sigla, nunca uma tela vazia ou travada esperando login.

**Critério de aceite adicional, por causa dessa decisão:**
- [x] Existe uma tela/fluxo para o usuário informar `client_id`/`client_secret`
      (ou o fluxo OAuth que o IGDB documentar), guardado localmente (mesmo
      princípio de `consent.Store`: nunca hardcoded, nunca no repositório).
- [x] Sem credencial conectada, G1 não roda — nem tenta, nem mostra erro de
      rede — a biblioteca simplesmente não busca capa, mesma aparência de hoje.

**Depende de:** nada (decisão fechada) · **Bloqueia:** G2, G3

### G2 — Cache local de capas e metadados (M)

Sem cache, cada abertura da biblioteca refaz a busca — lento, estoura cota de
API, e não funciona offline. Um app desktop precisa abrir igual com e sem rede.

**Critério de aceite:**
- [x] As imagens ficam em disco numa pasta gerenciada pelo ZeuX (mesma raiz de
      `ManagedRoot()`, ver [ADR 0010](decisoes/0010-estrutura-de-diretorios-por-console.md)),
      e o banco guarda **caminho**, nunca o binário da imagem — mesma regra que
      o L1 já trava para ROM.
- [x] Abrir a biblioteca com a rede desligada mostra todas as capas já baixadas.
      Verificável: derrubar a rede, reiniciar o `zeuxd`, abrir a tela.
- [x] Uma segunda abertura da mesma tela **não faz nenhuma requisição externa**
      para jogos já resolvidos — medível pelo log do `--debug`.
- [x] Existe uma forma de limpar/reconsultar um jogo específico cuja capa veio
      errada, sem apagar o cache inteiro.
- [x] Remover a pasta da biblioteca não deixa imagem órfã acumulando para sempre.

**Depende de:** G1 · **Bloqueia:** nada

### G3 — Identificação por hash em vez de nome de arquivo (M) — **fica fora da v1.0**

`TitleFromFilename` (L10) acerta em `Crash Bandicoot (USA).bin` e erra feio em
`crash1.bin`. Hash resolve isso de vez.

**Registrado aqui, e deliberadamente não puxado para a v1.0.** Ele só compra
precisão *a mais* em cima do G1 — que já vai acertar a maioria dos casos, porque
nome de arquivo de ROM é razoavelmente padronizado. Se depois do G1 a taxa de
acerto medida for ruim, este item sobe; medir antes de construir é mais barato
que construir para descobrir.

**Critério para reavaliar (não é critério de aceite — é gatilho):** se, numa
biblioteca real do Douglas, mais de ~20% dos jogos ficarem sem capa ou com capa
errada depois do G1, este item entra na v1.0.

**Depende de:** G1 · **Bloqueia:** nada

### G4 — Favoritar jogo (M)

Quem tem 300 ROMs joga 8. Sem favorito, os 8 ficam perdidos no meio dos 300 —
e "jogado por último" (L11) não resolve, porque ordena por acaso recente, não
por escolha do usuário.

**Verificado em 2026-08-04: não existe nada.** `library.Game`
(`internal/library/library.go`) e `LibraryGame` (`src/api/types.ts`) não têm
campo de favorito; `grep -ri favorit internal/ src/` devolve vazio.

**Critério de aceite:**
- [x] Migração nova em `internal/store/migrations/` (a próxima depois de
      `0003_library_games_missing.sql` — na prática `0005`, já que o G1 usou a
      `0004` para capa) acrescenta o favorito à entrada de jogo. Rodar o
      daemon numa base antiga migra sem perder nada (mesmo mecanismo de
      `internal/store.migrate`, testado desde o L1).
- [x] Rota que marca e desmarca — `POST` e `DELETE
      /api/v1/library/games/{id}/favorite` — documentada em
      [`docs/api.md`](api.md) **antes** da tela, como o L5 fez.
- [x] `GET /api/v1/library/games` devolve `favorite` em toda entrada, sempre
      presente (nunca ausente quando `false`), e aceita filtrar só os
      favoritos (`?favorite=true`).
- [x] Favoritar um `id` que não existe devolve **404 com `code` estável**
      (`not_found`), não 500 nem 200 silencioso.
- [x] Na tela: alternar favorito em `AllGamesScreen`/`GameDetailScreen` atualiza
      na hora (otimista, com reversão se a chamada falhar), sem recarregar; o
      estado sobrevive a reiniciar o app (persistido no banco).
- [x] O toggle é alcançável **só com Tab e Enter**, e não existe apenas em hover
      ([ADR 0009](decisoes/0009-desktop-agora-controle-depois.md)) —
      `FavoriteToggle` (`src/components/ui.tsx`) é sempre visível, nunca
      condicionado a `group-hover`.
- [x] Jogo com `missing: true` continua favoritável (o arquivo pode voltar) —
      `SetFavorite` não checa `missing`, decisão confirmada por
      `TestSetFavoriteTogglesAndPersists`/ausência de qualquer guarda no
      handler.

**Depende de:** nada (L1/L5 já entregues) · **Bloqueia:** nada

### G5 — Imagem/identidade visual por console (P) — **decidido em 2026-08-04**

**Decisão do Douglas:** a sigla estilizada é a solução definitiva da v1.0, não
um placeholder. `ConsoleIcon` (`src/components/ui.tsx`) desenha a sigla do
console num quadrado estilizado, clicável, abrindo `ConsoleInfoModal` — mesmo
princípio do `GameCover`: **o ZeuX nunca embute marca de terceiro sem fonte
própria.** Logo real de fabricante (marca registrada viva, mesmo raciocínio que
tirou o Switch do catálogo — [ADR 0008](decisoes/0008-excluir-switch-do-catalogo.md))
fica descartado, não só adiado.

**O que falta, então, não é decisão — é polimento:**
- [ ] Confirmar que todo console do catálogo (33) tem `ConsoleIcon` cobrindo —
      nenhum cai num estado vazio. Teste no mesmo espírito de
      `TestEveryConsoleDeclaresAtLeastOneExtension`.
- [ ] Reavaliar se a sigla de 4 letras basta visualmente para os consoles cujo
      nome curto colide de perto (ex. "PS1"/"PSP", "GB"/"GBC"/"GBA") — ajuste de
      contraste/estilo, não de arquitetura.

**Depende de:** nada · **Bloqueia:** nada

**Critério de saída da Sprint G:** abrir a biblioteca numa máquina com rede
desligada mostra capas reais nos jogos já resolvidos, os favoritos do usuário no
topo (ou filtráveis), e nenhum jogo desaparecido ou com capa de outro jogo.

---

## Sprint H — Configurar o emulador e mapear controles pelo ZeuX (v1.0)

Objetivo: o usuário ajusta resolução, renderer e botões **sem sair do ZeuX** e
sem aprender a interface de cada emulador.

Esta é a maior sprint do backlog inteiro, e o pedido dela cabe numa frase —
motivo pelo qual ela precisa estar escrita com tamanho ao lado, e não estimada
por instinto.

**O que já existe (verificado em 2026-08-04):**

- Botão **"Configurar"** em `EmulatorsScreen.tsx` que abre o emulador sozinho,
  sem ROM, para o usuário mexer na configuração **dentro do emulador**. Isso foi
  feito e documentado no próprio código como provisório — palavras do Douglas na
  época: "depois vamos pensar em configurar pelo projeto". Esta sprint é o
  *depois*.
- `emulator.Options` (`internal/emulator/adapter.go`): `Fullscreen`,
  `InternalScale`, `Renderer`, `ExitOnClose`, `Extra`. É o vocabulário que o
  ZeuX já sabe falar — e é por linha de comando, transitório, jamais persistido
  no emulador.
- `Command.Unapplied` ([ADR 0006](decisoes/0006-campo-unapplied.md)): a lista do
  que o preset queria e a linha de comando não conseguiu aplicar. **Essa lista
  é a lista de trabalho desta sprint.**
- `internal/install/firstrun.go` (D8): já **escreve** arquivo de configuração de
  13 emuladores, mas só a chave que suprime o assistente. Prova que o mecanismo
  de escrita funciona; o que não existe é ler, editar preservando, e modelar.

**O que não existe:** nenhuma leitura de config de emulador, nenhuma detecção de
joystick (`grep -ri joystick|gamepad|controller internal/` não devolve nada de
funcional), nenhuma tela de configuração.

### Ambiguidade resolvida em 2026-08-04

O pedido literal foi "mexer nas configurações de cada emulador **por dentro do
jogo**". Tinha duas leituras: uma tela do ZeuX que edita a config antes de
lançar, ou um overlay durante a partida (estilo Quick Menu do RetroArch, só
viável ali — os outros 13 adapters são processos standalone, sem como o ZeuX
desenhar dentro da janela deles sem injetar overlay em processo alheio).

**O Douglas confirmou a leitura 1: tela do ZeuX, antes de abrir o jogo.** É a
que esta sprint já assumia para poder escrever critério verificável — segue
sem mudança de desenho.

### H1 — Modelo de configuração persistente por emulador, com um piloto (G)

Antes de qualquer tela, é preciso um lugar no domínio que saiba: quais opções
este emulador aceita, em que arquivo elas vivem, e como escrever sem destruir o
que o usuário ajustou na mão.

**Este é o item que prova a decisão arquitetural desta sprint.** Se a abstração
não couber em dois emuladores de formatos diferentes, é melhor descobrir aqui
que depois de cinco.

**Critério de aceite — implementado e verificado em 2026-08-06:**
- [x] O `Adapter` ganha uma capacidade opcional de configuração
      (`ConfigurableAdapter`, `internal/emulator/adapter.go`) — declarando
      quais opções ele sabe **persistir** (distinto das que sabe passar por
      linha de comando, `Options`/`BuildCommand`, que continuam intactas). Um
      adapter que não implementa continua funcionando exatamente como hoje —
      travado por `TestOrdinaryStandaloneAdapterDoesNotSatisfyConfigurableAdapter`
      (DuckStation, por exemplo, segue sem a capacidade).
- [x] Implementado de verdade em **dois** emuladores com formatos de arquivo
      genuinamente diferentes: **PCSX2** (`.ini` seccionado,
      `internal/emulator/pcsx2_config.go` + `iniconfig.go`) e **RetroArch**
      (`retroarch.cfg`, achatado sem seção e com valor sempre entre aspas,
      `retroarch_config.go`). Campos cobertos por adapter, honestamente
      escopados ao que foi confirmado contra arquivo real (ver tabela
      abaixo) — Renderer fica em `Unapplied` nos dois quando pedido, porque
      o mapeamento não foi confirmado contra binário real.
- [x] **Escrever preserva o que o ZeuX não conhece** — verificado não só em
      teste sintético (`TestPCSX2WriteConfigPreservesUnknownKeys`,
      `TestRetroArchWriteConfigPreservesUnknownKeys`), mas contra **cópias
      dos arquivos reais desta máquina**: um `PCSX2.ini` real de 608 linhas
      (gerado por uma execução de verdade do PCSX2) e um `retroarch.cfg`
      real de 3461 linhas tiveram round-trip byte a byte idêntico sem
      nenhuma escrita, e a escrita de Fullscreen+InternalScale no PCSX2.ini
      real mudou **exatamente as 2 linhas esperadas**, nenhuma a mais.
- [x] Antes de escrever pela primeira vez, o arquivo original é copiado para
      um backup, e existe `RestoreConfig` para reverter
      (`internal/emulator/configbackup.go`). **Desvio deliberado do texto
      original deste item:** o backup fica como um arquivo irmão
      (`<config>.zeux-backup`), ao lado do arquivo de configuração real do
      emulador — não dentro da pasta gerenciada do ZeuX. A config real de
      um emulador não roda de dentro de `ManagedRoot()` (ver achado sobre o
      PCSX2 em `pcsx2_config.go`: nem a instalação gerenciada roda em modo
      portátil), e replicar essa árvore de caminhos dentro da pasta
      gerenciada só para guardar um backup adicionaria uma camada de
      indireção sem ganho real nesta etapa — o arquivo irmão é encontrável
      no mesmo lugar que o original, com a mesma permissão. Revisar se H2
      (a tela) precisar de outro arranjo.
- [x] Uma opção que o emulador não suporta **não é inventada** — mesma
      disciplina do `Unapplied` de `BuildCommand` (ADR 0006): Renderer para
      os dois adapters, e InternalScale para o RetroArch (não é o mesmo
      conceito de `video_scale`, que é escala de janela, não resolução do
      core).
- [x] `go test ./internal/emulator/...` passa **sem nenhum emulador
      instalado** — toda leitura/escrita opera sobre um caminho recebido
      por parâmetro (ou uma `var` de pacote sobrescrita em teste), nunca
      descobre o caminho sozinha durante o teste.
- [x] O que foi verificado contra **binário real** e o que foi só lido em
      documentação fica escrito, adapter por adapter — mesma honestidade que o
      D1 impôs às flags. Tabela:

| Adapter | Campo | Chave | Confirmado contra | Status |
|---|---|---|---|---|
| PCSX2 | Fullscreen | `[UI] StartFullscreen` | Arquivo real desta máquina, gerado por execução de verdade | Implementado |
| PCSX2 | InternalScale | `[EmuCore/GS] upscale_multiplier` | Arquivo real desta máquina | Implementado |
| PCSX2 | Renderer | `[EmuCore/GS] Renderer` (id numérico) | Só a existência da chave — mapeamento id→Renderer não confirmado | `Unapplied` de propósito |
| RetroArch | Fullscreen | `video_fullscreen` | Arquivo real desta máquina (`~/.config/retroarch/retroarch.cfg`) | Implementado |
| RetroArch | Renderer (OpenGL, Vulkan) | `video_driver` = `"gl"`/`"vulkan"` | `"gl"` é o driver ativo real nesta máquina; `"vulkan"` é nome de driver estável e documentado, não testado ativo aqui | Implementado, parcial |
| RetroArch | Renderer (D3D12, Software) | `video_driver` | Não verificado — nenhuma máquina Windows disponível nesta sessão para conferir o id exato | `Unapplied` de propósito |
| RetroArch | InternalScale | — | `video_scale` existe mas é escala de janela, conceito diferente de resolução do core | Não implementado (conceito não mapeia) |

**Achado real registrado durante a implementação:** mesmo a instalação do
PCSX2 feita pelo próprio ZeuX (AppImage, gerenciada) não roda em modo
portátil nesta máquina — grava a config em `~/.config/PCSX2/inis/PCSX2.ini`
(padrão do sistema), não em `<pasta gerenciada>/inis/PCSX2_qt.ini` como
`seedPCSX2` (`internal/install/firstrun.go`) presume. `pcsx2ConfigPath()`
(H1) já usa o caminho real confirmado; **`seedPCSX2` continua com a
suposição antiga e não foi corrigido aqui** — está fora do escopo do H1,
registrado para não se perder.

**Depende de:** decisão sobre a ambiguidade acima · **Bloqueia:** H2, H5

### H2 — Tela de configuração do emulador dentro do ZeuX (M)

O H1 sem tela é biblioteca sem consumidor. Aqui o botão "Configurar" deixa de
abrir o emulador e passa a abrir o ZeuX.

**Critério de aceite — implementado e verificado ao vivo em 2026-08-05:**
- [x] A partir da tela de Emuladores, o usuário altera resolução interna,
      renderer e tela cheia (`EmulatorConfigPanel.tsx`, rotas
      `GET/POST/DELETE /api/v1/emulators/{id}/config`), e o valor sobrevive a
      fechar o ZeuX e abrir de novo — **verificado contra o `PCSX2.ini` real
      desta máquina**: gravou `StartFullscreen = true`, reabriu o app,
      confirmou o valor lido, gravou de volta `false`, e o arquivo bateu
      byte a byte com o original ao final do teste.
- [x] Cada campo mostra o valor **efetivo hoje**, lido do arquivo real —
      `fullscreen === null` renderiza "(desconhecido — nunca lido do
      arquivo)" em vez de um chute.
- [x] Renderer não confirmado (ver tabela do H1) vai para `unapplied` em vez
      de fingir ter sido gravado — mostrado como aviso na tela, não escondido
      de antemão (mais simples e não promete uma lista de opções suportadas
      que a API ainda não expõe por campo).
- [x] O botão antigo continua existindo, renomeado para "Abrir configurações
      do emulador" (`EmulatorsScreen.tsx`).
- [x] "Restaurar padrão" chama `DELETE /config` (H1's `RestoreConfig`), com
      confirmação em duas etapas (não é ação silenciosa) — verificado que o
      arquivo volta ao estado anterior à primeira escrita do ZeuX.
- [x] Toda a tela é `<label>`/`<button>`/`<input>` nativos, sem
      `tabIndex` customizado nem captura de teclado nesta tela (a captura de
      teclado é só no H3/H4, painel separado) — navegável por Tab/Enter por
      construção, não por teste manual desta sessão.

**Bug real achado e corrigido durante a verificação ao vivo:** `[]string(nil)`
serializa como `null` em JSON; o front chamava `.length` nele sem checar, o
que derrubava a tela inteira. Corrigido no backend (`server.go`, `unapplied`
nunca nil) e reforçado no front (`result.unapplied ?? []`), com teste de
trava `TestEmulatorConfigUnappliedIsNeverNull`. A mesma classe de bug also
existia — ainda não disparada — no scraper de capas do G1
(`internal/igdb/scrape.go`); corrigida junto, com teste próprio.

**Depende de:** H1 · **Bloqueia:** nada

### H3 — Detectar joystick e mapear botões (G)

Hoje o usuário conecta um controle e vai configurar em cada emulador,
separadamente, com a interface de cada um. É exatamente o tipo de complexidade
que o ZeuX existe para eliminar.

**Decisão tomada durante a implementação (2026-08-05), registrada aqui em vez
de relitigada às cegas:** o item previa `GET /api/v1/controllers` no daemon
Go. Implementado diferente — **detecção pelo lado do WebView, via Gamepad API
do navegador** (`EmulatorBindingsPanel.tsx`, `navigator.getGamepads()` +
eventos `gamepadconnected`/`gamepaddisconnected`), exatamente a alternativa
que este item já cogitava. Motivo: qualquer lib Go de gamepad viável arrisca
CGO, o que quebraria o build sem CGO que o
[ADR 0011](decisoes/0011-sqlite-local-para-biblioteca.md) preserva de
propósito (`modernc.org/sqlite`). A WebView já expõe a API sem custar
dependência nenhuma — não há rota nova no daemon para isto.

**Critério de aceite:**
- [x] Controle conectado é detectado sem reiniciar nada — a lista muda ao
      vivo com `gamepadconnected`/`gamepaddisconnected` (implementado pelo
      lado do navegador, ver decisão acima).
- [x] Uma tela de mapeamento mostra a ação (vocabulário nativo do emulador —
      Cross/Circle/Square/Triangle no PCSX2, a/b/x/y no RetroArch, ver H1) e
      captura o botão apertado — poll de `navigator.getGamepads()` via
      `requestAnimationFrame`, detectando a transição solto→pressionado (não
      o estado já pressionado ao entrar no modo de captura).
      **Eixos analógicos e D-pad-como-eixo não foram implementados** — só
      `gamepad.buttons[]` (D-pad como botão digital, quando o controle expõe
      assim, funciona; D-pad mapeado como eixo pelo driver, não).
- [ ] O mapeamento é gravado na config do emulador via H1 (isso está feito e
      testado com valores sintéticos — `TestPCSX2WriteBindingsButtonGoesToUnapplied`
      documenta que o vínculo de botão do PCSX2 ainda vai para `unapplied`,
      porque o formato de gravação nunca foi observado num arquivo real), mas
      **abrir o jogo respeitando esse mapeamento com controle físico de
      verdade não foi verificado nesta sessão** — nenhum controle estava
      conectado. Mesma classe de pendência que D11/B11: **só o Douglas pode
      fechar isto**, com um controle físico plugado.
- [x] Controle não reconhecido não trava a tela: a tela funciona inteira sem
      nenhum controle conectado (mapeamento de teclado continua ativo), texto
      explícito "Nenhum controle detectado" em vez de silêncio.
- [x] Nenhuma dependência nova pesada — decisão acima evitou isso por
      construção.

**Depende de:** H1 · **Bloqueia:** perfis de controle compartilháveis (Sprint F,
v2.0)

### H4 — Mapear teclado (M)

Metade dos usuários de emulador nunca conectou controle. Teclado é o caminho
padrão, e hoje o ZeuX não toca nele.

**Critério de aceite — implementado e verificado ao vivo em 2026-08-05:**
- [x] Mesma tela do H3 (`EmulatorBindingsPanel.tsx`), teclado sempre visível,
      controle aparece condicionalmente quando conectado.
- [x] Conflito de tecla é mostrado **antes** de gravar — verificado ao vivo
      nos dois adapters: no RetroArch, capturar "w" para `up` mostrou "A
      tecla já está em 'r'. Trocar para 'up' também?" antes de qualquer
      escrita; no PCSX2, capturar "j" para `Cross` mostrou o mesmo diálogo
      contra `Square` (que já usava `Keyboard/J` no arquivo real). Cancelar o
      diálogo não escreve nada — confirmado que os dois arquivos ficaram
      bit-a-bit iguais ao estado anterior ao teste.
- [x] O mapeamento é gravado via H1 e sobrevive a reabrir a tela — verificado
      com escrita real e não-conflituosa: RetroArch `l2` (antes `"nul"`)
      recebeu a tecla `p`, confirmado em `input_player1_l2 = "p"` no
      `retroarch.cfg` real, depois restaurado ao original.
      **Respeitar o mapeamento ao abrir o jogo de verdade** tem a mesma
      pendência do item acima do H3 — precisa de execução real do emulador,
      fora do alcance desta sessão.
- [x] "Restaurar padrão" existe (reaproveita o `RestoreConfig` do H1, mesmo
      botão do H2) — devolve o arquivo ao backup, cobrindo tecla e botão
      juntos (é o mesmo arquivo).

**Depende de:** H1, H3 (mesma tela) · **Bloqueia:** nada

### H5 — Cobrir os demais emuladores (G, incremental)

O H1 cobre dois. Faltam doze — e cada um tem formato, nome de chave e
comportamento próprios. Não é trabalho de copiar e colar; é a mesma pesquisa
individual que o D8 exigiu, emulador por emulador.

**Decisão desta sessão: os doze ficam explicitamente não cobertos nesta v1.0,
não implementados às pressas.** Pesquisar formato de arquivo de doze
emuladores sem nenhum deles instalado localmente (mesma restrição que o D8 já
registrou) produziria a mesma classe de risco que o CLAUDE.md proíbe para
flags de linha de comando: inventar uma chave que a documentação não confirma
e quebrar a config do usuário. H5 aqui entrega a parte que **não** depende de
verificação binário a binário: a tabela honesta e a degradação visível — as
duas únicas coisas que o critério de aceite realmente pede além da cobertura
em si.

**Critério de aceite:**
- [x] Tabela abaixo, formato do D8, com todos os 14 adapters — os 2 cobertos
      pelo H1 e os 12 restantes, cada um com o motivo de não estar coberto.
- [x] Emulador ainda não coberto **degrada visivelmente**
      (`EmulatorsScreen.tsx`): quando `configurable === false` e
      `bindable === false`, a tela mostra "Configuração e controles ainda só
      dentro do próprio {nome}." e mantém o botão "Abrir configurações do
      emulador" — verificado ao vivo nesta sessão no card do DuckStation.
- [x] Nenhum adapter é marcado como coberto sem teste que trave o formato:
      `TestPCSX2SatisfiesKeyBindableAdapter`/`TestRetroArchSatisfiesKeyBindableAdapter`
      travam os 2 cobertos; `TestDuckStationDoesNotSatisfyKeyBindableAdapter`
      (mais o equivalente do H1 com `ConfigurableAdapter`) trava que os
      `standaloneAdapter` genéricos — os 12 restantes, que compartilham o
      mesmo tipo Go — **não** ficam marcados como cobertos por engano.

| Adapter | Formato do arquivo | Opções persistíveis | Mapeamento de controle | Verificado contra |
|---|---|---|---|---|
| PCSX2 | `.ini` seccionado | Fullscreen, InternalScale (ver H1) | Teclado (H4), botão vai para `unapplied` (H3) | Arquivo real desta máquina |
| RetroArch | `.cfg` achatado, valor entre aspas | Fullscreen, Renderer (parcial, ver H1) | Teclado e botão (H3/H4), índice de botão não confirmado com hardware | Arquivo real desta máquina |
| DuckStation | não pesquisado | — | — | Não coberto — degrada para "configurar por fora" |
| Dolphin | não pesquisado | — | — | Não coberto |
| PPSSPP | não pesquisado | — | — | Não coberto |
| Flycast | não pesquisado | — | — | Não coberto |
| RPCS3 | não pesquisado | — | — | Não coberto |
| melonDS | não pesquisado | — | — | Não coberto |
| Azahar | não pesquisado | — | — | Não coberto |
| xemu | não pesquisado | — | — | Não coberto |
| Vita3K | não pesquisado | — | — | Não coberto |
| Xenia | não pesquisado | — | — | Não coberto |
| Cemu | não pesquisado | — | — | Não coberto |
| RMG (N64) | não pesquisado | — | — | Não coberto |

**Depende de:** H1 · **Bloqueia:** nada

**Critério de saída da Sprint H:** numa máquina limpa, o usuário troca a
resolução interna e remapeia o botão de confirmar em **dois emuladores
diferentes**, sem abrir nenhum emulador, e o jogo abre respeitando as duas
mudanças — verificado com controle e jogo reais pelo Douglas.

**Fora de escopo desta sprint, e por quê:** navegar o ZeuX inteiro com controle
(modo TV / sofá) continua fora, por
[ADR 0009](decisoes/0009-desktop-agora-controle-depois.md). Mapear botão de
controle **para o jogo** e navegar a interface **com** controle são coisas
diferentes; o H3 entrega a primeira e não abre a segunda. Se o modo TV for
construído, ele merece ADR próprio, como o 0009 já diz.

---

## Sprint I — Arestas que faltam para a v1.0 (v1.0)

Objetivo: fechar as lacunas pequenas que o Douglas listou junto — as que já têm
backend pronto e só falta tela, e as buscas que faltam.

### I1 — Tela para adicionar emulador manualmente (M)

**O backend está inteiro e nenhuma tela o chama** — verificado em 2026-08-04:

| Camada | Estado |
|---|---|
| `internal/emulator/custom.go` | `CustomDefinition`, `CustomStore` com `Upsert`/`Delete` sob lock único |
| Rotas | `GET`/`POST /api/v1/custom-emulators`, `DELETE /api/v1/custom-emulators/{id}` (`internal/api/server.go`) |
| Tipos do front | `CustomDefinition` (`src/api/types.ts`) |
| Cliente do front | `getCustomEmulators`, `upsertCustomEmulator`, `deleteCustomEmulator` (`src/api/client.ts`) |
| **Tela** | **Não existe.** `grep -rn "getCustomEmulators" src/` só acha a própria definição em `client.ts` |

Isto é o oposto do problema habitual: funcionalidade pronta e invisível. O
usuário que já tem um emulador instalado fora do padrão hoje não tem como dizer
isso ao ZeuX pela interface.

**Critério de aceite — todos verificados de verdade em 2026-08-05, app rodando
(zeuxd + Chromium contra o build real), não só por leitura de código:**
- [x] A tela de Emuladores ganha "Adicionar emulador manualmente", com
      formulário para os campos de `CustomDefinition`
      (`src/components/ManualEmulatorForm.tsx`).
- [x] O caminho do binário é escolhível pelo **seletor nativo de arquivo**
      (`@tauri-apps/plugin-dialog`), com o campo de texto continuando
      editável — mesmo padrão do "Escolher pasta".
- [x] Emulador adicionado aparece na lista junto dos conhecidos, marcado como
      personalizado, e **pode lançar um jogo de verdade** — verificado
      cadastrando um emulador apontando para `/usr/bin/true` e chamando
      `POST /games/launch` com ele: sessão criada (`id: s19`,
      `adapter_id: emulador-de-teste`), não só "apareceu na lista".
- [x] Editar e remover funcionam pela tela — testado clicar em "Editar"
      (formulário reabre pré-preenchido com todos os campos), "Excluir" (com
      confirmação, some da lista) — e o erro do servidor aparece completo,
      sem reescrita (mensagem literal de `ApiError`).
- [x] Caminho que não existe, ou que existe e não é executável, é recusado com
      mensagem que nomeia o caminho — 400 `binary_not_found`, não 500, e não
      um sucesso falso que só quebra na hora de jogar. Validação em
      `handleUpsertCustom` (`internal/api/server.go`), nunca em
      `CustomDefinition.Validate()` — essa continua permissiva de propósito,
      porque também roda no carregamento do JSON a cada início do daemon, e
      um caminho temporariamente indisponível (HD externo desconectado) não
      pode apagar a definição do usuário (mesma filosofia de
      `library.Game.Missing`).
- [x] Concluível só com Tab e Enter — formulário é HTML nativo (`<input>`,
      `<textarea>`, `<button>`), sem nenhum elemento que só responda a mouse.

**Depende de:** nada (backend pronto) · **Bloqueia:** nada

### I2 — Busca dentro da lista de jogos de um console (P)

Auditoria de buscadores em 2026-08-04, contra o código:

| Tela | Busca | Onde |
|---|---|---|
| `VerdictScreen` | ✅ "Buscar console..." | client-side |
| `LibraryScreen` | ✅ "Filtrar por nome do console" | client-side |
| `EmulatorsScreen` | ✅ "Buscar emulador ou console..." | client-side |
| `AllGamesScreen` | ✅ "Buscar jogos..." | servidor (`?q=`) |
| **`GamesScreen`** | ❌ **nenhuma** | — |

`GamesScreen` (os jogos de **um** console) é a única lista de tamanho
potencialmente grande sem filtro. Uma pasta de arcade ou de NES com centenas de
ROMs vira rolagem pura.

**Critério de aceite — verificado de verdade em 2026-08-05, app rodando:**
- [x] Campo de busca em `GamesScreen`, filtrando por título, mesmo padrão
      visual/classe já usado em `AllGamesScreen` (o projeto não tem um
      componente de input extraído — cada tela já repete o mesmo `<input>`
      com a mesma classe Tailwind, ver `LibraryScreen.tsx`/`VerdictScreen.tsx`;
      esta tela segue a mesma convenção, não inventa um padrão novo).
- [x] Busca vazia mostra a lista inteira; busca sem resultado mostra estado
      vazio explícito ("Nenhum jogo encontrado para ...") — testado
      digitando "Sega" (4→2 jogos) e depois um termo sem match nenhum.
- [x] A busca não perde a ordenação por "jogado por último" que o L11
      entregou — filtra sobre o array já ordenado pela API, sem reordenar.
- [x] Alcançável por Tab — `<input>` nativo, sem tabindex customizado.

**Depende de:** nada · **Bloqueia:** nada

### I3 — Seleção de pasta: **já feito**, reafirmado aqui (P)

O Douglas pediu "seleção das pastas" junto dos outros itens. **Isso já existe
desde 2026-08-04** e está registrado mais acima neste documento:
`@tauri-apps/plugin-dialog` (npm) + `tauri-plugin-dialog` (crate) + permissão
`dialog:allow-open`; o botão "Escolher pasta" em `LibraryScreen.tsx` abre o
diálogo nativo do SO e preenche o campo, que continua editável.

**Não vira item novo.** Fica aqui só para não ser reimplementado por alguém
lendo a lista de pedidos e não a lista de entregas. O que **falta** de seletor
nativo é o de **arquivo** (binário do emulador), e isso é o I1.

**Depende de:** nada · **Bloqueia:** nada · **Estado:** ~~feito 2026-08-04~~

**Critério de saída da Sprint I:** um usuário com um emulador instalado por
conta própria consegue registrá-lo, apontar as pastas e achar qualquer jogo da
biblioteca, sem tocar em terminal e sem editar arquivo de configuração.

---

## Sprint K — Consertar layout, foco e responsividade (v1.0)

Objetivo: fechar o que a revisão crítica do frontend (skills
`web-design-guidelines` e `vercel-composition-patterns`, 2026-08-06) achou de
errado — nada de escopo novo, só dívida de UI que a própria revisão apontou
com `arquivo:linha`. Base barata, sem dependência nova, antes da Sprint J
tocar os mesmos arquivos.

| Item | Tam. | Depende de |
|---|---|---|
| K1 — foco ausente nos filtros de `AllGamesScreen` | P | nada |
| K2 — labels/`autoComplete` nos campos de busca | P | nada |
| K3 — progressão de breakpoints nos grids | M | nada |
| K4 — tipografia (`...` → `…`) | P | nada |
| K5 — auditar telas não revisadas ainda | M | nada |
| K6 — quebrar `EmulatorCard` em subcomponentes | M | nada |

### K1 — Foco ausente nos filtros de `AllGamesScreen` (P)

`src/screens/AllGamesScreen.tsx:212-217` (botão "★ FAVORITOS") e `:220-240`
(chips de plataforma) não usam `FOCUS_RING` (`src/components/ui.tsx`),
diferente do resto do app, que centraliza o anel de foco ali desde o ADR
0009. Quem navega por teclado perde o indicador de foco exatamente nesses
dois grupos de botão.

**Critério de aceite:** os dois grupos usam `FOCUS_RING`, indicador de foco
visível e consistente com o resto da tela.

### K2 — Labels e atributos de formulário nos campos de busca (P)

`AllGamesScreen.tsx:201-207`, `EmulatorsScreen.tsx:606-612`,
`GamesScreen.tsx:252-258`, `LibraryScreen.tsx:314-320` — inputs de
busca/filtro só têm `placeholder`, sem `<label>` associado nem `name`.

**Critério de aceite:** cada input de busca tem `<label className="sr-only">`
associado via `htmlFor`/`id`, e `name`/`autoComplete="off"` (são buscas
locais, não campos de autocomplete do navegador).

### K3 — Breakpoints inconsistentes nos grids (M) — **feito em 2026-08-06**

Auditoria de todos os `grid-cols-*` responsivos em `src/screens/` contra a
régua do CLAUDE.md (descontar sidebar 64px + scrollbar ~16px da largura da
janela, e nunca prender um breakpoint no valor exato do tamanho padrão da
janela — 1280px). Resultado: a maior parte já seguia a regra
(`AllGamesScreen.tsx:265` usa `lg`→`2xl`, nunca `xl`; `EmulatorsScreen.tsx` e
`GamesScreen.tsx` usam só `sm`→`lg`) — o padrão "pular xl e ir de lg para
2xl" **não é bug, é a aplicação correta da regra** (evita o breakpoint
frágil, aceita uma faixa "plana" de janela onde a densidade não sobe).

**Achado real:** `VerdictScreen.tsx:238` usava `xl:grid-cols-3` — exatamente
o valor frágil, e pior aqui, porque esta grade divide espaço com uma coluna
lateral fixa de 320px (`VerdictScreen.tsx:181`, `lg:grid-cols-[320px_1fr]`),
sobrando ainda menos largura que uma grade de tela cheia. Trocado para
`2xl:grid-cols-3`, com comentário explicando o porquê.

**Critério de aceite:** nenhum grid do projeto usa `xl` como breakpoint de
densidade — confirmado por `grep -rn "grid-cols" src/screens/`.

### K4 — Tipografia (P) — **feito em 2026-08-06**

6 ocorrências de reticência literal (`...`) em texto de UI trocadas por `…`:
`AllGamesScreen.tsx`/`GamesScreen.tsx` ("Buscar jogos..."),
`VerdictScreen.tsx` ("Lendo hardware...", "Buscar console..."),
`LibraryScreen.tsx` ("Varrendo..."), `EmulatorsScreen.tsx` ("Carregando
cores...", "Buscar emulador ou console...").

**Critério de aceite:** `grep -rn '\.\.\.' src --include="*.tsx" | grep -v
'\.\.\.[a-zA-Z_]'` não acha nada restante (o filtro exclui spread de JS,
`...props`/`...obj`, que não é reticência de texto).

### K5 — Auditar as telas não revisadas ainda (M) — **feito em 2026-08-06**

`VerdictScreen.tsx`, `SettingsScreen.tsx`, `ConsentScreen.tsx`,
`DeclinedScreen.tsx`, `ManualEmulatorForm.tsx` não tinham entrado na revisão
crítica original (que cobriu `App.tsx`, `ui.tsx`, `Sidebar.tsx`,
`AllGamesScreen`, `EmulatorsScreen`, `EmulatorConfigPanel`,
`EmulatorBindingsPanel`, `GamesScreen`, `LibraryScreen`, `GameDetailScreen`).

**Achado real:** `VerdictScreen.tsx` tinha o mesmo bug do K1 (chips de
filtro por patamar, linhas 210-229, sem `FOCUS_RING`) e do K2 (campo "Buscar
console" sem `<label>`/`name`) — corrigido junto.

**As outras 4 telas auditadas e já estavam corretas:** `SettingsScreen.tsx`
e `ManualEmulatorForm.tsx` usam `<label>` envolvendo o `<input>` (associação
implícita, válida); `ConsentScreen.tsx` e `DeclinedScreen.tsx` só usam o
componente `Button` (que já embute `FOCUS_RING`) e não têm campo de busca
nem grid. Nenhuma mudança necessária nessas 4.

### K6 — Quebrar `EmulatorCard` em peças menores (M) — **feito em 2026-08-06**

`src/screens/EmulatorsScreen.tsx` tinha um `EmulatorCard` de ~370 linhas com
~10 `useState` e uma parede de condicionais (`entry.installed` ×
`entry.configurable` × `entry.bindable` × `customDef` × `RowState`).

**Extraído em 5 componentes**, cada um com o estado que genuinamente é dele
(nada subiu para Context — escopo continua local a um card):
`EmulatorCardHeader` (nome, ponto de identidade, badge — sem estado),
`EmulatorCardConsoles` (ícones de console — sem estado),
`EmulatorCardConfigPanels` (toggle de config/bindings — `showConfig`/
`showBindings` locais), `EmulatorCardBios` (botão de pasta do BIOS —
`biosError` local), `EmulatorCardActions` (a máquina de estados `RowState`
inteira — instalar/remover/abrir standalone/editar-excluir personalizado).
`EmulatorCard` virou orquestrador: monta `Card` + os 5 pedaços + o toggle de
cores do RetroArch. `RowState` continua union discriminada, comportamento
idêntico — `npm run build` (`tsc` + `vite build`) passou sem erro.

**Critério de saída da Sprint K:** as 7 telas usam `FOCUS_RING` em todo
elemento interativo (achado extra: `VerdictScreen.tsx` tinha o mesmo bug do
K1/K2, corrigido em K5), nenhum grid usa o breakpoint frágil `xl` (achado
real em `VerdictScreen.tsx`, corrigido em K3), `EmulatorCard` deixou de ser
um componente de 370 linhas. **Sprint K encerrada em 2026-08-06.**

---

## Sprint J — Adotar shadcn de verdade e aproximar do Playnite (v1.0)

Objetivo: sair de "skill instalada" para componentes de verdade no app, e
puxar o layout na direção do Playnite nos três eixos que o Douglas confirmou
em 2026-08-06 — densidade/hierarquia visual, componentes de interface e
navegação/organização. Depende da Sprint K (K6 principalmente — trocar
componentes dentro de um `EmulatorCard` ainda monolítico duplicaria
trabalho).

Pesquisa de referência já feita, não repetir: `docs/referencias-playnite.md`
(código-fonte real do Playnite, `GridViewItemTemplate.xaml`,
`DetailsViewGameOverview.xaml`).

| Item | Tam. | Depende de |
|---|---|---|
| J1 — `shadcn init` mapeado aos tokens existentes | M | Sprint K |
| J2 — `Dialog` substitui `ErrorModal`/`ConsoleInfoModal` | M | J1 |
| J3 — `Select`/`Combobox` no filtro de console | M | J1 |
| J4 — hover do `GameCover` estilo Playnite | M | nada |
| J5 — `DropdownMenu` para ações secundárias por card | M | J1, K6 |

### J1 — `shadcn init` mapeado aos tokens existentes (M)

Rodar `npx shadcn@latest init` (Tailwind v4 já suportado pela CLI atual).
Sobrescrever as variáveis que o shadcn espera para apontar aos tokens do
ZeuX (`src/index.css`) em vez da paleta padrão:

| Variável shadcn | Token ZeuX |
|---|---|
| `--background` | `--paper` |
| `--foreground` | `--ink` |
| `--card` | `--panel` |
| `--primary` | `--accent` |
| `--primary-foreground` | `--accent-ink` |
| `--border` | `--line` |
| `--ring` | `--accent` (mesmo anel de `FOCUS_RING`) |
| `--muted-foreground` | `--muted` |
| `--destructive` | `--danger` |

Preserva a identidade neon única (ADR 0013) e o anel de foco único (ADR
0009) em vez do shadcn trazer uma segunda linguagem visual por cima —
decisão tomada nesta sessão para não repetir o erro que as skills de
"visual taste" opinativas (`frontend-design`, `minimalist-ui`) teriam
causado, avaliadas e descartadas em 2026-08-06.

Dependências novas (`npm install`, autorizado pelo Douglas em 2026-08-06):
`@radix-ui/*` (conforme componente usado), `clsx`, `tailwind-merge`,
`class-variance-authority`, `lucide-react`. Isto é uma exceção explícita ao
ADR 0004 (adiava dependências de Node) — decisão tomada, não mais "adiado".

**Feito em 2026-08-06.** `npx shadcn@latest init --template vite --base
radix --preset nova` precisou de alias `@/*` primeiro (`tsconfig.json`
`paths`, `vite.config.ts` `resolve.alias` via `fileURLToPath` — o projeto é
ESM, `__dirname` não existe). **Achado real do CLI:** ele sobrescreveu
`--muted` e `--accent` (mesmo nome que os tokens do ZeuX já usavam) com
valores `oklch` neutros, importou a fonte Geist (`@fontsource-variable/geist`,
removida) por cima do Inter self-hospedado, e gravou um bloco `.dark{}`
inteiro que nunca ativa (o ZeuX não tem alternância clara/escura). Corrigido
à mão em `src/index.css`: `--muted`/`--accent` restaurados, as variáveis
novas do shadcn (`--background`, `--primary`, `--border`, `--ring` etc.)
apontando para os tokens ZeuX em vez de valores próprios, `.dark{}` e
`--chart-*`/`--sidebar-*` (não usados — sem gráfico, sem `Sidebar` do
shadcn) removidos. `shadcn` movido para `devDependencies` (é a CLI, não roda
em produção). O `Button` que o `init` gerou (`src/components/ui/button.tsx`)
foi removido — o ZeuX mantém o próprio `Button` (`ui.tsx`, variantes
primary/secondary/ghost já estabelecidas), o shadcn entra só pelos
componentes comportamentais (Dialog, Select, DropdownMenu) das próximas
tasks. `npm run build` passa.

### J2 — `Dialog` do shadcn substitui `ErrorModal` e `ConsoleInfoModal` (M)

Elimina a duplicação achada na revisão de 2026-08-06: `ErrorModal`
(`ui.tsx:151-175`) e `ConsoleInfoModal` (`ui.tsx:467-540`) reimplementavam o
mesmo shell (`fixed inset-0` + backdrop + `role="dialog"` + Esc) cada um por
conta própria. `Dialog` do Radix já traz focus-trap, `Esc` fecha,
`aria-modal` — sem reescrever isso à mão de novo no próximo modal que
aparecer.

**Feito em 2026-08-06.** `npx shadcn@latest add dialog` trouxe `Dialog`/
`DialogContent`/`DialogTitle` (Radix) — `DialogContent` depende do `Button`
do shadcn internamente (botão "X" de fechar), então esse arquivo voltou
(diferente do J1, aqui é dependência real, não sobra). `ErrorModal` e
`ConsoleInfoModal` (`ui.tsx`) trocaram o shell à mão pelo `Dialog`;
conteúdo interno continua com o `Button` do ZeuX. Preservada a regra "fecha
só por botão/Esc, nunca clicando fora": `onInteractOutside={(e) =>
e.preventDefault()}` em ambos. `npm run build` passa.

### J3 — `Select`/`Combobox` do shadcn no filtro de console (M)

`EmulatorsScreen.tsx` (filtro "Todos os consoles") e
`EmulatorConfigPanel.tsx` (`RENDERER_LABEL`) usam o `<select>` temático
(`ui.tsx:50-69`). Trocar pelo `Select`/`Combobox` do shadcn dá busca por
teclado de graça na lista de 33 consoles.

**Feito em 2026-08-06** — com uma ressalva de escopo: `npx shadcn@latest add
select` trouxe o `Select` do Radix (teclado nativo, digitar salta pro item
que começa com a letra — mesmo comportamento de um `<select>` nativo, só sem
o chrome do SO). **Não é** um combobox com busca por texto livre nos 33
consoles — isso exigiria compor `Command`+`Popover` (outro componente,
escopo maior); registrado aqui para não prometer mais do que foi feito.
Radix recusa `SelectItem value=""`, então os dois usos (filtro de console em
`EmulatorsScreen.tsx`, backend gráfico em `EmulatorConfigPanel.tsx`) ganharam
um valor-sentinela (`__all__`/`__default__`) convertido de volta para `""`
fora do componente. O `Select` nativo antigo (`ui.tsx`) foi removido —
nenhum outro lugar do projeto o usava. `npm run build` passa.

### J4 — Hover do `GameCover` estilo Playnite (M)

Já documentado como "ideia concreta, sem esperar scraper" em
`docs/referencias-playnite.md`: overlay escurecido (`bg-black/40` a
`bg-black/60`) no hover/foco de `GameCover` (`ui.tsx:193-271`), com o botão
"Jogar" (já existe como `showPlayOverlay`) mais proeminente — o Playnite
escurece + revela ação, o ZeuX hoje só faz glow de borda.

**Achado real em 2026-08-06: o overlay de escurecimento já existia** (G4,
implementado antes desta sprint) — `showPlayOverlay` em `GameCover`
(`ui.tsx`) já escurecia e revelava o ícone de "Jogar". **Mas
`group-focus-visible` nunca funcionava de verdade**: o elemento que recebe
foco de teclado em `AllGamesScreen.tsx` é o `<button>` que envolve o
`GameCover`, não a `<div className="group">` interna do próprio componente
— `:hover` cascateia naturalmente entre elementos sobrepostos (por isso o
mouse "funcionava sozinho"), mas `:focus-visible` não. Corrigido
adicionando `group` também ao `<button>` externo em `AllGamesScreen.tsx`.
Escurecimento aumentado de `bg-black/40` para `bg-black/60`, mais perto do
`#AA000000` (~67%) que `docs/referencias-playnite.md` registra como o hover
real do Playnite. `npm run build` passa.

**Critério de saída:** hover e foco por teclado revelam o overlay de forma
idêntica (ADR 0009: nada só-hover) — confirmado corrigindo o bug acima, não
apenas assumido; placeholder de sigla continua por baixo quando não há capa.

### J5 — Menu de ações por card com `DropdownMenu` (M)

Cards de `EmulatorCard` (pós-K6) acumulam botões secundários soltos
(Editar/Excluir de emulador personalizado, Remover, Abrir configurações).
Agrupar em `DropdownMenu` do shadcn por card reduz botões sempre visíveis,
aproximando da IA do Playnite (menu de contexto por item).

**Reavaliado em 2026-08-06, não aplicado.** Contada a combinação máxima de
botões simultâneos em `EmulatorCardActions` (pós-K6) — pior caso é
"Abrir configurações do emulador" + "Editar" + "Excluir" (emulador
personalizado já instalado), 3 botões num `flex-wrap`. Isso não é o
cenário "várias ações soltas competindo por atenção" que motivava o
`DropdownMenu` no plano original — é menos denso que um único menu de
contexto do Playnite. Esconder 3 botões atrás de um clique extra custaria
mais do que resolveria (e o ADR 0009 exigiria garantir que cada item
continuasse alcançável só por foco, custo real para um ganho que não existe
hoje). Registrado como não feito de propósito — `DropdownMenu` já está
disponível (`npx shadcn add dropdown-menu`) se uma sprint futura adicionar
ações suficientes para justificar.

**Critério de saída da Sprint J:** nenhum modal do projeto reimplementa o
shell à mão (feito), `Select` usa o componente do shadcn (feito, sem busca
por texto livre — ver ressalva de J3), `GameCover` revela "Jogar" com
escurecimento no hover/foco de verdade nos dois casos (feito, corrigindo um
bug real de foco no processo), ações secundárias agrupadas em
`DropdownMenu` — **avaliado e não aplicado** (J5): a densidade real de
botões por card não justifica. **Sprint J encerrada em 2026-08-06.**

---

## Sprint L — Navegação por controle no layout atual (v1.0)

Objetivo: controle (joystick) navega entre telas, listas e jogos —
D-pad/analógico ≈ Tab, A ≈ clique, B ≈ voltar. Depende da Sprint J (o
`Dialog` já com focus-trap deixa "B fecha modal" de graça) e da Sprint K
(foco visível consistente em toda a base).

**Isto reabre o [ADR 0009](decisoes/0009-desktop-agora-controle-depois.md)**,
que hoje diz "sem navegação direcional" e reserva um modo TV completo
(layout alternativo, estilo Playnite Fullscreen) para quando houver ADR
próprio. Perguntado ao Douglas em 2026-08-06: o escopo da v1.0 é navegação
por controle **sobre o layout de mesa existente**, não um modo TV separado
com alvos grandes e densidade baixa — isso fica registrado como possível
sprint futura, não parte desta.

| Item | Tam. | Depende de |
|---|---|---|
| L0 — ADR 0014 (emenda o ADR 0009) | P | nada |
| L1 — hook `useGamepadNavigation` | G | L0 |
| L2 — montar o hook em `App.tsx` | P | L1 |
| L3 — verificação com hardware real | P | L2, só o Douglas fecha |

### L0 — ADR 0014: emenda o ADR 0009 (P)

Registrar em `docs/decisoes/0014-navegacao-por-controle.md` que a cláusula
"sem navegação direcional" do ADR 0009 deixa de valer, mas as três
restrições de acessibilidade (foco de primeira classe, nada só-hover, nada
só-clique-direito) continuam sendo a base — exatamente o que o ADR 0009
previa ("se o modo TV for construído, ele merece ADR próprio"). Registrar
explicitamente que isto **não é** o modo TV completo que o ADR 0009 também
menciona.

### L1 — Hook `useGamepadNavigation` (G)

Novo módulo `src/hooks/useGamepadNavigation.ts`, reaproveitando a técnica já
usada em `EmulatorBindingsPanel.tsx` (`navigator.getGamepads()` + poll via
`requestAnimationFrame`, comparando estado anterior/atual para achar
transições).

- **D-pad / analógico esquerdo** → navegação espacial entre elementos
  focáveis (não linear — um grid 2D como `AllGamesScreen` precisa de
  vizinho mais próximo por direção real, via `getBoundingClientRect()` dos
  elementos focáveis visíveis).
- **Botão A** (índice 0) → `click()` no elemento focado.
- **Botão B** (índice 1) → tecla `Escape` sintética (cobre `onBack` de tela
  e fechar modal do shadcn, sem callback por tela).
- Só ativo quando `gamepadconnected` dispara (mesma detecção de
  `EmulatorBindingsPanel.tsx:54-66`) — sem controle conectado, nada muda.

### L2 — Montar o hook em `App.tsx` (P) — **feito em 2026-08-06**

`useGamepadNavigation()` chamado uma vez no topo de `App()`, antes de
qualquer `useState` de fase — opera sobre `document.activeElement`, não
precisa saber a `phase` atual.

### L1/L2 — nota de implementação e uma limitação real do botão B

`src/hooks/useGamepadNavigation.ts` (novo). D-pad e analógico esquerdo usam
navegação espacial (vizinho mais próximo por direção, penalizando desvio
perpendicular — necessário porque uma grade 2D não navega bem com
Tab/Shift+Tab linear). Botão A dispara `.click()` no elemento focado. `npm
run build` (`tsc` + `vite build`) passa.

**Limitação registrada de propósito, não escondida:** o botão B despacha um
`Escape` sintético (fecha modal do shadcn, que já escuta isso via Radix) e,
sem modal aberto, procura um `<button>` visível cujo texto comece com
"Voltar" e clica nele. **Não existe hoje um registro central de "voltar"** —
cada tela recebe seu próprio `onBack` como prop de `App.tsx`
(`GamesScreen`, `LibraryScreen`, `EmulatorsScreen`, `GameDetailScreen`), sem
um callback compartilhado que o hook pudesse chamar diretamente. Clicar no
botão visível funciona porque as 4 telas já usam a mesma convenção de texto
("Voltar"/"Voltar à biblioteca"), mas é uma correspondência por texto, não
por contrato — se uma tela renomear esse botão, B para de voltar nela
silenciosamente. Registrado aqui para não virar surpresa: um registro
central de `onBack` (ex.: contexto de navegação) resolveria isso de vez, mas
é escopo maior que esta sprint — candidato a item futuro se o texto do botão
divergir.

### L3 — Verificação com hardware real (P) — só o Douglas fecha

Mesma ressalva estrutural do D11/B11: nenhuma sessão de IA tem controle
físico conectado — nada do L1/L2 foi testado com um gamepad de verdade,
só lido e revisado. Checklist para o Douglas confirmar:

- [ ] D-pad e analógico percorrem a grade de jogos (`AllGamesScreen`) em
      todas as direções sem travar num canto nem pular fileira.
- [ ] A abre um jogo/confirma um diálogo com o foco correto.
- [ ] B fecha um `Dialog` aberto (`ErrorModal`/`ConsoleInfoModal`) e volta
      uma tela nas 4 telas com botão "Voltar".
- [ ] Teclado e mouse continuam funcionando exatamente como antes — nada
      foi removido, só adicionado.

**Critério de saída da Sprint L:** os 4 itens acima confirmados pelo
Douglas com hardware real. **Sprint L parcialmente encerrada em
2026-08-06** — L0/L1/L2 feitos e revisados, L3 aberto até a verificação
humana.

---

## Sprint E — Perfil e camada social (**v2.0 — pós-v1.0**)

> **Adiada para a v2.0 por decisão do Douglas, 2026-08-04.** Nada nesta sprint
> entra na v1.0. O conteúdo abaixo **não foi reescrito** — continua válido como
> desenho; o que mudou é quando. Todos os itens dependem de um backend na nuvem
> e de uma identidade de usuário que **não existem nem foram desenhados**, e
> construir tela social sobre alicerce inexistente foi exatamente o risco que
> a nota de escopo de 2026-08-02 (abaixo) já apontava.

Objetivo: a promessa social do PRD, agora que há dado para exibir.

| Item | Tam. | Depende de |
|---|---|---|
| Backend na nuvem (MySQL) e identidade de usuário | G | Sprint D |
| Sincronização local ↔ nuvem | G | ↑ |
| Perfil público: consoles, tempo de jogo, hardware como comparativo | M | ↑ |
| Navbar: comunidade, amigos, perfil, conquistas | M | Sprint B |
| Amigos e feed de atividade | M | ↑ |
| Integração RetroAchievements | M | ↑ |
| Integração Speedrun.com | M | ↑ |

**Consentimento:** o hardware é usado como base de comparação entre jogadores —
isso já está no `PolicyText` atual. Publicar o hardware num perfil **público**
pode exigir uma nova versão da política (`PolicyVersion`), o que invalida o
consentimento anterior por desenho. Avaliar antes de implementar, não depois.

**Nota de escopo (2026-08-02):** o SQLite introduzido pelo [ADR 0011](decisoes/0011-sqlite-local-para-biblioteca.md)
é só local e sem conceito de conta — não cria nenhuma tabela de perfil,
comentário ou identidade social, de propósito. Mockar essas telas agora
desenharia sobre um alicerce que não existe: perfil público depende de uma
identidade de usuário que só existe com o **backend na nuvem** (primeira
linha da tabela acima), que por sua vez depende da sincronização
local↔nuvem — nenhum dos dois foi desenhado ainda. Quando a Sprint E for
mapeada (mesmo processo que gerou o wireframe da Sprint D: fluxo primeiro,
tela depois), aí sim faz sentido protótipar comentário/perfil como estado de
interface, sabendo contra qual identidade e qual sincronização eles vão
rodar.

---

## Sprint F — Compatibilidade comunitária e compartilhamento (**v2.0 — pós-v1.0**)

> **Adiada para a v2.0 junto da Sprint E, 2026-08-04.** Conteúdo preservado, não
> reescrito. Consequência que precisa ficar visível em vez de descoberta depois:
> **o D2 (calibrar os limiares do catálogo) depende desta sprint**, então a v1.0
> sai com o parecer ainda apoiado em estimativa. A UI já trata isso corretamente
> (aviso permanente de estimativa, feito no B9) — a dívida está declarada, não
> escondida.
>
> O `Installation.Version`, que continua nunca preenchido (Sprint A), é
> pré-requisito daqui e **pode ser feito na v1.0** sem esperar a nuvem: é um
> item P, e "rodou bem na versão X" precisa saber qual é X.

Objetivo: o conhecimento coletivo que nenhum emulador isolado tem.

| Item | Tam. | Depende de |
|---|---|---|
| Sistema de compatibilidade estilo ProtonDB, **sob demanda** | G | Sprint E |
| Relato de compatibilidade: hardware + emulador + versão + resultado | M | ↑ |
| Compartilhamento de **save states** | M | ↑ |
| Compartilhamento de **texture packs** | M | ↑ |
| Compartilhamento de **perfis de controle** | M | ↑ |
| **Netplay lobby** | G | ↑ |

Os relatos de compatibilidade dependem de `Installation.Version`, que **nunca é
preenchido hoje** — "rodou bem na versão X" precisa saber qual é X. Ver Sprint A.

**Regra legal, repetida porque é o ponto de maior risco do produto:** o
compartilhamento cobre save states, texture packs, perfis de controle e lobby de
netplay. **Nunca ROMs.** Isso precisa ser estrutural (o backend não aceita upload
de imagem de disco), não apenas uma regra de termos de uso.

---

## Backlog sem sprint atribuída

| Item | Tam. | Nota |
|---|---|---|
| Atualização do catálogo via nuvem | M | `schema_version` já existe para isso |
| ~~Escrever nos arquivos de config dos emuladores (reduz `Unapplied`)~~ | G | **Promovido em 2026-08-04 para a Sprint H (v1.0)**, itens H1/H2/H5. A ressalva original continua valendo e virou critério de aceite do H1: "invasivo; sobrescreve ajustes do usuário" — por isso o H1 exige preservar byte a byte o que o ZeuX não modela, e fazer backup antes da primeira escrita |
| Novos consoles: Saturn, 3DS, DS, Game Boy/Color, Master System, Xbox | M cada | Switch fica fora por decisão — [ADR 0008](decisoes/0008-excluir-switch-do-catalogo.md) |
| ~~Testes de `internal/api` e `internal/consent`~~ | M | **Feito 2026-08-01** — `Probe` mockado via interface; ver nota abaixo |
| Autenticação da API local | M | Necessário se algo além do Tauri falar com ela |
| Descoberta dinâmica de porta | P | Evita colisão em `7777` |
| CI multiplataforma (build + test nos 3 SOs) | M | Hoje a verificação cruzada é manual — ~~build do instalador Windows~~ **feito 2026-08-02**, ver abaixo |
| ~~Detecção de BIOS/firmware necessários por console~~ | M | **Duplicata removida em 2026-08-03** — é o mesmo trabalho do L3 (simplificado no mesmo dia para aviso genérico, sem catálogo de arquivo), na Sprint D. Duas linhas para o mesmo item fariam alguém estimar duas vezes |
| ~~Suporte a controles: detecção e mapeamento~~ | G | **Promovido em 2026-08-04 para a Sprint H (v1.0)**, itens H3 (joystick) e H4 (teclado). Continua sendo pré-requisito dos perfis de controle compartilháveis (Sprint F, agora v2.0) — a diferença é que agora tem valor próprio na v1.0, sem esperar a nuvem |
| ~~Emulador dedicado 1-click para os consoles que hoje só têm RetroArch~~ | G | **Substituído em 2026-08-03** pela decisão do [ADR 0012](decisoes/0012-empacotar-retroarch-e-cores.md) — em vez de um adapter dedicado por console, empacotar o RetroArch + cores selecionados dentro do próprio instalador do ZeuX. N64 continua com o `rmg` como adapter dedicado (não foi desfeito), mas os outros 23 consoles vão pelo empacotamento, não por pesquisa individual |
| **Implementar o ADR 0012**: empacotar RetroArch + cores no instalador | G | [ADR 0012](decisoes/0012-empacotar-retroarch-e-cores.md) — download dos 20 cores **desbloqueado em 2026-08-04**, `npm run tauri build` de ponta a ponta **confirmado em 2026-08-04** (Linux: `.deb`/`.rpm`/`.AppImage`, 20 cores e sidecar `zeuxd` verificados dentro do pacote), ver detalhe abaixo. Falta: confirmar em Windows/macOS e testar a instalação de verdade (o RetroArch empacotado achar os cores sem baixar nada na primeira execução) |

**Download dos cores do RetroArch desbloqueado em 2026-08-04 — dois bugs reais
achados e corrigidos, verificados pelo Douglas numa máquina com acesso ao
buildbot** (este ambiente de sessão de IA segue sem acesso ao
`buildbot.libretro.com` por política de rede — o mesmo bloqueio que motivou
registrar este item como "bloqueado" na Sprint C original):

1. **URL errada.** `scripts/download-retroarch-cores.mjs` montava
   `.../latest/<plataforma>/cores/<arquivo>` — devolvia `404` nos 20 cores.
   A estrutura real do buildbot é `.../nightly/<plataforma>/latest/<arquivo>`
   ("nightly" fixo antes da plataforma, "latest" só no fim, sem o segmento
   `/cores/`). Confirmado com `curl -I` batendo `200` antes de rodar o
   script inteiro.
2. **Uso errado da lib `unzipper`.** Depois da URL corrigida, os 20
   downloads funcionavam mas a extração falhava com `Extract.file is not a
   function` — `unzipper` não expõe esse método; a API certa pra abrir um
   `.zip` já em disco é `Open.file(caminho)`, que devolve uma Promise
   resolvendo num objeto com `.extract({ path })`. Validado localmente com
   um `.zip` de teste antes de pedir nova confirmação ao Douglas.

**Resultado, 2026-08-04, máquina real do Douglas: `20/20 sucesso`.** Os dois
bugs eram a causa raiz do bloqueio — não era rede além do que já se sabia
(este ambiente de sessão de IA não alcança o host; a máquina do Douglas
alcança normalmente).

**`npm run tauri build` de ponta a ponta, confirmado em 2026-08-04 (build
Linux local, sessão de IA):** rodou sem erros — os únicos ajustes necessários
foram de ambiente, não de código: instalar os pacotes de sistema que o Tauri
exige para compilar no Linux (`libwebkit2gtk-4.1-dev`,
`libjavascriptcoregtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`,
`librsvg2-dev`, `build-essential`, `libsoup-3.0-dev` — nenhum estava presente
neste ambiente). `download:retroarch-cores` tentou rebaixar os cores (rede
segue bloqueada nesta sessão de IA) mas não falhou o build, como já esperado
pelo próprio script — os 20 cores presentes em disco desde a etapa anterior
foram usados. Gerou os três formatos Linux: `.deb` (178M), `.rpm` (178M),
`.AppImage` (224M). Inspecionado com `dpkg-deb -c`: **os 20 cores e o sidecar
`zeuxd` estão de fato dentro do `.deb`**, em
`usr/lib/zeux/resources/retroarch/cores/`.

**Nota de tempo:** o empacotamento do `.rpm` sozinho levou ~26min neste
ambiente — o Tauri v2 comprime `.rpm` com uma lib Rust nativa (crate `rpm`,
sem depender de `rpmbuild` do sistema), e o core do MAME (415MB, o maior dos
20 de longe) domina esse tempo. Não é um problema de "rpmbuild ausente";
instalar o `rpmbuild` do sistema não mudaria nada, o binário não é chamado.

**Instalação de verdade confirmada em 2026-08-04 (máquina do Douglas,
Ubuntu):** `sudo apt install` no `.deb` gerado acima instalou sem erro
(`/usr/bin/zeux` + `/usr/bin/zeuxd`). Abrindo o app: `zeuxd` sobe como sidecar
em `127.0.0.1:7777`, `GET /health` responde `{"consoles":33,...,"status":"ok"}`,
e a tela mostra o resumo do scan de hardware real (Ryzen 9 7900X, RTX 3060 Ti,
30.4GB RAM) com pareceres por console — onboarding, consentimento, scan e
motor de parecer funcionando a partir do pacote instalado, não de ambiente de
dev.

**O que ainda falta:**
- [x] Confirmar que `bundledCoreDirs()` acha os cores certos sem o RetroArch
      precisar baixar nada **ao abrir um jogo de verdade** — **confirmado
      pelo Douglas em 2026-08-05, lançando jogos de 3 consoles diferentes via
      RetroArch**, sem download nenhum no meio.
- [x] Repetir a confirmação em Windows — **confirmado pelo Douglas em
      2026-08-05: compilou de verdade no Windows.** macOS fica para depois,
      por decisão do Douglas ("vai ser um dos últimos para teste") — não
      bloqueia a v1.0 sozinho, ver B11.

**Lacuna real achada e corrigida em 2026-08-04: o ADR 0012 nunca empacotou o
executável do RetroArch, só os cores.** Testando o `.deb` instalado de
verdade, a tela de Emuladores mostrava "RetroArch não instalado" mesmo com os
20 cores dentro do pacote — `Locate()` nunca teve um lugar bundled para
procurar o binário (só os cores tinham `bundledCoreDirs()`). Detalhe completo
em `docs/adr-0012-implementation.md`, Etapa 5, e no ADR 0012 atualizado.
Resumo do que mudou:

- Novo comando `cmd/download-retroarch-app`, chamado por
  `npm run download:retroarch-app` (encadeado em `build:daemon`), baixa o app
  do RetroArch do buildbot **de verdade** (esta sessão teve acesso pontual ao
  host, confirmado com `curl`) e extrai só o necessário: no Linux, um único
  AppImage autocontido (~11MB); no Windows, `retroarch.exe` + ~65 DLLs
  (~147MB) — sem elas o executável não abre. Extração em Go puro
  (`github.com/bodgit/sevenzip`, já usado pelo projeto), sem dependência nova
  nem binário `7z` de sistema.
- `internal/emulator/bundled_retroarch.go` copia isso para o mesmo diretório
  gerenciado que uma instalação 1-click usaria — **nenhuma mudança em
  `retroArchAdapter.Locate()`** foi necessária, `findBinary` já sabia
  procurar lá (inclusive com detecção de `*.AppImage` único).
  `cmd/zeuxd/main.go` chama isso cedo, antes de qualquer requisição a
  `/emulators`.
- `internal/install/sources.go`: novo `KindBundled`; a entrada do RetroArch
  em `sources.json` deixou de ser `"kind": "manual"` (texto do buildbot,
  desatualizado) e virou `"kind": "bundled"`.
- **macOS ficou de fora por decisão explícita**, não esquecimento: o buildbot
  distribui o app do RetroArch para macOS como `.dmg`
  (confirmado com `curl`), não `.7z`, e montar um `.dmg` não tem rota simples
  em Go puro.
- Verificado nesta sessão: `go build`/`go vet`/`go test ./...` verdes
  (compilação cruzada Windows/macOS incluída), e o AppImage extraído
  **roda de verdade** (`--version` devolveu
  `RetroArch - Frontend for libretro / Version: 1.22.2`).
- **Ainda falta:** lançar um jogo de verdade pelo RetroArch bundled (cai
  dentro do D11); macOS; trocar o alias móvel `RetroArch.7z` por uma versão
  datada fixa quando o Douglas cortar uma versão do ZeuX (ADR 0012 pede
  versão pinada, não "sempre a mais nova").

**Bug real achado e corrigido em 2026-08-04, instalando o `.deb` de
verdade:** a tela de Emuladores continuava mostrando "não instalado" mesmo
depois do RetroArch empacotado — `ZEUX_BUNDLED_RETROARCH_DIR` (e
`ZEUX_BUNDLED_CORES_DIR`, mesmo bug, nunca percebido porque só roda na hora de
lançar um jogo) apontava para `<resource_dir>/retroarch/...`, mas
`"resources": ["resources/"]` em `tauri.conf.json` preserva o nome da pasta —
os arquivos ficam em `<resource_dir>/resources/retroarch/...`. Faltava o
segmento `resources/` em `src-tauri/src/lib.rs`. Achado comparando a env var
de um processo `zeuxd` real (`/proc/<pid>/environ`) contra o caminho real dos
arquivos instalados — confirmado com `installed: true, managed: true` em
`GET /emulators` depois da correção, e visualmente na tela.

**Armadilha própria desta sessão, registrada para não repetir:** ao testar a
correção acima, compilei só `cargo build --release` manualmente (sem passar
pelo `npm run tauri build`) para ser mais rápido que refazer o instalador
inteiro. O binário resultante ficou com `http://localhost:1420` (URL de
desenvolvimento) embutido em vez do frontend empacotado — o `tauri build`
seta variáveis de ambiente que fazem essa diferença, e pular esse comando
quebra o app mesmo com o binário "funcionando". Lição: nunca substituir
`/usr/bin/zeux` por um `cargo build` avulso; sempre pelo `tauri build`
(pode-se restringir a `--bundles deb` para ser mais rápido em teste local —
~2min contra ~26min do `.rpm`).

**Lacuna real achada testando um jogo de GB de verdade (2026-08-04):**
autoconfiguração (clicar "Jogar" sem escolher opções) usa o core do tier
"ótimo" do catálogo — que para GB/GBC recomenda `sameboy`, não `gambatte`
(o default/empacotado). Hardware bom o bastante para esse tier recebia
"instale pelo Online Updater" em vez de simplesmente jogar — pior experiência
que hardware mediano. Achados 4 cores nessa situação (recomendados por algum
tier do catálogo, mas fora da lista original de 20): `sameboy` (GB/GBC
ótimo), `bsnes` (SNES ótimo), `parallel n64` (N64 ótimo), `yabause` (Saturn,
tier de fallback). Os 4 confirmados existentes no buildbot com `curl`,
adicionados a `scripts/download-retroarch-cores.mjs` e ao ADR 0012 — lista
passou de 20 para 24 cores (~cresce o instalador em alguns MB por core;
não medido o total ainda).

**Segundo bug real de caminho, mais antigo que os de cima — achado só ao
lançar o jogo de GB de verdade (2026-08-04):** mesmo com o AppImage do
RetroArch reconhecido e os 24 cores presentes no pacote, o lançamento
continuava falhando com "core não encontrado". Causa: `ensureBundledCoresAvailable`
(`internal/emulator/bundled_cores.go`) fazia `filepath.Join(bundledDir,
"retroarch", "cores")` em cima de uma `ZEUX_BUNDLED_CORES_DIR` que **já**
apontava para a pasta de cores — produzindo um caminho duplicado
(`.../resources/retroarch/cores/retroarch/cores`) que nunca existiu. Esse bug
é anterior à sessão de hoje: existia desde a implementação original do ADR
0012, invisível porque o erro só virava log de aviso, nunca travava o
daemon — e ninguém tinha lançado um jogo de verdade usando os cores bundled
até agora. Corrigido removendo o join duplicado; cobrido por
`internal/emulator/bundled_cores_test.go` (não existia teste nenhum para essa
função antes). **Confirmado pelo Douglas: os 3 testes passaram** — RetroArch
"instalado pelo ZeuX", jogo de GB abre com o core `sameboy`.

**Nova rota `GET /api/v1/retroarch/cores` e botão "Ver cores" (2026-08-04):**
depois do bug acima, ficou claro que não havia nenhuma forma de ver quais
cores estavam de fato instalados sem tentar lançar um jogo e torcer. Nova
rota lista todo core conhecido (`internal/emulator/retroarch.go`,
`RetroArchCoreStatus`) com `installed`/`path`; a tela de Emuladores ganhou um
botão "Ver cores" na linha do RetroArch que mostra a lista com o que falta.

**Quinto core extra achado pelo próprio Douglas usando a tela nova
(2026-08-04):** `swanstation` aparecia "faltando" mesmo depois dos 4 cores
acima — ele não é recomendado por nenhum tier do catálogo (só está em
`retroArchCores` como um core que o ZeuX sabe resolver se alguém pedir
explicitamente), mas como a rota nova lista *todo* core conhecido, ele
aparecia permanentemente ausente sem nenhuma ação possível. Empacotado
também, por consistência — lista foi de 24 para 25 cores.

**Gerenciar/remover emuladores instalados, exceto RetroArch (2026-08-04):**
o backend já tinha `DELETE /api/v1/emulators/{id}/install`
(`internal/install/manager.go Uninstall`) desde antes, mas a tela nunca
oferecia botão nenhum para removê-los. Adicionado botão "Remover" (com
confirmação, mesmo padrão do fluxo de instalação) para emuladores instalados
pelo ZeuX. **RetroArch nunca aparece removível**: além de a UI esconder o
botão, `Manager.Uninstall` agora recusa explicitamente qualquer fonte
`KindBundled` (defesa em profundidade — vale mesmo se a rota for chamada
direto). Os cores nunca passavam por `Uninstall` de qualquer forma — vivem
numa pasta separada (`bundledCoreDirsForWrite()`), fora da árvore que
`Uninstall` resolve.

**Seletor nativo de pasta na tela de Biblioteca (2026-08-04):** o campo de
"apontar pasta" exigia digitar o caminho à mão — o próprio código já
registrava isso como decisão pendente. Adicionado `@tauri-apps/plugin-dialog`
(npm) + `tauri-plugin-dialog` (crate Rust) + permissão `dialog:allow-open`.
Botão "Escolher pasta" abre o diálogo nativo, preenche o campo (que continua
editável). Backend não mudou.

**Windows e macOS: código deveria funcionar, não foi testado rodando.**
Tudo confirmado nesta sessão foi Linux local, de ponta a ponta (build,
instalação, abertura, os 3 testes acima). Para Windows: a estrutura real do
pacote do buildbot foi inspecionada de verdade (baixado e listado —
`retroarch.exe` + ~65 DLLs, ~147MB — o código já copia tudo, não só o
`.exe`), e as correções de hoje são todas Go/Rust multiplataforma, sem nada
específico de SO — mas ninguém rodou `npm run tauri build` numa máquina
Windows real, nem os workflows `build-windows.yml`/`release.yml` desde essas
mudanças. Para macOS: os cores baixam normalmente, mas **o binário do
RetroArch em si não é empacotado** — decisão deliberada (buildbot distribui
`.dmg`, sem rota simples em Go puro), documentada no ADR 0012; no Mac, o
RetroArch segue pedindo instalação manual como antes desta sessão.
**Próximo passo sugerido:** `gh workflow run build-windows.yml` (ou
`build-macos.yml`) na branch atual, via `workflow_dispatch` — não precisa
mesclar na main para gerar um instalador de teste real.

**Seletor nativo de pasta na tela de Biblioteca (2026-08-04):** o campo de
"apontar pasta" exigia digitar o caminho à mão — o próprio código já
registrava isso como decisão pendente (`src/screens/LibraryScreen.tsx`,
comentário citando que `@tauri-apps/plugin-dialog` era "fora do escopo" até
uma decisão explícita). Adicionado `@tauri-apps/plugin-dialog` (npm) +
`tauri-plugin-dialog` (crate Rust) + permissão `dialog:allow-open` em
`src-tauri/capabilities/default.json`. Um botão "Escolher pasta" abre o
diálogo nativo do SO e preenche o campo de texto, que continua editável
(colar/ajustar manualmente ainda funciona). Backend não mudou — já aceitava
caminho absoluto, que é o que o diálogo nativo devolve.

**Build do instalador Windows via GitHub Actions (2026-08-02):**
`.github/workflows/build-windows.yml` roda num runner `windows-latest` (que já
tem toolchain nativa) a cada push em `src/`, `src-tauri/`, `internal/`,
`cmd/` ou dependências, e também sob demanda (`workflow_dispatch`). Instala
Go, Node e Rust no runner, roda `npm run tauri build` (que já dispara
`build:daemon` via `beforeBuildCommand`) e publica o `.msi`/`.exe` gerado como
artifact do run. Existe justamente para não depender de instalar Rust/MSVC na
máquina Windows do Douglas — ADR 0004 segue adiada, o instalador de teste sai
da nuvem. **Sem assinatura de código**: o instalador vai disparar o aviso do
SmartScreen até isso ser resolvido separadamente (custo de certificado, fora
de escopo por ora).

**Nota sobre os testes de `internal/api` e `internal/consent` (2026-08-01):**
cobrem consentimento (persistência, revogação, versão de política, arquivo
corrompido), o ciclo completo de scan (bloqueio sem consentimento, scan,
leitura, limpeza ao revogar) e as rotas de lançamento e emuladores
personalizados, todos via `httptest` sem tocar hardware real — o `Probe` já
era interface, e `consent.Store`/`emulator.CustomStore` foram isolados do
disco do usuário via `XDG_CONFIG_HOME`/`AppData` apontando para um diretório
temporário do teste.

**Corrigido em 2026-08-02:** `TestExtractZipRecognizesBackslashDirectoryMarker`
falhava neste ambiente (Linux) desde antes desta sessão. Causa real: `safeJoin`
(`internal/install/extract.go`) usava `filepath.FromSlash`, que só normaliza
`/` — em Linux/macOS, `\` não é separador nenhum, então uma entrada como
`plugins\generic\qt.dll` virava um único nome de arquivo com barras invertidas
literais, em vez de duas pastas. Corrigido trocando `\` por `/` explicitamente
antes de `filepath.Clean`, independente do SO em que a extração roda — os
pacotes vêm de builds Windows mesmo quando o ZeuX está rodando em Linux/macOS.

**Prompt de atalho de launcher do DuckStation suprimido (2026-08-04):**
diferente do assistente de configuração (D8, já suprimido), a primeira
execução do DuckStation como AppImage no Linux mostra um segundo diálogo:
"Would you like to create a launcher shortcut?" — achado pelo Douglas
incomodando de verdade. Causa raiz confirmada lendo o código-fonte real do
DuckStation (`src/duckstation-qt/qthost.cpp`, `QtHost::CheckDesktopFile`): só
dispara quando a variável de ambiente `APPIMAGE` existe (ou seja, sempre que
o ZeuX instala via AppImage), e é suprimido gravando `NoDesktopFile = true`
em `[Main]` — a mesma chave que o próprio DuckStation grava se o usuário
marcar "Don't ask again". `seedDuckStationPortable`
(`internal/install/firstrun.go`) agora grava essa chave junto com
`SetupWizardIncomplete = false` em toda instalação nova. Instalação já
existente do Douglas recebeu a chave manualmente (o seed nunca sobrescreve um
`settings.ini` já existente, de propósito — instalações anteriores a esta
correção precisam da mesma edição manual, ou clicar "Don't ask again" uma
vez).

**Botão "Abrir pasta do BIOS" — só onde verificado ao vivo (2026-08-04):**
o Douglas pediu um botão que leva direto à pasta certa, para todo console que
exige BIOS. Nova função `BiosDir` (`internal/emulator/bios_dir.go`), exposta
como `bios_dir` em `GET /api/v1/emulators`, devolve um caminho **só** quando
alguém já testou de verdade onde aquele emulador específico lê o arquivo —
nunca um palpite por convenção. Cobertura desta sessão:

- **PS1 (DuckStation):** `<pasta onde o ZeuX instalou>/bios/` — só quando
  `Managed` (instalação de terceiros pode não estar em modo portátil).
- **PS2 (PCSX2): achado um bug real do próprio PCSX2**, não do ZeuX. Mesmo
  com `portable.txt` presente no diretório certo e a variável `$APPIMAGE`
  corretamente setada pelo processo de bootstrap do AppImage, o binário real
  do PCSX2 (rodando dentro do squashfs montado) **não herda essa variável**
  — confirmado lendo `/proc/<pid>/environ` do processo real, não do
  bootstrap. Resultado: o PCSX2 sempre grava/lê de
  `~/.config/PCSX2/` (Linux), nunca da pasta gerenciada pelo ZeuX,
  independente de `Managed`. `BiosDir` aponta para onde ele **realmente**
  olha (o diretório global), não para onde "deveria" olhar — apontar errado
  seria pior que não apontar. Não investigado mais a fundo porque exigiria
  apagar a configuração global real do PCSX2 do Douglas (onde está o BIOS
  dele) para testar do zero — decisão que não é da sessão de IA tomar
  sozinha. Só verificado no Linux; Windows usa outra convenção (Documentos,
  não AppData) nunca confirmada.
- **PS3 (RPCS3): sem botão, de propósito.** Lendo o código-fonte real do
  RPCS3 (`main_window::InstallPup`), o firmware (`PS3UPDAT.PUP`) não é
  "colocado numa pasta" — é processado pelo próprio instalador do RPCS3
  (`Arquivo → Install Firmware`), que abre um diálogo de arquivo e
  extrai/decifra internamente. Não existe pasta correta para apontar; o
  aviso genérico já existente ("confira essa configuração diretamente no
  emulador") continua sendo a orientação certa.
- **PS4: não existe no catálogo do ZeuX** — nenhum console, nenhum adapter.
  Pedido pelo Douglas junto com PS1/PS2/PS3, mas não há nada para apontar
  porque a funcionalidade em si não existe ainda.

Implementação: `Callout` de "Dependência externa" em `GamesScreen.tsx` ganhou
um botão "Abrir pasta do BIOS" condicional a `bios_dir` estar presente —
usa `openPath` de `@tauri-apps/plugin-opener` (já instalado, só faltava a
permissão `opener:allow-open-path`, adicionada a `capabilities/default.json`).
`BiosDir` cria a pasta se ainda não existir (best-effort), para que o botão
sempre tenha algo para abrir mesmo num emulador que nunca rodou.

**Efeito colateral corrigido:** `TestRetroArchFailsWithCoreNameWhenCoreMissing`
(pré-existente, não escrito nesta sessão) nunca isolava `HOME` — passou a
falhar de propósito errado nesta máquina porque a sessão de hoje baixou e
copiou cores de verdade para `~/.local/share/zeux/retroarch/cores/` (efeito
colateral do próprio trabalho de bundling). Corrigido isolando `HOME` no
teste, mesmo padrão já usado em todo o resto do pacote.

**Bug real do próprio Tauri achado testando o botão "Abrir pasta do BIOS"
(2026-08-04):** o primeiro clique falhou com "Not allowed to open path". A
permissão `opener:allow-open-path` sozinha não basta — o plugin também exige
um escopo de caminhos explícito (`scope.is_path_allowed`, lido no
código-fonte real do `tauri-plugin-opener`), e sem nenhuma entrada de escopo
a checagem recusa **todo** caminho por padrão (a descrição da permissão,
"without any pre-configured scope", engana: significa que a permissão não
vem com escopo pronto, não que dispensa escopo). Primeira tentativa de
correção (`{"path": "$HOME/**"}`) ainda falhou pelo mesmo motivo — glob
patterns não cobrem componentes de caminho que começam com ponto
(`.config`) por padrão, mesmo motivo de `ls *` não mostrar dotfiles.
Corrigido com `{"path": "$HOME/.config/**"}`, que inclui o componente
literal.

**Botão "Jogar" com pasta de BIOS vazia agora confirma antes (2026-08-04):**
o Douglas notou que o botão continuava ativo mesmo com a pasta de BIOS vazia
— diferente de hardware fraco (que pode rodar mal, mas roda), sem BIOS o
jogo nunca abre. Novo campo `bios_dir_empty` em `GET /api/v1/emulators`
(`internal/emulator/registry.go`, `os.ReadDir` sobre `BiosDir`); clicar
"Jogar" nessa condição mostra confirmação com "Jogar mesmo assim"/"Abrir
pasta do BIOS"/"Cancelar", mesmo padrão já usado para hardware insuficiente.

**Modal de erro de lançamento (2026-08-04):** erro de lançar um jogo
aparecia como texto discreto na linha do jogo — fácil de não perceber. Novo
componente `ErrorModal` (`src/components/ui.tsx`), usado em `GamesScreen`
para qualquer falha de `POST /games/launch`, com a mensagem completa do
servidor (nunca reescrita).

---

## Sequência recomendada

```mermaid
graph LR
    subgraph v1["v1.0 — tudo local, sem conta e sem nuvem"]
        direction LR
        A["Sprint A<br/>Validar adapters<br/>(feita)"] --> B["Sprint B<br/>Tauri + UI<br/>(feita)"]
        A --> C["Sprint C<br/>Instalação 1-click<br/>(feita)"]
        B --> C
        B --> D["Sprint D<br/>Biblioteca + banco<br/>(feita)"]
        C --> D
        D --> G["Sprint G<br/>Biblioteca visual:<br/>capas + favoritos"]
        D --> H["Sprint H<br/>Config do emulador<br/>+ controles"]
        D --> I["Sprint I<br/>Emulador manual<br/>+ buscas"]
    end

    subgraph v2["v2.0 — exige backend na nuvem e identidade"]
        direction LR
        E["Sprint E<br/>Perfil + social"] --> F["Sprint F<br/>Compatibilidade<br/>+ compartilhamento"]
    end

    G --> E
    H --> E
    I --> E

    Design["Design: reduzir gaps e estranheza<br/>(contínuo, atravessa toda sprint)"] -.-> v1
    D2["D2 — calibrar limiares<br/>(depende da Sprint F, ou seja: v2.0)"] -.-> F
```

A Sprint A veio primeiro porque era a única que podia invalidar código já
escrito. **G, H e I não dependem umas das outras** — são paralelizáveis, e a
ordem entre elas é escolha de prioridade, não de dependência técnica.

Duas coisas no diagrama são pontilhadas de propósito, porque não são sprints:

- **Design** é contínuo, sem critério de saída — ver a seção de princípio
  contínuo acima. Ele atravessa G, H e I em vez de vir antes ou depois.
- **D2** deixou de apontar para a Sprint D e passou a apontar para a F: a
  calibração agora depende do relato de compatibilidade da comunidade, que é
  v2.0. **A v1.0 sai sem os limiares calibrados**, e isso está declarado.

**O diagrama mente em um ponto, e é de propósito que fica escrito aqui:** as
Sprints B, C e D avançaram sem a Sprint A ter fechado — o D11 (abrir uma ROM de
verdade) continua aberto e só o Douglas pode fechá-lo. Enquanto ele estiver
aberto, tudo que veio depois está construído sobre uma suposição não verificada:
a de que o `POST /games/launch` realmente abre um jogo.

**Próximo passo recomendado (2026-08-03): D11.** Não é o item maior nem o mais
empolgante — é o único que muda o significado de todo o resto. Ele custa uma
tarde do Douglas com jogos que ele já tem, e nenhuma sessão de IA pode fazê-lo
no lugar dele. Se a Sprint D inteira for construída antes e o D11 revelar que
algum adapter não abre o jogo, o retrabalho cai justamente sobre a tela que
acabou de ser feita. Depois dele, a ordem é L1 → L2 → L5 → L6 → L7, que é o
caminho mais curto até o critério de saída da Sprint D.
*(D11 foi fechado em 2026-08-04 — parágrafo mantido como registro do raciocínio
da época, não como recomendação vigente.)*

**Próximo passo recomendado (2026-08-04): o I1 — tela de emulador manual.**

Recomendo um, não um menu, e o motivo é a ordem de prioridade deste documento:
dívida de promessa descoberta vem antes de funcionalidade nova. O I1 é o caso
mais puro disso no backlog hoje — **o produto tem a funcionalidade inteira
construída, testada e documentada em `api.md`, e o usuário não tem como
alcançá-la.** Backend pronto, tipos prontos, cliente pronto, zero tela. Custa
menos que qualquer item de G ou H e fecha uma lacuna que hoje é invisível para
quem lê o roadmap e visível para quem usa o app.

Depois dele, a ordem que eu defenderia é **G4 (favoritar) → I2 (busca) → G1
(capas) → Sprint H**, e a razão de G1 não vir antes é que **ele está bloqueado
por uma decisão sua**, não por trabalho: IGDB ou ScreenScraper, e quem carrega a
credencial. Enquanto essa resposta não existir, começar o G1 é escolher por
tentativa.

A Sprint H vem por último entre as três não porque vale menos — ela é o pedido
mais ambicioso da lista — mas porque é a única cujo **desenho ainda pode estar
errado**: a ambiguidade de "configurar por dentro do jogo" (tela do ZeuX ×
overlay durante a partida) muda a sprint inteira, e resolver isso custa uma
frase agora contra uma sprint depois.
