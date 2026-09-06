# Adapters de emulador

Como o ZeuX conversa com emuladores externos: a interface `Adapter`, o que cada
um dos 14 adapters aceita por linha de comando, e como adicionar um novo.

Fonte: `internal/emulator/`. Última verificação contra o código: 2026-08-04.

---

## ⚠️ Aviso que precede tudo neste documento

**As gramáticas de linha de comando abaixo foram escritas a partir da
documentação de cada emulador e NUNCA foram validadas contra binários reais.**
Nenhum destes emuladores está instalado na máquina de desenvolvimento.

Os testes em `adapter_test.go` provam que o ZeuX traduz opções em argumentos de
forma consistente. Eles **não** provam que os emuladores aceitam esses
argumentos. Antes de considerar a Fase 2 fechada, cada adapter precisa ser
exercitado contra o emulador de verdade. Ver
[roadmap.md](roadmap.md#sprint-a--validação-dos-adapters-bloqueia-tudo).

O mesmo aviso está no código, em `standalone.go`.

---

## 1. O contrato `Adapter`

```go
type Adapter interface {
    ID() string
    Name() string
    Consoles() []string
    Locate(ctx context.Context) (Installation, bool)
    BuildCommand(install Installation, req Request) (Command, error)
}
```

| Método | Contrato |
|---|---|
| `ID()` | Identificador estável, usado em configuração, no catálogo (`adapter_id`) e na API. Nunca muda. |
| `Name()` | Nome de exibição. |
| `Consoles()` | IDs de console do catálogo que este emulador atende. |
| `Locate()` | Procura o binário no disco. `ok=false` é resposta **normal**, não erro. |
| `BuildCommand()` | **Função pura.** Não toca o sistema de arquivos, não executa nada. |

### Por que `BuildCommand` é separado de `Launch`

Essa é a decisão estrutural do pacote. `BuildCommand` recebe uma `Installation`
e uma `Request` e devolve uma `Command`; quem executa é o `Launcher`.

Consequências diretas:

- Os 14 adapters são testáveis sem nenhum emulador instalado.
- A rota `POST /api/v1/games/preview` existe praticamente de graça — é
  `BuildCommand` sem o `Launch`.
- Diagnóstico de configuração não exige abrir jogo nenhum.

Sem essa divisão, a única forma de testar a tradução de opções em argumentos
seria abrindo jogos de verdade. Ver [ADR 0005](decisoes/0005-buildcommand-separado-de-launch.md).

> Exceção parcial à pureza: o `retroArchAdapter.BuildCommand` **lê o disco**
> para localizar o arquivo `.dll`/`.so`/`.dylib` do core. Isso é uma quebra
> consciente do contrato descrito no comentário da interface — sem o caminho do
> core não há comando possível. Vale conhecer ao escrever testes.

### `Request` e `Options`

```go
type Request struct {
    ROMPath   string   // caminho no disco do usuário; o ZeuX nunca copia nem transfere
    ConsoleID string   // amarra ao catálogo; diz ao RetroArch qual core carregar
    Core      string   // core explícito do RetroArch; ignorado por standalone
    Options   Options
}

type Options struct {
    Fullscreen    bool
    InternalScale int      // 0 ou 1 = resolução nativa do console
    Renderer      Renderer // "", "vulkan", "opengl", "d3d12", "software"
    ExitOnClose   bool     // encerra junto com o jogo, sem voltar ao menu do emulador
    Extra         []string // argumentos crus, repassados no fim
}
```

`Options` é a contraparte estruturada do texto de preset do catálogo: o texto
existe para o usuário ler, estes campos existem para o emulador obedecer.

### `Command` e o campo `Unapplied`

```go
type Command struct {
    Argv      []string
    Unapplied []string
}
```

Os emuladores divergem muito no que aceitam por linha de comando. Inventar uma
flag inexistente faz o emulador **recusar a abrir**. Então, quando uma opção não
cabe, o adapter não a aplica e escreve em `Unapplied` uma frase pronta para o
usuário. Ver [ADR 0006](decisoes/0006-campo-unapplied.md).

### Validação comum

`validateRequest` roda no início de todo `BuildCommand`:

1. `ROMPath` vazio (ou só espaços) → erro.
2. `ConsoleID` não vazio e não declarado em `Consoles()` → `ErrUnsupportedConsole`.

`ConsoleID` **vazio passa** — a validação só recusa consoles declarados e não
atendidos.

---

## 2. Cobertura: qual emulador atende qual console

| Adapter ID | Nome | Consoles atendidos |
|---|---|---|
| `retroarch` | RetroArch | `nes`, `snes`, `megadrive`, `gba`, `n64`, `ps1`, `dreamcast`, e mais — ver nota abaixo |
| `duckstation` | DuckStation | `ps1` |
| `pcsx2` | PCSX2 | `ps2` |
| `dolphin` | Dolphin | `gamecube`, `wii` |
| `ppsspp` | PPSSPP | `psp` |
| `flycast` | Flycast | `dreamcast` |
| `rpcs3` | RPCS3 | `ps3` |
| `cemu` | Cemu | `wiiu` |
| `melonds` | melonDS | `nds` |
| `azahar` | Azahar | `3ds` |
| `xemu` | xemu | `xbox` |
| `vita3k` | Vita3K | `vita` |
| `xenia` | Xenia | `xbox360` |
| `rmg` | RMG (Rosalie's Mupen GUI) | `n64` (patamares "bom"/"limitado" — ver nota) |

**`rmg`, adicionado em 2026-08-03:** o RetroArch atende N64, mas não é
instalável pelo 1-click (distribuição própria, fora do GitHub — ver
`retroarch` em `internal/install/data/sources.json`, `kind: "manual"`). Sem
um adapter dedicado, N64 nunca seria "plug and play" de verdade. O RMG
(front-end do Mupen64Plus com release real no GitHub, AppImage no Linux)
resolve isso para os patamares "bom" e "limitado" do catálogo, que já usavam
o core Mupen64Plus-Next. O patamar "otimo" continua no RetroArch + core
ParaLLEl N64 — o RMG não embute esse core, e trocar teria sido apresentar uma
emulação diferente como equivalente.

> A lista do RetroArch **não é declarada literalmente**: `Consoles()` devolve as
> chaves do mapa `defaultCoreByConsole`. Adicionar um console lá adiciona
> suporte automaticamente — e a ordem devolvida é **não determinística** (ordem
> de iteração de mapa em Go). `Registry.Survey` ordena antes de expor pela API.

Consoles com mais de um adapter: `ps1` (DuckStation + RetroArch) e `dreamcast`
(Flycast + RetroArch). Em ambos, `Registry.ForConsole` coloca o standalone
primeiro — um emulador dedicado costuma ter compatibilidade e desempenho
melhores que o core equivalente.

Consoles do catálogo com **um único** adapter: `ps2`, `gamecube`, `wii`, `wiiu`,
`ps3`, `psp`. Não há fallback se o emulador não estiver instalado.

### Cores do RetroArch

`retroArchCores` mapeia nome amigável → nome do arquivo (sem extensão). São
**25**, todos abaixo — a lista completa, não uma amostra:

| Nome no catálogo | Arquivo |
|---|---|
| `beetle cygne` | `mednafen_wswan_libretro` |
| `beetle ngp` | `mednafen_ngp_libretro` |
| `beetle pce` | `mednafen_pce_libretro` |
| `beetle psx hw` | `mednafen_psx_hw_libretro` |
| `beetle saturn` | `mednafen_saturn_libretro` |
| `beetle vb` | `mednafen_vb_libretro` |
| `bsnes` | `bsnes_libretro` |
| `fbneo` | `fbneo_libretro` |
| `flycast` | `flycast_libretro` |
| `gambatte` | `gambatte_libretro` |
| `genesis plus gx` | `genesis_plus_gx_libretro` |
| `mame` | `mame_libretro` |
| `melonds` | `melonds_libretro` |
| `mesen` | `mesen_libretro` |
| `mgba` | `mgba_libretro` |
| `mupen64plus-next` | `mupen64plus_next_libretro` |
| `opera` | `opera_libretro` |
| `parallel n64` | `parallel_n64_libretro` |
| `picodrive` | `picodrive_libretro` |
| `ppsspp` | `ppsspp_libretro` |
| `sameboy` | `sameboy_libretro` |
| `snes9x` | `snes9x_libretro` |
| `stella` | `stella_libretro` |
| `swanstation` | `swanstation_libretro` |
| `yabause` | `yabause_libretro` |

`defaultCoreByConsole` decide o core quando a requisição não especifica um.
Cobre **24 consoles**, agrupados aqui pelo core que cada um usa:

| Core padrão | Consoles |
|---|---|
| `beetle cygne` | `wonderswan` |
| `beetle ngp` | `ngpc` |
| `beetle pce` | `pcengine` |
| `beetle psx hw` | `ps1` |
| `beetle saturn` | `saturn` |
| `beetle vb` | `virtualboy` |
| `fbneo` | `neogeo` |
| `flycast` | `dreamcast` |
| `gambatte` | `gb`, `gbc` |
| `genesis plus gx` | `gamegear`, `mastersystem`, `megadrive`, `segacd` |
| `mame` | `arcade` |
| `melonds` | `nds` |
| `mesen` | `nes` |
| `mgba` | `gba` |
| `mupen64plus-next` | `n64` |
| `opera` | `3do` |
| `picodrive` | `sega32x` |
| `ppsspp` | `psp` |
| `snes9x` | `snes` |
| `stella` | `atari2600` |

Os 5 cores que **não são padrão de nenhum console**
(`bsnes`, `parallel n64`, `sameboy`, `swanstation`, `yabause`) continuam alcançáveis pelo campo
`core` explícito — vários deles são o que o catálogo
(`internal/verdict/data/consoles.json`) recomenda no tier "otimo", onde a
precisão vale mais que a compatibilidade.

A extensão do arquivo é escolhida por `runtime.GOOS`: `.dll` (Windows),
`.dylib` (macOS), `.so` (demais). Os diretórios procurados, **nesta ordem**:

1. O diretório gerenciado pelo ZeuX — `%APPDATA%\ZeuX\RetroArch\cores`
   (Windows), `~/Library/Application Support/ZeuX/RetroArch/cores` (macOS),
   `~/.local/share/zeux/retroarch/cores` (Linux). É onde o download sob
   demanda ([ADR 0015](decisoes/0015-baixar-retroarch-e-cores-sob-demanda.md))
   promove o que baixa, e por isso vem primeiro.
2. `<dir do executável>/cores`
3. macOS: `~/Library/Application Support/RetroArch/cores`
4. Linux: `~/.config/retroarch/cores`,
   `~/.var/app/org.libretro.RetroArch/config/retroarch/cores`,
   `/usr/lib/libretro`, `/usr/lib/x86_64-linux-gnu/libretro`,
   `/usr/local/lib/libretro`
5. Windows: nada além dos dois primeiros

Um core que o usuário baixou pelo Online Updater do próprio RetroArch cai em
(2)–(4) e é encontrado igual — o ZeuX não exige que o core tenha vindo dele.

**Core ausente não é mais um beco sem saída.** `BuildCommand` continua
falhando nomeando o core que falta (ele é puro, não baixa nada — ver a
exceção de leitura de disco na seção 1), mas quem chama `POST /games/launch`
não chega a ver esse erro: a rota detecta o core ausente antes, dispara o
download e responde `202` com o job (R3 do ADR 0015). Ver
[`api.md`](api.md), `POST /games/launch`.

---

## 3. Opções por adapter: aplicadas vs. reportadas como `unapplied`

Legenda: ✅ aplicada na linha de comando · 📋 reportada em `Unapplied` ·
⚠️ **nem aplicada nem reportada** (silenciosamente ignorada — ver as notas).

| Adapter | `fullscreen` | `internal_scale` | `renderer` | `exit_on_close` |
|---|---|---|---|---|
| RetroArch | ✅ `-f` | 📋 | 📋 | ⚠️ |
| DuckStation | ✅ `-fullscreen` | 📋 | 📋 | ✅ `-batch` |
| PCSX2 | ✅ `-fullscreen` | 📋 | 📋 | ✅ `-batch` |
| Dolphin | ✅ `-C Dolphin.Display.Fullscreen=True` | ✅ `-C GFX.Settings.InternalResolution=N` | ✅ `-C Dolphin.Core.GFXBackend=…` | ✅ `-b` |
| PPSSPP | ✅ `--fullscreen` | 📋 | 📋 | ✅ `--escape-exit` |
| Flycast | 📋 | 📋 | ⚠️ | ⚠️ |
| RPCS3 | ✅ `--fullscreen` | 📋 | 📋 | ✅ `--no-gui` |
| Cemu | ✅ `-f` | 📋 | 📋 | ⚠️ |
| RMG | ✅ `-f` | 📋 | 📋 | ✅ `-q` |

`extra` é sempre repassado, em todos os adapters.

**RMG não passou pela auditoria do D1** (2026-08-01) — foi adicionado depois,
em 2026-08-03. As flags vieram da leitura direta de
`Source/RMG/main.cpp` (`QCommandLineParser`) no repositório oficial, mesmo
padrão de rigor do D1, só que feito na hora da adição em vez de em lote.

**O Dolphin é o único que aplica o preset inteiro.** `-C` sobrescreve qualquer
chave do INI direto na linha de comando, então é o único emulador onde a
autoconfiguração do ZeuX se aplica de verdade e `Unapplied` sai sempre vazio —
comportamento travado por `TestDolphinAppliesFullPreset`.

Mapeamento de `renderer` no Dolphin: `vulkan`→`Vulkan`, `opengl`→`OGL`,
`d3d12`→`D3D12`, `software`→`Software Renderer`.

### As lacunas ⚠️

Três casos onde uma opção é ignorada **sem** entrar em `Unapplied`. O usuário
não fica sabendo que o ajuste não foi aplicado, o que contradiz a intenção do
campo. São bugs conhecidos, não decisões:

1. **RetroArch + `exit_on_close`** — o preset de todos os 7 consoles atendidos
   pelo RetroArch pede `exit_on_close: true`, e nada acontece.
2. **Flycast + `renderer`** e **Flycast + `exit_on_close`** — o Flycast
   standalone expõe muito pouco por linha de comando (quase tudo vive no
   `emu.cfg`), mas `fullscreen` e `internal_scale` são reportados e estes dois
   não.
3. **Cemu + `exit_on_close`** — idem.

Estão no [roadmap](roadmap.md) como item de correção.

### Detalhes de montagem que importam

| Adapter | Forma do `argv` |
|---|---|
| RetroArch | `[bin, "-L", <caminho do core>, (-f), <rom>, extra…]` |
| DuckStation | `[bin, (-batch), (-fullscreen), <rom>, extra…]` |
| PCSX2 | `[bin, (-batch), (-fullscreen), "--", <rom>, extra…]` |
| Dolphin | `[bin, (-b), (-C …)…, "-e", <rom>, extra…]` |
| PPSSPP | `[bin, (--fullscreen), (--escape-exit), <rom>, extra…]` |
| Flycast | `[bin, <rom>, extra…]` |
| RPCS3 | `[bin, (--no-gui), (--fullscreen), <rom>, extra…]` |
| Cemu | `[bin, (-f), "-g", <rom>, extra…]` |

- **PCSX2 exige o `--`**: sem ele, uma ROM cujo nome comece com hífen seria lida
  como flag. Travado por `TestPCSX2SeparatesOptionsFromROM`.
- **Cemu exige `-g` antes do caminho**; **Dolphin exige `-e`**.
- ⚠️ **`Extra` é anexado DEPOIS do caminho da ROM**, em todos os adapters. Para
  o PCSX2 isso significa que os argumentos extras caem depois do separador `--`
  e serão lidos como posicionais, não como flags. O teste
  `TestROMPathIsLastAndUnaltered` não pega esse caso porque não usa `Extra`.
  Item de correção no roadmap.

---

## 4. Descoberta de binários (`discovery.go`)

`findBinary(adapterID, consoles, names, extraDirs)` procura nesta ordem, **e a
ordem é intencional**:

1. **Instalação gerenciada pelo ZeuX**, organizada por console desde o ADR
   0010: `os.UserConfigDir()/ZeuX/emulators/<console_id>/emuladores/<adapter_id>/<nome>`
   para um emulador de console único (ex.: `ps1/emuladores/duckstation/`), ou
   `os.UserConfigDir()/ZeuX/emulators/compartilhados/<adapter_id>/<nome>` para
   um emulador de mais de um console (RetroArch, Dolphin) — ver
   `emulator.ManagedEmulatorDir`. Se o usuário deixou o ZeuX instalar uma
   versão, é ela que o app sabe configurar; cair numa instalação antiga do
   sistema traria comportamento não previsto.
2. **Diretórios padrão do sistema.**
3. **`PATH`** (`exec.LookPath`), como último recurso — cobre instalações por
   gerenciador de pacotes no Linux, que não vivem numa pasta previsível.

Diretórios do passo 2:

| SO | Diretórios |
|---|---|
| Windows | `%ProgramFiles%`, `%ProgramFiles(x86)%`, `%LOCALAPPDATA%\Programs`, `~\Desktop`, `~\Downloads` |
| macOS | `/Applications`, `~/Applications`, `/opt/homebrew/bin`, `/usr/local/bin` |
| Linux | `/usr/bin`, `/usr/local/bin`, `/usr/games`, `~/.local/bin`, `/var/lib/flatpak/exports/bin`, `~/.local/share/flatpak/exports/bin`, `~/Applications` |

> A busca **não é recursiva**: procura `<dir>/<nome>` diretamente. Um
> `C:\Program Files\DuckStation\duckstation-qt-x64-ReleaseLTCG.exe` **não** é
> encontrado, porque só `C:\Program Files\duckstation-qt-x64-ReleaseLTCG.exe`
> seria testado. Na prática, a maioria das instalações no Windows vive num
> subdiretório. Isso precisa ser resolvido antes da Fase 2 — está no roadmap.

`isExecutableFile` confirma que o caminho existe e é arquivo. No Windows a
extensão basta; nos demais exige o bit de execução, para não confundir um README
com o binário.

`binaryNames(base, windowsNames, macBundle)` adapta os nomes ao SO. No macOS os
emuladores vêm empacotados em `.app` e o binário real fica em
`<Bundle>.app/Contents/MacOS/<base>`.

Nomes procurados por adapter:

| Adapter | Windows | Linux/macOS (base) | Bundle macOS |
|---|---|---|---|
| retroarch | `retroarch.exe` | `retroarch` | `RetroArch` |
| duckstation | `duckstation-qt-x64-ReleaseLTCG.exe`, `duckstation-qt.exe`, `duckstation.exe` | `duckstation-qt` | `DuckStation` |
| pcsx2 | `pcsx2-qt.exe`, `pcsx2-qtx64-avx2.exe`, `pcsx2.exe` | `pcsx2-qt` | `PCSX2` |
| dolphin | `Dolphin.exe`, `DolphinWx.exe` | `dolphin-emu` | `Dolphin` |
| ppsspp | `PPSSPPWindows64.exe`, `PPSSPPWindows.exe` | `PPSSPPSDL` | `PPSSPP` |
| flycast | `flycast.exe` | `flycast` | `Flycast` |
| rpcs3 | `rpcs3.exe` | `rpcs3` | `RPCS3` |
| cemu | `Cemu.exe` | `Cemu` | `Cemu` |

A pasta gerenciada (`ManagedRoot()`) já é consultada, e a instalação 1-click
(`internal/install`, rotas `POST`/`DELETE /emulators/{id}/install`) já escreve
e apaga ali de verdade — ver Sprint C no [roadmap](roadmap.md), corrigido em
2026-08-02. `Installation.Managed` sai `true` para o que o ZeuX instalou.
Desde o [ADR 0010](decisoes/0010-estrutura-de-diretorios-por-console.md), a
pasta é organizada por console (`<console>/emuladores/<adapter>`), com
RetroArch e Dolphin — que atendem mais de um console — numa pasta
compartilhada em vez de duplicados.

`Installation.Version` **nunca é preenchido**: nenhum adapter detecta versão.
O campo existe porque o sistema de compatibilidade comunitário depende dele
("rodou bem na versão X"), mas não vale bloquear o lançamento por falta dele.

---

## 5. Registry e Launcher

### `Registry`

- `NewRegistry()` — os 14 adapters, nesta ordem: retroarch, duckstation, pcsx2,
  dolphin, ppsspp, flycast, rpcs3, cemu, melonds, azahar, xemu, vita3k, xenia,
  rmg.
- `ByID(id)` / `Adapters()` — busca direta.
- `ForConsole(id)` — adapters que atendem o console, **com o RetroArch por
  último** (`sort.SliceStable`). Travado por `TestStandalonePreferredOverRetroArch`.
- `Survey(ctx)` — chama `Locate()` em todos; alimenta `GET /api/v1/emulators`.
- `Resolve(ctx, consoleID, preferredID)`:
  - `preferredID` preenchido → exige que exista, que atenda o console e que
    esteja instalado. Falha com mensagem específica em cada caso.
  - `preferredID` vazio → percorre `ForConsole` e devolve o **primeiro
    instalado**. Nenhum instalado → erro listando os que o ZeuX conhece
    ("o ZeuX conhece DuckStation e RetroArch").

### `Launcher`

`Launch(ctx, input)`:

1. `validateROM` — arquivo existe, é acessível, não é pasta. Falhar aqui dá
   mensagem clara; falhar dentro do emulador dá uma janela preta e nenhuma
   explicação.
2. `Registry.Resolve`.
3. `adapter.BuildCommand`.
4. `cmd.Start()` com **`context.Background()`**, não com o `ctx` da requisição:
   o jogo precisa continuar rodando muito depois de a resposta HTTP ter sido
   enviada.
5. Registra a `Session` e dispara `supervise` numa goroutine. **Não bloqueia** —
   travar ali prenderia a requisição HTTP pelo tempo inteiro da partida.

`supervise` espera `cmd.Wait()`, grava `EndedAt` e, se houve erro, `ExitError`.
Código de saída diferente de zero é comum quando o usuário fecha pela janela, e
por isso é informativo, não necessariamente uma falha.

`Sessions()` devolve do mais recente para o mais antigo. `Playtime()` soma
segundos por `console_id`. **Ambos vivem só em memória e somem ao fechar o app.**

---

## 6. Como adicionar um novo emulador

Passo a passo. Exemplo hipotético: um emulador de Sega Saturn chamado "Kronos".

### Passo 1 — decidir se cabe no `standaloneAdapter`

Se o emulador atende um conjunto fixo de consoles e a única particularidade é a
gramática de argumentos, use `standaloneAdapter`. Um tipo próprio só se
justifica quando há responsabilidade extra — foi o caso do RetroArch, que
precisa descobrir e localizar cores.

### Passo 2 — escrever o construtor em `standalone.go`

```go
func newKronos() Adapter {
    return standaloneAdapter{
        id:       "kronos",
        name:     "Kronos",
        consoles: []string{"saturn"},
        names:    binaryNames("kronos", []string{"kronos.exe"}, "Kronos"),
        buildArgs: func(req Request) ([]string, []string) {
            args := []string{}
            var unapplied []string

            if req.Options.Fullscreen {
                args = append(args, "--fullscreen")
            }
            // Opção que o emulador NÃO aceita por CLI: reporte, não invente flag.
            if req.Options.InternalScale > 1 {
                unapplied = append(unapplied,
                    "A resolução interna precisa ser ajustada dentro do Kronos.")
            }
            if req.Options.Renderer != RendererDefault {
                unapplied = append(unapplied,
                    "O backend gráfico precisa ser escolhido dentro do Kronos.")
            }
            if req.Options.ExitOnClose {
                unapplied = append(unapplied,
                    "O Kronos não encerra junto com o jogo pela linha de comando.")
            }

            return append(args, req.ROMPath), unapplied
        },
    }
}
```

Regras não negociáveis do `buildArgs`:

- **Toda opção de `Options` precisa ser tratada**: aplicada **ou** declarada em
  `unapplied`. Silêncio é bug (ver [as lacunas](#as-lacunas-)).
- **Nunca invente uma flag** que a documentação do emulador não descreve. Uma
  flag inexistente faz o emulador recusar a abrir, e o usuário não tem como
  saber por quê.
- **O caminho da ROM vai por último**, depois das flags. Se o emulador precisar
  de um marcador (`-e`, `-g`) ou separador (`--`), coloque-o imediatamente antes.
- As frases de `unapplied` são **em português, dirigidas ao usuário**, e dizem
  onde o ajuste precisa ser feito.

### Passo 3 — registrar em `registry.go`

```go
adapters: []Adapter{
    newRetroArch(),
    // ...
    newCemu(),
    newKronos(),   // <-- aqui
},
```

Adapters standalone vêm antes do RetroArch na lista; `ForConsole` reordena de
qualquer forma, mas manter a convenção evita surpresa.

### Passo 4 — acrescentar o console ao catálogo

Em `internal/verdict/data/consoles.json`, com pelo menos um tier. Cada tier
precisa de:

```json
{
  "level": "bom",
  "emulator": "Kronos",
  "adapter_id": "kronos",
  "preset": "Resolução interna 2x (1080p)",
  "options": { "fullscreen": true, "internal_scale": 2, "exit_on_close": true },
  "requires": { "logical_cores": 4, "clock_mhz": 2600, "ram_gib": 8 }
}
```

Restrições que os testes de integração cobram:

- `adapter_id` precisa existir no registry **e** declarar o console
  (`TestEveryTierPointsToAKnownAdapter`).
- `preset` não pode ser vazio; `options.fullscreen` e `options.exit_on_close`
  precisam ser `true`; `internal_scale` não pode ser negativo
  (`TestEveryTierHasApplicableOptions`).
- Tiers ordenados do **mais exigente para o menos exigente**, e um tier melhor
  não pode ter `internal_scale` menor que o de um tier pior
  (`TestBetterTiersDoNotDowngradeSettings`).
- `core` só pode aparecer em tiers do `retroarch`, e todo tier do `retroarch`
  precisa declarar um (`TestRetroArchTiersDeclareCore`).

Se o novo emulador for uma alternativa a um console já existente, você só precisa
acrescentá-lo em `consoles:` do adapter e, se quiser que seja a escolha padrão,
garantir que ele venha antes do RetroArch — o que `ForConsole` já faz.

### Passo 5 — escrever os testes

Em `adapter_test.go`. O mínimo:

- Um teste de que o preset completo (`fullPreset()`) produz os argumentos
  esperados **ou** reporta as pendências certas.
- Um teste de que nenhum argumento inventado aparece para as opções não
  suportadas — siga o padrão de
  `TestUnsupportedOptionsAreReportedNotInvented`.
- Se houver marcador ou separador obrigatório, um teste de posição, como
  `TestPCSX2SeparatesOptionsFromROM`.

`TestROMPathIsLastAndUnaltered` já cobre o novo adapter automaticamente: ele
itera sobre `NewRegistry().Adapters()`.

### Passo 6 — rodar tudo

```powershell
$env:PATH = "C:\Users\doufl\AppData\Local\Microsoft\WinGet\Packages\jdx.mise_Microsoft.Winget.Source_8wekyb3d8bbwe\mise\bin;$env:PATH"
mise exec -- go build ./...
mise exec -- go vet ./...
mise exec -- go test ./...
```

E confirmar a compilação cruzada, já que `discovery.go` tem caminhos por SO:

```powershell
foreach ($os in @('linux','darwin')) {
    $env:GOOS = $os
    mise exec -- go build ./...
    if ($?) { "$os -> OK" } else { "$os -> FALHOU" }
}
$env:GOOS = ''
```

### Passo 7 — validar contra o binário real

**Este passo não é opcional e é o único que os testes não substituem.** Instale
o emulador, use `POST /api/v1/games/preview` para ver a linha de comando exata,
rode-a à mão no terminal, e só então use `POST /api/v1/games/launch`. Anote o
resultado — a lista dos 14 adapters atuais ainda está inteira nesta pendência.

---

## 7. O que a Sprint H vai pedir deste pacote

Hoje `POST /api/v1/emulators/{id}/open` (`Launcher.LaunchStandalone`) só abre o
binário sozinho — o usuário ajusta a configuração dentro do próprio emulador,
exatamente como faria sem o ZeuX. A Sprint H do
[roadmap](roadmap.md#sprint-h--configurar-o-emulador-e-mapear-controles-pelo-zeux-v10)
pretende que o ZeuX leia e escreva essa configuração direto, sem abrir o
emulador.

Isso é trabalho novo para `internal/emulator`, não só para a API: o item H1
prevê que `Adapter` ganhe uma **capacidade opcional de configuração**
(distinta de `BuildCommand`) — declarando quais opções o adapter sabe
persistir em disco, em que arquivo, e como escrever sem apagar o que o usuário
já tinha ajustado à mão (formatos como `.ini` e `retroarch.cfg` têm chaves e
comentários que o ZeuX não modela e não pode perder). Nenhum adapter atual
implementa isso ainda; um adapter que não implementar continua funcionando do
jeito que funciona hoje — é capacidade opcional, não obrigatória. Ver H1 e H5
no roadmap para o critério de aceite completo, inclusive a exigência de que
cada adapter diga se foi verificado contra binário real ou só lido em
documentação — mesmo rigor que este arquivo já cobra no aviso do topo.
