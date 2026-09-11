import type { ReactNode } from "react";
import type { LibraryGame } from "../api/types";
import { useT } from "../i18n/i18n";
import { consoleAccentColor } from "../lib/consoleColor";
import { Button, FOCUS_RING, ZeuXMark } from "./ui";
import { dict } from "./LibraryShelf.i18n";

/**
 * Prateleira de um console na Home (2026-09-11, padrão do mockup H).
 *
 * A Home mostrava um hero e uma fileira de *cards de console*; capa de jogo
 * só aparecia depois de entrar num console. O mockup inverte isso: a tela de
 * entrada é feita de prateleiras de capas, agrupadas por console, e o card de
 * console vira o cabeçalho da prateleira. É o mesmo dado que já vinha de
 * `GET /library/games?console_id=` — nenhuma rota nova.
 *
 * O cabeçalho carrega um bloco de cor na identidade do console (faixa larga,
 * não bordinha — "um pouco mais de cor", pedido do Douglas) e, ao lado do
 * nome, o `headline` do parecer **exibido como veio do servidor**: é texto
 * descritivo calibrado no Go (princípio 2 do CLAUDE.md), reescrevê-lo aqui é
 * justamente como se inventa julgamento sobre a máquina do usuário.
 *
 * `renderGame` em vez de o componente montar o `GameTile` sozinho: toda a
 * cadeia de lançar/instalar (`useLaunchGame`, `useInlineInstall`,
 * `evaluateGameLaunchability`) vive na tela, com os modais. A prateleira é
 * composição visual; ela não sabe o que é lançar um jogo.
 */
export function LibraryShelf({
  consoleId,
  name,
  headline,
  games,
  totalCount,
  onOpenConsole,
  onChooseFolder,
  renderGame,
}: {
  consoleId: string;
  name: string;
  /** `headline` do parecer, já pronto para exibir. Ausente sem consentimento/scan. */
  headline?: string;
  /** Os jogos a mostrar nesta prateleira (a tela já corta em quantos cabem). */
  games: LibraryGame[];
  /** Total do console — quando maior que `games.length`, o link "Ver os N" aparece. */
  totalCount: number;
  onOpenConsole: () => void;
  onChooseFolder: () => void;
  renderGame: (game: LibraryGame) => ReactNode;
}) {
  const t = useT(dict);
  const accent = consoleAccentColor(consoleId);

  return (
    <section className="mb-8">
      <div
        className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border-l-4 px-3 py-2"
        style={{
          borderLeftColor: accent,
          background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 22%, var(--panel)) 0%, var(--panel) 72%)`,
        }}
      >
        <button
          type="button"
          onClick={onOpenConsole}
          className={`rounded-sm text-lg font-semibold text-ink hover:underline ${FOCUS_RING}`}
        >
          {name}
        </button>
        {headline && (
          <span
            className="rounded-sm border px-2 py-0.5 font-mono text-xs tracking-wide text-ink"
            style={{ borderColor: `color-mix(in srgb, ${accent} 55%, var(--line))`, backgroundColor: "var(--fill)" }}
          >
            {headline}
          </span>
        )}
        {totalCount > games.length && (
          <button
            type="button"
            onClick={onOpenConsole}
            className={`ml-auto rounded-sm font-mono text-xs tracking-wide text-accent-secondary uppercase hover:underline ${FOCUS_RING}`}
          >
            {t("seeAll", { count: totalCount })}
          </button>
        )}
      </div>

      {games.length === 0 ? (
        // Estado vazio com a marca — o mockup usa o mascote aqui, e o mascote
        // do ZeuX é a logo que já existe (`ZeuXMark`), não um desenho novo.
        <div className="flex flex-wrap items-center gap-5 rounded-lg border border-line bg-panel p-5">
          <ZeuXMark size={96} />
          <div className="min-w-0 max-w-xl flex-1">
            <h3 className="text-lg font-semibold text-ink">{t("emptyTitle")}</h3>
            <p className="mt-1 text-sm text-muted">{t("emptyMessage")}</p>
            <Button variant="primary" className="mt-3" onClick={onChooseFolder}>
              {t("chooseFolder")}
            </Button>
          </div>
        </div>
      ) : (
        // `auto-fill` + `minmax`: a prateleira ganha e perde colunas sozinha
        // conforme a janela, sem breakpoint — é o jeito de não repetir o bug
        // de 2026-08-04 (breakpoint que nunca disparava no tamanho padrão da
        // janela), já que esta coluna divide espaço com a sidebar, o trilho
        // e a coluna da Praça.
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr))]">
          {games.map((game) => (
            <div key={game.id}>{renderGame(game)}</div>
          ))}
        </div>
      )}
    </section>
  );
}
