/**
 * Geometria da foto de controle (`src/assets/controller-reference.png`) e o
 * palpite de qual região do controle uma ação de mapeamento pertence.
 *
 * Existe como módulo próprio porque duas telas leem a MESMA foto e precisam
 * concordar sobre onde cada botão está: `ControllerTestScreen` acende o botão
 * apertado em cima da imagem, e `EmulatorBindingsPanel` agrupa os cards de
 * mapeamento ao redor dela. Duas tabelas de coordenadas separadas divergiriam
 * no primeiro ajuste fino.
 *
 * Sobre a decisão de usar uma foto de controle de marca real (com a logo e os
 * botões A/B/X/Y visíveis), ver docs/decisoes.md, "Foto de controle real no
 * lugar do SVG desenhado à mão (2026-09-08)".
 */

/**
 * Agrupamento espacial — é isso que o painel de mapeamento usa para decidir de
 * que lado da foto o card de uma ação vai. Mais grosso que o botão individual
 * de propósito: "de que lado, e a que altura" é tudo que o layout precisa.
 */
export type ControllerRegion =
  | "dpad"
  | "face"
  | "leftStick"
  | "rightStick"
  | "shoulderLeft"
  | "shoulderRight"
  | "triggerLeft"
  | "triggerRight"
  | "center";

