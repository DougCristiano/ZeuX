import type { Dict } from "../i18n/i18n";

export const dict = {
  heading: { "pt-BR": "Saves", en: "Saves" },
  loading: { "pt-BR": "Procurando os saves…", en: "Looking for saves…" },
  readError: { "pt-BR": "Não foi possível ler os saves deste jogo.", en: "Could not read this game's saves." },
  unknown: {
    "pt-BR": "O ZeuX ainda não sabe onde ficam os saves deste jogo.",
    en: "ZeuX doesn't know where this game's saves are yet.",
  },
  memoryCard: { "pt-BR": "Cartão de memória", en: "Memory card" },
  memoryCardShared: {
    "pt-BR": "Cartão único, compartilhado por todos os jogos de PS2 neste emulador.",
    en: "Single card, shared by every PS2 game in this emulator.",
  },
  memoryCardApprox: {
    "pt-BR": "O nome do cartão foi deduzido pelo nome do arquivo do jogo — pode não ser o deste jogo.",
    en: "The card name was guessed from the game file name — it may not be this game's.",
  },
  noMemoryCard: { "pt-BR": "Nenhum cartão gravado ainda.", en: "No card saved yet." },
  // Flycast com PerGameVmu ligado: o arquivo do cartão leva o código do disco,
  // que o ZeuX não lê. Dizer isso evita o "Nenhum cartão" falso.
  memoryCardUnknown: {
    "pt-BR": "O cartão deste jogo é guardado por um código de disco que o ZeuX ainda não lê.",
    en: "This game's card is stored under a disc code that ZeuX doesn't read yet.",
  },
  states: { "pt-BR": "Estados salvos", en: "Save states" },
  noStates: { "pt-BR": "Nenhum estado salvo deste jogo.", en: "No save states for this game." },
  noSerial: {
    "pt-BR": "Os estados aparecem depois que você jogar e fechar o jogo uma vez pelo ZeuX — é assim que ele descobre o código do disco.",
    en: "States show up after you play and close the game once through ZeuX — that's how it learns the disc code.",
  },
  resume: { "pt-BR": "Continuar", en: "Continue" },
  slot: { "pt-BR": "Slot {{n}}", en: "Slot {{n}}" },
  previous: { "pt-BR": "cópia anterior", en: "previous copy" },
  openFolder: { "pt-BR": "Abrir pasta", en: "Open folder" },
  backup: { "pt-BR": "Fazer backup", en: "Back up" },
  backingUp: { "pt-BR": "Copiando…", en: "Copying…" },
  backupDone: { "pt-BR": "Backup feito.", en: "Backup done." },
  backups: { "pt-BR": "Backups", en: "Backups" },
  restore: { "pt-BR": "Restaurar", en: "Restore" },
  restoreTitle: { "pt-BR": "Restaurar este backup?", en: "Restore this backup?" },
  restoreMessage: {
    "pt-BR": "Os estados salvos voltam para como estavam em {{date}}. Antes, o ZeuX guarda os atuais num backup novo — nada se perde.",
    en: "Save states go back to how they were on {{date}}. ZeuX first keeps the current ones in a new backup — nothing is lost.",
  },
  includeCard: { "pt-BR": "Restaurar também o cartão de memória", en: "Also restore the memory card" },
  includeCardShared: {
    "pt-BR": "Restaurar também o cartão de memória (volta o save de TODOS os jogos de PS2)",
    en: "Also restore the memory card (rolls back saves of ALL PS2 games)",
  },
  restored: { "pt-BR": "Backup restaurado.", en: "Backup restored." },
  cancel: { "pt-BR": "Cancelar", en: "Cancel" },
} satisfies Dict;
