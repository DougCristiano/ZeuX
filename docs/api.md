# Referência da API HTTP do ZeuX

O daemon `zeuxd` expõe todas as rotas sob `/api/v1`, em `127.0.0.1:7777` por
padrão.

```bash
mise exec -- go run ./cmd/zeuxd            # sobe o daemon
mise exec -- go run ./cmd/zeuxd --debug    # + log por requisição
mise exec -- go run ./cmd/zeuxd --addr 127.0.0.1:8080
```

Fonte desta referência: `internal/api/server.go`, `internal/hardware/types.go`,
`internal/verdict/verdict.go`, `internal/emulator/*.go`, `internal/install/*.go`.
Última verificação contra o código: 2026-08-01 (item B-doc do
[plano da Sprint B](sprint-b-plano.md) — este arquivo estava desatualizado em
`schema_version`, na contagem de consoles e faltavam as rotas de instalação e
de emuladores personalizados; corrigido nesta passada).

---

## Convenções gerais

- Todas as respostas são `application/json; charset=utf-8`.
- **Não há autenticação.** O bind em `127.0.0.1` é a única fronteira.
- **CORS está configurado com lista fechada de origens** (`allowedOrigins` em
  `internal/api/server.go`): `tauri://localhost` e `http://tauri.localhost`,
  as origens do WebView do Tauri em produção. Uma origem fora da lista nunca
  recebe `Access-Control-Allow-Origin` — nunca `*`. Verificado em 2026-08-01
  contra um build de produção real do Tauri (item B2/B3 do
  [plano da Sprint B](sprint-b-plano.md)): sem essa lista, o WebView falha
  tanto no `GET` simples quanto no `POST` com `Content-Type: application/json`
  (que dispara preflight `OPTIONS`).
- As rotas usam os padrões de método do `http.ServeMux` do Go 1.22+
  (`"GET /api/v1/health"`). Chamar uma rota com o método errado devolve **405
  em texto puro**, gerado pelo próprio `ServeMux` — não passa pelo formato de
  erro do ZeuX.
- Rota inexistente devolve **404 em texto puro**, pelo mesmo motivo.

### Formato de erro

Todo erro produzido pelo ZeuX tem esta forma:

```json
{
  "error": {
    "code": "consent_required",
    "message": "O usuário precisa autorizar a leitura do hardware antes do scan."
  }
}
```

`code` é estável e serve para a interface tratar programaticamente. `message`
está em português e já pode ser exibida ao usuário como está.

---

## Índice de rotas

| Método | Rota | Função |
|---|---|---|
| GET | `/api/v1/health` | Daemon no ar + versão do catálogo |
| GET | `/api/v1/consent` | Estado do consentimento + texto da política |
| POST | `/api/v1/consent` | Registra ou revoga o consentimento |
| POST | `/api/v1/hardware/scan` | Executa o scan (exige consentimento) |
| GET | `/api/v1/hardware` | Devolve o último scan da sessão |
| GET | `/api/v1/consoles/verdicts` | Parecer por console |
| GET | `/api/v1/emulators` | Quais emuladores estão instalados |
| GET | `/api/v1/custom-emulators` | Lista os emuladores personalizados do usuário |
| POST | `/api/v1/custom-emulators` | Cria ou substitui um emulador personalizado |
| DELETE | `/api/v1/custom-emulators/{id}` | Remove um emulador personalizado |
| GET | `/api/v1/emulator-sources` | Catálogo de fontes de download conhecidas |
| POST | `/api/v1/emulators/{id}/install` | Dispara a instalação 1-click |
| DELETE | `/api/v1/emulators/{id}/install` | Remove uma instalação gerenciada pelo ZeuX |
| GET | `/api/v1/installs` | Histórico de instalações (jobs) |
| GET | `/api/v1/installs/{id}` | Acompanha uma instalação em andamento |
| POST | `/api/v1/games/preview` | Monta a linha de comando sem executar |
| POST | `/api/v1/games/launch` | Executa o jogo |
| GET | `/api/v1/sessions` | Histórico de sessões + tempo de jogo |

---

## GET /api/v1/health

Verifica se o daemon está no ar e qual catálogo ele carregou.

```bash
curl http://127.0.0.1:7777/api/v1/health
```

**200 OK**

```json
{
  "status": "ok",
  "schema_version": 3,
  "consoles": 33
}
```

| Campo | Tipo | Origem |
|---|---|---|
| `status` | string | Literal `"ok"`. |
| `schema_version` | int | `catalog.SchemaVersion` (`internal/verdict/data/consoles.json`) — hoje `3`. |
| `consoles` | int | Número de consoles no catálogo — hoje `33`. |

