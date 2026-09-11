/**
 * Cor de identidade por console (2026-08-05, a pedido do Douglas). Decorativa
 * de propósito — não comunica estado nenhum (isso continua sendo texto/badge,
 * nunca cor) — mas determinística: o mesmo console_id sempre resolve pra
 * mesma cor, em toda tela, pra "padronizar de quem é o jogo" — reconhecer o
 * console pela cor sem precisar ler a sigla.
 *
 * M10 (docs/sprint-m-plano.md, 2026-08-07): a paleta de 10 cores por hash
 * (ainda abaixo, como `FALLBACK_PALETTE`) dava ~3 consoles por cor entre os
 * 33 do catálogo — o SNES podia sair rosa, sem relação nenhuma com a marca.
 * Decidido pelo Douglas: cor coerente com o fabricante (azul PlayStation,
 * vermelho Nintendo, azul Sega etc.), variando em **tom/brilho**, nunca em
 * matiz, dentro da mesma família — a regra que já valia para PS1/PS2/PS3
 * também resolve marcas vizinhas de matiz parecido (o próprio Douglas citou
 * "azul PlayStation vs. azul Sega" como o caso a desempatar assim: PlayStation
 * fica mais índigo, hue ~218–225°; Sega fica mais ciano, hue ~191–204° — as
 * duas famílias não se tocam).
 *
 * `BRAND_COLORS` cobre os 33 consoles do catálogo hoje (verificado contra
 * `internal/verdict/data/consoles.json`, os mesmos 33 nomes) — mais do que os
 * "pelo menos 15" do critério de aceite, de propósito: uma tabela parcial
 * arriscaria o hash de fallback sortear, pra um dos consoles sem entrada
 * própria, uma cor que colide com a família cuidadosamente separada de outro
 * fabricante — o problema que este item existe para resolver. `FALLBACK_PALETTE`
 * continua existindo só para um `console_id` que o catálogo venha a adicionar
 * depois desta tabela — nunca fica sem cor (não há teste automatizado de
 * catálogo no front, ver decisão abaixo; conferido manualmente contra
 * `consoles.json` nesta sessão, os 33 ids batem 1 a 1).
 *
 * Onde a cor aparece (critério do item — não pode competir com outras cores
 * no mesmo tile): borda/glow do `GameCover` no foco e badge de plataforma
 * (`Badge accentColor`) — nunca ao mesmo tempo que outro elemento colorido
 * própio teria significado (a estrela de favorito é âmbar fixo, o botão
 * primário é roxo fixo — nenhum dos dois muda com o console, então não
 * competem visualmente com a cor de identidade).
 */
const BRAND_COLORS: Readonly<Record<string, string>> = {
  // Sony / PlayStation — azul, mais índigo que o ciano do Sega abaixo.
  ps1: "#4C7CE0",
  ps2: "#2F5FDB",
  ps3: "#1B3FA8",
  psp: "#6689DB",
  vita: "#537DC6",

  // Sega — azul mais ciano, faixa de matiz separada da PlayStation.
  mastersystem: "#29ABE2",
  megadrive: "#0089CF",
  gamegear: "#5FC9E8",
  segacd: "#0074B0",
  sega32x: "#1F9AC7",
  saturn: "#005A96",
  dreamcast: "#7FD4E8",

  // Nintendo — vermelho, mesma faixa de matiz (~342–352°) em todos os 12,
  // variando só tom/brilho (o próprio Virtual Boy, cujo visor é vermelho de
  // verdade, acabou com o tom mais escuro da família por coincidência feliz).
  nes: "#C8102E",
  snes: "#A61B33",
  n64: "#E01B3D",
  gamecube: "#8A1538",
  wii: "#D6415C",
  wiiu: "#93233D",
  gb: "#C6395A",
  gbc: "#E63950",
  gba: "#B0203D",
  nds: "#D93A56",
  "3ds": "#E0506D",
  virtualboy: "#7A1F35",

  // Microsoft — verde Xbox.
  xbox: "#3A9D23",
  xbox360: "#5FBF3A",

  // SNK — dourado (a identidade visual do Neo Geo é dourado sobre preto).
  neogeo: "#D4A017",
  ngpc: "#E8C158",

  // Um console cada — sem família pra desempatar, só precisam não colidir
  // com as faixas acima.
  atari2600: "#C1440E", // laranja queimado
  pcengine: "#17A398", // teal
  "3do": "#8E7CC3", // lilás dessaturado
  wonderswan: "#C13FBF", // magenta
  arcade: "#F1279D", // rosa vibrante — categoria, não fabricante; de propósito o mais saturado da tabela
};

