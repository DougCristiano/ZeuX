import { useVirtualizer } from "@tanstack/react-virtual";
import { openPath } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { api, ApiError } from "../api";
import type { ConsoleVerdict, EmulatorEntry, LibraryGame, Report, ScrapeJob } from "../api/types";
import { Button, ConfirmModal, ErrorModal, FOCUS_RING, Pagination, ProgressBar } from "../components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { GameListRow } from "../components/GameListRow";
import { GameTile, GameTileSkeleton } from "../components/GameTile";
import { useIGDBStatus } from "../hooks/useIGDBStatus";
import { useInlineInstall } from "../hooks/useInlineInstall";
import { useLaunchGame } from "../hooks/useLaunchGame";
import { consoleAccentColor } from "../lib/consoleColor";
import { percentOf } from "../lib/format";
import { evaluateGameLaunchability } from "../lib/gameLaunchability";

// M15 (docs/sprint-m-plano.md, decidido pelo Douglas em 2026-08-07): 24 nunca
// fechava fileira numa grade de 5 ou 6 colunas; 30 é múltiplo dos dois. O
// `defaultLibraryPageSize` do servidor (internal/api/server.go) acompanha o
// mesmo valor — os dois divergiam em silêncio antes desta sprint.
const PAGE_SIZE = 30;
// Espera digitar antes de consultar o backend — evita uma requisição por
// tecla. 300ms é o padrão comum para busca "enquanto digita".
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Estado de navegação da tela — M4 (docs/sprint-m-plano.md, decidido pelo
 * Douglas em 2026-08-07: "opção (a)"): mora em `App.tsx`, não aqui dentro.
 * Antes, `AllGamesScreen` guardava `page`/`search`/`platformFilter` em
 * `useState` próprio — abrir um jogo desmontava a tela (App.tsx troca de
 * `phase` num `switch`) e voltar remontava do zero, perdendo tudo. Subir
 * este pedaço de estado para o componente pai, que nunca desmonta, resolve
 * sem precisar manter duas telas montadas ao mesmo tempo (a outra opção
 * cogitada, descartada por manter complexidade extra por menos ganho).
 *
 * `sort`/`viewMode` (M3) entraram no mesmo objeto — precisam sobreviver a
 * abrir um jogo e voltar igual ao resto, mas **também** a reabrir o app
 * inteiro (critério do item), por isso os dois têm espelho em
 * `localStorage` (`loadInitialAllGamesView`/`persistAllGamesView` abaixo).
 * `page`/`search`/`platformFilter` não têm esse espelho de propósito —
 * reabrir o app numa busca antiga seria mais confuso que útil.
 */
export type SortValue = "recentes" | "titulo" | "tempo_jogado";
export type ViewMode = "grade" | "lista";

export interface AllGamesViewState {
  page: number;
  search: string;
  platformFilter: string | null;
  favoriteOnly: boolean;
  sort: SortValue;
  viewMode: ViewMode;
}

export const DEFAULT_ALL_GAMES_VIEW: AllGamesViewState = {
  page: 1,
  search: "",
  platformFilter: null,
  favoriteOnly: false,
  sort: "recentes",
  viewMode: "grade",
};

const SORT_VALUES: readonly SortValue[] = ["recentes", "titulo", "tempo_jogado"];
const VIEW_MODES: readonly ViewMode[] = ["grade", "lista"];
// M3: rótulo dizendo o que cada ordem é, em vez de deixar o usuário
// adivinhar por que a lista está naquela sequência (critério do item).
const SORT_LABELS: Record<SortValue, string> = {
  recentes: "Jogados por último",
  titulo: "Título (A–Z)",
  tempo_jogado: "Mais jogados",
};

const SORT_STORAGE_KEY = "zeux.allGames.sort";
const VIEW_MODE_STORAGE_KEY = "zeux.allGames.viewMode";

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  } catch {
    // localStorage indisponível (modo privado, quota, WebView restrito) —
    // preferência de tela, não dado crítico; cai no padrão em silêncio.
    return fallback;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // mesma tolerância do read acima — não é motivo pra quebrar a tela.
  }
}

