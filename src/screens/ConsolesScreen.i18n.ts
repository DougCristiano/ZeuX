import type { Dict } from "../i18n/i18n";

export const dict = {
  consoles: { "pt-BR": "Consoles", en: "Consoles" },
  consolesDescription: {
    "pt-BR": "O que cada console precisa para rodar nesta máquina: emulador, core, BIOS e pasta de jogos.",
    en: "What each console needs to run on this machine: emulator, core, BIOS, and games folder.",
  },
  seeByEmulator: { "pt-BR": "Ver por emulador", en: "View by emulator" },
  seeConsole: { "pt-BR": "Ver console", en: "View console" },
  searchConsoleOrEmulator: {
    "pt-BR": "Buscar console ou emulador",
    en: "Search console or emulator",
  },
  searchConsoleOrEmulatorPlaceholder: {
    "pt-BR": "Buscar console ou emulador…",
    en: "Search console or emulator…",
  },
  filterAll: { "pt-BR": "Todos", en: "All" },
  filterReady: { "pt-BR": "Prontos", en: "Ready" },
  filterMissingEmulator: { "pt-BR": "Falta emulador", en: "Missing emulator" },
  filterMissingCore: { "pt-BR": "Falta core", en: "Missing core" },
  filterMissingBios: { "pt-BR": "Falta BIOS", en: "Missing BIOS" },
  filterMissingFolder: { "pt-BR": "Falta pasta", en: "Missing folder" },
  verdict: { "pt-BR": "Parecer:", en: "Verdict:" },
  loadingConsoles: { "pt-BR": "Carregando consoles…", en: "Loading consoles…" },
  noConsolesFound: {
    "pt-BR": "Nenhum console encontrado com esse filtro.",
    en: "No consoles found with this filter.",
  },
  errorLoadingConsoles: {
    "pt-BR": "Não foi possível listar os consoles.",
    en: "Could not load the consoles.",
  },
} satisfies Dict;
