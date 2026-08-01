# Plano da Sprint B — Ambiente Tauri e casca da UI

Detalhamento da Sprint B do [roadmap](roadmap.md). Está em arquivo separado
porque o roadmap é um índice de backlog: caberia a tabela, não os doze critérios
de aceite.

**Objetivo:** a primeira tela consumindo a API — e, junto com ela, a primeira
prova de que o [ADR 0001](decisoes/0001-ipc-http-local.md) (IPC por HTTP local)
funciona dentro de um WebView de verdade.

Escrito em 2026-08-01, contra o código verificado na mesma data.

---

## O que esta sprint realmente é

Duas coisas foram empacotadas sob o nome "casca da UI", e vale separá-las porque
o risco está quase todo em uma delas:

1. **Montar o ambiente** (Rust, MSVC Build Tools, WebView2, scaffold, ciclo de
   vida do daemon, empacotamento). É trabalho de encanamento com risco de
   ambiente — pode custar mais do que parece, mas não pode dar errado de forma
   surpreendente.
2. **Provar o ADR 0001.** Isso não é encanamento, é a única decisão
   arquitetural do projeto que nunca foi exercitada. O
   [ADR 0004](decisoes/0004-adiar-rust-e-tauri.md) escreveu isso com todas as
   letras: *"ainda não há prova de que o Tauri consome esta API
   confortavelmente"*. A Sprint B é onde essa dívida vence.

A sequência abaixo é desenhada para que o item 2 aconteça **o mais cedo
possível**, antes de existir qualquer tela — porque um problema de origin/CORS
descoberto com um botão na tela custa uma tarde, e descoberto com onze telas
prontas custa a sprint.

---

## Estado verificado antes de planejar

Levantado lendo o código e a árvore de arquivos, não a memória:

| Fato | Verificação |
|---|---|
| **D4 não foi resolvido.** O projeto continua em `C:\Users\doufl\OneDrive\Documentos\ZeuX`, e não existe junction, `CARGO_TARGET_DIR` nem exclusão registrada em lugar nenhum | `ls` da raiz; `.gitignore` exclui `node_modules/` e `src-tauri/target/` do Git — e só do Git |
| **Não existe nada de front-end ainda.** Sem `package.json`, sem `src-tauri/`, sem `node_modules/` | `ls -d node_modules src-tauri package.json` → nada |
| **O servidor não tem uma linha de CORS.** Nenhum `Access-Control-*` em `internal/api/server.go` | `grep -rn "Access-Control\|CORS" internal/ cmd/` → só um teste de host do instalador, sem relação |
| ~~O wireframe de 7 telas não está no repositório~~ — **corrigido 2026-08-01**, ver B-wire | [`docs/wireframe.md`](wireframe.md) / [`docs/wireframe.html`](wireframe.html) |
| ~~`docs/api.md` está desatualizado~~ — **corrigido 2026-08-01**, ver B-doc | `schema_version: 3`, 33 consoles, rotas de instalação e de emuladores personalizados documentadas |
| **O bloqueio por hardware com escape já existe no servidor**: `hardwareBlocks` + `?force=true` + `override_hint`, em `internal/api/server.go` | linhas ~107–140 |
| **O daemon já desliga limpo**: `--addr` configurável, `SIGTERM`/`os.Interrupt` com `Shutdown` de 5 s | `cmd/zeuxd/main.go` |
| Existe remoto no GitHub (`DougCristiano/ZeuX`) | `git remote -v` |

Os dois primeiros achados mudam o plano: **D4 é o item 0 da sprint**, e o
"layout visual sobre o wireframe" pressupõe um insumo que hoje não existe em
lugar versionado.

---

## Sequência

```
B0 (D4, OneDrive)
 └─> B1 (Rust + MSVC + WebView2)
      └─> B2 (prova de fogo do ADR 0001)   <-- risco arquitetural morre aqui
           ├─> B3 (CORS no servidor, se B2 pedir)
           └─> B4 (scaffold Tauri + React + Tailwind)
                ├─> B5 (ciclo de vida do zeuxd)
                ├─> B6 (cliente de API tipado)  <-- precisa de B-doc
                └─> B7 (layout visual)          <-- precisa de B-wire
                     └─> B8 (onboarding) ─> B9 (parecer) ─> B10 (instalar com ressalva)
                          └─> B11 (empacotamento)
```

