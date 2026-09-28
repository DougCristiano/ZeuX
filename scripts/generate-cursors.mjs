// Gera src/cursors.css: o cursor do mouse desenhado em pixel art, como PNG em
// data URI. Roda à mão (`node scripts/generate-cursors.mjs`), nunca no build —
// mesma regra dos geradores em cmd/generate-*: o resultado vai para o
// repositório, e o build não depende de rodar nada.
//
// PNG e não SVG de propósito: `cursor: url(...)` com SVG depende do WebView
// (WebView2, WebKitGTK e WKWebView tratam tamanho e antialias de um jeito), e
// pixel art só é pixel art se cada célula cair em pixels inteiros. Cada célula
// da grade vira um bloco SCALE×SCALE.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SCALE = 2;

// Paleta do app (src/index.css): contorno = --paper, seta = --cart-label (a
// etiqueta creme dos cartuchos), mão = --accent-hover (roxo: "aqui você age").
const PALETTE = {
  K: [10, 15, 31], // contorno
  W: [232, 224, 208], // preenchimento da seta
  P: [177, 116, 255], // preenchimento da mão
};

// Cada linha é uma fileira da grade; "." é transparente. Os dois desenhos
// precisam ter todas as linhas do mesmo tamanho (conferido abaixo).
const ARROW = {
  fill: "W",
  hotspot: [0, 0],
  rows: [
    "K..........",
    "KK.........",
    "KWK........",
    "KWWK.......",
    "KWWWK......",
    "KWWWWK.....",
    "KWWWWWK....",
    "KWWWWWWK...",
    "KWWWWWWWK..",
    "KWWWWWKKKK.",
    "KWWKWWK....",
    "KWK.KWWK...",
    "KK..KWWK...",
    "K....KWWK..",
    ".....KWWK..",
    "......KK...",
  ],
};

const HAND = {
  fill: "P",
  hotspot: [4, 0],
  rows: [
    "....KK........",
    "...KPPK.......",
    "...KPPK.......",
    "...KPPK.......",
    "...KPPKKK.....",
    "...KPPKPPKK...",
    "KK.KPPKPPKPKK.",
    "KPKKPPPPPPPPPK",
    "KPPKPPPPPPPPPK",
    ".KPPPPPPPPPPPK",
    "..KPPPPPPPPPPK",
    "..KPPPPPPPPPK.",
    "...KPPPPPPPPK.",
    "...KPPPPPPPK..",
    "....KPPPPPK...",
    "....KKKKKKK...",
  ],
};

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const body = Buffer.concat([head.subarray(4), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head.subarray(0, 4), body, tail]);
}

function png(rows) {
  const width = rows[0].length * SCALE;
  const height = rows.length * SCALE;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const line = rows[Math.floor(y / SCALE)];
    raw[y * (width * 4 + 1)] = 0; // filtro "nenhum"
    for (let x = 0; x < width; x++) {
      const cell = line[Math.floor(x / SCALE)];
      const color = PALETTE[cell];
      const at = y * (width * 4 + 1) + 1 + x * 4;
      if (color) raw.set([...color, 255], at);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function declaration(name, art) {
  const width = art.rows[0].length;
  for (const row of art.rows) {
    if (row.length !== width) throw new Error(`${name}: linha "${row}" tem ${row.length} colunas, esperava ${width}`);
  }
  const [hx, hy] = art.hotspot;
  const uri = `data:image/png;base64,${png(art.rows).toString("base64")}`;
  return `  --cursor-${name}: url("${uri}") ${hx * SCALE} ${hy * SCALE};`;
}

const css = `/*
 * GERADO por scripts/generate-cursors.mjs — não edite à mão; mude a grade no
 * script e rode-o de novo. Cursor do mouse em pixel art (PNG em data URI, ver
 * o porquê no cabeçalho do script). Usado por src/index.css.
 */
:root {
${declaration("arrow", ARROW)}
${declaration("hand", HAND)}
}
`;

writeFileSync(new URL("../src/cursors.css", import.meta.url), css);
console.log(`src/cursors.css escrito (${css.length} bytes)`);
