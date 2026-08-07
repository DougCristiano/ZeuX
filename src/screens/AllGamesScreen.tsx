import { useEffect, useRef, useState } from "react";
import { api, ApiError, coverImageURL } from "../api";
import type { LibraryGame, Report, ScrapeJob } from "../api/types";
import { Badge, Button, ErrorModal, FavoriteToggle, FOCUS_RING, GameCover, Pagination } from "../components/ui";
import { useIGDBStatus } from "../hooks/useIGDBStatus";
import { useLaunchGame } from "../hooks/useLaunchGame";

// M15 (docs/sprint-m-plano.md, decidido pelo Douglas em 2026-08-07): 24 nunca
// fechava fileira numa grade de 5 ou 6 colunas; 30 é múltiplo dos dois. O
// `defaultLibraryPageSize` do servidor (internal/api/server.go) acompanha o
// mesmo valor — os dois divergiam em silêncio antes desta sprint.
const PAGE_SIZE = 30;
// Espera digitar antes de consultar o backend — evita uma requisição por
// tecla. 300ms é o padrão comum para busca "enquanto digita".
const SEARCH_DEBOUNCE_MS = 300;

function formatPlaytime(seconds: number): string {
  if (seconds <= 0) return "nunca jogado";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min jogados`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h${remainder}min jogados` : `${hours}h jogados`;
}

/**
 * Estado de navegação da tela — M4 (docs/sprint-m-plano.md, decidido pelo
 * Douglas em 2026-08-07: "opção (a)"): mora em `App.tsx`, não aqui dentro.
 * Antes, `AllGamesScreen` guardava `page`/`search`/`platformFilter` em
 * `useState` próprio — abrir um jogo desmontava a tela (App.tsx troca de
 * `phase` num `switch`) e voltar remontava do zero, perdendo tudo. Subir
 * este pedaço de estado para o componente pai, que nunca desmonta, resolve
 * sem precisar manter duas telas montadas ao mesmo tempo (a outra opção
 * cogitada, descartada por manter complexidade extra por menos ganho).
 */
export interface AllGamesViewState {
  page: number;
  search: string;
  platformFilter: string | null;
  favoriteOnly: boolean;
}

export const DEFAULT_ALL_GAMES_VIEW: AllGamesViewState = {
  page: 1,
  search: "",
  platformFilter: null,
  favoriteOnly: false,
};

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
 * cliente para o servidor (`?platform=<console_id>`, combinado com
 * paginação) — antes ele rodava só sobre os jogos da página carregada, e o
 * próprio conjunto de opções mudava ao virar de página (bug real, descrito
 * no roadmap). `consoles` na resposta agora é o conjunto completo
 * (respeitando busca/favoritos, não a plataforma escolhida), calculado no
 * servidor antes de paginar.
 *
 * Deliberadamente mais simples que GamesScreen (por console): sem instalar
 * emulador inline, sem confirmação de BIOS vazio — essa profundidade
 * continua só na tela por console. Aqui o objetivo é achar e abrir rápido;
 * se o emulador não estiver pronto, o erro (via ErrorModal) já diz o que
 * fazer.
 */