`B-wire` e `B-doc` são pré-requisitos baratos que não estavam na tabela antiga e
sem os quais B6 e B7 começam sobre areia. Podem rodar em paralelo com B1.

---

## Os itens

### B0 — Tirar os artefatos de build do OneDrive (P) — é o D4

Enquanto isto não acontecer, nada mais da sprint pode começar: o primeiro
`npm install` põe dezenas de milhares de arquivos pequenos e voláteis dentro de
uma pasta sincronizada, e o `src-tauri/target/` do Rust é pior ainda. O
`.gitignore` já os exclui do Git — e o `.gitignore` não diz nada ao OneDrive.

**Recomendação:** mover o repositório para fora do OneDrive (`C:\dev\ZeuX`), com
o remoto do GitHub cumprindo o papel de backup que hoje o OneDrive cumpre. É a
solução menor: uma decisão, uma vez, sem mecanismo para manter.

A alternativa é manter o repositório onde está e transformar `node_modules/` e
`src-tauri/target/` em *junctions* apontando para fora do OneDrive (o OneDrive
não atravessa reparse points), somada a `CARGO_TARGET_DIR`. Funciona, mas cria
um passo de setup que some em qualquer clone novo e que ninguém lembra de
refazer — custo permanente para evitar um custo único.

**Critério de aceite:**

- [ ] `(Get-Location).Path` do repositório **não** começa com `$env:OneDrive` —
      ou, se a opção de junction for escolhida,
      `Get-Item node_modules, src-tauri/target | Select-Object LinkType` devolve
      `Junction` para os dois, com alvo fora do OneDrive.
- [ ] Depois de um `npm install` completo, o ícone do OneDrive volta a "em dia"
      sem ter sincronizado nada de `node_modules` (conferir pelo painel de
      atividade do OneDrive, que lista os arquivos processados).
- [ ] `mise exec -- go build ./...` e `mise exec -- go test ./...` passam do novo
      caminho.
- [ ] `git status` limpo, e `git log` intacto (se o repositório for movido, é
      `move` da pasta inteira, não clone novo — o histórico é o de verdade).
- [ ] O caminho escolhido e o porquê ficam escritos no `roadmap.md`, no item D4,
      marcado **Feito** com a data.

**Depende de:** nada
**Bloqueia:** B1 e, por transitividade, a sprint inteira

> Se o repositório for movido, os caminhos absolutos em `CLAUDE.md` e em
> `.claude/settings.local.json` deixam de valer. Isso é edição fora do escopo
> deste plano — decidir com o Douglas antes de mexer.

**Tentativa em 2026-08-01:** `Move-Item` para `C:\dev\ZeuX` falhou duas vezes
com "o arquivo está sendo usado por outro processo" — mesmo depois de sair da
pasta no PowerShell que executava o comando. `Get-Process` no momento mostrava
uma dezena de janelas de `Code` abertas e a própria sessão do Claude Code
(`cloudcode_cli`), ambos plausivelmente com um handle na árvore — a sessão em
si tem a pasta como raiz do projeto. Checado: `CLAUDE.md` e
`.claude/settings.local.json` **não** têm caminho absoluto do repositório
codificado (só o caminho do `mise` no `PATH`, que é externo à pasta), então a
migração continua segura quando repetida — só precisa acontecer com o VS Code
e a sessão fechados, não de dentro deles.

---

### B-wire — Publicar o wireframe no repositório (P) — **feito em 2026-08-01**

O roadmap afirmava que o wireframe de 7 telas estava **feito desde 2026-08-01**,
e o ADR 0009 se apoia nele (*"isso já aparece no wireframe de propósito"*). Mas
não existia arquivo de wireframe no repositório: o artefato tinha sido gerado
dentro de uma sessão anterior e nunca commitado.

**Correção aplicada:** o HTML autocontido foi copiado para
[`docs/wireframe.html`](wireframe.html), e [`docs/wireframe.md`](wireframe.md)
foi escrito como índice — as 7 telas, o que cada uma prova, e uma tabela de
onde cada regra não-negociável encosta (com link para a tela correspondente).

**Critério de aceite:**