Esta rota não tem caminho de erro: se o catálogo não tivesse carregado, o daemon
nem teria subido (`verdict.LoadCatalog` falha em `run()`).

---

## GET /api/v1/consent

Consulta o consentimento e devolve o texto exato da política. A interface **deve
exibir o `policy_text` devolvido aqui**, e não um texto próprio — é assim que
texto exibido e versão registrada nunca saem de sincronia.

```bash
curl http://127.0.0.1:7777/api/v1/consent
```

**200 OK — ainda não respondeu**

```json
{
  "granted": false,
  "policy_version": "1",
  "policy_text": "O ZeuX vai ler as características do seu computador (modelo do processador, núcleos, clock, placa de vídeo e memória) para sugerir quais consoles ele consegue rodar. Esses dados são usados apenas para gerar essas sugestões e como base de comparação entre jogadores. Nada além disso é coletado, e nenhum arquivo pessoal é acessado."
}
```

**200 OK — consentimento válido**

```json
{
  "granted": true,
  "policy_version": "1",
  "policy_text": "O ZeuX vai ler as características do seu computador (...)",
  "granted_at": "2026-08-01T14:32:10Z"
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `granted` | bool | **É `Record.IsValid()`, não `Record.Granted`.** Um "sim" dado para uma versão antiga da política vem como `false`. |
| `policy_version` | string | A versão **atual** da política (`consent.PolicyVersion`), sempre — nunca a que o usuário aceitou. |
| `policy_text` | string | Texto atual da política. |
| `granted_at` | string | RFC 3339, UTC. **Ausente** quando `granted` é `false`. |

**500 `consent_read_failed`** — o arquivo `consent.json` existe mas não pôde ser
lido (permissão, disco). Note que arquivo **corrompido** não cai aqui: JSON
inválido é tratado como ausência de consentimento, errando para o lado de
perguntar de novo.

---

## POST /api/v1/consent

Registra ou revoga o consentimento. Grava em
`os.UserConfigDir()/ZeuX/consent.json` de forma atômica (escreve `.tmp` e
renomeia por cima).

```bash
curl -X POST http://127.0.0.1:7777/api/v1/consent \
  -H "Content-Type: application/json" \
  -d '{"granted":true}'
```

No PowerShell:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:7777/api/v1/consent" -Method Post `
  -Body '{"granted":true}' -ContentType "application/json"