export function AllGamesScreen({
  report,
  onOpenLibrary,
  onOpenGame,
  view,
  onViewChange,
}: {
  report: Report;
  onOpenLibrary: () => void;
  onOpenGame: (game: LibraryGame, consoleName: string, shortName: string) => void;
  /** Página/busca/filtro atuais — controlados por App.tsx (M4). */
  view: AllGamesViewState;
  /** Patch parcial — só os campos que mudaram, como o `setState` de objeto. */
  onViewChange: (patch: Partial<AllGamesViewState>) => void;
}) {
  const { page, search, platformFilter, favoriteOnly } = view;
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

  function loadGames() {
    api
      .getAllLibraryGames(page, PAGE_SIZE, debouncedSearch || undefined, favoriteOnly, platformFilter ?? undefined)
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

  useEffect(loadGames, [page, debouncedSearch, favoriteOnly, platformFilter]);

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

  // Chips ordenados por rótulo visível (não por console_id cru) — só um
  // detalhe de leitura, o servidor já manda a lista deduplicada.
  const platformOptions = consoles
    .map((id) => ({ id, label: shortNameFor(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-10">
      {launchError && (
        <ErrorModal
          title="Não foi possível abrir o jogo"
          message={launchError}
          onClose={clearLaunchError}
          onRetry={retryLaunch}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-ink">Todos os jogos</h1>
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

      {error && <p className="text-base text-danger">{error}</p>}

      {games && games.length === 0 && (
        <p className="text-base text-muted">
          {debouncedSearch
            ? `Nenhum jogo encontrado para "${debouncedSearch}".`
            : platformFilter
              ? `Nenhum jogo de ${shortNameFor(platformFilter)} nesta busca.`
              : favoriteOnly
                ? "Nenhum jogo favoritado ainda."
                : 'Nenhum jogo na biblioteca ainda. Aponte uma pasta em "Gerenciar pastas" para começar.'}
        </p>
      )}

      {games && games.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
            {games.map((game) => {
              const consoleName = report.verdicts.find((v) => v.console_id === game.console_id)?.name ?? game.console_id;
              // Sem botão "Jogar" separado (M1) não há mais onde mostrar
              // "lançando…" como texto — mas continua valendo não deixar
              // relançar por cima de um lançamento em andamento.
              const launching = statusFor(game.id).kind === "launching";
              return (
                <div key={game.id} className="flex flex-col gap-2">
                  <div className="relative">
                    {/*
                     * M1 (docs/sprint-m-plano.md): deixou de ser <button> —
                     * o overlay ▶ agora é um <button> real dentro de
                     * GameCover (botão dentro de botão é HTML inválido).
                     * `role="button"` + `tabIndex`/`onKeyDown` repõem a
                     * semântica e o alcance por teclado que o <button>
                     * dava de graça. Continua sendo o único alvo alcançável
                     * por Tab/D-pad do tile: quem navega por teclado/
                     * controle abre o detalhe por aqui e lança de lá (o
                     * overlay some da sequência via tabIndex={-1}, ver
                     * comentário em GameCover) — é o que sustenta "1
                     * movimento por fileira" do critério de aceite do item.
                     * "group" continua aqui: é quem o `group-hover`/
                     * `group-focus-visible` do overlay e do glow de borda
                     * (M2) enxergam.
                     */}
                    <div
                      role="button"
                      tabIndex={0}
                      className={`group block w-full cursor-pointer rounded text-left ${FOCUS_RING}`}
                      title={game.title}
                      aria-label={`Ver detalhes de ${game.title}`}
                      onClick={() => onOpenGame(game, consoleName, shortNameFor(game.console_id))}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        onOpenGame(game, consoleName, shortNameFor(game.console_id));
                      }}
                    >
                      <GameCover
                        label={shortNameFor(game.console_id)}
                        title={game.title}
                        consoleId={game.console_id}
                        coverUrl={coverImageURL(game.cover_url)}
                        showPlayOverlay
                        onPlay={game.missing || launching ? undefined : () => launch(game)}
                      />
                    </div>
                    <FavoriteToggle
                      favorite={game.favorite}
                      onToggle={() => toggleFavorite(game)}
                      className="absolute top-1.5 right-1.5"
                    />
                  </div>
                  <div className="min-w-0">
                    {/* M7: line-clamp-2 (não mais truncate de 1 linha) — com
                        capa real, este é o único título do tile (GameCover
                        não desenha mais o dele por cima da arte). */}
                    <p className="line-clamp-2 text-sm font-semibold text-ink" title={game.title}>
                      {game.title}
                    </p>
                    <p className="text-xs text-muted">{formatPlaytime(game.playtime_seconds)}</p>
                    {game.missing && (
                      <div className="mt-1">
                        <Badge>arquivo ausente</Badge>
                      </div>
                    )}
                  </div>
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
