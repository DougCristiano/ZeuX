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
