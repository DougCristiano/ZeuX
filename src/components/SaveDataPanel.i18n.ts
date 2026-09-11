import type { Dict } from "../i18n/i18n";

export const dict = {
  loading: { "pt-BR": "Lendo os saves…", en: "Reading save data…" },
  readError: { "pt-BR": "Não foi possível ler os saves.", en: "Could not read save data." },
  memoryCardsLabel: { "pt-BR": "Memory cards", en: "Memory cards" },
  saveStatesLabel: { "pt-BR": "Save states", en: "Save states" },
  emptyFolder: { "pt-BR": "Nenhum arquivo nesta pasta.", en: "No files in this folder." },
  changeLocation: { "pt-BR": "Escolher outra pasta", en: "Choose another folder" },
  cancel: { "pt-BR": "Cancelar", en: "Cancel" },
  save: { "pt-BR": "Salvar", en: "Save" },
  saving: { "pt-BR": "Salvando…", en: "Saving…" },
  savedToast: { "pt-BR": "Local de save salvo.", en: "Save location saved." },
  saveError: { "pt-BR": "Não foi possível salvar o novo local.", en: "Could not save the new location." },
  notConfigurable: {
    "pt-BR": "Este emulador ainda não deixa o ZeuX escolher o local de save — os campos abaixo são só leitura.",
    en: "This emulator does not yet let ZeuX choose the save location — the fields below are read-only.",
  },
  memoryCardsDirLabel: { "pt-BR": "Pasta dos memory cards", en: "Memory cards folder" },
  saveStatesDirLabel: { "pt-BR": "Pasta dos save states", en: "Save states folder" },
  dirPlaceholder: { "pt-BR": "padrão do emulador", en: "emulator default" },
} satisfies Dict;