```

**Corpo**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `granted` | bool | Sim — ausente é lido como `false`, ou seja, revogação. |

**200 OK** — mesma forma de `GET /api/v1/consent`.

**Efeito colateral da revogação:** quando `granted` é `false`, o servidor também
descarta o último scan da memória (`s.lastScan = nil`). Manter os dados depois
de o usuário dizer "não" contrariaria o que ele acabou de pedir, mesmo que nada
estivesse persistido.

**Erros**

| Status | `code` | Quando |
|---|---|---|
| 400 | `invalid_body` | O corpo não é JSON decodificável. |
| 500 | `consent_write_failed` | Não foi possível gravar o arquivo. |

---

## POST /api/v1/hardware/scan

Executa a detecção de hardware. **Exige consentimento válido** — a verificação
acontece aqui, no servidor, e não depende da interface. Timeout interno de 30 s.

O resultado fica guardado em memória para as rotas seguintes. **Nada de hardware
é gravado em disco.**

```bash
curl -X POST http://127.0.0.1:7777/api/v1/hardware/scan
```

**200 OK** — o corpo é um `hardware.HardwareInfo`:

```json
{
  "scanned_at": "2026-08-01T14:33:02.918Z",
  "os": {
    "platform": "windows",
    "version": "10.0.26200 Build 26200",
    "arch": "amd64"
  },
  "cpu": {
    "model": "AMD Ryzen 5 5600G with Radeon Graphics",
    "vendor": "AuthenticAMD",
    "physical_cores": 6,
    "logical_cores": 12,
    "base_clock_mhz": 3900
  },
  "gpus": [
    {
      "model": "AMD Radeon(TM) Graphics",
      "vendor": "AMD",
      "vram_bytes": 536870912,
      "integrated": true,
      "driver_version": "31.0.21921.1000",
      "source": "wmi+registry"
    }
  ],
  "memory": {
    "total_bytes": 17045360640,
    "available_bytes": 6871947673
  },
  "warnings": []
}
```

> Os valores acima são ilustrativos do formato. Não são uma leitura real de
> nenhuma máquina.

| Campo | Tipo | Notas |
|---|---|---|
| `scanned_at` | string | RFC 3339, UTC. |
| `os.platform` | string | `"windows"`, `"linux"` ou `"darwin"` (é `runtime.GOOS`). |
| `os.version` | string | Versão do kernel. Fica vazia se não puder ser lida. |
| `cpu.base_clock_mhz` | float | `0` quando o sistema não reporta. Nesse caso os requisitos de clock viram "incerto" e o parecer sai parcial. |
| `gpus` | array | **Pode vir vazio ou `null`.** É o caminho normal quando a detecção falha. |
| `gpus[].vram_bytes` | uint64 | `0` quando não reportado — comum em integradas, onde a memória é compartilhada. |
| `gpus[].integrated` | bool | Heurística por palavra-chave no modelo. |
| `gpus[].source` | string | Como o dado foi obtido: `"wmi+registry"`, `"nvidia-smi"`, `"lspci"`, `"lspci+sysfs"`, `"system_profiler"`. Serve para ponderar confiabilidade. |
| `warnings` | array de string | O que não pôde ser detectado, em linguagem de usuário. Alimenta o aviso de "veredito menos preciso". |

**Erros**

| Status | `code` | Quando |
|---|---|---|
| 403 | `consent_required` | Sem consentimento válido para a política atual. |
| 500 | `consent_read_failed` | Não foi possível ler o registro de consentimento. |
| 500 | `scan_failed` | Falha ao ler **CPU ou memória**. Falha só na GPU não chega aqui — vira `warning`. |

---

## GET /api/v1/hardware

Devolve o último scan guardado em memória. Mesma forma de resposta do
`POST /hardware/scan`.

**404 `no_scan_yet`** — nenhum scan foi executado nesta sessão do daemon.
Reiniciar o daemon zera isso; revogar o consentimento também.

---

## GET /api/v1/consoles/verdicts

O parecer completo: resumo do hardware em prosa + um veredito por console.

```bash
curl http://127.0.0.1:7777/api/v1/consoles/verdicts
```

**200 OK** (recortado — a lista real traz os 13 consoles):

```json
{
  "summary": {
    "cpu": "AMD Ryzen 5 5600G with Radeon Graphics — 6 núcleos físicos e 12 threads — clock base de 3.90 GHz.",
    "gpu": "AMD Radeon(TM) Graphics — gráficos integrados, que compartilham memória com a RAM do sistema.",
    "memory": "15.9 GB de memória RAM instalada, com 6.4 GB livres no momento da leitura.",
    "system": "Windows 10.0.26200 Build 26200 (amd64)."
  },
  "verdicts": [
    {
      "console_id": "psp",
      "name": "PlayStation Portable",
      "short_name": "PSP",
      "year": 2004,
      "level": "bom",
      "headline": "Boa possibilidade de rodar a maioria dos jogos conhecidos deste console.",
      "emulator": "PPSSPP",
      "adapter_id": "ppsspp",
      "preset": "Resolução interna 3x (1080p)",
      "options": {
        "fullscreen": true,
        "internal_scale": 3,
        "exit_on_close": true
      },
      "next_level": "otimo",
      "bottlenecks": [
        "Este patamar pede 2 GB de memória de vídeo; a placa AMD Radeon(TM) Graphics tem 0.5 GB."
      ],
      "precision": "completa"
    },
    {
      "console_id": "ps3",
      "name": "PlayStation 3",
      "short_name": "PS3",
      "year": 2006,
      "level": "improvavel",
      "headline": "Este hardware não alcança o mínimo necessário para rodar este console de forma jogável.",
      "next_level": "limitado",
      "bottlenecks": [
        "Este patamar pede uma placa de vídeo dedicada; esta máquina usa gráficos integrados (AMD Radeon(TM) Graphics)."
      ],
      "precision": "completa"
    }
  ],
  "precision": "completa",
  "notes": []
}
```

### Campos do `Report`

| Campo | Tipo | Notas |
|---|---|---|
| `summary` | objeto | Quatro strings em português descrevendo CPU, GPU, memória e sistema **pelos números, sem adjetivos de valor**. |
| `verdicts` | array | Ordenado: melhores níveis primeiro; empate desempata pelo console mais recente. |
| `precision` | `"completa"` \| `"parcial"` | Do relatório inteiro. É `"parcial"` quando **nenhuma GPU** foi detectada. |
| `notes` | array de string | Cópia de `HardwareInfo.Warnings`. |

### Campos de cada `ConsoleVerdict`

| Campo | Tipo | Notas |
|---|---|---|
| `console_id` | string | Chave usada em `/games/launch` e `/games/preview`. |
| `level` | `"otimo"` \| `"bom"` \| `"limitado"` \| `"improvavel"` | Sem acentos, de propósito — é chave, não texto de UI. |
| `headline` | string | Frase de vitrine correspondente ao `level`, já em português. |
| `emulator` | string | Nome de exibição, pode incluir o core: `"RetroArch (core Mesen)"`. **Ausente quando `level` é `"improvavel"`.** |
| `adapter_id` | string | Identificador que o pacote `emulator` entende: `retroarch`, `duckstation`, `pcsx2`, `dolphin`, `ppsspp`, `flycast`, `rpcs3`, `cemu`. Ausente em `"improvavel"`. |
| `core` | string | Só em tiers do RetroArch. |
| `preset` | string | Descrição legível da configuração. Ausente em `"improvavel"`. |
| `options` | objeto | O mesmo preset em forma aplicável. É o que o `/games/launch` copia quando a requisição não manda `options`. Ausente em `"improvavel"`. |
| `next_level` | string | O patamar imediatamente acima do alcançado. Ausente quando o console já está no melhor patamar. |
| `bottlenecks` | array de string | **O que exatamente barra o `next_level`**, uma frase por requisito não atendido, nomeando o componente. **Ausente** (não `[]`) quando não há gargalo a reportar — `omitempty` no Go remove o campo para uma slice vazia (achado rodando `npm run verificar-api` contra o daemon real, item B6 do [plano da Sprint B](sprint-b-plano.md); esta linha dizia "vazio" antes de ser corrigida). |
| `precision` | `"completa"` \| `"parcial"` | Deste console especificamente. `"parcial"` quando algum requisito não pôde ser verificado. |

**404 `no_scan_yet`** — execute o scan antes.

---

## GET /api/v1/emulators

Varre o disco procurando cada um dos 13 emuladores embutidos, mais os
personalizados que o usuário tiver definido (ver `/custom-emulators` abaixo).
**Não recebe parâmetros.**

```bash
curl http://127.0.0.1:7777/api/v1/emulators
```

**200 OK**

```json
{
  "emulators": [
    {
      "adapter_id": "retroarch",
      "name": "RetroArch",
      "consoles": ["dreamcast", "gba", "megadrive", "n64", "nes", "ps1", "snes"],
      "installed": true,
      "installation": {
        "adapter_id": "retroarch",
        "name": "RetroArch",
        "binary_path": "C:\\Program Files\\retroarch.exe",
        "managed": false
      }
    },
    {
      "adapter_id": "duckstation",
      "name": "DuckStation",
      "consoles": ["ps1"],
      "installed": false
    }
  ]
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `consoles` | array de string | Ordenado alfabeticamente por `Survey`. |
| `installed` | bool | `false` é resposta normal, não erro. |
| `installation` | objeto | **Só presente quando `installed` é `true`.** |
| `installation.managed` | bool | `true` quando o binário veio da pasta gerenciada pelo ZeuX. Hoje sempre `false` na prática: nada instala nessa pasta ainda. |
| `installation.version` | string | **Nunca preenchido hoje.** Nenhum adapter detecta versão. |

A ordem dos itens é a ordem de registro em `NewRegistry`, personalizados
primeiro: retroarch, duckstation, pcsx2, dolphin, ppsspp, flycast, rpcs3, cemu,
melonds, azahar, xemu, vita3k, xenia.

Esta rota não tem caminho de erro — emulador ausente é `installed: false`.

---

## GET /api/v1/custom-emulators

Lista os emuladores que o usuário definiu à mão — para um emulador que o ZeuX
não conhece, ou uma instalação fora do padrão. Definições de usuário sempre têm
precedência sobre um adapter embutido de mesmo `id`.

```bash
curl http://127.0.0.1:7777/api/v1/custom-emulators
```

**200 OK**

```json
{
  "custom_emulators": [
    {
      "id": "meu-emulador",
      "name": "Meu Emulador",
      "consoles": ["nes"],
      "binary_path": "C:\\Emuladores\\meu-emulador.exe",
      "args": ["--rom", "{rom}"],
      "notes": ""
    }
  ],
  "file_path": "C:\\Users\\doufl\\AppData\\Roaming\\ZeuX\\custom-emulators.json",
  "placeholders": {
    "{rom}": "caminho do jogo (obrigatório)",
    "{scale}": "multiplicador de resolução interna do preset",
    "{renderer}": "backend gráfico do preset"
  }
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `custom_emulators` | array | `[]` (nunca `null`) quando não há nenhum definido. |
| `file_path` | string | Caminho do arquivo em disco, para quem preferir editar à mão em vez de usar a API. |
| `placeholders` | objeto | Os três marcadores aceitos em `args`, com o que cada um significa. |

Esta rota não tem caminho de erro.

---

## POST /api/v1/custom-emulators

Cria ou substitui (por `id`) um emulador personalizado.

```bash
curl -X POST http://127.0.0.1:7777/api/v1/custom-emulators \
  -H "Content-Type: application/json" \
  -d '{"id":"meu-emulador","name":"Meu Emulador","consoles":["nes"],"binary_path":"C:\\Emuladores\\meu-emulador.exe","args":["--rom","{rom}"]}'
```

**Corpo**

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `id` | string | Sim | Identificador único; um `POST` com `id` existente substitui a definição. |
| `name` | string | Sim | Nome de exibição. |
| `consoles` | array de string | Sim | IDs de console que este emulador atende. |
| `binary_path` | string | Sim | Caminho do executável no disco do usuário. |
| `args` | array de string | Sim | Template da linha de comando. **Precisa conter `{rom}`** — é onde o ZeuX substitui o caminho do jogo. |
| `notes` | string | Não | Anotação livre do usuário. |

**200 OK** — mesma forma de `GET /custom-emulators`, com a lista já atualizada.

**Erros**

| Status | `code` | Quando |
|---|---|---|
| 400 | `invalid_body` | Corpo não é o JSON esperado (id, name, consoles, binary_path, args). |
| 400 | `invalid_definition` | Falha de validação — o caso mais comum é `args` sem `{rom}`. A mensagem nomeia o problema. |

---

## DELETE /api/v1/custom-emulators/{id}

Remove uma definição personalizada.

```bash
curl -X DELETE http://127.0.0.1:7777/api/v1/custom-emulators/meu-emulador
```

**200 OK** — mesma forma de `GET /custom-emulators`, com a lista já sem o item.

**404 `not_found`** — nenhuma definição com este `id`.

---

## GET /api/v1/emulator-sources

O catálogo de fontes de download conhecidas — de onde vem cada emulador que o
`/install` sabe baixar. Serve para a interface saber, antes de tentar instalar,
se a fonte é automática (`Kind` de download direto) ou manual (o ZeuX não
consegue automatizar, e `Reason` explica por quê).

```bash
curl http://127.0.0.1:7777/api/v1/emulator-sources
```

**200 OK** (recortado)

```json
{
  "sources": [
    {
      "adapter_id": "duckstation",
      "name": "DuckStation",
      "kind": "github_release",
      "repo": "stenzek/duckstation",
      "homepage": "https://github.com/stenzek/duckstation",
      "license": "GPL-3.0"
    },
    {
      "adapter_id": "azahar",
      "name": "Azahar",
      "kind": "manual",
      "homepage": "https://azahar-emu.org/",
      "reason": "Não publica release automatizável no formato que o instalador reconhece hoje."
    }
  ]
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `adapter_id` | string | Mesmo identificador usado em `/emulators/{id}/install`. |
| `kind` | string | Como o pacote é obtido. `"manual"` significa que `/install` recusa esta fonte — `reason` explica o porquê. |
| `reason` | string | **Só presente em fontes manuais.** |

Esta rota não tem caminho de erro.

---

## POST /api/v1/emulators/{id}/install

Dispara a instalação 1-click de um emulador conhecido em
`emulator-sources`. **Não bloqueia**: devolve o `Job` imediatamente
(`202 Accepted`) e a interface acompanha o progresso por
`GET /installs/{id}`.

**A regra de produto está aqui, não na interface:** se nenhum console atendido
por este emulador é viável no hardware do último scan, o servidor recusa com
`409` em vez de instalar às cegas — e devolve o motivo mais um
`override_hint` para repetir com `?force=true`. Basta **um** console viável
para liberar sem ressalva (o Dolphin roda GameCube e Wii; dar conta de um dos
dois já libera). Sem scan feito, nada é bloqueado — não há base para opinar.

```bash
curl -X POST http://127.0.0.1:7777/api/v1/emulators/duckstation/install
```

**202 Accepted**

```json
{
  "id": "i1",
  "adapter_id": "duckstation",
  "name": "DuckStation",
  "phase": "resolvendo",
  "message": "",
  "started_at": "2026-08-01T15:10:00Z",
  "finished_at": null,
  "checksum_verified": false
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `phase` | string | `"resolvendo"` → `"baixando"` → `"verificando"` → `"extraindo"` → `"finalizando"` → `"concluido"` ou `"falhou"`. Em português, de propósito — é o que a interface exibe como está. |
| `downloaded_bytes` / `total_bytes` | int64 | `total_bytes` pode ser `0` (tamanho desconhecido); ver `Percent()` no código, que devolve `-1` nesse caso em vez de dividir por zero. |
| `sha256` | string | Sempre registrado quando o download termina, mesmo que o projeto não publique soma oficial — permite comparar entre máquinas depois do fato. |
| `checksum_verified` | bool | `true` só quando a soma foi conferida contra um valor **publicado pelo projeto**, não apenas calculada localmente. |
| `finished_at` | string ou `null` | `null` enquanto a instalação está em andamento. |

**Erros**

| Status | `code` | Quando |
|---|---|---|
| 409 | `hardware_insufficient` | Nenhum console deste emulador é viável no último scan, e a chamada não trouxe `?force=true`. Corpo traz `error` **e** `override_hint`. |
| 400 | `install_refused` | `adapter_id` desconhecido em `emulator-sources`, fonte `manual`, ou já existe instalação em andamento para este emulador. |

---

## DELETE /api/v1/emulators/{id}/install

Remove uma instalação **gerenciada pelo ZeuX** (feita por `/install`, dentro de
`ManagedRoot()`). Não afeta uma instalação que o usuário já tinha por conta
própria em outro caminho — o ZeuX só desinstala o que ele mesmo instalou.

```bash
curl -X DELETE http://127.0.0.1:7777/api/v1/emulators/duckstation/install
```

**200 OK**

```json
{ "removed": "duckstation" }
```

**400 `uninstall_failed`** — nada gerenciado para remover, ou falha ao apagar
os arquivos. A mensagem original do erro vai em `message`.

---

## GET /api/v1/installs

Histórico de todas as instalações desta execução do daemon (em andamento e
concluídas).

```bash
curl http://127.0.0.1:7777/api/v1/installs
```

**200 OK** — `{ "installs": [ /* Job, mais recente primeiro */ ] }`.

Esta rota não tem caminho de erro.

---

## GET /api/v1/installs/{id}

Acompanha uma instalação específica por `id` — é o que a interface consulta em
intervalo curto para atualizar a barra de progresso.

```bash
curl http://127.0.0.1:7777/api/v1/installs/i1
```

**200 OK** — mesma forma do `Job` devolvido por `POST /install`.

**404 `not_found`** — nenhuma instalação com este `id`.

---

## POST /api/v1/games/preview

Monta a linha de comando **sem executar nada**. Serve para a interface mostrar
exatamente o que será rodado, e para diagnosticar configuração sem abrir jogo
nenhum.

Aceita o mesmo corpo de `/games/launch`, com a mesma autoconfiguração.

```bash
curl -X POST http://127.0.0.1:7777/api/v1/games/preview \
  -H "Content-Type: application/json" \
  -d '{"rom_path":"C:\\Jogos\\jogo.chd","console_id":"ps1"}'
```

**Corpo**

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `rom_path` | string | **Sim** | Caminho no disco do usuário. O ZeuX nunca copia nem transfere esse arquivo. |
| `console_id` | string | **Sim** | Precisa existir no catálogo quando `options` não for enviado. |
| `emulator_id` | string | Não | Força um adapter. Vazio → o ZeuX escolhe (standalone antes do RetroArch). |
| `core` | string | Não | Core do RetroArch. Ignorado por adapters standalone. |
| `options` | objeto | Não | **Ausente aciona a autoconfiguração**: o servidor puxa `options`, `adapter_id` e `core` do veredito do console. Presente é usado como veio. |

**Objeto `options`**

| Campo | Tipo | Notas |
|---|---|---|
| `fullscreen` | bool | |
| `internal_scale` | int | Multiplicador de resolução interna. `0` ou `1` = resolução nativa do console. |
| `renderer` | string | `""` (padrão do emulador), `"vulkan"`, `"opengl"`, `"d3d12"` ou `"software"`. Valores fora dessa lista são aceitos pelo decodificador mas tratados como "não-padrão" pelos adapters. |
| `exit_on_close` | bool | O emulador encerra junto com o jogo, em vez de voltar ao menu dele. |
| `extra` | array de string | Argumentos crus repassados **no fim** da linha de comando. Escape para o que o ZeuX ainda não modela. |

**200 OK**

```json
{
  "emulator": "DuckStation",
  "adapter_id": "duckstation",
  "installation": {
    "adapter_id": "duckstation",
    "name": "DuckStation",
    "binary_path": "C:\\Program Files\\DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe",
    "managed": false
  },
  "command": {
    "argv": [
      "C:\\Program Files\\DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe",
      "-batch",
      "-fullscreen",
      "C:\\Jogos\\jogo.chd"
    ],
    "unapplied": [
      "A resolução interna precisa ser ajustada dentro do DuckStation.",
      "O backend gráfico precisa ser escolhido dentro do DuckStation."
    ]
  }
}
```

`command.unapplied` é a lista das opções do preset que **não cabem na linha de
comando daquele emulador**. O ZeuX não inventa flags: ele deixa de aplicar e
avisa que o ajuste precisa ser feito dentro do emulador. Vem ausente quando tudo
foi aplicado (é o caso do Dolphin).

`command.argv[0]` é sempre o executável.

**Erros**

| Status | `code` | Quando |
|---|---|---|
| 400 | `invalid_body` | Corpo não é JSON decodificável. |
| 400 | `missing_fields` | `rom_path` ou `console_id` vazios. |
| 400 | `no_scan_yet` | `options` não veio e não há scan na sessão. |
| 400 | `unknown_console` | `options` não veio e o `console_id` não está no catálogo. |
| 400 | `emulator_unavailable` | Adapter desconhecido, adapter que não atende o console, ou nenhum emulador para o console encontrado no disco. |
| 400 | `command_failed` | `BuildCommand` recusou. O caso mais comum é core do RetroArch ausente no disco — a mensagem nomeia o core faltante. |

> **Diferença importante em relação ao `/launch`:** o preview **não verifica se o
> arquivo de ROM existe**. `validateROM` só roda no `Launch`. Um preview pode
> devolver 200 para um caminho inexistente.

---

## POST /api/v1/games/launch

Executa o jogo. Mesmo corpo do `/preview`.

A chamada **não bloqueia**: responde assim que o processo do emulador sobe, e
uma goroutine acompanha até o fim. O processo do jogo é deliberadamente
desligado do contexto da requisição HTTP — ele precisa sobreviver muito depois
da resposta.

```bash
curl -X POST http://127.0.0.1:7777/api/v1/games/launch \
  -H "Content-Type: application/json" \
  -d '{"rom_path":"/roms/jogo.rvz","console_id":"gamecube"}'
```

**200 OK** — o corpo é um `emulator.Session`:

```json
{
  "id": "s1",
  "console_id": "gamecube",
  "adapter_id": "dolphin",
  "emulator": "Dolphin",
  "rom_path": "/roms/jogo.rvz",
  "started_at": "2026-08-01T14:40:11.203Z",
  "ended_at": "0001-01-01T00:00:00Z"
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | Sequencial dentro da execução do daemon: `s1`, `s2`, ... Reinicia do zero quando o daemon reinicia. |
| `started_at` | string | RFC 3339, UTC. |
| `ended_at` | string | ⚠️ **Sempre presente.** O `omitempty` da tag não funciona em `time.Time`, então uma sessão em andamento traz `"0001-01-01T00:00:00Z"`. Para saber se está rodando, use `is_running` de `GET /sessions` ou compare com o zero value. |
| `exit_error` | string | Ausente enquanto o jogo roda. Depois, descreve saída anormal. **Código de saída diferente de zero é comum** quando o usuário fecha pela janela — é informativo, não necessariamente falha. |
| `unapplied` | array de string | Mesmo conteúdo de `command.unapplied`, repetido aqui para a interface avisar assim que o jogo abre. |

Note que a resposta do `/launch` é o `Session` cru, **sem** `duration_seconds`
nem `is_running` — esses dois só aparecem em `GET /sessions`.

**Erros**

Os mesmos de `/preview` para decodificação e autoconfiguração
(`invalid_body`, `missing_fields`, `no_scan_yet`, `unknown_console`), mais:

| Status | `code` | Quando |
|---|---|---|
| 400 | `launch_failed` | Tudo o que der errado a partir daí, com a mensagem original no `message`. |

`launch_failed` é deliberadamente um 400 e não um 500: falha de lançamento é
quase sempre algo que o usuário pode resolver. As causas, em ordem de
verificação:

1. ROM inexistente, inacessível, ou o caminho aponta para uma pasta.
2. Emulador desconhecido, que não atende o console, ou não encontrado no disco.
3. `BuildCommand` recusou (core do RetroArch ausente, console não suportado).
4. `cmd.Start()` falhou — binário sem permissão de execução, por exemplo.

---

## GET /api/v1/sessions

Histórico de sessões e tempo de jogo acumulado.

> ⚠️ **Tudo aqui vive em memória e some quando o daemon fecha.** A persistência
> depende do banco de dados, que foi deliberadamente adiado.

```bash
curl http://127.0.0.1:7777/api/v1/sessions
```

**200 OK**

```json
{
  "sessions": [
    {
      "id": "s2",
      "console_id": "ps1",
      "adapter_id": "duckstation",
      "emulator": "DuckStation",
      "rom_path": "C:\\Jogos\\jogo.chd",
      "started_at": "2026-08-01T15:02:00Z",
      "ended_at": "0001-01-01T00:00:00Z",
      "unapplied": [
        "A resolução interna precisa ser ajustada dentro do DuckStation."
      ],
      "duration_seconds": 412,
      "is_running": true
    },
    {
      "id": "s1",
      "console_id": "gamecube",
      "adapter_id": "dolphin",
      "emulator": "Dolphin",
      "rom_path": "/roms/jogo.rvz",
      "started_at": "2026-08-01T14:40:11Z",
      "ended_at": "2026-08-01T14:58:44Z",
      "duration_seconds": 1113,
      "is_running": false
    }
  ],
  "playtime_seconds": {
    "gamecube": 1113,
    "ps1": 412
  }
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `sessions` | array | **Do mais recente para o mais antigo.** |
| `sessions[].duration_seconds` | int | Tempo total se a sessão terminou; **tempo decorrido até agora** se ainda está rodando. Recalculado a cada chamada. |
| `sessions[].is_running` | bool | A forma correta de saber se a sessão está aberta. |
| `playtime_seconds` | objeto | Soma por `console_id`. Inclui sessões em andamento, então **cresce entre duas chamadas**. É a base do "tempo total de jogo" do perfil. |

Esta rota não tem caminho de erro.

---

## Catálogo de códigos de erro

| `code` | Status | Rotas | Significado |
|---|---|---|---|
| `invalid_body` | 400 | POST `/consent`, `/games/*` | JSON malformado. |
| `missing_fields` | 400 | `/games/*` | `rom_path` ou `console_id` vazios. |
| `no_scan_yet` | 404 | GET `/hardware`, `/consoles/verdicts` | Nenhum scan nesta sessão. |
| `no_scan_yet` | **400** | `/games/*` | Autoconfiguração pediu o scan e não achou. Mesmo `code`, status diferente por rota. |
| `unknown_console` | 400 | `/games/*` | `console_id` fora do catálogo (só verificado quando `options` não vem). |
| `consent_required` | 403 | POST `/hardware/scan` | Sem "sim" válido para a política atual. |
| `consent_read_failed` | 500 | GET/POST `/consent`, POST `/hardware/scan` | Erro de I/O lendo `consent.json`. |
| `consent_write_failed` | 500 | POST `/consent` | Erro de I/O gravando `consent.json`. |
| `scan_failed` | 500 | POST `/hardware/scan` | CPU ou memória não puderam ser lidas. |
| `emulator_unavailable` | 400 | POST `/games/preview` | Nenhum emulador utilizável para a requisição. |
| `command_failed` | 400 | POST `/games/preview` | `BuildCommand` recusou (tipicamente core ausente). |
| `launch_failed` | 400 | POST `/games/launch` | Qualquer falha do lançamento; a causa vai no `message`. |
| `invalid_definition` | 400 | POST `/custom-emulators` | Definição inválida (o caso mais comum é `args` sem `{rom}`). |
| `not_found` | 404 | DELETE `/custom-emulators/{id}`, GET `/installs/{id}` | Nenhum registro com este `id`. |
| `hardware_insufficient` | 409 | POST `/emulators/{id}/install` | Nenhum console deste emulador é viável no último scan, e a chamada não trouxe `?force=true`. Corpo traz `override_hint`. |
| `install_refused` | 400 | POST `/emulators/{id}/install` | Fonte desconhecida, fonte manual, ou instalação já em andamento para este emulador. |
| `uninstall_failed` | 400 | DELETE `/emulators/{id}/install` | Nada gerenciado para remover, ou falha ao apagar os arquivos. |

---

## Roteiro de verificação manual

Sequência completa, para exercitar tudo pelo terminal (PowerShell):

```powershell
$base = "http://127.0.0.1:7777/api/v1"

Invoke-RestMethod "$base/health"

# Deve ser recusado com 403 antes do consentimento
try { Invoke-RestMethod "$base/hardware/scan" -Method Post -ErrorAction Stop }
catch { "HTTP $([int]$_.Exception.Response.StatusCode) -> $($_.ErrorDetails.Message)" }

Invoke-RestMethod "$base/consent" -Method Post -Body '{"granted":true}' -ContentType "application/json"
Invoke-RestMethod "$base/hardware/scan" -Method Post | ConvertTo-Json -Depth 5
Invoke-RestMethod "$base/consoles/verdicts" | ConvertTo-Json -Depth 6
Invoke-RestMethod "$base/emulators" | ConvertTo-Json -Depth 5
Invoke-RestMethod "$base/emulator-sources" | ConvertTo-Json -Depth 5
Invoke-RestMethod "$base/sessions"

# Revogar também apaga o scan da memória: a próxima linha deve dar 404
Invoke-RestMethod "$base/consent" -Method Post -Body '{"granted":false}' -ContentType "application/json"
try { Invoke-RestMethod "$base/hardware" -ErrorAction Stop }
catch { "HTTP $([int]$_.Exception.Response.StatusCode) -> $($_.ErrorDetails.Message)" }
```
