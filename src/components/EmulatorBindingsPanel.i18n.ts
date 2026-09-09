import type { Dict } from "../i18n/i18n";

export const dict = {
  loadingBindings: {
    "pt-BR": "Lendo o mapeamento do {{adapterName}}…",
    en: "Loading {{adapterName}} bindings…",
  },
  unappliedLabel: { "pt-BR": "Não aplicado", en: "Not applied" },
  gamepadDetected: { "pt-BR": "Controle detectado", en: "Gamepad detected" },
  sequenceProgress: {
    "pt-BR": "{{index}} de {{total}} · aperte o botão para \"{{action}}\"",
    en: "{{index}} of {{total}} · press button for \"{{action}}\"",
  },
  stopButton: { "pt-BR": "Parar", en: "Stop" },
  mapEntireGamepad: {
    "pt-BR": "Mapear o controle inteiro",
    en: "Map entire gamepad",
  },
  noGamepadDetected: {
    "pt-BR": "Nenhum controle detectado ainda. Se já conectou um, aperte um botão nele — a Gamepad API do navegador só percebe a conexão depois do primeiro aperto, mesmo com o controle já plugado antes de abrir esta tela. O mapeamento de teclado funciona sem controle nenhum.",
    en: "No gamepad detected yet. If you have one connected, press a button on it — the browser's Gamepad API only detects the connection after the first button press, even if the gamepad was plugged in before opening this screen. Keyboard mapping works without a gamepad.",
  },
  keyConflictMessage: {
    "pt-BR": "A tecla já está em \"{{action}}\".",
    en: "The key is already mapped to \"{{action}}\".",
  },
  buttonConflictMessage: {
    "pt-BR": "O botão {{button}} já está em \"{{action}}\".",
    en: "Button {{button}} is already mapped to \"{{action}}\".",
  },
  switchConfirmationSuffix: {
    "pt-BR": " Trocar para \"{{action}}\" também?",
    en: " Switch to \"{{action}}\" instead?",
  },
  switchButton: { "pt-BR": "Trocar mesmo assim", en: "Switch anyway" },
  cancelButton: { "pt-BR": "Cancelar", en: "Cancel" },
  noKeyMapped: { "pt-BR": "sem tecla", en: "no key" },
  buttonDisplay: { "pt-BR": "botão {{button}}", en: "button {{button}}" },
  mapKeyButton: { "pt-BR": "Mapear tecla", en: "Map key" },
  listeningForKey: { "pt-BR": "Aperte uma tecla…", en: "Press a key…" },
  mapGamepadButton: { "pt-BR": "Mapear controle", en: "Map button" },
  listeningForButton: {
    "pt-BR": "Aperte um botão…",
    en: "Press a button…",
  },
  keyNotMappable: {
    "pt-BR": "A tecla \"{{key}}\" não pode ser mapeada para o {{adapter}}.",
    en: "The key \"{{key}}\" cannot be mapped to {{adapter}}.",
  },
  errorLoadingBindings: {
    "pt-BR": "Não foi possível ler o mapeamento.",
    en: "Could not load bindings.",
  },
  errorSavingBindings: {
    "pt-BR": "Não foi possível salvar o mapeamento.",
    en: "Could not save bindings.",
  },
  // Rótulos dos grupos do layout espacial (2026-09-08). Trazem a sigla entre
  // parênteses porque o nome que o adapter devolve é justamente a sigla crua
  // ("L2", "r3", "Cross") — o rótulo é o que traduz sigla em peça física.
  groupTriggerLeft: { "pt-BR": "Gatilho esquerdo (L2)", en: "Left trigger (L2)" },
  groupTriggerRight: { "pt-BR": "Gatilho direito (R2)", en: "Right trigger (R2)" },
  groupShoulderLeft: { "pt-BR": "Ombro esquerdo (L1)", en: "Left shoulder (L1)" },
  groupShoulderRight: { "pt-BR": "Ombro direito (R1)", en: "Right shoulder (R1)" },
  groupLeftStick: { "pt-BR": "Analógico esquerdo (L3)", en: "Left stick (L3)" },
  groupRightStick: { "pt-BR": "Analógico direito (R3)", en: "Right stick (R3)" },
  groupDpad: { "pt-BR": "Direcional", en: "D-pad" },
  groupFace: { "pt-BR": "Botões de face", en: "Face buttons" },
  groupCenter: { "pt-BR": "Centro", en: "Center" },
  groupOther: { "pt-BR": "Outras ações", en: "Other actions" },
  groupOtherHint: {
    "pt-BR": "Ações que não têm uma peça correspondente na foto — atalhos do emulador, ou nomes que o Zeux não reconheceu. Continuam mapeáveis do mesmo jeito.",
    en: "Actions with no matching part on the photo — emulator hotkeys, or names Zeux did not recognise. They map exactly the same way.",
  },
  bindingSaved: { "pt-BR": "Mapeamento salvo.", en: "Binding saved." },
  gamepadMapped: { "pt-BR": "Controle mapeado.", en: "Gamepad mapped." },
} satisfies Dict;
