import { useEffect, useState } from "react";
import { api, ApiError, coverImageURL } from "../api";
import type { ConsoleEntry, LibraryGame, Report } from "../api/types";
import {
  Button,
  Card,
  CardSkeleton,
  EmptyState,
  FOCUS_RING,
  GameCover,
  InlineError,
  ScreenAtmosphere,
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
  onOpenLibrary,
}: {
  /** Ausente sem consentimento/scan — só serve de fonte de nome de console
   * (preferida quando existe), a tela funciona igual sem ele. */
  report?: Report;
  consoleCatalog: ConsoleEntry[];
  onOpenGame: (game: LibraryGame, consoleName: string, shortName: string) => void;
  /** Leva a "Todos os jogos" a partir do estado vazio ("nada jogado ainda"). */
  onOpenLibrary: () => void;
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

  // Maior tempo do ranking — a régua das barras proporcionais abaixo. O
  // ranking já vem ordenado, então é o primeiro.
  const maxSeconds = consoleTotals.length > 0 ? consoleTotals[0][1] : 0;

  return (
    <ScreenContainer variant="listing" className="relative">
      {/* Céu da tela (2026-09-10) — halo ancorado no topo do conteúdo. */}
      <ScreenAtmosphere />

      <ScreenHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button variant="chrome" onClick={onOpenLibrary}>
            {t("seeAllGames")}
          </Button>
        }
      />

      {error && <InlineError className="mb-4">{error}</InlineError>}

      {/* Carregando na FORMA FINAL (2026-09-10, achado do critico-design): o
          texto solto "Carregando o histórico…" fazia a tela pular de layout
          quando o dado chegava. Mesmo padrão de skeleton das outras telas —
          o painel de tempo e a fileira de capas já no lugar onde vão nascer.
          `role="status"`/`sr-only`: um anúncio só, não um por bloco. */}
      {loading && (
        <div className="flex flex-col gap-8">
          <span className="sr-only" role="status" aria-live="polite">
            {t("loading")}
          </span>
          <CardSkeleton className="h-52" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 6 }, (_, i) => (
              <CardSkeleton key={i} className="h-56 w-[150px] shrink-0" />
            ))}
          </div>
        </div>
      )}

      {nothingYet && (
        <EmptyState
          title={t("emptyTitle")}
          message={t("empty")}
          action={
            <Button variant="primary" onClick={onOpenLibrary}>
              {t("emptyAction")}
            </Button>
          }
        />
      )}

      {!loading && !nothingYet && (
        <div className="flex flex-col gap-8">
          {/* Inversão da ordem (2026-09-10): o tempo total abre a tela. A
              pergunta "quanto joguei?" tem uma resposta única e grande — é o
              que dá identidade a esta tela, do mesmo jeito que o hero dá à
              Home e o mostrador à de Consoles. "Onde eu parei" desce para
              depois, como prateleira. */}
          <section className="relative overflow-hidden rounded-lg">
            <Card filled className="relative overflow-hidden">
              {/* Textura local — mesmo vocabulário do `EmptyState`: halo roxo
                  a 12% e scanlines só sobre o painel, nunca sobre a tela
                  inteira. Decorativo, `aria-hidden`; o número por cima
                  continua em `--ink` puro. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(60% 90% at 15% 20%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%)",
                }}
              />
              <div aria-hidden="true" className="zeux-scanlines pointer-events-none absolute inset-0 opacity-40" />

              <div className="relative">
                <p className="font-mono text-xs tracking-wide text-muted uppercase">{t("totalPlaytime")}</p>
                {/* `font-pixel` a 22px: o mesmo piso de legibilidade que o
                    `ScreenHeader` usa (a Press Start 2P só lê bem acima
                    disso). `leading-relaxed` pela mesma razão de lá — a
                    altura-x maior aperta a entrelinha e corta descidas.
                    `tabular-nums` mantém o número estável enquanto o tempo
                    sobe de "58 min" para "1 h 02 min". */}
                <p className="mt-2 font-pixel text-2xl leading-relaxed tracking-[0.04em] text-ink tabular-nums">
                  {formatPlaytimeClean(totalSeconds)}
                </p>
              </div>

              {consoleTotals.length > 0 && (
                <div className="relative mt-5 border-t border-line pt-4">
                  <p className="mb-3 font-mono text-xs tracking-wide text-muted uppercase">
                    {t("byConsoleHeading")}
                  </p>
                  {/* Barra proporcional, não bolinha + frase (2026-09-10): a
                      bolinha de 10px só repetia a cor de identidade sem dizer
                      nada sobre a proporção — a pergunta real ("onde foi meu
                      tempo?") é comparativa. Cantos retos de propósito: é a
                      direção retrô, nada de `rounded-full`. `ProgressBar` não
                      serve aqui porque a cor é por console (`style`), não o
                      roxo fixo dele — e ensinar cor ao componente só por causa
                      desta tela seria a lógica errada no lugar errado. */}
                  <ul className="flex flex-col gap-3">
                    {consoleTotals.slice(0, TOP_CONSOLES).map(([consoleId, seconds]) => (
                      <li key={consoleId}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm text-ink">{nameFor(consoleId)}</span>
                          <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                            {formatPlaytimeClean(seconds)}
                          </span>
                        </div>
                        <div
                          className="mt-1 h-1.5 w-full overflow-hidden bg-panel"
                          role="img"
                          aria-label={t("playtimeOnConsole", {
                            time: formatPlaytimeClean(seconds),
                            console: nameFor(consoleId),
                          })}
                        >
                          <div
                            className="h-full"
                            style={{
                              width: `${maxSeconds > 0 ? (seconds / maxSeconds) * 100 : 0}%`,
                              background: consoleAccentColor(consoleId),
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </section>

          {recent && recent.length > 0 && (
            <section>
              <SectionHeading className="mb-3">{t("recentHeading")}</SectionHeading>
              {/* Fileira rolável, não grade (2026-09-10): mesmo vocabulário da
                  prateleira "Seus consoles" da Home — "onde eu parei" é um
                  resumo curto, e a biblioteca inteira ordenada por último
                  jogado já mora em "Todos os jogos" (o botão do cabeçalho).
                  `shrink-0` em cada item, senão o flex esmaga as capas em vez
                  de rolar. */}
              <div className="flex gap-4 overflow-x-auto pb-1">
                {recent.map((game) => {
                  const consoleName = nameFor(game.console_id);
                  const shortName = shortNameFor(game.console_id);
                  const lastPlayed = formatLastPlayedShort(game.last_played_at);
                  return (
                    <div
                      key={game.id}
                      role="button"
                      tabIndex={0}
                      className={`group flex w-[150px] shrink-0 cursor-pointer flex-col gap-2 rounded-lg text-left ${FOCUS_RING}`}
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
        </div>
      )}
    </ScreenContainer>
  );
}