/**
 * Paleta curta e fixa usada só como fallback (era a paleta inteira antes do
 * M10) — cobre qualquer `console_id` fora de `BRAND_COLORS`, garantindo que
 * um console adicionado ao catálogo depois desta tabela nunca fique sem cor.
 */
const FALLBACK_PALETTE = [
  "#9D4EFF", // roxo (--accent)
  "#00E5FF", // ciano (--accent-secondary)
  "#FF6B1A", // laranja (--amber)
  "#00D68F", // verde
  "#FF4D6D", // rosa/vermelho
  "#FFD60A", // amarelo
  "#4D96FF", // azul
  "#C77DFF", // lilás
  "#06D6A0", // teal
  "#FF9F1C", // âmbar claro
] as const;

/**
 * Fabricante de cada console — a mesma informação que já vivia só nos
 * comentários de `BRAND_COLORS` acima ("Sony / PlayStation", "Sega",
 * "Nintendo"...), agora legível por código. Fica NESTE arquivo de propósito:
 * cor de identidade e agrupamento por fabricante saem da mesma fonte, então
 * não há como uma tabela dizer que o Mega Drive é Sega e a outra pintá-lo de
 * vermelho.
 *
 * `"outros"` reúne quem não tem família com mais de um console no catálogo
 * (3DO/Panasonic, WonderSwan/Bandai) e o `arcade`, que é categoria e não
 * aparelho. Um `console_id` novo, fora desta tabela, também cai em `"outros"`
 * — nunca fica sem grupo.
 */
export type ConsoleFamily =
  | "nintendo"
  | "sony"
  | "sega"
  | "microsoft"
  | "snk"
  | "atari"
  | "nec"
  | "outros";

const CONSOLE_FAMILY: Readonly<Record<string, ConsoleFamily>> = {
  ps1: "sony", ps2: "sony", ps3: "sony", psp: "sony", vita: "sony",
  mastersystem: "sega", megadrive: "sega", gamegear: "sega", segacd: "sega",
  sega32x: "sega", saturn: "sega", dreamcast: "sega",
  nes: "nintendo", snes: "nintendo", n64: "nintendo", gamecube: "nintendo",
  wii: "nintendo", wiiu: "nintendo", gb: "nintendo", gbc: "nintendo",
  gba: "nintendo", nds: "nintendo", "3ds": "nintendo", virtualboy: "nintendo",
  xbox: "microsoft", xbox360: "microsoft",
  neogeo: "snk", ngpc: "snk",
  atari2600: "atari",
  pcengine: "nec",
};

export function consoleFamily(consoleId: string): ConsoleFamily {
  return CONSOLE_FAMILY[consoleId] ?? "outros";
}

/**
 * Cor da família, para o chip de fabricante ativo. Um representante de cada
 * faixa de matiz que `BRAND_COLORS` já usa — não uma paleta nova, o tom médio
 * da família. `"outros"` usa o roxo `--accent` porque não é uma marca, é "o
 * resto".
 */
const FAMILY_COLORS: Readonly<Record<ConsoleFamily, string>> = {
  nintendo: "#E01B3D",
  sony: "#2F5FDB",
  sega: "#0089CF",
  microsoft: "#3A9D23",
  snk: "#D4A017",
  atari: "#C1440E",
  nec: "#17A398",
  outros: "#9D4EFF",
};