- [x] Existe `docs/wireframe.md` e `docs/wireframe.html` versionados, cobrindo
      as 7 telas: consentimento, leitura de hardware, parecer, biblioteca vazia,
      biblioteca com jogos, emuladores, instalar com ressalva.
- [x] Cada tela traz anotada a regra de produto que encosta nela — no mínimo:
      texto descritivo no parecer, `precision: "parcial"` visível, ordem de foco,
      e a ausência de qualquer caminho de ROM que não seja arquivo já no disco.
- [x] O roadmap deixa de citar um artefato inexistente: a linha do wireframe
      aponta para o arquivo.

**Depende de:** nada
**Bloqueia:** B7

---

### B-doc — Reconciliar `docs/api.md` com o código antes de tipar o cliente (P) — **feito em 2026-08-01**

`api.md` documentava `schema_version` "hoje `2`" e "consoles: hoje `13`",
divergindo do código real (`schema_version: 3`, 33 consoles). Além disso,
oito rotas registradas em `internal/api/server.go`
(`GET/POST /custom-emulators`, `DELETE /custom-emulators/{id}`,
`GET /emulator-sources`, `POST/DELETE /emulators/{id}/install`,
`GET /installs`, `GET /installs/{id}`) não apareciam no arquivo — o índice de
rotas listava 10 quando o servidor expõe 18.

**Correção aplicada:** as oito rotas ganharam seção própria (corpo, resposta,
erros, lidos direto de `server.go`, `install/manager.go` e
`install/sources.go`), `schema_version`/contagem de consoles foram corrigidos,
a ordem de registro dos 13 adapters foi atualizada em `/emulators`, e o
catálogo de códigos de erro ganhou as sete entradas novas
(`invalid_definition`, `not_found`, `hardware_insufficient`, `install_refused`,
`uninstall_failed`, e os dois compartilhados de `custom-emulators`).

**Critério de aceite:**

- [x] Com o `zeuxd` no ar, cada rota do índice de `api.md` é chamada uma vez e a
      resposta real é conferida campo a campo contra a tabela documentada.
- [x] As divergências encontradas são corrigidas em `api.md` (começando por
      `schema_version` e pela contagem de consoles).
- [x] As rotas de instalação (`/emulator-sources`, `/emulators/{id}/install`,
      `/installs`, `/installs/{id}`) estão documentadas — o front vai precisar
      delas em B10.
- [x] A data de verificação no cabeçalho de `api.md` é atualizada.

**Depende de:** nada
**Bloqueia:** B6

---

### B1 — Instalar Rust, MSVC Build Tools e WebView2 (M)

A dívida do [ADR 0004](decisoes/0004-adiar-rust-e-tauri.md) vence aqui. São
vários GB e o passo com maior chance de consumir mais tempo que o previsto —
razão para ser o primeiro trabalho de verdade, e não algo espremido no meio.

O [ADR 0003](decisoes/0003-mise-como-toolchain.md) e o D7 já fixaram Go e Node
em versão exata. O Rust entra pela mesma porta, ou a decisão de não entrar fica
escrita.

**Critério de aceite:**

- [ ] Em um PowerShell novo, `rustc --version` e `cargo --version` respondem.
- [ ] `mise.toml` fixa a versão do Rust em número exato (nada de `latest`), ou
      traz um comentário dizendo por que o Rust ficou fora do `mise` — coerente
      com o ADR 0003.
- [ ] A presença do WebView2 Runtime é confirmada pela chave de registro
      `HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`
      (o valor `pv` é a versão instalada), e a versão fica registrada no
      roadmap.
- [ ] `cargo build` de um projeto Rust vazio compila e linka — prova de que as
      MSVC Build Tools estão de fato presentes, não só baixadas.
- [ ] O espaço consumido em disco fica anotado, para não virar surpresa em outra
      máquina.

**Depende de:** B0
**Bloqueia:** B2

---

### B2 — Prova de fogo do ADR 0001: WebView Tauri × `127.0.0.1:7777` (P)

**Este é o item mais importante da sprint** e o motivo de ela existir nesta
ordem. Um app Tauri do template padrão, com um botão, nada de React, nada de
Tailwind, nada de tela — só `fetch` contra o `zeuxd` rodando à parte.

Duas coisas precisam ser observadas, não presumidas:

