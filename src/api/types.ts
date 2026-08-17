// Tipos espelhando docs/api.md. Escritos à mão de propósito — geração
// automática por OpenAPI seria uma dependência e um passo de build a mais
// para 17 rotas estáveis (ver item B6 em docs/sprint-b-plano.md). Se o número
// de rotas dobrar, essa decisão se reabre.
//
// Regra que vale para o arquivo inteiro: um campo que a API **omite** em
// certas respostas é opcional aqui (`campo?:`), nunca obrigatório com um
// valor falso — documentado caso a caso abaixo, porque cada ausência tem uma
// razão de produto, não é acidente de serialização.

export type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

// --- Consentimento ---

export type ConsentStatus = {
  granted: boolean;
  policy_version: string;
  policy_text: string;
  /** Ausente quando `granted` é `false` — nunca uma string vazia. */
  granted_at?: string;
};

// --- Hardware ---

export type OSInfo = {
  platform: "windows" | "linux" | "darwin" | (string & {});
  version: string;
  arch: string;
};

export type CPUInfo = {
  model: string;
  vendor: string;
  physical_cores: number;
  logical_cores: number;
  /** `0` quando o sistema não reporta — os requisitos de clock viram "incerto". */
  base_clock_mhz: number;
};

export type GPUInfo = {
  model: string;
  vendor: string;
  /** `0` quando não reportado — comum em integradas, que compartilham RAM. */
  vram_bytes: number;
  integrated: boolean;
  driver_version?: string;
  source: string;
};

export type MemoryInfo = {
  total_bytes: number;
  available_bytes: number;
};

export type HardwareInfo = {
  scanned_at: string;
  os: OSInfo;
  cpu: CPUInfo;
  /** Pode vir vazio ou `null` — é o caminho normal quando a detecção falha. */
  gpus: GPUInfo[] | null;
  memory: MemoryInfo;
  warnings: string[];
};

// --- Parecer ---

export type Level = "otimo" | "bom" | "limitado" | "improvavel";
export type Precision = "completa" | "parcial";

export type LaunchOptions = {
  fullscreen?: boolean;
  internal_scale?: number;
  renderer?: string;
  exit_on_close?: boolean;
  extra?: string[];
};

export type ConsoleVerdict = {
  console_id: string;
  name: string;
  short_name: string;
  year: number;
  level: Level;
  headline: string;
  // Os cinco campos abaixo ficam ausentes quando level é "improvavel" — não
  // "" nem null. `grep` por leitura direta de string vazia nesses campos
  // esconderia esse contrato.
  emulator?: string;
  adapter_id?: string;
  core?: string;
  preset?: string;
  options?: LaunchOptions;
  /** Ausente quando o console já está no melhor patamar alcançável. */
  next_level?: string;
  /**
   * O que exatamente barra o next_level, nomeando o componente — nunca uma
   * nota opaca. Exibir como veio, sem reescrever (regra de produto: texto
   * descritivo, nunca julgador).
   *
   * Ausente (não `[]`) quando não há gargalo a reportar — `omitempty` no Go
   * remove o campo para uma slice vazia. Achado rodando
   * `npm run verificar-api` contra o daemon real: a `api.md` dizia "vazio",
   * o servidor de fato omite.
   */
  bottlenecks?: string[];
  precision: Precision;
  /**
   * `true` para consoles amplamente conhecidos por exigir BIOS/firmware
   * externo (PS1, PS2, PS3, Saturn, Sega CD, 3DO, Dreamcast, Neo Geo,
   * Arcade, Xbox, Vita) — nunca varia por patamar. Ausente (nunca `false`)
   * nos demais. Usado pela biblioteca (L9) para um aviso genérico, nunca um
   * nome de arquivo.
   */
  requires_external_file?: boolean;
};

export type Report = {
  summary: {
    cpu: string;
    gpu: string;
    memory: string;
    system: string;
  };
  verdicts: ConsoleVerdict[];
  precision: Precision;
  notes: string[];
};

// --- Emuladores ---

export type Installation = {
  adapter_id: string;
  name: string;
  binary_path: string;
  /** Preenchida só para instalação gerenciada pelo ZeuX (`managed: true`) —
   * vem da tag do release baixado, gravada em disco na hora da instalação
   * (Sprint A, docs/roadmap.md). Ausente para instalação que o usuário já
   * tinha: o ZeuX não executa o binário para perguntar a versão a ele, dado
   * desconhecido nunca é um palpite. */
  version?: string;
  managed: boolean;
};

