import { useEffect, useState } from "react";
import { api, ApiError, coverImageURL } from "../api";
import type { ConsoleEntry, LibraryGame, Report } from "../api/types";
import {
  Card,
  EmptyState,
  FOCUS_RING,
  GameCover,
  InlineError,
  ScreenContainer,
  ScreenHeader,
  SectionHeading,
} from "../components/ui";
import { consoleAccentColor } from "../lib/consoleColor";
import { formatLastPlayedShort, formatPlaytimeClean } from "../lib/format";
import { useT } from "../i18n/i18n";
import { dict } from "./HistoryScreen.i18n";

// Quantos jogos recentes a faixa mostra. Não é paginado: "onde eu parei?" é
// uma resposta curta — a biblioteca inteira ordenada por último jogado já
// mora em "Todos os jogos".
const RECENT_LIMIT = 12;
// Quantos consoles entram no ranking de tempo. O resto continua somado no
// "Tempo total" — a lista existe para mostrar onde o tempo foi, não para
// enumerar os 33 do catálogo.
const TOP_CONSOLES = 6;

/**
 * Tela de Histórico / estatísticas (pendência atendida em 2026-09-09).
 *
 * Responde duas perguntas sem sair da tela: "onde eu parei?" (faixa de
 * jogados recentemente, cada um abre o detalhe) e "quanto joguei?" (tempo
 * total e por console). Todo o dado já é agregado pelo back — `GET /sessions`
 * devolve `playtime_seconds` por console, e `GET /library/games?played=true`
 * já vem ordenado por último jogado; nada de endpoint novo.
 *
 * Texto sempre descritivo, nunca julgador (princípio 2 do CLAUDE.md): "3 h
 * 20 min em PlayStation 2", nunca "você só jogou 3 h".
 *
 * Sem rede / sem sessão nenhuma: a tela não quebra — cai no `EmptyState`
 * dizendo que o histórico aparece depois do primeiro jogo aberto.
 */
export function HistoryScreen({
  report,
  consoleCatalog,
  onOpenGame,
}: {
  /** Ausente sem consentimento/scan — só serve de fonte de nome de console
   * (preferida quando existe), a tela funciona igual sem ele. */
  report?: Report;
  consoleCatalog: ConsoleEntry[];
  onOpenGame: (game: LibraryGame, consoleName: string, shortName: string) => void;
}) {
  const t = useT(dict);
  const [recent, setRecent] = useState<LibraryGame[] | null>(null);
  const [playtimeByConsole, setPlaytimeByConsole] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getAllLibraryGames(1, RECENT_LIMIT, { playedOnly: true }), api.getSessions()])
      .then(([games, sessions]) => {
        if (cancelled) return;
        setRecent(games.games.filter((g) => g.playtime_seconds > 0));
        setPlaytimeByConsole(sessions.playtime_seconds);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : t("loadError"));
        setRecent([]);
        setPlaytimeByConsole({});
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function nameFor(consoleId: string): string {
    return (
      report?.verdicts.find((v) => v.console_id === consoleId)?.name ??
      consoleCatalog.find((c) => c.console_id === consoleId)?.name ??
      consoleId
    );
  }
  function shortNameFor(consoleId: string): string {
    return (
      report?.verdicts.find((v) => v.console_id === consoleId)?.short_name ??
      consoleCatalog.find((c) => c.console_id === consoleId)?.short_name ??
      consoleId
    );
  }

  const loading = recent === null || playtimeByConsole === null;

  const consoleTotals = playtimeByConsole
    ? Object.entries(playtimeByConsole)
        .filter(([, seconds]) => seconds > 0)
        .sort((a, b) => b[1] - a[1])
    : [];
  const totalSeconds = consoleTotals.reduce((sum, [, seconds]) => sum + seconds, 0);

  const nothingYet = !loading && (recent?.length ?? 0) === 0 && totalSeconds === 0;

  return (
    <ScreenContainer variant="listing">
      <ScreenHeader title={t("title")} subtitle={t("subtitle")} />

      {error && <InlineError className="mb-4">{error}</InlineError>}

      {loading && (
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {t("loading")}
        </p>
      )}

      {nothingYet && <EmptyState message={t("empty")} />}

      {!loading && !nothingYet && (
        <div className="flex flex-col gap-8">
          {recent && recent.length > 0 && (
            <section>
              <SectionHeading className="mb-3">{t("recentHeading")}</SectionHeading>
              {/* Mesmos breakpoints da grade de "Todos os jogos", descontando
                  a sidebar de 64px (CLAUDE.md, layout responsivo): `lg` (não
                  `xl`) é o degrau que dispara de verdade no tamanho padrão da
                  janela. */}
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {recent.map((game) => {
                  const consoleName = nameFor(game.console_id);
                  const shortName = shortNameFor(game.console_id);
                  const lastPlayed = formatLastPlayedShort(game.last_played_at);
                  return (
                    <div
                      key={game.id}
                      role="button"
                      tabIndex={0}
                      className={`group flex cursor-pointer flex-col gap-2 rounded-lg text-left ${FOCUS_RING}`}
                      aria-label={t("playedOn", { console: consoleName, date: lastPlayed ?? "—" })}
                      onClick={() => onOpenGame(game, consoleName, shortName)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        onOpenGame(game, consoleName, shortName);
                      }}
                    >
                      <GameCover
                        label={shortName}
                        title={game.title}
                        consoleId={game.console_id}
                        coverUrl={coverImageURL(game.cover_url)}
                      />
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-ink" title={game.title}>
                          {game.title}
                        </p>
                        <p className="text-xs text-muted">
                          {lastPlayed
                            ? t("playedOn", { console: shortName, date: lastPlayed })
                            : shortName}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <SectionHeading className="mb-3">{t("playtimeHeading")}</SectionHeading>
            <Card filled>
              <div>
                <p className="font-mono text-xs tracking-wide text-muted uppercase">{t("totalPlaytime")}</p>
                <p className="mt-0.5 font-mono text-2xl text-ink">{formatPlaytimeClean(totalSeconds)}</p>
              </div>
              {consoleTotals.length > 0 && (
                <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
                  {consoleTotals.slice(0, TOP_CONSOLES).map(([consoleId, seconds]) => (
                    <li key={consoleId} className="flex items-center gap-2 text-sm text-ink">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: consoleAccentColor(consoleId) }}
                      />
                      {t("playtimeOnConsole", {
                        time: formatPlaytimeClean(seconds),
                        console: nameFor(consoleId),
                      })}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>
      )}
    </ScreenContainer>
  );
}
