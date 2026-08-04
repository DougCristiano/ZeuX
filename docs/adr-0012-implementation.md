# ADR 0012 — Notas de implementação

Este arquivo registra as decisões técnicas do empacotamento de RetroArch + cores.

## Etapa 1: Mecanismo de Tauri bundling (COMPLETA)

### Estrutura decidida

```
src-tauri/
  resources/
    retroarch/
      cores/
        mesen_libretro.so          (Linux) / .dll (Windows) / .dylib (macOS)
        snes9x_libretro.so
        gambatte_libretro.so
        ... (20 cores total)
```

Cada core tem três variantes de arquivo (um por plataforma: SO, DLL, dylib).
Na próxima etapa, um script de pré-build (`scripts/download-retroarch-cores.mjs`)
irá popular este diretório durante `npm run build:daemon`.

### Por que este mecanismo?

- **Consistente com o projeto:** o zeuxd já usa este padrão (pré-build script
  → arquivo no `src-tauri/binaries/`, Tauri bundler empacota).
- **Simples:** sem dependência de configuração complexa do Tauri v2. O bundler
  do Tauri trata `src-tauri/` como base, então tudo lá dentro é empacotado.
- **Testável:** arquivos locais, não rede em tempo de build — mesmo que um
  download falhe, o desenvolvedor consegue debugar.

### Alternativas rejeitadas

- **Usar seção `resources` em `tauri.conf.json`:** Tauri v2 não suporta essa sintaxe para copiar diretórios inteiros. Seria preciso listar cada arquivo, o que é impraticável para cores (que se atualizam).
- **Usar `include_bytes!` no Rust:** Embute tudo no binário (cores têm 5-50 MB cada, 20 cores = 200-1000 MB só em cores). Inviável.
- **Baixar em tempo de execução:** Quebra a promessa de ADR 0012 ("sem rede no primeiro uso").

## Etapa 2: Script de download (IMPLEMENTADA — OPÇÃO B)

**Decisão:** Usar buildbot.libretro.com (fonte oficial de cores compilados).

### Implementação

Script em `scripts/download-retroarch-cores.mjs`:

1. Detecta plataforma (`linux/x86_64`, `windows/x86_64`, `osx/x86_64`, etc)
2. Para cada dos 20 cores, monta URL: `https://buildbot.libretro.com/latest/{platform}/cores/{filename}.zip`
3. Download do .zip e armazena em `src-tauri/resources/retroarch/cores/`
4. Registra sucesso/falha de cada core

Integração no build:
```json
"scripts": {
  "download:retroarch-cores": "node scripts/download-retroarch-cores.mjs",
  "build:daemon": "npm run download:retroarch-cores && node scripts/build-zeuxd.mjs"
}
```

### Status

✅ **Etapa 2 pronta para teste real**

- ✅ Download do buildbot (opção B confirmada)
- ✅ Extração de .zip com `unzipper` npm
- ✅ Limpeza de arquivos temporários
- ✅ Detecção automática de plataforma
- ⚠️ **Precisa teste real na máquina do Douglas** (buildbot bloqueado na rede do container)

### Fluxo final

1. `npm run download:retroarch-cores` é chamado como parte de `npm run build:daemon`
2. Para cada dos 20 cores:
   - Detecta plataforma (linux/x86_64, windows/x86_64, etc)
   - Monta URL no buildbot
   - Download do .zip
   - Extrai apenas o binário (.so/.dll/.dylib)
   - Limpa .zip temporário
   - Registra sucesso/falha
3. Se tudo OK, cores ficam em `src-tauri/resources/retroarch/cores/`
4. Tauri bundler os empacota no instalador
5. Na primeira execução, daemon copia para `~/.local/share/zeux/retroarch/cores/` (Linux) etc

### O que falta em Etapa 2 (refinamento)

