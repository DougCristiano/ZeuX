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

---

## O que fica fora deste log, de propósito

- Decisões de produto puras (o que o app faz, pra quem, princípios de
  texto/UX) — isso é `visao-do-produto.md`.
- Convenção de pasta/pacote sem trade-off por trás — isso é
  `arquitetura-do-codigo.md`.
- Trabalho ainda não feito — isso é `pendencias.md`.