export function consoleFamilyColor(family: ConsoleFamily): string {
  return FAMILY_COLORS[family];
}

/**
 * Variante clara da cor de identidade, usada **só quando a cor vira texto**
 * (2026-09-11, achado de uma auditoria WCAG sobre a sigla do `ConsoleCard`).
 *
 * O problema medido: a sigla do console era pintada com `consoleAccentColor`
 * direto sobre `--fill` (#1a2542) e **25 dos 33 consoles** ficavam abaixo do
 * 4.5:1 que a WCAG 1.4.3 AA exige para texto normal — `virtualboy` em 1.50:1,
 * `gamecube` em 1.62:1, `ps3` em 1.67:1, e casos que quase passavam (`psp`
 * 4.44:1, `xbox` 4.34:1). Cor de marca é calibrada para borda/glow sobre
 * fundo escuro, não para carregar texto.
 *
 * A calibração segue a mesma regra do resto da paleta — "variar tom/brilho,
 * nunca matiz" (o comentário de `BRAND_COLORS` acima, e `--control-border` em
 * src/index.css): converte o hex de marca para HSL, **mantém H e S** e sobe
 * só o L em passos de 0.5%, medindo a cada passo o contraste contra `--fill`
 * pela fórmula da WCAG (hex → sRGB → linear γ2.4 → L = 0.2126R + 0.7152G +
 * 0.0722B → ratio = (L1+0.05)/(L2+0.05)), até passar de **4.6:1** — a folga
 * de 0.1 acima do piso existe porque o arredondamento de volta para 8 bits
 * por canal pode custar alguns centésimos.
 *
 * Verificado com esta mesma conta sobre os 33 ids do catálogo: todos entre
 * 4.60:1 e 9.00:1 depois da subida; os 8 que já passavam (Dreamcast, Game
 * Gear, NGPC, Neo Geo, Xbox 360, Master System, PC Engine, 32X) saem
 * **inalterados**, porque o laço para antes do primeiro passo. Procedural em
 * vez de uma segunda tabela de 33 hexes à mão de propósito: uma tabela
 * paralela poderia divergir de `BRAND_COLORS` numa edição futura, e um
 * `console_id` novo (que cai em `FALLBACK_PALETTE`) também sai corrigido de
 * graça.
 *
 * **Isto não substitui `consoleAccentColor`.** A cor de identidade continua
 * exatamente a mesma na borda, no glow e no gradiente do compartimento — a
 * família de cada fabricante continua separada por matiz lá, que é onde a cor
 * carrega o reconhecimento. Aqui subiu o brilho porque o olho precisa LER.
 */
export function consoleTextColor(consoleId: string): string {
  const base = consoleAccentColor(consoleId);
  const cached = textColorCache.get(base);
  if (cached) return cached;

  const [h, s, l0] = hexToHsl(base);
  let result = base;
  for (let l = l0; l <= 1 && contrastOnFill(result) < MIN_TEXT_CONTRAST; l += 0.005) {
    result = hslToHex(h, s, Math.min(1, l + 0.005));
  }
  textColorCache.set(base, result);
  return result;
}

/** `--fill` (src/index.css) — o fundo do compartimento onde a sigla é lida. */
const FILL_LUMINANCE = relativeLuminance("#1a2542");
/** 4.5:1 é o piso da WCAG AA; a folga cobre o arredondamento para 8 bits. */
const MIN_TEXT_CONTRAST = 4.6;
const textColorCache = new Map<string, string>();

function contrastOnFill(hex: string): number {
  const l = relativeLuminance(hex);
  return (Math.max(l, FILL_LUMINANCE) + 0.05) / (Math.min(l, FILL_LUMINANCE) + 0.05);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function consoleAccentColor(consoleId: string): string {
  const brand = BRAND_COLORS[consoleId];
  if (brand) return brand;

  let hash = 0;
  for (let i = 0; i < consoleId.length; i++) {
    hash = (hash * 31 + consoleId.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}
