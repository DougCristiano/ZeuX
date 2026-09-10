import type { Dict } from "../i18n/i18n";

export const dict = {
  continuePlaying: { "pt-BR": "Continue jogando", en: "Continue playing" },
  yourConsoles: { "pt-BR": "Seus consoles", en: "Your consoles" },
  seeAllConsoles: { "pt-BR": "Ver todos", en: "See all" },
  seeAllGames: { "pt-BR": "Ver todos os jogos", en: "See all games" },
  viewGames: { "pt-BR": "Ver jogos", en: "View games" },
  gameCountSingular: { "pt-BR": "{{count}} jogo", en: "{{count}} game" },
  gameCountPlural: { "pt-BR": "{{count}} jogos", en: "{{count}} games" },
  noGames: { "pt-BR": "sem jogos nesta pasta", en: "no games in this folder" },
  // Rodapé de estatística — dado real (GET /sessions + /consoles/verdicts),
  // frase descritiva (princípio 2 do CLAUDE.md), nunca "só X horas".
  statsPlaytimeAndConsoles: {
    "pt-BR": "{{playtime}} jogados · {{ready}} de {{total}} consoles prontos pra jogar",
    en: "{{playtime}} played · {{ready}} of {{total}} consoles ready to play",
  },
  statsPlaytimeOnly: {
    "pt-BR": "{{playtime}} jogados",
    en: "{{playtime}} played",
  },
  // Onboarding de quem abre sem nenhuma pasta apontada ainda — mesmo
  // vocabulário do EmptyState de "Todos os jogos" (docs/pendencias.md,
  // "Onboarding para quem abre o app sem nenhuma ROM").
  emptyKicker: { "pt-BR": "Bem-vindo ao ZeuX", en: "Welcome to ZeuX" },
  emptyTitle: { "pt-BR": "Vamos configurar seu primeiro console", en: "Let's set up your first console" },
  emptyMessage: {
    "pt-BR": "O ZeuX lê o hardware desta máquina e diz honestamente o que cada console alcança — sem instalar nada sem sua autorização.",
    en: "ZeuX reads this machine's hardware and honestly tells you what each console can run — nothing is installed without your say.",
  },
  emptyStep1: { "pt-BR": "Aponte uma pasta com jogos que você já tem", en: "Point to a folder with games you already have" },
  emptyStep2: { "pt-BR": "O ZeuX identifica o console e diz o que a máquina alcança", en: "ZeuX identifies the console and says what this machine can run" },
  emptyStep3: { "pt-BR": "Clique no jogo — o emulador certo abre sozinho", en: "Click the game — the right emulator opens on its own" },
  chooseFolderWithGames: { "pt-BR": "Escolher pasta com jogos", en: "Choose a folder with games" },
  // Modais de instalação/lançamento inline — mesmo texto de AllGamesScreen,
  // reaproveitado aqui porque a home lança o jogo em destaque do mesmo jeito.
  failedToOpenGame: { "pt-BR": "Não foi possível abrir o jogo", en: "Could not open the game" },
  failedToInstallEmulator: { "pt-BR": "Não foi possível instalar o emulador", en: "Could not install the emulator" },
  hardwareBelowRecommended: { "pt-BR": "Hardware abaixo do recomendado", en: "Hardware below the recommended" },
  cancel: { "pt-BR": "Cancelar", en: "Cancel" },
  installAnyway: { "pt-BR": "Instalar assim mesmo", en: "Install anyway" },
  biosAbsent: { "pt-BR": "BIOS ausente", en: "BIOS missing" },
  biosEmptyWarning: {
    "pt-BR": "Este console precisa de arquivos de BIOS que ainda não foram colocados na pasta do emulador.",
    en: "This console needs BIOS files that have not been placed in the emulator's folder yet.",
  },
  openBiosFolder: { "pt-BR": "Abrir pasta da BIOS", en: "Open BIOS folder" },
  playAnyway: { "pt-BR": "Jogar assim mesmo", en: "Play anyway" },
  emulatorInstalledBiosNeededTitle: {
    "pt-BR": "Emulador instalado — falta a BIOS",
    en: "Emulator installed — BIOS still needed",
  },
  emulatorInstalledBiosNeededMessage: {
    "pt-BR": "O {{emulator}} foi instalado, mas este console precisa de arquivos de BIOS.",
    en: "{{emulator}} was installed, but this console needs BIOS files.",
  },
  closeButton: { "pt-BR": "Fechar", en: "Close" },
  downloadingCore: { "pt-BR": "Baixando o core {{coreName}}…", en: "Downloading {{coreName}} core…" },
  cancelDownload: { "pt-BR": "Cancelar download", en: "Cancel download" },
  openingGame: { "pt-BR": "Abrindo {{title}}…", en: "Opening {{title}}…" },
  failedToOpenBiosFolder: {
    "pt-BR": "Não foi possível abrir a pasta da BIOS: {{error}}",
    en: "Could not open the BIOS folder: {{error}}",
  },
} satisfies Dict;
