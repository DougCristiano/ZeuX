import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { LibraryGame, Report } from "../api/types";
import { Badge, Button, ErrorModal, GameCover, Pagination } from "../components/ui";
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
  const [error, setError] = useState<string | null>(null);
  const { statusFor, launch, launchError, clearLaunchError } = useLaunchGame();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Buscar reseta pra página 1 — senão "página 3" de uma busca nova quase
  // sempre estaria vazia.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    // Reseta o filtro de plataforma a cada nova página/busca — ele é
    // calculado sobre os jogos da página atual (ver docstring da tela), um
    // valor de outra página pode não existir mais na nova lista.
    setPlatformFilter(null);
    api
      .getAllLibraryGames(page, PAGE_SIZE, debouncedSearch || undefined)
      .then((res) => {
        setGames(res.games);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível listar os jogos."));
  }, [page, debouncedSearch]);

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
        {/* Navegação de topo (Emuladores/Parecer) mudou para a sidebar
            (2026-08-04, Sprint 1) — "Gerenciar pastas" continua aqui porque é
            sub-navegação da própria Biblioteca, não um destino de primeiro
            nível. */}
        <Button variant="secondary" onClick={onOpenLibrary}>
          Gerenciar pastas
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar jogos..."
          className="w-full max-w-xs rounded border border-line bg-fill px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        {platformsOnPage.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setPlatformFilter(null)}
              className={`rounded-sm border px-2.5 py-1 font-pixel text-[11px] transition-colors ${
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
                className={`rounded-sm border px-2.5 py-1 font-pixel text-[11px] transition-colors ${
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
                  <button
                    type="button"
                    className="text-left"
                    title={game.title}
                    onClick={() => onOpenGame(game, consoleName, shortNameFor(game.console_id))}
                  >
                    <GameCover label={shortNameFor(game.console_id)} showPlayOverlay />
                  </button>
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
