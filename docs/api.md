# Referência da API HTTP do ZeuX

O daemon `zeuxd` expõe todas as rotas sob `/api/v1`, em `127.0.0.1:7777` por
padrão.

```bash
mise exec -- go run ./cmd/zeuxd            # sobe o daemon
mise exec -- go run ./cmd/zeuxd --debug    # + log por requisição
mise exec -- go run ./cmd/zeuxd --addr 127.0.0.1:8080
```

Fonte desta referência: `internal/api/server.go` (46 handlers, lidos
integralmente em 2026-09-07). Para o formato exato de campo por campo de uma
rota, o handler é a fonte definitiva — este documento descreve **propósito,
método, parâmetros e os erros esperados**, não reproduz cada struct Go em
JSON (isso desatualiza rápido e o compilador já garante que bate).

---

## Convenções gerais

- Todas as respostas são `application/json; charset=utf-8`.
- **Não há autenticação.** O bind em `127.0.0.1` é a única fronteira.
- **CORS com lista fechada de origens** (`allowedOrigins` em
  `internal/api/server.go`): `tauri://localhost`, `http://tauri.localhost`,
  `https://tauri.localhost` (WebView do Tauri em produção), mais uma origem
  extra via `ZEUX_DEV_ORIGIN` só em desenvolvimento. Origem fora da lista
  nunca recebe `Access-Control-Allow-Origin` — nunca `*`.
- Rotas usam os padrões de método do `http.ServeMux` do Go 1.22+
  (`"GET /api/v1/health"`). Método errado devolve **405**.
- **Erro é sempre `{"code": "...", "message": "..."}`.** `code` é estável, em
  inglês, `snake_case` — para o cliente decidir programaticamente o que
  fazer. `message` é a frase em português, já pronta para mostrar ao
  usuário. A lista completa de códigos usados hoje está na seção 8.
- **Lançar um jogo que falha é 400, não 500** — é quase sempre algo que o
  usuário pode resolver (emulador não instalado, ROM ausente, config
  recusada), não uma falha do servidor.

---

## 1. Saúde e sistema

| Rota | Propósito |
|---|---|
| `GET /health` | Liveness simples. |
| `GET /system/info` | Informação do sistema (SO, e o que mais o `zeuxd` souber sobre o ambiente) para a tela de Configurações. |
| `POST /system/vcredist/install` | Baixa e inicia o instalador oficial do Visual C++ Redistributable (x64) da Microsoft — a ação por trás do botão que aparece quando uma sessão de PS1/PS2 morre com 0xC0000135 (ver `describeExitCode`, `internal/emulator/session.go`). Só em Windows: `400 not_windows` em qualquer outro SO. Não espera o instalador fechar — ele é interativo (UAC, EULA); `200` só confirma que o processo nasceu. **Nunca testado ao vivo contra o instalador real** (`internal/install/vcredist.go`). |

## 2. Consentimento e hardware

| Rota | Propósito |
|---|---|
| `GET /consent` | Estado do consentimento + `policy_text`/`policy_version` — a interface **nunca** deve exibir um texto de política diferente do que esta rota devolve. |
| `POST /consent` | `{"granted": true\|false}`. Concede ou revoga. Revogar também zera o último scan em memória. |
| `POST /hardware/scan` | Roda a detecção de verdade (CPU/RAM sempre; GPU tolerante a falha). Exige consentimento válido — checado **no servidor**, não confia na UI. Sem consentimento: `403 consent_required`. |
| `GET /hardware` | Devolve o último scan guardado em memória (não persiste em disco — é `Server.lastScan`, protegido por mutex). |

## 3. Consoles e veredito

| Rota | Propósito |
|---|---|
| `GET /consoles` | Lista os consoles do catálogo embutido — usada pela tela de Consoles como entrada principal. Cada entrada traz `has_image` (ver rota abaixo). |
| `GET /consoles/{id}/image` | Logo oficial do console, embutida no binário (`cmd/generate-console-images`, gerado uma vez — não é scraping em runtime). `404` quando `has_image` da rota acima é `false`; a interface trata isso como estado normal, nunca chama sem checar `has_image` primeiro. Ver `docs/decisoes.md`, "Identidade visual por console". |
| `GET /consoles/verdicts` | Roda `verdict.Evaluate` sobre o último scan: nível de compatibilidade por console, gargalos nomeados, `precision` (`"completo"` ou `"parcial"`). Sem scan: `400 no_scan_yet`. |

## 4. Emuladores: descoberta, instalação e cadastro manual

