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
  /** Nunca preenchido hoje — nenhum adapter detecta versão (ver docs/roadmap.md). */
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

// --- Biblioteca (L5, docs/roadmap.md) ---

export type LibraryFolder = {
  id: number;
  console_id: string;
  path: string;
  added_at: string;
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
};
