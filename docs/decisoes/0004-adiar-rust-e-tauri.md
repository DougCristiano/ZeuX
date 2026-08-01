# 0004 — Adiar a instalação de Rust e Tauri

**Status:** Aceito

## Contexto

A interface do ZeuX será Tauri + React + Tailwind. Montar esse ambiente no
Windows não é trivial: exige a toolchain Rust, as **MSVC Build Tools** (vários
GB de download), o WebView2 e a estrutura `src-tauri/`.

O instinto seria montar o ambiente completo antes de começar — mas as perguntas
de risco do produto não são de interface. São:

- A detecção de hardware funciona nos três SOs, com fallback digno quando o
  sistema não coopera?
- É possível produzir um parecer honesto e útil, que nomeie o gargalo em vez de
  dar uma nota opaca?
- Dá para montar a linha de comando de 8 emuladores diferentes de forma
  consistente?

Nenhuma delas precisa de um pixel na tela para ser respondida — desde que a IPC
seja HTTP, e não sidecar (ver [ADR 0001](0001-ipc-http-local.md)).

## Decisão

Não instalar Rust nem as MSVC Build Tools até que a Fase 1 (núcleo em Go) esteja
completa e verificada pela API. A Fase 2 abre com a instalação desse ambiente.

## Consequências

**Positivas**

- Todo o núcleo foi construído, testado e verificado por HTTP sem nenhuma
  dependência de UI. Os testes rodam em segundos.
- Vários GB de ferramentas não foram baixados para algo que ainda não seria
  usado.
- A API foi desenhada para ser consumida por um cliente que não existe, o que a
  manteve honesta: nada de rota moldada por conveniência de tela.

**Negativas / custos aceitos**

- **Ainda não há prova de que o Tauri consome esta API confortavelmente.** É uma
  aposta baseada em ser HTTP comum, mas não foi verificada. Riscos ainda em
  aberto: CORS a partir do WebView, gestão do processo filho `zeuxd`,
  empacotamento do binário Go no instalador.
- A instalação do ambiente Tauri virou um bloqueio de caminho crítico no início
  da Fase 2, com risco de consumir mais tempo do que o previsto.
- **O projeto vive dentro do OneDrive.** Quando `node_modules/` e
  `src-tauri/target/` aparecerem, a sincronização vai sofrer — são dezenas de
  milhares de arquivos pequenos e voláteis. O `.gitignore` já os exclui do Git,
  mas o `.gitignore` não diz nada ao OneDrive. Precisa ser resolvido **antes** do
  primeiro `npm install`, não depois. Está no [roadmap](../roadmap.md).