1. **Teste real:** rodar `npm run download:retroarch-cores` na máquina do Douglas e confirmar cores em `src-tauri/resources/retroarch/cores/`
2. **Validar checksums:** buildbot fornece SHA-256, adicionar verificação (não crítico, pode ser depois)
3. **Mudar versões pinadas:** hoje usa `"latest"`, depois de testar mudar para versões específicas datadas (ex: `2025-08-03`) para reprodutibilidade

## Etapa 3: Localização em tempo de execução (IMPLEMENTADA)

**Mecanismo:** cores bundled são copiados na primeira execução via variável de ambiente.

### Fluxo

1. Tauri seta `ZEUX_BUNDLED_CORES_DIR` apontando para recursos do instalador
2. Daemon lê cores de `$ZEUX_BUNDLED_CORES_DIR/retroarch/cores/`
3. Na primeira chamada a `locateCore()`, copia para:
   - Linux: `~/.local/share/zeux/retroarch/cores/`
   - macOS: `~/Library/Application Support/ZeuX/RetroArch/cores/`
   - Windows: `%APPDATA%\ZeuX\RetroArch\cores`
4. Idempotente: se arquivo já existe, não copia duas vezes
5. Erros não bloqueiam daemon: cores podem vir do Online Updater do RetroArch

### Implementação

**Arquivo novo:** `internal/emulator/bundled_cores.go`
- `ensureBundledCoresAvailable()` — copia cores bundled (primeira vez)
- `bundledCoreDirsForWrite()` — detecta diretório de escrita conforme SO
- `copyFile()` — utilitário de cópia atômico

**Modificações:** `internal/emulator/retroarch.go`
- `locateCore()` chamaa `ensureBundledCoresAvailable()` na primeira vez via `sync.Once`
- `bundledCoresInitOnce` garante execução única

Testes: todos passam (nenhuma mudança em comportamento de teste existente).

## Etapa 4: Integração Tauri (IMPLEMENTADA)

Tauri agora é configurado para:
1. Empacotar `src-tauri/resources/retroarch/cores/` no instalador
2. Passar `ZEUX_BUNDLED_CORES_DIR` para o daemon na inicialização
3. Preparado para build em Windows, Linux e macOS

### Implementação de Etapa 4

#### src-tauri/tauri.conf.json
- Adicionado `"resources": ["resources/"]` em `bundle` — garante que `src-tauri/resources/` é empacotado
- `"externalBin": ["binaries/zeuxd"]` já estava presente (empacota o daemon)
- `beforeBuildCommand` e `beforeDevCommand` já executam `npm run build:daemon` que baixa cores (ou usa placeholders)

#### src-tauri/src/lib.rs
- Adicionado `BUNDLED_CORES_RELATIVE_PATH` constants (platform-specific paths)
- No `PortState::Free` (linhas ~112-126):
  - Calcula `bundled_cores_dir` usando `app.path().resource_dir()`
  - Passa via `.env("ZEUX_BUNDLED_CORES_DIR", cores_dir)` ao sidecar zeuxd
  - Se cores empacotados não existem, prossegue (cores podem vir de Online Updater)

#### scripts/download-retroarch-cores.mjs
- Removido import de `undici` — usa fetch nativo do Node.js v22
- Agora gracioso com buildbot indisponível (buildbot bloqueado em container, funcionará em máquina do usuário)
- Detecta plataforma e baixa 20 cores para `src-tauri/resources/retroarch/cores/`

#### Verificação de compilação
- ✅ `cargo check` compila sem erros
- ✅ Daemon (zeuxd) compila com sucesso (18 MB)
- ✅ npm run build:daemon processa download + compilação

### Próximos passos (testes em máquina do Douglas)

- [ ] **Teste real em Zorin OS:** rodar `npm run tauri build` e verificar que cores aparecem no instalador
- [ ] **Primeira execução:** cores devem aparecer em `~/.local/share/zeux/retroarch/cores/`
- [ ] **Medir tamanho:** registrar crescimento do instalador por plataforma
- [ ] **Lancenta de jogo:** testar que cores bundled funcionam ao lançar uma ROM (Phantasy Star, Mario 64, etc)

