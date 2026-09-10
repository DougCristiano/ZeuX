# CLAUDE.md — instruções para sessões de IA no ZeuX

Leia este arquivo antes de mexer em qualquer coisa. Ele registra convenções e
restrições que não são óbvias a partir do código.

**Idioma: tudo em português do Brasil.** Comentários, mensagens de erro, textos
de UI, documentação e commits. O dono do projeto (Douglas) é brasileiro e se
comunica em português. Só os identificadores de código ficam em inglês.

---

## O que é o ZeuX

Front-end de emulação multiplataforma para desktop, com camada social. O
diferencial é **eliminar a complexidade de configuração**: o app lê o hardware,
diz honestamente o que a máquina alcança, e autoconfigura o emulador.

Documentação de referência (leia conforme a tarefa). Reescrita do zero em
2026-09-07 — o conjunto anterior (arquitetura.md, adapters.md, roadmap.md,
15 ADRs separadas) foi apagado por ter ficado defasado do código real; este
é o conjunto atual:

- [`docs/visao-do-produto.md`](docs/visao-do-produto.md) — o que o ZeuX é, pra quem, princípios inegociáveis, histórias de uso. A "lei" do produto — nada de código aqui.
- [`docs/arquitetura-do-codigo.md`](docs/arquitetura-do-codigo.md) — pastas, pacotes, fronteiras de dependência, convenções de código, orçamento de simplicidade.
- [`docs/api.md`](docs/api.md) — todas as rotas HTTP, agrupadas por domínio, com a tabela de códigos de erro.
- [`docs/decisoes.md`](docs/decisoes.md) — log cronológico de decisões técnicas não-óbvias: o quê, por quê, o que quebra se desfizer.
- [`docs/pendencias.md`](docs/pendencias.md) — trabalho planejado mas ainda não implementado (backlog honesto, não aspiracional).

---

## Comandos

O `mise` gerencia as toolchains e no Windows não está no `PATH` por padrão.
Prefixe as sessões PowerShell com:

```powershell
$env:PATH = "C:\Users\doufl\AppData\Local\Microsoft\WinGet\Packages\jdx.mise_Microsoft.Winget.Source_8wekyb3d8bbwe\mise\bin;$env:PATH"
```

Depois disso:

```powershell
mise exec -- go build ./...
mise exec -- go vet ./...
mise exec -- go test ./...
mise exec -- go run ./cmd/zeuxd            # daemon em 127.0.0.1:7777
mise exec -- go run ./cmd/zeuxd --debug    # + log por requisição
```

Compilação cruzada (obrigatória ao mexer em `internal/hardware/` ou
`internal/emulator/discovery.go`, que têm caminhos por SO):

```powershell
foreach ($os in @('linux','darwin')) {
    $env:GOOS = $os
    mise exec -- go build ./...
    if ($?) { "$os -> OK" } else { "$os -> FALHOU" }
}
$env:GOOS = ''
```

> `&&` e `||` não existem no Windows PowerShell 5.1. Use `; if ($?) { ... }`.

### Verificar a API pelo terminal

Este projeto foi construído inteiro sem UI, exercitando a API direto. Continue
assim — é mais rápido que qualquer outro caminho:

```powershell
$base = "http://127.0.0.1:7777/api/v1"
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/consent" -Method Post -Body '{"granted":true}' -ContentType "application/json"
Invoke-RestMethod "$base/hardware/scan" -Method Post | ConvertTo-Json -Depth 5
Invoke-RestMethod "$base/consoles/verdicts" | ConvertTo-Json -Depth 6
```

O roteiro completo está no fim de [`docs/api.md`](docs/api.md).

---

## Estrutura

```
cmd/zeuxd/           entrypoint do daemon
internal/api/        rotas HTTP e formato de erro
internal/consent/    consentimento persistido e versionado
internal/hardware/   detecção de CPU/RAM (gopsutil) e GPU (um arquivo por SO)
internal/verdict/    catálogo embutido + motor de parecer + logos de console embutidas
internal/emulator/   adapters, descoberta de binários, launcher
internal/install/    instalação de emuladores + download de cores do RetroArch
internal/library/    catálogo de ROMs do usuário (pastas, jogos, favoritos)
internal/igdb/       scraper de capas (G1) — credencial do próprio usuário
internal/store/      persistência local (SQLite, ADR 0011): migrações e conexão
cmd/generate-retroarch-manifest/
                     mede URL/tamanho/SHA256 dos cores e escreve o manifesto
                     embutido (ADR 0015, R1). Roda à mão, nunca no build.
cmd/generate-console-images/
                     busca no IGDB a logo de cada console e escreve
                     internal/verdict/data/console-images/. Roda à mão,
                     nunca no build (ver docs/decisoes.md).
docs/                esta documentação
```