/** Lazy initializer de `App.tsx` — só sort/viewMode vêm do localStorage. */
export function loadInitialAllGamesView(): AllGamesViewState {
  return {
    ...DEFAULT_ALL_GAMES_VIEW,
    sort: readStored(SORT_STORAGE_KEY, SORT_VALUES, DEFAULT_ALL_GAMES_VIEW.sort),
    viewMode: readStored(VIEW_MODE_STORAGE_KEY, VIEW_MODES, DEFAULT_ALL_GAMES_VIEW.viewMode),
  };
}

/** Chamado por `App.tsx` a cada mudança de view — só grava o que precisa sobreviver a reabrir o app. */
export function persistAllGamesView(patch: Partial<AllGamesViewState>) {
  if (patch.sort) writeStored(SORT_STORAGE_KEY, patch.sort);
  if (patch.viewMode) writeStored(VIEW_MODE_STORAGE_KEY, patch.viewMode);
}

// M3 (virtualização): quantas colunas a grade tem, replicando os
// breakpoints do próprio className abaixo (`grid-cols-2 sm: md: lg: 2xl:`).
// Precisa ser calculado em JS porque a virtualização substitui o
// `display: grid` que faria isso sozinho — cada "linha" virtualizada tem
// que saber quantos jogos ela carrega. Mede a LARGURA DA JANELA, não a do
// container: os breakpoints do Tailwind são media query sobre viewport,
// não sobre elemento (CLAUDE.md, "layout responsivo").
const GRID_BREAKPOINTS: readonly [minWidth: number, columns: number][] = [
  [1536, 6], // 2xl
  [1024, 5], // lg
  [768, 4], // md
  [640, 3], // sm
  [0, 2],
];
function columnsForWidth(width: number): number {
  for (const [min, columns] of GRID_BREAKPOINTS) {
    if (width >= min) return columns;
  }
  return 2;
}
function useGridColumns(): number {
  const [columns, setColumns] = useState(() => columnsForWidth(window.innerWidth));
  useEffect(() => {
    function onResize() {
      setColumns(columnsForWidth(window.innerWidth));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return columns;
}

/**
 * Tela "Todos os jogos" (2026-08-04, a pedido do Douglas): landing page
 * depois do parecer, junta jogos de qualquer console numa lista só, sem
 * precisar escolher o console primeiro — "clicar direto e começar a jogar".
 * Paginada (não scroll infinito), com page_size fixo — GET /library/games
 * sem console_id (ver internal/api/server.go, handleListLibraryGames).
 *
 * Sprint 2 do plano de migração visual (2026-08-04 —
 * /home/douglas/.claude/plans/sleepy-roaming-pearl.md): busca por título
 * (`?q=` no backend — acha o jogo em qualquer página, não só na carregada)
 * e filtro por plataforma. M4 (2026-08-07) moveu o filtro de plataforma do
 * cliente para o servidor (`?platform=<console_id>`); M3 (mesma data)
 * acrescentou ordenação (`?sort=`), modo lista e virtualização — a página do
 * servidor continua limitada a `PAGE_SIZE`, a virtualização é sobre o DOM
 * **daquela página**, não substitui a paginação.
 *
 * M8 (mesma data): a checagem "este jogo pode abrir?" e o fluxo de
 * instalação inline (antes exclusivos de `GamesScreen`) passaram a valer
 * aqui também, via `evaluateGameLaunchability`/`useInlineInstall`
 * (src/lib/gameLaunchability.ts, src/hooks/useInlineInstall.ts) — mesma
 * regra nas duas telas, critério do próprio item. O que muda é só a
 * apresentação: a grade é virtualizada (M3), então confirmação de hardware
 * fraco/BIOS vazio vira `ConfirmModal` (screen-level, um por vez) em vez do
 * painel inline por tile que `GamesScreen` usa — inserir um painel dentro de
 * uma linha virtualizada quebraria a altura uniforme que `useVirtualizer`
 * exige. Pelo mesmo motivo, o progresso de instalação vira um painel
 * flutuante fixo (não preso a um tile): se o usuário rolar a grade e o tile
 * que disparou a instalação sair da viewport, a linha virtualizada dele é
 * desmontada — um indicador por tile sumiria com ela.
 */
export function AllGamesScreen({
  report,
  onOpenLibrary,
  onOpenGame,
  view,
  onViewChange,
  scrollElementRef,
  initialScrollTop,
}: {
  report: Report;
  onOpenLibrary: () => void;
  onOpenGame: (game: LibraryGame, consoleName: string, shortName: string) => void;
  /** Página/busca/filtro/ordem/modo atuais — controlados por App.tsx (M4). */
  view: AllGamesViewState;
  /** Patch parcial — só os campos que mudaram, como o `setState` de objeto. */
  onViewChange: (patch: Partial<AllGamesViewState>) => void;
  /**
   * M3 (virtualização): o elemento que rola de verdade é `<main>`, em
   * `App.tsx` — sobrevive à troca de fase (M4), esta tela nunca teve o
   * próprio scroll container. `useVirtualizer` precisa dele pra saber o que
   * está visível.
   */
  scrollElementRef: RefObject<HTMLElement | null>;
  /**
   * M4: a rolagem salva antes de abrir o jogo. Só é aplicada **depois** que
   * `games` deixa de ser `null` — antes disso a grade não tem altura
   * nenhuma pra rolar, e o navegador zeraria de volta sozinho (achado
   * testando ao vivo: aplicar isto num efeito do `App.tsx`, disparado só
   * por `phase`, rodava cedo demais, antes da resposta assíncrona de
   * `GET /library/games` chegar).
   */
  initialScrollTop: number;
}) {
  const { page, search, platformFilter, favoriteOnly, sort, viewMode } = view;
  const [games, setGames] = useState<LibraryGame[] | null>(null);
  const [total, setTotal] = useState(0);
  // Consoles presentes no resultado completo (M4) — vem do servidor, não é
  // mais calculado sobre a página carregada.
  const [consoles, setConsoles] = useState<string[]>([]);
  // Inicializado a partir de `search` (não ""): ao voltar do detalhe com uma
  // busca já digitada, a primeira requisição já sai com o termo certo, sem
  // esperar os 300ms de debounce de novo.
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());
  const [error, setError] = useState<string | null>(null);
  const { statusFor, launch, launchError, clearLaunchError, retryLaunch } = useLaunchGame();
  const igdbConfigured = useIGDBStatus();
  const [scrapeJob, setScrapeJob] = useState<ScrapeJob | null>(null);
  const [scrapeSummary, setScrapeSummary] = useState<string | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const columns = useGridColumns();
  // M8: carregado uma vez só para a tela inteira — diferente de GamesScreen
  // (um console por vez), aqui os jogos abrangem qualquer console, então o
  // lookup de adapter é por jogo (`adapterEntryFor` abaixo), não fixo.
  const [emulators, setEmulators] = useState<EmulatorEntry[] | null>(null);

  useEffect(() => {
    api
      .getEmulators()
      .then((res) => setEmulators(res.emulators))
      .catch(() => setEmulators([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Buscar (ou trocar o filtro de favoritos) reseta pra página 1 — senão
  // "página 3" de um filtro novo quase sempre estaria vazia. `isFirstRun`
  // existe para NÃO resetar a página restaurada (M4) quando a tela remonta
  // com uma busca/filtro que já vieram de antes — sem ele, voltar do
  // detalhe na página 3 com busca "mario" cairia direto na página 1 de novo,
  // o exato bug que o item corrige.
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    onViewChange({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, favoriteOnly]);

  // M4: restaura a rolagem uma vez só, na primeira vez que `games` chega
  // depois do mount — depois disso, `restoredScrollRef` trava, pra não
  // brigar com a rolagem do próprio usuário a cada recarregamento de página
  // (ex.: trocar de página não deveria voltar pra rolagem antiga).
  const restoredScrollRef = useRef(false);
  useEffect(() => {
    if (restoredScrollRef.current) return;
    if (!games || !scrollElementRef.current) return;
    scrollElementRef.current.scrollTop = initialScrollTop;
    restoredScrollRef.current = true;
  }, [games, initialScrollTop, scrollElementRef]);

  function loadGames() {
    api
      .getAllLibraryGames(page, PAGE_SIZE, {
        query: debouncedSearch || undefined,
        favoriteOnly,
        platform: platformFilter ?? undefined,
        sort,
      })
      .then((res) => {
        setGames(res.games);
        setTotal(res.total);
        setConsoles(res.consoles);
        // A plataforma escolhida pode ter deixado de existir no resultado
        // (busca/favoritos mudaram e não sobrou jogo daquele console) — cai
        // pra "todos" em vez de continuar filtrando por algo que já não
        // aparece nem nos próprios chips.
        if (platformFilter && !res.consoles.includes(platformFilter)) {
          onViewChange({ platformFilter: null });
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível listar os jogos."));
  }

  useEffect(loadGames, [page, debouncedSearch, favoriteOnly, platformFilter, sort]);

  // Toggle otimista (G4): atualiza a lista na hora, sem esperar a resposta
  // nem recarregar a página inteira. Se a chamada falhar, desfaz.
  function toggleFavorite(game: LibraryGame) {
    const next = !game.favorite;
    setGames((prev) => (prev ? prev.map((g) => (g.id === game.id ? { ...g, favorite: next } : g)) : prev));
    const call = next ? api.favoriteGame(game.id) : api.unfavoriteGame(game.id);
    call.catch(() => {
      setGames((prev) => (prev ? prev.map((g) => (g.id === game.id ? { ...g, favorite: !next } : g)) : prev));
      setError("Não foi possível salvar o favorito. Tente de novo.");
    });
  }

  // Busca de capas em lote (G1, docs/roadmap.md) — poll com setTimeout
  // recursivo (não setInterval, mesmo padrão de EmulatorsScreen.pollJob),
  // pra nunca sobrepor duas checagens da mesma busca.
  function pollScrapeJob(jobId: string) {
    api
      .getScrapeJob(jobId)
      .then((job) => {
        setScrapeJob(job);
        if (job.phase === "concluido") {
          const found = job.results.filter((r) => r.status === "found").length;
          const notFound = job.results.length - found;
          setScrapeSummary(
            notFound > 0
              ? `${found} capa${found === 1 ? "" : "s"} encontrada${found === 1 ? "" : "s"}, ${notFound} não encontrada${notFound === 1 ? "" : "s"}.`
              : `${found} capa${found === 1 ? "" : "s"} encontrada${found === 1 ? "" : "s"}.`,
          );
          setScrapeJob(null);
          loadGames();
          return;
        }
        if (job.phase === "falhou") {
          setScrapeError(job.error ?? "Não foi possível buscar capas agora.");
          setScrapeJob(null);
          return;
        }
        setTimeout(() => pollScrapeJob(jobId), 400);
      })
      .catch((err) => {
        setScrapeError(err instanceof ApiError ? err.message : "Não foi possível acompanhar a busca de capas.");
        setScrapeJob(null);
      });
  }

  function startScrapeCovers() {
    setScrapeError(null);
    setScrapeSummary(null);
    api
      .scrapeCovers()
      .then((job) => {
        setScrapeJob(job);
        pollScrapeJob(job.id);
      })
      .catch((err) => setScrapeError(err instanceof ApiError ? err.message : "Não foi possível iniciar a busca de capas."));
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function shortNameFor(consoleId: string): string {
    return report.verdicts.find((v) => v.console_id === consoleId)?.short_name ?? consoleId;
  }

  function verdictFor(consoleId: string): ConsoleVerdict | undefined {
    return report.verdicts.find((v) => v.console_id === consoleId);
  }

  function adapterEntryFor(verdict: ConsoleVerdict | undefined): EmulatorEntry | undefined {
    return verdict?.adapter_id ? (emulators ?? []).find((e) => e.adapter_id === verdict.adapter_id) : undefined;
  }

  async function openBiosFolder(dir: string) {
    try {
      await openPath(dir);
    } catch (err) {
      setError(`Não foi possível abrir a pasta do BIOS: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // M8: fluxo de instalação inline compartilhado com GamesScreen.
  const install = useInlineInstall({
    onEmulatorInstalled: (adapterId) =>
      setEmulators((prev) => (prev ?? []).map((e) => (e.adapter_id === adapterId ? { ...e, installed: true } : e))),
    onLaunch: (romPath) => {
      const game = games?.find((g) => g.path === romPath);
      if (game) launch(game);
    },
  });

  function isPendingInstallFor(path: string): boolean {
    return (
      (install.state.kind === "installing" ||
        install.state.kind === "confirm-hardware" ||
        install.state.kind === "confirm-bios") &&
      install.state.pendingGamePath === path
    );
  }

  // Chips ordenados por rótulo visível (não por console_id cru) — só um
  // detalhe de leitura, o servidor já manda a lista deduplicada.
  const platformOptions = consoles
    .map((id) => ({ id, label: shortNameFor(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const gameCount = games?.length ?? 0;
  // M3: virtualização por linha — na grade, cada "linha" carrega `columns`
  // jogos lado a lado; na lista, uma linha é um jogo. O total de nós no DOM
  // fica limitado ao que cabe na viewport (+ overscan), não ao PAGE_SIZE
  // inteiro — é isto que o critério de aceite mede.
  const rowCount = viewMode === "grade" ? Math.ceil(gameCount / columns) : gameCount;
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElementRef.current,
    // Chute inicial — `measureElement` (abaixo) corrige pela altura real
    // renderizada, então não precisa ser exato (título pode quebrar em 1 ou
    // 2 linhas, mudando a altura de verdade da célula).
    estimateSize: () => (viewMode === "grade" ? 280 : 52),
    overscan: viewMode === "grade" ? 2 : 6,
    // Cola o offset do scroll ao trocar de página/ordenação/modo — sem isto
    // o virtualizer tentaria reaproveitar posições da lista anterior.
    getItemKey: (index) => `${viewMode}-${index}`,
  });

  // M8: mesma cadeia de decisão de GamesScreen — só varia o que cada tela
  // tem à mão (aqui, verdict/adapterEntry são resolvidos por jogo, não
  // fixos para um único console). Continua clicável em jogo `missing`
  // (deixa o erro real do servidor aparecer, em vez de esconder o botão) —
  // mesma escolha de GamesScreen.
  function playHandlerFor(game: LibraryGame): (() => void) | undefined {
    if (statusFor(game.id).kind === "launching") return undefined;
    if (isPendingInstallFor(game.path)) return undefined;
    const verdict = verdictFor(game.console_id);
    return () => install.handlePlay(game, verdict, adapterEntryFor(verdict));
  }

  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-10">
      {/*
       * Um só modal por vez — antes disto, `error` (falha ao listar/
       * favoritar) aparecia como parágrafo vermelho solto no meio da tela
       * (achado numa sessão anterior, 2026-08-07: "não tá bom, nem
       * legível"). Mesmo motivo que criou o `ErrorModal` em 2026-08-04, só
       * que este caso nunca ganhou o mesmo tratamento.
       */}
      {launchError ? (
        <ErrorModal
          title="Não foi possível abrir o jogo"
          message={launchError}
          onClose={clearLaunchError}
          onRetry={retryLaunch}
        />
      ) : install.state.kind === "error" ? (
        <ErrorModal
          title="Não foi possível instalar o emulador"
          message={install.state.message}
          onClose={() => install.setState({ kind: "idle" })}
        />
      ) : (
        error && <ErrorModal title="Não foi possível carregar a biblioteca" message={error} onClose={() => setError(null)} />
      )}

      {/*
       * M8: confirmação de hardware fraco/BIOS vazio, em modal (não painel
       * inline por tile) — motivo no comentário da própria tela, acima. Só
       * um pode estar ativo por vez (`install.state` é único pra tela
       * inteira), então não precisa de prioridade entre os dois como o
       * bloco de erro acima.
       */}
      {install.state.kind === "confirm-hardware" &&
        (() => {
          const confirmState = install.state;
          return (
            <ConfirmModal
              title="Hardware abaixo do recomendado"
              message={confirmState.message}
              onClose={() => install.setState({ kind: "idle" })}
              actions={
                <>
                  <Button variant="secondary" onClick={() => install.setState({ kind: "idle" })}>
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => install.startInstall(confirmState.adapterId, true, confirmState.pendingGamePath)}
                  >
                    Instalar mesmo assim
                  </Button>
                </>
              }
            />
          );
        })()}

      {install.state.kind === "confirm-bios" &&
        (() => {
          const confirmState = install.state;
          const pendingGame = games?.find((g) => g.path === confirmState.pendingGamePath);
          const pendingVerdict = pendingGame ? verdictFor(pendingGame.console_id) : undefined;
          const pendingAdapterEntry = adapterEntryFor(pendingVerdict);
          return (
            <ConfirmModal
              title="BIOS ausente"
              message="A pasta de BIOS deste emulador está vazia. Sem o arquivo, o jogo não deve abrir."
              onClose={() => install.setState({ kind: "idle" })}
              actions={
                <>
                  <Button variant="secondary" onClick={() => install.setState({ kind: "idle" })}>
                    Cancelar
                  </Button>
                  {pendingAdapterEntry?.bios_dir && (
                    <Button variant="secondary" onClick={() => openBiosFolder(pendingAdapterEntry.bios_dir!)}>
                      Abrir pasta do BIOS
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    onClick={() => {
                      install.setState({ kind: "idle" });
                      if (pendingGame) launch(pendingGame);
                    }}
                  >
                    Jogar mesmo assim
                  </Button>
                </>
              }
            />
          );
        })()}

      {/*
       * Painel flutuante, não modal — instalar não deveria travar o resto
       * da tela (o usuário pode continuar rolando/buscando enquanto baixa).
       * Fixo na tela, não no tile: ver comentário no topo do arquivo sobre
       * por que um indicador por tile não sobrevive à virtualização.
       */}
      {install.state.kind === "installing" && (
        <div className="fixed right-4 bottom-4 z-40 w-72 rounded border border-line bg-fill p-3 shadow-lg">
          <p className="text-sm text-ink">
            Instalando {install.state.job.name}… {install.state.job.phase}
          </p>
          <div className="mt-2">
            <ProgressBar percent={percentOf(install.state.job)} />
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-ink">
          Todos os jogos
          {/* M12 (docs/sprint-m-plano.md): a partir de `total`, que
              `loadGames` já guarda em estado — sem chamada nova (critério do
              item). Ausente durante o carregamento inicial (`games` ainda
              `null`): a contagem some junto com o resto, não sobra sozinha. */}
          {games && <span className="ml-2 text-base font-normal text-muted">· {total.toLocaleString("pt-BR")}</span>}
        </h1>
        <div className="flex flex-wrap gap-2">
          {/* Só aparece com conta do IGDB conectada (G1) — sem credencial,
              a biblioteca fica exatamente como hoje, sem botão nenhum aqui
              (docs/roadmap.md: "nunca uma tela vazia ou travada"). */}
          {igdbConfigured && (
            <Button variant="secondary" disabled={scrapeJob !== null} onClick={startScrapeCovers}>
              {scrapeJob ? `Buscando capas… ${scrapeJob.processed}/${scrapeJob.total}` : "Buscar capas"}
            </Button>
          )}
          {/* Navegação de topo (Emuladores/Parecer) mudou para a sidebar
              (2026-08-04, Sprint 1) — "Gerenciar pastas" continua aqui porque é
              sub-navegação da própria Biblioteca, não um destino de primeiro
              nível. */}
          <Button variant="secondary" onClick={onOpenLibrary}>
            Gerenciar pastas
          </Button>
        </div>
      </div>

      {scrapeSummary && <p className="mb-3 text-sm text-ink">{scrapeSummary}</p>}
      {scrapeError && (
        <p className="mb-3 text-sm text-danger">
          {scrapeError}{" "}
          <button type="button" onClick={startScrapeCovers} className="underline">
            Tentar de novo
          </button>
        </p>
      )}

      {/* M3: uma barra só, com busca, ordenação, alternância grade/lista,
          favoritos e chips de plataforma — nada solto fora dela (critério
          do item). */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label htmlFor="all-games-search" className="sr-only">
          Buscar jogos
        </label>
        <input
          id="all-games-search"
          type="text"
          name="all-games-search"
          autoComplete="off"
          value={search}
          onChange={(e) => onViewChange({ search: e.target.value })}
          placeholder="Buscar jogos…"
          className="w-full max-w-xs rounded border border-line bg-fill px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />

        <Select value={sort} onValueChange={(v) => onViewChange({ sort: v as SortValue })}>
          <SelectTrigger aria-label="Ordenar por" className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {SORT_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1 rounded-sm border border-line-strong p-0.5" role="group" aria-label="Modo de exibição">
          {(["grade", "lista"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              onClick={() => onViewChange({ viewMode: mode })}
              className={`rounded-sm px-2 py-1 font-pixel text-[11px] transition-colors ${FOCUS_RING} ${
                viewMode === mode ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
              }`}
            >
              {mode === "grade" ? "GRADE" : "LISTA"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onViewChange({ favoriteOnly: !favoriteOnly })}
          aria-pressed={favoriteOnly}
          className={`rounded-sm border px-2.5 py-1 font-pixel text-[11px] transition-colors ${FOCUS_RING} ${
            favoriteOnly ? "border-amber text-amber" : "border-line-strong text-muted hover:text-ink"
          }`}
        >
          ★ FAVORITOS
        </button>
        {platformOptions.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onViewChange({ platformFilter: null, page: 1 })}
              className={`rounded-sm border px-2.5 py-1 font-pixel text-[11px] transition-colors ${FOCUS_RING} ${
                platformFilter === null ? "border-accent text-accent" : "border-line-strong text-muted hover:text-ink"
              }`}
            >
              TODOS
            </button>
            {platformOptions.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => onViewChange({ platformFilter: id, page: 1 })}
                className={`rounded-sm border px-2.5 py-1 font-pixel text-[11px] transition-colors ${FOCUS_RING} ${
                  platformFilter === id ? "border-accent text-accent" : "border-line-strong text-muted hover:text-ink"
                }`}
              >
                {label.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* M12 (docs/sprint-m-plano.md, 2026-08-07): skeleton na mesma grade,
          `PAGE_SIZE` células — antes, `games === null` não renderizava nada
          aqui, a tela ficava em branco entre abrir e a resposta de
          `GET /library/games` chegar. `role="status"`/`aria-live`: um
          anúncio só pra leitor de tela, não 30 (`GameTileSkeleton` é
          `aria-hidden` célula a célula). As colunas espelham
          `GRID_BREAKPOINTS` (acima) em classes Tailwind puras — não precisa
          de `useGridColumns()` aqui porque não há virtualização de linha pra
          alinhar, só uma grade estática de PAGE_SIZE itens. */}
      {games === null && (
        <div role="status" aria-live="polite">
          <span className="sr-only">Carregando jogos…</span>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: PAGE_SIZE }, (_, i) => (
              <GameTileSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {games && games.length === 0 && (
        (() => {
          // M12: precedência idêntica às mensagens abaixo — "biblioteca
          // vazia de verdade" é só quando nenhum filtro está em jogo; os
          // outros três continuam texto simples (critério do item: os três
          // estados vazios continuam distintos entre si, não colapsam num
          // só). Só este ganha painel + ação principal, porque só este é a
          // primeira tela real de um usuário novo (docs/roadmap.md).
          const trulyEmpty = !debouncedSearch && !platformFilter && !favoriteOnly;
          if (trulyEmpty) {
            return (
              <div className="flex flex-col items-center gap-3 rounded border border-dashed border-line-strong px-6 py-16 text-center">
                <p className="text-base text-muted">Nenhum jogo na biblioteca ainda.</p>
                <Button variant="primary" onClick={onOpenLibrary}>
                  Escolher pasta com meus jogos
                </Button>
              </div>
            );
          }
          return (
            <p className="text-base text-muted">
              {debouncedSearch
                ? `Nenhum jogo encontrado para "${debouncedSearch}".`
                : platformFilter
                  ? `Nenhum jogo de ${shortNameFor(platformFilter)} nesta busca.`
                  : "Nenhum jogo favoritado ainda."}
            </p>
          );
        })()
      )}

      {games && games.length > 0 && (
        <>
          <div style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const rowStyle: CSSProperties = {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${virtualRow.start}px)`,
              };

              if (viewMode === "lista") {
                const game = games[virtualRow.index];
                const consoleName = report.verdicts.find((v) => v.console_id === game.console_id)?.name ?? game.console_id;
                const verdict = verdictFor(game.console_id);
                // Ausente até `emulators` responder — tile/linha aparece
                // sem badge nesse meio-tempo, nunca com um palpite (mesma
                // regra documentada em GameTile).
                const launchability = emulators
                  ? evaluateGameLaunchability(game, verdict, adapterEntryFor(verdict))
                  : undefined;
                return (
                  <div key={virtualRow.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement} style={rowStyle}>
                    <GameListRow
                      game={game}
                      consoleShortName={shortNameFor(game.console_id)}
                      accentColor={consoleAccentColor(game.console_id)}
                      onOpenDetail={() => onOpenGame(game, consoleName, shortNameFor(game.console_id))}
                      onPlay={playHandlerFor(game)}
                      onToggleFavorite={() => toggleFavorite(game)}
                      launchability={launchability}
                      onInstall={verdict?.adapter_id ? () => install.startInstall(verdict.adapter_id!, false, game.path) : undefined}
                    />
                  </div>
                );
              }

              const rowGames = games.slice(virtualRow.index * columns, virtualRow.index * columns + columns);
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    ...rowStyle,
                    display: "grid",
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gap: "1rem",
                    paddingBottom: "1rem",
                  }}
                >
                  {rowGames.map((game) => {
                    const consoleName = report.verdicts.find((v) => v.console_id === game.console_id)?.name ?? game.console_id;
                    const verdict = verdictFor(game.console_id);
                    const launchability = emulators
                      ? evaluateGameLaunchability(game, verdict, adapterEntryFor(verdict))
                      : undefined;
                    return (
                      <GameTile
                        key={game.id}
                        game={game}
                        shortName={shortNameFor(game.console_id)}
                        onOpenDetail={() => onOpenGame(game, consoleName, shortNameFor(game.console_id))}
                        onPlay={playHandlerFor(game)}
                        onToggleFavorite={() => toggleFavorite(game)}
                        launchability={launchability}
                        onInstall={verdict?.adapter_id ? () => install.startInstall(verdict.adapter_id!, false, game.path) : undefined}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          <Pagination page={page} totalPages={totalPages} onChange={(next) => onViewChange({ page: next })} />
        </>
      )}
    </div>
  );
}
