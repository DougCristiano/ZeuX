// Dados e rotas falsas do modo demo (ver demoMode.ts para como é ativado).
// Nenhum dado aqui é real: hardware, biblioteca, sessão e instalação são
// todos inventados em memória, perdidos ao recarregar a página. "Lançar"
// um jogo não abre processo nenhum — só devolve uma sessão de mentira
// depois de um atraso, pra imitar a resposta assíncrona da API real sem
// executar nada (CLAUDE.md, princípio 6: o ZeuX nunca facilita ROM — aqui
// nem existe arquivo, é tudo texto de amostra).
//
// Fica de propósito no mesmo formato de resposta que docs/api.md descreve,
// pra exercitar as telas reais sem precisar de nenhum código condicional
// nelas — a UI não sabe que está em modo demo, só o `client.ts` sabe.
import { ApiError } from "./apiError";
import type {
  BulkMatchedFolder,
  ConsentStatus,
  CustomDefinition,
  CustomEmulatorsResponse,
  EmulatorBindingsResponse,
  EmulatorConfigWriteResult,
  EmulatorEntry,
  EmulatorPersistedConfig,
  EmulatorSource,
  HardwareInfo,
  HealthStatus,
  IGDBCredentialsStatus,
  InputBinding,
  InstallJob,
  InstallPhase,
  LibraryFolder,
  LibraryGame,
  PreviewResult,
  Report,
  RetroArchCoreStatus,
  ScrapeGameResult,
  ScrapeJob,
  ScrapePhase,
  Session,
  SessionWithStats,
  SessionsResponse,
  SystemInfo,
} from "./types";

