import type { Dict } from "../i18n/i18n";

export const dict = {
  continuePlaying: {
    "pt-BR": "Continue jogando",
    en: "Continue playing",
  },
  searchPlaceholder: {
    "pt-BR": "Buscar jogos…",
    en: "Search games…",
  },
  sortByLabel: {
    "pt-BR": "Ordenar por",
    en: "Sort by",
  },
  viewModeLabel: {
    "pt-BR": "Modo de exibição",
    en: "View mode",
  },
  gridMode: {
    "pt-BR": "GRADE",
    en: "GRID",
  },
  listMode: {
    "pt-BR": "LISTA",
    en: "LIST",
  },
  favoritesLabel: {
    "pt-BR": "FAVORITOS",
    en: "FAVORITES",
  },
  allPlatforms: {
    "pt-BR": "TODOS",
    en: "ALL",
  },
  fetchingCovers: {
    "pt-BR": "Buscando capas…",
    en: "Fetching covers…",
  },
  fetchCoversButton: {
    "pt-BR": "Buscar capas",
    en: "Fetch covers",
  },
  manageFolders: {
    "pt-BR": "Gerenciar pastas",
    en: "Manage folders",
  },
  retryButton: {
    "pt-BR": "Tentar de novo",
    en: "Try again",
  },
  loadingGames: {
    "pt-BR": "Carregando jogos…",
    en: "Loading games…",
  },
  loadingMoreGames: {
    "pt-BR": "Carregando mais jogos…",
    en: "Loading more games…",
  },
  allGames: {
    "pt-BR": "Todos os jogos",
    en: "All games",
  },
  noGamesInLibrary: {
    "pt-BR": "Nenhum jogo na biblioteca ainda.",
    en: "No games in your library yet.",
  },
  chooseFolderWithGames: {
    "pt-BR": "Escolher pasta com meus jogos",
    en: "Choose folder with my games",
  },
  noGamesFound: {
    "pt-BR": "Nenhum jogo encontrado para \"{{search}}\".",
    en: "No games found for \"{{search}}\".",
  },
  noGamesForPlatform: {
    "pt-BR": "Nenhum jogo de {{platformName}} nesta busca.",
    en: "No games from {{platformName}} in this search.",
  },
  noFavoritedGames: {
    "pt-BR": "Nenhum jogo favoritado ainda.",
    en: "No favorited games yet.",
  },
  failedToListGames: {
    "pt-BR": "Não foi possível listar os jogos.",
    en: "Could not list games.",
  },
  addedToFavorites: {
    "pt-BR": "Adicionado aos favoritos.",
    en: "Added to favorites.",
  },
  removedFromFavorites: {
    "pt-BR": "Removido dos favoritos.",
    en: "Removed from favorites.",
  },
  failedToSaveFavorite: {
    "pt-BR": "Não foi possível salvar o favorito. Tente de novo.",
    en: "Could not save favorite. Try again.",
  },
  openingGame: {
    "pt-BR": "Abrindo {{title}}…",
    en: "Opening {{title}}…",
  },
  failedToOpenGame: {
    "pt-BR": "Não foi possível abrir o jogo",
    en: "Could not open the game",
  },
  failedToInstallEmulator: {
    "pt-BR": "Não foi possível instalar o emulador",
    en: "Could not install the emulator",
  },
  failedToLoadLibrary: {
    "pt-BR": "Não foi possível carregar a biblioteca",
    en: "Could not load the library",
  },
  failedToOpenBiosFolder: {
    "pt-BR": "Não foi possível abrir a pasta do BIOS: {{error}}",
    en: "Could not open the BIOS folder: {{error}}",
  },
  cancel: {
    "pt-BR": "Cancelar",
    en: "Cancel",
  },
  installAnyway: {
    "pt-BR": "Instalar mesmo assim",
    en: "Install anyway",
  },
  weakHardware: {
    "pt-BR": "Hardware abaixo do recomendado",
    en: "Hardware below recommended",
  },
  biosAbsent: {
    "pt-BR": "BIOS ausente",
    en: "BIOS missing",
  },
  biosEmptyWarning: {
    "pt-BR": "A pasta de BIOS deste emulador está vazia. Sem o arquivo, o jogo não deve abrir.",
    en: "This emulator's BIOS folder is empty. Without the file, the game may not open.",
  },
  openBiosFolder: {
    "pt-BR": "Abrir pasta do BIOS",
    en: "Open BIOS folder",
  },
  playAnyway: {
    "pt-BR": "Jogar mesmo assim",
    en: "Play anyway",
  },
  downloadingCore: {
    "pt-BR": "Baixando o core {{coreName}}…",
    en: "Downloading core {{coreName}}…",
  },
  cancelDownload: {
    "pt-BR": "Cancelar download",
    en: "Cancel download",
  },
  scrapeCoversSuccess: {
    "pt-BR": "{{found}} capa{{pluralFound}} encontrada{{pluralFoundEn}}, {{notFound}} não encontrada{{pluralNotFound}}.",
    en: "{{found}} cover{{pluralFound}} found, {{notFound}} not found.",
  },
  scrapeCoversSingleSuccess: {
    "pt-BR": "{{found}} capa{{pluralFound}} encontrada{{pluralFoundEn}}.",
    en: "{{found}} cover{{pluralFound}} found.",
  },
  failedToScrapeCovers: {
    "pt-BR": "Não foi possível buscar capas agora.",
    en: "Could not fetch covers now.",
  },
  failedToInitiateCoverScrape: {
    "pt-BR": "Não foi possível iniciar a busca de capas.",
    en: "Could not initiate cover search.",
  },
} satisfies Dict;
