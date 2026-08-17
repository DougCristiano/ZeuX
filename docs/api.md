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
Última verificação contra o código: 2026-08-04 — faltava
`POST /api/v1/emulators/{id}/open` (botão "Configurar" da tela de Emuladores)
e a seção `emulator-sources` documentava `kind: "github_release"`, valor que
não existe no código (é `"github"`); corrigido nesta passada, mais uma seção
nova de rotas planejadas para as Sprints G/H. Verificação anterior: 2026-08-01
(item B-doc do [plano da Sprint B](sprint-b-plano.md) — este arquivo estava
desatualizado em `schema_version`, na contagem de consoles e faltavam as
rotas de instalação e de emuladores personalizados).

---

## Convenções gerais

- Todas as respostas são `application/json; charset=utf-8`.
- **Não há autenticação.** O bind em `127.0.0.1` é a única fronteira.
- **CORS está configurado com lista fechada de origens** (`allowedOrigins` em
  `internal/api/server.go`): `tauri://localhost`, `http://tauri.localhost` e
  `https://tauri.localhost` (origens do WebView do Tauri em produção), mais
  uma origem extra via `ZEUX_DEV_ORIGIN` só em desenvolvimento. Uma origem
  fora da lista nunca
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
| POST | `/api/v1/emulators/{id}/open` | Abre o emulador sozinho, sem ROM (botão "Configurar") |
| GET | `/api/v1/installs` | Histórico de instalações (jobs) |
| GET | `/api/v1/installs/{id}` | Acompanha uma instalação em andamento |
| POST | `/api/v1/games/preview` | Monta a linha de comando sem executar |
| POST | `/api/v1/games/launch` | Executa o jogo |
| GET | `/api/v1/sessions` | Histórico de sessões + tempo de jogo |
| POST | `/api/v1/library/folders` | Aponta uma pasta a um console e varre na hora |
| GET | `/api/v1/library/folders` | Lista as pastas apontadas |
| DELETE | `/api/v1/library/folders/{id}` | Remove a referência à pasta (não apaga arquivo) |
| POST | `/api/v1/library/folders/{id}/scan` | Revarre uma pasta já apontada |
| GET | `/api/v1/library/games` | Lista os jogos achados para um console |
| POST | `/api/v1/library/games/{id}/favorite` | Marca um jogo como favorito |
| DELETE | `/api/v1/library/games/{id}/favorite` | Desmarca um jogo como favorito |
| GET | `/api/v1/igdb/credentials` | Estado da conexão com o IGDB (conectado sim/não) |
| POST | `/api/v1/igdb/credentials` | Conecta a conta do IGDB (client_id/client_secret) |
| DELETE | `/api/v1/igdb/credentials` | Desconecta a conta do IGDB |
| POST | `/api/v1/library/games/scrape-covers` | Dispara a busca de capas (lote ou um jogo) |
| GET | `/api/v1/scrape-jobs/{id}` | Acompanha uma busca de capas em andamento |
| GET | `/api/v1/covers/{caminho}` | Serve uma capa já baixada em disco |

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
  "schema_version": 4,
  "consoles": 33
}
```

| Campo | Tipo | Origem |
|---|---|---|
| `status` | string | Literal `"ok"`. |
| `schema_version` | int | `catalog.SchemaVersion` (`internal/verdict/data/consoles.json`) — hoje `4` (subiu de `3` em 2026-08-03 com o campo `extensions`, usado por `internal/library` na varredura). |
| `consoles` | int | Número de consoles no catálogo — hoje `33`. |

Esta rota não tem caminho de erro: se o catálogo não tivesse carregado, o daemon
nem teria subido (`verdict.LoadCatalog` falha em `run()`).

---

## GET /api/v1/system/info

Devolve onde o ZeuX guarda os dados desta instalação e o sistema operacional
atual. A tela de Configurações usa isso no botão "Abrir pasta de instalação"
e para decidir se mostra o atalho de desinstalação nativo (só existe de
verdade no Windows — ver [ADR 0010](decisoes/0010-estrutura-de-diretorios-por-console.md)
para a estrutura de dentro dessa pasta).

```bash
curl http://127.0.0.1:7777/api/v1/system/info
```

**200 OK**

```json
{
  "app_data_dir": "C:\\Users\\doufl\\AppData\\Roaming\\ZeuX",
  "os": "windows"
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `app_data_dir` | string | `emulator.AppDataDir()` — pasta raiz onde ficam o banco local, consentimento, emuladores personalizados e `ManagedRoot()` (subpasta `emulators/`). |
| `os` | string | `runtime.GOOS` (`"windows"`, `"linux"` ou `"darwin"`). |

**500** `app_data_dir_unavailable` — `os.UserConfigDir()` falhou (ambiente sem
diretório de configuração resolvível).

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

**200 OK** (recortado — a lista real traz os 33 consoles):

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
| `requires_external_file` | bool | `true` quando o console é amplamente conhecido por exigir BIOS/firmware/plugin externo (PS1, PS2, PS3, Saturn, Sega CD, 3DO, Dreamcast, Neo Geo, Arcade, Xbox, Vita). **Não varia por patamar** — vem do catálogo, não da avaliação de hardware. Ausente (nunca `false`) nos demais consoles (item L3, `docs/roadmap.md`). A biblioteca (L9) usa isto para um aviso genérico, nunca um nome de arquivo. |

**404 `no_scan_yet`** — execute o scan antes.

---

## GET /api/v1/emulators

Varre o disco procurando cada um dos 14 emuladores embutidos, mais os
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
| `installation.managed` | bool | `true` quando o binário veio da pasta gerenciada pelo ZeuX (`POST /emulators/{id}/install`), organizada por console desde o [ADR 0010](decisoes/0010-estrutura-de-diretorios-por-console.md). |
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

**Não instala nem copia nada** — só valida e grava a definição. `binary_path`
precisa **já existir e ser executável** no momento do cadastro (I1,
docs/roadmap.md): o ZeuX recusa em vez de deixar um emulador "cadastrado"
que só quebraria na hora de jogar.

**Erros**

| Status | `code` | Quando |
|---|---|---|
| 400 | `invalid_body` | Corpo não é o JSON esperado (id, name, consoles, binary_path, args). |
| 400 | `invalid_definition` | Falha de validação estrutural — o caso mais comum é `args` sem `{rom}`. A mensagem nomeia o problema. |
| 400 | `binary_not_found` | `binary_path` não existe no disco, ou existe mas não é executável (fora do Windows, onde a extensão já basta). A mensagem nomeia o caminho. |

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
      "kind": "github",
      "repo": "stenzek/duckstation",
      "homepage": "https://github.com/stenzek/duckstation",
      "license": "GPL-3.0"
    },
    {
      "adapter_id": "retroarch",
      "name": "RetroArch",
      "kind": "bundled",
      "homepage": "https://www.retroarch.com/?page=platforms",
      "license": "GPL-3.0",
      "reason": "Já vem dentro do instalador do ZeuX (ADR 0012) — não precisa ser baixado."
    },
    {
      "adapter_id": "dolphin",
      "name": "Dolphin",
      "kind": "manual",
      "homepage": "https://dolphin-emu.org/download/",
      "license": "GPL-2.0",
      "reason": "O Dolphin distribui pelo site oficial e não publica os binários como releases do GitHub."
    }
  ]
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `adapter_id` | string | Mesmo identificador usado em `/emulators/{id}/install` e `/emulators/{id}/open`. |
| `name` | string | Nome de exibição. |
| `kind` | string | Como o pacote é obtido: `"github"` (release resolvida pela API do GitHub), `"bundled"` (já vem dentro do instalador do ZeuX — hoje só o RetroArch, [ADR 0012](decisoes/0012-empacotar-retroarch-e-cores.md)) ou `"manual"` (`/install` recusa esta fonte — `reason` explica o porquê). Nota: exemplos antigos desta página chegaram a mostrar `"github_release"` — o valor real gravado em `internal/install/sources.go` é `"github"`. |
| `repo` | string | `owner/repo` no GitHub. Presente nas fontes `"github"`. |
| `homepage` | string | Site do projeto ou da release. |
| `license` | string | Licença declarada pelo projeto, quando conhecida. Nem toda fonte traz este campo. |
| `reason` | string | **Presente em fontes `"manual"`** (por que a automação não é possível) **e em `"bundled"`** (por que não há botão de instalar). Ausente em `"github"`. |

