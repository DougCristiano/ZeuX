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

## Etapa 2: Script de download (BLOQUEADO — DECISÃO NECESSÁRIA)

### Problema descoberto

Os cores libretro **não têm releases centralizadas no GitHub**. Cada repositório segue um padrão diferente:

- **mgba, stella:** publicam binários (appimage, dmg, etc), não .so/.dll/.dylib
- **mesen:** versão 0.9.x é abandonada; 2.x não tem releases
- **ppsspp (fork libretro):** não tem releases (usar upstream? diferente.)
- **Fonte oficial:** buildbot.libretro.com (fora do GitHub, com política de rede variável)

Empacotar 20 cores não é tão simples quanto empacotar zeuxd.

### Opções (escolha uma)

**Opção A: Compilar cores durante o build (complexo, longo)**
- Clonar cada repositório de core, compilar cada um
- Vantagem: fonte fidedigna, controle total
- Desvantagem: tempo de build 30+ min, requer compiladores C/C++/Rust, complexo

**Opção B: Usar buildbot.libretro.com (quebra padrão GitHub)**
- Baixar cores compilados da source oficial: `https://buildbot.libretro.com/`
- Vantagem: binários reais, mantidos pelos projetos
- Desvantagem: fora do GitHub (diferente de zeuxd, outros adapters)

**Opção C: Empacotar só RetroArch, deixar cores para manual**
- Empacotar o executável do RetroArch (muito menor, ~100 MB)
- Usuário baixa cores via "Online Updater" dentro do RetroArch
- Vantagem: simples, reduz tamanho instalador
- Desvantagem: volta ao passo inicial ("2 passos", não "1-click completo")

**Opção D: Compilar um subset pequeno (pragmático)**
- Empacotar apenas cores de 3-5 consoles mais importantes (ex: NES, SNES, PS1)
- Deixar outros para manual ou Online Updater
- Vantagem: viável agora, pode expandir depois
- Desvantagem: incompleto, critério de "quais?" subjetivo

### Recomendação

Para esta sessão, recomendo **Opção C ou D**:
- **C** resolve 80% do problema (RetroArch instalado, cores manuais)
- **D** resolve 40% mas prova o mecanismo de empacotamento

A decisão é sua. Qual caminho?

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
