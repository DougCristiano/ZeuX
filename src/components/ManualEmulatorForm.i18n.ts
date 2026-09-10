import type { Dict } from "../i18n/i18n";

export const dict = {
  nameLabel: { "pt-BR": "Nome", en: "Name" },
  consolesLabel: { "pt-BR": "Consoles atendidos (ids separados por vírgula, ex.: ps1, ps2)", en: "Supported consoles (ids separated by comma, e.g., ps1, ps2)" },
  consolesHint: {
    "pt-BR":
      "Ids fora do catálogo do ZeuX (por exemplo, ps4) também valem: o emulador fica cadastrado e você pode lançá-lo à mão. O que ainda não existe é apontar uma pasta de ROMs para um console que o ZeuX não conhece — a biblioteca só indexa os consoles do catálogo.",
    en:
      "Ids outside the ZeuX catalog (ps4, for instance) work too: the emulator gets registered and you can launch it by hand. What doesn't exist yet is pointing a ROM folder at a console ZeuX doesn't know — the library only indexes catalog consoles.",
  },
  unverifiedNote: {
    "pt-BR":
      "O ZeuX não testa se os argumentos funcionam nem se esta máquina dá conta do emulador — ele guarda o que você informar e executa quando você mandar.",
    en:
      "ZeuX doesn't test whether the arguments work or whether this machine can handle the emulator — it stores what you enter and runs it when you ask.",
  },
  binaryPathLabel: { "pt-BR": "Caminho do executável", en: "Executable path" },
  chooseFile: { "pt-BR": "Escolher arquivo", en: "Choose file" },
  argsLabel: { "pt-BR": "Argumentos (um por linha — precisa incluir {{rom}} em algum deles)", en: "Arguments (one per line — must include {{rom}} in one of them)" },
  notesLabel: { "pt-BR": "Notas (opcional)", en: "Notes (optional)" },
  saving: { "pt-BR": "Salvando…", en: "Saving…" },
  save: { "pt-BR": "Salvar", en: "Save" },
  cancel: { "pt-BR": "Cancelar", en: "Cancel" },
  saveError: { "pt-BR": "Não foi possível salvar este emulador.", en: "Could not save this emulator." },
} satisfies Dict;
