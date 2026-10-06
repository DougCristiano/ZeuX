import type { Dict } from "../i18n/i18n";

export const dict = {
  heading: { "pt-BR": "Prints", en: "Screenshots" },
  recentHeading: { "pt-BR": "Últimos prints", en: "Latest screenshots" },
  loading: { "pt-BR": "Carregando os prints…", en: "Loading screenshots…" },
  readError: { "pt-BR": "Não foi possível ler os prints deste jogo.", en: "Could not read this game's screenshots." },
  empty: {
    "pt-BR":
      "Nenhum print ainda. Tire pelo atalho de print do emulador enquanto joga pelo ZeuX (no DuckStation, F10) — ao fechar o jogo, o ZeuX move os prints para cá.",
    en: "No screenshots yet. Use the emulator's screenshot shortcut while playing through ZeuX (F10 in DuckStation) — when you close the game, ZeuX moves them here.",
  },
  count: { "pt-BR": "{{n}} prints", en: "{{n}} screenshots" },
  openFolder: { "pt-BR": "Abrir pasta", en: "Open folder" },
  useAsBanner: { "pt-BR": "Usar como banner", en: "Use as banner" },
  removeBanner: { "pt-BR": "Tirar do banner", en: "Remove banner" },
  isBanner: { "pt-BR": "Banner", en: "Banner" },
  bannerSet: { "pt-BR": "Banner trocado.", en: "Banner changed." },
  bannerCleared: { "pt-BR": "O topo voltou a usar a capa.", en: "The header uses the cover again." },
  delete: { "pt-BR": "Apagar", en: "Delete" },
  deleteTitle: { "pt-BR": "Apagar este print?", en: "Delete this screenshot?" },
  deleteMessage: {
    "pt-BR": "O arquivo sai da galeria e do disco. Não dá para desfazer.",
    en: "The file leaves the gallery and the disk. This can't be undone.",
  },
  deleted: { "pt-BR": "Print apagado.", en: "Screenshot deleted." },
  cancel: { "pt-BR": "Cancelar", en: "Cancel" },
  previous: { "pt-BR": "Print anterior", en: "Previous screenshot" },
  next: { "pt-BR": "Próximo print", en: "Next screenshot" },
  openGame: { "pt-BR": "Abrir o jogo", en: "Open game" },
  position: { "pt-BR": "{{i}} de {{n}}", en: "{{i}} of {{n}}" },
} satisfies Dict;