- **Qual é o `origin` real do WebView.** No Windows o Tauri costuma servir a
  aplicação de `http://tauri.localhost`, e em outros SOs de `tauri://localhost`
  — mas isso muda entre versões, e o plano não pode se apoiar em lembrança. O
  jeito de saber é ler `window.location.origin` no app e o header `Origin` no
  log do `zeuxd --debug`.
- **Se o `POST` com `Content-Type: application/json` passa.** Este é o caso que
  dispara *preflight* `OPTIONS`, e o servidor hoje não responde `OPTIONS` para
  rota nenhuma nem emite `Access-Control-*`. Se falhar, falha aqui — no dia um,
  com um botão na tela.

**Critério de aceite:**

- [ ] Com `zeuxd` rodando à parte, um botão do app mínimo exibe na janela o JSON
      de `GET /api/v1/health` vindo de `http://127.0.0.1:7777`.
- [ ] O mesmo app faz `POST /api/v1/consent` com
      `Content-Type: application/json` e mostra a resposta. Se der erro de CORS,
      a mensagem exata do console do WebView é copiada para o roadmap e abre o
      B3.
- [ ] O `origin` observado fica escrito no plano — o valor lido, não o esperado.
      Registrar os dois: `window.location.origin` e o `Origin` que chegou no
      `zeuxd --debug`.
- [ ] Fica registrado se foi preciso mexer em `tauri.conf.json` (CSP,
      `connect-src`, permissões de rede) ou se `fetch` puro bastou — e, se
      precisou, qual chave exatamente.

**Depende de:** B1
**Bloqueia:** B3, B4

---

### B3 — CORS no servidor, se e somente se B2 mostrar que precisa (P)

Item condicional de propósito. Se o B2 passar sem tocar no Go, este item é
fechado como "não foi necessário" e nada é escrito — o ADR 0001 previa o risco,
e uma camada de middleware que não resolve problema nenhum é peso.

Se precisar, a forma importa: **ecoar a origem do WebView, nunca `*`**. O ADR
0001 já registra que qualquer processo local alcança a porta; CORS não é a
defesa contra isso, e não é motivo para afrouxar de graça.

**Critério de aceite:**

- [ ] `curl -i -X OPTIONS http://127.0.0.1:7777/api/v1/consent -H "Origin: <origin lido no B2>" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"`
      responde `204` com `Access-Control-Allow-Origin` igual à origem enviada.
- [ ] A mesma chamada com `-H "Origin: http://exemplo.invalido"` **não** traz
      `Access-Control-Allow-Origin` na resposta.
- [ ] Existe teste em `internal/api` travando os dois casos acima — hoje o
      pacote está `[no test files]`, então este é o primeiro.
- [ ] O comentário no código diz **por que** a lista é fechada, não o que o
      código faz (convenção do repositório).
- [ ] O ADR 0001 ganha uma nota, ou um ADR novo é escrito, se a decisão de
      origem tiver mudado algo do que estava registrado.

**Depende de:** B2
**Bloqueia:** nada

---

### B4 — Scaffold Tauri + React + Tailwind (M)

Só depois de B2. Montar o projeto completo antes de saber se a comunicação
funciona é construir a casa para descobrir o terreno depois.

**Critério de aceite:**

- [ ] `npm run tauri dev` abre a janela com hot reload funcionando.
- [ ] `npm run tauri build` produz artefato em
      `src-tauri/target/release/bundle/`.
- [ ] Depois desse primeiro build real, o B0 é **reverificado**: nem
      `node_modules/` nem `src-tauri/target/` aparecem no painel de atividade do
      OneDrive.
- [ ] `git status` fica limpo após um `dev` e um `build` — o `.gitignore`
      existente cobre tudo que o scaffold gerou, ou é ajustado.
- [ ] As dependências de front são **React, Tailwind e mais nada**. Sem
      biblioteca de estado, sem biblioteca de componentes, sem cliente HTTP —
      `fetch` é nativo. Qualquer adição além dessas exige justificativa escrita,
      pela mesma regra de "simples e leve" que
      [arquitetura-a-preservar](arquitetura-a-preservar.md) aplica ao Go.

**Depende de:** B2
**Bloqueia:** B5, B6, B7

---

