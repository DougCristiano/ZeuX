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
  // Legenda do pingo aceso no canto do tile — o único sinal que a grade dá
  // antes do clique. Descreve o estado do ZeuX (peças no lugar), nunca a
  // máquina do usuário.
  readyLegend: {
    "pt-BR": "Console com tudo no lugar para jogar",
    en: "Console with everything in place to play",
  },
  loadingConsoles: { "pt-BR": "Carregando consoles…", en: "Loading consoles…" },
  noConsolesFound: {
    "pt-BR": "Nenhum console encontrado com esse filtro.",
    en: "No consoles found with this filter.",
  },
  noConsolesFoundTitle: {
    "pt-BR": "Nenhum console com esse filtro",
    en: "No consoles match this filter",
  },
  errorLoadingConsoles: {
    "pt-BR": "Não foi possível listar os consoles.",
    en: "Could not load the consoles.",
  },

  // Faixas da tela (2026-09-09): a grade única de 33 consoles não tinha
  // hierarquia — quem já configurou um console procurava-o no meio dos 32
  // que ainda não tocou. As três faixas separam por engajamento, não por
  // parecer de hardware.
  sectionReady: { "pt-BR": "Prontos para jogar", en: "Ready to play" },
  sectionNeedsSetup: { "pt-BR": "Falta configurar", en: "Needs setup" },
  sectionCatalog: { "pt-BR": "Catálogo", en: "Catalog" },
  sectionReadyCount: {
    "pt-BR": "{{count}} console",
    en: "{{count}} console",
  },
  sectionReadyCountPlural: {
    "pt-BR": "{{count}} consoles",
    en: "{{count}} consoles",
  },

  // Régua de filtros do catálogo — separada da régua de prontidão (que
  // pergunta "o que falta montar"). Estes recortam o catálogo por fabricante,
  // época e "tenho jogos deste console".
  filterByMaker: { "pt-BR": "Fabricante", en: "Manufacturer" },
  filterByEra: { "pt-BR": "Época", en: "Era" },
  filterAllMakers: { "pt-BR": "Todos os fabricantes", en: "All manufacturers" },
  filterAllEras: { "pt-BR": "Todas as épocas", en: "All eras" },
  familyOther: { "pt-BR": "Outros", en: "Others" },
  era70s80s: { "pt-BR": "Anos 70–80", en: "70s–80s" },
  era90s: { "pt-BR": "Anos 90", en: "90s" },
  era2000s: { "pt-BR": "Anos 2000", en: "2000s" },
  era2010plus: { "pt-BR": "2010 em diante", en: "2010 onward" },
  filterOnlyWithGames: {
    "pt-BR": "Tenho jogos deste console",
    en: "I have games for this console",
  },
  clearFilters: { "pt-BR": "Limpar filtros", en: "Clear filters" },
  // Rótulo do grupo do mostrador de prontidão (leitor de tela). O painel é
  // resumo e filtro ao mesmo tempo — o nome precisa dizer as duas coisas.
  readinessPanelLabel: {
    "pt-BR": "Quantos consoles estão em cada etapa — clique para filtrar",
    en: "How many consoles are at each step — click to filter",
  },
  refineLabel: { "pt-BR": "Refinar", en: "Refine" },

  // Card do console
  viewGames: { "pt-BR": "Ver jogos", en: "View games" },
  cardGameCountSingular: { "pt-BR": "{{count}} jogo", en: "{{count}} game" },
  cardGameCountPlural: { "pt-BR": "{{count}} jogos", en: "{{count}} games" },
  cardNoGames: { "pt-BR": "sem jogos na pasta", en: "no games in folder" },
} satisfies Dict;
