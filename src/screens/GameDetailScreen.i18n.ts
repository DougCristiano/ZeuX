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
  // 2026-09-08: troca manual de capa, independente de conta IGDB.
  changeCover: { "pt-BR": "Trocar capa", en: "Change cover" },
  imageFileFilter: { "pt-BR": "Imagem", en: "Image" },
  errorChangingCover: {
    "pt-BR": "Não foi possível trocar a capa deste jogo.",
    en: "Could not change this game's cover.",
  },
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
  // 2026-09-09: fluxo de "jogar mesmo assim" / instalar inline nesta tela
  // (antes só nas telas por console e "Todos os jogos"). Mesmos rótulos das
  // outras telas — a ação é a mesma.
  installAndPlay: { "pt-BR": "Instalar e jogar", en: "Install and play" },
  installingEmulator: { "pt-BR": "Instalando…", en: "Installing…" },
  installingEmulatorPhase: {
    "pt-BR": "Instalando o emulador · {{phase}}",
    en: "Installing the emulator · {{phase}}",
  },
  couldNotInstallEmulator: {
    "pt-BR": "Não foi possível instalar o emulador",
    en: "Could not install the emulator",
  },
  hardwareBelowRecommended: {
    "pt-BR": "Hardware abaixo do recomendado",
    en: "Hardware below recommended",
  },
  installAnyway: { "pt-BR": "Instalar mesmo assim", en: "Install anyway" },
  biosAbsent: { "pt-BR": "BIOS ausente", en: "BIOS missing" },
  biosEmptyMessage: {
    "pt-BR": "A pasta de BIOS deste emulador está vazia. Sem o arquivo, o jogo não deve abrir.",
    en: "This emulator's BIOS folder is empty. Without the file, the game may not open.",
  },
  openBiosFolder: { "pt-BR": "Abrir pasta do BIOS", en: "Open BIOS folder" },
  playAnyway: { "pt-BR": "Jogar mesmo assim", en: "Play anyway" },
  emulatorInstalledBiosNeededTitle: {
    "pt-BR": "Emulador instalado — falta o BIOS",
    en: "Emulator installed — BIOS still needed",
  },
  emulatorInstalledBiosNeededMessage: {
    "pt-BR":
      "{{emulator}} foi instalado. Este console precisa de um arquivo de BIOS que o ZeuX não fornece — você adiciona. Coloque o arquivo na pasta de BIOS e o jogo abre normalmente.",
    en:
      "{{emulator}} was installed. This console needs a BIOS file that ZeuX does not provide — you add it. Put the file in the BIOS folder and the game opens normally.",
  },
  // Título da seção do parecer. Descritivo, nunca julgador (princípio 2 do
  // CLAUDE.md): fala do que vai acontecer com o jogo, não da máquina.
  howItRuns: { "pt-BR": "Como vai rodar", en: "How it will run" },
  fileHeading: { "pt-BR": "Arquivo", en: "File" },
  yourStats: { "pt-BR": "Suas estatísticas", en: "Your stats" },
  playtime: { "pt-BR": "Tempo jogado", en: "Playtime" },
  lastPlayed: { "pt-BR": "Última vez", en: "Last played" },
  sessions: { "pt-BR": "Sessões", en: "Sessions" },
  // "Remover da biblioteca" (2026-09-09). O texto deixa claro que o arquivo
  // no disco não é tocado — só a entrada na biblioteca some.
  editTitle: { "pt-BR": "Editar título", en: "Edit title" },
  titleInputLabel: { "pt-BR": "Título do jogo", en: "Game title" },
  saveTitle: { "pt-BR": "Salvar", en: "Save" },
  savingTitle: { "pt-BR": "Salvando…", en: "Saving…" },
  cancelTitle: { "pt-BR": "Cancelar", en: "Cancel" },
  restoreDerivedTitle: { "pt-BR": "Usar o nome do arquivo", en: "Use the file name" },
  titleIsCustom: {
    "pt-BR": "Título editado à mão. Uma nova varredura não desfaz isso.",
    en: "Title edited by hand. A rescan won't undo it.",
  },
  titleSaved: { "pt-BR": "Título salvo.", en: "Title saved." },
  titleRestored: {
    "pt-BR": "Título voltou ao nome do arquivo.",
    en: "Title reverted to the file name.",
  },
  errorSavingTitle: {
    "pt-BR": "Não foi possível salvar o título.",
    en: "Could not save the title.",
  },
  removeHeading: { "pt-BR": "Remover da biblioteca", en: "Remove from library" },
  removeFromLibraryHelp: {
    "pt-BR": "Esconde este jogo da biblioteca. O arquivo continua no seu computador, intacto — só some da lista, e não volta na próxima varredura. Para trazer de volta, use o filtro \"Ocultos\" em Todos os jogos.",
    en: "Hides this game from the library. The file stays on your computer, untouched — it just leaves the list, and won't come back on the next scan. To bring it back, use the \"Hidden\" filter in All games.",
  },
  removeFromLibrary: { "pt-BR": "Remover da biblioteca", en: "Remove from library" },
  removing: { "pt-BR": "Removendo…", en: "Removing…" },
  removeFromLibraryTitle: { "pt-BR": "Remover da biblioteca?", en: "Remove from library?" },
  removeFromLibraryConfirm: {
    "pt-BR": "\"{{title}}\" some da biblioteca. O arquivo no disco não é apagado, e você pode trazer o jogo de volta pelo filtro \"Ocultos\".",
    en: "\"{{title}}\" leaves the library. The file on disk is not deleted, and you can bring the game back through the \"Hidden\" filter.",
  },
  cancelRemove: { "pt-BR": "Cancelar", en: "Cancel" },
  restoreHeading: { "pt-BR": "Trazer de volta", en: "Bring back" },
  restoreToLibrary: { "pt-BR": "Trazer de volta à biblioteca", en: "Bring back to library" },
  restoreToLibraryHelp: {
    "pt-BR": "Este jogo está oculto. Trazer de volta faz ele reaparecer na biblioteca normalmente.",
    en: "This game is hidden. Bringing it back makes it show up in the library again.",
  },
  errorRemovingFromLibrary: {
    "pt-BR": "Não foi possível remover o jogo da biblioteca.",
    en: "Could not remove the game from the library.",
  },
} satisfies Dict;