export type EmulatorEntry = {
  adapter_id: string;
  name: string;
  consoles: string[];
  installed: boolean;
  /** Só presente quando `installed` é `true`. */
  installation?: Installation;
  /**
   * Só presente quando alguém já verificou de verdade onde este emulador lê
   * o BIOS/firmware (ver BiosDir em internal/emulator/bios_dir.go) — ausente
   * na maioria dos emuladores de propósito, nunca um palpite por convenção.
   */
  bios_dir?: string;
  /** Só significativo quando `bios_dir` está presente. */
  bios_dir_empty?: boolean;
  /** H1/H2, docs/roadmap.md — diz se GET/POST/DELETE .../config existe de
   * verdade para este emulador (hoje só PCSX2 e RetroArch). */
  configurable: boolean;
  /** H3/H4 — diz se GET/POST .../bindings existe de verdade. */
  bindable: boolean;
};

// --- Configuração persistida do emulador (H1/H2, docs/roadmap.md) ---

export type Renderer = "" | "vulkan" | "opengl" | "d3d12" | "software";

export type EmulatorPersistedConfig = {
  /** Ausente (nunca `false`) quando o ZeuX não conseguiu ler o valor real
   * do arquivo do emulador — nunca um chute. */
  fullscreen?: boolean;
  internal_scale?: number;
  /** Ausente quando o mapeamento para o vocabulário do emulador não foi
   * confirmado (ex.: Renderer do PCSX2, D3D12/Software do RetroArch). */
  renderer?: Renderer;
};

export type EmulatorConfigWriteResult = {
  /** Mensagens em português, já prontas para exibir — mesmo padrão de
   * Command.unapplied. */
  unapplied: string[];
};

// --- Mapeamento de teclado/controle (H3/H4) ---

export type InputBinding = {
  /** Nome da ação na vocabulário do PRÓPRIO emulador — "Cross" no PCSX2 não
   * é necessariamente o mesmo botão físico que "b" no RetroArch. */
  action: string;
  key?: string;
  button?: string;
};

export type EmulatorBindingsResponse = {
  actions: string[];
  bindings: InputBinding[];
};

// --- Cores do RetroArch (GET /api/v1/retroarch/cores) ---

export type RetroArchCoreStatus = {
  name: string;
  filename: string;
  installed: boolean;
  /** Só presente quando `installed` é `true`. */
  path?: string;
};

export type CustomDefinition = {
  id: string;
  name: string;
  consoles: string[];
  binary_path: string;
  /** Precisa conter `{rom}` — validado pelo servidor, não neste tipo. */
  args: string[];
  notes?: string;
};

export type CustomEmulatorsResponse = {
  custom_emulators: CustomDefinition[];
  file_path: string;
  placeholders: Record<string, string>;
};

export type EmulatorSource = {
  adapter_id: string;
  name: string;
  kind: string;
  homepage: string;
  repo?: string;
  license?: string;
  /** Só presente em fontes `"manual"`. */
  reason?: string;
};

// --- Instalação 1-click ---

export type InstallPhase =
  | "resolvendo"
  | "baixando"
  | "verificando"
  | "extraindo"
  | "finalizando"
  | "concluido"
  | "falhou";

export type InstallJob = {
  id: string;
  adapter_id: string;
  name: string;
  phase: InstallPhase;
  message: string;
  version?: string;
  asset_name?: string;
  downloaded_bytes: number;
  /** Pode ser `0` quando o tamanho total é desconhecido — calcule o percentual você mesmo tratando esse caso, a API não devolve um `percent` pronto. */
  total_bytes: number;
  sha256?: string;
  checksum_verified: boolean;
  started_at: string;
  /** `null` enquanto a instalação está em andamento. */
  finished_at: string | null;
  error?: string;
};

// --- Jogos e sessões ---

export type LaunchBody = {
  rom_path: string;
  console_id: string;
  emulator_id?: string;
  core?: string;
  /** Ausente aciona a autoconfiguração a partir do parecer do console. */
  options?: LaunchOptions;
};

export type Command = {
  argv: string[];
  /** Opções do preset que não coube na linha de comando deste emulador. */
  unapplied?: string[];
};