### Nota sobre blocker

Buildbot.libretro.com está inacessível no container (proxy policy). O script está preparado para quando testado em máquina com acesso irrestrito. Até lá, cores podem ser pré-populados manualmente ou o download automático funcionará no build do usuário.

## Licenças verificadas (Etapa 1 concluída)

Ver `docs/THIRD-PARTY-LICENSES.md` — todos os 20 cores têm licença aberta ou
não-comercial (aceitável pois ZeuX é gratuito).

## Etapa 5: empacotar o app do RetroArch em si (IMPLEMENTADA — 2026-08-04)

**A lacuna real:** as Etapas 1-4 empacotaram os cores, nunca o executável do
RetroArch. Achado testando o instalador de verdade (2026-08-04): a tela de
Emuladores mostrava "RetroArch não instalado" mesmo com os 20 cores dentro do
`.deb`. `retroArchAdapter.Locate()` (`internal/emulator/retroarch.go`) nunca
tinha um lugar bundled para procurar — só os cores tinham (`bundledCoreDirs()`).
O próprio ADR 0012 já registrava isso como decisão em aberto ("onde `Locate()`
passa a procurar essa cópia empacotada").

### Descoberta real da estrutura do buildbot (sessão de IA teve acesso
pontual a `buildbot.libretro.com` nesta sessão — verificado com `curl`, não
suposição)

Diferente dos cores (`.../nightly/<plataforma>/latest/<arquivo>.zip`), o app
do RetroArch:

- **Não tem pasta `latest/`** — o buildbot guarda builds datadas
  (`.../nightly/<plataforma>/2026-08-04_RetroArch.7z`, uma por dia) e também
  publica um **alias fixo sem data**, `.../nightly/<plataforma>/RetroArch.7z`
  (sempre a build mais recente). É esse alias que
  `cmd/download-retroarch-app` usa.
- **Formato .7z**, não .zip. Extraído com `github.com/bodgit/sevenzip` — lib
  que o projeto já usa em Go puro para os pacotes de emuladores do 1-click
  (`internal/install/extract.go`), então não precisou de dependência nova nem
  de um binário `7z` de sistema.
- **Estrutura interna diferente por SO** (confirmado baixando os dois
  pacotes de verdade, ~191MB Linux / ~219MB Windows):
  - **Linux:** um único AppImage autocontido,
    `RetroArch-Linux-x86_64/RetroArch-Linux-x86_64.AppImage` (~11MB depois de
    extraído). O pacote também traz uma pasta irmã enorme
    (`.../RetroArch-Linux-x86_64.AppImage.home/`, ~19 mil arquivos —
    convenção "AppImage home" com assets/shaders/overlays para modo
    portátil) que é ignorada de propósito: o ZeuX lança o jogo direto por
    linha de comando, nunca passa pelo menu do RetroArch.
  - **Windows:** `retroarch.exe` precisa de ~65 DLLs ao lado dele
    (`RetroArch-Win64/*.dll`, ~147MB no total) — sem elas o executável não
    abre. `cmd/download-retroarch-app` extrai todo o nível de topo do
    pacote, mas nenhuma das subpastas de assets (`shaders/`, `overlays/`,
    `assets/`, `database/`, etc.).
  - **macOS:** confirmado que o buildbot distribui `.dmg`
    (`.../nightly/apple/osx/x86_64/RetroArch.dmg`), não `.7z`. **Deixado de
    fora deliberadamente** — montar um `.dmg` não tem rota simples em Go
    puro; decisão de escopo, não aposta.

### Implementação

**Novo comando Go:** `cmd/download-retroarch-app/main.go` — baixa e extrai
para `src-tauri/resources/retroarch/bin/`. Não-fatal (mesma filosofia de
`scripts/download-retroarch-cores.mjs`): falha imprime aviso, não derruba o
build. Chamado por `npm run download:retroarch-app`, encadeado em
`build:daemon` depois de `download:retroarch-cores`.

