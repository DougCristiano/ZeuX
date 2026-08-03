# Licenças de terceiros — RetroArch e cores libretro empacotados

Este arquivo lista as licenças de todos os componentes de terceiros distribuídos dentro do instalador do ZeuX.

## RetroArch

- **Projeto:** RetroArch (frontend)
- **Licença:** GNU General Public License v3.0 (GPLv3)
- **Repositório:** https://github.com/libretro/RetroArch
- **Descrição:** Frontend multiplataforma para cores libretro

## Cores libretro

Os cores listados abaixo são carregados pelo RetroArch e selecionados automaticamente conforme o console emulado:

| Core | Console | Licença | Repositório |
|------|---------|---------|-------------|
| mesen | NES | GPLv3 | github.com/libretro/mesen |
| snes9x | SNES | Non-commercial freeware | github.com/libretro/snes9x |
| gambatte | Game Boy, Game Boy Color | GPLv2 (verificado) | github.com/libretro/gambatte-core |
| mgba | Game Boy Advance | Mozilla Public License 2.0 | github.com/libretro/mgba |
| mupen64plus-libretro | Nintendo 64 | GPLv2 | github.com/libretro/mupen64plus-libretro |
| melonds | Nintendo DS | GPLv3 | github.com/libretro/melonDS |
| beetle vb | Virtual Boy | GPLv2 | github.com/libretro/beetle-vb-libretro |
| genesis plus gx | Master System, Game Gear, Mega Drive, Sega CD | Non-commercial | github.com/libretro/Genesis-Plus-GX |
| picodrive | Sega 32X | Non-commercial BSD variant | github.com/libretro/picodrive |
| beetle saturn | Sega Saturn | GPLv2 | github.com/libretro/beetle-saturn-libretro |
| flycast | Dreamcast | GPLv2 | github.com/libretro/flycast |
| beetle psx hw | PlayStation 1 | GPLv2 | github.com/libretro/beetle-psx-libretro |
| ppsspp | PlayStation Portable | GPLv2+ | github.com/libretro/ppsspp |
| beetle pce | PC Engine | GPLv2 | github.com/libretro/beetle-pce-fast-libretro |
| beetle ngp | Neo Geo Pocket | GPLv2 | github.com/libretro/beetle-ngp-libretro |
| beetle cygne | WonderSwan | GPLv2 (verificado) | github.com/libretro/beetle-cygne-libretro |
| opera | 3DO | GPLv2 (verificado) | github.com/libretro/opera-libretro |
| stella | Atari 2600 | GPLv2 | github.com/libretro/stella |
| mame | Arcade, Neo Geo | GPLv2+ / BSD-3-Clause (múltiplas) | github.com/libretro/mame |
| fbneo | Neo Geo (arcade) | Non-commercial | github.com/libretro/fbneo |

## Notas importantes

### Licenças não-comerciais

Alguns cores (`snes9x`, `genesis-plus-gx`, `picodrive`, `fbneo`) mantêm restrições de não-comercialidade. Como o ZeuX é distribuído gratuitamente e sem fins comerciais, isso não representa restrição prática. Se houver mudança nos termos de distribuição do ZeuX no futuro (ex.: venda comercial), essas versões precisam ser substituídas por alternativas com licença permissiva (ver seção abaixo).

### Alternativas compatíveis para uso comercial

Caso haja necessidade futura de distribuição comercial, existem alternativas com licença aberta:

- **SNES:** `bsnes` (GPLv3) — mais lento, focado em precisão; não recomendado para compatibilidade geral
- **Sega 16-bit, 32X, Neo Geo:** Sem alternativa clara viável com licença permissiva no libretro

### Conformidade de licença

Este empacotamento segue os requisitos de cada licença:

- **GPL (v2/v3):** Código-fonte de cada core permanece disponível em seus repositórios públicos no GitHub
- **MPL 2.0:** Idem
- **Non-commercial:** Uso permitido sem fins comerciais, conforme os termos

Nenhum binário foi modificado. As versões empacotadas são idênticas aos releases publicados pelos projetos originais.

## Data de verificação

Verificação de licenças realizada em 2026-08-03 durante a implementação de ADR 0012.

Próxima verificação recomendada: quando qualquer core for atualizado de versão no ADR 0012.
