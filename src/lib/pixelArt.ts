/**
 * Pixel art por código, genérico (2026-09-28) — a mesma técnica do controle
 * de `lib/pixelController.ts`, separada daqui para servir a qualquer cena sem
 * mexer naquele módulo (que deriva de propósito as regiões clicáveis do
 * mapeamento a partir da própria geometria e não deveria mudar por causa de
 * outra ilustração).
 *
 * Por que código e não PNG: a arte continua editável como forma ("mova a
 * janela 2 pixels"), sai nas cores exatas dos tokens do tema, não precisa de
 * um jogo de imagens por escala de tela e pesa alguns KB de texto. O custo é
 * que cada cena é descrita à mão — aceitável para ilustrações que são poucas
 * e simples por natureza.
 *
 * Duas ferramentas, porque cada uma é boa numa coisa:
 * - `shade(forma, paleta)`: forma geométrica rasterizada, com contorno, brilho
 *   e sombra decididos pela vizinhança na própria máscara. Serve a objeto
 *   grande (janela, placa, pasta) — mexer no tamanho não exige redesenhar.
 * - `sprite(x, y, linhas, cores)`: matriz de caracteres. Serve a ícone
 *   pequeno (disquete, seta, check), onde cada pixel é escolha de desenho e
 *   uma regra automática de contorno comeria a forma.
 *
 * A saída é um `path` por cor (cada fileira contínua vira um retângulo de 1px
 * de altura), sem sobreposição: quem pinta depois ganha a célula.
 */

export type Shape = (x: number, y: number) => boolean;

/** Retângulo em células: canto em (x0, y0), `w`×`h` células. */
export const rect =
  (x0: number, y0: number, w: number, h: number): Shape =>
  (x, y) =>
    x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;

/** Retângulo de cantos arredondados, limites contínuos (mesma fórmula do controle). */
export const rrect =
  (x0: number, y0: number, x1: number, y1: number, r: number): Shape =>
  (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };

export const ellipse =
  (cx: number, cy: number, rx: number, ry: number): Shape =>
  (x, y) =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

export const union =
  (...shapes: Shape[]): Shape =>
  (x, y) =>
    shapes.some((s) => s(x, y));

export const minus =
  (a: Shape, b: Shape): Shape =>
  (x, y) =>
    a(x, y) && !b(x, y);

export interface Palette {
  outline: string;
  base: string;
  shade: string;
  light: string;
}

export class PixelCanvas {
  private cells: (string | undefined)[];

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = new Array(w * h);
  }

  set(x: number, y: number, color: string) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
    this.cells[y * this.w + x] = color;
  }

  /** Amostra no centro da célula, não no canto: é o que deixa elipse simétrica. */
  private mask(shape: Shape): Set<number> {
    const inside = new Set<number>();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (shape(x + 0.5, y + 0.5)) inside.add(y * this.w + x);
      }
    }
    return inside;
  }

  /** Pinta a forma de uma cor só, sem contorno — fundo, trilho, linha fina. */
  fill(shape: Shape, color: string) {
    for (const i of this.mask(shape)) this.cells[i] = color;
  }

  /**
   * Contorno de 1px, sombra de `shadeRows` fileiras embaixo e brilho de 1px
   * em cima — a luz de sprite clássica, vinda de cima, a mesma do controle.
   */
  shade(shape: Shape, palette: Palette, shadeRows = 1) {
    const inside = this.mask(shape);
    const at = (x: number, y: number) =>
      x >= 0 && x < this.w && y >= 0 && y < this.h && inside.has(y * this.w + x);
    for (const i of inside) {
      const x = i % this.w;
      const y = Math.floor(i / this.w);
      let color = palette.base;
      if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) color = palette.outline;
      else if (Array.from({ length: shadeRows }, (_, k) => !at(x, y + k + 2)).some(Boolean)) color = palette.shade;
      else if (!at(x, y - 2)) color = palette.light;
      this.cells[i] = color;
    }
  }

  /**
   * Contorno POR FORA da forma — para traço fino (anel, linha de 2px), onde
   * o contorno de `shade` ocuparia a própria forma inteira e ela sumiria.
   */
  outlineOutside(shape: Shape, color: string) {
    const inside = this.mask(shape);
    for (const i of inside) {
      const x = i % this.w;
      const y = Math.floor(i / this.w);
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= this.w || ny < 0 || ny >= this.h) continue;
        if (!inside.has(ny * this.w + nx)) this.cells[ny * this.w + nx] = color;
      }
    }
  }

  /**
   * Carimba uma matriz de caracteres com o canto em (x, y). `.` é
   * transparente; caractere fora de `colors` é erro de desenho, e falhar alto
   * no carregamento é melhor que um pixel faltando que ninguém nota.
   */
  sprite(x: number, y: number, rows: string[], colors: Record<string, string>) {
    rows.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch === "." || ch === " ") return;
        const color = colors[ch];
        if (!color) throw new Error(`sprite: caractere sem cor: "${ch}"`);
        this.set(x + dx, y + dy, color);
      });
    });
  }

  /** Um `d` por cor. A ordem não importa: as células nunca se sobrepõem. */
  paths(): [color: string, d: string][] {
    const rows = new Map<string, string>();
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        const color = this.cells[y * this.w + x];
        if (!color) {
          x++;
          continue;
        }
        let end = x + 1;
        while (end < this.w && this.cells[y * this.w + end] === color) end++;
        const w = end - x;
        rows.set(color, (rows.get(color) ?? "") + `M${x} ${y}h${w}v1h-${w}z`);
        x = end;
      }
    }
    return [...rows.entries()];
  }
}
