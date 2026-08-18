import type { LibraryGame } from "../api/types";
import type { GameLaunchability } from "../lib/gameLaunchability";
import { formatPlaytime } from "../lib/format";
import { Badge, FavoriteToggle, FOCUS_RING, PlayIcon } from "./ui";

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
 *
 * `launchability`/`onInstall` (M8, docs/sprint-m-plano.md, 2026-08-07):
 * mesmo par de props que `GameTile` ganhou — substitui o badge fixo
 * "arquivo ausente" (só cobria um dos quatro motivos possíveis) pelo mesmo
 * badge curto/clicável das duas telas.
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
}) {
  const blocked = launchability !== undefined && !launchability.launchable;

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
        {blocked &&
          (launchability!.reason === "not_installed" && onInstall ? (
            <button
              type="button"
              title={launchability!.title}
              onClick={(e) => {
                // Não deixa o clique borbulhar pra linha (que abriria o
                // detalhe) — este botão tem a própria ação.
                e.stopPropagation();
                onInstall();
              }}
              className={`inline-block shrink-0 rounded-sm border border-line-strong px-1.5 py-0.5 font-mono text-xs tracking-wide text-muted underline decoration-dotted transition-colors hover:text-ink ${FOCUS_RING}`}
            >
              {launchability!.badge}
            </button>
          ) : (
            <span className="shrink-0">
              <Badge title={launchability!.title}>{launchability!.badge}</Badge>
            </span>
          ))}
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
          <PlayIcon size={12} className="translate-x-0.5" />
        </button>
      ) : (
        // Espaço reservado (mesmo tamanho do botão) — sem isto, linhas sem
        // ação de jogar (arquivo ausente) desalinhariam a coluna do ▶.
        <span className="h-7 w-7 shrink-0" aria-hidden="true" />
      )}
    </div>
  );
}
