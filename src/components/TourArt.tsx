import { ellipse, minus, PixelCanvas, rect, rrect, union, type Palette } from "../lib/pixelArt";

/**
 * As quatro ilustrações do tour de abertura em pixel art (2026-09-28).
 *
 * Substituem os SVGs de traço liso (chip com seta para uma janela de
 * sliders, medidor, pasta, nós de rede) — eram a única arte vetorial "de
 * produto SaaS" num app cuja identidade é pixel (logo, controle, fonte de
 * título), e o tour é a primeira coisa que a pessoa vê depois do scan.
 *
 * Grade de 80×50 exibida a no máximo 480px: 6px por célula, inteiro, então a
 * grade não cintila (colunas de 6 e 7px lado a lado) no tamanho em que o tour
 * normalmente aparece. Abaixo disso a escala deixa de ser inteira, e é aceito:
 * só acontece em janela menor que ~530px.
 *
 * Cada cena mantém a mensagem da ilustração anterior, e nenhuma tem texto — a
 * legenda vem do i18n (motivo em TourOverlay.tsx). Cores = tokens de
 * `index.css` em hex, porque sombra e brilho precisam de tons derivados que
 * não existem como variável; o app só tem tema escuro.
 */

export type TourArtKind = "autoconfig" | "verdict" | "library" | "social";

const W = 80;
const H = 50;
/** Linha do chão: tudo que "está sobre a mesa" pousa aqui. */
const FLOOR = 43;

// Tokens do tema (index.css) e tons derivados para sombra/brilho.
const OUT = "#0a0e1a"; // mais escuro que --paper, para o contorno ler sobre --fill
const FILL = "#1a2542"; // --fill (fundo da moldura)
const FILL_STRONG = "#22305a"; // --fill-strong
const PANEL = "#131c34"; // --panel
const LINE_STRONG = "#2c3f66"; // --line-strong
const CONTROL = "#5a7cb0"; // --control-border
const MUTED = "#94a3b8"; // --muted
const DANGER = "#f0554a"; // --danger

const pal = (base: string, shade: string, light: string): Palette => ({ outline: OUT, base, shade, light });
const ACCENT = pal("#9d4eff", "#6f2fc4", "#c49bff"); // --accent
const CYAN = pal("#00e5ff", "#00a9c4", "#9ff6ff"); // --accent-secondary
const CREAM = pal("#e6e1d3", "#b9b3a2", "#fbf8ef"); // --cart-label
const CREAM_BACK = pal("#b9b3a2", "#8f8a7b", "#d4cfbf");
const AMBER = pal("#ff6b1a", "#c44d0c", "#ffa46b"); // --amber
const DARK = pal("#3a3e56", "#2a2d40", "#5a5f7e"); // mesmo cinza-grafite do controle
const PIT = pal("#2a2d40", "#1f2233", "#3a3e56");
const METAL = pal("#bfc3d3", "#959ab0", "#e2e4ee");

/**
 * Palco comum: pontilhado de grade no fundo (a "grade de pixels visível" da
 * direção retrô, discreta o bastante para não competir com o objeto) e um
 * chão onde os objetos pousam — sem ele tudo flutua e lê como diagrama.
 */
function stage(): PixelCanvas {
  const c = new PixelCanvas(W, H);
  c.fill(rect(0, 0, W, H), FILL);
  for (let y = 2; y < FLOOR - 1; y += 4) for (let x = 2; x < W; x += 4) c.set(x, y, FILL_STRONG);
  c.fill(rect(0, FLOOR, W, 1), LINE_STRONG);
  c.fill(rect(0, FLOOR + 1, W, H - FLOOR - 1), PANEL);
  return c;
}

/** Check de "resolvido" — ciano, porque é o sistema informando. */
const CHECK = ["....X", "...XX", "X.XX.", "XXX..", ".X..."];