### B5 — `zeuxd` como processo filho do Tauri (M)

O ADR 0001 já anteviu: *"o ciclo de vida do daemon vira responsabilidade do
Tauri"*, e `cmd/zeuxd/main.go` já trata `SIGTERM`/`os.Interrupt` com shutdown
de 5 s justamente para não deixar a porta presa. Falta o outro lado.

O caso feio não é subir — é **a porta já ocupada**. Hoje a porta é fixa em
`7777` e a descoberta dinâmica de porta está no backlog sem sprint. O
comportamento mínimo aceitável não é implementar descoberta de porta; é não
abrir uma tela vazia sem explicação.

**Critério de aceite:**

- [ ] Abrir o app com nenhum `zeuxd` rodando: a primeira tela carrega dados
      reais, e `Get-Process zeuxd` mostra **exatamente um** processo.
- [ ] Fechar a janela: 10 s depois, `Get-Process zeuxd` não devolve nada.
- [ ] Com a porta 7777 ocupada por um `zeuxd` do próprio ZeuX (`GET /health`
      responde `status: ok`), o app **reaproveita** o que já está no ar em vez de
      subir um segundo — verificável porque a contagem de processos continua 1.
- [ ] Com a porta 7777 ocupada por outra coisa qualquer (ocupar com um listener
      trivial antes de abrir o app), o app mostra uma mensagem em português
      explicando o que aconteceu, e não uma tela em branco nem um erro cru de
      `fetch`.
- [ ] Matar o app pelo Gerenciador de Tarefas: ou o `zeuxd` morre junto, ou o
      comportamento (órfão) está documentado no plano **e** a abertura seguinte
      o reaproveita pelo caminho do `/health` acima.

**Depende de:** B4
**Bloqueia:** B8

---

### B6 — Cliente de API tipado no front (M)

Tipos escritos à mão, espelhando `api.md`. Nada de geração automática por
OpenAPI agora: seria uma dependência e um passo de build para 15 rotas estáveis.
Se o número de rotas dobrar, a decisão se reabre.

Três armadilhas do contrato precisam estar travadas no tipo, porque todas as
três já custaram tempo ou estão documentadas como pegadinha:

**Critério de aceite:**

- [ ] Existem tipos para `Report`, `ConsoleVerdict`, `HardwareInfo`, status de
      consentimento, emulador, sessão e erro.
- [ ] Os campos que a API **omite** são opcionais no tipo, não obrigatórios com
      valor falso: `emulator`, `adapter_id`, `preset`, `options` e `core` são
      ausentes quando `level` é `"improvavel"`; `granted_at` é ausente quando
      `granted` é `false`.
- [ ] `ended_at` está marcado no tipo com um comentário dizendo que **sempre
      vem preenchido** (`"0001-01-01T00:00:00Z"` para sessão em andamento) e que
      a fonte de verdade é `is_running`. Nenhum código do front lê `ended_at`
      para decidir se a sessão está aberta — verificável por `grep`.
- [ ] O erro da API é um tipo único `{ code, message }`, e a UI exibe `message`
      **exatamente como veio**, sem reescrever. O `code` é o que a UI usa para
      ramificar. (Item 10 de
      [arquitetura-a-preservar](arquitetura-a-preservar.md).)
- [ ] Um script de verificação (`npm run verificar-api`, ou equivalente) bate
      cada rota do índice de `api.md` contra o daemon no ar e falha se um campo
      esperado sumir. É a única defesa contra o front e o Go divergirem em
      silêncio.

**Depende de:** B4, B-doc
**Bloqueia:** B8

---

### B7 — Layout visual sobre o wireframe (M)

Cor, tipografia, espaçamento e estados sobre a estrutura já decidida. O layout
entra **sobre** o wireframe, não no lugar dele — a estrutura das 7 telas não é
reaberta aqui.

O [ADR 0009](decisoes/0009-desktop-agora-controle-depois.md) fixa três
restrições que precisam estar desenhadas antes do primeiro componente, porque
retrofitar foco em componentes prontos é exatamente a arqueologia que o ADR quer
evitar. E o próprio ADR admite o ponto fraco: *"restrição sem teste automatizado
tende a erodir"*. Enquanto não houver teste, o critério de aceite é a revisão —
mas ela precisa ser concreta o bastante para alguém fazer.

