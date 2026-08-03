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

## Etapa 4: Integração Tauri (PENDENTE)

Esta etapa envolve configurar o Tauri para:
1. Empacotar `src-tauri/resources/retroarch/cores/` no instalador
2. Passar `ZEUX_BUNDLED_CORES_DIR` para o daemon na inicialização
3. Testar o build completo em Windows, Linux e macOS

### Checklist de Etapa 4

- [ ] **Tauri bundler:** garantir que `src-tauri/resources/` é incluído no instalador
  - Windows: `src-tauri/resources/` → `{app}/resources/`
  - Linux AppImage: `src-tauri/resources/` → `{app}/resources/`
  - macOS .app: `src-tauri/resources/` → `{app}.app/Contents/Resources/`

- [ ] **Passar variável de ambiente:** Tauri precisa seter `ZEUX_BUNDLED_CORES_DIR` quando inicia o sidecar `zeuxd`
  - Tauri v2 permite isso em `tauri.conf.json` (seção `app > windows > env` ou via Rust)
  - Apontar para a pasta `resources/retroarch/cores` relativa ao app

- [ ] **Teste de build real:** rodar `npm run tauri build` em cada plataforma
  - Verificar que cores aparecem em `~/.local/share/zeux/retroarch/cores/` (Linux) na primeira execução
  - Confirmar que cores são usados ao lançar um jogo

- [ ] **Medir tamanho do instalador:** comparar antes e depois (cada plataforma)
  - Documentar crescimento em ADR 0012 (revisão final)

### Recursos

Documentação Tauri v2:
- Sidecar environment: https://tauri.app/docs/v2/features/command/
- Bundler configuration: https://tauri.app/docs/v2/features/bundler/

### Nota

Esta etapa requer trabalho no código Tauri/Rust (fora do escopo do Go code).
Douglas pode completar isto com o frontend team ou deixar como futuro.
A parte Go está 100% pronta (etapas 1-3).

## Licenças verificadas (Etapa 1 concluída)

Ver `docs/THIRD-PARTY-LICENSES.md` — todos os 20 cores têm licença aberta ou
não-comercial (aceitável pois ZeuX é gratuito).
