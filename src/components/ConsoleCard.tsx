import type { CSSProperties } from "react";
import type { ConsoleEntry } from "../api/types";
import { consoleAccentColor } from "../lib/consoleColor";
import type { ConsoleReadiness } from "../lib/consoleReadiness";
import { ConsoleLabel } from "./ConsoleLabel";
import { FOCUS_RING } from "./ui";

/**
 * O card de um console na grade (2026-09-09, direção retrô/pixelada do
 * CLAUDE.md — "o layout desta tela pode ser refeito"). Substitui o
 * `ConsoleTile` de 104px, que renderizava a logo a ~48px (tamanho de
 * favicon): aqui a arte do sistema é o elemento e ocupa a largura do card,
 * sobre o gradiente radial na cor de identidade do console (a mesma fórmula
 * do herói de `ConsoleDetailScreen`) e o chassi de borda reta.
 *
 * Um tamanho só, 2026-09-14 (pedido do Douglas): as três faixas de
 * `ConsolesScreen` tinham tamanhos de card diferentes (a de prontos com 4
 * por linha, as outras duas com 5 e menores) — "não fez sentido, gosto do
 * tamanho de 4". As três agora usam o mesmo card. `ConsoleCardSize`
 * (`grande`/`media`/`densa`) existiu até aqui para diferenciá-las e foi
 * removido — nada mais passa um tamanho diferente.
 *
 * A logo vai inteira numa etiqueta de cartucho (2026-09-26, escolhida pelo
 * Douglas entre três protótipos). Histórico: placa branca pequena e
 * centralizada (2026-09-10/11) lia como "ícone perdido num cartão grande";
 * `object-cover` de ponta a ponta (2026-09-14) resolveu o tamanho mas
 * cortava toda logo larga ("BOY AD", "EGA DRI") e deixava as pretas
 * (PS1, DS, PSP, Game Boy) quase invisíveis sobre `--fill`. A etiqueta é
 * grande — ocupa o compartimento, deixando só a borda do "casco" na cor do
 * console — então resolve o contraste sem voltar a ser ícone pequeno, e a
 * faixa no topo mantém a identidade de cor que o `cover` dava. Desfoque
 * ambiente atrás da logo foi o terceiro protótipo: ótimo nas coloridas,
 * sem contraste nas pretas.
 *
 * O card **não** julga hardware: `readiness` responde "o ZeuX tem as peças no
 * lugar?", nunca "esta máquina aguenta?" (princípio 2). A contagem de jogos é
 * dado do disco do usuário, em coluna monoespaçada.
 */

export interface ConsoleCardLabels {
  /** Afordância quando o console está pronto — ex.: "Ver console". */
  openConsole: string;
  /** Afordância quando falta alguma peça — ex.: "Configurar". */
  setUpConsole: string;
  /** Recebe a contagem e devolve "1 jogo" / "12 jogos". */
  gameCount: (count: number) => string;
  /** Ex.: "sem jogos nesta pasta" — quando a pasta existe mas está vazia. */
  noGames: string;
}

// Altura do compartimento da logo — ver o doc comment do arquivo (tamanho
// único desde 2026-09-14, era `grande`/`media`/`densa` por faixa da tela).
const LOGO_BOX_HEIGHT = "h-28";

