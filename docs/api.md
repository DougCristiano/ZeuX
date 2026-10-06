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
| `GET /consent` | Estado do consentimento + `policy_text`/`policy_version` — a interface **nunca** deve exibir um texto de política diferente do que esta rota devolve. `?lang=en` devolve o `policy_text` em inglês (2026-09-28); sem `lang` ou com outro valor, português. É a mesma política e a mesma versão — só o idioma do texto muda. |
| `POST /consent` | `{"granted": true\|false}`. Concede ou revoga. Revogar também zera o último scan em memória. |
| `POST /hardware/scan` | Roda a detecção de verdade (CPU/RAM sempre; GPU tolerante a falha). Exige consentimento válido — checado **no servidor**, não confia na UI. Sem consentimento: `403 consent_required`. |
| `GET /hardware` | Devolve o último scan guardado em memória (não persiste em disco — é `Server.lastScan`, protegido por mutex). |

## 3. Consoles e veredito

| Rota | Propósito |
|---|---|
| `GET /consoles` | Lista os consoles do catálogo embutido — usada pela tela de Consoles como entrada principal. Cada entrada traz `has_image` (ver rota abaixo). |
| `GET /consoles/{id}/image` | Logo oficial do console, embutida no binário (`cmd/generate-console-images`, gerado uma vez — não é scraping em runtime). `404` quando `has_image` da rota acima é `false`; a interface trata isso como estado normal, nunca chama sem checar `has_image` primeiro. Ver `docs/decisoes.md`, "Identidade visual por console". |
| `POST/DELETE /consoles/{id}/image` | Troca (`{"source_path": "..."}`) ou remove a logo customizada de um console, voltando a servir a embutida (ou a sigla, se não houver nenhuma). `400 unknown_console` para id fora do catálogo. |
| `GET /consoles/verdicts` | Roda `verdict.Evaluate` sobre o último scan: nível de compatibilidade por console, gargalos nomeados, `precision` (`"completo"` ou `"parcial"`). Sem scan: `400 no_scan_yet`. |

## 4. Emuladores: descoberta, instalação e cadastro manual

