import type { Dict } from "../i18n/i18n";

export const dict = {
  title: { "pt-BR": "Tecla de print", en: "Screenshot key" },
  modalTitle: { "pt-BR": "Tecla de print do {{name}}", en: "{{name}} screenshot key" },
  intro: {
    "pt-BR": "O print é feito pelo próprio {{name}}. Ao fechar o jogo aberto pelo ZeuX, os prints vão para a galeria do jogo.",
    en: "{{name}} takes the screenshot itself. When you close a game opened through ZeuX, the screenshots move to the game's gallery.",
  },
  loading: { "pt-BR": "Lendo o atalho…", en: "Reading the shortcut…" },
  readError: { "pt-BR": "Não foi possível ler o atalho de print.", en: "Could not read the screenshot shortcut." },
  running: {
    "pt-BR": "Feche o {{name}} para mudar o atalho — ele grava a configuração dele ao fechar e desfaria a mudança.",
    en: "Close {{name}} to change the shortcut — it saves its settings on exit and would undo the change.",
  },
  closeFirst: {
    "pt-BR": "Salve com o {{name}} fechado: se ele estiver aberto, ao fechar ele desfaz a mudança.",
    en: "Save with {{name}} closed: if it's open, it undoes the change when it exits.",
  },
  mode: { "pt-BR": "Atalho", en: "Shortcut" },
  modeKeyboard: { "pt-BR": "Tecla do teclado", en: "Keyboard key" },
  modeController: { "pt-BR": "Combinação do controle", en: "Controller combination" },
  modeNone: { "pt-BR": "Nenhum", en: "None" },
  keyboard: { "pt-BR": "Teclado", en: "Keyboard" },
  controller: { "pt-BR": "Controle", en: "Controller" },
  none: { "pt-BR": "Nenhuma", en: "None" },
  combo: { "pt-BR": "Combinação", en: "Combination" },
  key: { "pt-BR": "Tecla", en: "Key" },
  hold: { "pt-BR": "Segure", en: "Hold" },
  press: { "pt-BR": "e aperte", en: "and press" },
  defaultSuffix: { "pt-BR": "(padrão)", en: "(default)" },
  oneBinding: {
    "pt-BR": "O {{name}} aceita uma ligação por atalho: teclado OU controle.",
    en: "{{name}} takes one binding per shortcut: keyboard OR controller.",
  },
  retroarchCombo: {
    "pt-BR": "No RetroArch, o primeiro botão é o de ativação de atalhos: vale para os outros atalhos de controle dele também.",
    en: "In RetroArch, the first button is the hotkey enable button: it also applies to its other controller shortcuts.",
  },
  guideNote: {
    "pt-BR": "O botão Xbox e a tecla PrintScreen ficam de fora: o Windows e a Game Bar pegam os dois antes do emulador.",
    en: "The Xbox button and PrintScreen are left out: Windows and the Game Bar grab them before the emulator.",
  },
  unrecognized: {
    "pt-BR": "Atalho atual, escolhido no próprio emulador: {{value}}. Salvar aqui troca por este.",
    en: "Current shortcut, set in the emulator itself: {{value}}. Saving here replaces it.",
  },
  folder: { "pt-BR": "Pasta onde o {{name}} grava os prints", en: "Folder where {{name}} saves screenshots" },
  openFolder: { "pt-BR": "Abrir pasta de prints", en: "Open screenshots folder" },
  folderMissing: {
    "pt-BR": "A pasta ainda não existe — o emulador cria no primeiro print.",
    en: "The folder doesn't exist yet — the emulator creates it on the first screenshot.",
  },
  save: { "pt-BR": "Salvar atalho", en: "Save shortcut" },
  saving: { "pt-BR": "Salvando…", en: "Saving…" },
  saved: { "pt-BR": "Atalho de print salvo.", en: "Screenshot shortcut saved." },
  "button.back": { "pt-BR": "Select / Back", en: "Select / Back" },
  "button.start": { "pt-BR": "Start", en: "Start" },
  "button.l1": { "pt-BR": "L1 / LB", en: "L1 / LB" },
  "button.r1": { "pt-BR": "R1 / RB", en: "R1 / RB" },
  "button.l3": { "pt-BR": "L3 (clique do analógico esquerdo)", en: "L3 (left stick click)" },
  "button.r3": { "pt-BR": "R3 (clique do analógico direito)", en: "R3 (right stick click)" },
} satisfies Dict;