Esta rota não tem caminho de erro.

Hoje o catálogo (`internal/install/data/sources.json`) tem 12 fontes `"github"`,
1 `"bundled"` (RetroArch) e 1 `"manual"` (Dolphin) — a única fonte manual, o que
é o que faz a tela de Emuladores trocar o botão "Instalar" por "Abrir site
oficial" só para o Dolphin (ver [`docs/adapters.md`](adapters.md)).

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

## POST /api/v1/emulators/{id}/open

Abre o executável do emulador **sozinho** — sem ROM, sem `options`, sem passar
por `BuildCommand`. É o que a tela de Emuladores chama no botão "Configurar"
(2026-08-04): por ora, "configurar" significa abrir o próprio emulador para o
usuário mexer na configuração dele diretamente, do jeito que faria sem o ZeuX.
A Sprint H do [roadmap](roadmap.md) pretende ensinar o ZeuX a ler e escrever
essa configuração — até lá, é só isto. Ver `Launcher.LaunchStandalone`
(`internal/emulator/session.go`).

**Não registra sessão.** Abrir para configurar não é uma partida jogada;
contar isso em `playtime_seconds` distorceria o tempo de jogo real.

```bash
curl -X POST http://127.0.0.1:7777/api/v1/emulators/duckstation/open
```

