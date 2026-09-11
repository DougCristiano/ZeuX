import type { Dict } from "../i18n/i18n";

export const dict = {
  previousPage: {
    "pt-BR": "Anterior",
    en: "Previous",
  },
  pageIndicator: {
    "pt-BR": "página {{page}} de {{totalPages}}",
    en: "page {{page}} of {{totalPages}}",
  },
  nextPage: {
    "pt-BR": "Próxima",
    en: "Next",
  },
  removeFavorite: {
    "pt-BR": "Remover dos favoritos",
    en: "Remove from favorites",
  },
  addFavorite: {
    "pt-BR": "Favoritar",
    en: "Add to favorites",
  },
  close: {
    "pt-BR": "Fechar",
    en: "Close",
  },
  understand: {
    "pt-BR": "Entendi",
    en: "Got it",
  },
  retryButton: {
    "pt-BR": "Tentar de novo",
    en: "Try again",
  },
  manualInstallTitle: {
    "pt-BR": "Este emulador é instalado por fora",
    en: "This emulator is installed manually",
  },
  manualInstallMessage: {
    "pt-BR": "O {{adapterName}} não é distribuído de um jeito que o ZeuX consiga baixar sozinho. A tela do console mostra onde baixar e em que pasta colocar para o ZeuX encontrar depois.",
    en: "{{adapterName}} is not distributed in a way that ZeuX can download automatically. The console screen shows where to download and which folder to place it in so ZeuX can find it later.",
  },
  seeConsole: {
    "pt-BR": "Ver o console",
    en: "See the console",
  },
  alreadyInstalledPointManually: {
    "pt-BR": "Já está instalado — apontar",
    en: "Already installed — point to it",
  },
  playGame: {
    "pt-BR": "Jogar {{title}}",
    en: "Play {{title}}",
  },
  noConsoleVerdictYet: {
    "pt-BR": "O parecer de compatibilidade para este console ainda não foi lido nesta máquina.",
    en: "The compatibility verdict for this console has not been read on this machine yet.",
  },
  externalDependency: {
    "pt-BR": "Dependência externa",
    en: "External dependency",
  },
  externalDependencyMessage: {
    "pt-BR": "Este console costuma exigir um arquivo externo (BIOS, firmware ou plugin) que o ZeuX não fornece nem verifica.",
    en: "This console usually requires an external file (BIOS, firmware, or plugin) that ZeuX does not provide or verify.",
  },
  bottleneckLabel: {
    "pt-BR": "O que separa do patamar acima",
    en: "What holds back the next tier",
  },
  partialPrecisionMessage: {
    "pt-BR": "Não foi possível confirmar todos os requisitos deste console — este parecer é uma estimativa.",
    en: "Could not confirm all requirements for this console — this verdict is an estimate.",
  },
  levelOtimo: {
    "pt-BR": "ótimo",
    en: "excellent",
  },
  levelBom: {
    "pt-BR": "bom",
    en: "good",
  },
  levelLimitado: {
    "pt-BR": "limitado",
    en: "limited",
  },
  levelImprovavel: {
    "pt-BR": "improvável",
    en: "unlikely",
  },
} satisfies Dict;
