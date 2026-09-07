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

---

## O que fica fora deste log, de propósito

- Decisões de produto puras (o que o app faz, pra quem, princípios de
  texto/UX) — isso é `visao-do-produto.md`.
- Convenção de pasta/pacote sem trade-off por trás — isso é
  `arquitetura-do-codigo.md`.
- Trabalho ainda não feito — isso é `pendencias.md`.
