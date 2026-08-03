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

## Etapa 2: Script de download (PENDENTE)

Será implementado em `scripts/download-retroarch-cores.mjs`. Responsabilidades:

1. Ler a lista de 20 cores de `internal/emulator/retroarch.go` (ou usar um manifest JSON fixo)
2. Para cada core, buscar a release mais recente no GitHub
3. Download do arquivo binário correspondente à plataforma (SO/DLL/dylib)
4. Armazenar em `src-tauri/resources/retroarch/cores/`
5. Calcular SHA-256 para verificação de integridade
6. Registrar o resultado em um `manifest.json` (versões baixadas, checksums)

**Integração no build:** adicionar ao `package.json` script `build:daemon`:

```json
"build:daemon": "npm run download:retroarch-cores && node scripts/build-zeuxd.mjs"
```

Versões de cores serão **pinadas manualmente** em um arquivo (não `latest` automaticamente).

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
