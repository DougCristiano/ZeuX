# 0001 — IPC via HTTP local em vez de sidecar do Tauri

**Status:** Aceito

## Contexto

O núcleo do ZeuX (detecção de hardware, parecer por console, orquestração de
emuladores) é escrito em Go. A interface será Tauri + React. Restava decidir
como os dois conversam.

O Tauri oferece nativamente o modelo de **sidecar**: o binário Go seria
empacotado junto do app e a comunicação aconteceria por stdin/stdout, com o
front-end chamando comandos Rust que repassam mensagens.

O problema prático: no momento da decisão, o front-end não existia — e não
existiria por um bom tempo, porque Rust e as MSVC Build Tools nem estavam
instalados (ver [ADR 0004](0004-adiar-rust-e-tauri.md)). Com o modelo sidecar,
não haveria como exercitar nenhuma funcionalidade do núcleo antes de ter uma UI
funcionando.

## Decisão

O núcleo roda como um **daemon local (`zeuxd`) que expõe uma API HTTP em
`127.0.0.1:7777`**. O front-end consumirá essa API com `fetch` comum.

O bind fica travado em `127.0.0.1` por padrão (`--addr` pode trocar). Este daemon
serve uma interface que roda na mesma máquina e não tem motivo para aceitar
conexões externas.

## Consequências

**Positivas**

- Toda rota é exercitável com `curl` ou `Invoke-RestMethod`, sem UI nenhuma. Foi
  exatamente assim que a Fase 1 inteira foi construída e verificada.
- A fronteira entre núcleo e interface fica explícita e documentável
  (ver [api.md](../api.md)), em vez de ser um protocolo implícito de mensagens.
- Nada impede um segundo cliente no futuro (CLI, outra UI, script).
- Regras de segurança podem viver no servidor e valer para qualquer cliente —
  é o que a checagem de consentimento faz.

**Negativas / custos aceitos**

- Uma porta local fica aberta enquanto o app roda. Qualquer processo na máquina
  pode falar com a API. Como o daemon não expõe nada além do que o próprio
  usuário já pode fazer localmente, o risco foi considerado aceitável — mas isso
  precisa ser reavaliado quando entrarem funcionalidades sociais autenticadas.
- Porta fixa pode colidir. `--addr` existe, mas o front-end ainda não sabe
  descobrir a porta dinamicamente.
- Sem autenticação e sem CORS configurados. Quando o Tauri entrar, o `origin`
  do WebView precisa ser considerado.
- O ciclo de vida do daemon vira responsabilidade do Tauri, que o gerenciará
  como processo filho. Por isso `cmd/zeuxd/main.go` trata `SIGTERM` e
  `os.Interrupt` com shutdown limpo em 5 s — para não deixar a porta presa.
