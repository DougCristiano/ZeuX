import { useEffect, useState } from "react";
import { api, ApiError, coverImageURL } from "../api";
import type { LibraryGame, Report, ScrapeJob } from "../api/types";
import { Badge, Button, ErrorModal, FavoriteToggle, FOCUS_RING, GameCover, Pagination } from "../components/ui";
import { useIGDBStatus } from "../hooks/useIGDBStatus";
import { useLaunchGame } from "../hooks/useLaunchGame";

const PAGE_SIZE = 24;
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
 * Tela "Todos os jogos" (2026-08-04, a pedido do Douglas): landing page
 * depois do parecer, junta jogos de qualquer console numa lista só, sem
 * precisar escolher o console primeiro — "clicar direto e começar a jogar".
 * Paginada (não scroll infinito), com page_size fixo — GET /library/games
 * sem console_id (ver internal/api/server.go, handleListLibraryGames).
 *
 * Sprint 2 do plano de migração visual (2026-08-04 —
 * /home/douglas/.claude/plans/sleepy-roaming-pearl.md): busca por título
 * (`?q=` no backend — acha o jogo em qualquer página, não só na carregada)
 * e filtro por plataforma. O filtro de plataforma é client-side, sobre os
 * jogos já carregados na página atual — não existe rota para "todas as
 * plataformas com jogo" no acervo inteiro, então os chips refletem só o que
 * está visível. Aceitável para o tamanho de biblioteca esperado; documentado
 * aqui para não parecer um bug se alguém notar que um console some do filtro
 * ao trocar de página.
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
}: {
  report: Report;
  onOpenLibrary: () => void;
  onOpenGame: (game: LibraryGame, consoleName: string, shortName: string) => void;
}) {
  const [games, setGames] = useState<LibraryGame[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { statusFor, launch, launchError, clearLaunchError } = useLaunchGame();
  const igdbConfigured = useIGDBStatus();
  const [scrapeJob, setScrapeJob] = useState<ScrapeJob | null>(null);
  const [scrapeSummary, setScrapeSummary] = useState<string | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Buscar (ou trocar o filtro de favoritos) reseta pra página 1 — senão
  // "página 3" de um filtro novo quase sempre estaria vazia.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, favoriteOnly]);

  function loadGames() {
    // Reseta o filtro de plataforma a cada nova página/busca — ele é
    // calculado sobre os jogos da página atual (ver docstring da tela), um
    // valor de outra página pode não existir mais na nova lista.
    setPlatformFilter(null);
    api
      .getAllLibraryGames(page, PAGE_SIZE, debouncedSearch || undefined, favoriteOnly)
      .then((res) => {
        setGames(res.games);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível listar os jogos."));
  }

  useEffect(loadGames, [page, debouncedSearch, favoriteOnly]);

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

  // Plataformas presentes na página atual, não no acervo inteiro (ver
  // docstring da tela) — ordenadas pra não pular de posição a cada
  // recarregamento.
  const platformsOnPage = Array.from(new Set((games ?? []).map((g) => shortNameFor(g.console_id)))).sort();
  const visibleGames = platformFilter ? (games ?? []).filter((g) => shortNameFor(g.console_id) === platformFilter) : games;

  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-10">
      {launchError && <ErrorModal title="Não foi possível abrir o jogo" message={launchError} onClose={clearLaunchError} />}

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
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar jogos…"
          className="w-full max-w-xs rounded border border-line bg-fill px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <button
          type="button"
          onClick={() => setFavoriteOnly((v) => !v)}
          aria-pressed={favoriteOnly}
          className={`rounded-sm border px-2.5 py-1 font-pixel text-[11px] transition-colors ${FOCUS_RING} ${
            favoriteOnly ? "border-amber text-amber" : "border-line-strong text-muted hover:text-ink"
          }`}
        >
          ★ FAVORITOS
        </button>
        {platformsOnPage.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setPlatformFilter(null)}
              className={`rounded-sm border px-2.5 py-1 font-pixel text-[11px] transition-colors ${FOCUS_RING} ${
                platformFilter === null ? "border-accent text-accent" : "border-line-strong text-muted hover:text-ink"
              }`}
            >
              TODOS
            </button>
            {platformsOnPage.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatformFilter(p)}
                className={`rounded-sm border px-2.5 py-1 font-pixel text-[11px] transition-colors ${FOCUS_RING} ${
                  platformFilter === p ? "border-accent text-accent" : "border-line-strong text-muted hover:text-ink"
                }`}
              >
                {p.toUpperCase()}
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
            : favoriteOnly
              ? "Nenhum jogo favoritado ainda."
              : 'Nenhum jogo na biblioteca ainda. Aponte uma pasta em "Gerenciar pastas" para começar.'}
        </p>
      )}

      {visibleGames && visibleGames.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
            {visibleGames.map((game) => {
              const status = statusFor(game.id);
              const consoleName = report.verdicts.find((v) => v.console_id === game.console_id)?.name ?? game.console_id;
              return (
                <div key={game.id} className="flex flex-col gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      // "group" também aqui, não só no <div> interno do
                      // GameCover (J4, docs/roadmap.md): quem recebe foco de
                      // teclado é este botão, não a div — sem isto,
                      // `group-focus-visible` no overlay de "Jogar" nunca
                      // via, só `group-hover` (o mouse funciona "de graça"
                      // porque a div preenche o botão inteiro e :hover
                      // cobre os dois; :focus-visible não cascata assim).
                      className="group block w-full text-left"
                      title={game.title}
                      onClick={() => onOpenGame(game, consoleName, shortNameFor(game.console_id))}
                    >
                      <GameCover
                        label={shortNameFor(game.console_id)}
                        title={game.title}
                        consoleId={game.console_id}
                        coverUrl={coverImageURL(game.cover_url)}
                        showPlayOverlay
                      />
                    </button>
                    <FavoriteToggle
                      favorite={game.favorite}
                      onToggle={() => toggleFavorite(game)}
                      className="absolute top-1.5 right-1.5"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink" title={game.title}>
                      {game.title}
                    </p>
                    <p className="text-xs text-muted">{formatPlaytime(game.playtime_seconds)}</p>
                    {game.missing && (
                      <div className="mt-1">
                        <Badge>arquivo ausente</Badge>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    disabled={game.missing || status.kind === "launching"}
                    onClick={() => launch(game)}
                  >
                    {status.kind === "error" ? "Tentar de novo" : "Jogar"}
                  </Button>
                </div>
              );
            })}
          </div>

          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {games && games.length > 0 && visibleGames && visibleGames.length === 0 && (
        <p className="text-base text-muted">Nenhum jogo de {platformFilter} nesta página.</p>
      )}
    </div>
  );
}
