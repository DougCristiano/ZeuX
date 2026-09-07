# Atualizações do ZeuX

O ZeuX usa o updater do Tauri para consultar a release mais recente em:

`https://github.com/DougCristiano/ZeuX/releases/latest/download/latest.json`

As atualizações são assinadas. Antes de publicar a primeira release com esse
fluxo:

1. Gere uma chave localmente, sem versionar a chave privada:

   `npm run tauri signer generate -w ~/.tauri/zeux.key`

2. Copie o conteúdo da chave pública para `src-tauri/tauri.conf.json`, no campo
   `plugins.updater.pubkey`.

3. Configure estes secrets no repositório GitHub:

   - `TAURI_SIGNING_PRIVATE_KEY`: conteúdo de `~/.tauri/zeux.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: senha usada na geração, se houver

4. Publique uma release com uma tag `v`, por exemplo `v0.2.0`. O workflow gera
   os instaladores, as assinaturas e o `latest.json`.

O botão fica em Configurações. O usuário pode procurar uma atualização, ver as
notas da release e baixar/instalar a versão assinada. Depois da instalação, o
aplicativo reinicia sozinho.

Nunca troque a chave privada depois que uma versão for distribuída. Se ela for
perdida ou substituída, as instalações existentes não conseguirão validar as
atualizações futuras.

## A versão que o updater compara vem da tag, não de `package.json`

`package.json` e `src-tauri/tauri.conf.json` **não têm o número da versão
digitado à mão.** O `version` dos dois é sobrescrito em CI, a cada job de
build (Windows/Linux/macOS), pelo `.github/workflows/scripts/sync-version.mjs`
— que lê a tag do release (`v0.1.12` → `0.1.12`) e grava nos dois arquivos
antes do `tauri-action` empacotar. Isso roda três vezes (um por job) porque
cada runner faz checkout da tag e builda por conta própria; não é
redundância a limpar.

**Achado real (2026-09-07, relato do Douglas):** antes desse script existir,
os dois arquivos ficavam travados em `"version": "0.1.0"` desde sempre — só
a tag do git avançava a cada release (v0.1.9, v0.1.10, v0.1.11...). O
`latest.json` que o plugin de updater consulta é gerado a partir desse
`version` do build, não da tag. Com o app instalado e o manifesto sempre
dizendo `0.1.0`, a comparação de versão do updater nunca via diferença — o
botão em Configurações reportava "já está atualizado" mesmo com releases
mais novas publicadas no GitHub. Sintoma que apareceu para o usuário:
emuladores que o ZeuX tinha instalado (Dolphin, RetroArch) pareciam
"desaparecer" depois de uma atualização manual — na verdade não
desapareceram nunca, é que a atualização em si nunca tinha ocorrido de fato
via updater.

Se algum dia o `version` de `package.json`/`tauri.conf.json` voltar a
divergir da tag publicada (por exemplo: alguém commitar um valor manual e o
CI não sobrescrever mais), o sintoma é exatamente este: o updater sempre diz
que não há atualização, mesmo havendo release mais nova.
