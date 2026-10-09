# Decisões técnicas

Log cronológico de decisões não-óbvias — o que foi decidido, por quê, e o
que quebra se alguém desfizer sem saber o motivo. Substitui o antigo formato
de "um arquivo por decisão" (ADR): mesmo conteúdo, sem a cerimônia de
navegar 15 arquivos numerados para achar uma linha de contexto.

**O que entra aqui:** uma escolha técnica que custou pensar, que alguém
poderia razoavelmente reverter sem saber por quê, ou que já foi tentada de
outro jeito e descartada. **O que não entra:** decisão óbvia ou que o código
já autoexplica.

Datado quando a data é conhecida com certeza; entradas mais antigas (de
antes desta reescrita, 2026-09-07) que não têm data confirmada aparecem sem
data, na ordem aproximada em que a arquitetura sugere que aconteceram.

---

### IPC via HTTP local, não sidecar stdin/stdout

O Tauri oferece um modelo de "sidecar" onde o binário Go conversaria com o
front-end por stdin/stdout. Descartado: com HTTP em `127.0.0.1:7777`
qualquer rota é exercitável com `curl`/`Invoke-RestMethod`, sem UI nenhuma —
isso permitiu construir e testar o daemon inteiro antes de existir uma linha
de React.

**O que quebra se desfizer:** perde a capacidade de testar/depurar o núcleo
sem subir a interface — o modo de trabalho que o projeto inteiro foi
construído em cima de.

**Custo aceito:** uma porta local aberta. Mitigado com bind travado em
`127.0.0.1` por padrão.

### Banco de dados adiado, depois revertido para SQLite local

Decisão original: adiar qualquer banco, guardar tudo em JSON simples
(`consent.json`, etc.) enquanto o escopo era pequeno. Revertida em
**2026-08-02**, quando a biblioteca de jogos (pastas, jogos, sessões)
cresceu o suficiente para precisar de algo com índice e migração real —
SQLite local, driver Go puro (`modernc.org/sqlite`, sem CGO), para não
comprometer a compilação cruzada `go build` simples em qualquer SO.

**O que quebra se desfizer:** sessões e biblioteca voltam a viver em memória
ou em JSON solto — sem sobreviver a reinício de forma confiável, sem índice.

**O que continua fora do banco, de propósito:** `consent.json` (pequeno,
versionado, já funciona), o catálogo de consoles (dado de leitura, embutido
no binário via `go:embed`) e `custom_emulators.json` (arquivo que o próprio
usuário pode preferir editar à mão).

### `BuildCommand` separado de `Launch`

`BuildCommand` é uma função pura: não toca disco, não executa nada, recebe
`Installation` + `Request`, devolve `Command`. `Launch` é o que de fato roda
o processo.

**O que quebra se desfizer:** sem essa separação, testar a tradução de
opções em argumentos exigiria abrir jogos de verdade — inviável numa máquina
de dev sem emulador instalado. Com ela, os adapters são testados sem nenhum
binário presente, e a rota de preview existe de graça (é `BuildCommand` sem
o `Launch`).

### Campo `Unapplied` em vez de inventar flag de linha de comando

Os emuladores divergem muito no que aceitam por linha de comando — o
Dolphin sobrescreve qualquer chave de INI com `-C`, o Flycast standalone
praticamente não aceita nada além do caminho do jogo. Inventar uma flag
inexistente faz o emulador **recusar abrir**.

Quando uma opção do preset não cabe na linha de comando, o adapter não a
aplica e declara em `Command.Unapplied`, com frase pronta ("A resolução
interna precisa ser ajustada dentro do DuckStation.").

**O que quebra se desfizer:** o usuário passaria a achar que o ZeuX aplicou
uma opção e ela simplesmente não funcionou, em vez de saber que precisa
ajustar dentro do próprio emulador.

### Preset em duas formas: texto e `options` estruturado

Cada patamar do catálogo carrega `preset` (prosa que o usuário lê) **e**
`options` (o mesmo preset em forma que o emulador obedece).

**O que quebra se desfizer:** um preset que só existisse como texto não
configuraria nada — e autoconfiguração é a promessa central do produto.

### Nintendo Switch fora do catálogo, de propósito (não esquecimento)

Yuzu e Ryujinx foram descontinuados após ação judicial. Sem emulador viável
e mantido, um console no catálogo sem adapter real seria promessa vazia.

**O que quebra se desfizer:** reabrir essa porta significa reavaliar risco
legal, não só "adicionar um adapter".

### Identidade visual por console: sigla estilizada — revertido em 2026-09-07

Até 2026-09-07, `ConsoleIcon` (sigla + gradiente de cor) era tratado como
solução definitiva, não placeholder — mesmo raciocínio do Switch: risco de
marca registrada de terceiro, decisão de não usar, não adiamento.

**Revertido nesta data, decisão explícita do Douglas**, ciente do risco de
marca (perguntado e confirmado antes de implementar): a tela de Consoles
passa a mostrar a imagem real de cada console — capa/embalagem oficial,
logo incluído — em vez da sigla genérica. `ConsoleIcon` não foi removido;
continua como reserva para quando a imagem real não existir em cache (sem
IGDB configurado, plataforma sem asset no IGDB, falha de rede).

**Risco aceito, não eliminado:** usar logo/embalagem oficial de
Sony/Nintendo/Sega/etc. é uso de marca registrada de terceiro. O Douglas
decidiu seguir mesmo assim. Se isso precisar ser revisto no futuro (ex.:
notificação de remoção, mudança de escopo do produto), a saída existente é
`ConsoleIcon`, que nunca foi apagado.

### Redesenho visual arcade/CRT (2026-09-07, v0.1.14)

Até esta data o app usava a mesma cor de acento (`--accent` roxo) e o mesmo
componente `Button variant="secondary"` para praticamente tudo — navegação,
ação primária, chrome de tela — sem hierarquia visual entre eles. O Douglas
testou o app ao vivo várias vezes nesta sessão e foi apontando o que
destoava; o resultado virou um vocabulário fechado, não um estilo solto por
tela:

- **`Button variant="chrome"`** (`ui.tsx`) para navegação/arquivo (voltar,
  abrir pasta, trocar visão, buscar capa) — `h-9`, `rounded-sm`, borda
  `1.5px`, `font-mono uppercase tracking-wider`, bisel via `shadow-[inset...]`,
  glow roxo no hover, `active:translate-y-px` (resposta de clique físico).
  `primary`/`danger` continuam reservados a ação sobre conteúdo (jogar,
  instalar, remover).
- **Cor por papel, sempre em repouso, nunca só no hover**: roxo = "aqui você
  age", ciano (`--accent-secondary`) = "aqui o sistema informa", vermelho =
  destrutivo. `CHROME_TINT_INFO`/`CHROME_TINT_DANGER` (`ui.tsx`) tingem um
  `chrome` sem reescrever a mesma string à mão em cada tela.
- **`h-9` como altura única de controle de barra/toolbar** — input, select,
  chips e botões de filtro mediam três ou quatro alturas diferentes por
  acidente; ver `FILTER_CHIP_BASE`/`ON`/`OFF` em `ConsolesScreen.tsx`.
- **Blur pesado (`blur-3xl`) em arte de fundo desfocada**, nunca sutil — um
  blur fraco (2px) numa capa em pé esticada numa faixa larga vira mancha
  turva, não lavagem de cor (achado testando a hero de "Continue jogando").
  Sempre acompanhado de tingimento na cor de identidade via
  `mix-blend-overlay`, pra garantir cor deliberada mesmo quando a paleta real
  da arte for neutra.
- **Logos oficiais de console com fundo branco** — a maioria foi desenhada
  pra selo/embalagem em fundo claro; sobre o `--fill` quase preto do tema a
  arte escura se perdia. `ConsoleIcon` (`ui.tsx`) tenta a logo real primeiro
  e cai pra sigla em fundo escuro no `onError` — sem depender de `has_image`
  do catálogo, então funciona em qualquer tela que use o componente.
- **Cards verticais/centralizados preferidos a fitas horizontais esticadas
  pela largura da janela** — uma fita de linha única com `flex-1` empurra o
  texto pra longe do botão em janela larga (`ScreenContainer` chega a
  2000px); um grid de cards mais estreitos e mais altos resolve o espaço
  morto sem inventar layout novo por tela.

**Telas cobertas nesta rodada:** splash de abertura (novo, só na primeira
execução via `localStorage`), Todos os jogos (+ faixa "Continue jogando"),
Pastas de jogos, Detalhe do jogo, Consoles + Detalhe do console, Jogos por
console, Emuladores. Nenhuma lógica de produto foi alterada — só
apresentação; toda regra de veredito/lançamento/instalação continua igual.

**O que ainda está no visual antigo:** ver `pendencias.md`, "Redesenho
visual — telas restantes".

**O que quebra se desfizer:** reintroduzir `secondary`/cor solta em telas já
migradas quebra a consistência que motivou o pedido — o achado original foi
justamente "os botões estão destoando".

### Redesenho arcade/CRT estendido às telas do início e a Configurações (2026-09-09)

A rodada de 2026-09-07 parou nas telas de biblioteca/consoles/emuladores. Esta
fechou o resto, sem inventar vocabulário novo — só aplicando o que `ui.tsx` e
`index.css` já expõem:

- **Telas de onboarding** (`ConsentScreen`, `DeclinedScreen`, `StatusScreen`):
  kicker monoespaçado em `--accent-secondary` (ciano = "aqui o sistema
  informa" — um pedido de consentimento e um estado de conexão são o sistema
  declarando algo, não o usuário agindo), linhas de CRT decorativas
  (`.zeux-scanlines`) a ~8% de tela cheia ou 60% recortadas no logo (mesmo uso
  do `SplashScreen`). Botões que não são ação-sobre-conteúdo ("Agora não",
  "Continuar sem autorizar", "Ver emuladores") desceram de `secondary` para
  `chrome`; só "Autorizar leitura"/"Autorizar agora" ficam em `primary`. O
  `ConsentScreen` continua exibindo o `policy_text` do servidor **literalmente**
  (princípio 1). `ErrorScreen` troca o `<p>` vermelho solto pelo `InlineError`
  do app.
- **`VerdictScreen`**: subtítulo no `ScreenHeader` + `SectionHeading`
  ("Componentes") antes da grade de specs — o degrau ciano que faltava entre o
  `<h1>` e os cards. Nenhuma mudança no texto de hardware (continua descritivo,
  princípios 2/3) nem no aviso `parcial` (princípio 4).
- **`SettingsScreen`**: passada completa. Todo `secondary` que era chrome de app
  (procurar atualização, testar controle, abrir desinstalação, mapear controle,
  abrir/verificar no fluxo guiado, "tentar de novo") virou `chrome`;
  "Desconectar" ganhou `CHROME_TINT_DANGER` (destrutivo sinalizado antes do
  clique, com `ConfirmModal` mantido); os subtítulos `<h3 text-primary>`
  viraram kicker monoespaçado (roxo é reservado a ação). `primary` continua só
  em "Baixar e instalar" e "Conectar".
- **`ControllerTestScreen`**: já estava alinhada (refeita em 2026-09-08). Só o
  "Parar teste" solto em `secondary` virou `chrome`.
- **Limpeza:** `LibraryScreen` passou a usar `CHROME_TINT_INFO`/
  `CHROME_TINT_DANGER` de `ui.tsx` no lugar das strings de tingimento inline.

**O que quebra se desfizer:** mesmo risco da entrada acima — `secondary`/cor
solta reintroduzida quebra a consistência entre telas.

### Configuração de emulador dentro do ZeuX, não overlay in-game

O pedido original admitia duas leituras: uma tela do ZeuX que edita a
config do emulador antes de abrir o jogo, ou um overlay durante a partida. A
segunda só seria viável para o RetroArch (Quick Menu) — os demais adapters
são processos standalone, sem como o ZeuX desenhar dentro da janela deles
sem injetar overlay em processo alheio.

Decisão: tela do ZeuX, antes de lançar o jogo (`GET/POST/DELETE
/emulators/{id}/config`). O botão "Configurar" que só abre o emulador
sozinho (`POST /emulators/{id}/open`) continua existindo como escape —
informar, nunca bloquear.

### Capas de jogo via IGDB, credencial do próprio usuário

Decisão: cada usuário conecta a própria conta do IGDB, em vez do ZeuX usar
uma chave compartilhada. Motivo é concreto, não teórico: uma credencial de
teste compartilhada já foi suspensa por uso agregado
(achado de **2026-08-18**) — a prova de que o caminho contrário cobra caro.

**O que quebra se desfizer:** qualquer credencial única do ZeuX estoura cota
assim que o app tiver uso real, derrubando capas para todo mundo de uma vez.

### Credencial de teste embutida movida do código-fonte para ldflags (2026-09-08)

A decisão acima (cada usuário conecta a própria conta) coexistiu, desde
**2026-08-17**, com uma exceção pontual a pedido do Douglas: uma credencial
de teste embutida como literal em `internal/igdb/credentials.go`
(`defaultCredentials`), para pequenos grupos de testadores não precisarem
configurar nada. Essa mesma chave foi a que se suspendeu no Twitch em
**2026-08-18** (achado citado acima) — e de novo em **2026-09-08**,
investigando por que a busca de capa não funcionava sem conta pessoal
conectada no Linux.

Na segunda investigação, ficou claro que manter a chave como literal no
código-fonte era um problema à parte da suspensão em si: fica gravada no
histórico do git para sempre, extraível por qualquer pessoa com acesso ao
repositório (não só ao binário instalado) — e rotacionar exigia editar
código e cortar release toda vez que o Twitch suspendesse de novo.

Solução: `defaultClientID`/`defaultClientSecret` (mesmo arquivo) nascem
vazios no código-fonte; só o workflow oficial de release
(`.github/workflows/release.yml`) os injeta via `-ldflags -X`, lendo de
dois GitHub Secrets (`IGDB_DEFAULT_CLIENT_ID`/`IGDB_DEFAULT_CLIENT_SECRET`)
— `scripts/build-zeuxd.mjs` monta os ldflags a partir de variáveis de
ambiente do mesmo nome. Rotacionar a chave agora é atualizar o Secret no
GitHub e cortar uma release nova, sem tocar em código.

**O que quebra se desfizer:** a chave volta a ficar gravada no histórico do
git para sempre — a antiga (`fr1sxo7h82iihh48lrhl1qg94bh42y`) já está lá e
não dá para apagar sem reescrever o histórico (fora de escopo desta
correção; a chave já estava suspensa mesmo antes desta mudança, então o
custo de deixá-la no histórico é baixo, mas não é zero).

**Efeito colateral corrigido de quebra:** `GET /igdb/credentials` sempre
respondia `"configured": true` (a lógica assumia que a credencial embutida
sempre existia) — com o valor agora podendo ficar vazio de verdade num
build sem os Secrets, essa resposta virou uma mentira otimista. O handler
passou a consultar `CredentialsStore.Load()` (a credencial efetiva) em vez
de presumir.

**Achado real, mesmo dia (2026-09-08), investigado com um agente Opus contra
o `zeuxd` real do Douglas em execução:** depois da correção acima,
`ScrapeManager.Start` (`internal/igdb/scrape.go`) continuava recusando o
lote **inteiro** com `igdb_not_configured` sempre que não havia credencial
nenhuma — mesmo para jogos que libretro-thumbnails (que não pede credencial
nenhuma, ver auditoria dos 32/33 consoles acima) teria resolvido sozinho.
Isso vinha de antes da expansão do libretro-thumbnails, quando IGDB era a
única fonte e a checagem fazia sentido; virou regressão silenciosa quando a
segunda fonte passou a cobrir a maioria dos consoles. Sintoma visível: o
botão "Buscar capas" sumia da tela (`AllGamesScreen.tsx`/`GameDetailScreen.tsx`
escondiam o botão inteiro quando `!igdbConfigured`) e a busca de um jogo
específico recusava sem sequer tentar a fonte livre.

Corrigido: `Start` não recusa mais por falta de credencial — só `resolveGames`
e o disparo do job. `processGame` tenta libretro-thumbnails primeiro (como já
fazia) e, se não achar, só tenta o IGDB quando há credencial configurada;
sem credencial, o jogo vira `"not_found"` com uma `Message` explicando o
motivo, em vez de erro. `ErrNotConfigured` foi removido (não tinha mais
nenhum caminho que o disparasse). Os dois botões de "Buscar capa(s)" no
front-end voltaram a aparecer sempre, e a tela de Configurações passou a
distinguir "usando a credencial de teste" de "esta instalação não tem
nenhuma credencial de teste" (antes as duas liam igual, herdado do mesmo
otimismo do handler).

**Achado relacionado, mesmo investigação — armadilha do AppImage:** o
sintoma original ("capas não buscam mesmo com a versão certa mostrada") não
era só o gating acima. Um `zeuxd` de uma versão **anterior** (0.1.15),
ainda montado a partir de um AppImage antigo, continuava de pé segurando a
porta 7777; quando o Douglas abriu o AppImage novo (0.1.17), o `zeuxd` dele
não conseguiu bindar a porta já ocupada, e a janela nova ficou conversando
com o backend velho sem nenhum aviso — que tinha embutida a credencial
antiga já suspensa pelo Twitch, daí `"configured": true` mesmo depois da
correção. **Como reconhecer isso de novo:** `ps aux | grep zeuxd` mostrando
mais de um processo, ou um caminho `/tmp/.mount_zeux_*` bem mais antigo que
o AppImage atual. O auto-updater/relaunch do Tauri não mata processos órfãos
de uma montagem anterior — fechar todas as janelas do ZeuX antes de abrir
uma nova versão (ou reiniciar a máquina) evita a duplicidade.

### RetroArch: cores baixados sob demanda, não empacotados no instalador

Existiu uma fase em que o instalador podia empacotar RetroArch + 24 cores
juntos (bundling). Retirado em **2026-08-27**: cores agora são baixados sob
demanda pelo próprio ZeuX, com hash SHA256 fixado num manifesto embutido
(`internal/install/data/retroarch_cores_manifest.json`, gerado por
`cmd/generate-retroarch-manifest`, que só roda à mão).

**O que quebra se desfizer:** o instalador volta a inflar (RetroArch + 24
cores de ~100MB cada), e o build do instalador some do caminho rápido.

**Achado real (2026-09-06):** o manifesto fica obsoleto sozinho — o hash foi
medido contra uma URL `.../nightly/<plataforma>/latest/<arquivo>`, um alvo
que o buildbot.libretro.com reconstrói periodicamente. Quando isso acontece,
`StartCore` recusa (corretamente) instalar por hash não bater — não é bug,
é a checagem de integridade funcionando. Resolve rodando
`cmd/generate-retroarch-manifest` de novo. Decisão ainda em aberto: aceitar
que isso se repete (caminho atual) ou buildar contra versão pinada/datada em
vez de "latest".

**Reincidência confirmada (2026-09-08):** o `sameboy` (e, ao medir de novo,
praticamente todo core com nightly recente — `snes9x`, `stella` etc.)
estava com hash desatualizado; usuários iniciando no sistema recebiam o
arquivo atual do buildbot (`a4e48f2...` para `sameboy`/windows) contra o
hash antigo do manifesto (`839be19...`), e a instalação era corretamente
recusada. Douglas já tinha o core instalado de antes, por isso não via o
erro. Corrigido rodando `cmd/generate-retroarch-manifest` de novo (rede
liberada nesta sessão) — mas isso **vai se repetir** enquanto o manifesto
apontar para `latest` em vez de um build pinado. A decisão de fundo
continua em aberto; até ela ser tomada, o sintoma esperado quando reaparecer
é exatamente este: hash batendo para quem já instalou, não batendo para
quem instala depois que o buildbot reconstruiu o nightly.

**Decisão tomada (2026-09-09): mismatch de hash deixa de ser fatal.** O
SHA256 do manifesto embutido **nunca foi conferido contra uma soma publicada
pela origem** — o próprio campo `hash_source` do JSON diz isso, e o buildbot
não publica sidecar `.sha256` nem oferece URL imutável por core (o
`stable/<versão>/` só tem o bundle `RetroArch_cores.7z`, centenas de MB). Ou
seja: aquele hash só protegia contra corrupção de transporte, que TLS +
checagem de `Content-Length` já cobrem. Tratar a divergência como erro fatal
era cerimônia que travava o jogador até uma nova versão do ZeuX sair.

`installCore` agora: hash bate → `checksum_verified: true`; hash não bate →
instala mesmo assim, `checksum_verified: false` e `Job.Warning` preenchido
(a UI mostra o aviso, não um erro). `generated: false` **continua
recusando** — aí não há nem URL medida, é outra coisa. O code
`core_hash_mismatch` foi removido (não existe mais falha por esse motivo);
`coreHashMismatchError` idem.

**O que ainda falta (trilha, não feito):** manifesto vivo — um workflow
diário regenera o manifesto contra o buildbot e publica como asset; o ZeuX
busca em runtime com o embutido como fallback offline. Aí `checksum_verified`
volta a significar algo (medido < 24h) e o `warning` vira raro. Enquanto não
existir, o `warning` no caminho de mismatch é o estado honesto.

**Achado real (2026-09-09): macOS estava 100% quebrado, e não era hash.**
`buildBotPlatform` montava `nightly/osx/<arch>/...`, mas o buildbot moveu os
builds de macOS para baixo de `apple/` (`nightly/apple/osx/<arch>/...`) — o
caminho antigo passou a devolver 404. Resultado: os 25 cores de `darwin/*`
saíam `generated: false` do gerador e `StartCore` recusava todos *antes* de
baixar. Corrigido em `retroarch_manifest.go` (com teste em
`TestBuildBotCoreURLMatchesKnownFormat`) e o manifesto regenerado. Fica a
lição: o formato de URL do buildbot não é estável nem no caminho, só no
"latest" — mais um argumento para a trilha do manifesto vivo / pacote
hospedado (`pendencias.md`).

**Achado real (2026-09-06), Windows especificamente:** `coreDirs()` só
olhava a pasta gerida pelo ZeuX e a pasta "portable" ao lado do executável.
O instalador padrão do RetroArch no Windows (e a versão da Microsoft Store)
grava cores em `%APPDATA%\RetroArch\cores` — um core instalado por lá rodava
de verdade no RetroArch, mas o ZeuX reportava "não instalado". Corrigido
adicionando esse caminho à busca.

