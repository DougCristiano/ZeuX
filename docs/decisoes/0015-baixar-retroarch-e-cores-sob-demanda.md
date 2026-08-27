# 0015 — Baixar o RetroArch e os cores sob demanda, com hash fixado

**Status:** Aceito · substitui [0012](0012-empacotar-retroarch-e-cores.md) ·
implementação R1–R4 completa em 2026-08-27 ([roadmap](../roadmap.md), Sprint
C) — resta a verificação de rede/build numa máquina com acesso real ao
buildbot e ao ambiente Tauri, pendente do Douglas

## Contexto

O [ADR 0012](0012-empacotar-retroarch-e-cores.md) decidiu empacotar uma versão
fixa do RetroArch e 25 cores dentro do próprio instalador do ZeuX. Essa decisão
**foi implementada e funciona**: o Douglas confirmou em 2026-08-05, numa máquina
real, lançando jogos de 3 consoles diferentes pelo RetroArch bundled, sem
nenhum download no meio. Não estamos revertendo algo que falhou.

Em 2026-08-26 o Douglas trouxe uma especificação externa ("Retro-Steam
Frontend") e decidiu adotar o modelo da seção 3 dela: **nada de runner dentro
do instalador; tudo baixado na primeira vez que for preciso**. A motivação é de
produto — instalador pequeno, zero fricção para quem baixa o ZeuX e só quer ver
a tela — e é decisão do dono do produto, não uma conclusão técnica desta ADR.

O que o modelo empacotado cobrava, e ficou medido no roadmap:

- `.deb` de **178 MB**, `.rpm` de **178 MB**, `.AppImage` de **224 MB** — o core
  do MAME sozinho tem **415 MB** antes da compressão e domina o número.
- **~26 min** só para comprimir o `.rpm` no build, dominados pelo mesmo core.
- Atualizar o RetroArch ou um core exige **cortar uma versão nova do ZeuX**.
- Todo usuário carrega os 25 cores, inclusive os 24 consoles que ele nunca vai
  abrir.

O que o modelo empacotado **entregava de verdade**, e que se perde aqui: o
primeiro jogo abre **sem rede**. Isso está registrado nas consequências
negativas abaixo, não escondido.

## Decisão

**O RetroArch e os cores libretro passam a ser baixados sob demanda, em tempo
de execução, pelo próprio `zeuxd` (Go).** O núcleo continua em Go — o
[ADR 0004](0004-adiar-rust-e-tauri.md) não foi reaberto e nada aqui pede Rust.

Fluxo, no momento em que o usuário manda abrir um jogo de um console atendido
pelo RetroArch:

1. O backend verifica se o binário do RetroArch e o core exigido já existem no
   diretório gerenciado (`ManagedRoot()`, ver
   [ADR 0010](0010-estrutura-de-diretorios-por-console.md) — em Windows isso cai
   sob `AppData/Local/ZeuX/`, e o equivalente por SO nos demais).
2. Se algum estiver ausente, o backend baixa do `buildbot.libretro.com`.
3. **Valida o SHA256 contra um valor fixado**, extrai para um diretório de
   trabalho e promove com `rename` — exatamente o mecanismo atômico que
   `internal/install/manager.go` já usa para os outros 13 emuladores.
4. O progresso é reportado como **um job**, do mesmo jeito que a instalação
   1-click já faz: a resposta traz um `id` e o frontend consulta
   `GET /api/v1/installs/{id}`. **Sem SSE e sem WebSocket** — o projeto não tem
   nenhum dos dois hoje (`grep -rn "text/event-stream" internal/ src/` devolve
   vazio), e introduzir um transporte novo para reaproveitar um painel de
   progresso que já existe seria a solução maior para o mesmo problema.

**De onde vem o hash — e a parte honesta desta decisão.** O buildbot do libretro
não é o GitHub Releases: `fetchChecksum` (`internal/install/download.go`) hoje
espera um arquivo `.sha256` ao lado do pacote, e **ninguém verificou se o
buildbot publica isso por core** — este ambiente não alcança o host
(`gateway answered 403 to CONNECT (policy denial)`, o mesmo bloqueio registrado
desde 2026-08-02). Então a decisão é a que não depende dessa resposta:

- O ZeuX carrega um **manifesto embutido** (`//go:embed`, mesmo espírito de
  `internal/install/data/sources.json`) com **URL e SHA256 fixados por core e
  pelo app**, gerado quando o Douglas corta uma versão do ZeuX.
- Hash divergente **recusa a instalação**, com erro nomeado dizendo qual core e
  o que aconteceu. Aqui **não** vale "informar, não bloquear": esse princípio
  existe para o parecer de hardware, onde quem decide o risco é o usuário. Um
  binário que não bate com o hash esperado não é uma escolha de gosto — é um
  arquivo que não é o que o ZeuX pensou que era.
- Se o buildbot **de fato** publicar hash oficial por core, o manifesto pode
  deixar de ser fixado e passar a conferir contra ele. Isso é trabalho de
  verificação, não de decisão — está no roadmap (R1), não aqui.

**macOS continua fora, e a mudança de modelo não conserta isso.** O buildbot
distribui o app do RetroArch para macOS como `.dmg` (confirmado com `curl` em
2026-08-04), e montar um `.dmg` não tem rota simples em Go puro. Baixar sob
demanda não muda o formato do arquivo. No Mac, o RetroArch segue pedindo
instalação manual — os cores, esses sim, baixam normalmente.

**Nada disto toca ROM.** O que é baixado é emulador e core, software livre, dos
servidores do próprio projeto que os publica. O ZeuX segue sem obter,
referenciar ou transferir jogo — e o `allowedHosts` de
`internal/install/download.go` continua sendo a trava estrutural disso: um host
novo precisa ser adicionado no código para sequer ser alcançável.

## Consequências

**Positivas**

- Instalador volta ao tamanho de antes do ADR 0012 — os 415 MB do MAME saem de
  dentro do pacote de todo mundo, e o build deixa de gastar ~26 min comprimindo
  o `.rpm`.
- O usuário baixa só o core do console que ele realmente usa.
- Atualizar um core deixa de exigir uma versão nova do ZeuX: basta o manifesto
  apontar para outro build.
- Reaproveita quase tudo que já existe — `download.go` (com progresso e SHA256),
  `extract.go`, `promote`, o job e a rota `GET /installs/{id}`. O trabalho novo
  é o resolvedor de URL do buildbot e o gatilho no "Jogar".

**Negativas / custos aceitos**

- **O primeiro jogo de cada console passa a exigir rede.** É a regressão mais
  visível e a que o ADR 0012 comprava. Precisa aparecer na tela como espera
  explicada ("baixando o core X"), nunca como um botão "Jogar" que demora e não
  diz por quê.
- **O ZeuX volta a depender da estrutura do buildbot, que muda sem aviso.** Isso
  não é hipótese: em 2026-08-04 dois bugs reais nasceram exatamente daí — a URL
  montada como `.../latest/<plataforma>/cores/<arquivo>` devolvia `404` nos 20
  cores (a estrutura real é `.../nightly/<plataforma>/latest/<arquivo>`), e a
  extração quebrou por uso errado da lib de descompactação. O próprio ADR 0012
  citou essa instabilidade como motivo para empacotar. **Aceitamos o custo de
  volta, com os olhos abertos**: quando o buildbot mexer na estrutura, o
  download quebra para todo usuário instalado, não só para quem for atualizar.
- **Não dá para verificar isto em sessão de IA.** O host segue bloqueado por
  política de rede neste ambiente. Todo item de roadmap derivado desta ADR
  precisa ser fechado na máquina do Douglas, e isso está escrito em cada um
  deles.
- **Trabalho já feito e verificado é aposentado**: `scripts/download-retroarch-cores.mjs`,
  `cmd/download-retroarch-app`, `internal/emulator/bundled_cores.go`,
  `internal/emulator/bundled_retroarch.go`, `KindBundled` em `sources.go` e as
  variáveis `ZEUX_BUNDLED_*` em `src-tauri/src/lib.rs`. Parte dos scripts pode
  ser reaproveitada para **gerar o manifesto de hashes** em vez de empacotar —
  é a única peça com sobrevida óbvia.
- **`Manager.Uninstall` precisa voltar a aceitar o RetroArch.** Hoje ele recusa
  explicitamente qualquer fonte `KindBundled`, defesa que existia porque apagar
  o bundled deixaria o app sem como recuperá-lo. Com download sob demanda, o
  usuário pode remover e reinstalar — a defesa deixa de fazer sentido.
- **`Installation.Version` continua sem ser preenchido**, e aqui isso pesa
  diferente do ADR 0012: lá a versão era fixa e conhecida por construção; aqui
  cada máquina pode acabar com um build de core diferente, e "rodou bem na
  versão X" (Sprint F) precisa saber qual é X.

## Gatilho para revisão

Reabrir — provavelmente voltando ao empacotamento, que continua descrito e
implementável no [ADR 0012](0012-empacotar-retroarch-e-cores.md) — se
acontecer qualquer um destes:

1. A estrutura do buildbot mudar mais de uma vez e quebrar o download de
   usuários já instalados.
2. A taxa de falha do primeiro lançamento (baixar core → abrir jogo) medida em
   uso real for alta o bastante para que "instalei o ZeuX e não consegui jogar"
   vire relato comum.
3. Aparecer um espelho ou release estável com estrutura previsível — nesse caso
   não se volta ao empacotamento, se troca a origem.