export interface ControllerSpot {
  /** Região a que este ponto pertence (o painel agrupa por ela). */
  region: ControllerRegion;
  /** Centro e tamanho em PORCENTAGEM da foto, nunca em px: a imagem encolhe
   *  junto com a janela (ver CLAUDE.md, "Layout responsivo"), e coordenada
   *  fixa descolaria do botão no primeiro redimensionamento. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Medido à mão sobre a foto já recortada (760×521), com uma grade de 5%
 * sobreposta — ver o relatório da sessão de 2026-09-08. A foto é uma
 * perspectiva de três quartos, não uma vista frontal: por isso os pares
 * espelhados (L2/R2, ombros, analógicos) NÃO têm coordenadas simétricas, e
 * "consertar" isso para ficar simétrico desalinha o realce do botão real.
 */
export const CONTROLLER_SPOTS: Record<string, ControllerSpot> = {
  triggerLeft: { region: "triggerLeft", x: 17, y: 9, w: 14, h: 13 },
  triggerRight: { region: "triggerRight", x: 82.5, y: 11.5, w: 14, h: 14 },
  shoulderLeft: { region: "shoulderLeft", x: 17.5, y: 18.5, w: 21, h: 9 },
  shoulderRight: { region: "shoulderRight", x: 79.5, y: 22.5, w: 23, h: 10 },

  home: { region: "center", x: 45.5, y: 35.5, w: 10, h: 12 },
  select: { region: "center", x: 36, y: 53, w: 6.5, h: 7 },
  start: { region: "center", x: 53.5, y: 55.7, w: 6, h: 7 },

  leftStick: { region: "leftStick", x: 14.5, y: 51, w: 17, h: 22 },
  rightStick: { region: "rightStick", x: 60, y: 79, w: 16, h: 21 },

  dpadUp: { region: "dpad", x: 31, y: 66.5, w: 7, h: 8 },
  dpadDown: { region: "dpad", x: 31, y: 80, w: 7, h: 8 },
  dpadLeft: { region: "dpad", x: 25.5, y: 72.5, w: 8, h: 7 },
  dpadRight: { region: "dpad", x: 37, y: 73.5, w: 8, h: 7 },

  faceTop: { region: "face", x: 78, y: 47.7, w: 9.5, h: 12 },
  faceLeft: { region: "face", x: 68.2, y: 57.8, w: 9.5, h: 11 },
  faceRight: { region: "face", x: 85.8, y: 58.3, w: 9.5, h: 11 },
  faceBottom: { region: "face", x: 76, y: 68.3, w: 9.5, h: 11 },
};

/** Tira acento e caixa: o nome da ação vem do adapter, e cada um escreve do
 *  seu jeito ("L2", "l2", "Botão L2 (gatilho)"). */
function normalize(action: string): string {
  return action
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Lado declarado no nome. Radical solto ("esquerd", "direit") em vez de
// palavra inteira porque gênero e número variam por adapter — "esquerdo",
// "esquerda", "direcionais direitos" — e `\besquerd\b` nunca casaria com
// nenhum deles, já que a letra seguinte ainda é caractere de palavra.
function isLeft(n: string): boolean {
  return /esquerd/.test(n) || /\bleft\b/.test(n);
}
function isRight(n: string): boolean {
  return /direit/.test(n) || /\bright\b/.test(n);
}

/**
 * Palpite de região a partir do NOME da ação — best-effort, nunca garantia.
 *
 * O conjunto de ações vem da API (`GET /emulators/{id}/bindings`) e varia por
 * adapter: o PCSX2 fala em `Cross`/`Triangle`/`L2`, o RetroArch em `a`/`b`/`l2`,
 * e um adapter futuro pode trazer hotkey nenhuma delas ("Salvar estado"). Por
 * isso a função devolve `null` em vez de chutar: quem chama tem obrigação de
 * continuar mostrando a ação (o painel joga essas em "Outras ações"), porque
 * uma ação que some da tela é uma ação que ninguém consegue mapear.
 *
 * A ordem das regras importa e é a parte frágil:
 *
 * - Vocabulário de face vem PRIMEIRO. "Botão A (direita)" contém "direita" e
 *   cairia no direcional se o direcional fosse testado antes.
 * - `l3`/`r3` antes de `l2`/`r2` antes de `l1`/`l`, senão `\bl\b` engoliria
 *   tudo que começa com L.
 * - "Analógico" contém a letra A, mas a regra de face exige a letra ISOLADA
 *   (ou precedida de "botão"/"button"), nunca como substring.
 */
export function regionForAction(action: string): ControllerRegion | null {
  const n = normalize(action);

  // Face — vocabulário PlayStation (PCSX2) e letra isolada (RetroArch).
  if (/\b(cross|circle|square|triangle|quadrado|triangulo|bola|xis)\b/.test(n)) return "face";
  if (/\b(bot(ao|oes)|button)\s*\(?\s*[abxy]\b/.test(n)) return "face";
  if (/^[abxy]$/.test(n)) return "face";
  if (/\bface\b/.test(n)) return "face";

  // TODAS as siglas vêm antes de qualquer palavra descritiva. A ordem foi
  // corrigida ao ver "Botão L2 (gatilho analógico)" cair em "Outras ações" no
  // preview de 2026-09-08: a regra genérica de "analógico" casava com o
  // parêntese explicativo e engolia a sigla que já dizia tudo.
  if (/\bl3\b/.test(n)) return "leftStick";
  if (/\br3\b/.test(n)) return "rightStick";
  if (/\b(l2|lt|zl)\b/.test(n)) return "triggerLeft";
  if (/\b(r2|rt|zr)\b/.test(n)) return "triggerRight";
  if (/\b(l1|lb|l)\b/.test(n)) return "shoulderLeft";
  if (/\b(r1|rb|r)\b/.test(n)) return "shoulderRight";

  // Descrição por extenso, sem sigla — só aqui, e sempre exigindo o lado.
  if (/\b(analog|analogico|stick|thumb|polegar|eixo|axis)\b/.test(n)) {
    if (isRight(n)) return "rightStick";
    if (isLeft(n)) return "leftStick";
    return null; // analógico sem lado declarado: honesto é não escolher um.
  }
  if (/\b(gatilho|trigger)\b/.test(n)) {
    if (isRight(n)) return "triggerRight";
    if (isLeft(n)) return "triggerLeft";
    return null;
  }
  if (/\b(ombro|shoulder|bumper)\b/.test(n)) {
    if (isRight(n)) return "shoulderRight";
    if (isLeft(n)) return "shoulderLeft";
    return null;
  }

  // Direcional — por último entre os físicos, porque "esquerda"/"direita"
  // aparecem como qualificador em quase toda outra família.
  if (/\b(up|down|cima|baixo)\b/.test(n) || isLeft(n) || isRight(n)) return "dpad";
  if (/\b(direcional|dpad|d-pad|digital|cruz)\b/.test(n)) return "dpad";

  // Centro.
  if (/\b(select|start|home|guide|menu|view|options|opcoes|share|back|voltar)\b/.test(n)) return "center";

  return null;
}