Dependência importante: **`verdict` depende de `emulator`, nunca o contrário.**
O catálogo carrega `emulator.Options` diretamente. Se algum dia `emulator`
precisar de `verdict`, pare e repense — é sinal de problema de desenho.

---

## Convenções de código

### Comentários explicam o PORQUÊ, não o QUÊ

Esta é a convenção mais forte do repositório e a mais fácil de quebrar. O código
já diz o que faz; o comentário existe para registrar a razão, o trade-off, ou a
armadilha que motivou aquela linha.

Ruim:

```go
// Adiciona a flag de tela cheia.
if req.Options.Fullscreen {
    args = append(args, "-fullscreen")
}
```

Bom (padrão do repositório):

```go
// O "--" separa as opções do caminho do jogo. Sem ele, ROMs cujo nome
// começa com hífen seriam lidas como flag.
return append(args, "--", req.ROMPath), unapplied
```

Todo pacote tem um doc comment que explica sua razão de existir e a regra de
produto que ele encarna. Mantenha isso ao criar pacotes novos.

### Idioma no código

| Elemento | Idioma | Exemplo |
|---|---|---|
| Tipos, funções, campos, variáveis | **Inglês** | `HardwareInfo`, `BuildCommand`, `Unapplied` |
| Comentários e doc comments | **Português** | `// O processo é desligado do contexto de propósito...` |
| Mensagens de erro | **Português** | `"o emulador %s não atende o console %q"` |
| Mensagens ao usuário (`Unapplied`, `Warnings`, `Headline`) | **Português** | `"A resolução interna precisa ser ajustada dentro do DuckStation."` |
| Chaves de JSON e valores de enum | **Inglês / sem acento** | `console_id`, `level: "otimo"` |
| Nomes de teste | **Inglês**, comentário em português | `TestPCSX2SeparatesOptionsFromROM` |

`level: "otimo"` é sem acento de propósito: é chave, não texto de UI. O texto
que o usuário lê vem de `Level.Headline()`.

**Exceção decidida pelo Douglas em 2026-08-07:** os valores de `?sort=` em
`GET /library/games` (Sprint M, item M3) ficam em português —
`recentes`/`titulo`/`tempo_jogado` — em vez de `recent`/`title`/`playtime`.
Motivo: é preferência de tela consumida só pela própria UI do ZeuX, e o
Douglas pretende gerar uma tradução da API para inglês depois; até lá, manter
consistência com o restante do vocabulário em português custa menos do que
traduzir só este parâmetro. Não use este caso como precedente para outra
chave ou enum sem perguntar — é exceção pontual, registrada aqui pelo mesmo
motivo que `level: "otimo"` está.

### Erros

- Erros devolvidos ao usuário são frases completas em português, já exibíveis.
- Envolva com contexto: `fmt.Errorf("detectando CPU: %w", err)`.
- Erros da API têm `code` estável (inglês, `snake_case`) + `message` (português).
- Falha de lançamento é **400, não 500**: é quase sempre algo que o usuário pode
  resolver.

### Testes

- Todo teste tem um comentário em português dizendo **qual regra ele trava**, não
  o que ele faz.
- Testes de contrato entre catálogo e adapters vivem em
  `verdict/catalog_integration_test.go`. Se você mudar o catálogo ou os adapters,
  rode-os.
- Prefira testes que não exijam nada instalado. `BuildCommand` é pura justamente
  para permitir isso.

### Concorrência

- Estado compartilhado no `Server` é protegido por `sync.RWMutex`. Mantenha o padrão.
  (`Launcher` mudou em ADR 0011: sessões foram para SQLite, sem estado mutável local.)
- **Nunca amarre o processo do emulador ao contexto da requisição HTTP.** O jogo
  precisa sobreviver à resposta. `session.go` usa `context.Background()` de
  propósito.

### Direção visual: retrô/pixelado, e o layout atual não é lei

Decidido pelo Douglas em **2026-09-09**. O tema do ZeuX puxa para o **retrô,
com pixel art** — grade de pixels visível, fonte pixel como voz de marca,
vocabulário CRT (scanlines, sweep, halo). Não é skin de nostalgia colada por
cima: é a identidade do produto, e vale para telas novas e para as que já
existem.

**O layout atual das telas NÃO é regra universal.** Qualquer tela pode ser
totalmente redesenhada — grade de consoles, biblioteca, telas de pasta,
onboarding — se isso servir à direção acima e aos princípios de produto. O
que continua valendo sem exceção: os princípios de produto não-negociáveis
(consentimento, texto descritivo sobre hardware, nomear o gargalo, legal
sobre ROMs), a regra de responsividade abaixo, e as convenções de idioma e
de comentário. Estrutura de tela e escolha de componente estão abertas.

### Layout responsivo (frontend)

