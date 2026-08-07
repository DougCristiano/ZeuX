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

export function consoleAccentColor(consoleId: string): string {
  const brand = BRAND_COLORS[consoleId];
  if (brand) return brand;

  let hash = 0;
  for (let i = 0; i < consoleId.length; i++) {
    hash = (hash * 31 + consoleId.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}