// ── 1. Autoconfiguração: o chip lido alimenta a janela do emulador, que já
// sai com os ajustes no lugar (sliders posicionados + check na barra). ──────
function autoconfig(): PixelCanvas {
  const c = stage();

  // Pinos antes do corpo: o corpo pinta por cima da raiz de cada pino. Cor
  // chapada, sem `shade`: com 2px de largura o contorno ocuparia o pino todo.
  for (const px of [11, 15, 19, 23]) {
    c.fill(rect(px, 10, 2, 5), METAL.shade);
    c.fill(rect(px, 31, 2, 5), METAL.shade);
  }
  for (const py of [16, 20, 24, 28]) {
    c.fill(rect(4, py, 5, 2), METAL.shade);
    c.fill(rect(27, py, 5, 2), METAL.shade);
  }
  c.shade(rect(8, 13, 20, 20), DARK);
  c.shade(rect(13, 18, 10, 10), CYAN);
  // Reflexo do die — um pixel claro no canto é o que faz o quadrado ler como
  // vidro/silício e não como botão.
  c.set(15, 20, "#ffffff");

  // Três chevrons em degradê de roxo: a leitura "andando" para a janela.
  const chevron = ["XX....", ".XX...", "..XX..", "...XX.", "....XX", "...XX.", "..XX..", ".XX...", "XX...."];
  c.sprite(34, 18, chevron, { X: ACCENT.shade });
  c.sprite(39, 18, chevron, { X: ACCENT.base });
  c.sprite(44, 18, chevron, { X: ACCENT.light });

  // Janela do emulador: contorno, barra de título, corpo.
  c.fill(rect(52, 6, 26, 36), OUT);
  c.fill(rect(53, 7, 24, 4), FILL_STRONG);
  c.fill(rect(53, 12, 24, 29), PANEL);
  for (const dx of [55, 58, 61]) c.fill(rect(dx, 8, 2, 2), MUTED);
  c.sprite(70, 6, CHECK, { X: CYAN.base });

  // Sliders: rótulo sem texto (tracinho), trilho, parte preenchida, cursor.
  for (const [ty, knob] of [
    [18, 67],
    [26, 61],
    [34, 71],
  ] as const) {
    c.fill(rect(56, ty - 4, 7, 1), LINE_STRONG);
    c.fill(rect(56, ty, 18, 2), LINE_STRONG);
    c.fill(rect(56, ty, knob - 56, 2), ACCENT.base);
    c.shade(rect(knob - 1, ty - 2, 4, 6), CREAM, 0);
  }
  return c;
}

