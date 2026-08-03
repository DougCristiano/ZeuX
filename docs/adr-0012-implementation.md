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

## Etapa 3: Localização em tempo de execução (PENDENTE)

Modificar `retroarch.go` para procurar em:

1. `~/.local/share/zeux/retroarch/cores/` (Linux) — **onde cores bundled são copiados no primeiro uso**
2. `~/Library/Application Support/ZeuX/RetroArch/cores` (macOS)
3. `%APPDATA%\ZeuX\RetroArch\cores` (Windows)

Estes diretórios são **preenchidos pelo instalador** (durante Tauri install, cores bundled são copiados de `AppName.app/Contents/Resources/retroarch/cores/` para o local de dados do usuário).

Na primeira execução, daemon verifica se o diretório existe e está vazio → copia cores bundled de `AppName.app/Contents/` (via Rust FFI ou execução de `tauri::api::fs::copy_recursive`).

## Etapa 4: Integração de build e medição (PENDENTE)

1. Configurar GitHub Actions para download de cores em tempo de build
2. Medir tamanho do instalador final (antes e depois)
3. Documentar em ADR 0012 o tamanho real e por plataforma

## Licenças verificadas (Etapa 1 concluída)

Ver `docs/THIRD-PARTY-LICENSES.md` — todos os 20 cores têm licença aberta ou
não-comercial (aceitável pois ZeuX é gratuito).
