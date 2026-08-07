// Cliente HTTP tipado para o zeuxd. Sem biblioteca de cliente HTTP — `fetch`
// é nativo e a API tem 17 rotas estáveis (ver ADR 0001 e item B4 do plano da
// Sprint B: "React, Tailwind e mais nada" sem justificativa escrita).
import type {
  ConsentStatus,
  CustomDefinition,
  CustomEmulatorsResponse,
  EmulatorBindingsResponse,
  EmulatorConfigWriteResult,
  EmulatorEntry,
  EmulatorPersistedConfig,
  EmulatorSource,
  ErrorBody,
  HardwareInfo,
  HealthStatus,
  IGDBCredentialsStatus,
  InputBinding,
  InstallJob,
  BulkMatchedFolder,
  LaunchBody,
  LibraryFolder,
  LibraryGame,
  PreviewResult,
  Report,
  RetroArchCoreStatus,
  ScrapeJob,
  Session,
  SessionsResponse,
} from "./types";

// O zeuxd sobe como sidecar do Tauri (item B5) e escuta sempre neste
// endereço fixo — descoberta dinâmica de porta é backlog sem sprint.
export const API_ORIGIN = "http://127.0.0.1:7777";
const API_BASE = `${API_ORIGIN}/api/v1`;

// `cover_url` (G1) vem do servidor como caminho absoluto de rota
// ("/api/v1/covers/..."), não URL completa — o servidor não sabe (nem
// precisa saber) o próprio host:porta. Um <img src> com esse caminho cru
// resolveria contra a origem do WebView/preview do front, não contra o
// zeuxd. Esta função é o único lugar que faz essa junção.
export function coverImageURL(coverUrl: string | undefined): string | undefined {
  return coverUrl ? `${API_ORIGIN}${coverUrl}` : undefined;
}

/**
 * Erro de API com o `code` estável do servidor. `message` já vem em
 * português, pronta para ser exibida ao usuário exatamente como veio — regra
 * de produto: a UI nunca reescreve a mensagem do servidor. `code` é só para a
 * UI ramificar (ex.: mostrar um botão diferente para `hardware_insufficient`).
 */
export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

function isErrorBody(value: unknown): value is ErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ErrorBody).error?.code === "string" &&
    typeof (value as ErrorBody).error?.message === "string"
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Sem timeout próprio, um fetch pendurado (TCP aceito sem resposta HTTP)
  // deixava a UI em "lendo o consentimento…" até o WebView desistir sozinho —
  // StatusScreen promete que o loading não gira para sempre; isso só vale se
  // a falha for limitada. 30 s cobre scan de hardware e instalações curtas;
  // a fase connecting em App.tsx ainda falha rápido via connection refused.
  const signal = init?.signal ?? AbortSignal.timeout(30_000);
  const res = await fetch(`${API_BASE}${path}`, { ...init, signal });

  // 404/405 de rota inexistente ou método errado vêm em texto puro do
  // próprio ServeMux do Go, não no formato de erro do ZeuX — ver docs/api.md,
  // "Convenções gerais". Não tenta decodificar JSON nesse caso.
  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : null;

  if (!res.ok) {
    if (isErrorBody(body)) {
      throw new ApiError(body.error.code, body.error.message);
    }
    throw new ApiError("http_error", `O zeuxd respondeu HTTP ${res.status}.`);
  }

  return body as T;
}