**200 OK**

```json
{ "opened": "duckstation" }
```

**Erros**

| Status | `code` | Quando |
|---|---|---|
| 400 | `open_failed` | `id` desconhecido, emulador não encontrado no disco, ou falha ao iniciar o processo. A mensagem original do erro vai em `message` — mesma convenção de `launch_failed`. |

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
| 400 | `no_preset_available` | `options` não veio, o `console_id` **existe** no catálogo, mas não alcançou nenhum patamar nesta máquina (`level: "improvavel"`). Distinto de `unknown_console`: o catálogo conhece o console, só não recomenda para este hardware. |
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
| `id` | string | `s1`, `s2`, ... — persistido no banco local desde o [ADR 0011](decisoes/0011-sqlite-local-para-biblioteca.md); **não reinicia do zero** quando o daemon reinicia, continua de onde parou. |
| `started_at` | string | RFC 3339, UTC. |
| `ended_at` | string | ⚠️ **Sempre presente.** O `omitempty` da tag não funciona em `time.Time`, então uma sessão em andamento traz `"0001-01-01T00:00:00Z"`. Para saber se está rodando, use `is_running` de `GET /sessions` ou compare com o zero value. |
| `exit_error` | string | Ausente enquanto o jogo roda. Depois, descreve saída anormal. **Código de saída diferente de zero é comum** quando o usuário fecha pela janela — é informativo, não necessariamente falha. |
| `unapplied` | array de string | Mesmo conteúdo de `command.unapplied`, repetido aqui para a interface avisar assim que o jogo abre. |

Note que a resposta do `/launch` é o `Session` cru, **sem** `duration_seconds`
nem `is_running` — esses dois só aparecem em `GET /sessions`.

**Erros**

Os mesmos de `/preview` para decodificação e autoconfiguração
(`invalid_body`, `missing_fields`, `no_scan_yet`, `unknown_console`,
`no_preset_available`), mais:

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

> **Persistido em SQLite local desde 2026-08-02** (ver
> [ADR 0011](decisoes/0011-sqlite-local-para-biblioteca.md)) — o histórico
> sobrevive a um reinício do daemon. `Server.lastScan` (o último scan de
> hardware, usado para autoconfiguração) continua só em memória; é barato de
> refazer e não é o que este aviso cobria.

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

**500 `sessions_read_failed`** — o banco local (`internal/store`) não pôde ser
lido. Ver o catálogo de códigos de erro.

---

## POST /api/v1/library/folders

Aponta uma pasta a um console e varre imediatamente — a resposta já traz
quantos jogos foram achados, sem exigir uma segunda chamada.

> **Regra legal, não negociável (CLAUDE.md):** esta rota só grava um caminho
> que já existe no disco do usuário. Nunca copia, move nem lê o conteúdo dos
> arquivos achados — só extensão e nome, para título e filtro.

```bash
curl -X POST http://127.0.0.1:7777/api/v1/library/folders \
  -H "Content-Type: application/json" \
  -d '{"console_id":"nes","path":"C:\\Jogos\\NES"}'
```

**200 OK**

```json
{
  "folder": {
    "id": 1,
    "console_id": "nes",
    "path": "C:\\Jogos\\NES",
    "added_at": "2026-08-03T20:00:00Z"
  },
  "games_found": 12
}
```

Apontar a mesma pasta para o mesmo console duas vezes devolve a pasta já
existente (mesmo `id`), não uma segunda linha — e revarre na mesma chamada.

**Busca de capas automática (2026-08-17):** se a varredura achou pelo menos
um jogo, o servidor dispara sozinho (em segundo plano, sem atrasar esta
resposta) a mesma busca de capas de `POST /library/games/scrape-covers`, sem
`game_ids` — ou seja, o lote de todo jogo que ainda nunca tentou buscar capa
(`cover_status == ""`), não só os desta pasta. Sem conta do IGDB conectada
(`GET /igdb/credentials`) ou com uma busca já em andamento, o disparo é
silenciosamente ignorado — não é um erro desta rota, e não aparece em
`Erro` abaixo. Acompanhe o progresso pela tela (ou por
`GET /library/games`, olhando `cover_path`/`cover_status` mudarem), não por
esta resposta.