export function ConsoleCard({
  entry,
  readiness,
  gameCount,
  hasFolder,
  labels,
  onOpen,
}: {
  entry: ConsoleEntry;
  readiness: ConsoleReadiness;
  /** Contagem real de jogos deste console; `null` quando não pôde ser lida. */
  gameCount: number | null;
  /** Há pelo menos uma pasta apontada para este console. */
  hasFolder: boolean;
  labels: ConsoleCardLabels;
  onOpen: () => void;
}) {
  // O `accent` vai na borda, no glow e no gradiente do compartimento — só
  // decoração; a logo (ou a sigla, sem logo) fica com `ConsoleLabel`.
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
      // `w-full` (achado ao vivo, 2026-09-11, numa prateleira de rolagem
      // horizontal que existia então): `<button>` é controle de formulário —
      // mesmo com `display: flex`, `width: auto` encolhe até o conteúdo
      // (shrink-to-fit), então cada card ficava do tamanho do NOME do
      // console, não da largura do `<div>` wrapper ao redor. Só não aparecia
      // em `ConsolesScreen` porque lá o card é filho de um `grid`, que
      // estica o item independente da largura intrínseca do botão.
      className={`group relative flex w-full flex-col overflow-hidden rounded-md border bg-panel text-left transition duration-150 hover:border-[var(--console-accent)] hover:shadow-[0_0_20px_-6px_var(--console-accent)] focus-visible:border-[var(--console-accent)] [[data-gamepad-focused]_&]:border-[var(--console-accent)] ${
        ready ? "border-[color-mix(in_srgb,var(--console-accent)_55%,var(--line))]" : "border-line"
      } ${FOCUS_RING}`}
    >
      <div
        className={`relative flex w-full shrink-0 items-center justify-center overflow-hidden border-b border-line ${LOGO_BOX_HEIGHT}`}
        // O gradiente radial na cor de identidade — a mesma fórmula do herói
        // do detalhe (ConsoleDetailScreen). Com imagem, é o "casco" do
        // cartucho em volta da etiqueta; sem imagem, o fundo da sigla.
        style={{
          background: `radial-gradient(65% 90% at 12% 25%, color-mix(in srgb, ${accent} 22%, transparent), transparent 70%), var(--fill)`,
        }}
      >
        {/* Textura de tela de ponto + varredura, bem sutil, só no fundo do
            compartimento — nunca sobre o texto abaixo. */}
        <div aria-hidden="true" className="zeux-pixel-grid pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="zeux-scanlines pointer-events-none absolute inset-0 opacity-40" />

        {/* Etiqueta de cartucho (`ConsoleLabel`, o desenho único de logo de
            console no app) sobre o "casco" com o gradiente na cor do console. */}
        <ConsoleLabel
          consoleId={entry.console_id}
          shortName={entry.short_name}
          hasImage={entry.has_image}
          className="absolute inset-x-3.5 top-2.5 bottom-2.5"
        />

        {ready && (
          <span
            aria-hidden="true"
            // Canto do casco, fora da etiqueta (que começa a 10px do topo e
            // 14px da direita) — dentro dela o ciano some contra o creme.
            className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent-secondary ring-1 ring-black/30 shadow-[0_0_5px_var(--accent-secondary)]"
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
            // Pendência visível já na grade (pedido do item 1/6): a faixa de
            // hover traz a frase inteira, mas o selo curto fica sempre à
            // vista no card.
            //
            // Status, não controle (2026-09-28): era um chip com borda, e
            // caixa com borda + texto em caixa alta é exatamente o desenho
            // de botão do app — lia como "clique aqui para instalar", mas
            // não fazia nada (o clique é o card inteiro). Agora é um pixel
            // quadrado + texto, sem caixa: o mesmo vocabulário do ponto
            // ciano de "pronto" no canto, só que âmbar e esmaecido — aviso
            // de "falta uma peça", não alarme (numa grade com vários
            // consoles pendentes, âmbar pleno viraria um painel de erro).
            <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[10px] tracking-wide text-amber/80 uppercase">
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 bg-amber/80" />
              <span className="truncate">{readiness.badge}</span>
            </span>
          )}
        </div>

        {/* Afordância de todo card (tamanho único desde 2026-09-14). Diz o
            destino real do clique, que é sempre o detalhe do console:
            "Configurar" enquanto falta peça, "Ver console" quando pronto. Até
            2026-09-26 dizia "Ver jogos", e o clique nunca abria os jogos. */}
        <span className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] tracking-wide text-accent-secondary uppercase">
          {ready ? labels.openConsole : labels.setUpConsole}
          <span aria-hidden="true" className="transition-transform duration-150 group-hover:translate-x-0.5">
            →
          </span>
        </span>
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