// ── 2. Parecer honesto: medidor de patamares com três acesos; o próximo
// (contorno âmbar) aponta para o componente que segura — a placa de vídeo,
// marcada com cantos de seleção. CPU e memória ficam ali, sem destaque: o
// parecer nomeia a peça, não dá nota à máquina. ─────────────────────────────
function verdict(): PixelCanvas {
  const c = stage();

  c.fill(rect(8, 6, 64, 11), OUT);
  c.fill(rect(9, 7, 62, 9), PANEL);
  for (let i = 0; i < 5; i++) {
    const x = 11 + i * 12;
    if (i < 3) c.shade(rect(x, 9, 10, 5), ACCENT, 0);
    else if (i === 3) {
      c.fill(rect(x, 9, 10, 5), AMBER.base);
      c.fill(rect(x + 1, 10, 8, 3), "#241a0f"); // --amber-bg: alvo ainda vazio
    } else c.fill(rect(x, 9, 10, 5), FILL_STRONG);
  }

  // Ponteiro tracejado do patamar seguinte até a peça.
  for (let y = 18; y < 23; y += 2) c.fill(rect(51, y, 2, 1), AMBER.base);
  c.sprite(48, 24, ["XXXXXXXX", ".XXXXXX.", "..XXXX..", "...XX..."], { X: AMBER.base });

  // CPU (sem destaque): corpo grafite com pinos e die apagado.
  for (const px of [10, 13, 16]) {
    c.fill(rect(px, 30, 1, 2), METAL.shade);
    c.fill(rect(px, 41, 1, 2), METAL.shade);
  }
  c.shade(rect(8, 31, 11, 10), DARK);
  c.fill(rect(11, 34, 5, 4), CYAN.shade);

  // Memória (sem destaque): pente com três chips e contatos dourados.
  c.shade(rect(22, 34, 14, 8), pal("#2f6b52", "#23503d", "#3f8a6a"));
  for (const px of [24, 28, 32]) c.fill(rect(px, 36, 3, 3), PIT.shade);
  for (let px = 23; px < 35; px += 2) c.set(px, 42, AMBER.shade);

  // Placa de vídeo: corpo, duas ventoinhas, conector.
  c.shade(rect(40, 30, 30, 12), DARK);
  for (const fx of [48, 62]) {
    c.shade(ellipse(fx, 36, 4.6, 4.6), PIT, 0);
    c.fill(rect(fx - 1, 35, 2, 2), MUTED);
  }
  for (let px = 44; px < 66; px += 2) c.set(px, 42, AMBER.shade);

  // Cantos de seleção: "é esta aqui", sem precisar de rótulo.
  const corner = (x: number, y: number, sx: 1 | -1, sy: 1 | -1) => {
    for (let k = 0; k < 4; k++) {
      c.set(x + k * sx, y, AMBER.base);
      c.set(x, y + k * sy, AMBER.base);
    }
  };
  corner(37, 28, 1, 1);
  corner(72, 28, -1, 1);
  corner(37, 44, 1, -1);
  corner(72, 44, -1, -1);
  return c;
}

// ── 3. Biblioteca local: a pasta que já está no disco é só LIDA (seta
// pontilhada, ciano = o sistema informa) e vira a grade de capas. A pasta não
// sai do lugar nem se esvazia — nada é movido nem copiado. ─────────────────
function library(): PixelCanvas {
  const c = stage();

  // Fundo da pasta com a aba — a aba à esquerda, livre do conteúdo, é o que
  // faz a caixa creme ler como pasta e não como caixa.
  c.shade(union(rect(5, 14, 10, 6), rect(5, 18, 26, 25)), CREAM_BACK, 0);
  // O que está lá dentro, espiando por cima da frente: um cartucho e um disco.
  c.shade(rect(16, 12, 8, 11), METAL, 0);
  c.fill(rect(18, 14, 4, 4), ACCENT.base);
  c.shade(ellipse(28, 18, 5.5, 5.5), CYAN, 0);
  c.fill(rect(27, 17, 2, 2), OUT); // furo do disco
  // Frente da pasta.
  c.shade(rect(4, 22, 28, 21), CREAM);

  // Leitura: tracejado + ponta, em ciano.
  for (const px of [35, 38, 41]) c.fill(rect(px, 27, 2, 1), CYAN.base);
  c.sprite(44, 24, ["X...", "XX..", "XXX.", "XXXX", "XXX.", "XX..", "X..."], { X: CYAN.base });

  // Duas prateleiras de capas. Cada capa: arte (cor do tema), faixa de
  // etiqueta creme com um traço escuro no lugar do título.
  const arts = [ACCENT, AMBER, CYAN, CYAN, ACCENT, AMBER];
  arts.forEach((art, i) => {
    const x = 51 + (i % 3) * 10;
    const y = i < 3 ? 8 : 25;
    c.shade(rect(x, y, 8, 12), art, 0);
    c.fill(rect(x + 1, y + 8, 6, 3), CREAM.base);
    c.fill(rect(x + 2, y + 9, 3, 1), "#1d1a2b"); // --cart-label-ink
    c.fill(rect(x + 3, y + 3, 2, 2), art.light);
  });
  c.fill(rect(49, 20, 31, 1), LINE_STRONG);
  c.fill(rect(49, 37, 31, 1), LINE_STRONG);
  return c;
}