O ZeuX é uma janela redimensionável, não uma página web de largura fixa — o
usuário pode maximizar, encolher ou trocar de monitor a qualquer momento, e o
layout precisa acompanhar. Regra prática, registrada depois de um bug real
(2026-08-04: breakpoint `xl:` numa tela cuja área útil já perdia a sidebar e a
barra de rolagem nunca ativava no tamanho padrão da janela):

- **Container de conteúdo:** `mx-auto max-w-*` + `px-*` é o padrão aceito —
  `max-w-*` é um **teto**, nunca uma largura fixa; o container sempre encolhe
  livre até esse teto conforme a janela. Nunca `width`/`w-[NNpx]` fixo em algo
  que preenche a tela.
- **Área que divide espaço com a sidebar** (`<main className="flex-1
  overflow-y-auto">` em `App.tsx`): já é fluida por natureza (`flex-1`); não
  precisa de `%`/`vw` explícito, só não trave um filho dela em px fixo.
- **Breakpoints do Tailwind (`sm:`/`lg:`/`xl:`/`2xl:`) medem a largura da
  *janela inteira*, não da área de conteúdo.** Ao decidir em que breakpoint
  uma grade ganha mais colunas, desconte mentalmente a sidebar (64px) e a
  barra de rolagem (~15-17px) da largura de janela alvo — um breakpoint que
  bate exatamente no tamanho padrão da janela (hoje 1280px, ver
  `src-tauri/tauri.conf.json`) não vai disparar de verdade. Prefira errar
  para um breakpoint menor (`lg` em vez de `xl`) a escrever uma grade que só
  ativa depois que o usuário já maximizou numa tela bem maior que a padrão.
- Exceções de propósito, que continuam em px fixo: a sidebar (`w-16`, chrome
  de navegação, não conteúdo) e elementos de ícone/chip pequenos
  (`ConsoleIcon`, badges) — esses têm tamanho de design fixo por natureza, não
  representam área que deveria crescer com a janela.

---

## Princípios de produto — não negociáveis

Estes vieram do dono do produto e valem mais que qualquer preferência técnica.

### 1. Consentimento antes do scan, verificado no servidor

O scan de hardware só acontece após um "sim" explícito. A checagem vive em
`handleScan`, no servidor, **não na interface** — uma permissão que só a tela
protege não é uma permissão.

O texto do consentimento diz que o dado serve como comparativo entre jogadores.
Ele é versionado (`PolicyVersion`): se o escopo do uso mudar, a versão sobe e o
consentimento anterior deixa de valer. A API sempre devolve o `policy_text`, para
que a interface nunca exiba um texto diferente do que o servidor registra.

### 2. Texto sobre hardware é DESCRITIVO, nunca julgador

**Nunca diga que o PC do usuário é fraco, ruim, limitado ou insuficiente.** Diga
os números e o que a máquina alcança. Quem decide se está satisfeito é o usuário.

- ❌ "Seu PC é fraco para PS2."
- ✅ "Este patamar pede 6 GB de memória de vídeo; a placa X tem 2.0 GB."

Isso vale para código, comentários, mensagens de erro, documentação e qualquer
texto de UI que você escrever.

### 3. Nomeie o componente que barra

Quando um patamar melhor não é atingido, diga **qual componente** impede — não
uma nota opaca. O caso motivador é a máquina com CPU forte e GPU integrada: uma
nota única diria "mediano" e não ajudaria em nada; nomear a GPU diz exatamente o
que fazer a respeito.

Já implementado em `ConsoleVerdict.Bottlenecks` e `NextLevel`.

### 4. Dado que não pôde ser lido é declarado como desconhecido

Requisito não verificável **não conta como atendido nem como não atendido**. O
parecer sai marcado como `"parcial"`. Nunca finja certeza para deixar a resposta
mais bonita.

### 5. Não instale emulador se o hardware não comporta — deixe o usuário decidir

Mostre o parecer, explique o gargalo, e permita seguir por conta e risco.
**Informar, não bloquear.**

### 6. Legal: nunca facilite compartilhamento de ROMs

O `rom_path` aponta para um arquivo que já está no disco do usuário. O ZeuX
**nunca** copia, distribui, sugere fonte ou facilita transferência de ROMs.

O que a camada social compartilha: **save states, texture packs, perfis de
controle e lobby de netplay**. Nunca o jogo.