function postJSON<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export const api = {
  health: () => request<HealthStatus>("/health"),

  // Timeout curto: na fase connecting a UI tenta dezenas de vezes; cada
  // tentativa não pode ficar 30 s presa se a porta aceitar TCP sem HTTP.
  getConsent: () => request<ConsentStatus>("/consent", { signal: AbortSignal.timeout(2_000) }),
  setConsent: (granted: boolean) => postJSON<ConsentStatus>("/consent", { granted }),

  scanHardware: () => request<HardwareInfo>("/hardware/scan", { method: "POST" }),
  getHardware: () => request<HardwareInfo>("/hardware"),

  getVerdicts: () => request<Report>("/consoles/verdicts"),

  getEmulators: () => request<{ emulators: EmulatorEntry[] }>("/emulators"),
  getRetroArchCores: () => request<{ cores: RetroArchCoreStatus[] }>("/retroarch/cores"),

  getCustomEmulators: () => request<CustomEmulatorsResponse>("/custom-emulators"),
  upsertCustomEmulator: (def: CustomDefinition) =>
    postJSON<{ custom_emulators: CustomDefinition[] }>("/custom-emulators", def),
  deleteCustomEmulator: (id: string) =>
    request<{ custom_emulators: CustomDefinition[] }>(`/custom-emulators/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  getEmulatorSources: () => request<{ sources: EmulatorSource[] }>("/emulator-sources"),

  installEmulator: (id: string, force = false) =>
    request<InstallJob>(`/emulators/${encodeURIComponent(id)}/install${force ? "?force=true" : ""}`, {
      method: "POST",
    }),
  uninstallEmulator: (id: string) =>
    request<{ removed: string }>(`/emulators/${encodeURIComponent(id)}/install`, { method: "DELETE" }),
  // Botão "Abrir configurações do emulador" — abre o emulador sozinho, sem
  // jogo, escape hatch que sempre continua existindo (H2, docs/roadmap.md).
  openEmulator: (id: string) =>
    request<{ opened: string }>(`/emulators/${encodeURIComponent(id)}/open`, { method: "POST" }),

  // --- Configuração persistida do emulador (H1/H2) ---
  getEmulatorConfig: (id: string) =>
    request<EmulatorPersistedConfig>(`/emulators/${encodeURIComponent(id)}/config`),
  setEmulatorConfig: (id: string, opts: EmulatorPersistedConfig) =>
    postJSON<EmulatorConfigWriteResult>(`/emulators/${encodeURIComponent(id)}/config`, opts),
  restoreEmulatorConfig: (id: string) =>
    request<{ restored: boolean }>(`/emulators/${encodeURIComponent(id)}/config`, { method: "DELETE" }),

  // --- Mapeamento de teclado/controle (H3/H4) ---
  getEmulatorBindings: (id: string) =>
    request<EmulatorBindingsResponse>(`/emulators/${encodeURIComponent(id)}/bindings`),
  setEmulatorBindings: (id: string, bindings: InputBinding[]) =>
    postJSON<EmulatorConfigWriteResult>(`/emulators/${encodeURIComponent(id)}/bindings`, { bindings }),
  getInstalls: () => request<{ installs: InstallJob[] }>("/installs"),
  getInstallJob: (id: string) => request<InstallJob>(`/installs/${encodeURIComponent(id)}`),

  previewLaunch: (body: LaunchBody) => postJSON<PreviewResult>("/games/preview", body),
  launch: (body: LaunchBody) => postJSON<Session>("/games/launch", body),

  getSessions: () => request<SessionsResponse>("/sessions"),

  addLibraryFolder: (consoleId: string, path: string) =>
    postJSON<{ folder: LibraryFolder; games_found: number }>("/library/folders", {
      console_id: consoleId,
      path,
    }),
  // "Um caminho para todos os jogos" (2026-08-05): uma pasta-raiz com
  // subpasta por console — o servidor casa cada subpasta pelo nome, nunca
  // por extensão de arquivo solto (ver handleBulkAddLibraryFolders).
  bulkAddLibraryFolders: (path: string) =>
    postJSON<{ matched: BulkMatchedFolder[]; unmatched: string[] }>("/library/folders/bulk", { path }),
  getLibraryFolders: () => request<{ folders: LibraryFolder[] }>("/library/folders"),
  removeLibraryFolder: (id: number) =>
    request<{ removed: number }>(`/library/folders/${id}`, { method: "DELETE" }),
  rescanLibraryFolder: (id: number) =>
    request<{ games_found: number }>(`/library/folders/${id}/scan`, { method: "POST" }),
  getLibraryGames: (consoleId: string) =>
    request<{ games: LibraryGame[] }>(`/library/games?console_id=${encodeURIComponent(consoleId)}`),
  // Sem console_id: modo "todos os jogos" (2026-08-04), paginado — ver
  // handleListLibraryGames em internal/api/server.go. `query` filtra por
  // título no servidor (acha o jogo mesmo fora da página atual) — omitido
  // quando vazio, em vez de mandar `q=`. `favoriteOnly` (G4) manda
  // `favorite=true`, combinável com a busca. `platform` (M4,
  // docs/sprint-m-plano.md) filtra por `console_id` — nome diferente de
  // `console_id` de propósito: esse parâmetro já troca a rota inteira para o
  // modo "por console" nesta mesma função (`getLibraryGames`, acima), ver
  // docs/api.md. `consoles` na resposta é o campo novo do M4: os
  // `console_id` presentes no resultado completo (respeitando `q`/
  // `favorite`, não `platform`), para os chips de filtro não mudarem de
  // opção sozinhos ao trocar de página/plataforma.
  getAllLibraryGames: (page: number, pageSize: number, query?: string, favoriteOnly?: boolean, platform?: string) =>
    request<{ games: LibraryGame[]; total: number; page: number; page_size: number; consoles: string[] }>(
      `/library/games?page=${page}&page_size=${pageSize}${query ? `&q=${encodeURIComponent(query)}` : ""}${favoriteOnly ? "&favorite=true" : ""}${platform ? `&platform=${encodeURIComponent(platform)}` : ""}`,
    ),
  // G4: favoritar/desfavoritar — resposta idêntica nas duas, só o valor
  // gravado muda.
  favoriteGame: (id: number) =>
    request<{ id: number; favorite: boolean }>(`/library/games/${id}/favorite`, { method: "POST" }),
  unfavoriteGame: (id: number) =>
    request<{ id: number; favorite: boolean }>(`/library/games/${id}/favorite`, { method: "DELETE" }),

  // --- Scraper de metadados IGDB (G1) ---
  getIGDBCredentials: () => request<IGDBCredentialsStatus>("/igdb/credentials"),
  setIGDBCredentials: (clientId: string, clientSecret: string) =>
    postJSON<IGDBCredentialsStatus>("/igdb/credentials", { client_id: clientId, client_secret: clientSecret }),
  clearIGDBCredentials: () =>
    request<IGDBCredentialsStatus>("/igdb/credentials", { method: "DELETE" }),
  // gameId ausente dispara o lote (todo jogo ainda sem capa); presente busca
  // (ou reconsulta, G2) um jogo só.
  scrapeCovers: (gameId?: number) =>
    postJSON<ScrapeJob>("/library/games/scrape-covers", gameId ? { game_id: gameId } : {}),
  getScrapeJob: (id: string) => request<ScrapeJob>(`/scrape-jobs/${encodeURIComponent(id)}`),
};
