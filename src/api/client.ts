// Cliente HTTP tipado para o zeuxd. Sem biblioteca de cliente HTTP — `fetch`
// é nativo e a API tem 17 rotas estáveis (ver ADR 0001 e item B4 do plano da
// Sprint B: "React, Tailwind e mais nada" sem justificativa escrita).
import type {
  ConsentStatus,
  CustomDefinition,
  CustomEmulatorsResponse,
  EmulatorEntry,
  EmulatorSource,
  ErrorBody,
  HardwareInfo,
  HealthStatus,
  InstallJob,
  LaunchBody,
  LibraryFolder,
  LibraryGame,
  PreviewResult,
  Report,
  RetroArchCoreStatus,
  Session,
  SessionsResponse,
} from "./types";

// O zeuxd sobe como sidecar do Tauri (item B5) e escuta sempre neste
// endereço fixo — descoberta dinâmica de porta é backlog sem sprint.
const API_BASE = "http://127.0.0.1:7777/api/v1";

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
  const res = await fetch(`${API_BASE}${path}`, init);

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

  getConsent: () => request<ConsentStatus>("/consent"),
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
  getLibraryFolders: () => request<{ folders: LibraryFolder[] }>("/library/folders"),
  removeLibraryFolder: (id: number) =>
    request<{ removed: number }>(`/library/folders/${id}`, { method: "DELETE" }),
  rescanLibraryFolder: (id: number) =>
    request<{ games_found: number }>(`/library/folders/${id}/scan`, { method: "POST" }),
  getLibraryGames: (consoleId: string) =>
    request<{ games: LibraryGame[] }>(`/library/games?console_id=${encodeURIComponent(consoleId)}`),
};
