import type { Dict } from "../i18n/i18n";

export const dict = {
  nameLabel: { "pt-BR": "Nome", en: "Name" },
  consolesLabel: { "pt-BR": "Consoles atendidos (ids separados por vírgula, ex.: ps1, ps2)", en: "Supported consoles (ids separated by comma, e.g., ps1, ps2)" },
  consolesHint: {
    "pt-BR":
      "Ids fora do catálogo do ZeuX (por exemplo, ps4) também valem: o emulador fica cadastrado e você pode lançá-lo à mão. Pra ter uma pasta de jogos indexada pra esse console, preencha as extensões abaixo.",
    en:
      "Ids outside the ZeuX catalog (ps4, for instance) work too: the emulator gets registered and you can launch it by hand. To get an indexed game folder for that console, fill in the extensions below.",
  },
  extensionsLabel: {
    "pt-BR": "Extensões dos arquivos de jogo (opcional, ids separados por vírgula, ex.: pkg, iso)",
    en: "Game file extensions (optional, comma-separated, e.g., pkg, iso)",
  },
  extensionsHint: {
    "pt-BR":
      "Só necessário para um console fora do catálogo (ex.: ps4) — é o que permite apontar uma pasta de jogos pra ele em Biblioteca. Pra um console do catálogo, as extensões já conhecidas valem e este campo é ignorado.",
    en:
      "Only needed for a console outside the catalog (e.g., ps4) — it's what lets you point a game folder at it in Library. For a catalog console, the known extensions already apply and this field is ignored.",
  },
  unverifiedNote: {
    "pt-BR":
      "O ZeuX não testa se os argumentos funcionam nem se esta máquina dá conta do emulador — ele guarda o que você informar e executa quando você mandar.",
    en:
      "ZeuX doesn't test whether the arguments work or whether this machine can handle the emulator — it stores what you enter and runs it when you ask.",
  },
  binaryPathLabel: { "pt-BR": "Caminho do executável", en: "Executable path" },
  chooseFile: { "pt-BR": "Escolher arquivo", en: "Choose file" },
  choosePackage: { "pt-BR": "Ou apontar um pacote baixado (.zip/.7z)", en: "Or point to a downloaded package (.zip/.7z)" },
  packageFileFilter: { "pt-BR": "Pacote compactado", en: "Compressed package" },
  extractingPackage: { "pt-BR": "Extraindo o pacote…", en: "Extracting the package…" },
  packageExtractError: { "pt-BR": "Não foi possível extrair este pacote.", en: "Could not extract this package." },
  packageCandidatesLabel: {
    "pt-BR": "O pacote trouxe mais de um executável — escolha qual é o emulador:",
    en: "The package brought more than one executable — choose which one is the emulator:",
  },
  argsLabel: { "pt-BR": "Argumentos (um por linha — precisa incluir {{rom}} em algum deles)", en: "Arguments (one per line — must include {{rom}} in one of them)" },
  notesLabel: { "pt-BR": "Notas (opcional)", en: "Notes (optional)" },
  saving: { "pt-BR": "Salvando…", en: "Saving…" },
  save: { "pt-BR": "Salvar", en: "Save" },
  cancel: { "pt-BR": "Cancelar", en: "Cancel" },
  saveError: { "pt-BR": "Não foi possível salvar este emulador.", en: "Could not save this emulator." },
} satisfies Dict;