**Critério de aceite:**

- [ ] Existe um estado de **foco visível e desenhado** para todo tipo de
      elemento interativo (botão, link, card, campo, item de lista), e ele é
      distinto do estado de hover.
- [ ] Percorrer qualquer tela só com `Tab` alcança **todas** as ações daquela
      tela, na ordem de leitura. Verificação: listar as ações da tela no
      wireframe e conferir uma a uma.
- [ ] Nenhuma ação existe apenas em hover, e nenhuma apenas em clique direito.
      Se um menu de contexto for desenhado, cada item dele tem outro caminho
      visível.
- [ ] O sistema de tipografia tem escala definida e cabe em janela de 1280×720 —
      o alvo é mesa, não TV; densidade alta é permitida de propósito.
- [ ] Estados de carregamento, vazio e erro estão desenhados para as telas que
      dependem de rede, e não só o estado feliz.

**Depende de:** B4, B-wire
**Bloqueia:** B8

---

### B8 — Fluxo de onboarding: consentimento → scan → parecer (M)

A primeira jornada real. A regra que este item precisa provar é a do
consentimento verificado no servidor: a tela **não** decide nada, ela mostra o
que o servidor diz.

**Critério de aceite:**

- [ ] Com o `consent.json` apagado, o app abre na tela de consentimento e exibe
      o `policy_text` **vindo da API**. Verificação forte: alterar `PolicyText`
      no Go, recompilar o daemon, reabrir o app — o texto na tela muda sem que
      uma linha do front seja tocada.
- [ ] Aceitar dispara `POST /api/v1/hardware/scan`, a tela mostra estado de
      carregamento, e um segundo clique durante o scan não dispara uma segunda
      chamada.
- [ ] Recusar mantém o app utilizável: as telas de emuladores e biblioteca
      continuam acessíveis, e a tela de parecer explica que falta o
      consentimento em vez de sumir do app. (Informar, não bloquear.)
- [ ] Com `PolicyVersion` alterada no Go e recompilada, um `consent.json` que
      dizia "sim" para a versão antiga faz o app **voltar a pedir**
      consentimento — porque `GET /consent` devolve `granted: false`, e o front
      não guarda cópia dessa decisão.
- [ ] O onboarding inteiro, do começo ao fim, é concluído usando **só Tab e
      Enter**, com foco visível em cada parada (ADR 0009).
- [ ] Se o daemon não responder, a tela mostra a falha em português e um botão
      de tentar de novo — nunca fica girando indefinidamente.

**Depende de:** B5, B6, B7
**Bloqueia:** B9

---

### B9 — Tela de parecer: badge por console, gargalos nomeados, aviso de "parcial" (M)

É a tela onde o produto acontece, e a que mais tem chance de trair os princípios
por acidente de redação. Três regras encostam aqui ao mesmo tempo: texto
descritivo, gargalo nomeado, e desconhecido declarado.

O texto certo já vem pronto da API (`headline`, `bottlenecks`, `summary`,
`notes`). A tarefa do front é **exibir**, não reformular — cada frase reescrita
no front é uma chance de introduzir julgamento que o Go recusou a fazer.

**Critério de aceite:**

- [ ] Cada console exibe `headline` e, quando `next_level` existe, os
      `bottlenecks` **como vieram da API**, sem reescrita no front.
- [ ] Com `precision: "parcial"` no relatório ou em um console, a tela exibe o
      aviso de leitura incompleta **e** o campo continua visível marcado como
      desconhecido — nunca escondido, nunca preenchido com zero. Reproduzível
      forçando uma resposta sem `gpus` (o caminho normal quando a detecção
      falha, conforme `api.md`).
- [ ] `level: "improvavel"` não esconde o console: mostra o console e o que
      falta. Não oferece instalação como caminho padrão, mas também não impede.
- [ ] `grep -riE "fraco|ruim|insuficiente|não aguenta|incapaz|limitado" src/`
      não acha nenhuma string aplicada à máquina do usuário. Este grep faz parte
      da revisão do item, não é opcional.
- [ ] Nenhum número aparece sem unidade, e todo requisito mostrado traz o valor
      da máquina ao lado do valor exigido — "este patamar pede 6 GB; a placa X
      tem 2,0 GB", nunca só um dos dois.
