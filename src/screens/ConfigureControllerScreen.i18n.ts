import type { Dict } from "../i18n/i18n";

export const dict = {
  title: {
    "pt-BR": "Configurar controle",
    en: "Configure controller",
  },
  subtitle: {
    "pt-BR": "Deixe o controle do seu jeito no ZeuX e leve o mesmo mapeamento para os emuladores.",
    en: "Set the controller up your way in ZeuX and carry the same mapping to the emulators.",
  },
  // Seção "No ZeuX" (2026-09-29): o controle navega o próprio app sem
  // configurar nada; a escolha é qual botão confirma (lib/gamepadPrefs.ts).
  zeuxHeading: { "pt-BR": "No ZeuX", en: "In ZeuX" },
  zeuxWorksAlready: {
    "pt-BR":
      "Seu controle já navega o ZeuX, sem instalar nem configurar nada: o direcional ou o analógico movem o cursor, {{confirm}} seleciona e {{back}} volta.",
    en: "Your controller already navigates ZeuX, nothing to install or set up: the D-pad or stick moves the cursor, {{confirm}} selects and {{back}} goes back.",
  },
  buttonBottomShort: { "pt-BR": "o botão de baixo", en: "the bottom button" },
  buttonRightShort: { "pt-BR": "o botão da direita", en: "the right button" },
  confirmButtonLabel: { "pt-BR": "Botão de confirmar", en: "Confirm button" },
  confirmBottom: {
    "pt-BR": "De baixo — A no Xbox, ✕ no PlayStation",
    en: "Bottom — A on Xbox, ✕ on PlayStation",
  },
  confirmRight: {
    "pt-BR": "Da direita — A no Nintendo, ○ no PlayStation japonês",
    en: "Right — A on Nintendo, ○ on Japanese PlayStation",
  },
  testAllButtons: { "pt-BR": "Testar todos os botões", en: "Test every button" },
  emulatorsHeading: { "pt-BR": "Nos emuladores", en: "In the emulators" },
  emulatorsStatusIntro: {
    "pt-BR":
      "O que cada emulador instalado precisa para o controle funcionar. Quase sempre é nada, ou um clique.",
    en: "What each installed emulator needs for the controller to work. Usually nothing, or one click.",
  },
  customHeading: { "pt-BR": "Layout personalizado", en: "Custom layout" },
  emulatorsIntro: {
    "pt-BR":
      "Opcional, para quem quer os botões em outro lugar. Aperte cada botão do controle uma vez e o ZeuX grava o mesmo layout nos emuladores que aceitam isso (hoje, o RetroArch).",
    en: "Optional, for anyone who wants buttons somewhere else. Press each controller button once and ZeuX writes the same layout to the emulators that accept it (today, RetroArch).",
  },
  back: { "pt-BR": "Voltar", en: "Back" },
  noController: {
    "pt-BR": "Nenhum controle conectado. Plugue um — o ZeuX o reconhece na hora, sem instalar nada.",
    en: "No controller connected. Plug one in — ZeuX picks it up right away, nothing to install.",
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
    "pt-BR":
      "Nenhum emulador instalado aceita layout personalizado pelo ZeuX ainda (hoje: RetroArch). Isso não afeta o mapeamento padrão acima.",
    en: "No installed emulator accepts a custom layout through ZeuX yet (today: RetroArch). This doesn't affect the default mapping above.",
  },

  perAdapterNotesHeading: { "pt-BR": "Ressalvas por emulador", en: "Per-emulator notes" },
  // Nota registrada quando a própria chamada da API falha. Fica ao lado das
  // ressalvas do backend porque, para quem lê, as duas respondem a mesma
  // pergunta: "o que não ficou gravado?".
  writeFailed: {
    "pt-BR": "Não foi possível gravar {{action}}: {{error}}",
    en: "Could not write {{action}}: {{error}}",
  },

  // Rótulos das 16 posições físicas. Nomeiam o botão pelo lugar no desenho e,
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
  // Rótulos das caixas de aviso: eram "—" literal (mesmo achado já corrigido
  // em ControllerTestScreen), que não diz nada a quem lê nem a leitor de tela.
  statusLabel: { "pt-BR": "Situação", en: "Status" },
  errorLabel: { "pt-BR": "Erro", en: "Error" },
} satisfies Dict;