### Auto-updater assinado via Tauri (v0.1.10, 2026-09-06)

O app ganhou atualização automática: assinatura dos instaladores via
`tauri-apps/tauri-action`, plugin de updater/process, tela de Configurações
para checar e instalar sem baixar instalador na mão.

**Achado real (2026-09-07):** o auto-updater nunca via atualização
disponível, mesmo com releases mais novas publicadas. Causa:
`package.json`/`src-tauri/tauri.conf.json` tinham `"version"` travado em
`"0.1.0"` desde sempre — só a tag do git avançava a cada release. O
`latest.json` que o plugin de updater consulta é gerado a partir desse
`version` do build, não da tag; com os dois lados (app instalado e
manifesto) sempre em `0.1.0`, a comparação de versão nunca via diferença.

**Corrigido** (`.github/workflows/scripts/sync-version.mjs`, rodado nos 3
jobs de build): a versão real, extraída da tag, é escrita nos dois arquivos
antes do build do Tauri. Validado na release v0.1.12 — instaladores e
`latest.json` saíram com `0.1.12` corretamente.

**O que quebra se desfizer:** volta a acontecer exatamente este bug — o
updater relata "já está atualizado" pra sempre, silenciosamente.

**Achado real (2026-09-08):** o Douglas relatou o mesmo sintoma de novo —
abriu a v0.1.14 (baixada avulsa), checou atualização com a v0.1.16 já
publicada, e o app respondeu "já está atualizado". `sync-version.mjs`
nunca tocava `src-tauri/Cargo.toml`, que também declara `version = "0.1.0"`
— só `package.json`/`tauri.conf.json` eram sincronizados. Não foi possível
confirmar nesta sessão (sem uma máquina Linux com o toolchain Tauri
completo) se esse era de fato o caminho que o binário usava para resolver
sua própria versão, mas sincronizar os três arquivos elimina a ambiguidade
de uma vez — `sync-version.mjs` agora escreve nos três. De quebra, não
havia lugar nenhum no app mostrando a versão instalada, o que tornava
impossível diagnosticar isso sem inspecionar o binário por fora; Configurações
agora mostra "Versão instalada: X.Y.Z" (via `getVersion()`,
`@tauri-apps/api/app` — mesma fonte que o próprio auto-updater consulta).

