import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { LibraryGame } from "../api/types";
import { Badge, Button, Card, ErrorModal, GameCover } from "../components/ui";
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
        <div className="w-full max-w-[220px]">
          <GameCover label={shortName} consoleId={game.console_id} size="lg" />
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