| Rota | Propósito |
|---|---|
| `GET /emulators` | `Registry.Survey` — varre todos os adapters, devolve status `installed` por emulador. |
| `GET /emulator-sources` | De onde cada emulador instalável vem (manifesto de fontes, `internal/install/data/sources.json`). |
| `POST /emulators/{id}/install` | Dispara instalação 1-click (assíncrona — devolve um job, ver seção 6). `400 install_refused` se a fonte recusar. |
| `DELETE /emulators/{id}/install` | Desinstala uma instalação gerenciada pelo ZeuX. |
| `POST /emulators/{id}/open` | Abre o emulador sozinho, sem jogo — o escape manual para quem quer configurar algo que o ZeuX ainda não sabe editar. |
| `POST /emulators/{id}/firmware` | (2026-09-29) Entrega o arquivo de firmware que o usuário escolheu (`{"path": "..."}`) ao instalador do próprio emulador — hoje só o RPCS3 (`rpcs3 --installfw <arquivo>`, opção lida do código-fonte dele). Responde `200 {"started": true}` assim que o emulador abre; a instalação continua na janela dele. Arquivo inexistente, que não seja `.PUP`, ou emulador sem suporte: `400 firmware_install_failed`. O estado aparece em `GET /emulators` como `firmware_installed` (ausente quando o ZeuX não sabe dizer) e `firmware_installable`. |
| `POST /emulators/{id}/managed-dir` | Cria (se preciso) a pasta gerenciada onde o `findBinary` procura este emulador e devolve `{ "path": "<absoluto>" }`. Passo (b) do trilho de instalação manual: a tela abre essa pasta no explorador para o usuário largar ali o download oficial. Não baixa nem instala nada. `404 not_found` para id desconhecido. |
| `GET /emulators/{id}/save-data` | Onde este adapter guarda memory card e save state nesta máquina, e o que já existe lá (inspeção, não gerência — não apaga nada). `known:false` quando o local não foi verificado ao vivo/lido da config ainda. Hoje: PCSX2 (`memcards`/`sstates` verificado ao vivo) e RetroArch (lê `savefile_directory`/`savestate_directory` do `retroarch.cfg` real — `known:false` quando a chave está ausente ou vale `"default"`, porque aí cada jogo salva num lugar diferente). Ver `emulator.ResolveSaveDataDirs`. `404 not_found` para id desconhecido. |
| `POST /emulators/{id}/save-data` | Escolhe, pelo próprio ZeuX, onde este adapter grava memory card e save state — `{"memory_cards_dir": string, "save_states_dir": string}`. Campo vazio/omitido volta essa chave para o padrão do emulador (RetroArch: `"default"`, salvar ao lado do jogo) — nunca "não mexer". Cria a(s) pasta(s) de destino se não existirem. Só adapters que satisfazem `SaveDataConfigurableAdapter` (hoje só RetroArch): `400 not_save_data_configurable` para o resto. `400 not_installed` se o adapter não estiver instalado. |
| `GET/POST/DELETE /custom-emulators[/{id}]` | Cadastro manual: usuário aponta um binário que o ZeuX não achou sozinho. `POST` valida que o caminho existe e é executável (`emulator.IsExecutableFile`) antes de aceitar — `400 invalid_definition` caso contrário. Aceita `extensions` (lista de extensões sem ponto, minúsculas — mesmo formato de `verdict.Console.Extensions`, mesma validação): opcional, só passa a valer alguma coisa quando algum id de `consoles` está fora do catálogo — é o que `POST /library/folders` consulta pra esse console (ver seção 8). |
| `POST /custom-emulators/extract-package` | `{"archive_path": string}` — extrai um pacote `.zip`/`.7z`/`.tar.gz` baixado (não o executável avulso) para uma pasta nova dentro da raiz gerenciada e devolve `{"extracted_to": string, "candidates": [string]}` com os executáveis achados dentro, para a tela pré-preencher `binary_path` sem o usuário navegar pasta atrás de pasta. `400 package_extract_failed` para formato não reconhecido, pacote corrompido, ou nenhum executável encontrado. |
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
| `POST /emulators/{id}/controller-preset` | (2026-09-29) Grava o mapeamento padrão de controle do ZeuX no jogador 1 do emulador — só para quem `GET /emulators` marca com `controller_support: "preset"` (PCSX2; DuckStation instalado pelo ZeuX; RPCS3 no Windows). PCSX2 e DuckStation recebem controle (`SDL-0/...`) **e** teclado em cada ação, com backup do arquivo antes da primeira escrita; o RPCS3 recebe `Handler: XInput` no `Default.yml` e só quando o arquivo ainda não existe. Responde `200 {"applied": true}`. Emulador desconhecido, não instalado, sem preset ou com configuração que o ZeuX não edita: `400 controller_preset_failed`. `GET /emulators` traz `controller_support` (`auto`/`preset`/`manual`, ausente em emulador personalizado) e, para `preset`, `controller_preset_applied`. |
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
| `GET /emulators/{id}/settings` | Opções do arquivo de configuração (hoje `duckstation` e `pcsx2`): `settings` (id `Seção.Chave`, `kind` bool/choice/int, `default`, `value` quando presente no arquivo), `running`. `available: false` + `message` sem instalação do ZeuX. |
| `PUT /emulators/{id}/settings` | `{"values": {"Seção.Chave": "valor"}}` — valida tudo e mescla só essas chaves. 409 `emulator_running` com o emulador aberto; 400 `emulator_settings_invalid` para opção ou valor fora do catálogo. |
| `POST /games/launch` | Mesma resolução do preview, mas executa de verdade. `"resume": true` abre no estado de retomada da última sessão (DuckStation/PCSX2; 400 `launch_failed` se não houver — o jogo traz `resume_saved_at` em `GET /library/games` quando há). Não bloqueia — devolve a sessão assim que o processo sobe; uma goroutine supervisiona o fim. O processo do emulador roda com `context.Background()`, nunca o contexto da requisição HTTP — precisa sobreviver à resposta. |
| `GET /sessions` | Sessões de jogo, persistidas no SQLite (sobrevivem a reinício do `zeuxd`). Devolve também `playtime_seconds`: mapa `console_id → segundos` somado no servidor (`Launcher.Playtime`, inclui sessões em andamento) — a base do "tempo por console" da tela de Histórico. **`ended_at` sempre aparece no JSON** mesmo numa sessão em andamento (`"0001-01-01T00:00:00Z"` — `omitempty` não funciona em `time.Time`); use o campo `is_running` para saber se ainda está rodando. |

## 8. Biblioteca de jogos

