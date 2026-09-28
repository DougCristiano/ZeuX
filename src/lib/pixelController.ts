/**
 * Geometria do controle em pixel art (2026-09-28) — substitui a foto de um
 * controle real (`controller-reference.png`, decisão de 2026-09-08).
 *
 * Por que funciona onde as duas rodadas de SVG de 2026-09-07 não funcionaram:
 * aquelas tentavam um controle realista, com curvas e perspectiva, e liam como
 * "desenho de controle". Aqui a forma é descrita com primitivas simples
 * (retângulo arredondado, elipse) e rasterizada numa grade de 128×80 — a
 * simplicidade É o estilo, pixel art de 16 bits, não uma aproximação de foto.
 * Contorno, brilho e sombra saem da própria máscara (`shadePixels`), não de
 * pixel pintado à mão, então mexer numa forma não exige redesenhar nada.
 *
 * Genérico de propósito: formato de DualShock (é o que tem os 17 botões do
 * mapeamento "standard" da Gamepad API, analógicos e gatilhos inclusos), sem
 * logo, sem letra, sem ✕/○/□/△. As cores dos botões de face são as do Super
 * Famicom; o home, o roxo do ZeuX.
 *
 * Cada botão é uma peça separada, com a mesma chave de `CONTROLLER_SPOTS`
 * (lib/controllerRegions.ts) — que agora é DERIVADO desta geometria, em vez
 * de medido à mão sobre a foto.
 */

export const GRID_W = 128;
export const GRID_H = 80;

type Shape = (x: number, y: number) => boolean;

const rrect =
  (x0: number, y0: number, x1: number, y1: number, r: number): Shape =>
  (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
const ellipse =
  (cx: number, cy: number, rx: number, ry: number): Shape =>
  (x, y) =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const union =
  (...shapes: Shape[]): Shape =>
  (x, y) =>
    shapes.some((s) => s(x, y));

export interface Palette {
  outline: string;
  base: string;
  shade: string;
  light: string;
}

const OUT = "#171927";
const GRAY: Palette = { outline: OUT, base: "#bfc3d3", shade: "#959ab0", light: "#e2e4ee" };
const DARK: Palette = { outline: OUT, base: "#3a3e56", shade: "#2a2d40", light: "#5a5f7e" };
const PIT: Palette = { outline: OUT, base: "#2a2d40", shade: "#1f2233", light: "#3a3e56" };
const btn = (base: string, shade: string, light: string): Palette => ({ outline: OUT, base, shade, light });

/** Realce de botão apertado — `--accent-secondary` ("o sistema informa"). */
export const LIT_INFO: Palette = { outline: OUT, base: "#00e5ff", shade: "#00a9c4", light: "#9ff6ff" };
/** Realce de região em foco no painel de mapeamento — `--accent` ("aqui você age"). */
export const LIT_ACCENT: Palette = { outline: OUT, base: "#9d4eff", shade: "#6f2fc4", light: "#c49bff" };

interface PartDef {
  id: string;
  palette: Palette;
  shape: Shape;
  /** Peça sem botão correspondente (corpo, miolo do direcional, base do analógico). */
  fixed?: boolean;
}

// Ordem = ordem de pintura: gatilhos atrás do corpo, ombros por cima dos
// gatilhos, a base funda do analógico antes da capa.
const PART_DEFS: PartDef[] = [
  { id: "triggerLeft", palette: DARK, shape: rrect(18, 3, 38, 14, 4) },
  { id: "triggerRight", palette: DARK, shape: rrect(90, 3, 110, 14, 4) },
  { id: "shoulderLeft", palette: DARK, shape: rrect(15, 10, 41, 18, 3) },
  { id: "shoulderRight", palette: DARK, shape: rrect(87, 10, 113, 18, 3) },
  {
    id: "body",
    palette: GRAY,
    fixed: true,
    shape: union(rrect(10, 15, 118, 47, 11), ellipse(26, 52, 16, 24), ellipse(102, 52, 16, 24), rrect(34, 36, 94, 56, 8)),
  },
  { id: "dpadCenter", palette: DARK, fixed: true, shape: rrect(25, 28, 31, 34, 0) },
  { id: "dpadUp", palette: DARK, shape: rrect(25, 21, 31, 29, 1) },
  { id: "dpadDown", palette: DARK, shape: rrect(25, 33, 31, 41, 1) },
  { id: "dpadLeft", palette: DARK, shape: rrect(17, 28, 26, 34, 1) },
  { id: "dpadRight", palette: DARK, shape: rrect(30, 28, 39, 34, 1) },
  { id: "faceTop", palette: btn("#4f7cf0", "#3557b8", "#86a6ff"), shape: ellipse(102, 23, 4.6, 4.6) },
  { id: "faceLeft", palette: btn("#3fb56a", "#2b8a4e", "#78dd9b"), shape: ellipse(94, 31, 4.6, 4.6) },
  { id: "faceRight", palette: btn("#e8484f", "#b52f36", "#ff8a8f"), shape: ellipse(110, 31, 4.6, 4.6) },
  { id: "faceBottom", palette: btn("#f0bd2e", "#bf9018", "#ffe07a"), shape: ellipse(102, 39, 4.6, 4.6) },
  { id: "select", palette: DARK, shape: rrect(49, 29, 58, 33, 2) },
  { id: "start", palette: DARK, shape: rrect(70, 29, 79, 33, 2) },
  { id: "home", palette: btn("#9d4eff", "#6f2fc4", "#c49bff"), shape: ellipse(64, 40, 4, 4) },
  { id: "leftStickBase", palette: PIT, fixed: true, shape: ellipse(46, 50, 8.5, 8.5) },
  { id: "leftStick", palette: DARK, shape: ellipse(46, 49, 6, 6) },
  { id: "rightStickBase", palette: PIT, fixed: true, shape: ellipse(82, 50, 8.5, 8.5) },
  { id: "rightStick", palette: DARK, shape: ellipse(82, 49, 6, 6) },
];

type Pixel = [x: number, y: number];

function rasterize(shape: Shape): Pixel[] {
  const pixels: Pixel[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      // Centro do pixel, não o canto: é o que deixa a elipse simétrica.
      if (shape(x + 0.5, y + 0.5)) pixels.push([x, y]);
    }
  }
  return pixels;
}

