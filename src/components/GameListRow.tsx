import type { LibraryGame } from "../api/types";
import { formatPlaytime } from "../lib/format";
import { Badge, FavoriteToggle, FOCUS_RING } from "./ui";

/**
 * Linha do modo lista (M3, docs/sprint-m-plano.md) — alternativa densa à
 * grade de capas, pensada para quando a maior parte do acervo ainda não tem
 * capa real (o placeholder de sigla vira mosaico repetitivo, pior de ler
 * que texto). Conteúdo fixado pelo critério do item: título, plataforma com
 * a cor do console, tempo jogado e a ação de jogar — sem capa, sem badge
 * grande, para caber a densidade pedida (12 linhas em 1280×800).
 *
 * Mesmo par de alvos focáveis que `GameCover` (M1): a linha inteira (menos
 * o botão de jogar e a estrela) abre o detalhe; o ▶ tem `tabIndex={-1}` —
 * mouse e leitor de tela em modo de navegação por elementos alcançam,
 * Tab/D-pad não, pelo mesmo motivo documentado em `GameCover`.
 */
export function GameListRow({
  game,
  consoleShortName,
  accentColor,
  onOpenDetail,
  onPlay,
  onToggleFavorite,
}: {
  game: LibraryGame;
  consoleShortName: string;
  accentColor?: string;
  onOpenDetail: () => void;
  /** Ausente (jogo `missing` ou lançamento em andamento) esconde o botão de jogar — mesma regra do M1. */
  onPlay?: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="flex h-full items-center gap-3 border-b border-line px-2">
      <div
        role="button"
        tabIndex={0}
        className={`flex min-w-0 flex-1 items-center gap-3 rounded px-1 py-1 text-left ${FOCUS_RING}`}
        title={game.title}
        aria-label={`Ver detalhes de ${game.title}`}
        onClick={onOpenDetail}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          onOpenDetail();
        }}
      >
        <span className="shrink-0">
          <Badge accentColor={accentColor}>{consoleShortName}</Badge>
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{game.title}</span>
        {game.missing && (
          <span className="shrink-0">
            <Badge>arquivo ausente</Badge>
          </span>
        )}
        <span className="shrink-0 font-mono text-xs text-muted">{formatPlaytime(game.playtime_seconds)}</span>
      </div>
      <FavoriteToggle favorite={game.favorite} onToggle={onToggleFavorite} className="shrink-0" />
      {onPlay ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Jogar ${game.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-accent text-accent transition-colors hover:bg-accent/10 ${FOCUS_RING}`}
        >
          <svg width="10" height="12" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true">
            <path d="M0 0 L14 8 L0 16 Z" />
          </svg>
        </button>
      ) : (
        // Espaço reservado (mesmo tamanho do botão) — sem isto, linhas sem
        // ação de jogar (arquivo ausente) desalinhariam a coluna do ▶.
        <span className="h-7 w-7 shrink-0" aria-hidden="true" />
      )}
    </div>
  );
}
