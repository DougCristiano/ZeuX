import type { Dict } from "../i18n/i18n";

export const dict = {
  badge_auto: { "pt-BR": "reconhece sozinho", en: "works on its own" },
  "badge_needs-preset": { "pt-BR": "falta mapear", en: "not mapped yet" },
  "badge_preset-done": { "pt-BR": "controle mapeado", en: "controller mapped" },
  badge_manual: { "pt-BR": "configure no emulador", en: "set up in the emulator" },
  detail_auto: {
    "pt-BR": "O {{name}} liga o controle sozinho na primeira vez que abre — não precisa fazer nada.",
    en: "{{name}} picks up the controller by itself the first time it opens — nothing to do.",
  },
  detail_needs_preset: {
    "pt-BR":
      "O ZeuX grava o mapeamento padrão no jogador 1: o primeiro controle e o teclado funcionam juntos, cada botão no lugar do original.",
    en: "ZeuX writes the default mapping for player 1: the first controller and the keyboard work together, each button where the original is.",
  },
  detail_needs_preset_rpcs3: {
    "pt-BR":
      "O ZeuX liga o jogador 1 ao primeiro controle compatível com Xbox (XInput), já com os botões no lugar. No RPCS3 isso tira o teclado do jogador 1.",
    en: "ZeuX connects player 1 to the first Xbox-compatible controller (XInput), buttons already in place. In RPCS3 this takes the keyboard off player 1.",
  },
  detail_preset_done: {
    "pt-BR": "O jogador 1 do {{name}} já tem um controle mapeado.",
    en: "Player 1 in {{name}} already has a controller mapped.",
  },
  detail_manual: {
    "pt-BR":
      "O {{name}} guarda o controle pelo nome do aparelho, então o ZeuX não tem um padrão que sirva para todos. Abra o emulador e mapeie no menu de controles dele — uma vez só.",
    en: "{{name}} stores the controller by device name, so ZeuX has no default that fits everyone. Open the emulator and map it in its controls menu — just once.",
  },
  applyPreset: { "pt-BR": "Aplicar mapeamento padrão", en: "Apply default mapping" },
  reapplyPreset: { "pt-BR": "Refazer com o padrão", en: "Redo with the default" },
  applying: { "pt-BR": "Gravando…", en: "Saving…" },
  openEmulator: { "pt-BR": "Abrir o {{name}}", en: "Open {{name}}" },
  applyFailed: {
    "pt-BR": "Não foi possível gravar o mapeamento padrão.",
    en: "Could not save the default mapping.",
  },
  openFailed: { "pt-BR": "Não foi possível abrir o emulador.", en: "Could not open the emulator." },
  noneInstalled: {
    "pt-BR": "Nenhum emulador instalado ainda. Quando instalar, ele aparece aqui dizendo o que falta para o controle funcionar.",
    en: "No emulator installed yet. Once you install one, it shows up here saying what the controller still needs.",
  },
  confirmTitle: { "pt-BR": "Mapear o controle no {{name}}?", en: "Map the controller in {{name}}?" },
  confirmRPCS3: {
    "pt-BR":
      "O jogador 1 passa a usar o primeiro controle compatível com Xbox, e o teclado deixa de controlá-lo. Se quiser o teclado de volta, é só trocar dentro do RPCS3.",
    en: "Player 1 will use the first Xbox-compatible controller, and the keyboard will stop controlling it. To get the keyboard back, switch it inside RPCS3.",
  },
  confirmReapply: {
    "pt-BR":
      "O mapeamento atual do jogador 1 no {{name}} é trocado pelo padrão do ZeuX (controle e teclado). O ZeuX guarda uma cópia do arquivo original antes da primeira mudança.",
    en: "Player 1's current mapping in {{name}} is replaced by the ZeuX default (controller and keyboard). ZeuX keeps a copy of the original file before the first change.",
  },
  confirmApply: { "pt-BR": "Mapear", en: "Map" },
  cancel: { "pt-BR": "Cancelar", en: "Cancel" },
} satisfies Dict;
