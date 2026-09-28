import { partSpot } from "./pixelController";

/**
 * Geometria do controle desenhado (`lib/pixelController.ts`) vista como
 * regiões, e o palpite de qual região uma ação de mapeamento pertence.
 *
 * Existe como módulo próprio porque três telas desenham o MESMO controle e
 * precisam concordar sobre onde cada botão está: `ControllerTestScreen` e
 * `ConfigureControllerScreen` acendem botões nele, e `EmulatorBindingsPanel`
 * agrupa os cards de mapeamento ao redor dele.
 *
 * Até 2026-09-28 as coordenadas eram medidas à mão sobre uma foto de controle
 * real (docs/decisoes.md, "Foto de controle real…" e "Controle em pixel art…").
 */

/**
 * Agrupamento espacial — é isso que o painel de mapeamento usa para decidir de
 * que lado do controle o card de uma ação vai. Mais grosso que o botão
 * individual de propósito: "de que lado, e a que altura" é tudo que o layout
 * precisa.
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
  /** Centro e tamanho em PORCENTAGEM do desenho, nunca em px: o controle
   *  encolhe junto com a janela (ver CLAUDE.md, "Layout responsivo"). */
  x: number;
  y: number;
  w: number;
  h: number;
}

const SPOT_REGIONS: Record<string, ControllerRegion> = {
  triggerLeft: "triggerLeft",
  triggerRight: "triggerRight",
  shoulderLeft: "shoulderLeft",
  shoulderRight: "shoulderRight",
  home: "center",
  select: "center",
  start: "center",
  leftStick: "leftStick",
  rightStick: "rightStick",
  dpadUp: "dpad",
  dpadDown: "dpad",
  dpadLeft: "dpad",
  dpadRight: "dpad",
  faceTop: "face",
  faceLeft: "face",
  faceRight: "face",
  faceBottom: "face",
};

/** Derivado da geometria desenhada — nunca mais medido à mão. */
export const CONTROLLER_SPOTS: Record<string, ControllerSpot> = Object.fromEntries(
  Object.entries(SPOT_REGIONS).map(([id, region]) => [id, { region, ...partSpot(id) }]),
);

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