| Rota | Propósito |
|---|---|
| `GET /emulators` | `Registry.Survey` — varre todos os adapters, devolve status `installed` por emulador. |
| `GET /emulator-sources` | De onde cada emulador instalável vem (manifesto de fontes, `internal/install/data/sources.json`). |
| `POST /emulators/{id}/install` | Dispara instalação 1-click (assíncrona — devolve um job, ver seção 6). `400 install_refused` se a fonte recusar. |
| `DELETE /emulators/{id}/install` | Desinstala uma instalação gerenciada pelo ZeuX. |
| `POST /emulators/{id}/open` | Abre o emulador sozinho, sem jogo — o escape manual para quem quer configurar algo que o ZeuX ainda não sabe editar. |
| `POST /emulators/{id}/managed-dir` | Cria (se preciso) a pasta gerenciada onde o `findBinary` procura este emulador e devolve `{ "path": "<absoluto>" }`. Passo (b) do trilho de instalação manual: a tela abre essa pasta no explorador para o usuário largar ali o download oficial. Não baixa nem instala nada. `404 not_found` para id desconhecido. |
| `GET /emulators/{id}/save-data` | Onde este adapter guarda memory card e save state nesta máquina, e o que já existe lá (inspeção, não gerência — não apaga nada). `known:false` quando o local não foi verificado ao vivo/lido da config ainda. Hoje: PCSX2 (`memcards`/`sstates` verificado ao vivo) e RetroArch (lê `savefile_directory`/`savestate_directory` do `retroarch.cfg` real — `known:false` quando a chave está ausente ou vale `"default"`, porque aí cada jogo salva num lugar diferente). Ver `emulator.ResolveSaveDataDirs`. `404 not_found` para id desconhecido. |
| `POST /emulators/{id}/save-data` | Escolhe, pelo próprio ZeuX, onde este adapter grava memory card e save state — `{"memory_cards_dir": string, "save_states_dir": string}`. Campo vazio/omitido volta essa chave para o padrão do emulador (RetroArch: `"default"`, salvar ao lado do jogo) — nunca "não mexer". Cria a(s) pasta(s) de destino se não existirem. Só adapters que satisfazem `SaveDataConfigurableAdapter` (hoje só RetroArch): `400 not_save_data_configurable` para o resto. `400 not_installed` se o adapter não estiver instalado. |
| `GET/POST/DELETE /custom-emulators[/{id}]` | Cadastro manual: usuário aponta um binário que o ZeuX não achou sozinho. `POST` valida que o caminho existe e é executável (`emulator.IsExecutableFile`) antes de aceitar — `400 invalid_definition` caso contrário. |
| `GET /retroarch/cores` | Status de cada core conhecido do RetroArch: instalado ou não, caminho. |
| `POST /retroarch/cores/{core}/install` | Baixa um core sob demanda (ADR histórico 0015). `400 core_install_refused` se o core for desconhecido, não tiver download para a plataforma, ou a entrada do manifesto ainda não tiver sido medida (`generated: false`). O SHA256 do manifesto embutido é conferido durante o job: bateu, `checksum_verified: true`; não bateu, o core é instalado mesmo assim (`checksum_verified: false` + `warning` preenchido) — ver `docs/decisoes.md`, "RetroArch: cores baixados sob demanda". |

## 5. Configuração de emulador, bindings e perfil de controle

Estas rotas escrevem no arquivo de configuração do próprio emulador (não em
formato próprio do ZeuX) — o ZeuX lê/edita a config nativa.

| Rota | Propósito |
|---|---|
| `GET/POST/DELETE /emulators/{id}/config` | Lê, grava (com backup automático) e restaura a configuração de um emulador. `DELETE` desfaz para o backup salvo antes da primeira escrita do ZeuX. Emulador sem suporte a isso: `400 not_configurable`. |
| `GET/POST /emulators/{id}/bindings` | Mapeamento de tecla/botão por emulador. `400 not_bindable` para adapter sem suporte. |
| `GET /controllers` | Lista os perfis de controle conhecidos (ex. `xbox`, `dualshock`) — não é lista de hardware conectado fisicamente. |
| `GET/POST /emulators/{id}/controller-profile` | Perfil de controle aplicado a um emulador. `POST` com `profile_id` desconhecido: `400 unknown_controller_profile`. |
| `GET /emulators/{id}/controller-status` | `{"configured": bool}` — diz se este emulador já tem, agora, algum mapeamento de controle físico salvo no seu próprio mecanismo nativo (PCSX2: bind `SDL-` no Pad1; RetroArch: algum `.cfg` em `autoconfig/`). Não escreve nada; usado pela tela guiada "Configurar controle" para confirmar que o passo dentro do próprio emulador funcionou. Adapter sem suporte: `400 controller_check_unsupported`. |

