import type { LibraryGame } from "../api/types";
import { coverImageURL } from "../api";
import type { GameLaunchability } from "../lib/gameLaunchability";
import { formatLastPlayedShort, formatPlaytime } from "../lib/format";
import { useT } from "../i18n/i18n";
import { dict } from "./GameListRow.i18n";
import { Badge, FavoriteToggle, FOCUS_RING, PlayIcon } from "./ui";

/**
 * Linha do modo lista (M3, docs/sprint-m-plano.md) — alternativa densa à
 * grade de capas, pensada para quando a maior parte do acervo ainda não tem
 * capa real (o placeholder de sigla vira mosaico repetitivo, pior de ler que
 * texto).
 *
 * Redesenho retrô (2026-09-09, achado 5 do critico-layout): o modo lista
 * existe justamente para quando FALTA capa — então mostra MAIS metadado, não
 * menos. Miniatura de capa 32×42 à esquerda e colunas alinhadas de verdade
 * (`grid-cols-[40px_minmax(0,1fr)_120px_84px_auto]`: capa, título, última
 * sessão, tempo, ações) em vez de um `flex` onde cada linha alinhava sozinha.
 *
 * Mesmo par de alvos focáveis que `GameCover` (M1): um botão-overlay
 * `absolute inset-0` abre o detalhe (fora do fluxo do grid, não ocupa
 * trilha); a estrela e o ▶ ficam por cima (`z-10`). O ▶ tem `tabIndex={-1}` —
 * mouse e leitor de tela alcançam, Tab/D-pad não.
 */
export function GameListRow({
  game,
  consoleShortName,
  accentColor,
  onOpenDetail,
  onPlay,
  onToggleFavorite,
  launchability,
  onInstall,
  gamepadStart = false,
}: {
  game: LibraryGame;
  consoleShortName: string;
  accentColor?: string;
  onOpenDetail: () => void;
  /** Ausente (jogo `missing` ou lançamento em andamento) esconde o botão de jogar — mesma regra do M1. */
  onPlay?: () => void;
  onToggleFavorite: () => void;
  /** Ausente = tela não carregou dado o bastante para avaliar — linha aparece sem badge, nunca com um palpite. */
  launchability?: GameLaunchability;
  /** Só relevante quando `launchability.reason === "not_installed"` — dispara a instalação inline (L8) a partir do badge. */
  onInstall?: () => void;
  /** Marca esta linha como o pouso do cursor de controle (`data-gamepad-start`). */
  gamepadStart?: boolean;
}) {
  const t = useT(dict);
  const blocked = launchability !== undefined && !launchability.launchable;
  const cover = coverImageURL(game.cover_url);
  const lastPlayed = formatLastPlayedShort(game.last_played_at);

  return (
    // A11y 1.4.11: `border-control-border` (≥3:1) — no modo lista esta borda
    // inferior é o único separador entre um jogo e o seguinte.
    <div className="group relative grid h-full grid-cols-[40px_minmax(0,1fr)_120px_84px_auto] items-center gap-3 border-b border-control-border px-2">
      {/* Overlay clicável — `absolute`, então some do fluxo do grid e não
          consome uma trilha. Botão nativo: Enter/Espaço funcionam sem
          `onKeyDown` manual. */}
      <button
        type="button"
        {...(gamepadStart ? { "data-gamepad-start": "" } : {})}
        onClick={onOpenDetail}
        aria-label={
          blocked && launchability
            ? `Ver detalhes de ${game.title} — ${launchability.title}`
            : t("seeDetails", { title: game.title })
        }
        className={`absolute inset-0 rounded-lg transition-colors group-hover:bg-fill ${FOCUS_RING}`}
      />

      {/* Miniatura 32×42. Sem capa: quadro com a grade de pixels da marca +
          sigla — nunca um retângulo cinza chapado. */}
      <span
        className="pointer-events-none relative flex h-[42px] w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line-strong bg-fill"
        style={accentColor ? { borderColor: `${accentColor}66` } : undefined}
      >
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <>
            <span aria-hidden="true" className="zeux-pixel-grid absolute inset-0" />
            <span className="relative font-pixel text-[8px] leading-none text-muted">{consoleShortName}</span>
          </>
        )}
      </span>

      <span className="pointer-events-none flex min-w-0 items-center gap-2">
        <Badge accentColor={accentColor}>{consoleShortName}</Badge>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{game.title}</span>
      </span>

      <span className="pointer-events-none truncate font-mono text-xs tabular-nums text-muted">
        {lastPlayed ?? "—"}
      </span>

      <span className="pointer-events-none truncate font-mono text-xs tabular-nums text-muted">
        {formatPlaytime(game.playtime_seconds)}
      </span>

      <div className="relative z-10 flex shrink-0 items-center gap-2">
        {blocked &&
          (launchability!.reason === "not_installed" && onInstall ? (
            <button
              type="button"
              title={launchability!.title}
              onClick={onInstall}
              className={`inline-block shrink-0 rounded-sm border border-accent/70 bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-accent-hover transition-colors hover:border-accent hover:bg-accent/20 ${FOCUS_RING}`}
            >
              {launchability!.badge}
            </button>
          ) : (
            <Badge title={launchability!.title}>{launchability!.badge}</Badge>
          ))}
        <FavoriteToggle favorite={game.favorite} onToggle={onToggleFavorite} />
        {onPlay ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={t("playGame", { title: game.title })}
            onClick={onPlay}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-accent text-accent transition-colors hover:bg-accent/10 ${FOCUS_RING}`}
          >
            <PlayIcon size={12} className="translate-x-0.5" />
          </button>
        ) : (
          <span className="h-7 w-7 shrink-0" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
