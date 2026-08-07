import type { LibraryGame } from "../api/types";
import { coverImageURL } from "../api";
import { formatPlaytime } from "../lib/format";
import { Badge, FavoriteToggle, FOCUS_RING, GameCover } from "./ui";

/**
 * Célula de jogo — M5 (docs/sprint-m-plano.md): componente único entre
 * `AllGamesScreen` e `GamesScreen`, que antes desenhavam o mesmo jogo de
 * dois jeitos (capa 3/4 com badge/cor/favorito numa, quadrado 64×64
 * `font-mono` sem capa nem favorito na outra). Extraído literal do que
 * `AllGamesScreen` já tinha — `GamesScreen` é quem ganha o upgrade.
 *
 * O que fica **fora** deste componente, de propósito, porque é exclusivo de
 * `GamesScreen` (cabeçalho de parecer/BIOS, instalação inline do L8,
 * confirmação de BIOS vazio): esses blocos continuam vivendo como irmãos do
 * tile, renderizados por quem chama, não aqui dentro.
 *
 * `onPlay` é genérico de propósito — quem chama decide o que "jogar"
 * significa: `AllGamesScreen` passa um `launch()` simples (autoconfigurado);
 * `GamesScreen` passa `handlePlay()`, que primeiro confere emulador
 * instalado/BIOS antes de lançar. O tile não sabe a diferença, só expõe o
 * mesmo gatilho visual (overlay ▶) e o mesmo comportamento de foco (M1):
 * o wrapper é o único alvo alcançável por Tab/D-pad (abre o detalhe), o
 * overlay é mouse/leitor-de-tela-only (`tabIndex={-1}` em `GameCover`).
 *
 * Não mostra `last_played_at` (GamesScreen mostrava antes) nem um botão
 * "Jogar" full-width — a unificação adota o desenho mais simples de
 * `AllGamesScreen`, consistente com M1. Ver comentário em `GamesScreen.tsx`
 * sobre a limitação que isso herda para quem só usa teclado/controle na
 * grade por console (mesma limitação que M1 já aceitou para "Todos os
 * jogos"; M6 deve fechar o resto ao dar a `GameDetailScreen` acesso ao
 * fluxo rico).
 */
export function GameTile({
  game,
  shortName,
  onOpenDetail,
  onPlay,
  onToggleFavorite,
}: {
  game: LibraryGame;
  /** Sigla do console — capa placeholder e badge de plataforma. */
  shortName: string;
  onOpenDetail: () => void;
  /** Ausente esconde o botão de jogar do overlay (jogo `missing`, lançamento em andamento, ou console sem preset). */
  onPlay?: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        {/*
         * M1 (docs/sprint-m-plano.md): não é <button> — o overlay ▶ é o
         * <button> real dentro de GameCover (botão dentro de botão é HTML
         * inválido). `role="button"` + `tabIndex`/`onKeyDown` repõem a
         * semântica. Único alvo alcançável por Tab/D-pad do tile: quem
         * navega por teclado/controle abre o detalhe por aqui.
         */}
        <div
          role="button"
          tabIndex={0}
          className={`group block w-full cursor-pointer rounded text-left ${FOCUS_RING}`}
          title={game.title}
          aria-label={`Ver detalhes de ${game.title}`}
          onClick={onOpenDetail}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            onOpenDetail();
          }}
        >
          <GameCover
            label={shortName}
            title={game.title}
            consoleId={game.console_id}
            coverUrl={coverImageURL(game.cover_url)}
            showPlayOverlay
            onPlay={onPlay}
          />
        </div>
        <FavoriteToggle favorite={game.favorite} onToggle={onToggleFavorite} className="absolute top-1.5 right-1.5" />
      </div>
      <div className="min-w-0">
        {/* M7: line-clamp-2 — com capa real, este é o único título do tile
            (GameCover não desenha mais o dele por cima da arte). */}
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
}