**`internal/emulator/bundled_retroarch.go`:** `EnsureBundledRetroArchAvailable()`
copia o que estiver em `$ZEUX_BUNDLED_RETROARCH_DIR` (o que o comando acima
deixou) para o mesmo diretório gerenciado que uma instalação 1-click usaria
(`ManagedEmulatorDir(root, "retroarch", ...)`). **Decisão de desenho:**
reaproveitar o diretório gerenciado em vez de ensinar `Locate()` a procurar
num lugar novo — `findBinary` (`internal/emulator/discovery.go`) já checava
esse diretório primeiro, inclusive com um caso especial preexistente para um
único `*.AppImage` lá dentro (originalmente pensado para emuladores baixados
pelo 1-click). Resultado: **nenhuma mudança em `retroArchAdapter.Locate()`**
foi necessária — a tela de emuladores passa a mostrar "instalado pelo ZeuX"
sozinha.

Chamada uma vez, cedo, em `cmd/zeuxd/main.go` — antes de qualquer requisição
a `/emulators` poder chegar, diferente dos cores (que só precisam estar
prontos na hora de montar o comando de lançamento).

**`src-tauri/src/lib.rs`:** calcula `bundled_retroarch_dir` do mesmo jeito
que `bundled_cores_dir`, repassa como `ZEUX_BUNDLED_RETROARCH_DIR` ao
sidecar. `"resources": ["resources/"]` em `tauri.conf.json` já cobria
qualquer coisa dentro de `resources/`, incluindo o novo `retroarch/bin/` —
nenhuma mudança necessária ali.

**`internal/install/sources.go` / `data/sources.json`:** novo `KindBundled`
("bundled") — o RetroArch deixou de ser `"kind": "manual"` (texto do
buildbot, pré-ADR-0012) e passou a `"kind": "bundled"`, com `reason`
explicando que já vem no instalador. `Manager.Start()`
(`internal/install/manager.go`) recusa `KindBundled` com mensagem própria,
defensivamente — não deveria aparecer botão de instalar para isto, já que
`Locate()` encontra a cópia empacotada antes de qualquer clique.

### Verificado nesta sessão (2026-08-04)

- `go build`/`go vet`/`go test ./...` — verdes, incluindo compilação cruzada
  Windows/macOS.
- `go run ./cmd/download-retroarch-app` rodou de ponta a ponta contra o
  buildbot real: baixou `RetroArch.7z` (Linux), extraiu
  `RetroArch-Linux-x86_64.AppImage` (11MB), marcou executável.
- **O AppImage extraído roda de verdade:** `--version` devolveu
  `RetroArch - Frontend for libretro / Version: 1.22.2`.
- `npm run tauri build` completo (segunda rodada, com o app bundled) —
  resultado registrado em `docs/roadmap.md`.

### O que ainda falta

- [ ] **macOS:** decidir e implementar o caminho do `.dmg` (montar via
      `hdiutil` só existe no próprio macOS — o download/extração precisaria
      rodar dentro do `build-macos.yml`/`release.yml`, não em qualquer SO
      como Linux/Windows hoje).
- [ ] **Instalar e lançar um jogo de verdade** usando o RetroArch bundled —
      esta sessão confirmou que o binário abre e responde a `--version`, mas
      não que `BuildCommand` (`retroarch -L core.so rom`) funciona de ponta a
      ponta pelo caminho gerenciado. Cai dentro do D11 (só o Douglas pode
      fechar, com ROM real).
- [ ] **Versão pinada de verdade:** hoje o alias `RetroArch.7z` sempre
      aponta pra build mais recente do dia — o ADR 0012 pede versão fixa,
      atualizada deliberadamente. Trocar pelo nome datado
      (`2026-08-04_RetroArch.7z`) quando o Douglas decidir cortar uma versão
      do ZeuX, em vez do alias móvel.
