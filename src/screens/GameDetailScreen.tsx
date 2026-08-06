import { useEffect, useState } from "react";
import { api, ApiError, coverImageURL } from "../api";
import type { LibraryGame } from "../api/types";
import { Badge, Button, Card, ErrorModal, FavoriteToggle, GameCover } from "../components/ui";
import { useIGDBStatus } from "../hooks/useIGDBStatus";
import { useLaunchGame } from "../hooks/useLaunchGame";
import { consoleAccentColor } from "../lib/consoleColor";

function formatPlaytime(seconds: number): string {
  if (seconds <= 0) return "nunca jogado";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h${remainder}min` : `${hours}h`;
}

function formatLastPlayed(iso: string | undefined): string {
  if (!iso) return "nunca jogado";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "nunca jogado";
  return date.toLocaleString("pt-BR");
}

/**
 * Tela de Detalhe do jogo (Sprint 3 do plano de migração visual, 2026-08-04
 * — /home/douglas/.claude/plans/sleepy-roaming-pearl.md). Inspirada em
 * `layout/src/App.tsx` (`GameDetailView`), mas só com painéis de dado real:
 * hero + "Jogar" grande + estatísticas de sessão. Sem `CommunityPanel`
 * (fórum — depende de backend de nuvem que não existe, ver docs/roadmap.md
 * Sprint E) e sem save states/conquistas do mock (`MY_DATA.saves`/
 * `achievements` — sem contrapartida de backend, não inventados aqui).
 *
 * Estatísticas: `playtime_seconds`/`last_played_at` já vêm no `LibraryGame`
 * recebido (a mesma junção com sessões que `GET /library/games` já faz —
 * não precisa recalcular). A contagem de sessões é a única coisa que exige
 * uma chamada própria (`GET /sessions`, filtrando por `rom_path` — o
 * launcher não conhece a biblioteca, ver docs/arquitetura-a-preservar.md).
 */
export function GameDetailScreen({
  game,
  consoleName,
  shortName,
  year,
  onBack,
}: {
  game: LibraryGame;
  consoleName: string;
  shortName: string;
  /** Ano do console no catálogo — dado real (verdict.year), não inventado. */
  year?: number;
  onBack: () => void;
}) {
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { statusFor, launch, launchError, clearLaunchError } = useLaunchGame();
  const igdbConfigured = useIGDBStatus();
  // Estado próprio, não `game.cover_url` direto: o prop `game` vem de um
  // snapshot guardado no App.tsx no momento do clique e não muda sozinho
  // depois de uma busca de capa bem-sucedida nesta tela.
  const [coverUrl, setCoverUrl] = useState(game.cover_url);
  const [scrapingCover, setScrapingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  // Mesmo raciocínio de coverUrl: estado próprio, não game.favorite direto,
  // porque o snapshot em App.tsx não muda sozinho depois do toggle aqui.
  const [favorite, setFavorite] = useState(game.favorite);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  useEffect(() => {
    setCoverUrl(game.cover_url);
    setFavorite(game.favorite);
  }, [game.id, game.cover_url, game.favorite]);

  function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    setFavoriteError(null);
    const call = next ? api.favoriteGame(game.id) : api.unfavoriteGame(game.id);
    call.catch(() => {
      setFavorite(!next);
      setFavoriteError("Não foi possível salvar o favorito. Tente de novo.");
    });
  }

  function pollCoverJob(jobId: string) {
    api
      .getScrapeJob(jobId)
      .then((job) => {
        if (job.phase === "concluido") {
          setScrapingCover(false);
          const result = job.results[0];
          if (result?.status === "error") {
            setCoverError(result.message ?? "Não foi possível buscar a capa deste jogo.");
          } else if (result?.status === "not_found") {
            setCoverError("O IGDB não tem capa para este jogo.");
          } else {
            // Encontrada: recarrega este jogo para pegar o cover_url novo —
            // a rota de busca não devolve o caminho da capa, só o status.
            api
              .getLibraryGames(game.console_id)
              .then((res) => {
                const updated = res.games.find((g) => g.id === game.id);
                if (updated) setCoverUrl(updated.cover_url);
              })
              .catch(() => {});
          }
          return;
        }
        if (job.phase === "falhou") {
          setScrapingCover(false);
          setCoverError(job.error ?? "Não foi possível buscar a capa agora.");
          return;
        }
        setTimeout(() => pollCoverJob(jobId), 400);
      })
      .catch((err) => {
        setScrapingCover(false);
        setCoverError(err instanceof ApiError ? err.message : "Não foi possível acompanhar a busca de capa.");
      });
  }

  function handleScrapeCover() {
    setCoverError(null);
    setScrapingCover(true);
    api
      .scrapeCovers(game.id)
      .then((job) => pollCoverJob(job.id))
      .catch((err) => {
        setScrapingCover(false);
        setCoverError(err instanceof ApiError ? err.message : "Não foi possível iniciar a busca de capa.");
      });
  }

  useEffect(() => {
    api
      .getSessions()
      .then((res) => {
        setSessionCount(res.sessions.filter((s) => s.rom_path === game.path).length);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível ler as sessões."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.path]);

  const status = statusFor(game.id);

  return (
    <div className="mx-auto max-w-4xl px-6 pt-16 pb-10">
      {launchError && <ErrorModal title="Não foi possível abrir o jogo" message={launchError} onClose={clearLaunchError} />}

      <Button variant="secondary" onClick={onBack} className="mb-4">
        Voltar
      </Button>

      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="relative w-full max-w-[220px]">
          <GameCover label={shortName} consoleId={game.console_id} coverUrl={coverImageURL(coverUrl)} size="lg" />
          <FavoriteToggle favorite={favorite} onToggle={toggleFavorite} className="absolute top-1.5 right-1.5" />
          {favoriteError && <p className="mt-1 text-xs text-danger">{favoriteError}</p>}
          {igdbConfigured && (
            <div className="mt-2">
              <Button variant="secondary" disabled={scrapingCover} onClick={handleScrapeCover} className="w-full text-xs">
                {scrapingCover ? "Buscando…" : coverUrl ? "Buscar capa de novo" : "Buscar capa"}
              </Button>
              {coverError && <p className="mt-1 text-xs text-danger">{coverError}</p>}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{game.title}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge accentColor={consoleAccentColor(game.console_id)}>{consoleName}</Badge>
              {year !== undefined && <Badge>{year}</Badge>}
              {game.missing && <Badge>arquivo ausente</Badge>}
            </div>
          </div>

          <Button
            variant="primary"
            disabled={game.missing || status.kind === "launching"}
            onClick={() => launch(game)}
            className="w-fit px-8 py-3 text-lg"
          >
            {status.kind === "error" ? "Tentar de novo" : "▶ Jogar"}
          </Button>

          {game.missing && (
            <p className="text-sm text-danger">
              O arquivo deste jogo não foi encontrado na última varredura da pasta.
            </p>
          )}
        </div>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-pixel text-[11px] tracking-wide text-muted uppercase">Suas estatísticas</h2>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted">Tempo jogado</p>
            <p className="text-lg text-ink">{formatPlaytime(game.playtime_seconds)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Última vez</p>
            <p className="text-lg text-ink">{formatLastPlayed(game.last_played_at)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Sessões</p>
            <p className="text-lg text-ink">{sessionCount === null ? "…" : sessionCount}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