**Achado real (2026-09-17, v0.1.29):** a release falhou em Windows e macOS
duas vezes seguidas (runs #38 e #39) sem nenhum erro de código — os três
SOs compilaram, e o que caiu foi o upload dos instaladores para a Release
(500 do GitHub, "other side closed", "Error saving asset"). O workflow não
tinha retentativa nenhuma, e a v0.1.29 ficou sem instalador de Windows e
com um `latest.json` só com as plataformas de Linux — e como o updater lê
`releases/latest/download/latest.json`, quem está no Windows ou no macOS
ficou sem ver a atualização.

**Corrigido (2026-09-26)** em `release.yml`: os três jobs de build viraram
uma matriz (`fail-fast: false`), com `retryAttempts: 3` no `tauri-action` e
uma segunda execução inteira do action se a primeira falhar. A segunda
camada existe porque a primeira não cobre o 500 que mesmo assim salvou o
arquivo (o `.sig` do macOS): a retentativa interna daria "already exists",
já que o action só apaga assets existentes antes do primeiro upload; rodar
o action de novo relista a Release e apaga o que ficou pela metade.

**O que quebra se desfizer:** qualquer instabilidade passageira do upload
do GitHub volta a derrubar a release de um SO inteiro, e o `latest.json`
sai sem as plataformas desse SO.

### Teste de controle: SVG desenhado do zero, não vendorizado de terceiro

Pedido do Douglas (2026-09-07): toast de conectado/desconectado (referência:
Steam) e uma tela que mostra o controle e realça ao vivo o que está sendo
apertado (referência: XOutput). O toast reaproveitou peças que já existiam
(`useGamepad`, `useToast`/`Toast`) — decisão pequena. A tela de teste exigiu
escolher entre usar um SVG pronto de terceiro ou desenhar um novo.

Pesquisado antes de decidir: bancos de ícone (freesvg.org, svgrepo, uxwing,
svgsilh) só tinham silhueta única — sem elemento separado por botão, não dá
pra realçar individualmente. `controllercons` é webfont de glifo único,
mesmo problema. O candidato mais próximo do que precisava,
`KW-M/virtual-gamepad-lib` (MIT, feito exatamente para isto — cada
botão/analógico como elemento SVG separado), usa os glifos ✕/○/□/△ do
PlayStation nos botões de face — vocabulário de fabricante, a mesma
restrição que já tira logo de console do `ConsoleIcon` e o Switch do
catálogo. Um exemplo minimalista sem símbolo de marca
(`CodingWith-Adam/gamepad-tester-simple-just-controller`) não declarava
licença nenhuma no repositório — sem isso, vendorizar é risco legal mesmo
sendo pouco código.

**Decisão:** desenhar um controle genérico do zero (`ControllerTestScreen.tsx`),
formas geométricas neutras, cada botão rotulado só pelo índice que a Gamepad
API reporta (0-16) — nunca A/B/X/Y nem os símbolos do PlayStation. Sem
dependência nova, sem asset externo a rastrear licença.

**O que quebra se desfizer:** trocar por um asset de terceiro sem repetir
essa checagem de marca/licença reabre o mesmo risco que motivou a busca.

### Foto de controle real no lugar do SVG desenhado à mão (2026-09-08)

**Revertida, nesta data, a decisão logo acima.** O SVG genérico passou por
duas rodadas de desenho à mão e nenhuma chegou a algo que parecesse um
controle de verdade — geometria e espaçamento artificiais, do tipo que o
olho identifica como "desenho de controle" antes de identificar como
"controle". O Douglas cortou o caminho: em vez de uma terceira rodada,
usar a foto de um controle real como asset visual.

**Decisão explícita do Douglas, perguntado e confirmado antes de
implementar:** usar a foto **como está** — com a logo do fabricante visível
e os botões de face rotulados A/B/X/Y. É reabrir de propósito o vocabulário
de marca que a entrada anterior evitava, pelo mesmo raciocínio (e no mesmo
dia da semana) da imagem real de console em "Identidade visual por console":
a fidelidade visual vale mais para este produto do que a neutralidade.

**Risco aceito, não eliminado:** a foto traz marca registrada de terceiro.
O Douglas decidiu seguir mesmo assim, ciente disso.

Como o asset foi produzido (registrado porque não dá para refazer no
escuro): a captura original tinha fundo cinza sólido `#DDDDDD`; o recorte
foi feito por *flood fill* a partir das bordas com tolerância apertada
(±6) — tolerância folgada come o corpo branco do controle, que mede ~245 e
fica dentro da distância do fundo — mais um *feather* de 1px na máscara,
corte no *bounding box*, redução para 760px de largura e quantização de cor
em passos de 4. Resultado: `src/assets/controller-reference.png`, 169 KB,
fundo transparente, sem halo cinza sobre o tema escuro.

Onde a foto é usada, e por que as duas telas compartilham um módulo:

- `ControllerTestScreen.tsx` — a foto com marcadores por botão que acendem
  ao vivo (a leitura da Gamepad API não mudou nesta troca; só a camada
  visual).
- `EmulatorBindingsPanel.tsx` — a foto no centro, com os cards de
  mapeamento agrupados por região ao redor dela (referência trazida pelo
  Douglas: o painel de controle do PCSX2). O agrupamento é um palpite
  *best-effort* por palavra-chave no nome da ação, e **toda ação que não
  casa com região nenhuma continua visível em "Outras ações"** — as ações
  vêm da API e variam por adapter, então sumir com o que não foi
  reconhecido seria sumir com a única forma de mapear aquilo.
- `src/lib/controllerRegions.ts` — a geometria da foto (em % , nunca px) e
  o casamento nome→região. Existe como módulo porque duas telas leem a
  mesma imagem: duas tabelas de coordenadas separadas divergiriam no
  primeiro ajuste fino.

O painel usa **container query** (`@container` + `@4xl:`), não breakpoint
de janela: ele é montado tanto em largura quase cheia quanto dentro de um
card de grade de ~300px em `EmulatorsScreen`, e um `lg:`/`xl:` (que mede a
janela) espremeria as três colunas dentro do card estreito.

**O que quebra se desfizer:** voltar ao desenho neutro é possível — o
histórico do Git tem o SVG inteiro —, mas exige refazer os marcadores,
porque a geometria de `controllerRegions.ts` é medida sobre ESTA foto.
Trocar a foto por outra sem remedir os spots desalinha os realces das duas
telas de uma vez.

**Achado real, 2026-09-08 (relato do Douglas com um controle Xbox real):**
`ControllerTestScreen` acendia o marcador errado. Causa: `BTN` (o mapa de
índice→botão no topo do arquivo) assume o layout "standard" da Gamepad API
(A/B/X/Y em 0-3, gatilhos em 6-7, direcional em 12-15) — mas o navegador só
garante essa ordem quando `pad.mapping === "standard"`. Fora disso (visto de
verdade no Linux/WebKitGTK com o controle do Douglas conectado por
adaptador/Bluetooth), a ordem é a crua do driver, sem relação nenhuma com o
layout assumido, e não tem como esta tela adivinhar a ordem certa sem o
controle físico em mãos para medir — o mesmo limite que já vale para a
heurística de navegação por D-pad (ADR 0014).

Não dava pra "consertar" a ordem sem o hardware; a correção honesta (regra 4
do CLAUDE.md — dado não confirmado é declarado desconhecido) foi expor
`pad.mapping` em `useGamepad` e mostrar um aviso âmbar quando não for
`"standard"`, em vez de continuar acendendo um botão errado sem dizer nada.
`EmulatorBindingsPanel` não tem este problema: ele captura o índice que
realmente veio do evento de apertar o botão, nunca assume posição fixa — por
isso continua sendo o caminho confiável para mapear um controle cujo
`mapping` não é "standard", enquanto a tela de teste é só diagnóstico visual.

### Controle em pixel art no lugar da foto (2026-09-28)

**Revertida a entrada acima**, a pedido do Douglas, depois da revisão de
design tela por tela: a foto 3D de um controle de marca era o elemento que
mais destoava da direção retrô/pixelada (2026-09-09). A foto pixelizada foi
testada antes (24 e 64 cores) e descartada — perdia a cor das letras ou
ganhava faixas de cor no corpo branco.

O que é diferente das duas rodadas de SVG de 2026-09-07, que falharam: elas
tentavam um controle realista. Este é pixel art de 16 bits, gerado por
código em `src/lib/pixelController.ts` — formas simples (retângulo
arredondado, elipse) rasterizadas numa grade de 128×80, com contorno, brilho
e sombra calculados pela vizinhança na própria máscara. A simplicidade é o
estilo, não uma aproximação; mexer numa forma não exige redesenhar pixel.
Protótipo aprovado pelo Douglas antes da troca.

- Genérico: formato de DualShock (os 17 botões do mapeamento "standard",
  analógicos e gatilhos inclusos), sem logo, sem letra, sem ✕/○/□/△. Face
  nas cores do Super Famicom; home no roxo do ZeuX. Some o risco de marca de
  terceiro que a foto trazia.
- `CONTROLLER_SPOTS` passou a ser derivado da geometria (caixa de cada
  peça), não medido à mão — a tabela de coordenadas sobre a foto não existe
  mais.
- O botão acende de verdade (`PixelController`: a própria peça repintada em
  ciano, com opacidade pela intensidade — o gatilho analógico acende pela
  metade), em vez de uma mancha sobreposta. A capa do analógico se desloca
  com o eixo, em pixels inteiros.
- `src/assets/controller-reference.png` saiu do repositório.

**O que quebra se desfizer:** voltar à foto traz de volta a marca de
terceiro e as coordenadas medidas à mão, e a tela de controle volta a ser a
única do app fora da linguagem pixel.

### Recusar consentimento não pode ser uma versão mais pobre do app (2026-09-08)

Achado real, relato do Douglas: "quem não dá consentimento não consegue
acessar a biblioteca — tem que poder fazer tudo que uma pessoa que deu
consentimento pode fazer". Auditando o código, o problema era maior que só
`DeclinedScreen` sem um link para a Biblioteca — a engine inteira de
lançamento e as quatro telas de biblioteca (`AllGamesScreen`,
`LibraryScreen`, `GamesScreen`, `GameDetailScreen`) assumiam `report`
(o parecer de compatibilidade, que só existe depois de scan) como
obrigatório, com `report!` forçado em vários pontos de `App.tsx`.

Duas causas distintas, corrigidas juntas:

1. **Backend, `internal/api/server.go`, `toInput`:** sem scan (`"no_scan"`)
   ou sem nenhum patamar de compatibilidade alcançado (`"no_preset"`), a
   função recusava o lançamento inteiro com `400`. Isso violava o princípio
   5 (informar, não bloquear) — falta de leitura de hardware virava falta de
   JOGO, não falta de PRESET. Agora os dois casos seguem com `Options` no
   zero-value: o jogo abre com a configuração que o próprio emulador já tem,
   e `Registry.Resolve` ainda escolhe automaticamente o primeiro emulador
   instalado quando nenhum é pedido explicitamente (mesma ordem que
   `consoleReadiness.ts` usa para decidir "o que o ZeuX usaria hoje"). Os
   códigos de erro `no_scan_yet`/`no_preset_available` continuam existindo
   para outras rotas que genuinamente precisam de scan (`GET
   /consoles/verdicts`, `GET /hardware`) — só pararam de existir para
   `/games/launch`/`/games/preview`.

   Achado de quebra: as três telas de jogo (`AllGamesScreen`, `GamesScreen`,
   `GameDetailScreen`) já tinham, no front-end, o fallback certo para "sem
   preset" — `useInlineInstall.handlePlay` já caía em `onLaunch` mesmo sem
   preset (comentário existente: "informar, não bloquear... deixa o clique
   cair no launch mesmo assim"), e `GameDetailScreen` sempre chamou `launch`
   direto, sem checagem nenhuma. O único bloqueio real era o backend
   recusando a chamada antes de chegar lá.

2. **Front-end, `report` obrigatório demais:** `AllGamesScreen`,
   `LibraryScreen`, `GamesScreen`, `GameDetailScreen` e `VerdictScreen`
   tinham `report: Report` (nunca opcional) e liam `report.verdicts` até
   para o nome do console — sem scan, `report` é sempre `null`, e essas
   telas nunca puderam ser alcançadas por quem recusou. Corrigido: `report`
   virou opcional nas cinco; nome/sigla/ano de console, quando o parecer não
   existe, vêm de `GET /consoles` (`ConsoleEntry`, catálogo estático,
   sempre disponível) — carregado uma vez em `App.tsx` (`consoles` state),
   independente de consentimento. `VerdictScreen` sem `report` mostra por
   que não há parecer e um atalho para autorizar, em vez de tentar renderizar
   com dado que não existe.

   `App.tsx` também parou de exigir `report` para montar o shell com sidebar
   (`SIDEBAR_PHASES`) — a única exceção que continua fora do shell é
   "emulators" alcançado direto de `DeclinedScreen` (a confirmação imediata
   pós-recusa, que sempre foi tela cheia); alcançado pela sidebar normal, o
   shell aparece igual. `DeclinedScreen` ganhou um terceiro botão,
   "Continuar sem autorizar", que leva para o app inteiro sem nenhum scan.

**O que continua fora de escopo, de propósito:** hardware que não alcança
nenhum patamar de compatibilidade (`level "improvavel"`, mesmo com
consentimento dado) já caía no mesmo `Options` zero-value por um caminho
distinto (`result.Options == nil`) — não era um bug novo, mas a correção do
item 1 acima também destrava esse caso, que antes também recusava com
`no_preset_available`.

### Logo de console "presa" entre versões — cache de `<img>`, não binário desatualizado (2026-09-08)

Achado real, investigado ao vivo: o Douglas reportou a logo do N64 continuando
a mostrar a marca antiga da iQue (achado e corrigido no commit `0b152c7`,
"IGDB tinha devolvido a marca da iQue por engano") mesmo depois de fechar e
reabrir o ZeuX inteiro. A princípio pareceu ser mais um caso do padrão já
visto nesta sessão (binário local desatualizado — ver a entrada da
credencial do IGDB, acima) — mas desta vez a comparação byte a byte contra o
`zeuxd` real rodando na máquina do Douglas (`curl` direto na rota
`/api/v1/consoles/n64/image`, comparado com `cmp` contra o arquivo do
repositório) deu **idêntico**. O servidor já estava servindo a logo certa; o
problema era só visual.

Causa real: uma tag `<img src="...">` cujo `src` não muda entre renders só
busca a imagem **uma vez** — o navegador reusa o bitmap já decodificado
indefinidamente enquanto aquele elemento (ou a página) continuar viva, e
`Cache-Control: no-store` no servidor não influencia nada aqui, porque
nenhuma requisição nova chega a sair. Se a imagem embutida no binário mudou
entre uma execução e outra do app mas a URL pedida continua sendo a mesma
de sempre (`/consoles/n64/image`, sem parâmetro nenhum), não há garantia de
que o WebView vá descartar o que já tinha em memória — isso já era conhecido
o bastante para existir um mecanismo de `cacheBust` em `consoleImageURL`
(`src/api/client.ts`), mas ele só cobria a troca manual de imagem em tempo
de execução (`POST/DELETE /consoles/{id}/image`), nunca o caso "a versão do
app mudou e a logo embutida corrigiu".

Corrigido com `setAppVersionCacheKey` (`src/api/client.ts`): `App.tsx` busca
`getVersion()` (Tauri) uma vez, o mais cedo possível, e todo `consoleImageURL`
passa a incluir essa versão como parâmetro (`?av=X.Y.Z`) — toda imagem de
console troca de URL automaticamente a cada nova versão instalada, sem
depender de o usuário saber que precisa de um "hard refresh" (que nem
sempre está disponível numa build de release, sem DevTools). Composto com o
`cacheBust` existente, nunca no lugar dele — os dois invalidam motivos
diferentes de a imagem ter mudado.

**O que quebra se desfizer:** sem isso, qualquer correção futura de logo de
console (ou de capa customizada trocada manualmente em versão anterior)
volta a poder ficar presa visualmente até o usuário descobrir sozinho que
precisa recarregar a página de algum jeito — o que numa build de release,
sem DevTools expostos, pode não ter um caminho óbvio nenhum.

---

### "Remover jogo da biblioteca" é uma flag, não um DELETE (2026-09-09)

O Douglas pediu a opção de remover um jogo da biblioteca. A implementação
óbvia — apagar a linha de `library_games` — não funciona: `SyncFolder`
regrava todo caminho encontrado na varredura seguinte (e a tela "Todos os
jogos" revarre sozinha ao abrir, `rescanAllFoldersIfStale`), então o jogo
voltaria minutos depois sem o usuário entender por quê.

Escolha: coluna `excluded INTEGER NOT NULL DEFAULT 0` (migração 0008), no
mesmo espírito de `missing` (0003). `ListAllGames`/`ListGames`/`UncoveredGames`
filtram `excluded = 0` por padrão; `POST /library/games/{id}/exclude`
esconde, `DELETE` revela, e a tela expõe o `DELETE` pelo filtro "Ocultos"
(`?excluded=true`) — mesmo par de caminhos que "Ausentes". A varredura só
mexe em `missing`, nunca em `excluded`, então esconder é durável.

O arquivo no disco **nunca** é tocado — a regra 6 do `CLAUDE.md` vale aqui
igual: o `rom_path` aponta para algo que já era do usuário, o ZeuX não
apaga, não move, não copia. O texto da tela deixa isso explícito
("O arquivo continua no seu computador, intacto").

**O que quebra se desfizer:** um jogo "removido" volta a reaparecer a cada
revarredura; ou, se a remoção virar um DELETE de verdade, o histórico de
tempo de jogo (que referencia o jogo pelo caminho) perde a âncora.

### "Continue jogando" mostra só um jogo (2026-09-09)

A seção tinha o `GameHero` de destaque **mais** um carrossel (`RecentStrip`)
com os outros jogos recentes. O Douglas pediu para ficar só o destaque. Faz
sentido: a grade principal logo abaixo já é ordenada por "jogado por último"
por padrão, então o carrossel repetia exatamente os mesmos jogos, na mesma
ordem, a poucos pixels de distância. `RecentStrip` foi removido inteiro (não
só o uso), e o fetch caiu de `getAllLibraryGames(1, 8)` para `(1, 1)`.

**O que quebra se desfizer:** nada funcional — é escolha de densidade da
tela de entrada. Reintroduzir o carrossel volta a duplicar visualmente os
recentes.

### Profundidade da varredura de `findBinary` (2026-09-09)

Até aqui a descoberta de binário (`internal/emulator/discovery.go`) descia
**um nível** abaixo de cada diretório de sistema: achava
`C:\Program Files\DuckStation\duckstation-qt.exe`, mas não quem extraiu o
`.zip` do release e ficou com o executável em `<app>\bin\...` ou
`<app>\<versão>\bin\...` (relatado; era o "roadmap D6").

Decisão: BFS até **3 níveis** (`maxScanDepth`), com o custo contido por
teto de fan-out — `maxSubdirsScanned` (400) por diretório, `maxDirsPerRoot`
(1500) no total a partir de cada raiz — e uma denylist de nomes de pasta que
nunca hospedam emulador e costumam ser enormes (`node_modules`, `.git`,
`vendor`, `C:\Windows`, ...). A varredura em largura preserva a precedência
antiga: um binário mais raso é sempre testado antes de um mais fundo.
`scanTree` é usada tanto pela busca avulsa quanto pela construção do
`dirIndex` de `Survey`, então as duas enxergam a mesma árvore.

3 e não mais: o aninhamento real observado é de 1–2 níveis; o terceiro é
folga. Instalação em local arbitrário (outro drive, pasta pessoal) **não**
é resolvida aqui de propósito — continua sendo o caso do cadastro manual de
emulador, que existe justamente para isso.

**O que quebra se desfizer:** volta o sintoma do D6 — emulador extraído de
`.zip` com o binário em subpasta fica "não instalado" mesmo estando num
diretório de sistema conhecido.

### Título editável: coluna `title_override`, não sobrescrever `title` (2026-09-09)

O título de um jogo vem de `library.TitleFromFilename` e às vezes fica feio.
O Douglas pediu para poder editar. Sobrescrever a coluna `title` direto não
funciona: `SyncFolder` faz `ON CONFLICT (path) DO UPDATE SET title =
excluded.title` a cada varredura, então a edição sumiria no próximo rescan
(o mesmo problema que `excluded` resolveu com uma flag).

Escolha: coluna nova `title_override TEXT NOT NULL DEFAULT ''` (migração
0009). As consultas de leitura devolvem `CASE WHEN title_override != ''
THEN title_override ELSE title END AS title` — quem lê `Game.Title` recebe
o de exibição já resolvido e não precisa saber da existência do override.
A varredura continua só escrevendo `title`, então a edição manual sobrevive
sem nenhum tratamento especial em `SyncFolder` (igual a `favorite`/
`excluded`). `PATCH /library/games/{id}/title` com corpo `{"title":""}`
limpa o override.

**O que quebra se desfizer:** editar o título volta a ser desfeito pela
revarredura seguinte; ou, se a edição passar a escrever em `title`, o
título derivado original é perdido e não há como "restaurar o padrão".

### Multi-disco: adiado, não implementado nesta rodada (2026-09-09)

Jogos de PS1/PS2 em vários discos ("(Disc 1)", "(Disc 2)") entram como
entradas soltas. O pedido incluía agrupá-los e lançar como playlist `.m3u`.
Adiado para `pendencias.md` com escopo escrito: a parte de lançamento
esbarra na regra de `BuildCommand` ser pura (não tocar o FS além da exceção
do RetroArch, ver "RetroArch: cores baixados sob demanda") — gerar o `.m3u`
teria que acontecer noutra camada e numa área gerenciada do ZeuX, **nunca**
na pasta de ROM do usuário (regra 6). Não cabia com segurança no tempo
desta rodada junto do título editável; o título editável (menor e sem risco
de FS) foi entregue, o multi-disco virou pendência.

### "Todos os jogos" fecha o ciclo pós-jogo e o de "jogar mesmo assim" (2026-09-09)

Quatro ajustes na tela de entrada e no fluxo de lançar, todos sob o princípio
5 (informar, nunca bloquear) e o 2/3 (texto descritivo, nomear o gargalo):

1. **Recarga pós-jogo sem F5.** `useLaunchGame` ganhou um gancho `onLaunched`,
   disparado só quando o jogo abre de fato (status `launched`, nunca no
   caminho de download de core). `AllGamesScreen` o usa para rebuscar a grade
   e a faixa "Continue jogando"; `GameDetailScreen`, para a contagem de
   sessões. `GamesScreen` já fazia isso à mão com um `loadGames()` logo após
   `api.launch` — as telas que usam o hook não tinham como. A recarga não
   toca `restoredScrollRef` (M4), então a rolagem do usuário fica no lugar.

2. **`GameDetailScreen` passou a compor `useInlineInstall`.** Era a lacuna
   registrada no doc comment de `GamesScreen`: o "Jogar" grande do detalhe
   chamava `launch(game)` direto — sem instalar o emulador que falta, sem
   confirmar BIOS vazia, sem "jogar assim mesmo" num console sem preset. Agora
   passa pela mesma `handlePlay` das outras duas telas, com as mesmas
   confirmações em modal e o mesmo `ManualInstallModal`.

3. **Chip acionável para `no_preset`/`bios_empty`.** Em `GameTile` e
   `GameHero` o chip desses dois motivos era texto morto (só
   `not_installed`/`install_manual` viravam botão). Agora vira "jogar assim
   mesmo", que dispara a mesma `onPlay` do ▶ (lança sem `options` em "sem
   preset"; abre a confirmação de BIOS em "bios vazia"). O motivo descritivo
   continua no `title`/nome acessível e, no hero, na linha acima do botão.

4. **`GET /scrape-jobs`.** O lote automático de capas (`autoScrapeCovers`)
   roda sem a tela ter um id de job — o placeholder de sigla parado lia como
   "a busca falhou". A rota nova lista as buscas recentes; `AllGamesScreen`
   consulta ao abrir, adota uma que ainda esteja em andamento e mostra o
   mesmo progresso discreto ("buscando capas… 12/48", com `aria-live`) do
   botão "Buscar capas".

5. **`EmptyState` de "Todos os jogos" com 3 passos numerados** (parte do item
   de onboarding de `pendencias.md`): aponte a pasta · o ZeuX lê o hardware e
   diz o que cada console alcança · clique no jogo, ele resolve emulador e
   config. Não é wizard, não tem card de console de exemplo, não sugere de
   onde tirar ROM (princípio 6). Substituiu a chave `emptyLibraryHelp`.

**O que quebra se desfizer:** #2 volta a deixar o detalhe do jogo como a
única das três telas de jogo que ignora BIOS vazia / emulador ausente e só
falha depois no `ErrorModal`; #4 volta a fazer o lote automático parecer
falha silenciosa.

### Rodapé de prompts do controle: `useGamepadNavigation` devolve `connected` (2026-09-09)

O hook detectava o controle só dentro do laço de poll — que nem roda sem um
pad presente — então não tinha como sinalizar "nenhum controle". Passou a
manter um `useState` alimentado por `gamepadconnected`/`gamepaddisconnected`
(mesma técnica de `useGamepad`) e a devolver `{ connected }`. `GamepadHints`
(rodapé fino, `position: fixed`, só renderiza com `connected`) recebe isso
**por prop** de `App.tsx`, nunca chamando o hook de novo: dois `useEffect` de
poll rodando em paralelo duplicariam cada ação de navegação (A = clique, B =
voltar).

O prompt de Ⓑ só aparece quando existe `[data-nav-back]` na tela — um
`MutationObserver` reavalia a cada troca de fase (o `switch` de `App.tsx`
troca o filho do mesmo `<main>`, sem desmontar `GamepadHints`). Prompt que
promete "voltar" numa tela sem botão de voltar seria pior que nenhum.

**O que quebra se desfizer:** `GamepadHints` deixa de saber quando aparecer;
voltar a chamar o hook em dois lugares reintroduz a navegação dupla.

### Tela de Histórico deriva tudo do que já existe, sem endpoint novo (2026-09-09)

`GET /sessions` já devolve `playtime_seconds` (mapa por console, somado no
back por `Launcher.Playtime`) e `GET /library/games?played=true` já vem
ordenado por último jogado. A tela de Histórico consome os dois direto —
tempo total é a soma do mapa no front, "jogados recentemente" é a lista
`played=true` cortada em 12. Nenhuma rota agregada nova entrou: um número de
"tempo total consolidado" no servidor economizaria uma soma trivial e criaria
mais uma superfície para manter em sincronia.

**O que quebra se desfizer:** se `GET /sessions` parar de devolver
`playtime_seconds`, a tela perde o bloco de tempo (a faixa de recentes
continua).

### O zeuxd morre junto do app, inclusive na auto-atualização (2026-09-09)

Relato do Douglas: ao rodar a auto-atualização, o `zeuxd` ficava no ar e
precisava ser morto na mão pelo Gerenciador de Tarefas. Causa: o único
gatilho de `child.kill()` era `WindowEvent::CloseRequested`, e o
`relaunch()` do auto-updater (`@tauri-apps/plugin-process`) sai pelo
`RunEvent::ExitRequested`/`Exit`, sem passar por evento de janela.

Duas defesas, propositalmente redundantes (`src-tauri/src/lib.rs` +
`cmd/zeuxd/main.go`):

1. **`RunEvent::ExitRequested | Exit`** também chama `kill_daemon()` (agora um
   método idempotente de `DaemonState`). Cobre o caminho limpo — fechar a
   janela, reiniciar pelo updater.
2. **`--parent-stdin-watchdog`**: o app Tauri passa essa flag ao subir o
   sidecar; o zeuxd lê o próprio stdin numa goroutine e, quando o cano fecha
   (o que acontece assim que o processo pai morre — inclusive num kill
   forçado ou crash, onde nenhum evento do Tauri roda), dispara o mesmo
   encerramento gracioso do SIGTERM. Quem roda `go run ./cmd/zeuxd` num
   terminal nunca recebe a flag (ali stdin é o teclado e não dá EOF sozinho).

**O que quebra se desfizer:** volta a sobrar um `zeuxd` órfão segurando a
porta 7777 — e, pior, na próxima abertura o app reaproveita esse órfão
(`probe_port` vê `RunningZeuxd`), então a versão nova nem sobe o daemon dela.

### Varredura esconde a faixa `.bin` atrás do `.cue` (2026-09-09)

Relato do Douglas (com print): um jogo de PS1 em `.bin`+`.cue` entrava duas
vezes na biblioteca. As extensões do PS1 no catálogo incluem `bin` e `cue`
(além de `chd`/`pbp`), e `FindROMs` devolvia os dois arquivos como jogos
separados. Só o `.cue` é o que o emulador abre.

`filterShadowedDiscTracks` (`internal/library/scan.go`) roda depois da
varredura: lê cada índice de disco encontrado (`.cue`/`.ccd` pela linha
`FILE "..."`, `.m3u` pela lista de caminhos, `.gdi` pela coluna do nome) e
tira do resultado os arquivos citados, sempre restrito à **mesma pasta**.
Rede de segurança para um `.cue` ilegível: um `.bin` de mesmo nome-base que
um `.cue` irmão também some. Sem nenhum índice na varredura (consoles de
cartucho), a função devolve a lista intacta.

Entradas `.bin` que já estavam no banco viram `missing` na varredura
seguinte (não são apagadas — `SyncFolder`), e `missing` fica escondido por
padrão desde 2026-09-08, então somem da visão normal do usuário sozinhas.

**O que quebra se desfizer:** todo jogo de disco em faixas soltas volta a
duplicar; um multi-disco com `.m3u` volta a aparecer como N jogos + a
playlist.

### "Jogar" num console cru: instala o emulador, o core, e avisa do BIOS (2026-09-09)

Pedido do Douglas: clicar em "Jogar" com a ROM achada mas sem emulador devia
resolver tudo — baixar o emulador mais compatível, o core (se for RetroArch),
e avisar do BIOS (se o console precisar). A cadeia de instalação inline já
existia (`useInlineInstall` → instala → lança; o 202 de `POST /games/launch`
já baixa o core do RetroArch e relança). O que faltava era o passo do BIOS:
depois de instalar, por exemplo, o DuckStation, o app lançava direto e o jogo
abria numa tela preta, sem o ZeuX dizer nada.

`useInlineInstall`, ao terminar a instalação do emulador, relê `GET
/emulators` (agora com `installed: true` e o estado real de `bios_dir_empty`)
e reavalia com `evaluateGameLaunchability`. Se cair em `bios_empty`, entra no
estado novo `bios-after-install` — modal "Emulador instalado — falta o BIOS",
com "Abrir pasta do BIOS" e "Jogar mesmo assim". Estado próprio, e não
`confirm-bios`, porque a frase é outra ("instalei pra você, agora falta isto"
vs. "você mandou jogar sem BIOS"). Renderizado nas três telas de jogo
(GamesScreen, AllGamesScreen, GameDetailScreen).

**O que quebra se desfizer:** volta a instalar o emulador e lançar num
console que precisa de BIOS sem avisar — o jogo abre sem rodar e o usuário
não sabe por quê.

### Cursor do controle por atributo, não por `:focus-visible` (2026-09-09)

Relato do Douglas testando a v0.1.22 com controle real: "não estou
conseguindo ver ONDE estou com o controle. Ele funciona — o foco anda — mas
não vejo um seletor no campo exato onde estou".

Causa: `useGamepadNavigation` move o foco com `.focus()` **programático**, e
no Chromium (WebView2, o motor do Tauri no Windows) `.focus()` chamado por
script não satisfaz de forma confiável a heurística de `:focus-visible` —
que é justamente onde todo o realce do app estava escrito (`FOCUS_RING` em
`ui.tsx`, `group-focus-visible:` em `GameCover`). O foco andava, invisível.
Não existe forma de "forçar" `:focus-visible`: é decisão do motor.

Decisão: o laço de navegação marca o elemento atual com
`data-gamepad-focused` (e limpa do anterior), e `src/index.css` estiliza esse
seletor com um realce forte — contorno de 3px na cor de interação
(`--console-accent` quando há uma), halo por fora e por dentro, respiração
lenta do halo (desligada sob `prefers-reduced-motion`, com o estado estático
mais forte no lugar). O bloco fica **fora de `@layer`** de propósito, para
vencer as utilities do Tailwind que pintam borda/sombra no mesmo elemento.
Onde um componente reage ao foco com mais que o anel — o glow da capa, o
overlay de play, a logo do console —, a variante
`[[data-gamepad-focused]_&]:` acompanha o `group-focus-visible:` existente.

Dois efeitos vieram junto, porque sem eles o realce ainda deixaria buracos:
o cursor **pousa sozinho** quando não há nenhum (ao conectar o controle e a
cada troca de tela, quando o elemento focado desmonta), preferindo o
`data-gamepad-start` que a tela declarar; e o cursor **é exclusivo do
controle** — o primeiro `pointerdown` ou Tab/seta o apaga, para não haver
dois indicadores de "onde estou" ao mesmo tempo.

**O que quebra se desfizer:** reescrever o realce em `focus-visible:` devolve
o bug original — navegação por controle funcionando e invisível. Se o
`data-gamepad-focused` deixar de ser limpo em `pointerdown`, quem usa mouse
passa a ver um cursor de controle preso num elemento qualquer.

### Direção visual retrô/pixelada, e o layout das telas deixa de ser lei — 2026-09-09

O protótipo já era funcional (controle, pop-ups, fluxo de veredito), mas
numa máquina sem jogos e sem emuladores o app parecia cru: marca só em
tamanho pequeno e borrado, voz tipográfica "terminal" terceirizada para a
fonte monoespaçada do SO (`@theme` nunca declarava `--font-mono`), estados
vazios sem hierarquia, grade de consoles com peso de listagem
administrativa, telas de pasta com card dentro de card.

Decisão do Douglas: o tema puxa para **retrô com pixel art** (ver CLAUDE.md,
"Direção visual"), e **o layout atual de qualquer tela pode ser totalmente
refeito** — não é mais tratado como padrão a preservar. O que não muda: os
princípios de produto não-negociáveis, a regra de responsividade e as
convenções de idioma/comentário.

**O que quebra se desfizer:** volta o app "cru" — e some o registro de que
mudar a estrutura de uma tela é permitido, o que faz a próxima sessão tratar
o layout herdado como intocável.

**Custo aceito:** um período de inconsistência visual enquanto as telas
migram para a nova direção, e retrabalho em telas que já estavam "prontas".

### ConsoleCard volta a mostrar a logo real — 2026-09-11

Em 2026-09-10 `ConsoleCard.tsx` (Home/"Seus consoles" e a grade de
`ConsolesScreen`) tinha passado a mostrar só a sigla estilizada — a decisão
está registrada só no comentário do componente, não neste log (falha de
processo desta sessão: toda reversão de decisão de produto deveria vir
para cá). O motivo citado era a "chapa branca" atrás da logo concentrando
todo o contraste da tela.

O Douglas pediu de volta nesta data: a Home era a única tela do app sem a
logo real, enquanto `ConsoleHero` (detalhe do console) e a linha de
identidade de `LibraryScreen` sempre mostraram — duas convenções coexistindo
sem necessidade. A correção não repete a chapa branca em tela cheia: a
imagem entra numa placa pequena (64/56/48px conforme o tamanho do card,
mesma proporção da caixa do `ConsoleHero`), centralizada sobre o
compartimento com gradiente/textura de pixel — a arte de terceiro fica
contida, a identidade visual do ZeuX continua sendo o que preenche o card.
Fallback para a sigla via `onError`, mesmo padrão de sempre.

**O que quebra se desfizer:** a Home volta a ser a única tela sem logo real,
inconsistente com o resto do app — e como da última vez, ninguém vai saber
por quê a menos que leia o comentário do componente.

### Logo do console numa etiqueta de cartucho, inteira — 2026-09-26

Depois da placa pequena (acima), o card passou em 2026-09-14 a mostrar a
logo em `object-cover` de ponta a ponta, a pedido do Douglas. Na prática,
isso cortou toda logo larga ("BOY AD", "PS one" virando "S on", "EGA DRI")
e deixou quase invisíveis as logos pretas sobre fundo transparente
(PS1, PS3, PSP, Vita, DS, 3DS, Game Boy — cerca de metade do catálogo) em
cima do `--fill` escuro.

Três protótipos com as logos reais, escolha do Douglas pela terceira:
desfoque ambiente da própria logo + logo inteira na frente (ótimo nas
coloridas, sem contraste nas pretas); etiqueta clara grande; etiqueta +
faixa no topo na cor de identidade do console. A etiqueta ocupa quase todo o
compartimento, então não volta a ser "ícone perdido num cartão grande", e
fica na cor creme `--cart-label` em vez de branco puro. A logo entra em
`object-contain` com `mix-blend-multiply`, para que as que vêm com fundo
branco chapado (Fliperama, Mega Drive, SNES) se fundam na etiqueta.

Junto disso, `cmd/generate-console-images` passou a cortar a moldura vazia
de cada logo (`trim.go`): várias vêm do IGDB num quadrado de 160×160 com a
marca numa faixa fina (PS2 ocupa 3,6% dos pixels) e sairiam minúsculas em
`contain`. `-trim-only` reprocessa as imagens já baixadas sem credencial do
IGDB — foi assim que as 20 afetadas do repositório foram cortadas.

**O que quebra se desfizer:** voltar a `cover` corta as logos largas e
esconde as pretas; tirar o corte do gerador faz a próxima geração devolver
as molduras vazias, e as logos quadradas voltam a sair pequenas.

### Capa provisória do jogo também vira cartucho; bloqueado não esmaece mais — 2026-09-26

Achado da revisão de design tela por tela, rodando o app como usuário novo
(sem capas do IGDB, sem emulador instalado): a biblioteca inteira lia como
retângulos quase pretos. Três causas somadas: o placeholder era a sigla do
console a 25% de opacidade; o título em pixel ficava no rodapé da capa,
onde o selo de status ("instalar emulador") o cobria; e o `GameTile`
esmaecia a 50% todo jogo bloqueado — que, para quem acabou de instalar, é
todo jogo.

`GameCover` sem `coverUrl` agora desenha um cartucho, na mesma linguagem do
`ConsoleCard`: etiqueta creme na parte de cima com a sigla impressa na
faixa na cor do console, o título do jogo em pixel escuro (`--cart-label-ink`)
no meio dela, e ranhuras de pegada no casco abaixo. A etiqueta termina
acima do selo de status, então nada se sobrepõe. O selo solto de sigla no
canto só aparece com capa real (sem ela, a faixa já diz o console).
Esmaecer ficou só para arquivo ausente (`reason === "missing"`) — o selo já
diz o que falta nos outros casos.

**O que quebra se desfizer:** a primeira tela de todo usuário novo volta a
ser uma grade apagada, com o título dos jogos escondido atrás do selo.

### Parecer "improvável" passa a dizer qual emulador usar — 2026-09-26

Até aqui, um console sem nenhum patamar atendido saía do parecer sem
`emulator`/`adapter_id`/`core` — só `level: "improvavel"` e o gargalo. A
biblioteca usa o `adapter_id` para saber se o emulador está instalado, então
para esses consoles ela não sabia o que faltava: um PS2 numa máquina abaixo
do primeiro patamar, sem PCSX2 instalado, aparecia com "jogar assim mesmo",
e o clique caía num erro de lançamento. A tela do console sabia ("PCSX2 atende
este console, mas não está instalado") porque lê o catálogo, não o parecer.

Agora o parecer "improvável" traz o emulador do patamar menos exigente —
o que o usuário instalaria para tentar por conta e risco (princípio 5). O
preset e as `options` continuam vazios: não se sugere configuração para o
que não deve rodar, e `toInput` no servidor segue lançando sem preset. No
front, `evaluateGameLaunchability` passou a checar "emulador não instalado"
antes de "sem preset".

**O que quebra se desfizer:** volta a oferecer "jogar assim mesmo" para jogo
cujo emulador nem está instalado.

### Um formato de botão só; `secondary` deixa de existir — 2026-09-26

Achado da revisão de design tela por tela: `Button` tinha seis variantes, e
duas faziam o mesmo papel com linguagens opostas — `secondary` (sans, caixa
mista, 16px, canto de 8px, ~45 usos) e `chrome` (mono, caixa alta, 12px,
canto reto, ~31 usos). O detalhe do console chegava a mostrar quatro
estilos lado a lado. As entradas de 2026-09-07 acima migraram tela a tela de
`secondary` para `chrome`; esta termina o trabalho no próprio componente.

- `secondary` saiu do tipo; os usos viraram `chrome`, que passa a ser a
  variante padrão.
- Toda variante compartilha a geometria do chrome (canto reto, borda de
  1.5px, mono em caixa alta, friso de luz no topo, `active:translate-y-px`).
  Diferem só em cor e peso: `primary` e `danger` cheios, com sombra de 2px
  embaixo (tecla que salta da placa); `chrome` contornado; `quiet` só texto;
  `ghost` tracejado, reservado a placeholder.
- Tamanho virou prop (`size`: `sm` 28px, `md` 36px — a altura de input,
  select e chip —, `lg` 48px para o CTA de tela), no lugar de `px-*/py-*/
  text-*` passados por `className`, cuja precedência dependia da ordem no
  CSS gerado.
- O seletor Completo/Reduzido de Configurações usava as duas variantes para
  marcar a opção ativa, e não dava para saber qual valia; virou chip de
  filtro (`role="radio"`), o controle de alternância do app.
- "Remover da biblioteca" no detalhe do jogo desceu de `danger` cheio para
  chrome com `CHROME_TINT_DANGER`: é raro e reversível, e era o segundo
  elemento mais chamativo da tela. O vermelho cheio fica no "confirmar" do
  modal.

Junto disso, `SectionHeading` voltou à fonte pixel, a 14px (a primeira
tentativa, a 11px, ficava menor que o corpo), com um pixel de 8px como
marcador e **sem** `uppercase`: a Press Start 2P embutida não tem
maiúsculas acentuadas ("MÁQUINA" saía sem acento).

**O que quebra se desfizer:** volta a coexistirem duas linguagens de botão
para o mesmo papel, e cada tela nova escolhe uma por instinto.

### Passada de alinhamento nas telas — 2026-09-26

Pedido do Douglas a partir do detalhe do console: o card "Jogos de PS2"
não alinhava com o card vizinho. Causa: a coluna da esquerda começava com
um título de seção ("Como rodar") e a da direita direto num card, com o
título "Jogos de PS2" dentro dele. Regra adotada para telas de duas
colunas: **toda seção é título (`SectionHeading`) + conteúdo a `gap-3`, e
as seções ficam a `gap-6` entre si** — antes a mesma tela tinha três ritmos
(`gap-2`, `gap-3`, `gap-4`).

Revisão das outras telas, com o que mudou:

- **Emuladores:** a grade voltou ao `stretch` (revertendo o `items-start`
  de 2026-09-06), com a barra de ação em `mt-auto`. Com `items-start`, cada
  card de uma fileira terminava numa altura e cada "Instalar" num lugar; o
  problema de 09-06 (conteúdo colado no topo, metade de baixo vazia) não
  volta, porque a ação desce para a base.
- **Detalhe do jogo:** o texto do hero deixou de ser centralizado na
  vertical — centralizava na coluna capa + dois botões, sem casar com a
  capa — e passou a começar no topo dela. Os botões de "Arquivo" viraram
  pilha de largura cheia (o `flex-wrap` os empilhava com larguras
  diferentes).
- **Detalhe do console:** o hero tinha `mt-3` a mais que a lista de jogos
  do console, com o mesmo botão de voltar em cima.
- **Configurar controle:** três caixas de aviso tinham "—" literal como
  rótulo; viraram "Situação"/"Erro".

**O que quebra se desfizer:** o topo dos cards vizinhos volta a desalinhar
sempre que uma coluna tem título e a outra não.

### Etiqueta de cartucho como desenho único de logo de console — 2026-09-28

**O quê:** toda logo de console no app passa por `ConsoleLabel` (etiqueta
creme com faixa na cor do console): card da grade, cabeçalho do console
(`ConsoleHero`, 112×64), cards da tela de Emuladores (96×56) e linhas da tela
"Pastas de jogos" (64×40). Saíram a caixa branca de 64px do hero e os
quadrados brancos de `ConsoleIcon`/pastas. Junto: a tela de Emuladores
deixou de paginar (14 cards numa rolagem só), o bloco "Emulador fora da
lista" desceu do topo para o pé da grade, sem painel, e o chip de pendência
do card de console virou status (pixel âmbar + texto), sem borda.

**Por quê:** eram três desenhos para a mesma coisa, e o console mudava de
cara entre a grade e o detalhe. Nos quadrados, as logos largas (PS2, PSP)
viravam um risco ilegível; a etiqueta é retangular porque a maioria das
logos é horizontal, e o creme resolve as logos pretas sem estourar como o
branco. A paginação fazia virar página para responder "o que já está
instalado?". O cadastro manual é ação rara e, no topo, empurrava a lista e
competia com o "Instalar". O chip com borda tinha desenho de botão e não
fazia nada; o clique é o card inteiro.

A logo do SNES continua sendo a foto do aparelho: nenhuma fonte da logo foi
alcançável deste ambiente (Wikimedia recusada pelo proxy). Trocar é rodar
`cmd/generate-console-images` com uma fonte melhor e `-trim-only`.

**O que quebra se desfizer:** voltar a um quadrado branco em qualquer tela
reabre a divergência visual entre telas e a ilegibilidade das logos largas.
Voltar a paginar esconde parte do catálogo atrás de um clique. Devolver o
cadastro manual ao topo recoloca uma ação rara acima da lista. Devolver a
borda ao chip de pendência faz o usuário clicar num "botão" que não faz
nada. `ConsoleLabel.onImageError` é o que avisa o `ConsoleHero` que não há
logo, para não mostrar "restaurar padrão" sem nada para restaurar; se ele
sair, o hero perde essa informação.

### Detalhe do console diz cada coisa uma vez só — 2026-09-28

**O quê:** no detalhe do console, (1) o banner de prontidão ficou só com a
frase + a trilha de peças (saiu o selo `readiness.badge`), e o card de cada
emulador perdeu o selo "não instalado" — o que falta vira a ação ("Instalar"
ou o trilho manual); o selo de instalado fica, porque diz quem instalou.
(2) As ressalvas do parecer — `precision: "parcial"` e os limiares do catálogo
ainda não medidos (D2) — viraram uma linha de rodapé dentro de
`ConsoleVerdictCard` (`VerdictCaveat`, em `components/ui.tsx`), com selo âmbar
"parcial" ou neutro "estimativa", no lugar da caixa âmbar de `PartialNotice`
dentro do card e do `Callout` "estimativa" abaixo dele. `THRESHOLDS_CALIBRATED`
passou da tela para o lado do card. (3) O caminho da pasta de jogos é truncado
pelo começo (`…/roms/ps2`, `PathTail` em `components/ui.tsx`: `dir="rtl"` +
`<bdi dir="ltr">` + `text-left`), com o caminho inteiro no `title` — vale
também para o caminho do arquivo no detalhe do jogo.

**Por quê:** a revisão de design (PS2 numa máquina sem PCSX2 e sem GPU
identificada) contou "falta o emulador" três vezes e "não temos certeza" em
três camadas empilhadas — a repetição diluía o que o parecer diz de fato
(patamar, preset, gargalo). Dizer menos vezes, nunca deixar de dizer: as duas
ressalvas continuam por extenso e "parcial" continua em âmbar (princípio 4). O
aviso de limiares dentro do card também corrige uma lacuna: o detalhe do jogo
mostrava o mesmo parecer sem aviso nenhum. No caminho, o que distingue uma
pasta da outra é o fim; o `truncate` comum mostrava só o prefixo que todas
compartilham.

**O que quebra se desfizer:** voltar `PartialNotice`/`Callout` para o card
reempilha as caixas também em "Como vai rodar" do detalhe do jogo; devolver
`THRESHOLDS_CALIBRATED` à tela tira o aviso de estimativa do detalhe do jogo.
Tirar o `<bdi>` do `PathTail` faz a barra inicial e a pontuação trocarem de
lado; tirar o `text-left` encosta caminhos curtos à direita.

### Detalhe do jogo não mostra ano do console como se fosse do jogo — 2026-09-28

**O quê:** o badge de ano ao lado do nome do console, em `GameDetailScreen`,
foi removido. Nenhum ano aparece no detalhe do jogo enquanto a biblioteca não
guardar o ano de lançamento do próprio jogo. Na mesma passada da biblioteca:
um só indicador de "buscando capas" (o botão vira medidor com a contagem), o
"nunca jogado" sai dos tiles e da lista (tempo só aparece quando > 0), o
título abaixo da capa abre o detalhe (clique de mouse, sem alvo de foco novo)
e o destaque "último jogado" usa o `GameCover` (o cartucho) sem capa.

**Por quê:** o valor vinha de `verdict.year`, que é o ano do console no
catálogo. Solto ao lado do título, lia como ano do jogo: "Okami" aparecia com
2000 (o PS2), mas o jogo é de 2006. A biblioteca não tem esse dado — o
scraper do IGDB lê `first_release_date`, mas descarta, e o
libretro-thumbnails, fonte tentada primeiro, não tem ano. Mostrar um ano que
não é deste jogo é fingir certeza (princípio 4); omitir é o honesto. Para
voltar a ter ano: persistir o ano do IGDB numa coluna de `library_games`,
expor em `LibraryGame` e aceitar que fica ausente para capas do libretro.

**O que quebra se desfizer:** religar `year` no badge volta a mostrar o ano
do console como se fosse do jogo, em todo jogo lançado depois da estreia do
console, que é a maioria.

### Idioma só em Configurações; Configurações reordenada; tour em pixel art — 2026-09-28

**O quê:** (1) o seletor de idioma saiu do rodapé da barra lateral e ficou só
em Configurações, como botões de alternância (o mesmo controle de "Efeitos
visuais"). (2) Configurações passou a ir do que mais muda o app ao que é raro:
Idioma e Efeitos visuais lado a lado, Capas (IGDB), Controles, Atualizações,
Apresentação, Instalação e, por último, Desinstalar. (3) As quatro ilustrações
do tour de abertura viraram pixel art gerada por código (`lib/pixelArt.ts` +
`components/TourArt.tsx`), numa grade de 80×50 exibida a no máximo 480px (6px
inteiros por pixel). (4) No Histórico vazio, só o botão do estado vazio leva à
biblioteca.

**Por quê:** dois seletores para a mesma escolha faziam a pessoa se perguntar
se eram configurações diferentes, e o da barra lateral não alcançava ninguém a
mais: a barra lateral só existe nas fases em que Configurações já está a um
clique (`SIDEBAR_PHASES`). As capas do IGDB são o ajuste que mais muda a cara
da biblioteca e estavam no fim da página; ação rara e destrutiva (desinstalar)
fica longe de quem só veio trocar uma opção. Os SVGs de traço liso do tour
eram a única arte vetorial num app de identidade pixel (direção retrô de
2026-09-09), justo na primeira coisa vista depois do scan.

**O que quebra se desfizer:** devolver o seletor à barra lateral recria o
controle duplicado (e exige recriar a opção `collapsible`, removida).
Aumentar a largura do tour ou tirar o `ring` da moldura (trocando por
`border`) deixa a escala da arte fracionária e os pixels cintilam. Mexer em
`pixelController.ts` achando que o tour depende dele não afeta o tour: são
módulos separados de propósito (o controle deriva dele as regiões do
mapeamento).

### Capa e informações do jogo viram etapas separadas da busca — 2026-09-28

**O quê:** a busca em lote (`internal/igdb/scrape.go`) passou a ter duas
etapas independentes por jogo: a **capa** (libretro-thumbnails primeiro, IGDB
só se lá não houver) e as **informações** (sempre do IGDB, quando há conta):
ano de lançamento, resumo, gêneros e desenvolvedora. Gravadas em colunas
novas de `library_games` (migração 0010), com `metadata_status` no mesmo
molde de `cover_status`. O lote inclui jogos que já têm capa mas nunca
tiveram as informações buscadas (`library.ScrapeCandidates`). A busca no
IGDB é feita no máximo uma vez por jogo — a etapa das informações reaproveita
a consulta da capa quando houve. O detalhe do jogo mostra "desenvolvedora ·
ano" abaixo do título e uma seção "Sobre o jogo" com gêneros e resumo.

**Por quê:** o IGDB só era consultado quando o libretro não achava a capa, e
mesmo então o ano era descartado — a maior parte da biblioteca nunca tinha
dado nenhum sobre o jogo, e a tela chegou a mostrar o ano do *console* como
se fosse do jogo. O resumo fica em inglês por decisão do Douglas (o IGDB só
mantém esse idioma), com `lang="en"` e uma legenda dizendo a origem.

Só a empresa marcada `developer` em `involved_companies` vira
desenvolvedora: a lista também traz publicadoras e portadoras. Sem conta do
IGDB (build local sem a credencial de teste), nada disso aparece — a seção
some, nunca mostra palpite (princípio 4).

**O que quebra se desfizer:** voltar a consultar o IGDB só como segunda fonte
de capa deixa sem ano e sem resumo todo jogo cuja capa o libretro achou.
Tirar o `metadata_status` faz o lote reconsultar para sempre os jogos que o
IGDB não tem.

### Seletor de idioma desde o consentimento; política em dois idiomas — 2026-09-28

O seletor de idioma aparece na tela de consentimento e na de recusa, não só
em Configurações. O texto da política vem do servidor no idioma pedido
(`GET /consent?lang=en`); sem o parâmetro, ou com qualquer outro valor, vem
em português.

**Por quê:** a primeira tela do app é justamente a que pede uma decisão
sobre dados — quem não lê português precisava aceitar sem entender, ou
aceitar para só depois achar o seletor. O texto continua saindo do servidor
(princípio 1): a interface nunca traduz a política por conta própria.

As duas versões são o mesmo texto e compartilham `PolicyVersion`. Mudar o
escopo de uso exige mudar as duas juntas e subir a versão — uma tradução
que diga mais ou menos que a outra seria um consentimento diferente
registrado sob a mesma versão.

**O que quebra se desfizer:** tirar o `?lang=` faz a tela em inglês exibir
a política em português; traduzir no front faz a interface mostrar um texto
que o servidor não registrou.

### Controle pré-configurado por emulador: "sozinho", "padrão do ZeuX" ou "dentro do emulador" — 2026-09-29

Pedido do Douglas depois de um usuário instalar o RPCS3: a configuração de
controle só aparecia para RetroArch e PCSX2, e ele queria "ver tudo que
podemos pré-configurar em cada emulador, para o usuário mexer o mínimo
possível". A resposta foi lida no código-fonte de cada emulador
(raw.githubusercontent.com), não em documentação nem em palpite, e virou um
campo por emulador em `GET /emulators` (`controller_support`,
`internal/emulator/controller_preset.go`):

| Emulador | Resposta | Por quê (no código dele) |
|---|---|---|
| RetroArch | sozinho | autoconfig por vendor/product |
| PPSSPP | sozinho | `RestoreDefault` já mapeia XInput e controle genérico |
| Flycast | sozinho | `DefaultInputMapping` monta o mapa a partir do `SDL_GameController` |
| xemu | sozinho | `input.auto_bind` ligado por padrão |
| Vita3K | sozinho | abre os controles SDL que encontrar |
| Xenia | sozinho | `hid = "any"` (XInput no Windows) |
| PCSX2 | padrão do ZeuX | bind posicional `SDL-0/FaceSouth` (confirmado com controle real em 2026-09-08) |
| DuckStation | padrão do ZeuX, só instalado pelo ZeuX | mesmo formato posicional; só o `settings.ini` portátil tem lugar conhecido |
| RPCS3 | padrão do ZeuX só no Windows | handler XInput nomeia o aparelho por posição (`XInput Pad #1`); no SDL o nome inclui o produto |
| Dolphin, RMG, Cemu | dentro do emulador | o bind carrega o nome/GUID do aparelho — não há texto genérico |
| melonDS, Azahar | dentro do emulador | formato não lido ainda (ver pendências) |

**O padrão do ZeuX liga controle E teclado.** PCSX2 e DuckStation guardam
vários binds por ação repetindo a chave no INI (`AddToStringList` /
`GetStringList` nos dois; o leitor do DuckStation agrupa as repetições).
Cada ação recebe o botão do primeiro controle e a tecla que o próprio
emulador usaria por padrão — as tabelas vêm de `MapController` +
`GetKeyboardGenericBindingMapping` de cada um, e **não são iguais**: o
DuckStation escreve `Keyboard/UpArrow` e `Keyboard/Enter`, o PCSX2
`Keyboard/Up` e `Keyboard/Return`; os botões de face do DuckStation são
`A/B/X/Y` mesmo com controle de PlayStation (a tabela que ele lê do arquivo
é sempre a posicional do Xbox). Copiar a tabela de um para o outro deixaria
metade do teclado mudo. O formato do DuckStation **não** foi conferido com
controle físico — é leitura de código.

**Achado que motivou consertar ao abrir o jogo:** o seed antigo do ZeuX
(`seedPCSX2` com `SettingsVersion = 1`; `seedDuckStationPortable` criando o
`settings.ini`) fazia os dois emuladores acharem um arquivo válido e **não**
aplicarem os padrões deles — o jogador 1 ficava sem bind nenhum, nem
teclado. Instalação nova agora já nasce com o `[Pad1]`
(`emulator.ControllerPresetSeed`, sem passar por backup, para o "restaurar"
não voltar a um arquivo sem controle). Para quem já instalou,
`Launcher.Launch` grava o padrão antes de abrir o jogo quando
`NeedsControllerPreset` diz que o jogador 1 não tem bind **nenhum** — o
único estado em que não existe escolha do usuário a preservar.

**RPCS3 só a pedido, e só em arquivo vazio.** O `pad_thread` carrega o
`Default.yml`, aplica os padrões do handler escolhido (`init_config`) e
carrega o arquivo de novo por cima — então gravar só `Handler: XInput` e
`Device: XInput Pad #1` já dá o mapeamento XInput completo. Mas é um
handler por jogador: ligar o controle desliga o teclado do jogador 1, e por
isso a tela confirma antes. Um `Default.yml` que já existe não é editado
(YAML aninhado, com o mapeamento do handler anterior em `Config:` — trocar
só o `Handler` misturaria nomes de tecla com o XInput).

**Interface:** "Configurar controle" e Configurações listam todo emulador
instalado com o que falta nele ("reconhece sozinho", "falta mapear" com o
botão "Aplicar mapeamento padrão", "configure no emulador" com o botão para
abri-lo). Substituiu o passo guiado de 2026-09-08, que só existia para PCSX2
e RetroArch. A sequência botão a botão continua, agora como "Layout
personalizado", e deixa de fora quem é "preset": o índice cru da Gamepad API
só o RetroArch grava, e no PCSX2 ela produzia 16 ressalvas.

**O que quebra se desfizer:** tirar o `[Pad1]` do seed volta o PCSX2 e o
DuckStation instalados pelo ZeuX a abrir sem controle nem teclado; trocar a
tabela de um emulador pela do outro deixa teclas mudas; editar um
`Default.yml` existente do RPCS3 pode deixar o jogador 1 sem entrada
nenhuma.

### Firmware do PS3 instalado pelo próprio RPCS3, a partir da tela do console — 2026-09-29

Relato do Douglas: um usuário instalou o RPCS3 e não havia botão para levar
ao firmware. Não havia porque o RPCS3 não lê firmware de pasta nenhuma (ver
`BiosDir`): o `PS3UPDAT.PUP` passa pelo instalador dele, que decifra e extrai
para `dev_flash`. Agora a seção "BIOS / firmware" do PS3 vira **"Firmware do
console"**: diz se está instalado e tem "Instalar firmware…", que pede o
arquivo que o usuário já tem e o entrega a `rpcs3 --installfw <arquivo>`. O
RPCS3 abre com a barra de progresso dele; o cartão relê o estado quando a
janela do ZeuX volta ao foco.

- **Instalado?** A mesma prova que o RPCS3 usa antes de bootar um jogo:
  `dev_flash/sys/external/liblv2.sprx` na pasta de configuração dele
  (`rpcs3/Emu/System.cpp`, `firmware_missing`). A pasta espelha
  `fs::get_config_dir` (`Utilities/File.cpp`): `portable/` ao lado do exe,
  senão a do exe (ou `RPCS3_CONFIG_DIR`) no Windows, `$XDG_CONFIG_HOME/rpcs3`
  ou `~/.config/rpcs3` no Linux, `~/Library/Application Support/rpcs3` no
  macOS. Um `vfs.yml` que tire o `dev_flash` do padrão vira "não sei"
  (`firmware_installed` ausente), nunca "faltando".
- **A opção `--installfw`** está no código do RPCS3 (`rpcs3/rpcs3.cpp`,
  `arg_installfw`: "Forces the emulator to install this firmware file.") e
  chama o mesmo `main_window::InstallPup` do menu Arquivo → Install Firmware.
  **Nada disso foi executado contra o binário real** — foi lido do
  código-fonte em 2026-09-29. Testado com um executável falso que registra os
  argumentos.
- Firmware faltando entra na prontidão ("BIOS · falta", frase nomeando o
  firmware) e na checagem antes de jogar (mesmo motivo `bios_empty`, com o
  badge "firmware ausente").
- O ZeuX nunca diz de onde tirar o firmware (princípio 6): só o nome que o
  arquivo costuma ter, e só aceita `.PUP`.

**Achado de passagem, não corrigido aqui:** `seedRPCS3` (`internal/install/
firstrun.go`) grava `config.yml` na pasta de instalação, mas no Windows o
RPCS3 lê a configuração de `config/` dentro dela (`fs::get_config_dir(true)`)
e no Linux de `~/.config/rpcs3`. Como o arquivo gravado é vazio, o efeito é
nenhum — nem bom nem ruim; fica registrado para a pré-configuração do RPCS3.

### Primeiros passos acompanham o usuário fora da biblioteca — 2026-09-29

Teste com um usuário novo: ele apontou a pasta pela lista de primeiros passos,
ficou na tela de Pastas de jogos e não entendeu que havia mais passos — só viu
o 2 e o 3 porque clicou em Voltar por acaso. A lista mora em "Todos os jogos",
e as ações dela levam a outras telas.

`FirstStepsBanner` aparece nas telas aonde os passos levam: Pastas de jogos
(passo 1) e o detalhe do console que o passo 2 nomeia (em outro console, "resolva
o que falta aqui" apontaria o lugar errado). Enquanto o passo está pendente,
diz o que fazer ali. Assim que ele é concluído, **sem sair da tela**, vira
"Feito: … Próximo passo: …" com o botão "Continuar primeiros passos", que volta
para a lista. Para isso `useFirstSteps` ganhou `refreshKey` (as telas o sobem a
cada pasta apontada ou emulador/core instalado) e `useStandaloneFirstSteps`,
que busca catálogo e emuladores onde a tela não os tem.

Voltar sozinho para a biblioteca ao apontar a pasta foi descartado: quem aponta
uma pasta costuma apontar outra em seguida, e ser tirado da tela no meio disso
seria pior que o problema.

### Controle: seção "No ZeuX" e escolha do botão de confirmar — 2026-09-29

Mesmo teste: o usuário queria "configurar o controle para o ZeuX", e a única
tela de configuração era a dos emuladores, que sem nenhum instalado dizia que
não havia o que configurar — embora o controle já navegasse o app sem nada.

Configurar controle agora abre com **No ZeuX**: diz que o controle já funciona,
quais botões fazem o quê, e deixa escolher o **botão de confirmar** — o de baixo
(padrão: A no Xbox, ✕ no PlayStation) ou o da direita (A no Nintendo, ○ no
PlayStation japonês), que é o costume de quem vem de controle Nintendo. A
escolha mora em `lib/gamepadPrefs.ts` (`localStorage`, preferência da máquina)
e `useGamepadNavigation` a lê a cada quadro. Remapear botão por botão não entrou:
a navegação só usa direcional, confirmar e voltar. **Nos emuladores** vem depois,
marcada como opcional, e diz de cara (sem precisar clicar em Iniciar) quando não
há emulador que aceite mapeamento — e que isso não afeta o ZeuX. "Testar todos
os botões" leva ao teste e o Voltar dele retorna para onde se veio.

### "Sobre o jogo" sempre visível, busca só de informações e retentativa — 2026-09-29

Relato do Douglas, com vídeo, na v0.1.34: o resumo do jogo não aparecia em
lugar nenhum. A seção "Sobre o jogo" **sumia por inteiro** quando não havia
resumo nem gêneros, e havia quatro motivos possíveis, indistinguíveis na tela.
A causa exata na máquina dele não foi confirmada daqui, mas cada motivo agora
se diz sozinho:

- **Sem conta do IGDB** (build sem a credencial de teste, ou nenhuma conta
  conectada): a seção diz isso e aponta Configurações.
- **Nunca buscado:** botão "Buscar informações".
- **`not_found`:** o IGDB não achou o título. O texto sugere "Editar título"
  e buscar de novo. Os títulos no padrão das ROMs ("Legend of Zelda, The -
  Ocarina of Time") agora são ajustados para a busca (`searchTitle`,
  `internal/igdb/client.go`), então muitos deixam de cair aqui.
- **`error`:** a busca falhou. Botão para tentar de novo, e a mensagem do erro
  aparece embaixo.

**Busca só de informações** (`POST /library/games/{id}/metadata`,
`ScrapeManager.StartMetadata`): "Buscar capa de novo" também traz as
informações, mas troca a capa, inclusive uma escolhida à mão. Sem conta do
IGDB, ela recusa com o motivo (`igdb_not_configured`), em vez de terminar como
"não encontrado".

**`error` deixou de ser final.** Uma falha passageira (rede, conta suspensa
por um tempo) deixava o jogo sem informações para sempre, porque o lote só
pegava `metadata_status = ''`. Agora pega `'error'` também. Para uma conta
quebrada não virar uma chamada ao Twitch/IGDB por jogo a cada biblioteca
aberta (o lote automático roda a cada pasta revarrida), o lote para de buscar
informações depois de `maxConsecutiveMetadataErrors` (3) falhas seguidas.

`metadata_status` passou a ir no JSON (antes `json:"-"`), e existe
`GET /library/games/{id}` para a tela reler o jogo depois de uma busca.

**O que quebra se desfizer:** voltar a esconder a seção devolve o "por que não
aparece?" sem resposta; tirar o teto de 3 falhas faz uma conta suspensa gerar
N pedidos inúteis a cada abertura da biblioteca.

### Tela nova começa do topo — 2026-09-29

O `<main>` do shell é o mesmo nó entre as telas, então a rolagem da grade vazava
para a tela seguinte: rolar a biblioteca e abrir um jogo mostrava o detalhe já
no fim (vídeo do Douglas). `App.tsx` zera a rolagem a cada troca de fase
(`useLayoutEffect`, antes da pintura), menos ao voltar para "Todos os jogos",
que restaura a própria posição quando os jogos chegam.

### Ajuda de nomes de subpasta recolhível no "Caminho mais rápido" — 2026-09-29

O botão "Ver nomes de pasta aceitos" era grande e ficava sozinho no fim do
cabeçalho de "Pastas de jogos" (relato do Douglas), e abria um modal. Virou
"Como nomear as subpastas", recolhível dentro do cartão da pasta de todos os
jogos, que é o único lugar onde esses nomes importam. A lista mostra o nome
completo e só as formas curtas que o servidor trata como diferentes (mesma
normalização de `normalizeConsoleMatch`), em grade `auto-fill`.

### Menu de botão direito nos jogos, cursor em pixel e fim do menu nativo — 2026-09-28

Pedido do Douglas: o cursor estilizado, e botão direito num jogo (por exemplo
um ausente que ele quer tirar da lista) para ver detalhes "entre outros".

**Menu do jogo** (`GameContextMenu`, Radix `ContextMenu`): Ver detalhes ·
Jogar · Favoritar/Tirar dos favoritos · Mostrar na pasta · Remover da
biblioteca (ou Trazer de volta, se o jogo está oculto). Vale na grade, na
lista e no destaque "Continue jogando" de "Todos os jogos", e na grade e na
lista da tela de um console. `Jogar` e `Mostrar na pasta` ficam desabilitados
em jogo ausente. **"Remover" continua sendo esconder** (`POST .../exclude`, o
mesmo da tela de detalhe): o arquivo no disco nunca é tocado (princípio 6), a
confirmação diz isso, e o jogo volta pelo filtro "Ocultos". O contêiner do
menu é `display: contents`, para não virar caixa na grade nem na lista.

**Correção no servidor que o menu expôs.** O filtro "Ocultos"
(`?excluded=true`) exigia `missing = 0`, e o "Ausentes" exige `excluded = 0`:
um jogo **ausente e oculto** não aparecia em filtro nenhum, e a promessa de
"trazer de volta pelo Ocultos" era falsa justamente para o caso de remover um
ausente. Agora "Ocultos" lista os ocultos ausentes também
(`ListAllGames`, com teste). Isso já era verdade pela tela de detalhe; o menu
só tornou o caminho comum.

**Menu nativo do sistema desligado** fora de campo de texto e de texto
selecionado, só na versão empacotada (`WindowFrame`): o botão direito abria o
menu do WebView ("Voltar", "Recarregar"), que não é do app. No `dev` ele
continua, para o "Inspecionar".

**Cursor em pixel** (`src/cursors.css`, gerado por
`scripts/generate-cursors.mjs`; não edite o CSS à mão): seta creme e mão roxa,
com contorno escuro para aparecerem sobre capas claras. PNG em data URI, e não
SVG, porque WebView2, WebKitGTK e WKWebView tratam tamanho e antialias de
cursor SVG de jeitos diferentes, e pixel art só é pixel art com célula em
pixels inteiros (2×2). A seta vai no `html` e é herdada; a mão entra em
botões, links, abas e afins pela regra de base, e a classe `cursor-hand`
substitui `cursor-pointer` em `<div onClick>`. Campos de texto mantêm o cursor
de digitação do sistema, e `not-allowed` segue nativo. Efeito colateral aceito:
texto solto mostra a seta, e não o I-beam, como em qualquer app desktop.

**Não verificado:** o cursor na janela real (o Playwright não desenha
o cursor; conferi o desenho ampliado e o `cursor` calculado nos elementos), e
como cada WebView escala o PNG em telas com zoom do sistema.

**O que quebra se desfizer:** apagar `cursors.css` (ou o `@import`) deixa o
`var(--cursor-*)` inválido e cai no cursor nativo (`default`/`pointer`), sem
quebrar nada; reverter o filtro de "Ocultos" volta a esconder o jogo ausente
removido de todo filtro.

### Barra de título própria, em pixel — 2026-09-28

Pergunta do Douglas: "por que o header, onde maximizo/fecho/minimizo, não está
estilizado também?". Era a barra do sistema operacional, fora do alcance de
qualquer CSS. Agora o ZeuX desenha a dele (`WindowFrame.tsx`, montada em
`main.tsx` em volta do `<App />`): marca "ZEUX" em fonte pixel, e três botões
com ícones de grade 6×6 desenhados a 12px (cada "pixel" = 2px inteiros).

**Por plataforma, de propósito:**
- **Windows e Linux:** janela sem moldura (`decorations: false`, em
  `tauri.windows.conf.json` e `tauri.linux.conf.json`) e botões nossos.
- **macOS:** `titleBarStyle: "Overlay"` (`tauri.macos.conf.json`). Os botões
  coloridos do sistema ficam; a barra só reserva o espaço deles. Botões
  desenhados por nós ali perderiam tela cheia e o menu da janela.
- **Linux:** uma janela GTK sem moldura não tem bordas de redimensionar, então
  o `WindowFrame` desenha 8 faixas invisíveis que chamam
  `startResizeDragging`. No Windows não: o sistema resolve a borda sozinho, e
  as faixas cobririam a ponta da barra de rolagem.

**A barra só liga depois de `isDecorated()` responder `false`.** Se a
configuração por plataforma não pegar, o app fica com a barra nativa em vez de
duas — ou de nenhuma.

**Pegadinhas que custaram decisão:**
- Os arquivos por plataforma são mesclados por JSON Merge Patch (RFC 7396),
  que **substitui arrays inteiros**: cada um repete o objeto completo de
  `app.windows[0]`. O tamanho da janela (1280×800, mínimo 960×600) agora mora
  em quatro arquivos e precisa mudar nos quatro.
- A barra ocupa 32px da janela, então `h-screen` (100vh) passaria da tela. O
  contêiner de conteúdo tem altura definida e rola por dentro, e as telas que
  eram `h-screen`/`min-h-screen` (shell, `Sidebar`, splash, recusa) viraram
  `h-full`/`min-h-full`. **Tela nova não use `h-screen`.**
- Os botões são `tabIndex={-1}` (chrome de mouse, como os do sistema), e o
  `FOCUSABLE_SELECTOR` da navegação por controle passou a respeitar isso — sem
  o ajuste, o D-pad pararia neles.
- Permissões novas em `capabilities/default.json`: arrastar, alternar
  maximizar (`toggle` e `internal-toggle`, esta usada pelo duplo clique),
  minimizar, fechar, redimensionar, `is-decorated` e `is-maximized`. Todas
  conferidas contra a referência de permissões do crate `tauri`.
- Detecção de macOS/Linux por `navigator.userAgent`, e não
  `@tauri-apps/plugin-os`: é a única informação que falta e não vale uma
  dependência (nem um plugin do lado Rust).

**Verificado:** o desenho, a altura, a rolagem e as chamadas de janela (com a
API do Tauri simulada num navegador). **Não verificado neste ambiente:** o
arrastar, o duplo clique, os botões e o redimensionar na janela real — dependem
de ver a release rodando no Windows (e depois no Linux e no macOS).

**O que quebra se desfizer:** apagar os três `tauri.*.conf.json` devolve a barra
do sistema (a barra nossa some sozinha, por causa do `isDecorated`). Apagar só
as permissões deixa a janela sem botão que funcione.

### Primeiros passos, dicas de primeira visita e estados vazios que ensinam — 2026-09-28

Pergunta do Douglas: "falta explicação maior de como o ZeuX funciona? um vídeo
tutorial ou algo mais interativo?". A resposta foi três peças no próprio app,
nenhuma delas um vídeo:

1. **Lista de primeiros passos** (`FirstStepsChecklist`, acima da grade de
   "Todos os jogos"): aponte a pasta · deixe um console pronto · abra o
   primeiro jogo. Cada item se marca sozinho pelo estado real da máquina e
   leva ao lugar onde se resolve. A regra é `lib/firstSteps.ts` e o passo do
   meio **reaproveita `evaluateConsoleReadiness`** — a lista e a tela de
   consoles dizem a mesma frase sobre o que falta. Some no primeiro jogo com
   tempo medido, ou em "Dispensar".
2. **Dicas de primeira visita** (`FirstVisitTip`): uma faixa por tela em
   Consoles, detalhe do console (logo abaixo da trilha que explica) e
   Configurações. "Entendi" a esconde para sempre; "Rever dicas", em
   Configurações, traz de volta as dicas e a lista.
3. **Estados vazios que ensinam**: histórico sem jogos, console com pasta mas
   nenhum jogo lido, console sem pasta e a tela de pastas sem console agora
   dizem o que aparece ali, o que conferir e onde resolver.

**Por quê sem vídeo:** o visual mudou duas vezes em três dias, e vídeo
envelhece a cada redesenho, precisaria de uma versão por idioma e quase
ninguém o vê antes de jogar. Uma lista que lê o estado da máquina não
envelhece.

**Por quê faixa, e não balão apontando para um elemento:** o balão precisa
medir o layout, e o layout muda a cada redesenho. A faixa é posicionada pelo
próprio JSX e acompanha a tela sem manutenção.

**Decisões pequenas que importam:**
- A lista **não bloqueia**: "abrir o primeiro jogo" nunca espera o passo do
  emulador, porque o RetroArch baixa o core sozinho ao abrir o jogo (princípio
  5). Exigir o core antes seria mais rígido que o próprio ZeuX.
- Se `GET /retroarch/cores` (ou qualquer dado da lista) falha, a lista **não
  aparece** em vez de tratar a falha como "sem core" — afirmaria uma falta que
  ela não verificou (princípio 4).
- "Já jogou?" conta só sessão com duração medida > 0, então uma sessão que
  morreu ao abrir ou foi encerrada sem duração (ver a entrada abaixo) não
  encerra a lista.
- Sem `localStorage`, a dica **não aparece** (erra para "já vi"), o oposto do
  tour: uma dica por tela que voltasse a cada visita e não pudesse ser
  dispensada seria um incômodo permanente.
- O `EmptyState` da biblioteca vazia perdeu os três passos numerados que tinha
  (2026-09-09): com a lista logo acima, eram duas listas de "comece por aqui"
  que divergiam quando uma delas era dispensada.

**O que quebra se desfizer:** tirar a lista deixa quem abre o ZeuX pela
primeira vez de novo sem ver "o que falta" fora da tela de consoles; tirar a
regra compartilhada com `consoleReadiness` faz a lista e a tela de consoles
divergirem calada.

### Sessões abertas por uma execução anterior são encerradas ao subir o daemon — 2026-09-28

Ao iniciar, o `zeuxd` encerra toda sessão com `ended_at` nulo
(`SQLiteSessions.CloseOrphaned`), com `ended_at = started_at` e uma
explicação em `exit_error`.

**Por quê:** quem fecha a sessão é a goroutine que espera o processo do
emulador, e ela morre com o daemon. Fechar o ZeuX com o jogo aberto — ou uma
atualização reiniciar o app — deixava a sessão "em andamento" para sempre: o
Douglas viu *The Legend of Zelda* (N64) marcado como em andamento depois de
atualizar para a v0.1.30, com outro jogo no "Continue jogando". Pior, o
tempo jogado somava `time.Since(started_at)` e crescia sozinho.

A duração fica zero porque o fim real é desconhecido: deixar de contar um
tempo não medido é honesto, inventar um não é (princípio 4). O daemon novo
também não tem como voltar a acompanhar o emulador antigo — o pid não é
gravado, e o processo não é filho dele.

**O que quebra se desfizer:** qualquer sessão interrompida volta a aparecer
como em andamento e a inflar o tempo jogado indefinidamente.

### PCSX2 no Windows: BIOS e configurações apontavam para pasta errada — 2026-09-11

`BiosDir` (`internal/emulator/bios_dir.go`) só resolvia a pasta de BIOS do
PCSX2 no Linux (verificado ao vivo em 2026-08-04); no Windows devolvia
`("", false)` de propósito, por não haver confirmação do caminho. Efeito
prático reportado pelo Douglas: PS2 nunca mostrava o aviso de BIOS ausente
(que PS1/DuckStation mostra), e não havia botão de "abrir pasta" nem para o
BIOS nem para a instalação do emulador.

Foram dois problemas empilhados, não um só:

1. **`biosDirFor("pcsx2", ...)` recusava qualquer caminho fora do Linux** —
   endereçado adicionando o caso Windows.
2. **`pcsx2ConfigPath` (painel "Configurações" do PCSX2, H1) já apontava
   para o Windows, mas para o lugar errado:** usava `os.UserConfigDir()`
   (`%AppData%\PCSX2\inis\PCSX2.ini`) nas duas plataformas. No Linux isso é
   `~/.config`, verificado contra binário real. No Windows, `%AppData%` está
   errado por convenção documentada do próprio PCSX2: sem modo portátil
   (`seedPCSX2` em `internal/install/firstrun.go` não ativa portable.ini
   para o PCSX2, só suprime o assistente), o PCSX2 no Windows grava em
   **"Documentos\PCSX2\"**, não em AppData — provável causa real de o painel
   de configurações parecer não funcionar.

As duas rotas agora compartilham `pcsx2DataDir()` (`pcsx2_config.go`), para
nunca mais divergir sobre onde o PCSX2 realmente olha nesta plataforma:
Linux usa `os.UserConfigDir()/PCSX2` (verificado), Windows usa
`~/Documents/PCSX2` (convenção documentada, **não verificada contra um
binário Windows real nesta sessão** — mesma ressalva que o D1 exige para
flags não testadas). macOS continua sem caminho algum.

Também foi adicionado um botão genérico "Abrir pasta do emulador" em
`EmulatorsScreen.tsx`, que não depende de `BiosDir`/convenção nenhuma — usa
`installation.binary_path` (que o ZeuX já confirmou em disco via
`Adapter.Locate`) para qualquer emulador instalado, gerenciado pelo ZeuX ou
achado numa instalação alheia do usuário.

**O que quebra se desfizer:** volta a faltar o aviso de BIOS do PS2 no
Windows (única plataforma testada pelo Douglas), e o painel de
configurações do PCSX2 volta a ler/gravar num arquivo que o PCSX2 nunca
tocou.

**Risco aceito, não eliminado:** se o "Documentos" do usuário estiver
redirecionado (OneDrive, política de empresa), `~/Documents/PCSX2` erra —
não há como descobrir isso sem a API nativa de pastas conhecidas do
Windows, que o projeto evita para não crescer a superfície de dependências.
Sem confirmação contra um PCSX2 real rodando no Windows, também não dá para
descartar de vez a hipótese de o PCSX2 usar `%AppData%` em alguma versão —
se um teste ao vivo desmentir isso, `pcsx2DataDir` é o único lugar a
corrigir.

### Pasta de BIOS no Windows: Flycast entra, xemu e Vita3K ficam de fora — 2026-09-11

Continuação direta da entrada acima. Depois de acertar o PCSX2, os três
emuladores restantes que exigem BIOS/firmware e não passam pelo RetroArch
foram investigados no mesmo dia: **xemu** (Xbox), **Vita3K** (PS Vita) e
**Flycast** (Dreamcast). RPCS3 continua fora por motivo já registrado (o
firmware é instalado por dentro do próprio RPCS3, não há pasta para
apontar), e os consoles servidos por cores do RetroArch ficaram fora por
pedido do Douglas — aquilo é outro mecanismo.

Os três foram instalados de verdade pelo próprio ZeuX nesta máquina Windows,
e o método foi o mesmo para todos: fotografar os diretórios candidatos
(pasta da instalação, `%AppData%`, `%LocalAppData%`, Documentos,
`%UserProfile%`) antes e depois de executar o binário, e comparar. Nada aqui
veio de convenção não confirmada.

**Flycast (dreamcast) — implementado.** A pasta é `data`, ao lado do
`flycast.exe`. O que foi observado, em ordem:

- Rodar o binário criou `data/` e reescreveu `emu.cfg` ao lado do
  executável, sem tocar em nada fora dali.
- Apagar `emu.cfg` e `data/` e repetir não mudou nada: no Windows o Flycast
  é portátil **incondicionalmente**. Isso é o oposto do xemu, onde
  `xemu.toml` é um marcador de verdade (sem ele, o xemu passa a gravar em
  `%AppData%\xemu\` — testado). Como não depende de `seedFlycast` ter
  rodado, o caminho vale também para uma instalação que o usuário já tinha
  por conta própria, e por isso o caso **não** é restrito a `Managed`.
- Repetir com o diretório de trabalho apontando para outra pasta manteve o
  `data/` ao lado do executável: a âncora é o caminho do binário, não o CWD.
  Importa porque o launcher do ZeuX não promete rodar o emulador de dentro
  da pasta dele.
- Quem afirma que é ali que o BIOS entra é o próprio binário: a string de
  ajuda embutida no `flycast.exe`, já traduzida para português dentro do
  mesmo arquivo, é *"A pasta onde o Flycast salva os arquivos de
  configuração e VMUs. Os arquivos de BIOS devem estar em uma subpasta
  chamada \"data\""*, ao lado de *"Pastas que contêm arquivos BIOS (por
  exemplo, dc_boot.bin ou dc_bios.bin)"*.

Só Windows. No Linux e no macOS o Flycast não é portátil, e isso não foi
verificado — continua devolvendo `("", false)` por lá.

**Efeito colateral que precisou de conserto próprio:** `BiosDirEmpty` era
calculado como "a pasta não tem nada dentro", critério que funciona para
DuckStation e PCSX2 porque a pasta deles é dedicada ao BIOS. A `data` do
Flycast é também onde ele guarda cache de shaders e capas — depois da
primeira execução ela nunca está vazia, e o ZeuX passaria a afirmar que o
BIOS do Dreamcast está no lugar sem nenhum BIOS existir. Isso é pior do que
não dizer nada, e feriria o princípio 4. A checagem virou
`BiosDirLooksEmpty(adapterID, dir)` (`bios_dir.go`), que para o Flycast
pergunta pelo arquivo de boot (`dc_boot.bin`/`dc_bios.bin`) em vez de pela
pasta, mantém o critério antigo para todo o resto, e devolve um segundo
booleano de "não deu para olhar" — pasta ilegível não vira afirmação.

**xemu (xbox) — fora, por conclusão, não por falta de tentativa.** O xemu
não varre pasta nenhuma atrás de BIOS: cada arquivo é um caminho absoluto e
individual em `[sys.files]` do `xemu.toml` (`bootrom_path`, `flashrom_path`,
`eeprom_path`, `hdd_path`, `dvd_path`), escolhido pelo usuário num diálogo
de arquivo. Confirmado das duas pontas — fechando o xemu graciosamente para
ele gravar a configuração padrão, o único caminho que apareceu foi
`eeprom_path`, absoluto, apontando para dentro da própria pasta de
instalação; e as únicas chaves de caminho que existem no binário são essas
cinco, todas de arquivo. Mesma categoria do RPCS3. Apontar uma pasta aqui
faria o usuário largar o MCPX e a imagem de flash num lugar que o xemu nunca
lê — exatamente o que `bios_dir.go` existe para evitar.

**Vita3K (vita) — inconclusivo, que não é a mesma coisa que "sem pasta".** O
binário não chega a iniciar nesta máquina: sai imediatamente, sem janela,
sem log e sem registro no Visualizador de Eventos. A causa foi identificada
— o `Vita3K.exe` importa `VCRUNTIME140.dll`, `VCRUNTIME140_1.dll` e
`MSVCP140.dll`, e o runtime do MSVC não está instalado aqui (os plugins do
Qt vieram completos, então não é isso). Instalar o redistribuível do MSVC
seria mexer no sistema desta máquina, coisa que o CLAUDE.md manda perguntar
antes. Sem observar o emulador rodando, não dá para dizer onde ele lê o
firmware, e a regra da casa é não chutar — `Vita3K` continua devolvendo
`("", false)`, e a interface simplesmente não mostra seção de BIOS para ele.
**Este é o único dos três que vale reabrir:** numa máquina com o runtime do
MSVC instalado, o mesmo método de snapshot resolve em minutos.

**O que quebra se desfizer:** o Dreamcast volta a não avisar que falta BIOS
e perde o botão "Abrir pasta do BIOS". Se `BiosDirLooksEmpty` voltar a ser
"a pasta está vazia", o aviso do Dreamcast some silenciosamente para sempre
depois da primeira execução do Flycast — o pior tipo de regressão, porque o
app continua parecendo certo.

**Ressalva que fica registrada:** o Flycast tem uma chave de configuração
(`Dreamcast.BiosPath`) que deixa o usuário acrescentar outras pastas de BIOS
pela interface dele. Se o usuário fizer isso, o BIOS também funciona de lá,
e o ZeuX vai continuar dizendo que a pasta `data` está vazia. Optou-se por
apontar o padrão — onde o Flycast procura sem ninguém configurar nada — em
vez de ler o `emu.cfg`, que traria uma segunda fonte de verdade sobre o
mesmo assunto.

### PS1 e PS2 não abriam: faltava o runtime do Visual C++, não era o caminho do BIOS — 2026-09-11

O Douglas relatou, no mesmo dia das duas entradas acima, que "o PCSX2 ainda é
um problema, antes estava funcionando normal", e logo depois que o
DuckStation também "diz que vai abrir e não abre". A suspeita natural era
regressão das mudanças de BIOS/config do PCSX2 daquela sessão. **Não era.**

O que a investigação mostrou, em ordem:

- `GET /sessions` tinha o mesmo carimbo em **todas** as sessões de PS1 e PS2,
  sem exceção: `exit_error: "exit status 0xc0000135"`, duração de 0 a 1
  segundo. Nenhuma sessão de DuckStation ou PCSX2 nesta máquina jamais durou
  mais que isso. As sessões longas de verdade (SNES, N64, GBA) são todas de
  RetroArch.
- `0xC0000135` é o NTSTATUS `STATUS_DLL_NOT_FOUND`: o processo nasce e o
  carregador do Windows o mata antes da primeira instrução, por faltar uma
  DLL importada.
- Rodar `duckstation-qt-x64-ReleaseLTCG.exe` e `pcsx2-qt.exe` **direto pelo
  terminal, sem o ZeuX no meio**, reproduziu exatamente o mesmo código. Ou
  seja: não passa por código nosso.
- A tabela de importação dos dois binários pede `VCRUNTIME140.dll`,
  `VCRUNTIME140_1.dll` e `MSVCP140.dll` (o DuckStation também
  `MSVCP140_ATOMIC_WAIT.dll`). Nenhuma delas existe em `C:\Windows\System32`
  nesta máquina, e não há nenhuma entrada "Visual C++" no registro de
  programas instalados.
- O `retroarch.exe` **não importa nenhuma dessas DLLs** — é isso, e só isso,
  que faz a mesma máquina jogar SNES e N64 normalmente e não abrir PS1 nem
  PS2. É o mesmo motivo já registrado para o Vita3K na entrada anterior.

**Causa raiz:** o runtime do Microsoft Visual C++ (x64) não está instalado
nesta máquina. Instalá-lo é mexer no sistema do usuário, coisa que o
CLAUDE.md manda perguntar antes — então ficou como recomendação ao Douglas,
não como ação.

**O que foi corrigido no código:** `supervise` (`internal/emulator/session.go`)
gravava `waitErr.Error()` cru na sessão, então o único vestígio do problema
era a string `"exit status 0xc0000135"` — que além de opaca, nem chega à tela
(o front tem `exit_error` em `src/api/types.ts` e não exibe em lugar nenhum).
Agora `describeExitError` traduz **só este código** numa frase acionável que
nomeia o runtime que falta, pelo princípio 3 (nomeie o componente que barra).
Qualquer outro código de saída continua vindo cru de propósito: saída
diferente de zero é rotina quando o usuário fecha o emulador pela janela, e
inventar explicação para ela enganaria mais do que o código.

**Depois de instalar o runtime, a verificação que faltava foi feita.** Com o
VC++ Redistributable instalado (autorizado pelo Douglas), o `pcsx2-qt.exe`
passou a executar de verdade, e o método de snapshot do Flycast finalmente
pôde rodar para o PCSX2 v2.8.2. Resultado:

- O PCSX2 criou a árvore de dados inteira em **`Documentos\PCSX2\`** (cache,
  cheats, covers, gamesettings, inputprofiles, logs, memcards, patches,
  resources, snaps, sstates, textures, videos, `inis\debuggerlayouts`,
  `inis\debuggersettings`).
- Reescreveu `Documentos\PCSX2\inis\PCSX2.ini` com config real de 13 KB por
  cima do esboço de 96 bytes que o ZeuX tinha deixado ali.
- **Não encostou em `%AppData%\PCSX2\`.**

Ou seja: `Documentos\PCSX2\` **estava certo**, e deixou de ser convenção para
virar fato observado. `pcsx2DataDir` e `BiosDir` não precisaram mudar — só os
comentários, que agora dizem "verificado" em vez de "não verificado".

**Achado de bônus, que fecha uma dúvida aberta:** o PCSX2 **varre subpastas**
atrás do BIOS. O BIOS desta máquina estava três níveis abaixo
(`bios\ps2-bios-usa\ps2 bios usa\SCPH-39001…\*.BIN`, do jeito que o .zip foi
extraído), e o PCSX2 achou sozinho e gravou
`[Folders] Bios = bios\ps2-bios-usa\...` mais
`[Filenames] BIOS = SCPH-39001_BIOS_V7_USA_160.BIN`. Por isso o critério
padrão de `BiosDirLooksEmpty` ("a pasta não tem nada dentro") **basta** para o
PCSX2 — ele não precisa do critério próprio que o Flycast precisou.

**Segunda causa, achada por acidente e mais grave que a primeira: rodar
`go test` nesta máquina apagou a instalação real do DuckStation do Douglas.**
Depois que o runtime foi instalado, o `pcsx2-qt.exe` abriu normalmente mas o
`duckstation-qt-x64-ReleaseLTCG.exe` tinha **sumido** — a pasta gerenciada do
DuckStation tinha sobrado só com `.zeux-version` e um arquivo de **1 byte**
chamado `duckstation-qt`, contendo a letra `x`. Esse byte é assinatura: é
literalmente o que `TestPromoteSingleConsoleAdapterGoesInsideConsoleFolder`
(`internal/install/manager_test.go`) escreve —
`os.WriteFile(filepath.Join(staging, "duckstation-qt"), []byte("x"), 0o755)`.

A causa é uma suposição de Unix no isolamento dos testes. Vários deles se
isolam com `t.Setenv("XDG_CONFIG_HOME", t.TempDir())`, mas quem resolve a
raiz é `emulator.ManagedRoot()` → `AppDataDir()` → **`os.UserConfigDir()`**, e
no Windows essa função lê `%AppData%` e **ignora `XDG_CONFIG_HOME`** (a
variável só vale nos caminhos Unix da biblioteca padrão do Go). Resultado: no
Windows esses testes não se isolam de nada — eles escrevem, promovem e
**apagam** dentro do `%AppData%\ZeuX` de verdade do usuário.

O mesmo mecanismo explica a falha de `TestFindBinaryVersionEmptyWithoutMarker`
nesta máquina (`version = "v0.10.1", esperava vazio sem marcador gravado`): o
teste está lendo o `.zeux-version` real da instalação do Douglas, não um
diretório temporário.

**Consequência prática, que precisa virar correção:** hoje, no Windows,
rodar a suíte de testes do próprio projeto destrói dados do usuário. O
conserto certo não é trocar a variável de ambiente — é os testes injetarem a
raiz em vez de perguntarem ao sistema operacional onde ela fica. Isso ficou
**registrado e não corrigido** nesta sessão: mexe em vários testes de
`internal/install` e `internal/emulator` ao mesmo tempo, e o Douglas estava
com o app aberto usando a máquina. Enquanto não for corrigido, **não rode
`go test ./...` no Windows numa máquina com instalação real do ZeuX.**

**Causa terciária, de ambiente, não de código:** havia um `zeuxd` de teste
desta sessão de IA ocupando a porta 7777 (`zeux-dev-tools\zeuxd.exe`, iniciado
às 02:46). O app real do Douglas subiu às 03:46, uma hora depois, e o sidecar
dele não teve porta para ligar — o app acabou conversando com o daemon de
teste. Isso não causou o 0xC0000135 (reproduzido fora do ZeuX), mas é
confusão real de diagnóstico. O processo foi encerrado e a porta devolvida.
**Regra que fica:** daemon de teste de sessão de IA não pode ficar vivo depois
que a sessão termina, porque ele sequestra silenciosamente o app de verdade.

**O que quebra se desfizer:** um emulador que morre no carregador do Windows
volta a registrar só um código hexadecimal que ninguém consegue agir em cima,
e o próximo diagnóstico recomeça do zero.

### O assistente do PCSX2 aparecia porque `seedPCSX2` semeava no lugar errado — e o lugar certo precisa de duas chaves, não uma — 2026-09-11

Com o runtime do Visual C++ instalado (entrada acima), o PCSX2 finalmente
abriu de verdade nesta máquina e o Douglas viu o que ninguém tinha visto
antes: o **"Assistente de Configuração do PCSX2"** na frente do jogo, apesar
de o ZeuX ter um `seedPCSX2` justamente para suprimi-lo.

**Causa raiz:** `seedPCSX2` gravava `inis/PCSX2_qt.ini` **dentro da pasta
gerenciada pelo ZeuX**, presumindo modo portátil. O binário real, no Windows,
lê `Documentos\PCSX2\inis\PCSX2.ini` e jamais olha a pasta gerenciada (o
comentário de `pcsx2DataDir` já alertava para isso desde o Linux). Era código
morto: o arquivo existia, não suprimia nada, e ninguém percebia porque o
PCSX2 nem chegava a executar nesta máquina.

**Como foi medido.** Oito execuções do `pcsx2-qt.exe` v2.8.2 de verdade,
numa **cópia isolada** da instalação (modo portátil via `portable.ini` ao
lado do executável, para não encostar em `Documentos\PCSX2\` do Douglas),
variando só o conteúdo do `inis\PCSX2.ini` e observando (a) o título das
janelas de topo do processo, (b) as pastas criadas e (c) o `emulog.txt`:

| ini semeado | assistente? | árvore de dados | boot de ROM |
|---|---|---|---|
| nenhum arquivo | **aparece** | criada | — |
| `[Main]` vazio (o que o ZeuX gravava) | não | **não criada** | **não dá boot** |
| `[UI] SetupWizardIncomplete = false` | não | **não criada** | **não dá boot** |
| `[UI] SetupWizardIncomplete = true` | não | não criada | — |
| idem + `[Folders]`/`[Filenames]` de BIOS | não | não criada | **não dá boot** |
| `[UI] SettingsVersion = 1` | não | criada | — |
| `[UI] SettingsVersion = 1` + `SetupWizardIncomplete = true` | **aparece** | criada | — |
| `[UI] SettingsVersion = 1` + `SetupWizardIncomplete = false` | não | criada | **dá boot** |

A armadilha está na segunda e na terceira linha: um arquivo "mínimo demais"
faz o assistente sumir e **parece** resolver, mas o PCSX2 trata a config como
inválida — não cria `memcards`, `sstates`, `logs`, e recusa dar boot em
qualquer jogo sem dizer por quê. Trocar um assistente visível por um
emulador que abre e não roda nada seria estrago maior que o problema
original.

**O que manda é `SettingsVersion`.** Com ela presente, o PCSX2 lê o resto do
arquivo — inclusive `SetupWizardIncomplete`, que aí passa a valer de verdade
(linha 7 da tabela prova: com `SettingsVersion` e o assistente marcado como
incompleto, ele volta). Sem ela, nada do arquivo é levado a sério.

**Correção:** `seedPCSX2` (`internal/install/firstrun.go`) agora resolve o
caminho por `emulator.PCSX2ConfigPath()` — função nova, exportada só para
isto, para que exista **uma** fonte de verdade sobre onde o PCSX2 olha
(`internal/install` já dependia de `internal/emulator` via `manager.go`, então
a direção de dependência não mudou) — e grava as duas chaves. A regra de "se
já existe, não mexe" foi mantida: o `PCSX2.ini` de 13 KB do Douglas, com
BIOS, tema e controle configurados, não é tocado. Em macOS, onde o caminho
nunca foi confirmado, a semeadura vira no-op silencioso em vez de erro de
instalação.

**Correção de fato errado que estava documentado.** A entrada anterior (e os
comentários de `pcsx2DataDir` e `bios_dir.go`) afirmavam que "o PCSX2 varre
subpastas atrás do BIOS". **Não varre.** Quem varre é o assistente de
primeira execução — foi ele que achou o BIOS três níveis abaixo e gravou
`[Folders] Bios` apontando para a subpasta funda. No boot, o log é explícito:
`Searching for a BIOS image in '<pasta configurada>'`, e falha se o arquivo
estiver um nível abaixo. **Consequência direta desta correção:** com o
assistente suprimido, o BIOS precisa estar na **raiz** da pasta que
`BiosDir` aponta. O aviso de BIOS do próprio ZeuX é quem cobre isso; o que
não se faz é o ZeuX chutar um caminho de BIOS no `PCSX2.ini`, porque não há
como saber qual arquivo o usuário possui.

**Verificação final, com o código de produção no circuito:** o `seedPCSX2`
real semeou uma cópia portátil limpa, e o `pcsx2-qt.exe` rodou a partir dela
— nenhuma janela de assistente, árvore de dados criada, `BIOS Found` e
`ELF … is executing` no log, com a janela do jogo aberta.

**O que quebra se desfizer:** todo usuário novo de PS2 volta a encontrar o
assistente de configuração entre o clique em "Jogar" e o jogo — exatamente o
tipo de fricção que o ZeuX existe para eliminar. E se alguém "simplificar" o
seed tirando `SettingsVersion`, o sintoma que aparece não é o assistente de
volta: é o PCSX2 abrindo e nunca dando boot em jogo nenhum.

### `go test` no Windows destruindo instalação real — corrigido (2026-09-11)

Fechamento da pendência registrada na entrada acima ("O assistente do
DuckStation…", causa secundária): `os.UserConfigDir()` no Windows lê
`%AppData%` e ignora `XDG_CONFIG_HOME` — só um subconjunto dos testes que
isolam `ManagedRoot()`/`AppDataDir()` já setava as duas variáveis
(`internal/api/server_test.go`, `internal/verdict/images_test.go`,
`internal/igdb/scrape_test.go`, `internal/emulator/retroarch_config_test.go`).
`internal/emulator/discovery_test.go` (5 testes) e `internal/install/manager_test.go`
(4 testes, incluindo o próprio `TestPromoteSingleConsoleAdapterGoesInsideConsoleFolder`
que apagou o DuckStation do Douglas) setavam só `XDG_CONFIG_HOME` — no Windows
isso não isolava nada, e a suíte lia/escrevia/apagava dentro do
`%AppData%\ZeuX` real de quem rodasse os testes.

**Corrigido:** as duas variáveis (`XDG_CONFIG_HOME` + `AppData`) agora são
setadas juntas nos 9 testes que faltavam, mesmo padrão que já existia nos
outros arquivos. `internal/emulator/bios_dir_test.go` não precisou de ajuste
— o teste que só setava `XDG_CONFIG_HOME` já tinha `t.Skip` para todo SO que
não seja Linux, antes de chegar no `Setenv`.

**Ainda não verificado nesta sessão:** rodar a suíte de verdade num Windows
com Go instalado, para confirmar que os 9 testes corrigidos passam e que
nenhum outro caminho equivalente ficou de fora (esta sessão rodou numa
máquina sem toolchain Go/mise instalado — revisão só estática).

**O que quebra se desfizer:** volta o risco documentado acima — rodar
`go test ./...` neste projeto, no Windows, com uma instalação real do ZeuX
na máquina, pode apagar emuladores instalados de verdade.

---

## O que fica fora deste log, de propósito

- Decisões de produto puras (o que o app faz, pra quem, princípios de
  texto/UX) — isso é `visao-do-produto.md`.
- Convenção de pasta/pacote sem trade-off por trás — isso é
  `arquitetura-do-codigo.md`.
- Trabalho ainda não feito — isso é `pendencias.md`.

---

## Revarredura periódica, casamento de pastas tolerante e RPCS3 (2026-10-05)

Relatos do Douglas no Windows: jogo apagado da pasta continuava na biblioteca;
a pasta de ROMs certa apontada, mas o console dizia "nenhuma pasta"; o
controle do PS3 não se configurava; o RPCS3 mostrava as boas-vindas sempre.

- **Revarredura no servidor** (`internal/api/library_autorescan.go`): ao subir
  (+10 s) e a cada hora. Antes só o front revarria, ao abrir uma tela. Jogo
  que sumiu continua só marcado como ausente (`SyncFolder`), nunca apagado.
  `POST /library/rescan` e o botão "Revarrer pastas" cobrem o pedido manual; a
  janela também revarre ao ganhar foco (no máx. a cada 5 min).
- **Pasta para todos os consoles** (`console_match.go`): além do nome exato,
  aceita fabricante/ruído ("Sony - PlayStation 3", "PS3 Games"), apelidos
  (PSX, Genesis, SFC), um nível extra (`Roms/Sony/PS3`) e a própria pasta
  apontada ser a do console. Continua só por NOME de pasta, nunca por extensão.
  Isto é uma hipótese para o "nenhuma pasta": não foi reproduzido com a
  árvore real do Douglas.
- **RPCS3 — boas-vindas:** `GuiConfigs/CurrentSettings.ini` ganha
  `[infoBox] showWelcome=false` ao lançar (só se a chave não existir). Chave
  lida do código do RPCS3, não validada contra o binário.
- **RPCS3 — controle:** o RPCS3 cria o `Default.yml` no teclado na primeira
  abertura, e o preset recusava ("já tem configuração"). Agora reescreve só o
  jogador 1 quando ele ainda está em Teclado/Null; jogador já em controle é
  preservado. Só Windows (XInput), como antes.
- **Firmware do PS3:** o ZeuX abre a página **oficial** da Sony (não link
  direto de arquivo: URL/hash não puderam ser verificados daqui e a Sony
  troca a versão). Baixar o PUP junto com o emulador fica para quando houver
  URL e SHA256 confirmados — ver `docs/pendencias.md`.

---

## Paginação numerada na biblioteca (2026-10-05)

O Douglas pediu paginação ("falta paginação, principalmente nos jogos da
biblioteca"). Isto **desfaz** a troca por scroll infinito feita em 2026-09-06
(achado #3 do `critico-layout-biblioteca`) em "Todos os jogos": voltou a
"Anterior / página N de M / Próxima" (componente `Pagination`), 60 jogos por
página, a grade continua virtualizada dentro da página. A tela de jogos de um
console (`GamesScreen`) também ganhou paginação — no cliente, 60 por página,
depois de filtrar/ordenar —, porque montava todos os jogos de uma vez. Se o
scroll infinito voltar a ser preferido, é só reverter este item.

---

## Tela do jogo sem "Sessões", itens por página e nome do Windows (2026-10-05)

- **Tela do jogo:** a contagem de sessões saiu (o Douglas: "não importa muito")
  junto com a chamada a `GET /sessions` que só existia para ela. O card "Suas
  estatísticas" foi absorvido pelo hero, que tinha um vão grande ao lado do
  "Jogar": uma faixa com tempo jogado, última vez, emulador (do parecer),
  formato do arquivo e "na biblioteca desde" — todos dados que a tela já
  tinha, sem rota nova. Os gêneros do IGDB subiram para o hero também;
  "Sobre o jogo" ficou só com o resumo.
- **Itens por página escolhíveis:** jogos (Todos os jogos e por console, mesma
  preferência) em 12/24/48/96, padrão 24; emuladores em 12/24/48, padrão 24
  (o catálogo inteiro cabe numa página, como decidido em 2026-09-28, mas quem
  quer menos escolhe). Guardado em `localStorage` (`src/lib/pageSize.ts`).
- **Windows 11 aparecia como "10":** a tela de Especificações mostrava
  `os.version`, que é a versão do **kernel** — e o kernel do Windows 11
  continua "10.0.x". Agora o scan devolve `os.name` (ProductName do registro
  via gopsutil, que já corrige o "Windows 10" para "11" quando o build é
  ≥ 22000, mais o DisplayVersion: "Windows 11 Pro 23H2"). O kernel fica no
  detalhe da linha. Não validado numa máquina Windows real nesta sessão.

---

## Hero do jogo ocupa a largura toda (2026-10-05, segunda rodada)

Com as estatísticas no hero, metade dele continuava vazia: a coluna de texto
tinha teto `max-w-3xl` para não passar por cima da arte (contraste). Agora a
coluna não tem teto e vira duas no `lg:` — título, gêneros e "Jogar" à
esquerda; o resumo do IGDB ("Sobre o jogo", antes um card abaixo do hero) à
direita, cortado em 7 linhas com "Ler mais"; a faixa de estatísticas
atravessa as duas. O gradiente do fundo ficou mais denso na direita (62% de
`--paper` na borda, era 18%) para o texto continuar legível sobre a arte.

**Terceira rodada (mesmo dia), com a skill `impeccable` (layout):** a versão
em duas colunas ainda deixava o "Jogar" solto no meio, o "Editar título"
com borda disputando com o título e o resumo a ~700px dele. Virou coluna
única lida de cima para baixo — título (editar vira um lápis discreto) →
uma linha de metadados (console, estúdio · ano, gêneros) → resumo em 3
linhas com "Ler mais" (só quando passa de ~240 caracteres) → "Jogar" →
estatísticas na base. O lado direito do banner voltou a ser arte (gradiente
mais leve). "Última vez" perdeu os segundos para não cortar em janela
estreita. Conferido renderizado em 1600, 1280 e 900px de largura.

**Quarta rodada:** em janela ≥1440px (`min-[90rem]`) as estatísticas viram
uma coluna vertical à direita do banner, separada por um filete — em 1600px
ainda sobravam ~500px sem função. Abaixo disso continuam como faixa na base.
O hero virou grade (capa 220px nas duas linhas, texto em cima, estatísticas
embaixo ou na terceira coluna). Armadilha registrada no código: breakpoint
arbitrário em px é ordenado antes do `sm:` (rem) no CSS do Tailwind v4 e
perde para ele; tem que ser em rem.

---

## Jogos em .zip/.7z nos consoles de cartucho e no DS (2026-10-05)

Pedido de usuários. Os consoles de cartucho atendidos pelo RetroArch (Atari
2600, NES, Master System, PC Engine, Mega Drive, Game Boy/Color/Advance, Game
Gear, SNES, 32X, Virtual Boy, N64, WonderSwan, Neo Geo Pocket) e o Nintendo
DS (melonDS) passaram a reconhecer `.zip` e `.7z` na varredura — só a lista
de extensões do catálogo mudou: o lançamento já passa o caminho do arquivo
direto ao emulador, que abre o compactado sozinho (o RetroArch extrai para a
pasta temporária dele quando o core exige arquivo solto). Não foi validado
contra os binários reais, como o resto dos adapters.

Consoles de disco **não** ganharam zip, de propósito: DuckStation, PCSX2,
Dolphin, RPCS3, xemu e companhia não abrem, e a alternativa seria o ZeuX
extrair o jogo — copiar a ROM, o que a regra do produto proíbe sem decisão
explícita do Douglas (e custa minutos e GB por abertura num jogo de PS2). O
formato compactado que esses emuladores aceitam é o CHD, que o catálogo já
reconhece. `TestArchivesOnlyWhereTheEmulatorOpensThem` trava a lista.

---

## "Continuar de onde parei" — DuckStation e PCSX2 (2026-10-05)

Pedido do Douglas: além do save do jogo (memory card), abrir o jogo no ponto
exato em que a pessoa saiu. Lido no código-fonte dos emuladores (GitHub,
branch master), **não validado com o binário rodando**:

- Os dois gravam um save state de retomada ao fechar: DuckStation
  `[Main] SaveStateOnExit` (padrão ligado, `core/settings.cpp`), arquivo
  `<serial>_resume.sav` em `savestates/`; PCSX2 `[EmuCore]
  SaveStateOnShutdown` (o ZeuX liga ao lançar quando a chave não existe),
  arquivo `<serial> (<CRC>).resume.p2s` em `sstates/`.
- Os dois aceitam `-statefile <arquivo>` (está na ajuda de cada um) e
  **recusam abrir** se o arquivo não existe — por isso o ZeuX só mostra
  "Continuar" com o arquivo presente.
- O ZeuX não lê o serial do disco. Liga estado e jogo pela sessão: ao fim de
  cada sessão, o arquivo de retomada gravado durante ela é deste jogo
  (tabela `resume_states`, migração 0011). Some da tela se o arquivo some.
- DuckStation só na instalação gerenciada (modo portátil): é a única em que
  a pasta de dados é conhecida.

Tela do jogo: com estado, "Continuar" é a ação principal e "Jogar" vira
"Jogar do início". Fica para depois: RetroArch (tem `--entryslot` e
`savestate_auto_save`/`savestate_auto_load`, mas o carregamento automático
vem ligado por padrão, então separar "continuar" de "do início" exige um
`--appendconfig` por lançamento), demais emuladores, e o "Continuar" na
faixa "Continue jogando" da biblioteca.

---

## DuckStation completo: primeira execução, opções, saves e atualização (2026-10-05)

Levantamento do Douglas com o DuckStation 0.1-12070 rodando no Windows
(fatos observados) + leitura do código-fonte oficial (onde dito).

- **Bug corrigido:** com o assistente pulado e um `settings.ini` já
  existente, o seed não fazia nada e o jogador 1 ficava sem botões e sem
  `[Hotkeys]`. Agora `emulator.MergeDuckStationDefaults` **mescla**: na
  instalação (`seedDuckStationPortable`) e antes de cada lançamento com o
  DuckStation fechado (`Launcher.Launch`), o que conserta instalações antigas
  sem reinstalar. Nunca reescreve o arquivo: o DuckStation às vezes grava só
  as diferenças, às vezes tudo, e "restaurar padrões" reordena as seções.
- **Políticas por chave:** `[AutoUpdater] CheckAtStartup = false` é
  **forçado** (o auto-update do DuckStation trocou o .exe durante o teste);
  assistente, `[InputSources]` e `[Hotkeys]` só entram se ausentes; `[Pad1]`
  só se o jogador 1 não tiver bind nenhum (`AnalogController`, teclado + SDL
  no mesmo botão — chave repetida, formato confirmado em
  `INISettingsInterface::GetStringList`); `[MemoryCards] Card1Type =
  PerGameFileTitle` só em instalação nova.
- **Cartão pelo nome da ROM (decisão do Douglas):** com `PerGameTitle` (o
  padrão) o DuckStation nomeia o cartão pelo título do banco interno dele
  (`GameDatabase::GetSaveTitle`, código-fonte), que o ZeuX não tem. Com
  `PerGameFileTitle` o nome é o arquivo da ROM sem extensão, sanitizado
  (`Path::SanitizeFileName`) + `_<slot>.mcd`. Instalações existentes não são
  trocadas (os cartões "sumiriam"); lá o ZeuX tenta o nome da ROM e o título
  limpo e marca o resultado como aproximado.
- **Opções na tela do console PS1:** `GET/PUT /emulators/duckstation/settings`
  — catálogo fechado (seção, chave, tipo, padrão), listas só com valores
  observados ou lidos no código; 409 com o DuckStation aberto.
- **Saves de um jogo:** `GET /library/games/{id}/saves` — cartões pelo nome da
  ROM; states `<SERIAL>_<slot>.sav` pelo serial tirado do estado de retomada
  que o ZeuX liga ao jogo pela sessão (sem sessão encerrada pelo ZeuX, o
  serial é desconhecido).
- **Atualização:** `settings.ini`, `portable.txt`, `memcards`, `savestates`,
  `bios`, `gamesettings`, `inputprofiles` e `playtime.dat` vêm sempre da
  instalação anterior, mesmo que o pacote novo traga item de mesmo nome
  (`portableUserPaths`, só DuckStation).

**Ajuste no mesmo dia (pedido do Douglas, "meio jogado"):** as opções do
DuckStation saíram do meio da coluna da tela do PS1 e viraram um modal,
aberto pelo botão "Configurações do DuckStation" no cartão de prontidão, logo
abaixo do título do console. O modal tem altura com teto (85% da janela),
rola por dentro e mantém "Salvar opções" fixo no rodapé. O cartão do
DuckStation deixou de dizer "configuração só dentro do emulador".

---

## PCSX2: modo portátil, opções, saves por jogo e backup (2026-10-05)

Levantamento do Douglas com o PCSX2 2.8.2 rodando no Windows + leitura do
código-fonte oficial (onde dito).

- **Modo portátil** (código-fonte, `EmuFolders::ShouldUsePortableMode`):
  `portable.ini` (ou `portable.txt` vazio) ao lado do `.exe` faz a pasta de
  dados ser a do executável; `inis` fica sempre dentro dela. A nota de
  2026-09-11 ("o PCSX2 ignora modo portátil") foi um teste sem esse arquivo.
  Instalação nova sem config em Documentos: o seed já cria o `portable.ini`.
  Com config em Documentos: só pela **migração**, com confirmação — copia
  `inis, memcards, sstates, bios, cache, cheats, covers, gamesettings,
  inputprofiles, patches, textures, snaps, videos`, sem sobrescrever o que já
  existe, sem lixo de zip do Mac (`__MACOSX`, `.DS_Store`, `._*`), confere
  arquivo a arquivo, troca caminho absoluto de `[Folders]` que apontava para
  Documentos pelo relativo, e só então liga o portátil. Apagar
  `Documentos\PCSX2` é um segundo passo, com outra confirmação, e só se
  cada arquivo já estiver no destino. Só Windows: no Linux o PCSX2 é
  AppImage e não lê o marcador ao lado do arquivo. **Não validado com o
  binário** — critério de aceite "nenhum arquivo novo em Documentos" fica
  para o Douglas conferir.
- **Escrita:** seed e lançamento mesclam o `PCSX2.ini`; só `[AutoUpdater]
  CheckAtStartup = false` é forçado. O ZeuX **deixou de ligar
  `SaveStateOnShutdown` sozinho** ("não mudar comportamento sem o usuário
  pedir"): virou opção "Salvar o estado ao fechar (permite Continuar)".
  Nunca "Redefinir padrões".
- **Opções** (`GET/PUT /emulators/{id}/settings`, agora genérico para
  DuckStation e PCSX2): catálogo com as chaves do levantamento;
  `InhibitScreensaver` é gravado em `[EmuCore]` e `[UI]`. Fora, de propósito:
  `SPU2/Output Backend/SyncMode` (um valor confirmado cada),
  `OutputLatencyMS` (não confirmado), `Renderer` (só `-1` confirmado), pastas.
- **Backup `.zeux-backup` de 0 bytes:** o marcador vazio ("o arquivo não
  existia na primeira escrita do ZeuX") virava armadilha depois que o
  emulador criava a config completa — restaurar apagaria tudo. Agora um
  backup vazio é trocado pelo conteúdo atual antes da próxima escrita (vale
  para todos os emuladores).
- **Saves por jogo:** serial e CRC lidos do `logs/emulog.txt` ao fim de cada
  sessão (`  Serial: …` / `  CRC: …`, código-fonte `VMManager.cpp`; tabela
  `game_disc_ids`). States `<serial> (<CRC>).NN.p2s`, `.p2s.backup` e
  `.resume.p2s`; cartão compartilhado `Mcd001.ps2`/`Mcd002.ps2` (de
  `[MemoryCards] Slot1/2_Filename`). Tela do jogo (PS1 e PS2): cartão,
  states por slot, Continuar, backup para `AppData\ZeuX\backups\<console>\<jogo>`
  e restauração (backup automático do atual antes; o cartão compartilhado
  só volta se marcado, com aviso de que afeta todos os jogos).
  "Continuar" também aparece quando serial e CRC são conhecidos e o
  `.resume.p2s` existe.
- **Atualização e desinstalação** preservam `portable.ini`, `inis`,
  cartões, states, BIOS e o resto da lista (`portableUserPaths`); a
  desinstalação passou a apagar só o programa nos emuladores portáteis
  (DuckStation incluso).
- **Não feito:** cartão por jogo no PCSX2 trocando `Slot1_Filename` antes de
  cada jogo (não testado pelo Douglas); `[GameList] Paths`.


## Galeria de prints por jogo (2026-10-06)

Pedido do Douglas: tirar print pelo ZeuX e ter a galeria do jogo nos
detalhes, com um print podendo virar banner e os prints aparecendo também na
tela inicial.

- **O print é tirado pelo atalho do próprio emulador**; o ZeuX não captura
  tela. Ao fim de cada sessão (`Launcher.supervise`), as imagens que o
  emulador gravou durante ela (data a partir do início da sessão, com 2 s de
  folga) são **MOVIDAS** (decisão do Douglas, não copiadas) para
  `AppData\ZeuX\screenshots\<console>\<nome do arquivo da ROM>\`. A sessão é o
  que liga print e jogo — o mesmo método do "Continuar".
- **Por que fora de `emulators\<console>\jogos\<id>\`:** aquela pasta é
  apagada quando a pasta de jogos é removida, e o id muda quando ela é
  apontada de novo. O nome da ROM é estável. O banner fica no banco
  (`library_games.banner_name`, migração 0013) só com o nome do arquivo.
- **Pastas de origem, lidas no código-fonte (não observadas com o binário
  rodando):** DuckStation `<dados>\screenshots` ou `[Folders] Screenshots`;
  PCSX2 `<dados>\snaps` ou `[Folders] Snapshots`, descendo um nível por causa
  de "OrganizeScreenshotsByGame"; RetroArch `screenshot_directory`.
- **RetroArch:** o padrão grava o print ao lado da ROM, na pasta do usuário,
  onde o ZeuX não escreve nem recolhe. Por isso, antes de abrir o RetroArch
  (fechado), o ZeuX aponta `screenshot_directory` para
  `screenshots\_entrada\retroarch` **só quando a chave está vazia ou
  "default"** — um caminho escolhido pela pessoa é respeitado e recolhido de
  lá. Backup `.zeux-backup` antes da primeira escrita, como sempre.
- **Risco conhecido:** dois emuladores iguais abertos ao mesmo tempo com
  jogos diferentes dividiriam a mesma pasta de origem — o print iria para o
  jogo cuja sessão fechar primeiro. O ZeuX não abre dois do mesmo emulador
  na prática; fica registrado.
- **Prints manuais e escolha do banner** (mesmo dia): "Enviar prints" na
  galeria e "Escolher banner" no topo da tela do jogo (grade da galeria,
  enviar uma imagem já como banner, ou voltar à capa). O envio **copia** —
  diferente da coleta do emulador, que move: aqueles caem numa pasta de
  trabalho do emulador, estes são arquivos da pessoa em qualquer lugar do
  disco. Teto de 64 MB por imagem (a capa tem 8 MB): print 4K em PNG passa
  de 8 MB e é legítimo. O banner é sempre um arquivo da galeria — imagem
  enviada pelo modal entra nela, para ser achada e apagada no mesmo lugar.
- **Atalho no controle:** pedido do Douglas, ainda não feito. Depende do
  levantamento do Cowork (`docs/prompt-cowork-prints-controle.md`) sobre
  como cada emulador grava uma combinação de botões no arquivo — não se
  inventa formato de bind.

## Tecla de print por emulador (2026-10-06)

Levantamento do Douglas com os emuladores rodando (DuckStation 0.1-12070,
PCSX2 2.8.2, RetroArch com mGBA). Tela: "Tecla de print" no modal de
configurações do DuckStation e do PCSX2; no RetroArch, botão próprio na tela
do console ("Tecla de print do RetroArch").

- **DuckStation e PCSX2:** `[Hotkeys] Screenshot`. Teclado `Keyboard/F10`
  (padrão do DuckStation) / `Keyboard/F8` (PCSX2); controle
  `SDL-0/Back & SDL-0/RightStick` (observado nos dois). Uma ligação por
  atalho — a interface deles substitui a anterior, e gravar duas não foi
  testado —, então o ZeuX grava teclado OU controle. "Nenhum" grava a chave
  vazia em vez de apagar: sem a chave, o DuckStation ganharia F10 de novo
  (`duckStationDefaults` preenche o que falta). Que o emulador leia a chave
  vazia como "sem atalho" não foi testado. `set()` cria `[Hotkeys]` quando
  falta (DuckStation com o assistente pulado).
- **RetroArch:** teclado e controle coexistem. `input_screenshot = "f8"`;
  combo = `input_enable_hotkey_btn` (segura) + `input_screenshot_btn`
  (aperta), em índices do driver xinput: Select+R3 = 7 e 9 (observado), o
  que bate com a tabela de `xinput_joypad.c` (código-fonte) — de onde vêm
  também Start 6, L1 4, R1 5, L3 8. Com outro `input_joypad_driver` o ZeuX
  recusa: os números mudam e chutar quebraria o atalho em silêncio. **Nunca
  cria nem altera `input_enable_hotkey` (teclado)**: o RetroArch a liga
  sozinho como "alt" ao configurar pela interface, e aí os atalhos de
  teclado passam a exigir Alt; a tela avisa quando ela existe. Tirar o combo
  zera só `input_screenshot_btn` — o botão de ativação pode servir a outros
  atalhos.
- **Opções fechadas:** F1–F12 e seis botões (Select, Start, L1, R1, L3, R3).
  O botão Xbox fica de fora (a Game Bar pega antes do emulador; Xbox+Share
  grava em Vídeos\Capturas) e PrintScreen também (do Windows). O servidor
  recusa o mesmo valor de outro atalho do emulador lendo o arquivo de
  verdade (no RetroArch, outra tecla de teclado ou outro hotkey de controle
  no botão de apertar).
- **Pasta do RetroArch:** o valor real era `screenshot_directory =
  ":\screenshots"` — o ":" é a pasta do retroarch.exe. O ZeuX passava o
  valor cru adiante e recolhia de uma pasta que não existe; agora resolve.
- **Bug achado no caminho (já na v0.1.37):** o CORS não liberava PUT, e
  "Salvar opções" do DuckStation/PCSX2 (que grava com PUT) falhava no app
  com "Failed to fetch". Corrigido, com teste que trava todo método em uso.
- **Não feito:** `OrganizeScreenshotsByGame` do PCSX2 (não testado ligado;
  a coleta já desce um nível); o OSD no print em tela cheia do RetroArch
  (`video_gpu_screenshot`, não testado); Flycast, RPCS3, Vita3K, xemu e os
  demais (sem levantamento — o recurso fica desligado para eles).

## Galeria: visualizador grande e releitura ao fechar o jogo (2026-10-06)

Achado do Douglas com o FIFA Street 2 no PCSX2: o print chegava na galeria
(`screenshots\ps2\<ROM>\`), mas a tela do jogo só o mostrava saindo e
voltando — ela lia a pasta uma vez, ao abrir. A associação pasta↔jogo
(console + nome da ROM) estava certa; não há índice além do arquivo.

- O shell já faz poll de `GET /sessions` a cada 4 s (`useSessionWatcher`);
  quando a sessão que rodava some, ele dispara o evento de janela
  `zeux:session-ended`. A galeria e a faixa "Últimos prints" escutam e
  releem. A galeria também relê ao ganhar foco (print posto por fora).
- No zeuxd, a coleta dos prints passou para ANTES de fechar a sessão no
  banco: com a ordem antiga, a tela via a sessão encerrada e relia a pasta
  antes de o print chegar.
- A coleta continua só para jogo aberto pelo ZeuX — é a sessão que liga o
  print ao jogo. Print tirado com o emulador aberto por fora fica na pasta
  do emulador.
- Pedido do Douglas no mesmo dia: o print mais recente aparece grande, como
  um visualizador (setas, contador, clique abre em tela cheia), com as
  miniaturas numa faixa embaixo. Print novo vira o selecionado sozinho.

## "Iniciar do zero" e "Continuar" como modo explícito (2026-10-09)

Pedido do Douglas: ao abrir um jogo, dois botões. "Continuar" retoma o último
save state (o ponto exato onde a pessoa parou); "Iniciar do zero" dá boot
normal, como colocar o disco no console, sem carregar estado nenhum — o save
do memory card continua valendo lá dentro.

- **Modo explícito na API:** `POST /games/launch` aceita `"mode": "fresh" |
  "resume"`. Padrão `fresh`. `"resume": true` continua valendo como `resume`
  (formato anterior). `mode: fresh` com `resume: true` é recusado (400
  `invalid_mode`) em vez de escolher um dos dois em silêncio.
- **Garantia do fresh:** o caminho do estado (`Request.StatePath`) só é
  honrado com `ModeResume`. Em `fresh` ele é ignorado mesmo que sobre no
  pedido, e nenhum argumento de carregamento sai na linha de comando
  (`mode_test.go` trava isso para DuckStation e PCSX2).
- **Disponibilidade do "Continuar":** continua sendo o `resume_saved_at` de
  `GET /library/games`, lido do disco fora do `BuildCommand` (como já era). Sem
  estado, a tela mostra "Continuar" desabilitado com o motivo.

**Mecanismo por emulador** (leitura do código-fonte oficial, não observada com
o binário rodando):

| Emulador | Mecanismo | Fonte | Status |
|---|---|---|---|
| DuckStation | `-statefile <arquivo>` ("Loads state from the specified filename") e `-resume` ("Load resume save state", escolhe pelo nome do jogo ou pelo mais recente) | https://raw.githubusercontent.com/stenzek/duckstation/master/src/duckstation-qt/qthost.cpp (`PrintCommandLineHelp`, `ParseCommandLineParametersAndInitializeConfig`) | Implementado com `-statefile`, que aponta o estado deste jogo; `-resume` não foi usado porque escolheria pelo nome do jogo ou pelo mais recente. |
| PCSX2 | `-statefile <filename>` ("Loads state from the specified filename."). Não há `-resume` no `QtHost.cpp`. | https://raw.githubusercontent.com/PCSX2/pcsx2/master/pcsx2-qt/QtHost.cpp | Implementado. |
| RetroArch | `-e, --entryslot=NUMBER` ("Slot from which to load an entry state."); `--appendconfig=FILE` para config extra | https://raw.githubusercontent.com/libretro/RetroArch/master/retroarch.c (`retroarch_print_help`) | Superado em 2026-10-09 (ver "Iniciar do zero e Continuar no RetroArch", no fim do arquivo). Na data desta entrada era `Unapplied`, porque o `-e` não resolvia sozinho o carregamento automático do `retroarch.cfg`. |
| Demais standalone (Dolphin, PPSSPP, Flycast, RPCS3, MelonDS, Azahar, Xemu, Vita3K, Xenia, Cemu, RMG) | Nenhum levantado | — | Via `Unapplied` (`resumeUnappliedMessage`). |
| Emulador personalizado | Gramática do template é do usuário | — | Via `Unapplied`. |

**Correção de decisão anterior:** a entrada de 2026-10-05 dizia que o
`savestate_auto_load` do RetroArch "vem ligado por padrão". Lendo
`config.def.h` do RetroArch, o padrão é `false` (`DEFAULT_SAVESTATE_AUTO_LOAD
false`). O risco real não é o padrão: é um `retroarch.cfg` do próprio usuário
com o auto-load ligado, que faria o "fresh" do RetroArch abrir no estado
mesmo assim. O ZeuX ainda não consegue garantir isso — pendência em
`pendencias.md`.

**Não validado:** que DuckStation e PCSX2 não carreguem um estado de retomada
sozinhos ao iniciar sem nenhuma flag. A ajuda dos dois não descreve auto-load
(só `SaveStateOnExit` grava), mas isso não foi confirmado com o binário.

## Saves por jogo no RetroArch (2026-10-09)

Pedido do Douglas: o ZeuX localizar e gerir cartão e save states de todos os
emuladores, como já faz com DuckStation e PCSX2. Esta rodada cobre o RetroArch,
que é o adapter que mais consoles atende.

- **Diretórios:** `savefile_directory` e `savestate_directory` lidos do
  `retroarch.cfg` real (`retroArchSaveDataDirs`, já existente). Chave vazia ou
  `"default"` cai na pasta da ROM. Fonte primária: comentário do
  `retroarch.cfg` oficial (https://raw.githubusercontent.com/libretro/RetroArch/master/retroarch.cfg):
  "Save all save files (*.srm) to this directory" / "Save all save states
  (*.state) to this directory" / "This will be overridden by explicit command
  line options".
- **Nome do arquivo de cada jogo: NÃO verificado em documentação oficial.** As
  fontes encontradas foram fóruns e readme de core (RetroPie, forums.libretro.com):
  o save leva o nome da ROM sem extensão, `<jogo>.srm`; states `<jogo>.state`,
  `<jogo>.stateN` (slot N) e `<jogo>.state.auto` (auto-save, comentário de
  `savestate_auto_save` no retroarch.cfg: "The path is $SRAM_PATH.auto"). Por
  isso o resultado sai com `memory_cards_approximate: true`. O slot 0 para
  `.state` sem número é dedução, não documentado.
- **Flag de linha de comando:** nenhuma flag de save foi usada nesta entrada.
  `--appendconfig` e `-e/--entryslot` estão na ajuda do `retroarch.c` (ver a
  entrada de 2026-10-09, "Iniciar do zero e Continuar no RetroArch"), mas o
  que o ZeuX faz com eles é decisão daquela entrada, não desta. A pasta de
  save continua vindo da config.
- **Ligação com a API:** consoles sem emulador dedicado de save
  (`saveAdapterFor`: só PS1 e PS2) passam a usar o RetroArch quando ele cobre o
  console no registro. O ZeuX não sabe qual emulador abriu o jogo, então a
  resposta é "saves do RetroArch", não certeza sobre o último lançamento.
- **O que quebra se desfizer:** a tela do jogo deixa de listar saves de
  RetroArch (volta a `known: false`), e o backup/restauração desses consoles
  para de funcionar, sem erro visível.
- **Não validado com o binário:** a convenção de nomes precisa de uma sessão
  real (salvar um jogo e conferir o arquivo gerado).

## Iniciar do zero e Continuar no RetroArch (2026-10-09)

Pedido do Douglas: o modo "fresh"/"resume" da entrada anterior tem que valer
no RetroArch também. Ele não tem flag de linha de comando que diga "abra no
estado" ou "abra sem estado": quem decide é `savestate_auto_load` no
`retroarch.cfg` do usuário. O ZeuX passa um arquivo extra que tem prioridade
sobre o `retroarch.cfg`.

**Fontes (lidas com WebFetch nesta data):**

- `--appendconfig` (ajuda de `retroarch_print_help`, `retroarch.c`):
  "Extra config files are loaded in, and take priority over config selected in
  -c (or default)." e "To keep them out of it, put config_save_on_exit = "false"
  in the appended file." (https://raw.githubusercontent.com/libretro/RetroArch/master/retroarch.c)
- Carregamento do estado na abertura (`runloop.c`):
  `if (runloop_st->entry_state_slot < 0 && settings->bools.savestate_auto_load) command_event_load_auto_state();`
  e, antes, `if (entry_state_load && !command_event_load_entry_state(settings))`,
  onde `entry_state_load` vem de `entry_state_slot > -1` (só `-e` define o slot).
  (https://raw.githubusercontent.com/libretro/RetroArch/master/runloop.c)
- Caminho do estado automático (`retroarch.cfg`, comentário de `savestate_auto_load`):
  "The path is $SRAM_PATH.auto" e "RetroArch will automatically load any savestate
  with this path on startup if savestate_auto_load is set." Gravado ao fechar
  quando `savestate_auto_save` está ligado. (https://raw.githubusercontent.com/libretro/RetroArch/master/retroarch.cfg)
- Padrões (`config.def.h`): `DEFAULT_SAVESTATE_AUTO_LOAD false` e
  `DEFAULT_SAVESTATE_AUTO_SAVE false`.

**Mecanismo escolhido:**

- **Iniciar do zero:** arquivo extra com `savestate_auto_load = "false"`. O
  RetroArch não carrega `<jogo>.state.auto` mesmo com o `retroarch.cfg` do
  usuário ligado.
- **Continuar:** arquivo extra com `savestate_auto_load = "true"`. Na abertura o
  RetroArch carrega `<jogo>.state.auto`.
- **Não usamos `-e/--entryslot`.** Ele existe ("Slot from which to load an entry
  state.") e carregaria um slot numerado, mas o nome do arquivo de cada slot
  (`.state`, `.stateN`) ainda é dedução (`retroarch_saves.go`), e o ZeuX não
  confirmou isso contra o binário. O auto-load usa um nome que a fonte documenta.
- `config_save_on_exit = "false"` vai em todo arquivo extra. Sem isso, o
  `savestate_auto_load` de cada modo seria gravado no `retroarch.cfg` do usuário
  quando o RetroArch salvar a config ao fechar, e o comportamento de outros jogos
  mudaria sem pedido.

**Quem grava o arquivo e onde:** `writeRetroArchAppendConfig` (em
`internal/emulator/retroarch_resume.go`), chamado por `Launcher.Launch` antes de
`BuildCommand`. Caminho: `<AppDataDir>/retroarch/lancamento-fresh.cfg` ou
`lancamento-resume.cfg` (`AppDataDir` é a pasta de dados do ZeuX, nunca a do
usuário). Regravado a cada lançamento, porque o conteúdo não depende do jogo.
`BuildCommand` continua pura: recebe o caminho em `Request.AppendConfigPath`,
monta `--appendconfig=<caminho>` antes do caminho do jogo, e declara em
`Unapplied` se o caminho não veio (prévia, ou gravação que falhou). Caminho com
`|` é recusado: o RetroArch separa vários arquivos por esse caractere. Falha de
gravação não bloqueia o jogo; vira aviso na sessão.

**"Continuar" no RetroArch.** O estado entra no mesmo `resume_states` dos outros
emuladores. Ao fim da sessão, `recordResumeState` procura `<jogo>.state.auto`
(pasta de estados do `retroarch.cfg`, ou a da ROM quando `default`) com data a
partir do início da sessão (folga de 2 s). Se achar, grava o registro com
`adapter_id: "retroarch"`. `GET /library/games` expõe `resume_saved_at` como para
os demais, e a tela do jogo deixa "Continuar" habilitado. Um `.state.auto` de
antes da sessão não conta, para que "Continuar" nunca mostre um "onde você
parou" que ninguém salvou.

**Consequências:**

- "Continuar" só aparece no RetroArch quando o salvamento automático está ligado
  no próprio RetroArch (`savestate_auto_save`). O ZeuX não liga essa opção
  sozinho, pelo mesmo motivo da decisão de 2026-10-05 sobre o PCSX2: não mudar o
  comportamento do emulador sem pedido. Sem ela, nenhum `.state.auto` é gravado
  e o botão fica desabilitado com o motivo ("O RetroArch grava um ao fechar o
  jogo se o salvamento automático estiver ligado nele").
- A tela do RetroArch deixou de usar o texto genérico "Este emulador ainda não
  abre o jogo num estado salvo" (`resumeUnsupported`), que não vale mais para ele.
- **O que quebra se desfizer:** o "Iniciar do zero" no RetroArch volta a depender
  do `retroarch.cfg` do usuário (se o auto-load estiver ligado, o jogo abre no
  estado), e o "Continuar" some sem erro visível.

**Não validado com o binário:** `--appendconfig` com `savestate_auto_load` nos
dois valores, a prioridade do arquivo extra sobre o `retroarch.cfg`, e que o
`config_save_on_exit = "false"` impede a gravação de volta. Também não foi
verificado que o RetroArch não consulta playlist (`PLAYLIST_ENTRY_SLOT` em
`runloop.c`) ao abrir por caminho de ROM.

**Limite conhecido:** em `runloop.c`, o bloco que carrega estado na abertura só
roda com `!cheevos_enable || !cheevos_hardcore_mode_enable`. Com RetroAchievements
em modo hardcore, "Continuar" não carrega nada e o ZeuX não avisa isso.

## savestate_auto_save ligado pelo ZeuX (2026-10-09)

Decisão do Douglas (2026-10-09): o ZeuX liga `savestate_auto_save` do RetroArch
nos dois arquivos de override (`lancamento-fresh.cfg` e `lancamento-resume.cfg`).
Sem isso não nasce `<jogo>.state.auto`, e o "Continuar" nunca habilita. Vale
também no "Iniciar do zero": é ao sair de uma partida iniciada do zero que nasce
o primeiro estado para continuar depois.

**Fontes (lidas em 2026-10-09 pelo `curl` no raw do GitHub, não por resumo):**

- `retroarch.cfg`, comentário de `savestate_auto_save`: "Automatically saves a
  savestate at the end of RetroArch's lifetime. The path is $SRAM_PATH.auto."
  e "RetroArch will automatically load any savestate with this path on startup
  if savestate_auto_load is set."
  (https://raw.githubusercontent.com/libretro/RetroArch/master/retroarch.cfg)
- `config.def.h`: `#define DEFAULT_SAVESTATE_AUTO_SAVE false` (o padrão é
  desligado, por isso o ZeuX precisa ligar explicitamente).
  (https://raw.githubusercontent.com/libretro/RetroArch/master/config.def.h)
- `retroarch.c`: três chamadas a `command_event_save_auto_state()` guardadas por
  `settings->bools.savestate_auto_save` (uma delas com a condição
  `RUNLOOP_FLAG_CORE_RUNNING && !RUNLOOP_FLAG_SHUTDOWN_INITIATED`, com o
  comentário "Save auto state"). Não rastreei cada caminho até o fim do
  encerramento; o que se afirma é que a gravação depende dessa chave.
  (https://raw.githubusercontent.com/libretro/RetroArch/master/retroarch.c)
- `command.c`, `command_event_save_auto_state`: monta o nome como o nome do
  estado mais `.auto` (`strlcpy_lit(... ".auto")`) e chama
  `content_auto_save_state`. Não conferi de onde vem `runloop_st->name.savestate`
  (espera-se `<jogo>.state`); essa parte segue sem verificação direta.
  (https://raw.githubusercontent.com/libretro/RetroArch/master/command.c)
- `runloop.c`: o carregamento na abertura só roda com
  `entry_state_slot < 0 && settings->bools.savestate_auto_load`. Já citado na
  entrada de 2026-10-09 ("Iniciar do zero e Continuar no RetroArch").

**Por que difere do PCSX2 (decisão de 2026-10-05):** naquela data o ZeuX não
ligou o auto-save do PCSX2 sem pedido, porque isso muda o comportamento do
emulador. Agora há pedido explícito do Douglas, registrado aqui, e a escolha vale
só para os lançamentos feitos pelo ZeuX: `config_save_on_exit = "false"` impede
que a chave escape para o `retroarch.cfg` do usuário. O PCSX2 segue como estava.

**Consequências:**

- Ao fechar um jogo aberto pelo ZeuX, o RetroArch grava `<jogo>.state.auto`
  (nos dois modos). O "Continuar" passa a habilitar depois da primeira sessão.
- Um estado de retomada gravado pelo ZeuX sobrescreve o anterior, mesmo quando a
  sessão foi "Iniciar do zero". Isso é intencional: o último ponto da partida
  passa a ser o que "Continuar" retoma.
- Os textos de UI que condicionavam o "Continuar" ao auto-save do RetroArch
  foram ajustados (`src/screens/GameDetailScreen.i18n.ts`).
- A entrada de 2026-10-09 ("Iniciar do zero e Continuar no RetroArch") dizia que
  o ZeuX não ligava essa opção; esta entrada a supera nesse ponto.

**O que quebra se desfizer:** remover a linha do override faz o "Continuar" do
RetroArch sumir sem erro visível, e o "Iniciar do zero" continua correto (o
auto-load é controlado à parte).

**Não validado com o binário:** que o arquivo gerado no disco tem o nome
`<jogo>.state.auto` e fica na pasta de estados do `retroarch.cfg`.

## Saves e retomada: Azahar, melonDS e Flycast (2026-10-09)

Pedido do Douglas: localizar saves e states destes três emuladores e, onde o
código-fonte permitir, "Iniciar do zero" e "Continuar". Pesquisa feita no
código-fonte oficial (raw do GitHub, baixado com `curl`), **não observada com o
binário rodando**. Cada afirmação abaixo traz o arquivo de onde saiu.

**Resultado por emulador:**

| Emulador | Saves de jogo | States | Fresh | Resume | Status |
|---|---|---|---|---|---|
| Azahar (3DS) | `<usuário>\sdmc\Nintendo 3DS\<id0>\<id1>\title\<alto>\<baixo>\data\00000001\` (árvore) | `<usuário>\states\<ID 16 hex>.<slot 02d>.cst` | Sem flag (boot normal) | **Não**: nenhuma flag de estado em `citra_qt.cpp` (`-d -f -g -h -i -p -r -a -m -v -w`) | Saves e states listados; ID lido do `.3ds`; `.cia` desconhecido |
| melonDS (DS) | `<ROM>.sav` na pasta da ROM, ou `SaveFilePath` do `melonDS.toml` | `<ROM>.ml0`–`.ml9`, ou `SavestatePath` | Sem flag | **Não**: `CLI.cpp` só tem `-b`, `-f`, `-a`, `-A` | Saves e states listados; sem o toml, aproximado |
| Flycast (Dreamcast, Windows) | VMU `<gameId>_vmu_save_A1.bin` (com `PerGameVmu`, padrão) — o código vem do disco | `<ROM>.state` (slot 0), `<ROM>_N.state` (1–9), na pasta `data` ao lado do `.exe` | `-config Dreamcast:AutoLoadState=no` | `-config Dreamcast:AutoLoadState=yes` + `-config Dreamcast:SavestateSlot=N` | Estados listados e "Continuar" ligado; cartão desconhecido com `PerGameVmu` ligado |

**Fontes com trecho citado:**

- Azahar, `src/core/savestate.cpp`, `GetSaveStatePath`: `fmt::format("{}{:016X}.{:02d}.cst", StatesDir, program_id, slot)`.
  Azahar, `src/core/file_sys/archive_source_sd_savedata.cpp`, `GetSaveDataPath`: `"{}{:08x}/{:08x}/data/00000001/"` com as metades do ID, dentro de
  `"{}Nintendo 3DS/{}/{}/title/"`. Azahar, `src/common/file_util.cpp`, `SetUserPath`: `user` ao lado do exe, senão `%AppData%\Azahar`.
  Azahar, `src/common/common_paths.h`: `USERDATA_DIR "user"`, `EMU_DATA_DIR "Azahar"` (Windows), `STATES_DIR "states"`, `SDMC_DIR "sdmc"`.
  Azahar, `src/core/file_sys/ncch_container.h`: `NCSD_Header.partitions` em 0x120; `NCCH_Header.program_id` depois de `product`/`maker` (offset 0x118 pela soma dos campos).
  Azahar, `src/core/hle/service/fs/archive.cpp`: `ArchiveIdCode::SaveData` usa `ArchiveSource_SDSaveData`, então o save de jogo fica no sdmc.
  Azahar, `src/citra_qt/citra_qt.cpp`: lista de opções da linha de comando (sem flag de estado).
- melonDS, `src/frontend/qt_sdl/EmuInstance.cpp`: `getAssetPath` (pasta configurada ou da ROM; nome `baseAssetName` = ROM sem a última extensão), `getSavestateName` (`".ml" + slot`), `loadROMData`/DS (`".sav"` com `SaveFilePath`); `main.cpp`, `pathInit`: `portable` ao lado do exe, senão a pasta de config do Qt; `Config.cpp`: `kConfigFile = "melonDS.toml"` e as chaves `SaveFilePath`/`SavestatePath` na raiz. `CLI.cpp`: só `-b`, `-f`, `-a`, `-A`.
- Flycast, `core/cfg/cl.cpp`, `usage()`: `-config section:key=value` ("set a transient config value") e "Transient config values won't be saved to emu.cfg."
  Flycast, `core/cfg/option.cpp`: `Option<bool> AutoLoadState("Dreamcast.AutoLoadState")` (padrão false), `Option<bool> AutoSaveState("Dreamcast.AutoSaveState")`, `Option<int, false> SavestateSlot("Dreamcast.SavestateSlot")`, `Option<bool> PerGameVmu("PerGameVmu", true, "config")`, `Dreamcast.SavestatePath` (lista separada por `;`).
  Flycast, `core/emulator.cpp`, `Emulator::loadGame`: `else if (config::AutoLoadState ...) dc_loadstate(config::SavestateSlot);`; `unloadGame`: `gui_saveState(false)` quando `AutoSaveState`.
  Flycast, `core/nullDC.cpp`, `dc_savestate`/`dc_loadstate`; `core/oslib/oslib.cpp`, `getSavestatePath`: `<nome sem última extensão>` + `_N` (se N > 0) + `.state`.
  Flycast, `core/ui/settings_general.cpp`: rótulos "Automatic State:", "Load" e "Save" (o texto da UI usa essa mesma opção).
  Flycast, `core/cfg/ini.cpp`, `getBool`: só `yes`, `true`, `on`, `1` ligam.
  Flycast, `core/windows/winmain.cpp`, `setupPath`: `emu.cfg` na pasta do exe, dados em `data\` ao lado dele (portátil).

**Mecanismo escolhido:**

- **Azahar e melonDS, saves e states:** localização por nome/ID, sem nenhum
  argumento de linha de comando. Azahar: o ID do programa é lido do cabeçalho do
  `.3ds` (`azaharProgramID`, só os bytes do cabeçalho). Save de jogo é uma
  árvore; cada arquivo entra na lista e o backup copia um a um (o backup não
  precisou de mudança: `Restore` recria as subpastas com `MkdirAll`).
- **Flycast, retomada:** `-config` transitório, por ser o único mecanismo
  documentado que não grava no `emu.cfg` do usuário. "Iniciar do zero" manda
  `AutoLoadState=no` em todo lançamento, então um `emu.cfg` com o carregamento
  ligado não abre o jogo no estado. "Continuar" manda `AutoLoadState=yes` e o
  `SavestateSlot` do arquivo escolhido. O slot não é lido do nome do arquivo
  sozinho: `flycastStateSlot` compara com o nome da ROM do pedido, porque
  `Crazy_1.state` pode ser o slot 0 de `Crazy_1` ou o slot 1 de `Crazy`.
- **Azahar e melonDS, retomada:** não implementada. Sem flag documentada, o
  `Continuar` fica desabilitado e a tela mostra "Este emulador ainda não abre o
  jogo num estado salvo" (`resumeUnsupported`). Editar o `config` do emulador
  para forçar isso foi descartado, pelo mesmo motivo das decisões de 2026-10-05.
- **Flycast, "Continuar" depende de uma opção do usuário:** o Flycast só grava o
  estado ao fechar se `AutoSaveState` estiver ligada no emulador. O ZeuX **não
  liga essa opção** nos lançamentos (diferente do RetroArch, que o Douglas
  autorizou em 2026-10-09). A tela diz a condição (`resumeNoStateFlycast`).
  Ligar com `-config Dreamcast:AutoSaveState=yes` transitório é tecnicamente
  igual ao caso do RetroArch: fica como decisão pendente do Douglas.
- **Flycast, cartão:** com `PerGameVmu` ligado (padrão), o arquivo do cartão é
  `<código do disco>_vmu_save_A1.bin`, e o código vem do disco, que o ZeuX não
  lê. Então o resultado sai com `memory_cards_unknown: true` e a lista vazia — o
  que a tela mostra como "desconhecido", não "nenhum cartão". Com `PerGameVmu`
  desligado, lista o `vmu_save_A1.bin` compartilhado e marca
  `memory_card_shared`.

**Mudanças que afetam emuladores já existentes:**

- `saveAdapterFor` ganhou 3DS, DS e Dreamcast. Se o emulador dedicado **não**
  estiver instalado, `gameSavesContext` cai no RetroArch quando ele cobre o
  console. Isso vale também para PS1 e PS2: antes, sem DuckStation/PCSX2
  instalados, a resposta era `known: false`; agora pode mostrar os saves do
  RetroArch (com a mesma ressalva de "pode não ser o último emulador usado").
- A tela de saves só exige o serial do disco para DuckStation e PCSX2. Antes,
  qualquer jogo sem `serial` mostrava "Os estados aparecem depois que você
  jogar…" — **inclusive o RetroArch, cujos states nunca apareciam**. Isso foi
  corrigido de carona.
- `GameSaves` ganhou `memory_cards_unknown` (JSON `memory_cards_unknown`).

**O que quebra se desfizer:** tirar o `-config Dreamcast:AutoLoadState=no` do
fresh faz o "Iniciar do zero" do Flycast abrir no estado se o `emu.cfg` do
usuário tiver o carregamento ligado. Tirar os `-config` do resume faz o
"Continuar" do Flycast abrir no início sem aviso (o estado fica ali, sem
uso). Remover os casos de `saveAdapterFor` faz 3DS/DS/Dreamcast voltarem a
depender só do RetroArch.

**Não validado com o binário (todos):**

- Azahar: que o save do jogo cai mesmo em `sdmc\…\data\00000001\` (a árvore
  foi lida no código, não num save real); que não existe auto-load de state por
  config (não achado nos arquivos lidos, não exaustivo); que os IDs `<id0>/<id1>`
  são os que a pasta usa. A pasta do usuário no Linux e no macOS não foi lida: lá
  o ZeuX não aponta nada.
- melonDS: que o Qt grava o `melonDS.toml` em `%LocalAppData%\melonDS` (a tabela
  da documentação do Qt aponta `AppData/Local` para `ConfigLocation`, não foi
  testado). Sem o arquivo, o resultado sai aproximado.
- Flycast: que `-config Dreamcast:AutoLoadState=yes|no` e
  `Dreamcast:SavestateSlot=N` são aceitos pelo binário na linha de comando, e que o
  valor transitório não é sobrescrito pelo `loadGameSpecificSettings`. Que o
  autosave grava `<nome>.state` no slot configurado (lido em `nullDC.cpp`, não
  observado).
- Os três: nenhuma flag foi confirmada com o binário; as flags do Flycast estão
  no código-fonte de `cl.cpp` e `option.cpp`, e a ajuda do binário (que diz a
  mesma coisa) não foi conferida ao vivo.