function nowISO(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Atraso de rede falso, pequeno e variável — sem isso, todo skeleton/spinner
// da Sprint N (que este workflow existe pra testar) piscaria rápido demais
// pra alguém ver se ficou bom.
function fakeLatency(): Promise<void> {
  return sleep(180 + Math.random() * 220);
}

// --- Consentimento ---

const consent: ConsentStatus = {
  granted: true,
  policy_version: "1-demo",
  policy_text:
    "Modo demonstração: nada nesta página sai daqui. O hardware, a biblioteca e as sessões abaixo são fictícios, gerados só pra mostrar as telas.",
  granted_at: nowISO(),
};

// --- Hardware e parecer ---

const hardware: HardwareInfo = {
  scanned_at: nowISO(),
  os: { platform: "linux", version: "Demo OS 1.0", arch: "amd64" },
  cpu: {
    model: "CPU de demonstração",
    vendor: "Demo",
    physical_cores: 8,
    logical_cores: 16,
    base_clock_mhz: 3600,
  },
  gpus: [
    {
      model: "GPU de demonstração",
      vendor: "Demo",
      vram_bytes: 8 * 1024 ** 3,
      integrated: false,
      source: "demo",
    },
  ],
  memory: { total_bytes: 32 * 1024 ** 3, available_bytes: 20 * 1024 ** 3 },
  warnings: [],
};

// Cobre de propósito os estados que a UI trata de formas diferentes: um
// patamar Ótimo simples, um Bom com BIOS externo, um Limitado com gargalo
// nomeado, e um Improvável com precisão parcial (os 5 campos de emulador
// ficam ausentes, igual o contrato de ConsoleVerdict exige).
const report: Report = {
  summary: {
    cpu: "CPU de demonstração — 8 núcleos / 16 threads a 3.6 GHz",
    gpu: "GPU de demonstração — 8.0 GB de memória de vídeo",
    memory: "32 GB no total, 20 GB disponíveis",
    system: "Demo OS 1.0 (amd64)",
  },
  precision: "completa",
  notes: ["Parecer de demonstração — nenhum hardware real foi lido nesta página."],
  verdicts: [
    {
      console_id: "snes",
      name: "Super Nintendo",
      short_name: "SNES",
      year: 1990,
      level: "otimo",
      headline: "Este patamar roda com folga no hardware de demonstração.",
      emulator: "RetroArch (core Snes9x)",
      adapter_id: "retroarch",
      core: "snes9x",
      preset: "Resolução interna 4x com upscale de textura",
      options: { fullscreen: true, internal_scale: 4, exit_on_close: true },
      precision: "completa",
    },
    {
      console_id: "ps1",
      name: "PlayStation 1",
      short_name: "PS1",
      year: 1994,
      level: "bom",
      headline: "Roda bem na maior parte dos jogos.",
      emulator: "DuckStation",
      adapter_id: "duckstation",
      preset: "Resolução interna 2x",
      options: { fullscreen: true, internal_scale: 2 },
      next_level: "otimo",
      bottlenecks: ["A GPU de demonstração fica abaixo da memória de vídeo que o patamar Ótimo pede."],
      precision: "completa",
      requires_external_file: true,
    },
    {
      console_id: "n64",
      name: "Nintendo 64",
      short_name: "N64",
      year: 1996,
      level: "bom",
      headline: "Roda bem, com poucos ajustes.",
      emulator: "RetroArch (core Mupen64Plus-Next)",
      adapter_id: "retroarch",
      core: "mupen64plus_next",
      preset: "Resolução interna 2x",
      options: { fullscreen: true, internal_scale: 2 },
      precision: "completa",
    },
    {
      console_id: "ps2",
      name: "PlayStation 2",
      short_name: "PS2",
      year: 2000,
      level: "limitado",
      headline: "Este patamar é alcançado, mas o console tem um patamar melhor pela frente.",
      emulator: "PCSX2",
      adapter_id: "pcsx2",
      preset: "Resolução interna nativa, sem upscale",
      options: { fullscreen: true, internal_scale: 1 },
      next_level: "bom",
      bottlenecks: ["O clock da CPU de demonstração fica abaixo do que o próximo patamar pede."],
      precision: "completa",
    },
    {
      console_id: "gamecube",
      name: "Nintendo GameCube",
      short_name: "GameCube",
      year: 2001,
      level: "improvavel",
      headline: "Não foi possível confirmar se este patamar roda — falta um dado de hardware nesta demonstração.",
      precision: "parcial",
    },
  ],
};

// --- Emuladores ---

let emulators: EmulatorEntry[] = [
  {
    adapter_id: "retroarch",
    name: "RetroArch",
    consoles: ["snes", "n64", "nes", "megadrive", "gb", "gbc", "gba"],
    installed: true,
    installation: {
      adapter_id: "retroarch",
      name: "RetroArch",
      binary_path: "/demo/apps/retroarch/retroarch",
      version: "1.19.1",
      managed: true,
    },
    configurable: true,
    bindable: true,
    managed_dir: "/demo/apps/retroarch",
  },
  {
    adapter_id: "duckstation",
    name: "DuckStation",
    consoles: ["ps1"],
    installed: false,
    configurable: false,
    bindable: false,
    managed_dir: "/demo/apps/duckstation",
  },
  {
    adapter_id: "pcsx2",
    name: "PCSX2",
    consoles: ["ps2"],
    installed: true,
    installation: {
      adapter_id: "pcsx2",
      name: "PCSX2",
      binary_path: "/demo/apps/pcsx2/pcsx2-qt",
      version: "2.2.0",
      managed: true,
    },
    configurable: true,
    bindable: false,
    managed_dir: "/demo/apps/pcsx2",
  },
  {
    adapter_id: "dolphin",
    name: "Dolphin",
    consoles: ["gamecube", "wii"],
    installed: true,
    installation: {
      adapter_id: "dolphin",
      name: "Dolphin",
      binary_path: "/demo/apps/dolphin/dolphin-emu",
      managed: false,
    },
    configurable: false,
    bindable: false,
    managed_dir: "/demo/apps/dolphin",
  },
];

const emulatorSources: EmulatorSource[] = [
  {
    adapter_id: "retroarch",
    name: "RetroArch",
    kind: "managed",
    homepage: "https://www.retroarch.com",
    repo: "https://github.com/libretro/RetroArch",
    license: "GPL-3.0",
  },
  {
    adapter_id: "pcsx2",
    name: "PCSX2",
    kind: "managed",
    homepage: "https://pcsx2.net",
    repo: "https://github.com/PCSX2/pcsx2",
    license: "GPL-3.0",
  },
  {
    adapter_id: "duckstation",
    name: "DuckStation",
    kind: "managed",
    homepage: "https://www.duckstation.org",
    repo: "https://github.com/stenzek/duckstation",
    license: "GPL-3.0",
  },
  {
    adapter_id: "dolphin",
    name: "Dolphin",
    kind: "manual",
    homepage: "https://dolphin-emu.org",
    reason: "Instalação gerenciada de mentira neste modo de demonstração.",
  },
];

const retroarchCores: RetroArchCoreStatus[] = [
  { name: "Snes9x", filename: "snes9x_libretro", installed: true, path: "/demo/apps/retroarch/cores/snes9x_libretro.so" },
  {
    name: "Mupen64Plus-Next",
    filename: "mupen64plus_next_libretro",
    installed: true,
    path: "/demo/apps/retroarch/cores/mupen64plus_next_libretro.so",
  },
  { name: "Beetle PSX HW", filename: "mednafen_psx_hw_libretro", installed: false },
];

let customEmulators: CustomDefinition[] = [];
const customEmulatorsFilePath = "/demo/config/custom-emulators.json";
const customEmulatorsPlaceholders: Record<string, string> = { "{rom}": "caminho da ROM" };

const emulatorConfigs = new Map<string, EmulatorPersistedConfig>();
const emulatorBindings = new Map<string, InputBinding[]>();
const BINDABLE_ACTIONS = ["Cima", "Baixo", "Esquerda", "Direita", "A", "B", "X", "Y", "Start", "Select"];

// --- Instalação 1-click (progresso calculado pelo tempo decorrido, não por
// timer — funciona igual não importa o intervalo de polling da tela) ---

const INSTALL_PHASES: InstallPhase[] = ["resolvendo", "baixando", "verificando", "extraindo", "finalizando", "concluido"];
const INSTALL_STEP_MS = 700;

type DemoInstall = { adapterId: string; name: string; startedAt: number };
const installs = new Map<string, DemoInstall>();
let installCounter = 0;

function installPhaseMessage(phase: InstallPhase, name: string): string {
  switch (phase) {
    case "resolvendo":
      return `Resolvendo a versão mais recente de ${name}…`;
    case "baixando":
      return `Baixando ${name}…`;
    case "verificando":
      return "Verificando o checksum…";
    case "extraindo":
      return "Extraindo os arquivos…";
    case "finalizando":
      return "Finalizando a instalação…";
    case "concluido":
      return `${name} instalado.`;
    case "falhou":
      return "A instalação falhou.";
  }
}

function computeInstallJob(id: string, info: DemoInstall): InstallJob {
  const elapsed = Date.now() - info.startedAt;
  const idx = Math.min(Math.floor(elapsed / INSTALL_STEP_MS), INSTALL_PHASES.length - 1);
  const phase = INSTALL_PHASES[idx];
  const totalBytes = 42 * 1024 * 1024;
  const totalMs = INSTALL_STEP_MS * (INSTALL_PHASES.length - 1);
  const downloadedBytes = phase === "concluido" ? totalBytes : Math.round((Math.min(elapsed, totalMs) / totalMs) * totalBytes);

  if (phase === "concluido") {
    // Reflete a instalação concluída na lista de emuladores, pra quem
    // voltar pra tela de Emuladores ver "instalado" de verdade — só
    // acontece uma vez (idempotente: installed já true não regrava).
    const entry = emulators.find((e) => e.adapter_id === info.adapterId);
    if (entry && !entry.installed) {
      entry.installed = true;
      entry.installation = {
        adapter_id: info.adapterId,
        name: info.name,
        binary_path: `/demo/apps/${info.adapterId}/${info.adapterId}`,
        version: "1.0.0-demo",
        managed: true,
      };
    }
  }

  return {
    id,
    adapter_id: info.adapterId,
    name: info.name,
    phase,
    message: installPhaseMessage(phase, info.name),
    version: "1.0.0-demo",
    asset_name: `${info.adapterId}-demo.zip`,
    downloaded_bytes: downloadedBytes,
    total_bytes: totalBytes,
    checksum_verified: phase === "concluido",
    started_at: new Date(info.startedAt).toISOString(),
    finished_at: phase === "concluido" ? new Date(info.startedAt + totalMs).toISOString() : null,
  };
}

// --- Biblioteca ---

let nextFolderId = 3;
let folders: LibraryFolder[] = [
  { id: 1, console_id: "snes", path: "/demo/roms/snes", added_at: nowISO() },
  { id: 2, console_id: "ps1", path: "/demo/roms/ps1", added_at: nowISO() },
];

// Um jogo "missing" (Spyro) de propósito — exercita o aviso de arquivo
// sumido sem precisar apagar nada de disco de verdade.
let games: LibraryGame[] = [
  {
    id: 1,
    folder_id: 1,
    console_id: "snes",
    path: "/demo/roms/snes/chrono-trigger.sfc",
    title: "Chrono Trigger",
    added_at: nowISO(),
    missing: false,
    favorite: true,
    playtime_seconds: 5400,
    last_played_at: nowISO(),
  },
  {
    id: 2,
    folder_id: 1,
    console_id: "snes",
    path: "/demo/roms/snes/super-metroid.sfc",
    title: "Super Metroid",
    added_at: nowISO(),
    missing: false,
    favorite: false,
    playtime_seconds: 0,
  },
  {
    id: 3,
    folder_id: 1,
    console_id: "snes",
    path: "/demo/roms/snes/donkey-kong-country-2.sfc",
    title: "Donkey Kong Country 2",
    added_at: nowISO(),
    missing: false,
    favorite: false,
    playtime_seconds: 1800,
    last_played_at: nowISO(),
  },
  {
    id: 4,
    folder_id: 2,
    console_id: "ps1",
    path: "/demo/roms/ps1/final-fantasy-vii.bin",
    title: "Final Fantasy VII",
    added_at: nowISO(),
    missing: false,
    favorite: true,
    playtime_seconds: 12000,
    last_played_at: nowISO(),
  },
  {
    id: 5,
    folder_id: 2,
    console_id: "ps1",
    path: "/demo/roms/ps1/crash-bandicoot.bin",
    title: "Crash Bandicoot",
    added_at: nowISO(),
    missing: false,
    favorite: false,
    playtime_seconds: 0,
  },
  {
    id: 6,
    folder_id: 2,
    console_id: "ps1",
    path: "/demo/roms/ps1/spyro-the-dragon.bin",
    title: "Spyro the Dragon",
    added_at: nowISO(),
    missing: true,
    favorite: false,
    playtime_seconds: 600,
    last_played_at: nowISO(),
  },
];

function sortGames(list: LibraryGame[], sort?: string | null): LibraryGame[] {
  const arr = [...list];
  if (sort === "titulo") arr.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  else if (sort === "tempo_jogado") arr.sort((a, b) => b.playtime_seconds - a.playtime_seconds);
  else arr.sort((a, b) => (b.last_played_at ? Date.parse(b.last_played_at) : 0) - (a.last_played_at ? Date.parse(a.last_played_at) : 0));
  return arr;
}

// --- Scraper de capas (simulado — nunca baixa nada de verdade, todo jogo
// sai "not_found": inventar uma capa encontrada seria fingir um dado que
// esta demonstração não tem como ter, o que o item 4 do CLAUDE.md proíbe) ---

type DemoScrape = { startedAt: number; gameIds: number[] };
const scrapeJobs = new Map<string, DemoScrape>();
let scrapeCounter = 0;
const SCRAPE_STEP_MS = 500;

function computeScrapeJob(id: string, info: DemoScrape): ScrapeJob {
  const elapsed = Date.now() - info.startedAt;
  const processed = Math.min(info.gameIds.length, Math.floor(elapsed / SCRAPE_STEP_MS));
  const phase: ScrapePhase = processed >= info.gameIds.length ? "concluido" : processed === 0 ? "buscando" : "baixando";
  const results: ScrapeGameResult[] = info.gameIds.slice(0, processed).map((gameId) => ({
    game_id: gameId,
    title: games.find((g) => g.id === gameId)?.title ?? "?",
    status: "not_found",
  }));
  return {
    id,
    phase,
    total: info.gameIds.length,
    processed,
    results,
    started_at: new Date(info.startedAt).toISOString(),
    finished_at: phase === "concluido" ? new Date(info.startedAt + processed * SCRAPE_STEP_MS).toISOString() : null,
  };
}

let igdbCredentials: IGDBCredentialsStatus = { configured: true, personal: false };

// --- Sessões ---

type DemoSession = Session & { startedAtMs: number };
let sessions: DemoSession[] = [];
let sessionCounter = 0;
// Depois disso, a sessão de mentira "encerra" sozinha — não fica presa em
// "rodando" pra sempre, mas também não trava esperando alguém fechar um
// processo que nunca existiu.
const SESSION_RUNNING_MS = 8000;

function toSessionWithStats(s: DemoSession): SessionWithStats {
  const elapsedMs = Date.now() - s.startedAtMs;
  const running = elapsedMs < SESSION_RUNNING_MS;
  return {
    id: s.id,
    console_id: s.console_id,
    adapter_id: s.adapter_id,
    emulator: s.emulator,
    rom_path: s.rom_path,
    started_at: s.started_at,
    ended_at: s.ended_at,
    unapplied: s.unapplied,
    duration_seconds: Math.round(Math.min(elapsedMs, SESSION_RUNNING_MS) / 1000),
    is_running: running,
  };
}

// --- Router ---

type Ctx = { params: string[]; query: URLSearchParams; body: unknown };
type Handler = (ctx: Ctx) => unknown;
type Route = { method: string; pattern: RegExp; handler: Handler };

function notFound(what: string): never {
  throw new ApiError("not_found", `${what} não existe nesta demonstração (era esperado, ela reinicia a cada F5).`);
}

const routes: Route[] = [
  { method: "GET", pattern: /^\/health$/, handler: (): HealthStatus => ({ status: "ok", schema_version: 5, consoles: 33 }) },
  {
    method: "GET",
    pattern: /^\/system\/info$/,
    handler: (): SystemInfo => ({ app_data_dir: "(modo demonstração — sem pasta real)", os: "demo" }),
  },

  { method: "GET", pattern: /^\/consent$/, handler: (): ConsentStatus => consent },
  {
    method: "POST",
    pattern: /^\/consent$/,
    handler: (ctx): ConsentStatus => {
      const { granted } = ctx.body as { granted: boolean };
      consent.granted = granted;
      consent.granted_at = granted ? nowISO() : undefined;
      return consent;
    },
  },

  {
    method: "POST",
    pattern: /^\/hardware\/scan$/,
    handler: (): HardwareInfo => {
      hardware.scanned_at = nowISO();
      return hardware;
    },
  },
  { method: "GET", pattern: /^\/hardware$/, handler: (): HardwareInfo => hardware },

  { method: "GET", pattern: /^\/consoles\/verdicts$/, handler: (): Report => report },

  { method: "GET", pattern: /^\/emulators$/, handler: () => ({ emulators }) },
  { method: "GET", pattern: /^\/retroarch\/cores$/, handler: () => ({ cores: retroarchCores }) },
  { method: "GET", pattern: /^\/emulator-sources$/, handler: () => ({ sources: emulatorSources }) },

  { method: "GET", pattern: /^\/custom-emulators$/, handler: (): CustomEmulatorsResponse => ({
    custom_emulators: customEmulators,
    file_path: customEmulatorsFilePath,
    placeholders: customEmulatorsPlaceholders,
  }) },
  {
    method: "POST",
    pattern: /^\/custom-emulators$/,
    handler: (ctx) => {
      const def = ctx.body as CustomDefinition;
      customEmulators = [...customEmulators.filter((c) => c.id !== def.id), def];
      return { custom_emulators: customEmulators };
    },
  },
  {
    method: "DELETE",
    pattern: /^\/custom-emulators\/([^/]+)$/,
    handler: (ctx) => {
      customEmulators = customEmulators.filter((c) => c.id !== ctx.params[0]);
      return { custom_emulators: customEmulators };
    },
  },

  {
    method: "POST",
    pattern: /^\/emulators\/([^/]+)\/install$/,
    handler: (ctx): InstallJob => {
      const adapterId = ctx.params[0];
      const entry = emulators.find((e) => e.adapter_id === adapterId);
      const id = `demo-install-${++installCounter}`;
      const info: DemoInstall = { adapterId, name: entry?.name ?? adapterId, startedAt: Date.now() };
      installs.set(id, info);
      return computeInstallJob(id, info);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/emulators\/([^/]+)\/install$/,
    handler: (ctx) => {
      const entry = emulators.find((e) => e.adapter_id === ctx.params[0]);
      if (entry) {
        entry.installed = false;
        entry.installation = undefined;
      }
      return { removed: ctx.params[0] };
    },
  },
  {
    method: "POST",
    pattern: /^\/emulators\/([^/]+)\/open$/,
    handler: (ctx) => ({ opened: ctx.params[0] }),
  },

  {
    method: "GET",
    pattern: /^\/emulators\/([^/]+)\/config$/,
    handler: (ctx): EmulatorPersistedConfig => emulatorConfigs.get(ctx.params[0]) ?? {},
  },
  {
    method: "POST",
    pattern: /^\/emulators\/([^/]+)\/config$/,
    handler: (ctx): EmulatorConfigWriteResult => {
      emulatorConfigs.set(ctx.params[0], ctx.body as EmulatorPersistedConfig);
      return { unapplied: [] };
    },
  },
  {
    method: "DELETE",
    pattern: /^\/emulators\/([^/]+)\/config$/,
    handler: (ctx) => {
      emulatorConfigs.delete(ctx.params[0]);
      return { restored: true };
    },
  },

  {
    method: "GET",
    pattern: /^\/emulators\/([^/]+)\/bindings$/,
    handler: (ctx): EmulatorBindingsResponse => ({
      actions: BINDABLE_ACTIONS,
      bindings: emulatorBindings.get(ctx.params[0]) ?? [],
    }),
  },
  {
    method: "POST",
    pattern: /^\/emulators\/([^/]+)\/bindings$/,
    handler: (ctx): EmulatorConfigWriteResult => {
      const { bindings } = ctx.body as { bindings: InputBinding[] };
      emulatorBindings.set(ctx.params[0], bindings);
      return { unapplied: [] };
    },
  },

  {
    method: "GET",
    pattern: /^\/installs$/,
    handler: () => ({ installs: Array.from(installs.entries()).map(([id, info]) => computeInstallJob(id, info)) }),
  },
  {
    method: "GET",
    pattern: /^\/installs\/([^/]+)$/,
    handler: (ctx): InstallJob => {
      const info = installs.get(ctx.params[0]);
      if (!info) notFound("Esta instalação");
      return computeInstallJob(ctx.params[0], info);
    },
  },

  {
    method: "POST",
    pattern: /^\/games\/preview$/,
    handler: (ctx): PreviewResult => {
      const body = ctx.body as { console_id: string; rom_path: string };
      const verdict = report.verdicts.find((v) => v.console_id === body.console_id);
      const adapterId = verdict?.adapter_id ?? "demo";
      const emulatorName = verdict?.emulator ?? "Emulador de demonstração";
      return {
        emulator: emulatorName,
        adapter_id: adapterId,
        installation: {
          adapter_id: adapterId,
          name: emulatorName,
          binary_path: `/demo/apps/${adapterId}/${adapterId}`,
          managed: true,
        },
        command: { argv: ["--demo", "--", body.rom_path], unapplied: [] },
      };
    },
  },
  {
    method: "POST",
    pattern: /^\/games\/launch$/,
    handler: (ctx): Session => {
      const body = ctx.body as { console_id: string; rom_path: string };
      const verdict = report.verdicts.find((v) => v.console_id === body.console_id);
      const session: DemoSession = {
        id: `demo-session-${++sessionCounter}`,
        console_id: body.console_id,
        adapter_id: verdict?.adapter_id ?? "demo",
        emulator: verdict?.emulator ?? "Emulador de demonstração",
        rom_path: body.rom_path,
        started_at: nowISO(),
        // Sempre presente mesmo em andamento — mesma armadilha documentada
        // em Session.ended_at (CLAUDE.md, "armadilhas conhecidas").
        ended_at: "0001-01-01T00:00:00Z",
        startedAtMs: Date.now(),
      };
      sessions = [...sessions, session];
      return session;
    },
  },

  {
    method: "GET",
    pattern: /^\/sessions$/,
    handler: (): SessionsResponse => {
      const playtimeSeconds: Record<string, number> = {};
      for (const g of games) {
        playtimeSeconds[g.console_id] = (playtimeSeconds[g.console_id] ?? 0) + g.playtime_seconds;
      }
      return { sessions: sessions.map(toSessionWithStats), playtime_seconds: playtimeSeconds };
    },
  },

  {
    method: "POST",
    pattern: /^\/library\/folders$/,
    handler: (ctx) => {
      const body = ctx.body as { console_id: string; path: string };
      const folder: LibraryFolder = { id: nextFolderId++, console_id: body.console_id, path: body.path, added_at: nowISO() };
      folders = [...folders, folder];
      // Sem disco de verdade pra ler, uma pasta nova nunca acha jogo
      // nenhum sozinha nesta demonstração.
      return { folder, games_found: 0 };
    },
  },
  {
    method: "POST",
    pattern: /^\/library\/folders\/bulk$/,
    handler: (ctx) => {
      const body = ctx.body as { path: string };
      const matched: BulkMatchedFolder[] = [];
      return { matched, unmatched: [body.path] };
    },
  },
  { method: "GET", pattern: /^\/library\/folders$/, handler: () => ({ folders }) },
  {
    method: "DELETE",
    pattern: /^\/library\/folders\/([^/]+)$/,
    handler: (ctx) => {
      const id = Number(ctx.params[0]);
      folders = folders.filter((f) => f.id !== id);
      games = games.filter((g) => g.folder_id !== id);
      return { removed: id };
    },
  },
  {
    method: "POST",
    pattern: /^\/library\/folders\/([^/]+)\/scan$/,
    handler: (ctx) => {
      const id = Number(ctx.params[0]);
      return { games_found: games.filter((g) => g.folder_id === id).length };
    },
  },

  {
    method: "GET",
    pattern: /^\/library\/games$/,
    handler: (ctx) => {
      const consoleId = ctx.query.get("console_id");
      if (consoleId) {
        return { games: sortGames(games.filter((g) => g.console_id === consoleId)) };
      }

      const page = Number(ctx.query.get("page") ?? "1");
      const pageSize = Number(ctx.query.get("page_size") ?? "24");
      const q = ctx.query.get("q")?.toLowerCase() ?? "";
      const favoriteOnly = ctx.query.get("favorite") === "true";
      const platform = ctx.query.get("platform");
      const sort = ctx.query.get("sort");

      let filtered = games.filter((g) => (!q || g.title.toLowerCase().includes(q)) && (!favoriteOnly || g.favorite));
      // `consoles` respeita q/favorite, não platform — mesma regra da API
      // real (client.ts): os chips de filtro não podem sumir sozinhos ao
      // trocar de plataforma.
      const consoles = Array.from(new Set(filtered.map((g) => g.console_id)));
      if (platform) filtered = filtered.filter((g) => g.console_id === platform);
      filtered = sortGames(filtered, sort);

      const total = filtered.length;
      const start = (page - 1) * pageSize;
      return { games: filtered.slice(start, start + pageSize), total, page, page_size: pageSize, consoles };
    },
  },
  {
    method: "POST",
    pattern: /^\/library\/games\/([^/]+)\/favorite$/,
    handler: (ctx) => setFavorite(Number(ctx.params[0]), true),
  },
  {
    method: "DELETE",
    pattern: /^\/library\/games\/([^/]+)\/favorite$/,
    handler: (ctx) => setFavorite(Number(ctx.params[0]), false),
  },

  { method: "GET", pattern: /^\/igdb\/credentials$/, handler: (): IGDBCredentialsStatus => igdbCredentials },
  {
    method: "POST",
    pattern: /^\/igdb\/credentials$/,
    handler: (): IGDBCredentialsStatus => {
      igdbCredentials = { configured: true, personal: true };
      return igdbCredentials;
    },
  },
  {
    method: "DELETE",
    pattern: /^\/igdb\/credentials$/,
    handler: (): IGDBCredentialsStatus => {
      igdbCredentials = { configured: true, personal: false };
      return igdbCredentials;
    },
  },

  {
    method: "POST",
    pattern: /^\/library\/games\/scrape-covers$/,
    handler: (ctx): ScrapeJob => {
      const body = ctx.body as { game_id?: number } | undefined;
      const gameIds = body?.game_id ? [body.game_id] : games.map((g) => g.id);
      const id = `demo-scrape-${++scrapeCounter}`;
      const info: DemoScrape = { startedAt: Date.now(), gameIds };
      scrapeJobs.set(id, info);
      return computeScrapeJob(id, info);
    },
  },
  {
    method: "GET",
    pattern: /^\/scrape-jobs\/([^/]+)$/,
    handler: (ctx): ScrapeJob => {
      const info = scrapeJobs.get(ctx.params[0]);
      if (!info) notFound("Esta busca de capas");
      return computeScrapeJob(ctx.params[0], info);
    },
  },
];

function setFavorite(id: number, favorite: boolean): { id: number; favorite: boolean } {
  const game = games.find((g) => g.id === id);
  if (game) game.favorite = favorite;
  return { id, favorite };
}

export async function demoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await fakeLatency();

  const method = (init?.method ?? "GET").toUpperCase();
  const qIndex = path.indexOf("?");
  const rawPath = qIndex === -1 ? path : path.slice(0, qIndex);
  const query = new URLSearchParams(qIndex === -1 ? "" : path.slice(qIndex + 1));
  const body: unknown = init?.body ? JSON.parse(init.body as string) : undefined;

  for (const route of routes) {
    if (route.method !== method) continue;
    const match = rawPath.match(route.pattern);
    if (!match) continue;
    const params = match.slice(1).map((p) => decodeURIComponent(p));
    return route.handler({ params, query, body }) as T;
  }

  throw new ApiError("not_found", `Modo demonstração: rota não implementada (${method} ${rawPath}).`);
}