| Erro | Status | Motivo |
|---|---|---|
| `invalid_body` | 400 | JSON malformado. |
| `missing_fields` | 400 | `console_id` ou `path` vazios. |
| `unknown_console` | 400 | `console_id` fora do catálogo. |
| `path_not_found` | 400 | O caminho não existe ou não é uma pasta. Mensagem nomeia o caminho. |
| `library_write_failed` | 500 | Erro de I/O gravando no banco local. |
| `library_scan_failed` | 500 | Erro de I/O varrendo a pasta ou gravando os jogos achados. |

---

## GET /api/v1/library/folders

Lista todas as pastas apontadas, das mais recentes para as mais antigas.

```bash
curl http://127.0.0.1:7777/api/v1/library/folders
```

**200 OK**

```json
{
  "folders": [
    {"id": 1, "console_id": "nes", "path": "C:\\Jogos\\NES", "added_at": "2026-08-03T20:00:00Z"}
  ]
}
```

---

## DELETE /api/v1/library/folders/{id}

Remove a referência à pasta — nunca o arquivo no disco do usuário. Por
`ON DELETE CASCADE` (migração `0002_library.sql`), os jogos que vieram dela
somem junto; os de outras pastas não são afetados.

```bash
curl -X DELETE http://127.0.0.1:7777/api/v1/library/folders/1
```

**200 OK** `{"removed": 1}`

**404 `not_found`** — nenhuma pasta com este `id`.

---

## POST /api/v1/library/folders/{id}/scan

Revarre uma pasta já apontada, sem precisar reenviar `console_id`/`path`. Jogo
novo entra; jogo que sumiu do disco desde a última varredura fica marcado
`missing: true` em vez de desaparecer da lista — ele pode estar num HD externo
desconectado, e o tempo de jogo (D3) referencia o jogo por caminho.

```bash
curl -X POST http://127.0.0.1:7777/api/v1/library/folders/1/scan
```

**200 OK** `{"games_found": 12}` — `games_found` é o total encontrado *nesta*
varredura, não um delta desde a anterior.

Mesmo disparo automático de busca de capas de `POST /library/folders`,
descrito acima, acontece aqui também quando `games_found > 0`.

| Erro | Status | Motivo |
|---|---|---|
| `invalid_id` | 400 | `{id}` não é numérico. |
| `not_found` | 404 | Nenhuma pasta com este `id`. |
| `unknown_console` | 500 | O console desta pasta saiu do catálogo desde que ela foi apontada (dado inconsistente, não erro do usuário). |
| `library_scan_failed` | 500 | Erro de I/O varrendo a pasta ou reconciliando com o banco. |

---

## GET /api/v1/library/games

Lista os jogos achados para um console, **jogado mais recentemente primeiro**
— quem nunca foi jogado vai para o fim, na ordem em que foi achado (item L11,
`docs/roadmap.md`).

> `playtime_seconds` e `last_played_at` vêm de uma junção com `sessions` por
> `rom_path`, feita nesta rota — nem `internal/library` nem o launcher
> conhecem um ao outro (ver `docs/arquitetura-a-preservar.md`). Uma sessão
> cujo `rom_path` não bate com nenhum jogo simplesmente não aparece aqui; ela
> continua existindo normalmente em `GET /sessions`.

```bash
curl "http://127.0.0.1:7777/api/v1/library/games?console_id=nes"
```

**200 OK**