- [ ] A tela apresenta o parecer como **estimativa**, não promessa, enquanto o
      D2 (calibração dos limiares) estiver aberto. Os limiares de
      `consoles.json` nunca foram medidos, e a UI não pode aparentar uma
      precisão que o dado não tem.
- [ ] Nenhum ponto desta tela oferece, sugere ou aceita caminho de obtenção de
      ROM. O único caminho de arquivo que a UI conhece é um arquivo que o
      usuário aponta no próprio disco.

**Depende de:** B8
**Bloqueia:** B10

---

### B10 — Instalar com ressalva de hardware (P)

Pequeno porque o servidor já faz o trabalho: `hardwareBlocks` bloqueia,
devolve o motivo e um `override_hint` dizendo para repetir com `?force=true`
(`internal/api/server.go`). O front só precisa não estragar isso.

Este item cobre a linha "**Aviso quando o hardware não comporta, e o usuário
decide**" que está listada na Sprint C. Ela é trazida para cá porque a tela do
wireframe existe, o backend existe, e o custo é de uma tarde — deixá-la na
Sprint C seria esperar por nada.

**Critério de aceite:**

- [ ] Um `POST /api/v1/emulators/{id}/install` bloqueado exibe o motivo que o
      **servidor** mandou, mais um botão explícito de "Instalar mesmo assim" que
      repete a chamada com `?force=true`.
- [ ] O texto do aviso é o `message`/motivo do servidor, não uma frase inventada
      no front — verificável mudando a frase no Go e vendo a tela mudar.
- [ ] Recusar não esconde o emulador da lista nem desabilita a linha.
- [ ] O progresso da instalação é lido de `GET /api/v1/installs/{id}` e mostrado;
      falha de download aparece com a mensagem do servidor.

**Depende de:** B9
**Bloqueia:** nada

---

### B11 — Empacotamento: binário Go dentro do instalador Tauri (M)

O último risco de ambiente, e o que só aparece em máquina limpa.

**Critério de aceite:**

- [ ] `npm run tauri build` compila o `zeuxd` **a partir do fonte do repositório
      no mesmo comando** e embute o binário no pacote. Copiar um `.exe` à mão
      não conta: seria uma versão de daemon divergindo do código em silêncio.
- [ ] O instalador gerado instala e abre o app numa máquina (ou usuário do
      Windows) que **não tem Go, Node nem Rust**, e o onboarding completo roda
      lá.
- [ ] O app não exige elevação de administrador para funcionar.
- [ ] Depois de mexer no empacotamento, o build cruzado continua passando:
      `GOOS=linux` e `GOOS=darwin` compilam `./...`. O empacotamento para
      Windows não pode ter amarrado o daemon a um SO.
- [ ] Desinstalar pelo painel do Windows remove o app e não deixa `zeuxd` no ar.

**Depende de:** B4 (e faz sentido depois de B8, para ter o que testar na máquina
limpa)
**Bloqueia:** nada

---

## Riscos, e como cada um aparece cedo

| Risco | Como ele apareceria tarde | Como este plano o faz aparecer cedo |
|---|---|---|
| **CORS / preflight bloqueia o `fetch` do WebView** — o servidor não tem uma linha de `Access-Control-*` hoje | Onze telas prontas, e o `POST` de consentimento não passa | **B2**, com um botão e nenhuma tela. Custa uma tarde |
| **`origin` do WebView diferente do esperado** | Lista de origens permitidas escrita contra um valor lembrado, que quebra na build de release | **B2** exige o valor **lido**, de duas fontes (`window.location.origin` e o log do `zeuxd --debug`) |
| **MSVC Build Tools falham ou consomem GB e horas** | Descoberto no meio da sprint, empurrando tudo | **B1** é o primeiro trabalho, sozinho, com `cargo build` de projeto vazio como prova de que linka |
| **OneDrive engasga com `node_modules`** | Máquina lenta e sincronização eterna, difícil de atribuir à causa | **B0** antes de qualquer `npm install`, e **reverificado no B4** depois do primeiro build real |
| **`zeuxd` órfão ou porta ocupada** | Usuário abre o app duas vezes e vê tela vazia sem explicação | **B5** tem os quatro casos como critério, incluindo ocupar a porta de propósito antes de abrir |
| **Front e API divergem em silêncio** — `api.md` já está desatualizado em dois campos verificados hoje | Tipo diz uma coisa, servidor manda outra, e o bug aparece num campo raro | **B-doc** limpa o espelho antes, e **B6** exige um script que bate rota por rota |
| **Texto julgador entra pela UI** | O produto trai o próprio princípio na tela mais importante | **B9** tem o `grep` como critério, e a regra de exibir o texto da API sem reformular |
| **ADR 0009 erode** (o próprio ADR admite: restrição sem teste erode) | Ações só em hover espalhadas por dezenas de componentes | **B7** desenha foco antes do primeiro componente; **B8** exige o onboarding completo só com Tab e Enter |
| **Escopo do front cresce** (lib de estado, lib de componentes, gerador de tipos) | Peso permanente, contra "simples e leve" | **B4** fixa React + Tailwind + `fetch` e exige justificativa escrita para qualquer adição |
| **O parecer aparenta precisão que não tem** (D2 nunca foi calibrado) | Usuário confia num número estimado como se fosse medido | **B9** exige que a tela apresente o parecer como estimativa enquanto D2 estiver aberto |