## 6. Instalação: acompanhamento de job

| Rota | Propósito |
|---|---|
| `GET /installs` | Lista jobs de instalação (ativos e recentes). |
| `GET /installs/{id}` | Progresso de um job específico — usado por polling (`src/lib/pollJob.ts`). |
| `DELETE /installs/{id}` | Cancela um job em andamento. `400 cancel_failed` se não puder. |

## 7. Lançar jogo e sessões

| Rota | Propósito |
|---|---|
| `POST /games/preview` | `BuildCommand` **sem** `Launch` — mostra a linha de comando exata que seria usada e o que não coube nela (`unapplied`), sem abrir nada. Se `options` não vier no corpo, o servidor puxa do veredito do console (é aqui que a autoconfiguração acontece de fato — `Server.toInput`). Sem scan ou sem patamar alcançado: segue com `options` no zero-value (nenhuma opção aplicada), nunca recusa — princípio 5, informar não bloquear (2026-09-08: quem recusou o consentimento pode jogar igual, só sem preset autoconfigurado). Console fora do catálogo: `400 unknown_console`. |
| `POST /games/launch` | Mesma resolução do preview, mas executa de verdade. Não bloqueia — devolve a sessão assim que o processo sobe; uma goroutine supervisiona o fim. O processo do emulador roda com `context.Background()`, nunca o contexto da requisição HTTP — precisa sobreviver à resposta. |
| `GET /sessions` | Sessões de jogo, persistidas no SQLite (sobrevivem a reinício do `zeuxd`). Devolve também `playtime_seconds`: mapa `console_id → segundos` somado no servidor (`Launcher.Playtime`, inclui sessões em andamento) — a base do "tempo por console" da tela de Histórico. **`ended_at` sempre aparece no JSON** mesmo numa sessão em andamento (`"0001-01-01T00:00:00Z"` — `omitempty` não funciona em `time.Time`); use o campo `is_running` para saber se ainda está rodando. |

## 8. Biblioteca de jogos

| Rota | Propósito |
|---|---|
| `POST /library/folders` | Aponta uma pasta de ROM para um console; varre na hora. |
| `POST /library/folders/bulk` | Mesmo, para várias pastas de uma vez (seletor nativo de múltiplas pastas). |
| `GET /library/folders` | Lista pastas apontadas. |
| `DELETE /library/folders/{id}` | Remove uma pasta apontada (não apaga arquivo nenhum — é só a referência). |
| `POST /library/folders/{id}/scan` | Revarre uma pasta específica. |
| `GET /library/games` | Lista jogos encontrados. Aceita `?sort=` — valores em **português** de propósito (`recentes`/`titulo`/`tempo_jogado`), exceção deliberada registrada no `CLAUDE.md`: preferência de tela consumida só pela própria UI do ZeuX. Sem `console_id` (modo "todos os jogos"): `?favorite=true` restringe aos favoritos; `?missing=true` (2026-09-08) inverte o filtro de ausência — por padrão um jogo com arquivo não achado na última varredura fica fora da lista, com esse parâmetro aparecem só eles; `?excluded=true` (2026-09-09) inverte o filtro de "Remover da biblioteca" — jogos escondidos ficam fora por padrão, com esse parâmetro aparecem só eles; `?played=true` (2026-09-09) devolve só os jogos já abertos ao menos uma vez (`playtime_seconds > 0`). No modo por console, jogos escondidos também são omitidos. |
| `POST/DELETE /library/games/{id}/favorite` | Marca/desmarca favorito. |
| `PATCH /library/games/{id}/title` | Grava o título editado à mão. Corpo `{ "title": "..." }`; `""` (ou só espaços) limpa o override e volta ao título derivado do nome do arquivo. Resposta: `{ "id", "title" (o de exibição já resolvido), "title_override" }`. O override vence o derivado nas listagens e **sobrevive à varredura** (ela só reescreve o título derivado). `404 not_found` para id inexistente. |
| `POST/DELETE /library/games/{id}/exclude` | Esconde/revela o jogo na biblioteca (2026-09-09). Não toca o arquivo no disco — só a entrada. A flag sobrevive à varredura seguinte; `DELETE` (ou o filtro `?excluded=true` na tela) é o caminho de volta. `404 not_found` para id inexistente. |

`GET /consoles` devolve o catálogo em **ordem alfabética por nome** (2026-09-09). `GET /consoles/verdicts` ordena por prontidão (console mais viável primeiro) de propósito — catálogo não é parecer.

