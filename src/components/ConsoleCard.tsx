import type { CSSProperties } from "react";
import type { ConsoleEntry } from "../api/types";
import { consoleAccentColor } from "../lib/consoleColor";
import type { ConsoleReadiness } from "../lib/consoleReadiness";
import { consoleIconLabel, FOCUS_RING } from "./ui";

/**
 * O card de um console na grade (2026-09-09, direção retrô/pixelada do
 * CLAUDE.md — "o layout desta tela pode ser refeito"). Substitui o
 * `ConsoleTile` de 104px, que renderizava a logo a ~48px (tamanho de
 * favicon): aqui a arte do sistema é o elemento e ocupa a largura do card,
 * sobre o gradiente radial na cor de identidade do console (a mesma fórmula
 * do herói de `ConsoleDetailScreen`) e o chassi de borda reta.
 *
 * Três tamanhos, um por faixa da tela: `grande` para "Prontos para jogar"
 * (logo grande + contagem + "Ver jogos"), `media` para "Falta configurar"
 * (chip de pendência visível já aqui) e `densa` para o catálogo. Nenhum deles
 * repete o que o detalhe já diz antes do clique — a faixa que sobe do rodapé
 * no hover mostra `readiness.detail`, e some de novo ao sair.
 *
 * O card **não** julga hardware: `readiness` responde "o ZeuX tem as peças no
 * lugar?", nunca "esta máquina aguenta?" (princípio 2). A contagem de jogos é
 * dado do disco do usuário, em coluna monoespaçada.
 */

export type ConsoleCardSize = "grande" | "media" | "densa";

export interface ConsoleCardLabels {
  /** Ex.: "Ver jogos" — afordância do card grande. */
  viewGames: string;
  /** Recebe a contagem e devolve "1 jogo" / "12 jogos". */
  gameCount: (count: number) => string;
  /** Ex.: "sem jogos nesta pasta" — quando a pasta existe mas está vazia. */
  noGames: string;
}

// 2026-09-10 (decisão do Douglas, a partir do achado do critico-design): o
// card não mostra mais a logo do IGDB. Era o único objeto claro do app
// inteiro — uma chapa branca atrás de arte de terceiro, concentrando todo o
// contraste da interface onde a identidade não é do ZeuX — e produzia dois
// desenhos de card diferentes na mesma prateleira (com/sem logo). Agora todo
// card mostra sempre a sigla em `font-pixel`, na cor de identidade do
// console: é o mesmo elemento que já existia como fallback, promovido a
// único caminho. A textura de "tela de ponto" continua vindo de
// `.zeux-pixel-grid` e da scanline no fundo do compartimento.
const LOGO_BOX_HEIGHT: Record<ConsoleCardSize, string> = {
  grande: "h-28",
  media: "h-24",
  densa: "h-20",
};

export function ConsoleCard({
  entry,
  readiness,
  size,
  gameCount,
  hasFolder,
  labels,
  onOpen,
}: {
  entry: ConsoleEntry;
  readiness: ConsoleReadiness;
  size: ConsoleCardSize;
  /** Contagem real de jogos deste console; `null` quando não pôde ser lida. */
  gameCount: number | null;
  /** Há pelo menos uma pasta apontada para este console. */
  hasFolder: boolean;
  labels: ConsoleCardLabels;
  onOpen: () => void;
}) {
  const accent = consoleAccentColor(entry.console_id);
  const ready = readiness.step === "pronto";

  // A contagem toma o lugar do chip de pendência só quando há pasta E o
  // console está pronto: com uma peça ainda faltando, o que o usuário precisa
  // ver é o que falta, não quantos jogos já achou.
  const showCount = ready && hasFolder && gameCount !== null;

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${entry.name} (${entry.year}) — ${readiness.badge}`}
      aria-label={`${entry.name}, ${entry.year}. ${readiness.badge}`}
      // `--console-accent` como custom property: classe Tailwind arbitrária é
      // compilada em build e não lê valor dinâmico. Mesmo vocabulário de halo
      // que `GameCover` e o chrome já usam — o efeito não é novo, só passa a
      // valer aqui também. `box-shadow`/`border-color` de hover vêm de classe,
      // nunca do `style` inline (inline venceria o `group-hover:` por
      // especificidade).
      style={{ "--console-accent": accent } as CSSProperties}
      className={`group relative flex flex-col overflow-hidden rounded-md border bg-panel text-left transition duration-150 hover:border-[var(--console-accent)] hover:shadow-[0_0_20px_-6px_var(--console-accent)] focus-visible:border-[var(--console-accent)] [[data-gamepad-focused]_&]:border-[var(--console-accent)] ${
        ready ? "border-[color-mix(in_srgb,var(--console-accent)_55%,var(--line))]" : "border-line"
      } ${FOCUS_RING}`}
    >
      <div
        className={`relative flex w-full shrink-0 items-center justify-center overflow-hidden border-b border-line ${LOGO_BOX_HEIGHT[size]}`}
        // O gradiente radial na cor de identidade — a mesma fórmula do herói
        // do detalhe (ConsoleDetailScreen). É o fundo do "compartimento" da
        // arte do sistema.
        style={{
          background: `radial-gradient(65% 90% at 12% 25%, color-mix(in srgb, ${accent} 22%, transparent), transparent 70%), var(--fill)`,
        }}
      >
        {/* Textura de tela de ponto + varredura, bem sutil, só no fundo do
            compartimento — nunca sobre o texto abaixo. */}
        <div aria-hidden="true" className="zeux-pixel-grid pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="zeux-scanlines pointer-events-none absolute inset-0 opacity-40" />

        <span aria-hidden="true" className="relative font-pixel text-sm leading-none" style={{ color: accent }}>
          {consoleIconLabel(entry.console_id, entry.short_name)}
        </span>

        {ready && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent-secondary ring-1 ring-black/30 shadow-[0_0_5px_var(--accent-secondary)]"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
        <p className="truncate text-[13px] font-medium text-ink">{entry.name}</p>

        <div className="flex items-center justify-between gap-2">
          {/* Ano à esquerda sempre — dado de catálogo, coluna monoespaçada. */}
          <span className="font-mono text-[11px] tracking-wide text-muted tabular-nums">{entry.year}</span>

          {showCount ? (
            <span className="font-mono text-[11px] font-medium text-accent-secondary tabular-nums">
              {labels.gameCount(gameCount as number)}
            </span>
          ) : hasFolder && ready ? (
            <span className="font-mono text-[11px] text-muted tabular-nums">{labels.noGames}</span>
          ) : (
            // Chip de pendência visível já na grade (pedido do item 1/6): a
            // faixa de hover traz a frase inteira, mas o selo curto fica
            // sempre à vista nos cards médios e densos.
            <span className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted uppercase">
              {readiness.badge}
            </span>
          )}
        </div>

        {size === "grande" && (
          <span className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] tracking-wide text-accent-secondary uppercase">
            {labels.viewGames}
            <span aria-hidden="true" className="transition-transform duration-150 group-hover:translate-x-0.5">
              →
            </span>
          </span>
        )}
      </div>

      {/* Faixa que sobe do rodapé no hover/foco: a frase que antes só existia
          no `title` (tooltip nativo). `translate-y-full` a esconde sem tirar
          do fluxo; o card não muda de altura. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full border-t border-[var(--console-accent)] bg-paper/95 px-2.5 py-2 text-[11px] leading-snug text-ink backdrop-blur-sm transition-transform duration-150 group-hover:translate-y-0 group-focus-visible:translate-y-0 [[data-gamepad-focused]_&]:translate-y-0"
      >
        {readiness.detail}
      </div>
    </button>
  );
}
