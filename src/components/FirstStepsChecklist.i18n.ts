import type { Dict } from "../i18n/i18n";

// Lista de primeiros passos da biblioteca (FirstStepsChecklist). Descritiva,
// nunca julga o hardware (princípio 2) e sem dizer de onde tirar jogo
// (princípio 6): a pasta é a que já existe no computador da pessoa. O que
// falta no passo do emulador NÃO mora aqui — vem pronto de
// `ConsoleReadiness.detail`, para a lista e a tela de consoles dizerem a mesma
// frase.
export const dict = {
  kicker: { "pt-BR": "Primeiros passos", en: "Getting started" },
  title: { "pt-BR": "Do zero ao primeiro jogo", en: "From zero to your first game" },
  progress: { "pt-BR": "{{done}} de {{total}}", en: "{{done}} of {{total}}" },
  dismiss: { "pt-BR": "Dispensar", en: "Dismiss" },
  dismissTitle: {
    "pt-BR": "Esconder esta lista. Dá para trazer de volta em Configurações → Rever dicas.",
    en: "Hide this list. You can bring it back in Settings → Replay tips.",
  },
  stateDone: { "pt-BR": "feito", en: "done" },

  folderTitle: { "pt-BR": "Aponte a pasta dos seus jogos", en: "Point to your games folder" },
  folderBody: {
    "pt-BR": "O ZeuX lê os arquivos onde já estão no disco — não move nem copia nada.",
    en: "ZeuX reads the files where they already are on your disk — it doesn't move or copy anything.",
  },
  folderAction: { "pt-BR": "Escolher pasta", en: "Choose folder" },

  emulatorTitle: { "pt-BR": "Deixe um console pronto", en: "Get one console ready" },
  emulatorWaiting: {
    "pt-BR": "Com a pasta apontada, o ZeuX mostra o que falta para o console dos seus jogos rodar: emulador, core e BIOS.",
    en: "Once a folder is set, ZeuX shows what a console still needs to run: emulator, core and BIOS.",
  },
  emulatorDone: {
    "pt-BR": "{{console}} está pronto para abrir jogos.",
    en: "{{console}} is ready to open games.",
  },
  emulatorAction: { "pt-BR": "Abrir {{console}}", en: "Open {{console}}" },

  playTitle: { "pt-BR": "Abra seu primeiro jogo", en: "Open your first game" },
  playBody: {
    "pt-BR": "Clique em qualquer jogo da grade — o ZeuX resolve o emulador e a configuração sozinho.",
    en: "Click any game in the grid — ZeuX sorts out the emulator and the configuration on its own.",
  },
} satisfies Dict;
