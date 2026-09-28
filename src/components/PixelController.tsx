import { CONTROLLER_PARTS, GRID_H, GRID_W, LIT_ACCENT, LIT_INFO } from "../lib/pixelController";

/**
 * O controle em pixel art (geometria em `lib/pixelController.ts`), com os
 * botões que acendem de verdade — a peça muda de cor, em vez de uma mancha
 * sobreposta a uma foto, que era como a foto de 2026-09-08 funcionava.
 *
 * `lit` é a intensidade de 0 a 1 por botão (as chaves de `CONTROLLER_SPOTS`):
 * gatilho analógico acende pela metade, botão digital é 0 ou 1, e um valor
 * baixo fixo serve de "já passei por aqui" na configuração guiada. A camada
 * acesa é a mesma peça repintada com o realce e sobreposta com opacidade —
 * a base continua embaixo, então nunca aparece buraco.
 *
 * `shape-rendering="crispEdges"`: sem ele o navegador suaviza a borda de cada
 * faixa de 1px e a pixel art vira borrão ao ampliar.
 */
export function PixelController({
  lit = {},
  tone = "info",
  sticks = {},
  className = "",
}: {
  lit?: Record<string, number>;
  /** `info` (ciano) = botão apertado; `accent` (roxo) = região em foco no mapeamento. */
  tone?: "info" | "accent";
  /** Eixo de -1 a 1 de cada analógico — a capa se desloca junto. */
  sticks?: Partial<Record<"leftStick" | "rightStick", { x: number; y: number }>>;
  className?: string;
}) {
  const litColor = tone === "accent" ? LIT_ACCENT.base : LIT_INFO.base;

  return (
    <svg
      viewBox={`0 0 ${GRID_W} ${GRID_H}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={`block w-full select-none ${className}`}
    >
      {CONTROLLER_PARTS.map((part) => {
        const intensity = part.fixed ? 0 : (lit[part.id] ?? 0);
        const stick = part.id === "leftStick" || part.id === "rightStick" ? sticks[part.id] : undefined;
        // Deslocamento inteiro, em pixels da grade: meio pixel quebraria o
        // `crispEdges` e a capa ficaria borrada enquanto se move.
        const transform = stick ? `translate(${Math.round(stick.x * 2)} ${Math.round(stick.y * 2)})` : undefined;
        const litPaths = tone === "accent" ? part.litAccent : part.litInfo;
        return (
          <g key={part.id} transform={transform}>
            {Object.entries(part.paths).map(([color, d]) => (
              <path key={color} fill={color} d={d} />
            ))}
            {intensity > 0.02 && (
              <g
                opacity={0.35 + 0.65 * Math.min(1, intensity)}
                // O halo é o que faz o botão ser notado pelo canto do olho
                // enquanto a pessoa olha para o controle físico, não para a tela.
                style={intensity >= 0.5 ? { filter: `drop-shadow(0 0 1.5px ${litColor})` } : undefined}
              >
                {Object.entries(litPaths).map(([color, d]) => (
                  <path key={color} fill={color} d={d} />
                ))}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