| Rota | Propósito |
|---|---|
| `POST /library/folders` | Aponta uma pasta de ROM para um console; varre na hora. `console_id` não precisa estar no catálogo dos 33 — se algum `custom-emulators` cadastrado declarar `extensions` para esse id, a varredura usa essas extensões (`Server.resolveConsoleExtensions`); sem catálogo e sem `extensions` declarada, `400 unknown_console` com a mensagem dizendo o que falta. |
| `POST /library/folders/bulk` | Mesmo, para várias pastas de uma vez (seletor nativo de múltiplas pastas). Só casa subpasta por nome contra o catálogo — console fora dele não é candidato aqui (ambíguo quando duas `CustomDefinition` declaram o mesmo id; usar `POST /library/folders` direto, um console por vez). |
| `GET /library/folders` | Lista pastas apontadas. |
| `DELETE /library/folders/{id}` | Remove uma pasta apontada (não apaga arquivo nenhum — é só a referência). |
| `GET /library/games/{id}/saves` | Saves de um jogo de PS1 (DuckStation gerenciado) ou PS2 (PCSX2): `saves` (`memory_cards`, `memory_card_shared`, `memory_cards_approximate`, `save_states` com `slot` — `-1` = continuar — e `backup`, `serial`) e `backups`. `known: false` fora disso. |
| `POST /library/games/{id}/saves/backup` | Copia cartões e states do jogo para `AppData/ZeuX/backups/<console>/<id>/<data>`. |
| `POST /library/games/{id}/saves/restore` | `{"backup": "<id>", "include_memory_card": false}` — guarda o atual num backup novo e restaura. 409 com o emulador aberto. |
| `GET /emulators/pcsx2/portable` | Modo portátil do PCSX2: `portable`, `legacy_exists`, `items` (pastas em Documentos com arquivos/bytes). |
| `POST /emulators/pcsx2/portable/migrate` | Copia Documentos\\PCSX2 para a pasta do emulador, confere e liga o modo portátil. Não apaga a origem. 409 com o PCSX2 aberto. |
| `POST /emulators/pcsx2/portable/cleanup` | Apaga Documentos\\PCSX2 — só com o portátil ligado e cada arquivo já no destino. |
| `GET /library/games/{id}/screenshots` | Galeria de prints do jogo (2026-10-06): `screenshots` (`name`, `size_bytes`, `taken_at`, `url`; do mais novo ao mais velho), `folder` (pasta no disco) e `banner_name`. Os arquivos chegam movidos pelo zeuxd ao fim de cada sessão de DuckStation, PCSX2 ou RetroArch. |
| `POST /library/games/{id}/screenshots` | Envio manual (2026-10-06): `{"source_paths": ["..."]}` — imagens que a pessoa tirou por conta própria. O zeuxd **copia** (o original fica onde estava), valida cada arquivo pelos bytes (PNG, JPG, BMP, WebP; até 64 MB) e não sobrescreve nome repetido. Resposta `{ "added": [...], "errors": [{"path", "message"}] }`; se nenhum entrou, `400 invalid_image` com o motivo do primeiro. |
| `DELETE /library/games/{id}/screenshots/{name}` | Apaga um print da galeria (e do disco). Se era o banner, o banner é limpo junto. `400 invalid_screenshot` para nome com caminho; `404 not_found` se já não existe. `204` em sucesso. |
| `POST /library/games/{id}/banner` | `{"name": "<print>"}` escolhe o print que vira fundo do topo da tela do jogo e da faixa "Continue jogando"; `""` limpa. Resposta `{ "banner_url" }`. Jogos passam a trazer `banner_url` em `GET /library/games` e `GET /library/games/{id}` (ausente sem banner, ou se o arquivo sumiu). |
| `GET /library/screenshots/recent` | Os prints mais novos de toda a biblioteca (`?limit=`, padrão 12, máximo 60), cada um com `game_id`, `game_title` e `console_id`. Faixa "Últimos prints" da tela inicial. |
| `GET /screenshots/{console}/{jogo}/{arquivo}` | Serve a imagem da galeria (de `AppData/ZeuX/screenshots`). |
| `POST /library/rescan` | Revarre todas as pastas de uma vez (botão "Revarrer pastas"). Devolve `folders_scanned` e `games_found`. O daemon também faz isto sozinho ao subir e a cada hora. |
| `POST /library/folders/{id}/scan` | Revarre uma pasta específica — mesma resolução de extensão de `POST /library/folders` (catálogo, ou `custom-emulators`). |
| `GET /library/games` | Lista jogos encontrados. Aceita `?sort=` — valores em **português** de propósito (`recentes`/`titulo`/`tempo_jogado`), exceção deliberada registrada no `CLAUDE.md`: preferência de tela consumida só pela própria UI do ZeuX. Sem `console_id` (modo "todos os jogos"): `?favorite=true` restringe aos favoritos; `?missing=true` (2026-09-08) inverte o filtro de ausência — por padrão um jogo com arquivo não achado na última varredura fica fora da lista, com esse parâmetro aparecem só eles; `?excluded=true` (2026-09-09) inverte o filtro de "Remover da biblioteca" — jogos escondidos ficam fora por padrão, com esse parâmetro aparecem só eles, **inclusive os que já estavam com o arquivo ausente** (2026-09-28: sem isso, remover um jogo ausente o tirava de todo filtro); `?played=true` (2026-09-09) devolve só os jogos já abertos ao menos uma vez (`playtime_seconds > 0`). No modo por console, jogos escondidos também são omitidos. |
| `POST/DELETE /library/games/{id}/favorite` | Marca/desmarca favorito. |
| `PATCH /library/games/{id}/title` | Grava o título editado à mão. Corpo `{ "title": "..." }`; `""` (ou só espaços) limpa o override e volta ao título derivado do nome do arquivo. Resposta: `{ "id", "title" (o de exibição já resolvido), "title_override" }`. O override vence o derivado nas listagens e **sobrevive à varredura** (ela só reescreve o título derivado). `404 not_found` para id inexistente. |
| `POST/DELETE /library/games/{id}/exclude` | Esconde/revela o jogo na biblioteca (2026-09-09). Não toca o arquivo no disco — só a entrada. A flag sobrevive à varredura seguinte; `DELETE` (ou o filtro `?excluded=true` na tela) é o caminho de volta. `404 not_found` para id inexistente. |

