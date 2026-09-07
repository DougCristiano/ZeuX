import type { Dict } from "../i18n/i18n";

export const dict = {
  neverPlayed: { "pt-BR": "nunca jogado", en: "never played" },
  lessThanOneMinute: { "pt-BR": "menos de 1 min", en: "less than 1 min" },
  minuteUnit: { "pt-BR": "min", en: "min" },
  hourUnit: { "pt-BR": "h", en: "h" },
  addedToFavorites: {
    "pt-BR": "Adicionado aos favoritos.",
    en: "Added to favorites.",
  },
  removedFromFavorites: {
    "pt-BR": "Removido dos favoritos.",
    en: "Removed from favorites.",
  },
  errorSavingFavorite: {
    "pt-BR": "Não foi possível salvar o favorito. Tente de novo.",
    en: "Could not save favorite. Try again.",
  },
  searching: { "pt-BR": "Buscando…", en: "Searching…" },
  searchCover: { "pt-BR": "Buscar capa", en: "Search cover" },
  searchCoverAgain: { "pt-BR": "Buscar capa de novo", en: "Search cover again" },
  errorSearchingCover: {
    "pt-BR": "Não foi possível buscar a capa deste jogo.",
    en: "Could not search for this game's cover.",
  },
  errorCoverNotFound: {
    "pt-BR": "O IGDB não tem capa para este jogo.",
    en: "IGDB has no cover for this game.",
  },
  errorSearchingCoverGeneric: {
    "pt-BR": "Não foi possível buscar a capa agora.",
    en: "Could not search for cover right now.",
  },
  errorInitiatingCoverSearch: {
    "pt-BR": "Não foi possível iniciar a busca de capa.",
    en: "Could not start cover search.",
  },
  missingFile: { "pt-BR": "arquivo ausente", en: "file missing" },
  retryButton: { "pt-BR": "Tentar de novo", en: "Try again" },
  opening: { "pt-BR": "Abrindo…", en: "Opening…" },
  downloadingCore: { "pt-BR": "Baixando o core…", en: "Downloading core…" },
  playButton: { "pt-BR": "Jogar", en: "Play" },
  coreDownloadingMessage: {
    "pt-BR": "O core {{core_name}} ainda não estava no seu computador. Baixando…{{extra}}{{percent}}",
    en: "The {{core_name}} core wasn't on your computer yet. Downloading…{{extra}}{{percent}}",
  },
  downloadingCoreLabel: {
    "pt-BR": "Baixando o core {{core_name}}",
    en: "Downloading {{core_name}} core",
  },
  cancelDownload: { "pt-BR": "Cancelar download", en: "Cancel download" },
  fileMissingError: {
    "pt-BR": "O arquivo deste jogo não foi encontrado na última varredura da pasta.",
    en: "This game's file was not found in the last folder scan.",
  },
  openGameFolder: { "pt-BR": "Abrir pasta do jogo", en: "Open game folder" },
  rescanFolder: { "pt-BR": "Revarrer pasta", en: "Rescan folder" },
  rescanning: { "pt-BR": "Revarrendo…", en: "Rescanning…" },
  errorOpeningFolder: {
    "pt-BR": "Não foi possível abrir a pasta do jogo: {{error}}",
    en: "Could not open game folder: {{error}}",
  },
  errorRescanningFolder: {
    "pt-BR": "Não foi possível revarrer esta pasta.",
    en: "Could not rescan this folder.",
  },
  gamesFoundAfterRescan: {
    "pt-BR": "{{count}} jogo(s) encontrado(s) nesta pasta.",
    en: "{{count}} game(s) found in this folder.",
  },
  errorReadingSessions: {
    "pt-BR": "Não foi possível ler as sessões.",
    en: "Could not read sessions.",
  },
  errorOpeningGame: {
    "pt-BR": "Não foi possível abrir o jogo",
    en: "Could not open game",
  },
  errorReadingStats: {
    "pt-BR": "Não foi possível ler as estatísticas",
    en: "Could not read statistics",
  },
  backButton: { "pt-BR": "Voltar", en: "Back" },
  fileHeading: { "pt-BR": "Arquivo", en: "File" },
  yourStats: { "pt-BR": "Suas estatísticas", en: "Your stats" },
  playtime: { "pt-BR": "Tempo jogado", en: "Playtime" },
  lastPlayed: { "pt-BR": "Última vez", en: "Last played" },
  sessions: { "pt-BR": "Sessões", en: "Sessions" },
} satisfies Dict;
