import type { Dict } from "../i18n/i18n";

// Menu de botão direito de um jogo (GameContextMenu). Os textos de remover e
// trazer de volta seguem os da tela de detalhe (GameDetailScreen.i18n.ts) —
// a mesma ação não pode ter duas explicações diferentes.
export const dict = {
  details: { "pt-BR": "Ver detalhes", en: "View details" },
  play: { "pt-BR": "Jogar", en: "Play" },
  favorite: { "pt-BR": "Favoritar", en: "Add to favorites" },
  unfavorite: { "pt-BR": "Tirar dos favoritos", en: "Remove from favorites" },
  reveal: { "pt-BR": "Mostrar na pasta", en: "Show in folder" },
  remove: { "pt-BR": "Remover da biblioteca", en: "Remove from library" },
  restore: { "pt-BR": "Trazer de volta", en: "Bring back" },

  removeTitle: { "pt-BR": "Remover da biblioteca?", en: "Remove from library?" },
  removeConfirm: {
    "pt-BR":
      "\"{{title}}\" some da biblioteca. O arquivo no disco não é apagado, e você pode trazer o jogo de volta pelo filtro \"Ocultos\".",
    en:
      "\"{{title}}\" leaves the library. The file on disk is not deleted, and you can bring the game back through the \"Hidden\" filter.",
  },
  cancel: { "pt-BR": "Cancelar", en: "Cancel" },

  removed: {
    "pt-BR": "\"{{title}}\" saiu da biblioteca. Dá para trazer de volta pelo filtro \"Ocultos\".",
    en: "\"{{title}}\" left the library. You can bring it back through the \"Hidden\" filter.",
  },
  restored: { "pt-BR": "\"{{title}}\" voltou para a biblioteca.", en: "\"{{title}}\" is back in the library." },
  errorRemove: { "pt-BR": "Não foi possível remover o jogo da biblioteca.", en: "Could not remove the game from the library." },
  errorRestore: {
    "pt-BR": "Não foi possível trazer o jogo de volta à biblioteca.",
    en: "Could not bring the game back to the library.",
  },
  errorReveal: { "pt-BR": "Não foi possível abrir a pasta: {{error}}", en: "Could not open the folder: {{error}}" },
} satisfies Dict;
