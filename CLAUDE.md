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

Documentação de referência (leia conforme a tarefa):

- [`docs/arquitetura.md`](docs/arquitetura.md) — componentes, fluxo de onboarding, decisões
- [`docs/arquitetura-a-preservar.md`](docs/arquitetura-a-preservar.md) — o que **não** desfazer, e o que quebra se desfizer; orçamento de complexidade (alvo: O(n) ou melhor)
- [`docs/api.md`](docs/api.md) — todas as rotas HTTP, campos e códigos de erro
- [`docs/adapters.md`](docs/adapters.md) — como funciona o `Adapter` e como adicionar um emulador
- [`docs/decisoes/`](docs/decisoes/) — ADRs; leia antes de propor mudar uma decisão
- [`docs/roadmap.md`](docs/roadmap.md) — backlog e dívida honesta

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
internal/verdict/    catálogo embutido + motor de parecer
internal/emulator/   adapters, descoberta de binários, launcher e sessões
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

- Estado compartilhado no `Server` e no `Launcher` é protegido por
  `sync.RWMutex`. Mantenha o padrão.
- **Nunca amarre o processo do emulador ao contexto da requisição HTTP.** O jogo
  precisa sobreviver à resposta. `session.go` usa `context.Background()` de
  propósito.

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
[ADR 0008](docs/decisoes/0008-excluir-switch-do-catalogo.md).

---

## O que NÃO fazer

- ❌ **Não sugira, implemente ou mencione qualquer forma de obter ou compartilhar
  ROMs.** Nem "o usuário pode baixar em...", nem uma função utilitária que copie
  ROMs entre máquinas. Se a tarefa parecer pedir isso, pare e pergunte.
- ❌ **Não adicione o Nintendo Switch ao catálogo**, nem adapters para Yuzu ou
  Ryujinx.
- ❌ **Não introduza banco de dados, ORM ou camada de persistência** sem que a
  decisão seja explicitamente reaberta. Ver
  [ADR 0002](docs/decisoes/0002-adiar-banco-de-dados.md). Isso inclui "só um
  SQLite rapidinho para salvar as sessões".
- ❌ **Não escreva texto que julgue o hardware do usuário.**
- ❌ **Não invente flags de linha de comando** que a documentação do emulador não
  descreve. Uma flag inexistente faz o emulador recusar a abrir. Se a opção não
  cabe, declare em `Command.Unapplied`. Ver
  [ADR 0006](docs/decisoes/0006-campo-unapplied.md).
- ❌ **Não afirme que as flags dos adapters funcionam.** Elas nunca foram
  validadas contra binários reais. Ao documentar ou comentar, mantenha essa
  ressalva visível.
- ❌ **Não execute o processo do emulador com o contexto da requisição HTTP.**
- ❌ **Não faça `BuildCommand` executar nada** nem tocar o sistema de arquivos
  (com a exceção já existente do RetroArch, que precisa localizar o core).
- ❌ **Não instale Rust, MSVC Build Tools nem dependências de Node** sem pedir.
  O adiamento é deliberado ([ADR 0004](docs/decisoes/0004-adiar-rust-e-tauri.md)),
  e há uma pendência de OneDrive a resolver antes do primeiro `npm install`
  ([roadmap D4](docs/roadmap.md)).
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
- **`findBinary` não é recursiva.** Não acha
  `C:\Program Files\DuckStation\duckstation-qt.exe`. Ver roadmap D6.
- **`Options.Extra` é anexado depois do caminho da ROM**, o que no PCSX2 o coloca
  depois do separador `--`.
- **Três adapters ignoram opções sem reportar em `Unapplied`**: RetroArch
  (`exit_on_close`), Flycast (`renderer`, `exit_on_close`), Cemu
  (`exit_on_close`). Ver roadmap D5.
- **`Installation.Version` nunca é preenchido.** Nenhum adapter detecta versão.
- **`mise.toml` usa `latest`/`lts`, não versões fixas.** Ver roadmap D7.
- **O `README.md` está desatualizado**: diz que não há lançamento de emulador,
  e não lista as rotas de `/emulators`, `/games/*` e `/sessions`.

---

## Escopo de escrita

Ao editar, respeite a fronteira que o dono do projeto definir na tarefa. Na
dúvida sobre alterar arquivos fora do escopo pedido — especialmente
`README.md`, `mise.toml`, `.gitignore` e código Go existente — pergunte antes.
