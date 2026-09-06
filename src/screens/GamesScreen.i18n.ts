import type { Dict } from "../i18n/i18n";

export const dict = {
  couldNotOpenBiosFolder: {
    "pt-BR": "Não foi possível abrir a pasta do BIOS: {{error}}",
    en: "Could not open BIOS folder: {{error}}",
  },
  couldNotListGames: {
    "pt-BR": "Não foi possível listar os jogos.",
    en: "Could not list games.",
  },
  couldNotCancelDownload: {
    "pt-BR": "Não foi possível cancelar o download.",
    en: "Could not cancel download.",
  },
  coreDownloadedNotFound: {
    "pt-BR":
      "O core foi baixado, mas o ZeuX continua não encontrando ele no computador. Tente abrir o jogo de novo; se persistir, confira a lista de cores na tela de Emuladores.",
    en:
      "The core was downloaded, but ZeuX still cannot find it on this computer. Try opening the game again; if it persists, check the cores list in the Emulators screen.",
  },
  sessionStarted: {
    "pt-BR": "{{title}}: sessão iniciada.",
    en: "{{title}}: session started.",
  },
  couldNotLaunchGame: {
    "pt-BR": "Não foi possível abrir o jogo.",
    en: "Could not launch game.",
  },
  addedToFavorites: {
    "pt-BR": "Adicionado aos favoritos.",
    en: "Added to favorites.",
  },
  removedFromFavorites: {
    "pt-BR": "Removido dos favoritos.",
    en: "Removed from favorites.",
  },
  couldNotSaveFavorite: {
    "pt-BR": "Não foi possível salvar o favorito. Tente de novo.",
    en: "Could not save favorite. Try again.",
  },
  backToLibrary: {
    "pt-BR": "Voltar à biblioteca",
    en: "Back to library",
  },
  couldNotLaunchGameTitle: {
    "pt-BR": "Não foi possível abrir o jogo",
    en: "Could not launch game",
  },
  couldNotInstallEmulator: {
    "pt-BR": "Não foi possível instalar o emulador",
    en: "Could not install emulator",
  },
  couldNotLoadScreen: {
    "pt-BR": "Não foi possível carregar a tela",
    en: "Could not load screen",
  },
  hardwareBelowRecommended: {
    "pt-BR": "Hardware abaixo do recomendado",
    en: "Hardware below recommended",
  },
  installAnyway: {
    "pt-BR": "Instalar mesmo assim",
    en: "Install anyway",
  },
  biosAbsent: {
    "pt-BR": "BIOS ausente",
    en: "BIOS absent",
  },
  biosEmptyMessage: {
    "pt-BR":
      "A pasta de BIOS deste emulador está vazia. Sem o arquivo, o jogo não deve abrir.",
    en:
      "The BIOS folder for this emulator is empty. Without the file, the game should not open.",
  },
  openBiosFolder: {
    "pt-BR": "Abrir pasta do BIOS",
    en: "Open BIOS folder",
  },
  playAnyway: {
    "pt-BR": "Jogar mesmo assim",
    en: "Play anyway",
  },
  externalDependency: {
    "pt-BR": "Dependência externa",
    en: "External dependency",
  },
  externalFileMessage: {
    "pt-BR":
      "Este console costuma exigir um arquivo externo (BIOS, firmware ou plugin) que o ZeuX não fornece nem verifica. Se o jogo não abrir, confira essa configuração diretamente no emulador.",
    en:
      "This console usually requires an external file (BIOS, firmware, or plugin) that ZeuX does not provide or verify. If the game does not open, check this configuration directly in the emulator.",
  },
  noAutoPreset: {
    "pt-BR": "Sem preset automático",
    en: "No automatic preset",
  },
  noAutoPresetMessage: {
    "pt-BR":
      "Este computador não alcançou nenhum patamar de compatibilidade conhecido para {{consoleName}}. Os jogos continuam listados, mas o ZeuX não tem uma configuração para sugerir.",
    en:
      "This computer has not reached any known compatibility level for {{consoleName}}. Games remain listed, but ZeuX has no configuration to suggest.",
  },
  loadingGames: {
    "pt-BR": "Carregando jogos…",
    en: "Loading games…",
  },
  noGamesFound: {
    "pt-BR": "Nenhum jogo achado ainda para este console.",
    en: "No games found yet for this console.",
  },
  searchGames: {
    "pt-BR": "Buscar jogos",
    en: "Search games",
  },
  searchGamesPlaceholder: {
    "pt-BR": "Buscar jogos…",
    en: "Search games…",
  },
  noGamesMatchingSearch: {
    "pt-BR": 'Nenhum jogo encontrado para "{{search}}".',
    en: 'No games found for "{{search}}".',
  },
  downloadingCore: {
    "pt-BR": "Baixando o core {{coreName}}…",
    en: "Downloading core {{coreName}}…",
  },
  cancelDownload: {
    "pt-BR": "Cancelar download",
    en: "Cancel download",
  },
  notApplied: {
    "pt-BR": "Não aplicado",
    en: "Not applied",
  },
  cancel: {
    "pt-BR": "Cancelar",
    en: "Cancel",
  },
} satisfies Dict;
