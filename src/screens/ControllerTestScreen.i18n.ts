import type { Dict } from "../i18n/i18n";

export const dict = {
  title: {
    "pt-BR": "Testar controle",
    en: "Test controller",
  },
  subtitle: {
    "pt-BR": "Aperte qualquer botão ou mova um analógico — o desenho reage ao vivo, do jeito que o controle está reportando agora.",
    en: "Press any button or move a stick — the diagram reacts live, exactly as the controller is reporting right now.",
  },
  back: {
    "pt-BR": "Voltar",
    en: "Back",
  },
  connectedAs: {
    "pt-BR": "Controle: {{name}}",
    en: "Controller: {{name}}",
  },
  noController: {
    "pt-BR": "Nenhum controle conectado. Plugue um e aperte qualquer botão.",
    en: "No controller connected. Plug one in and press any button.",
  },
  dpad: {
    "pt-BR": "Direcional",
    en: "D-pad",
  },
  leftStick: {
    "pt-BR": "Analógico esquerdo",
    en: "Left stick",
  },
  rightStick: {
    "pt-BR": "Analógico direito",
    en: "Right stick",
  },
  shoulders: {
    "pt-BR": "Ombro (L1/R1)",
    en: "Shoulder (L1/R1)",
  },
  triggers: {
    "pt-BR": "Gatilho (L2/R2)",
    en: "Trigger (L2/R2)",
  },
  faceButtons: {
    "pt-BR": "Botões de face",
    en: "Face buttons",
  },
  // Desenho genérico de propósito — sem "A/B/X/Y" nem "✕/○/□/△", que são
  // vocabulário de fabricante (Xbox e PlayStation, respectivamente). Cada
  // botão mostra só o índice que a Gamepad API reporta — mesma convenção que
  // um jstest-gui usaria, sem escolher marca nenhuma.
  buttonIndexNote: {
    "pt-BR": "Os números seguem o índice padrão da Gamepad API — o mesmo em qualquer controle no mapeamento \"standard\".",
    en: "The numbers follow the standard Gamepad API index — the same on any controller in \"standard\" mapping.",
  },
} satisfies Dict;