`GET /consoles` devolve o catálogo em **ordem alfabética por nome** (2026-09-09). `GET /consoles/verdicts` ordena por prontidão (console mais viável primeiro) de propósito — catálogo não é parecer.

## 9. Capas de jogo (IGDB)

| Rota | Propósito |
|---|---|
| `GET/POST/DELETE /igdb/credentials` | Credencial **do usuário** para o IGDB — nunca uma chave do ZeuX compartilhada (motivo: uma credencial de teste compartilhada já foi suspensa por uso agregado). `POST` com credencial inválida: `400 igdb_credentials_invalid`. |
| `POST /library/games/scrape-covers` | Dispara busca de capa **e das informações do jogo** em lote (job assíncrono). Capa: tenta libretro-thumbnails primeiro (sem credencial nenhuma) e só recorre ao IGDB se essa fonte não achar; sem credencial do IGDB configurada, um jogo que também não é achado em libretro-thumbnails fica `not_found` (nunca recusa o disparo por isso). Informações (2026-09-28): com credencial do IGDB, todo jogo que ainda não as teve buscadas é consultado no IGDB — inclusive os que já têm capa —, e ganha `release_year`, `summary` (em inglês), `genres` e `developer` em `GET /library/games`; campo desconhecido fica **ausente**, nunca zerado. `metadata_status` (2026-09-29) diz o estado dessa busca: ausente = nunca buscada, `found`, `not_found` (o IGDB não achou o título; final) ou `error` (a busca falhou; **volta a ser tentada no lote seguinte**). Um lote para de consultar informações depois de 3 falhas seguidas — com a conta suspensa ou sem rede, os jogos restantes ficam para o próximo lote. O título é ajustado só para a busca ("Legend of Zelda, The - Ocarina of Time" → "The Legend of Zelda: Ocarina of Time"). O progresso do job conta só a capa. Busca já em andamento: `409 scrape_in_progress`. |
| `GET /library/games/{id}` | Um jogo só (2026-09-29), com `cover_url` e as informações do IGDB — sem `playtime_seconds` (vem das sessões; `0` aqui seria lido como "nunca jogado"). `404 not_found`. |
| `POST /library/games/{id}/metadata` | Busca **só** ano, resumo, gêneros e desenvolvedora de um jogo no IGDB, sem tocar na capa (2026-09-29) — "Buscar capa de novo" também traz as informações, mas substitui a capa, inclusive uma escolhida à mão. `202` com o job (acompanhe por `GET /scrape-jobs/{id}`; o resultado é o das informações). Sem conta do IGDB: `400 igdb_not_configured`. Busca já em andamento: `409 scrape_in_progress`. |
| `POST /library/games/{id}/cover` | Troca a capa de um jogo por um arquivo local (`{"source_path": "..."}`) — mesma validação de imagem que a logo de console. `404 not_found` para id de jogo inexistente. |
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
| `controller_preset_failed`, `firmware_install_failed` | 400 | Mapeamento padrão de controle ou instalação de firmware recusados — a mensagem diz o que fazer dentro do emulador. |
| `config_restore_failed`, `config_read_failed`, `config_write_failed` | 400/500 | Config de emulador (leitura, escrita, restauração de backup). |
| `unknown_controller_profile` | 400 | `profile_id` não reconhecido. |
| `install_refused`, `core_install_refused`, `uninstall_failed`, `cancel_failed` | 400 | Fluxo de instalação/desinstalação de emulador ou core. |
| `invalid_definition` | 400 | Cadastro manual de emulador com caminho inválido/não executável. |
| `package_extract_failed` | 400 | `POST /custom-emulators/extract-package`: formato não reconhecido, pacote corrompido, ou nenhum executável dentro dele. |
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