// ── 4. Camada social: dois jogadores (monitores) ligados; pelo link passam
// save state (disquete), perfil de controle e textura. O cartucho — a ROM —
// fica barrado embaixo do link, com o sinal de proibido: não circula. ───────
function social(): PixelCanvas {
  const c = stage();

  const monitor = (x: number) => {
    // Mais largo que alto: em pé e estreito, lia como gabinete, não monitor.
    c.shade(rect(x + 4, 38, 10, 5), DARK, 0); // base
    c.fill(rect(x + 7, 33, 4, 5), DARK.shade); // pescoço
    c.shade(rrect(x, 16, x + 18, 34, 2), DARK);
    c.fill(rect(x + 3, 19, 12, 10), "#0d2b3a");
    // Tela acesa: fileiras de "scanline" em ciano escuro e um reflexo.
    c.fill(rect(x + 3, 21, 12, 1), "#12475c");
    c.fill(rect(x + 3, 24, 12, 1), "#12475c");
    c.fill(rect(x + 3, 27, 12, 1), "#12475c");
    c.set(x + 4, 20, CYAN.light);
    c.set(x + 15, 31, CYAN.base); // LED de ligado
  };
  monitor(2);
  monitor(60);

  // O link entre os dois.
  for (let x = 22; x < 59; x += 2) c.set(x, 25, CONTROL);

  // O que viaja: disquete (save state), controle (perfil), textura.
  c.sprite(24, 13, ["OOOOOOO.", "OammmaaO", "OammmaaO", "OaaaaaaO", "OccccccO", "OccccccO", "OOOOOOOO"], {
    O: OUT,
    a: ACCENT.base,
    m: METAL.base,
    c: CREAM.base,
  });
  c.sprite(34, 13, [".OOOOOOOOOOO.", "OcccccccccccO", "OcdcccccccbcO", "OdddcccccbcbO", "OcdcccccccbcO", "OcccOOOOOcccO", ".OOO.....OOO."], {
    O: OUT,
    c: CYAN.base,
    d: PIT.base,
    b: "#ffffff",
  });
  c.sprite(50, 13, ["OOOOOOO", "OaAaAaO", "OAaAaAO", "OaAaAaO", "OAaAaAO", "OaAaAaO", "OOOOOOO"], {
    O: OUT,
    a: AMBER.base,
    A: CREAM.base,
  });

  // O cartucho que não passa: corpo metálico, etiqueta, e o "proibido" por cima.
  // Menor que os itens que circulam somados: a mensagem da tela é "isto
  // circula"; o "isto não" é a ressalva, não o assunto.
  c.shade(rect(37, 31, 8, 9), METAL, 0);
  c.fill(rect(39, 33, 4, 3), ACCENT.base);
  const ring = minus(ellipse(41, 35.5, 7, 7), ellipse(41, 35.5, 5.2, 5.2));
  const bar = (x: number, y: number) =>
    Math.abs(x - 41 - (y - 35.5)) <= 1.1 && ellipse(41, 35.5, 5.6, 5.6)(x, y);
  c.outlineOutside(union(ring, bar), OUT);
  c.fill(union(ring, bar), DANGER);
  return c;
}

const SCENES: Record<TourArtKind, [string, string][]> = {
  autoconfig: autoconfig().paths(),
  verdict: verdict().paths(),
  library: library().paths(),
  social: social().paths(),
};

/**
 * `shape-rendering="crispEdges"`: sem ele o navegador suaviza a borda de cada
 * faixa de 1 célula e a pixel art vira borrão ao ampliar (mesmo motivo de
 * `PixelController`).
 */
export function TourArt({ art }: { art: TourArtKind }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" aria-hidden="true" className="block h-auto w-full">
      {SCENES[art].map(([color, d]) => (
        <path key={color} fill={color} d={d} />
      ))}
    </svg>
  );
}