O Nintendo Switch está **fora do catálogo de propósito** — Yuzu e Ryujinx foram
descontinuados após ação judicial. Ver
[decisoes.md](docs/decisoes.md#nintendo-switch-fora-do-catálogo-de-propósito-não-esquecimento).

---

## O que NÃO fazer

- ❌ **Não sugira, implemente ou mencione qualquer forma de obter ou compartilhar
  ROMs.** Nem "o usuário pode baixar em...", nem uma função utilitária que copie
  ROMs entre máquinas. Se a tarefa parecer pedir isso, pare e pergunte.
- ❌ **Não adicione o Nintendo Switch ao catálogo**, nem adapters para Yuzu ou
  Ryujinx.
- ❌ **Não introduza ORM nem uma segunda camada de persistência.** O SQLite
  local já é a persistência oficial desde o
  [decisoes.md](docs/decisoes.md#banco-de-dados-adiado-depois-revertido-para-sqlite-local) (que
  substituiu o 0002, o qual adiava qualquer banco) — `internal/store` abre a
  conexão e aplica migrações `.sql` embutidas, e é por ali que passa dado
  novo que precise sobreviver a um reinício. O que continua fora sem reabrir
  a decisão: ORM, um segundo banco, ou um serviço remoto de dados. Note que
  `consent.json` e `custom_emulators.json` **ficam fora do banco de
  propósito** — o motivo está no próprio ADR 0011.
- ❌ **Não escreva texto que julgue o hardware do usuário.**
- ❌ **Não invente flags de linha de comando** que a documentação do emulador não
  descreve. Uma flag inexistente faz o emulador recusar a abrir. Se a opção não
  cabe, declare em `Command.Unapplied`. Ver
  [decisoes.md](docs/decisoes.md#campo-unapplied-em-vez-de-inventar-flag-de-linha-de-comando).
- ❌ **Não afirme que as flags dos adapters funcionam.** Elas nunca foram
  validadas contra binários reais. Ao documentar ou comentar, mantenha essa
  ressalva visível.
- ❌ **Não execute o processo do emulador com o contexto da requisição HTTP.**
- ❌ **Não faça `BuildCommand` executar nada** nem tocar o sistema de arquivos
  (com a exceção já existente do RetroArch, que precisa localizar o core).
- ❌ **Não instale Rust, MSVC Build Tools nem dependências de Node** sem pedir.
  O adiamento é deliberado (decisão registrada informalmente; não há mais ADR numerada para isto — perguntar ao Douglas antes de instalar).
- ❌ **Não presuma que uma funcionalidade do PRD existe.** A maior parte não
  existe. Confira no código antes de afirmar.

---

## Armadilhas conhecidas do código

Coisas que já custaram tempo e vale saber de antemão:

- **`Session.ended_at` sempre aparece no JSON.** O `omitempty` não funciona em
  `time.Time`, então uma sessão em andamento traz `"0001-01-01T00:00:00Z"`. Use
  `is_running` de `GET /sessions`.
- **`retroArchAdapter.Consoles()` devolve ordem não determinística** (iteração de
  mapa). `Registry.Survey` ordena antes de expor.
- **`findBinary` desce até `maxScanDepth` (3) níveis** abaixo de cada diretório
  de sistema, em largura (`scanTree` em `discovery.go`), com teto de fan-out
  (`maxSubdirsScanned` por pasta, `maxDirsPerRoot` no total) e uma denylist de
  nomes (`node_modules`, `.git`, `Windows`...). Acha
  `C:\Program Files\DuckStation\bin\duckstation-qt.exe`; não acha emulador em
  outro drive ou pasta pessoal — isso continua sendo trabalho do cadastro
  manual. Ver `docs/decisoes.md`, "Profundidade da varredura de `findBinary`".
- **`Options.Extra` é anexado depois do caminho da ROM**, o que no PCSX2 o coloca
  depois do separador `--`.
- **`Installation.Version` só vem de instalação gerenciada.** Quem instalou
  pelo ZeuX tem a tag do release gravada em `.zeux-version`
  (`VersionMarkerName`, lido por `readVersionMarker`); para o emulador que o
  usuário já tinha por conta própria o campo fica ausente — o ZeuX não
  executa o binário para perguntar a versão a ele.
- **`mise.toml` usa versões fixas:** `go = "1.26.5"`, `node = "24.18.1"`
  (não latest/lts). Ver comentário no arquivo sobre por quê.
- **Um core do RetroArch não baixa enquanto o manifesto não for gerado.**
  `internal/install/data/retroarch_cores_manifest.json` vai no repositório com
  `"generated": false` em tudo (URLs certas, hash não medido), e `StartCore`
  recusa instalar a partir de entrada não medida — de propósito. Rodar
  `go run ./cmd/generate-retroarch-manifest` numa máquina com acesso a
  `buildbot.libretro.com` é o que destrava. Ver ADR 0015, R1.

---

## Escopo de escrita

Ao editar, respeite a fronteira que o dono do projeto definir na tarefa. Na
dúvida sobre alterar arquivos fora do escopo pedido — especialmente
`README.md`, `mise.toml`, `.gitignore` e código Go existente — pergunte antes.