```json
{
  "games": [
    {
      "id": 5,
      "folder_id": 1,
      "console_id": "nes",
      "path": "C:\\Jogos\\NES\\Jogo (USA).nes",
      "title": "Jogo",
      "added_at": "2026-08-03T20:00:00Z",
      "missing": false,
      "favorite": true,
      "playtime_seconds": 412,
      "last_played_at": "2026-08-03T21:10:00Z",
      "cover_url": "/api/v1/covers/nes/jogos/5/cover.jpg"
    },
    {
      "id": 6,
      "folder_id": 1,
      "console_id": "nes",
      "path": "C:\\Jogos\\NES\\Outro Jogo.nes",
      "title": "Outro Jogo",
      "added_at": "2026-08-03T20:00:00Z",
      "missing": false,
      "favorite": false,
      "playtime_seconds": 0
    }
  ]
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `favorite` | bool | Marcado por `POST/DELETE .../favorite` (G4). **Sempre presente**, nunca ausente mesmo quando `false` — diferente de `cover_url`, este campo não representa um dado que pode não ter sido resolvido ainda. |
| `playtime_seconds` | int | Soma de `duration_seconds` de todas as sessões deste `rom_path`. `0` quando nunca foi jogado — sempre presente, nunca omitido. |
| `last_played_at` | string | **Ausente** (não `""`) quando `playtime_seconds` é `0`. |
| `cover_url` | string | Capa já baixada em disco pelo scraper de metadados (G1) e servida por `GET /api/v1/covers/...` — **nunca** uma URL de terceiro (IGDB) renderizada direto. **Ausente** (não `""`) quando a capa ainda não foi resolvida ou o IGDB não tem o jogo; a tela cai no placeholder de sigla. |

### Modo "todos os jogos" (sem `console_id`)

Sem `console_id` na query string, a rota lista o acervo inteiro (todos os
consoles juntos), paginado — é o modo que alimenta a tela "Todos os jogos"
(`AllGamesScreen.tsx`, 2026-08-04). Com `console_id`, a rota volta ao
comportamento descrito acima (lista completa de um console só, sem paginar) —
os dois modos vivem na mesma rota porque a tela por console (`GamesScreen`)
continua usando o formato simples.

```bash
curl "http://127.0.0.1:7777/api/v1/library/games?page=1&page_size=30&q=mario&favorite=true&platform=nes&sort=titulo"
```

| Parâmetro | Tipo | Notas |
|---|---|---|
| `q` | string | Filtra por título, sem diferenciar maiúsculas/minúsculas — no SQL, então acha o jogo em qualquer página, não só na carregada (2026-08-04). |
| `favorite` | `"true"` | Restringe aos jogos favoritados (G4). Qualquer outro valor (incluindo ausente) não filtra. |
| `platform` | string | **M4** (`docs/sprint-m-plano.md`, 2026-08-07) — filtra por `console_id` exato (ex.: `nes`, não o `short_name` "NES"). Aplicado **depois** do campo `consoles` da resposta ser calculado e **antes** da paginação — "página 2 de PS1" é a segunda página só dos jogos de PS1. Nome deliberadamente diferente de `console_id`: esse parâmetro já troca a rota inteira para o outro modo (lista sem paginar) nesta mesma rota, então reusá-lo para filtrar dentro do modo paginado seria ambíguo. |
| `sort` | string | **M3** (`docs/sprint-m-plano.md`, decidido pelo Douglas em 2026-08-07) — `recentes` (padrão: jogado mais recentemente primeiro, nunca jogado por último), `titulo` (alfabético, sem diferenciar maiúsculas/minúsculas) ou `tempo_jogado` (soma de `playtime_seconds`, maior primeiro). Valor ausente ou desconhecido cai no padrão sem erro — preferência de tela, não contrato quebrado. **Em português de propósito**, exceção à convenção de enum em inglês do `CLAUDE.md` (mesmo espírito de `level: "otimo"`, registrada lá). |
| `page` | int | Base 1. Valor inválido ou ausente cai em `1`. |
| `page_size` | int | Padrão `30` (`defaultLibraryPageSize`), teto `100` (`maxLibraryPageSize`). Valor fora da faixa cai no padrão. |

**200 OK**

```json
{
  "games": [ /* mesmo formato de cada jogo acima */ ],
  "total": 47,
  "page": 1,
  "page_size": 30,
  "consoles": ["megadrive", "nes", "ps1"]
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `total` | int | Contagem **depois** de `q`/`favorite`/`platform`, antes de paginar — é sobre isto que a UI calcula o número de páginas. |
| `consoles` | array de string | **M4**: `console_id` de todo jogo presente no resultado que respeita `q`/`favorite` — mas **não** `platform` nem a página atual. Existe para que os chips de filtro da tela não troquem de opção sozinhos ao mudar de página ou ao escolher uma plataforma (o bug que motivou o item: antes, a lista de chips vinha calculada no cliente, só sobre os jogos da página carregada). Ordenado alfabeticamente. |

Não existe erro `400` para "sem `console_id`" — ausência de `console_id`
**é** o modo "todos os jogos", não uma requisição malformada. *(Esta linha
dizia `400 missing_fields — sem console_id na query string` até a auditoria
de 2026-08-07; conferido contra `handleListLibraryGames`, que nunca chama
`writeError` para esse caso — a linha estava errada desde que o modo "todos
os jogos" foi adicionado em 2026-08-04.)*

---

## POST /api/v1/library/games/{id}/favorite

Marca um jogo como favorito (G4). Idempotente — chamar de novo com o jogo já
favoritado continua devolvendo 200.

```bash
curl -X POST http://127.0.0.1:7777/api/v1/library/games/5/favorite
```

**200 OK**

```json
{ "id": 5, "favorite": true }
```

**Erros**

| Status | `code` | Quando |
|---|---|---|
| 400 | `invalid_id` | `{id}` não é numérico. |
| 404 | `not_found` | Nenhum jogo com este `id`. |
| 500 | `library_write_failed` | Erro de I/O gravando no banco local. |

---

## DELETE /api/v1/library/games/{id}/favorite

Desmarca um jogo como favorito. Mesmas regras de erro de `POST
.../favorite` acima.

```bash
curl -X DELETE http://127.0.0.1:7777/api/v1/library/games/5/favorite
```

**200 OK**

```json
{ "id": 5, "favorite": false }
```

---

## GET /api/v1/igdb/credentials

Estado da conexão com o IGDB (G1) — nunca devolve o `client_secret` de volta,
só se há credencial configurada. Mesmo instinto de nunca logar uma senha.

```bash
curl http://127.0.0.1:7777/api/v1/igdb/credentials
```

**200 OK**

```json
{ "configured": false }
```

Esta rota não tem caminho de erro além de falha de leitura do disco
(`igdb_credentials_read_failed`, 500).

---

## POST /api/v1/igdb/credentials

Conecta a conta do IGDB do usuário — `client_id`/`client_secret` obtidos no
painel de desenvolvedor do Twitch (o IGDB usa a mesma autenticação). Guardado
localmente (`~/.config/ZeuX/igdb_credentials.json` no Linux), nunca no
repositório, nunca em variável de ambiente do processo.

**Não valida contra o IGDB na hora** — fica instantânea e funciona offline. A
validação real acontece na primeira busca (`POST
/library/games/scrape-covers`), onde uma credencial errada vira um erro
específico e acionável.

```bash
curl -X POST http://127.0.0.1:7777/api/v1/igdb/credentials \
  -H "Content-Type: application/json" \
  -d '{"client_id":"...","client_secret":"..."}'
```

**200 OK**

```json
{ "configured": true }
```

**Erros**

| Status | `code` | Quando |
|---|---|---|
| 400 | `invalid_body` | JSON malformado. |
| 400 | `igdb_credentials_invalid` | `client_id` ou `client_secret` vazio. |
| 500 | `igdb_credentials_write_failed` | Erro de I/O gravando o arquivo. |

---

## DELETE /api/v1/igdb/credentials

Desconecta a conta — reversível (o usuário só reconecta depois), por isso
sem confirmação especial no servidor.

```bash
curl -X DELETE http://127.0.0.1:7777/api/v1/igdb/credentials
```

**200 OK**

```json
{ "configured": false }
```

---

## POST /api/v1/library/games/scrape-covers

Dispara a busca de capas pelo scraper de metadados do IGDB (G1). **Não
bloqueia**: devolve o `Job` imediatamente (`202 Accepted`) e a interface
acompanha o progresso por `GET /scrape-jobs/{id}` — mesmo desenho de `POST
/emulators/{id}/install`.

Corpo vazio (ou sem `game_id`) dispara o **lote**: todo jogo que ainda não
tentou buscar capa (`cover_path` e `cover_status` ambos vazios). `game_id`
presente busca **um jogo só** — também serve para reconsultar um jogo cuja
capa já foi resolvida (G2), sem apagar o cache dos outros.

Falha de rede num jogo do lote **não derruba o lote inteiro** — aquele jogo
fica com `cover_status: "error"` e a busca segue para o próximo. Só uma
credencial recusada pelo IGDB aborta o job inteiro (nenhum jogo teria
sucesso mesmo).

```bash
curl -X POST http://127.0.0.1:7777/api/v1/library/games/scrape-covers \
  -H "Content-Type: application/json" -d '{}'

# busca de um jogo só
curl -X POST http://127.0.0.1:7777/api/v1/library/games/scrape-covers \
  -H "Content-Type: application/json" -d '{"game_id": 5}'
```

**202 Accepted**

```json
{
  "id": "s1",
  "phase": "buscando",
  "total": 12,
  "processed": 0,
  "results": [],
  "started_at": "2026-08-05T21:00:00Z",
  "finished_at": null
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `phase` | string | `"buscando"` → `"baixando"` → `"concluido"` ou `"falhou"`. |
| `results[].status` | string | `"found"`, `"not_found"` ou `"error"`, por jogo processado. |
| `error` | string | Só presente quando `phase` é `"falhou"` (ex.: credencial recusada) — sempre a causa de o job inteiro ter abortado, nunca de um jogo isolado (isso vai em `results[].message`). |

**Erros**

| Status | `code` | Quando |
|---|---|---|
| 400 | `invalid_body` | JSON malformado. |
| 400 | `igdb_not_configured` | Nenhuma credencial do IGDB conectada — não tenta a rede. |
| 409 | `scrape_in_progress` | Já existe uma busca em andamento. |
| 400 | `scrape_refused` | `game_id` informado não existe. |

---

## GET /api/v1/scrape-jobs/{id}

Acompanha uma busca de capas específica por `id`.

```bash
curl http://127.0.0.1:7777/api/v1/scrape-jobs/s1
```

**200 OK** — mesma forma do `Job` devolvido por `POST
/library/games/scrape-covers`.

**404 `not_found`** — nenhuma busca com este `id`.

---

## GET /api/v1/covers/{caminho}

Serve o arquivo de capa já baixado em disco pelo scraper (G1) — nunca a URL
do IGDB direto. `{caminho}` é o valor de `cover_url` devolvido por `GET
/library/games`, sempre relativo à pasta gerenciada do ZeuX.

```bash
curl http://127.0.0.1:7777/api/v1/covers/nes/jogos/5/cover.jpg -o capa.jpg
```

**200 OK** — a imagem, `Content-Type` conforme o arquivo.

**404** — nenhum arquivo neste caminho (resposta padrão do `http.FileServer`
do Go, sem corpo JSON — esta é a única rota do daemon que devolve um arquivo
em vez de JSON).

---

## Catálogo de códigos de erro

| `code` | Status | Rotas | Significado |
|---|---|---|---|
| `invalid_body` | 400 | POST `/consent`, `/games/*` | JSON malformado. |
| `missing_fields` | 400 | `/games/*` | `rom_path` ou `console_id` vazios. |
| `no_scan_yet` | 404 | GET `/hardware`, `/consoles/verdicts` | Nenhum scan nesta sessão. |
| `no_scan_yet` | **400** | `/games/*` | Autoconfiguração pediu o scan e não achou. Mesmo `code`, status diferente por rota. |
| `unknown_console` | 400 | `/games/*`, POST `/library/folders` | `console_id` fora do catálogo (em `/games/*`, só verificado quando `options` não vem). |
| `unknown_console` | **500** | POST `/library/folders/{id}/scan` | O console da pasta saiu do catálogo depois de apontada — dado inconsistente, não erro do usuário. |
| `no_preset_available` | 400 | `/games/*` | `options` não veio; o console existe no catálogo mas não alcançou nenhum patamar nesta máquina. Nunca confundido com `unknown_console` — achado durante o L7, `docs/roadmap.md`. |
| `consent_required` | 403 | POST `/hardware/scan` | Sem "sim" válido para a política atual. |
| `consent_read_failed` | 500 | GET/POST `/consent`, POST `/hardware/scan` | Erro de I/O lendo `consent.json`. |
| `consent_write_failed` | 500 | POST `/consent` | Erro de I/O gravando `consent.json`. |
| `scan_failed` | 500 | POST `/hardware/scan` | CPU ou memória não puderam ser lidas. |
| `emulator_unavailable` | 400 | POST `/games/preview` | Nenhum emulador utilizável para a requisição. |
| `command_failed` | 400 | POST `/games/preview` | `BuildCommand` recusou (tipicamente core ausente). |
| `launch_failed` | 400 | POST `/games/launch` | Qualquer falha do lançamento; a causa vai no `message`. |
| `sessions_read_failed` | 500 | GET `/sessions` | Erro lendo o banco local (`internal/store`) — histórico ou tempo de jogo. |
| `invalid_definition` | 400 | POST `/custom-emulators` | Definição inválida (o caso mais comum é `args` sem `{rom}`). |
| `binary_not_found` | 400 | POST `/custom-emulators` | `binary_path` não existe ou não é executável — nomeado na mensagem (I1). |
| `hardware_insufficient` | 409 | POST `/emulators/{id}/install` | Nenhum console deste emulador é viável no último scan, e a chamada não trouxe `?force=true`. Corpo traz `override_hint`. |
| `install_refused` | 400 | POST `/emulators/{id}/install` | Fonte desconhecida, fonte manual, ou instalação já em andamento para este emulador. |
| `uninstall_failed` | 400 | DELETE `/emulators/{id}/install` | Nada gerenciado para remover, ou falha ao apagar os arquivos. |
| `open_failed` | 400 | POST `/emulators/{id}/open` | `id` desconhecido, emulador não encontrado no disco, ou falha ao iniciar o processo. |
| `invalid_id` | 400 | DELETE `/library/folders/{id}`, POST `/library/folders/{id}/scan`, POST/DELETE `/library/games/{id}/favorite` | `{id}` não é numérico. |
| `path_not_found` | 400 | POST `/library/folders` | O caminho informado não existe ou não é uma pasta. |
| `library_write_failed` | 500 | POST `/library/folders`, POST/DELETE `/library/games/{id}/favorite` | Erro de I/O gravando no banco local. |
| `library_read_failed` | 500 | GET `/library/folders`, `/library/games`, POST `/library/folders/{id}/scan` | Erro de I/O lendo o banco local. |
| `library_scan_failed` | 500 | POST `/library/folders`, `/library/folders/{id}/scan` | Erro de I/O varrendo a pasta ou gravando os jogos achados. |
| `not_found` | 404 | DELETE `/custom-emulators/{id}`, GET `/installs/{id}`, POST/DELETE `/library/games/{id}/favorite` | Nenhum registro com este `id`. |
| `igdb_credentials_read_failed` | 500 | GET `/igdb/credentials` | Erro de I/O lendo `igdb_credentials.json`. |
| `igdb_credentials_invalid` | 400 | POST `/igdb/credentials` | `client_id` ou `client_secret` vazio. |
| `igdb_credentials_write_failed` | 500 | POST/DELETE `/igdb/credentials` | Erro de I/O gravando/removendo `igdb_credentials.json`. |
| `igdb_not_configured` | 400 | POST `/library/games/scrape-covers` | Nenhuma credencial do IGDB conectada — a rota nem tenta a rede. |
| `scrape_in_progress` | 409 | POST `/library/games/scrape-covers` | Já existe uma busca de capas em andamento. |
| `scrape_refused` | 400 | POST `/library/games/scrape-covers` | `game_id` informado não existe. |

---

## Rotas planejadas (ainda não implementadas)

**Nada nesta seção existe hoje.** É o mapa de rotas que as Sprints G e H do
[roadmap](roadmap.md) — hoje dentro do escopo da v1.0 — vão precisar. Listado
aqui só para quem for implementar já saber onde a rota provavelmente vai morar
e o que ela precisa resolver; formato de request/response, quando ainda não foi
desenhado no roadmap, **não está inventado aqui**. Atualize esta seção (e mova
a rota para o corpo do documento) só quando o código existir de verdade — igual
o L5 já fez para a biblioteca.

| Rota (provável) | Para quê | Item do roadmap |
|---|---|---|
| Configuração de emulador (rota e formato ainda não decididos) | Ler e escrever a configuração persistida de um emulador (resolução interna, renderer, tela cheia) a partir do ZeuX, em vez de só abrir o emulador sozinho (`/emulators/{id}/open`, acima). Depende do H1 definir o modelo antes de a rota existir. | [H1](roadmap.md#h1--modelo-de-configuração-persistente-por-emulador-com-um-piloto-g), [H2](roadmap.md#h2--tela-de-configuração-do-emulador-dentro-do-zeux-m) |
| `GET /api/v1/controllers` | Lista os controles (joystick/gamepad) conectados nesse momento, com nome legível — base do mapeamento de botões pelo ZeuX. | [H3](roadmap.md#h3--detectar-joystick-e-mapear-botões-g) |

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

# Abre o emulador sozinho, sem jogo — só funciona se houver algum instalado
try { Invoke-RestMethod "$base/emulators/duckstation/open" -Method Post -ErrorAction Stop }
catch { "HTTP $([int]$_.Exception.Response.StatusCode) -> $($_.ErrorDetails.Message)" }

Invoke-RestMethod "$base/sessions"

# Biblioteca: aponte uma pasta que exista de verdade na sua máquina
$folder = Invoke-RestMethod "$base/library/folders" -Method Post `
  -Body '{"console_id":"nes","path":"C:\Jogos\NES"}' -ContentType "application/json"
$folder | ConvertTo-Json -Depth 5

Invoke-RestMethod "$base/library/folders" | ConvertTo-Json -Depth 5
Invoke-RestMethod "$base/library/games?console_id=nes" | ConvertTo-Json -Depth 5
Invoke-RestMethod "$base/library/folders/$($folder.folder.id)/scan" -Method Post
Invoke-RestMethod "$base/library/folders/$($folder.folder.id)" -Method Delete

# Revogar também apaga o scan da memória: a próxima linha deve dar 404
Invoke-RestMethod "$base/consent" -Method Post -Body '{"granted":false}' -ContentType "application/json"
try { Invoke-RestMethod "$base/hardware" -ErrorAction Stop }
catch { "HTTP $([int]$_.Exception.Response.StatusCode) -> $($_.ErrorDetails.Message)" }
```
