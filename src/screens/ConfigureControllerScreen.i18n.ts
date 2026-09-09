import type { Dict } from "../i18n/i18n";

export const dict = {
  title: {
    "pt-BR": "Configurar controle",
    en: "Configure controller",
  },
  subtitle: {
    "pt-BR": "Aperte cada botão do controle uma vez — o ZeuX aplica o mesmo mapeamento em todos os emuladores instalados.",
    en: "Press each controller button once — ZeuX applies the same mapping to every installed emulator.",
  },
  back: { "pt-BR": "Voltar", en: "Back" },
  noController: {
    "pt-BR": "Nenhum controle conectado. Plugue um e clique em Iniciar.",
    en: "No controller connected. Plug one in and click Start.",
  },
  connectedAs: { "pt-BR": "Controle: {{name}}", en: "Controller: {{name}}" },
  startButton: { "pt-BR": "Iniciar configuração", en: "Start setup" },
  cancelButton: { "pt-BR": "Cancelar", en: "Cancel" },
  restartButton: { "pt-BR": "Configurar de novo", en: "Reconfigure" },
  loadingEmulators: { "pt-BR": "Carregando emuladores…", en: "Loading emulators…" },
  loadEmulatorsError: {
    "pt-BR": "Não foi possível carregar a lista de emuladores.",
    en: "Could not load the emulator list.",
  },
  progressLabel: { "pt-BR": "{{current}} de {{total}}", en: "{{current}} of {{total}}" },
  waitingForButton: {
    "pt-BR": "Aperte o botão indicado no controle.",
    en: "Press the indicated button on the controller.",
  },
  skipButton: { "pt-BR": "Pular este botão", en: "Skip this button" },
  doneTitle: { "pt-BR": "Configuração concluída", en: "Setup complete" },
  doneSummary: {
    "pt-BR": "O ZeuX aplicou o mapeamento em {{count}} emulador(es).",
    en: "ZeuX applied the mapping to {{count}} emulator(s).",
  },
  noBindableEmulators: {
    "pt-BR": "Nenhum emulador instalado aceita mapeamento de controle pelo ZeuX ainda.",
    en: "No installed emulator accepts controller mapping through ZeuX yet.",
  },
  perAdapterNotesHeading: { "pt-BR": "Ressalvas por emulador", en: "Per-emulator notes" },
  // Nota registrada quando a própria chamada da API falha. Fica ao lado das
  // ressalvas do backend porque, para quem lê, as duas respondem a mesma
  // pergunta: "o que não ficou gravado?".
  writeFailed: {
    "pt-BR": "Não foi possível gravar {{action}}: {{error}}",
    en: "Could not write {{action}}: {{error}}",
  },

  // Rótulos das 16 posições físicas. Nomeiam o botão pelo lugar na foto e,
  // entre parênteses, pelo nome que a pessoa vê estampado no controle — os
  // dois vocabulários (PlayStation e Xbox) aparecem porque o ZeuX não sabe
  // qual controle está na mão de quem lê.
  target_faceBottom: { "pt-BR": "Botão inferior (Cross / A)", en: "Bottom button (Cross / A)" },
  target_faceRight: { "pt-BR": "Botão direito (Circle / B)", en: "Right button (Circle / B)" },
  target_faceLeft: { "pt-BR": "Botão esquerdo (Square / X)", en: "Left button (Square / X)" },
  target_faceTop: { "pt-BR": "Botão superior (Triangle / Y)", en: "Top button (Triangle / Y)" },
  target_shoulderLeft: { "pt-BR": "Ombro esquerdo (L1)", en: "Left shoulder (L1)" },
  target_shoulderRight: { "pt-BR": "Ombro direito (R1)", en: "Right shoulder (R1)" },
  target_triggerLeft: { "pt-BR": "Gatilho esquerdo (L2)", en: "Left trigger (L2)" },
  target_triggerRight: { "pt-BR": "Gatilho direito (R2)", en: "Right trigger (R2)" },
  target_select: { "pt-BR": "Select", en: "Select" },
  target_start: { "pt-BR": "Start", en: "Start" },
  target_stickLeftClick: { "pt-BR": "Clique do analógico esquerdo (L3)", en: "Left stick click (L3)" },
  target_stickRightClick: { "pt-BR": "Clique do analógico direito (R3)", en: "Right stick click (R3)" },
  target_dpadUp: { "pt-BR": "Direcional para cima", en: "D-pad up" },
  target_dpadDown: { "pt-BR": "Direcional para baixo", en: "D-pad down" },
  target_dpadLeft: { "pt-BR": "Direcional para a esquerda", en: "D-pad left" },
  target_dpadRight: { "pt-BR": "Direcional para a direita", en: "D-pad right" },
} satisfies Dict;