export type PreviewResult = {
  emulator: string;
  adapter_id: string;
  installation: Installation;
  command: Command;
};

export type Session = {
  id: string;
  console_id: string;
  adapter_id: string;
  emulator: string;
  rom_path: string;
  started_at: string;
  /**
   * ⚠️ SEMPRE presente, mesmo com a sessão em andamento — vem como
   * "0001-01-01T00:00:00Z" (o `omitempty` do Go não funciona em time.Time).
   * NUNCA leia este campo para decidir se a sessão está aberta: use
   * `is_running`, que só existe em SessionWithStats (GET /sessions).
   */
  ended_at: string;
  exit_error?: string;
  unapplied?: string[];
};

export type SessionWithStats = Session & {
  duration_seconds: number;
  is_running: boolean;
};

export type SessionsResponse = {
  sessions: SessionWithStats[];
  playtime_seconds: Record<string, number>;
};

export type HealthStatus = {
  status: string;
  schema_version: number;
  consoles: number;
};

// GET /system/info (2026-08-17): onde o ZeuX guarda os dados desta
// instalação, e em que SO — a tela de Configurações usa isso pro botão
// "Abrir pasta de instalação" e para decidir se mostra o atalho de
// desinstalação (só existe de verdade no Windows).
export type SystemInfo = {
  app_data_dir: string;
  os: string;
};

// --- Biblioteca (L5, docs/roadmap.md) ---

export type LibraryFolder = {
  id: number;
  console_id: string;
  path: string;
  added_at: string;
};

/** Uma subpasta reconhecida por POST /library/folders/bulk. */
export type BulkMatchedFolder = {
  console_id: string;
  name: string;
  path: string;
  games_found: number;
};

export type LibraryGame = {
  id: number;
  folder_id: number;
  console_id: string;
  path: string;
  title: string;
  added_at: string;
  /** `true` quando a última varredura não achou mais o arquivo neste caminho —
   * a entrada continua existindo (o tempo de jogo referencia o caminho), só
   * marcada. Nunca some da lista sozinha. */
  missing: boolean;
  /** Marcado por POST/DELETE /library/games/{id}/favorite (G4). Sempre
   * presente, nunca ausente mesmo quando `false` — diferente de `cover_url`,
   * não representa um dado que pode não ter sido resolvido ainda. */
  favorite: boolean;
  /** Soma de todas as sessões deste jogo (L11). `0` quando nunca foi jogado —
   * sempre presente, nunca ausente. */
  playtime_seconds: number;
  /** Ausente (nunca `""`) quando `playtime_seconds` é `0`. GET /library/games
   * já devolve os jogos ordenados por este campo, mais recente primeiro. */
  last_played_at?: string;
  /** Capa já baixada em disco pelo scraper de metadados (G1), servida por
   * GET /covers/... — nunca uma URL de terceiro. Ausente (nunca `""`)
   * quando a capa ainda não foi resolvida ou o IGDB não tem o jogo; a tela
   * cai no placeholder de sigla. */
  cover_url?: string;
};

// --- Scraper de metadados IGDB (G1, docs/roadmap.md) ---

export type IGDBCredentialsStatus = {
  /** Nunca traz o client_secret de volta — só se há conta conectada.
   * Sempre `true` desde 2026-08-17: sem conta pessoal, o ZeuX cai numa
   * credencial de teste embutida (ver `personal`). */
  configured: boolean;
  /** `true` = conta pessoal conectada em Configurações. `false` = usando a
   * credencial de teste compartilhada embutida no ZeuX (cota dividida com
   * quem também não conectou a própria conta). */
  personal: boolean;
};

export type ScrapePhase = "buscando" | "baixando" | "concluido" | "falhou";

export type ScrapeGameResult = {
  game_id: number;
  title: string;
  status: "found" | "not_found" | "error";
  /** Só presente quando status é "error" — a causa daquele jogo específico. */
  message?: string;
};

export type ScrapeJob = {
  id: string;
  phase: ScrapePhase;
  total: number;
  processed: number;
  results: ScrapeGameResult[];
  started_at: string;
  /** `null` enquanto a busca está em andamento. */
  finished_at: string | null;
  /** Só presente quando phase é "falhou" — causa de o job INTEIRO ter
   * abortado (ex.: credencial recusada), nunca de um jogo isolado (isso vai
   * em results[].message). */
  error?: string;
};