---

## Onde as regras não negociáveis aparecem na UI desta sprint

Não como princípio abstrato — como comportamento verificável, e em qual item:

| Regra | Onde aparece | Item |
|---|---|---|
| Consentimento verificado no servidor | O `policy_text` vem da API; mudar o texto no Go muda a tela sem tocar no front | B8 |
| Consentimento versionado | `PolicyVersion` novo faz o app pedir de novo, porque o front não guarda cópia da decisão | B8 |
| Texto descritivo, nunca julgador | `grep` por adjetivos de valor; números com unidade e com o valor da máquina ao lado do exigido | B9 |
| Nomear o componente que barra | `bottlenecks` exibidos como vieram, junto do `next_level` | B9 |
| Desconhecido é declarado | `precision: "parcial"` mostra aviso **e** mantém o campo visível como desconhecido | B9 |
| Informar, não bloquear | Recusar consentimento não trava o app; `improvavel` não esconde o console; "Instalar mesmo assim" com `?force=true` | B8, B9, B10 |
| Nunca facilitar ROM | Nenhuma tela oferece, sugere ou aceita origem de ROM; o único caminho é arquivo que o usuário aponta no próprio disco | B9 (e vale para a biblioteca, na Sprint D) |
| Mensagem do servidor é a que o usuário lê | Erros exibem `message` sem reescrita; `code` é só para ramificar | B6, B10 |
| ADR 0009 — foco, hover, clique direito | Foco desenhado como estado de primeira classe; onboarding completo só com teclado | B7, B8 |
| Simples e leve | React + Tailwind + `fetch`, e nada além sem justificativa escrita | B4 |

---

## Critério de saída da Sprint B

A sprint termina quando **tudo isto for verdade ao mesmo tempo**:

1. Um instalador gerado por `npm run tauri build` instala o ZeuX numa máquina
   sem Go, sem Node e sem Rust.
2. Nessa máquina, abrir o app pelo atalho leva o usuário do consentimento ao
   parecer por console **sem nenhum passo manual** — o `zeuxd` sobe e desce
   junto com a janela.
3. O parecer na tela mostra `headline`, `bottlenecks` e o aviso de `parcial` com
   o texto que veio da API, e o `grep` por adjetivos de valor não acha nada.
4. O onboarding inteiro é concluído usando só teclado, com foco visível.
5. Fechar a janela não deixa `zeuxd` no ar; abrir com a porta ocupada mostra uma
   mensagem em português.
6. O `ADR 0001` deixa de ser aposta: está escrito no roadmap qual é o `origin`
   real do WebView, se CORS foi necessário e o que exatamente foi feito.
7. O D4 está marcado **Feito** com o caminho escolhido registrado, e nem
   `node_modules/` nem `src-tauri/target/` são sincronizados pelo OneDrive.

O que **não** faz parte do critério de saída, de propósito: biblioteca de jogos,
grid de capas, navbar social e descoberta dinâmica de porta. São Sprint D, E e
backlog sem sprint — se entrarem aqui, a sprint deixa de ter fim.
