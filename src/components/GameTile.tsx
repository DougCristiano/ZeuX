import type { LibraryGame } from "../api/types";
import { coverImageURL } from "../api";
import type { GameLaunchability } from "../lib/gameLaunchability";
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
 * jogos"; M6 já fechou parte disso — GameDetailScreen mostra o veredito —,
 * mas o "▶ Jogar" de lá ainda lança direto, sem passar pela checagem de
 * instalado/BIOS deste hook).
 *
 * `launchability` (M8, docs/sprint-m-plano.md, 2026-08-07): sinaliza na
 * própria grade o jogo que não vai abrir — capa esmaecida + badge curto —
 * em vez do usuário só descobrir no clique. Substitui o antigo badge fixo
 * "arquivo ausente": agora é um dos quatro motivos possíveis de
 * `evaluateGameLaunchability` (src/lib/gameLaunchability.ts), a mesma regra
 * usada pelas duas telas (critério do item, verificável por `grep`).
 * Continua clicável mesmo bloqueado (princípio 5: informar, não bloquear) —
 * o único efeito extra é o badge de "instalar emulador" virar um botão que
 * dispara a instalação inline (`onInstall`) em vez de só descrever o motivo.
 */
export function GameTile({
  game,
  shortName,
  onOpenDetail,
  onPlay,
  onToggleFavorite,
  launchability,
  onInstall,
}: {
  game: LibraryGame;
  /** Sigla do console — capa placeholder e badge de plataforma. */
  shortName: string;
  onOpenDetail: () => void;
  /** Ausente esconde o botão de jogar do overlay (jogo `missing`, lançamento em andamento, ou console sem preset). */
  onPlay?: () => void;
  onToggleFavorite: () => void;
  /** Ausente = tela não carregou dado o bastante para avaliar (ex.: `AllGamesScreen` antes do `GET /emulators` responder) — tile aparece sem badge, nunca com um palpite. */
  launchability?: GameLaunchability;
  /** Só relevante quando `launchability.reason === "not_installed"` — dispara a instalação inline (L8) a partir do badge. */
  onInstall?: () => void;
}) {
  const blocked = launchability !== undefined && !launchability.launchable;

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
          {/* M8: esmaecida quando bloqueado — a capa em si, não o tile
              inteiro, pra estrela de favorito continuar com contraste normal. */}
          <GameCover
            label={shortName}
            title={game.title}
            consoleId={game.console_id}
            coverUrl={coverImageURL(game.cover_url)}
            showPlayOverlay
            onPlay={onPlay}
            className={blocked ? "opacity-50" : ""}
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
        {blocked && (
          <div className="mt-1">
            {launchability!.reason === "not_installed" && onInstall ? (
              <button
                type="button"
                title={launchability!.title}
                onClick={(e) => {
                  // Não deixa o clique borbulhar pro wrapper (que abriria o
                  // detalhe) — este botão tem a própria ação.
                  e.stopPropagation();
                  onInstall();
                }}
                className={`inline-block rounded-sm border border-line-strong px-1.5 py-0.5 font-mono text-xs tracking-wide text-muted underline decoration-dotted transition-colors hover:text-ink ${FOCUS_RING}`}
              >
                {launchability!.badge}
              </button>
            ) : (
              <Badge title={launchability!.title}>{launchability!.badge}</Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
