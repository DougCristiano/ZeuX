import { useState, type CSSProperties } from "react";
import { consoleImageURL } from "../api";
import type { ConsoleEntry } from "../api/types";
import { consoleAccentColor, consoleTextColor } from "../lib/consoleColor";
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
  /** Ex.: "Ver jogos" — afordância do card grande. */
  viewGames: string;
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
  const accent = consoleAccentColor(entry.console_id);
  // A sigla é TEXTO: usa a variante clara da mesma matiz (`consoleTextColor`,
  // ≥4.5:1 sobre `--fill` — WCAG 1.4.3). O `accent` puro continua na borda, no
  // glow e no gradiente do compartimento, onde é decoração e não precisa ser
  // lido.
  const labelColor = consoleTextColor(entry.console_id);
  const ready = readiness.step === "pronto";

  // Mesma checagem de `ConsoleHero`/`LibraryScreen`: `has_image` diz o que o
  // catálogo sabe, `onError` cobre o resto (imagem cadastrada mas que falhou
  // ao carregar). Nunca um `slice(0, 4)` à mão — `consoleIconLabel` já
  // conhece o mapa de exceções de sigla.
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = entry.has_image && !imageFailed;

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

        {showImage ? (
          // Etiqueta de cartucho — ver doc comment do arquivo. `absolute`,
          // não em fluxo: o compartimento é `flex items-center
          // justify-center` para o fallback de sigla. `object-contain` é o
          // ponto da mudança: as logos vão de 1:1 a quase 9:1 (GBA), e
          // qualquer `cover` corta alguma. `mix-blend-multiply` porque
          // algumas logos (Fliperama, Mega Drive, SNES) vêm com fundo branco
          // chapado: multiplicado, o branco vira o creme da etiqueta em vez
          // de um retângulo branco dentro dela; preto e cor mudam quase nada.
          <div className="absolute inset-x-3.5 top-2.5 bottom-2.5 flex overflow-hidden rounded-sm bg-cart-label px-2.5 pt-3.5 pb-2 shadow-[0_2px_0_rgb(0_0_0/0.35)]">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5" style={{ background: accent }} />
            <img
              src={consoleImageURL(entry.console_id)}
              alt=""
              className="h-full min-h-0 w-full min-w-0 object-contain mix-blend-multiply"
              onError={() => setImageFailed(true)}
            />
          </div>
        ) : (
          <span aria-hidden="true" className="relative font-pixel text-sm leading-none" style={{ color: labelColor }}>
            {consoleIconLabel(entry.console_id, entry.short_name)}
          </span>
        )}

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
            // Chip de pendência visível já na grade (pedido do item 1/6): a
            // faixa de hover traz a frase inteira, mas o selo curto fica
            // sempre à vista no card.
            <span className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted uppercase">
              {readiness.badge}
            </span>
          )}
        </div>

        {/* Antes só nos cards `grande` — tamanho único desde 2026-09-14 (ver
            doc comment do arquivo), então vale para todo card agora. */}
        <span className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] tracking-wide text-accent-secondary uppercase">
          {labels.viewGames}
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