## 9. Capas de jogo (IGDB)

| Rota | Propósito |
|---|---|
| `GET/POST/DELETE /igdb/credentials` | Credencial **do usuário** para o IGDB — nunca uma chave do ZeuX compartilhada (motivo: uma credencial de teste compartilhada já foi suspensa por uso agregado). `POST` com credencial inválida: `400 igdb_credentials_invalid`. |
| `POST /library/games/scrape-covers` | Dispara busca de capa em lote (job assíncrono). Tenta libretro-thumbnails primeiro (sem credencial nenhuma) e só recorre ao IGDB se essa fonte não achar; sem credencial do IGDB configurada, um jogo que também não é achado em libretro-thumbnails fica `not_found` (nunca recusa o disparo por isso). Busca já em andamento: `409 scrape_in_progress`. |
| `GET /scrape-jobs` | Lista as buscas de capa recentes (`{ "jobs": [...] }`), da mais nova para a mais antiga. A tela "Todos os jogos" usa para descobrir um lote automático já em andamento — sem um id de job, não havia como mostrar o progresso de uma busca que a tela não iniciou. |
| `GET /scrape-jobs/{id}` | Progresso do job de busca de capas. |
| `GET /covers/{arquivo}` | Serve o arquivo de capa já baixado, do cache local — nunca proxya uma URL de terceiro direto pro WebView. |

## 10. Erros — todos os `code` em uso hoje

| `code` | Status | Quando |
|---|---|---|
| `consent_required` | 403 | Scan sem consentimento válido. |
| `no_scan_yet` | 400 / 404 | Rota que depende de veredito, sem scan feito na sessão. |
| `unknown_console` | 400 / 500 | `console_id` fora do catálogo. |
| `hardware_insufficient` | — | Não é erro HTTP — é um valor dentro de `Report`, não trava a resposta (informar, nunca bloquear). |
| `binary_not_found`, `not_installed`, `emulator_unavailable` | 400 | Emulador exigido não está no disco. |
| `rom_unavailable` | 400 | ROM referenciada não existe/não é legível. |
| `command_failed`, `launch_failed`, `open_failed` | 400 | Falha ao montar ou rodar o comando do emulador — quase sempre acionável pelo usuário. |
| `not_windows`, `vcredist_install_failed` | 400 | `POST /system/vcredist/install` fora do Windows, ou download/execução do instalador falhou. |
| `save_data_read_failed` | 500 | `GET /emulators/{id}/save-data` não conseguiu ler o diretório de save (permissão, I/O). |
| `not_save_data_configurable`, `save_data_write_failed` | 400/500 | `POST /emulators/{id}/save-data`: adapter sem essa capacidade, ou escrita/criação de pasta falhou. |
| `not_configurable`, `not_bindable`, `controller_check_unsupported` | 400 | Emulador sem suporte a config/bindings/checagem de controle pelo ZeuX. |
| `config_restore_failed`, `config_read_failed`, `config_write_failed` | 400/500 | Config de emulador (leitura, escrita, restauração de backup). |
| `unknown_controller_profile` | 400 | `profile_id` não reconhecido. |
| `install_refused`, `core_install_refused`, `uninstall_failed`, `cancel_failed` | 400 | Fluxo de instalação/desinstalação de emulador ou core. |
| `invalid_definition` | 400 | Cadastro manual de emulador com caminho inválido/não executável. |
| `igdb_credentials_invalid` | 400 | Conectar conta pessoal do IGDB com credencial que a Twitch recusou. |
| `scrape_refused`, `scrape_in_progress` (409) | 400/409 | Busca de capa recusada ou já rodando. |
| `path_not_found`, `missing_fields`, `invalid_id`, `invalid_body` | 400 | Validação de corpo/parâmetro genérica. |
| `not_found` | 404 | Recurso por id inexistente (job, jogo, instalação). |
| `*_read_failed`, `*_write_failed`, `scan_failed`, `app_data_dir_unavailable`, `cover_root_unavailable` | 500 | Falha de I/O local — não é o usuário que causou, é o ambiente (disco cheio, permissão, etc.). |

---

## Roteiro rápido pelo terminal

```powershell
$base = "http://127.0.0.1:7777/api/v1"
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/consent" -Method Post -Body '{"granted":true}' -ContentType "application/json"
Invoke-RestMethod "$base/hardware/scan" -Method Post | ConvertTo-Json -Depth 5
Invoke-RestMethod "$base/consoles/verdicts" | ConvertTo-Json -Depth 6
```
