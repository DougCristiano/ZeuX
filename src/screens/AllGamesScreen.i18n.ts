import type { Dict } from "../i18n/i18n";

export const dict = {
  gamesCountTitle: {
    "pt-BR": "{{count}} jogos na biblioteca",
    en: "{{count}} games in the library",
  },
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
  // Achado #7 do critico-layout-biblioteca (2026-09-06): estava em
  // `SORT_LABELS`, uma constante de módulo pt-BR fixa (não passava por
  // `useT`) — em inglês a barra misturava idioma ("Sort by" + "Jogados por
  // último"). Movido pro dicionário; o valor em si (`recentes`/`titulo`/
  // `tempo_jogado`) continua em português de propósito, exceção registrada
  // no CLAUDE.md — só o RÓTULO visível precisa acompanhar o idioma.
  sortRecentes: {
    "pt-BR": "Jogados por último",
    en: "Last played",
  },
  sortTitulo: {
    "pt-BR": "Título (A–Z)",
    en: "Title (A–Z)",
  },
  sortTempoJogado: {
    "pt-BR": "Mais jogados",
    en: "Most played",
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
  // 2026-09-08: chip que inverte o filtro de ausência — ligado, mostra só
  // os jogos cujo arquivo sumiu (pasta trocada/revarrida), nunca os dois
  // juntos com o resto da biblioteca.
  missingLabel: {
    "pt-BR": "AUSENTES",
    en: "MISSING",
  },
  noMissingGames: {
    "pt-BR": "Nenhum jogo ausente — todos os arquivos apontados estão no lugar.",
    en: "No missing games — every pointed file is where it should be.",
  },
  // 2026-09-09: chip "filtro por hora de jogo" — só os jogos já abertos alguma vez.
  playedLabel: {
    "pt-BR": "JÁ JOGUEI",
    en: "PLAYED",
  },
  noPlayedGames: {
    "pt-BR": "Nenhum jogo com tempo de jogo registrado ainda.",
    en: "No games with recorded playtime yet.",
  },
  // 2026-09-09: chip que revela os jogos removidos da biblioteca, para trazê-los de volta.
  excludedLabel: {
    "pt-BR": "OCULTOS",
    en: "HIDDEN",
  },
  noExcludedGames: {
    "pt-BR": "Nenhum jogo removido da biblioteca.",
    en: "No games removed from the library.",
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
  // 2026-09-09: contador de progresso da busca de capas. Diz o que está
  // acontecendo porque um lote automático roda sem clique nenhum do usuário.
  scrapingCoversProgress: {
    "pt-BR": "buscando capas… {{processed}}/{{total}}",
    en: "fetching covers… {{processed}}/{{total}}",
  },
  // 2026-09-07 (achado do Douglas: "GERENCIAR PASTAS não tem uma boa
  // nomenclatura"): o botão levava pra tela "Pastas de jogos" (renomeada em
  // 2026-09-06 pra não colidir com "Biblioteca" da sidebar — comentário em
  // LibraryScreen.i18n.ts), mas usava um rótulo diferente do nome da própria
  // tela de destino. Alinhado: clicar em "Pastas de jogos" leva pra uma tela
  // que se chama "Pastas de jogos", sem re-nomear no meio do caminho.
  manageFolders: {
    "pt-BR": "Pastas de jogos",
    en: "Game folders",
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
  // 2026-09-09 (docs/pendencias.md, onboarding sem ROM): a tela vazia
  // apresenta o app em 3 passos curtos antes da ação, em vez de um botão
  // solto. Sem vocabulário de emulador, sem dizer de onde tirar jogo
  // (princípio 6) — a pasta é a que já existe no computador da pessoa. O
  // passo 2 fala do que a máquina alcança, nunca julga o hardware (princípio
  // 2).
  emptyStep1: {
    "pt-BR": "Aponte a pasta onde seus jogos já estão no computador.",
    en: "Point to the folder where your games already are on this computer.",
  },
  emptyStep2: {
    "pt-BR": "O ZeuX lê o seu hardware e mostra o que cada console alcança nesta máquina.",
    en: "ZeuX reads your hardware and shows what each console can reach on this machine.",
  },
  emptyStep3: {
    "pt-BR": "Clique no jogo — o ZeuX resolve o emulador e a configuração sozinho.",
    en: "Click a game — ZeuX sorts out the emulator and the configuration on its own.",
  },
  clearFilters: {
    "pt-BR": "Limpar filtros",
    en: "Clear filters",
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
