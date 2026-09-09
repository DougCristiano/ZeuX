// Cliente HTTP tipado para o zeuxd. Sem biblioteca de cliente HTTP — `fetch`
// é nativo e a API tem 17 rotas estáveis (ver ADR 0001 e item B4 do plano da
// Sprint B: "React, Tailwind e mais nada" sem justificativa escrita).
import type {
  ConsentStatus,
  ConsoleEntry,
  CustomDefinition,
  CustomEmulatorsResponse,
  ControllerAssignment,
  ControllerProfile,
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
  LaunchDownloadingCore,
  LaunchResult,
  LibraryFolder,
  LibraryGame,
  PreviewResult,
  Report,
  RetroArchCoreStatus,
  ScrapeJob,
  SessionsResponse,
  SystemInfo,
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
// `cacheBust` (2026-09-08): igual a consoleImageURL — uma capa customizada
// pode sobrescrever o mesmo "cover.jpg" de sempre (mesma URL), então o
// navegador precisa de um empurrão pra não servir a versão antiga do cache.
export function coverImageURL(coverUrl: string | undefined, cacheBust?: number): string | undefined {
  if (!coverUrl) return undefined;
  const suffix = cacheBust ? `${coverUrl.includes("?") ? "&" : "?"}v=${cacheBust}` : "";
  return `${API_ORIGIN}${coverUrl}${suffix}`;
}

// Achado real, 2026-09-08 (relato do Douglas: a logo do N64 continuava
// mostrando a marca antiga da iQue mesmo depois de fechar e reabrir o app,
// já com o servidor comprovadamente servindo os bytes certos — confirmado
// por `curl` direto contra o `zeuxd` real dele). A logo embutida É estática
// por versão do app (só muda quando alguém corrige o catálogo e uma nova
// versão é instalada), mas `cacheBust` (comentário abaixo) só cobria a
// troca manual em runtime — o app reabrir com uma logo corrigida no
// binário, mas pedindo a mesma URL de sempre (`/consoles/n64/image`, sem
// nenhum parâmetro), não era garantia de nada além do
// `Cache-Control: no-store`, que só evita cache HTTP explícito, não a
// prática comum de navegador/WebView de simplesmente não repetir a
// requisição pro mesmo `src` de <img> que uma sessão anterior (ou até uma
// aba/janela que nunca foi de fato destruída) já tinha resolvido.
// `appVersionCacheKey`, ajustado uma vez por `setAppVersionCacheKey` em
// App.tsx assim que `getVersion()` responde, garante que TODA imagem de
// console troca de URL a cada nova versão instalada — sem depender de o
// usuário saber que precisa fazer um "hard refresh".
let appVersionCacheKey = "";
export function setAppVersionCacheKey(version: string): void {
  appVersionCacheKey = version;
}

// Mesmo motivo de coverImageURL acima: a rota é relativa, precisa da origem
// do zeuxd. Só monta a URL quando `has_image` já confirmou que existe algo
// pra buscar — quem chama nunca precisa tratar 404 no <img>.
//
// `cacheBust` (2026-09-08): a logo de um console pode mudar em runtime
// agora (api.setConsoleImage/resetConsoleImage) sem trocar de rota — o
// `Cache-Control: no-store` do servidor evita cache HTTP, mas o navegador
// ainda reaproveita a última imagem carregada para o mesmo `src` de <img>.
// Passar algo que muda (ex. Date.now() logo após trocar) força um pedido
// novo de verdade. Composto com `appVersionCacheKey` (acima), nunca no
// lugar dele: os dois invalidam motivos diferentes de a imagem ter mudado.
export function consoleImageURL(consoleId: string, cacheBust?: number): string {
  const params: string[] = [];
  if (appVersionCacheKey) params.push(`av=${encodeURIComponent(appVersionCacheKey)}`);
  if (cacheBust) params.push(`v=${cacheBust}`);
  const suffix = params.length ? `?${params.join("&")}` : "";
  return `${API_ORIGIN}/api/v1/consoles/${encodeURIComponent(consoleId)}/image${suffix}`;
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

/**
 * Distingue as duas formas de `LaunchResult` (ver o tipo em ./types). Fica
 * aqui, e não no arquivo de tipos, porque `types.ts` é declaradamente só
 * declaração — nenhuma linha de runtime.
 */
export function isDownloadingCore(result: LaunchResult): result is LaunchDownloadingCore {
  return (result as LaunchDownloadingCore).downloading_core === true;
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
  getSystemInfo: () => request<SystemInfo>("/system/info"),

  // Timeout curto: na fase connecting a UI tenta dezenas de vezes; cada
  // tentativa não pode ficar 30 s presa se a porta aceitar TCP sem HTTP.
  getConsent: () => request<ConsentStatus>("/consent", { signal: AbortSignal.timeout(2_000) }),
  setConsent: (granted: boolean) => postJSON<ConsentStatus>("/consent", { granted }),

  scanHardware: () => request<HardwareInfo>("/hardware/scan", { method: "POST" }),
  getHardware: () => request<HardwareInfo>("/hardware"),

  getVerdicts: () => request<Report>("/consoles/verdicts"),

  // Catálogo de consoles + como rodar cada um. Rota irmã de getVerdicts, mas
  // sem exigir consentimento nem scan — dá pra chamar antes do onboarding
  // (e depois de recusar), diferente do parecer.
  getConsoles: () => request<{ consoles: ConsoleEntry[] }>("/consoles"),
  // 2026-09-08: troca manual de logo (a busca automática do IGDB erra a
  // variante com frequência — ver internal/verdict/data/console-images/
  // README.md). sourcePath é o caminho local escolhido no diálogo nativo de
  // arquivo do SO — o Go lê o disco, o front nunca toca em bytes de imagem
  // (mesma fronteira de confiança de pasta de ROM/binário de emulador).
  setConsoleImage: (consoleId: string, sourcePath: string) =>
    postJSON<{ updated: boolean }>(`/consoles/${encodeURIComponent(consoleId)}/image`, { source_path: sourcePath }),
  // Apaga a customização — volta a servir a logo embutida (ou o ícone de
  // sigla, se o console não tiver nenhuma).
  resetConsoleImage: (consoleId: string) =>
    request<{ removed: boolean }>(`/consoles/${encodeURIComponent(consoleId)}/image`, { method: "DELETE" }),

  getEmulators: () => request<{ emulators: EmulatorEntry[] }>("/emulators"),
  getRetroArchCores: () => request<{ cores: RetroArchCoreStatus[] }>("/retroarch/cores"),
  // Download sob demanda de um core (ADR 0015, R2/R3). Nomes com espaço
  // ("beetle vb", "parallel n64") precisam ir percent-encoded no path —
  // encodeURIComponent já cuida disso.
  installRetroArchCore: (core: string) =>
    request<InstallJob>(`/retroarch/cores/${encodeURIComponent(core)}/install`, { method: "POST" }),

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
  getControllerProfiles: () => request<{ profiles: ControllerProfile[] }>("/controllers"),
  getControllerAssignment: (id: string) =>
    request<ControllerAssignment>(`/emulators/${encodeURIComponent(id)}/controller-profile`),
  setControllerAssignment: (id: string, profileId: string | null) =>
    postJSON<{ adapter_id: string; profile_id?: string }>(`/emulators/${encodeURIComponent(id)}/controller-profile`, {
      profile_id: profileId ?? "",
    }),
  // Passo guiado "Configurar controle" (2026-09-08): só lê, nunca escreve —
  // confirma se o mapeamento nativo do emulador já existe.
  getControllerStatus: (id: string) =>
    request<{ configured: boolean }>(`/emulators/${encodeURIComponent(id)}/controller-status`),
  getInstalls: () => request<{ installs: InstallJob[] }>("/installs"),
  getInstallJob: (id: string) => request<InstallJob>(`/installs/${encodeURIComponent(id)}`),
  // Só cancela download de core em andamento (R3) — instalação de emulador
  // devolve cancel_failed, sem suporte a isso.
  cancelInstall: (id: string) =>
    request<{ canceled: string }>(`/installs/${encodeURIComponent(id)}`, { method: "DELETE" }),

  previewLaunch: (body: LaunchBody) => postJSON<PreviewResult>("/games/preview", body),
  // Duas formas de sucesso desde o ADR 0015 (R3): 200 com a Session, ou 202
  // com o job de download do core que faltava (o jogo abre sozinho quando
  // terminar). Quem chama PRECISA ramificar com isDownloadingCore() — tratar
  // as duas como Session foi o bug de 2026-08-27, em que a tela dizia
  // "sessão iniciada" durante um download de centenas de MB.
  launch: (body: LaunchBody) => postJSON<LaunchResult>("/games/launch", body),

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
  // docs/api.md. `sort` (M3) troca a ordenação — `recentes`/`titulo`/
  // `tempo_jogado`, em português por exceção deliberada (CLAUDE.md). Objeto
  // de opções (não mais parâmetros posicionais) porque a lista já passou de
  // 4 pra 6 — mais fácil de ler no chamador do que contar posição.
  // `consoles` na resposta é o campo novo do M4: os `console_id` presentes
  // no resultado completo (respeitando `q`/`favorite`, não `platform`), para
  // os chips de filtro não mudarem de opção sozinhos ao trocar de
  // página/plataforma. `missingOnly` (2026-09-08) inverte o filtro de
  // ausência: por padrão jogos sem arquivo ficam fora da lista; com
  // `missing=true` a resposta traz só eles, nunca misturado com o resto.
  // `playedOnly` (2026-09-09) manda `played=true`: só jogos já abertos ao
  // menos uma vez (playtime > 0), filtrado no servidor depois da junção com
  // as sessões. `excludedOnly` manda `excluded=true`: inverte o filtro de
  // "Remover da biblioteca" — por padrão os jogos escondidos ficam fora,
  // ligado traz só eles (o caminho de volta para revelar).
  getAllLibraryGames: (
    page: number,
    pageSize: number,
    opts: {
      query?: string;
      favoriteOnly?: boolean;
      missingOnly?: boolean;
      excludedOnly?: boolean;
      playedOnly?: boolean;
      platform?: string;
      sort?: string;
    } = {},
  ) =>
    request<{ games: LibraryGame[]; total: number; page: number; page_size: number; consoles: string[] }>(
      `/library/games?page=${page}&page_size=${pageSize}${opts.query ? `&q=${encodeURIComponent(opts.query)}` : ""}${opts.favoriteOnly ? "&favorite=true" : ""}${opts.missingOnly ? "&missing=true" : ""}${opts.excludedOnly ? "&excluded=true" : ""}${opts.playedOnly ? "&played=true" : ""}${opts.platform ? `&platform=${encodeURIComponent(opts.platform)}` : ""}${opts.sort ? `&sort=${encodeURIComponent(opts.sort)}` : ""}`,
    ),
  // G4: favoritar/desfavoritar — resposta idêntica nas duas, só o valor
  // gravado muda.
  favoriteGame: (id: number) =>
    request<{ id: number; favorite: boolean }>(`/library/games/${id}/favorite`, { method: "POST" }),
  unfavoriteGame: (id: number) =>
    request<{ id: number; favorite: boolean }>(`/library/games/${id}/favorite`, { method: "DELETE" }),
  // "Remover da biblioteca" (2026-09-09): esconde/revela o jogo. Nunca toca o
  // arquivo no disco — só a flag no banco. POST esconde, DELETE revela.
  excludeGame: (id: number) =>
    request<{ id: number; excluded: boolean }>(`/library/games/${id}/exclude`, { method: "POST" }),
  unexcludeGame: (id: number) =>
    request<{ id: number; excluded: boolean }>(`/library/games/${id}/exclude`, { method: "DELETE" }),

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
  // 2026-09-08: troca manual de capa — mesma mecânica de setConsoleImage
  // (source_path local, o Go lê e grava). Vence qualquer busca automática
  // futura: ListAllGames/UncoveredGames já ignoram um jogo com cover_path
  // preenchido no lote (G1), então uma capa customizada nunca é
  // sobrescrita sozinha.
  setGameCover: (gameId: number, sourcePath: string) =>
    postJSON<{ cover_url: string }>(`/library/games/${gameId}/cover`, { source_path: sourcePath }),
};
