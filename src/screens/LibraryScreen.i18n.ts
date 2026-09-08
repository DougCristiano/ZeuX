import type { Dict } from "../i18n/i18n";

export const dict = {
  selectFolderForAllGames: {
    "pt-BR": "Selecionar pasta para todos os jogos",
    en: "Select folder for all games",
  },
  selectFolderDescription: {
    "pt-BR":
      'Escolha uma pasta com uma subpasta por console (ex.: "PS1", "SNES") — o ZeuX aponta cada uma para o console certo de uma vez.',
    en: 'Choose a folder with one subfolder per console (e.g. "PS1", "SNES") — ZeuX will point each one to the correct console at once.',
  },
  scanning: {
    "pt-BR": "Varrendo…",
    en: "Scanning…",
  },
  chooseFolderButton: {
    "pt-BR": "Escolher pasta",
    en: "Choose folder",
  },
  consolesMatched: {
    "pt-BR": "{{count}} console(s) reconhecido(s): {{names}}",
    en: "{{count}} console(s) matched: {{names}}",
  },
  noConsolesMatched: {
    "pt-BR": "Nenhuma subpasta bateu com um console do catálogo.",
    en: "No subfolders matched a console in the catalog.",
  },
  unmatchedSubfolders: {
    "pt-BR": "Subpastas não reconhecidas",
    en: "Unmatched subfolders",
  },
  unmatchedFoldersHelp: {
    "pt-BR":
      '— nomeie a subpasta com o nome ou a sigla do console (ex. "PS1", "Mega Drive") e escolha a pasta de novo.',
    en:
      '— name the subfolder with the console name or abbreviation (e.g. "PS1", "Mega Drive") and choose the folder again.',
  },
  removeFolderTitle: {
    "pt-BR": "Remover pasta da biblioteca?",
    en: "Remove folder from library?",
  },
  removeFolderMessage: {
    "pt-BR": '"{{path}}" sai da lista do ZeuX. Os arquivos continuam no disco — nada é apagado, só o apontamento.',
    en: '"{{path}}" will be removed from ZeuX\'s list. Files remain on disk — nothing is deleted, only the reference.',
  },
  cancel: {
    "pt-BR": "Cancelar",
    en: "Cancel",
  },
  removeAnyway: {
    "pt-BR": "Remover mesmo assim",
    en: "Remove anyway",
  },
  countingGames: {
    "pt-BR": "contando jogos…",
    en: "counting games…",
  },
  gamesCount: {
    "pt-BR": "{{count}} jogo(s)",
    en: "{{count}} game(s)",
  },
  seeGames: {
    "pt-BR": "Ver jogos",
    en: "See games",
  },
  rescan: {
    "pt-BR": "Revarrer",
    en: "Rescan",
  },
  remove: {
    "pt-BR": "Remover",
    en: "Remove",
  },
  allConsolesConfigured: {
    "pt-BR": "Todos os consoles do catálogo já têm pasta apontada.",
    en: "All consoles in the catalog already have folders assigned.",
  },
  addConsole: {
    "pt-BR": "Adicionar console",
    en: "Add console",
  },
  chooseConsole: {
    "pt-BR": "Escolher console",
    en: "Choose console",
  },
  pointing: {
    "pt-BR": "Apontando…",
    en: "Assigning…",
  },
  back: {
    "pt-BR": "Voltar",
    en: "Back",
  },
  // Renomeado em 2026-09-06 (achado do critico-layout-biblioteca): esta
  // tela e o destino "Biblioteca" da sidebar (que leva para
  // AllGamesScreen) disputavam o mesmo nome — quem clicava em "Biblioteca"
  // esperando pastas caía na grade de jogos, e vice-versa. "Pastas de
  // jogos" descreve o que a tela faz e não colide com mais nada na
  // navegação.
  library: {
    "pt-BR": "Pastas de jogos",
    en: "Game folders",
  },
  seeFolderNamesAccepted: {
    "pt-BR": "Ver nomes de pasta aceitos",
    en: "See accepted folder names",
  },
  couldNotListFolders: {
    "pt-BR": "Não foi possível listar as pastas",
    en: "Could not list folders",
  },
  loadingFolders: {
    "pt-BR": "Carregando pastas…",
    en: "Loading folders…",
  },
  configuredConsoles: {
    "pt-BR": "Consoles configurados",
    en: "Configured consoles",
  },
  noConsolesFolderYet: {
    "pt-BR": "Nenhum console com pasta apontada ainda.",
    en: "No console with a folder assigned yet.",
  },
  acceptedFolderNames: {
    "pt-BR": "Nomes de pasta aceitos",
    en: "Accepted folder names",
  },
  folderNamesGuideText: {
    "pt-BR":
      'Em "Selecionar pasta para todos os jogos", cada subpasta é reconhecida pelo nome — copie um dos valores abaixo (id, nome completo ou sigla) para nomear a subpasta daquele console. Maiúscula/minúscula, espaço e hífen não importam.',
    en:
      'In "Select folder for all games", each subfolder is recognized by name — copy one of the values below (id, full name, or abbreviation) to name the subfolder for that console. Uppercase/lowercase, spaces, and hyphens do not matter.',
  },
  close: {
    "pt-BR": "Fechar",
    en: "Close",
  },
  couldNotScanFolder: {
    "pt-BR": "Não foi possível varrer esta pasta.",
    en: "Could not scan this folder.",
  },
  couldNotPointFolder: {
    "pt-BR": "Não foi possível apontar esta pasta.",
    en: "Could not assign this folder.",
  },
  // Resumo do topo (2026-09-07, redesenho): a tela tinha 33 consoles
  // possíveis e nenhum lugar que dissesse, de relance, quantos já estão
  // configurados — a resposta exigia contar as linhas. Descritivo, nunca
  // avaliativo ("poucos", "falta configurar").
  screenSummary: {
    "pt-BR": "{{configured}} de {{total}} consoles com pasta apontada",
    en: "{{configured}} of {{total}} consoles with a folder assigned",
  },
  availableCount: {
    "pt-BR": "{{count}} sem pasta",
    en: "{{count}} without a folder",
  },
  folderPathsLabel: {
    "pt-BR": "Pastas apontadas",
    en: "Assigned folders",
  },
  bulkKicker: {
    "pt-BR": "Caminho mais rápido",
    en: "Fastest path",
  },
  couldNotRemoveFolder: {
    "pt-BR": "Não foi possível remover esta pasta.",
    en: "Could not remove this folder.",
  },
} satisfies Dict;