/**
 * Contorno de 1px, sombra de 2px embaixo e brilho de 1px em cima — a luz de
 * sprite clássica (vinda de cima), decidida pela vizinhança na própria
 * máscara. Devolve um `path` por cor, com cada fileira contínua como um
 * retângulo de 1px de altura.
 */
function shadePixels(pixels: Pixel[], palette: Palette): Record<string, string> {
  const inside = new Set(pixels.map(([x, y]) => y * GRID_W + x));
  const at = (x: number, y: number) => x >= 0 && x < GRID_W && y >= 0 && y < GRID_H && inside.has(y * GRID_W + x);

  const rows: Record<string, Map<number, number[]>> = {};
  for (const [x, y] of pixels) {
    let color = palette.base;
    if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) color = palette.outline;
    else if (!at(x, y + 2) || !at(x, y + 3)) color = palette.shade;
    else if (!at(x, y - 2)) color = palette.light;
    const byRow = (rows[color] ??= new Map());
    const row = byRow.get(y) ?? [];
    row.push(x);
    byRow.set(y, row);
  }

  const paths: Record<string, string> = {};
  for (const [color, byRow] of Object.entries(rows)) {
    let d = "";
    for (const [y, xs] of byRow) {
      xs.sort((a, b) => a - b);
      let start = xs[0];
      let prev = xs[0];
      for (let i = 1; i <= xs.length; i++) {
        if (xs[i] === prev + 1) {
          prev = xs[i];
          continue;
        }
        const w = prev - start + 1;
        d += `M${start} ${y}h${w}v1h-${w}z`;
        start = prev = xs[i];
      }
    }
    paths[color] = d;
  }
  return paths;
}

export interface ControllerPart {
  id: string;
  fixed: boolean;
  /** `path` por cor na paleta própria da peça. */
  paths: Record<string, string>;
  /** Mesma peça pintada com o realce ciano e com o roxo. */
  litInfo: Record<string, string>;
  litAccent: Record<string, string>;
  /** Caixa da peça na grade, em pixels. */
  box: { x0: number; y0: number; x1: number; y1: number };
}

// Calculado uma vez, no carregamento do módulo: 21 peças × 10 240 pixels.
// Nada disso muda em tempo de execução — o componente só escolhe qual camada
// pintar.
export const CONTROLLER_PARTS: ControllerPart[] = PART_DEFS.map((def) => {
  const pixels = rasterize(def.shape);
  const xs = pixels.map(([x]) => x);
  const ys = pixels.map(([, y]) => y);
  return {
    id: def.id,
    fixed: Boolean(def.fixed),
    paths: shadePixels(pixels, def.palette),
    litInfo: shadePixels(pixels, LIT_INFO),
    litAccent: shadePixels(pixels, LIT_ACCENT),
    box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1 },
  };
});

/** Centro e tamanho de uma peça em % da grade — o formato de `ControllerSpot`. */
export function partSpot(id: string): { x: number; y: number; w: number; h: number } {
  const part = CONTROLLER_PARTS.find((p) => p.id === id);
  if (!part) throw new Error(`peça de controle desconhecida: ${id}`);
  const { x0, y0, x1, y1 } = part.box;
  return {
    x: (((x0 + x1) / 2) / GRID_W) * 100,
    y: (((y0 + y1) / 2) / GRID_H) * 100,
    w: ((x1 - x0) / GRID_W) * 100,
    h: ((y1 - y0) / GRID_H) * 100,
  };
}
