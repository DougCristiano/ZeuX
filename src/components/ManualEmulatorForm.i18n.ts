import type { Dict } from "../i18n/i18n";

export const dict = {
  nameLabel: { "pt-BR": "Nome", en: "Name" },
  consolesLabel: { "pt-BR": "Consoles atendidos (ids separados por vírgula, ex.: ps1, ps2)", en: "Supported consoles (ids separated by comma, e.g., ps1, ps2)" },
  binaryPathLabel: { "pt-BR": "Caminho do executável", en: "Executable path" },
  chooseFile: { "pt-BR": "Escolher arquivo", en: "Choose file" },
  argsLabel: { "pt-BR": "Argumentos (um por linha — precisa incluir {{rom}} em algum deles)", en: "Arguments (one per line — must include {{rom}} in one of them)" },
  notesLabel: { "pt-BR": "Notas (opcional)", en: "Notes (optional)" },
  saving: { "pt-BR": "Salvando…", en: "Saving…" },
  save: { "pt-BR": "Salvar", en: "Save" },
  cancel: { "pt-BR": "Cancelar", en: "Cancel" },
  saveError: { "pt-BR": "Não foi possível salvar este emulador.", en: "Could not save this emulator." },
} satisfies Dict;
