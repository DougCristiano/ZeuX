import type { Dict } from "../i18n/i18n";

export const dict = {
  couldNotOpenEmulator: {
    "pt-BR": "Não foi possível abrir o emulador.",
    en: "Could not open emulator.",
  },
  couldNotOpenFolder: {
    "pt-BR": "Não foi possível abrir a pasta: {{error}}",
    en: "Could not open folder: {{error}}",
  },
  createFolderIfNotExists: {
    "pt-BR": "Se ela ainda não existe, crie-a no caminho acima.",
    en: "If it doesn't exist yet, create it at the path above.",
  },
  verifying: {
    "pt-BR": "Verificando…",
    en: "Verifying…",
  },
  alreadyInstalledVerify: {
    "pt-BR": "Já instalei — verificar",
    en: "Already installed — verify",
  },
  notFoundEmulator: {
    "pt-BR":
      "O ZeuX ainda não encontrou o {{emulatorName}}. Confira se o executável está dentro da pasta acima (ou numa subpasta dela) e verifique de novo.",
    en:
      "ZeuX has not found {{emulatorName}} yet. Check if the executable is inside the folder above (or in a subfolder) and verify again.",
  },
  isChosenEmulator: {
    "pt-BR": "É o que o ZeuX usa para abrir os jogos deste console.",
    en: "This is what ZeuX uses to open games on this console.",
  },
  installedByZeuxBadge: {
    "pt-BR": "instalado pelo ZeuX",
    en: "installed by ZeuX",
  },
  alreadyInstalledBadge: {
    "pt-BR": "já estava na máquina",
    en: "already on machine",
  },
  notInstalledBadge: {
    "pt-BR": "não instalado",
    en: "not installed",
  },
  coreForConsole: {
    "pt-BR": "Core deste console:",
    en: "Core for this console:",
  },
  downloadedBadge: {
    "pt-BR": "baixado",
    en: "downloaded",
  },
  missingBadge: {
    "pt-BR": "faltando",
    en: "missing",
  },
  downloadCore: {
    "pt-BR": "Baixar core",
    en: "Download core",
  },
  starting: {
    "pt-BR": "Iniciando…",
    en: "Starting…",
  },
  canceling: {
    "pt-BR": "Cancelando…",
    en: "Canceling…",
  },
  cancel: {
    "pt-BR": "Cancelar",
    en: "Cancel",
  },
  coreAutoDownload: {
    "pt-BR":
      "O ZeuX baixa este core sozinho na primeira vez que você abrir um jogo deste console.",
    en:
      "ZeuX downloads this core automatically the first time you open a game on this console.",
  },
  hardwareBelowRecommended: {
    "pt-BR": "Hardware abaixo do recomendado",
    en: "Hardware below recommended",
  },
  installAnyway: {
    "pt-BR": "Instalar mesmo assim",
    en: "Install anyway",
  },
  removeEmulatorTitle: {
    "pt-BR": "Remover emulador?",
    en: "Remove emulator?",
  },
  removeEmulatorMessage: {
    "pt-BR": "{{emulatorName}} será desinstalado da pasta gerenciada pelo ZeuX.",
    en: "{{emulatorName}} will be uninstalled from ZeuX's managed folder.",
  },
  removeAnyway: {
    "pt-BR": "Remover mesmo assim",
    en: "Remove anyway",
  },
  configureElsewhereMessage: {
    "pt-BR":
      "Configuração e controles deste emulador ainda só dentro do próprio {{emulatorName}}.",
    en:
      "Configuration and controls for this emulator are still only available within {{emulatorName}} itself.",
  },
  openEmulatorTooltip: {
    "pt-BR": "Abre o emulador sem nenhum jogo, para configurar dentro dele.",
    en: "Opens the emulator without any game to configure it.",
  },
  opening: {
    "pt-BR": "Abrindo…",
    en: "Opening…",
  },
  openEmulatorSettings: {
    "pt-BR": "Abrir configurações do emulador",
    en: "Open emulator settings",
  },
  retryRemove: {
    "pt-BR": "Tentar remover de novo",
    en: "Try removing again",
  },
  remove: {
    "pt-BR": "Remover",
    en: "Remove",
  },
  openOfficialSite: {
    "pt-BR": "Abrir site oficial",
    en: "Open official website",
  },
  retryInstall: {
    "pt-BR": "Tentar de novo",
    en: "Try again",
  },
  install: {
    "pt-BR": "Instalar",
    en: "Install",
  },
  extractManualInstall: {
    "pt-BR":
      "Extraia (ou instale) o {{emulatorName}} nesta pasta para o ZeuX encontrar sozinho:",
    en:
      "Extract (or install) {{emulatorName}} in this folder for ZeuX to find automatically:",
  },
  openFolder: {
    "pt-BR": "Abrir pasta",
    en: "Open folder",
  },
  hideConfig: {
    "pt-BR": "Ocultar configurações",
    en: "Hide configuration",
  },
  config: {
    "pt-BR": "Configurações",
    en: "Configuration",
  },
  hideBindings: {
    "pt-BR": "Ocultar mapeamento",
    en: "Hide bindings",
  },
  mapControls: {
    "pt-BR": "Mapear controles",
    en: "Map controls",
  },
  gamesForConsole: {
    "pt-BR": "Jogos de {{shortName}}",
    en: "Games for {{shortName}}",
  },
  gameCountSingular: {
    "pt-BR": "1 jogo encontrado",
    en: "1 game found",
  },
  gameCountPlural: {
    "pt-BR": "{{count}} jogos encontrados",
    en: "{{count}} games found",
  },
  noFoldersAssigned: {
    "pt-BR":
      "Nenhuma pasta apontada ainda. O ZeuX lê os jogos direto de onde eles já estão no seu disco — nada é copiado nem movido.",
    en:
      "No folder assigned yet. ZeuX reads games directly from where they are on your disk — nothing is copied or moved.",
  },
  rescan: {
    "pt-BR": "Revarrer",
    en: "Rescan",
  },
  removeFolderTitle: {
    "pt-BR": "Remover esta pasta?",
    en: "Remove this folder?",
  },
  removeFolderMessage: {
    "pt-BR":
      "Os jogos dela saem da biblioteca do ZeuX. Nenhum arquivo é apagado do seu disco.",
    en:
      "Games from it will be removed from ZeuX's library. No files are deleted from your disk.",
  },
  chooseFolder: {
    "pt-BR": "Escolher pasta",
    en: "Choose folder",
  },
  assignAnotherFolder: {
    "pt-BR": "Apontar outra pasta",
    en: "Assign another folder",
  },
  seeGames: {
    "pt-BR": "Ver jogos",
    en: "See games",
  },
  biosFireware: {
    "pt-BR": "BIOS / firmware",
    en: "BIOS / firmware",
  },
  biosRequired: {
    "pt-BR":
      "Este console costuma exigir um arquivo de BIOS ou firmware do próprio aparelho.",
    en:
      "This console usually requires a BIOS or firmware file from the original device.",
  },
  biosPathUnknown: {
    "pt-BR":
      "O ZeuX ainda não sabe em que pasta o {{emulatorName}} lê esse arquivo — a configuração fica dentro do próprio emulador.",
    en:
      "ZeuX does not yet know which folder {{emulatorName}} reads this file from — configuration stays within the emulator itself.",
  },
  biosDependsOnEmulator: {
    "pt-BR":
      "A pasta depende do emulador. Instale um acima e ela aparece aqui, se o ZeuX souber onde aquele emulador lê o arquivo.",
    en:
      "The folder depends on the emulator. Install one above and it will appear here if ZeuX knows where that emulator reads the file.",
  },
  openBiosFolder: {
    "pt-BR": "Abrir pasta do BIOS",
    en: "Open BIOS folder",
  },
  couldNotLoadConsole: {
    "pt-BR": "Não foi possível carregar este console.",
    en: "Could not load this console.",
  },
  consoleNotInCatalog: {
    "pt-BR": 'O console "{{consoleId}}" não está no catálogo do ZeuX.',
    en: 'Console "{{consoleId}}" is not in ZeuX\'s catalog.',
  },
  backConsoles: {
    "pt-BR": "← Consoles",
    en: "← Consoles",
  },
  loadingConsole: {
    "pt-BR": "Carregando console…",
    en: "Loading console…",
  },
  consoleYearShortName: {
    "pt-BR": "{{year}} · {{shortName}}",
    en: "{{year}} · {{shortName}}",
  },
  howToRun: {
    "pt-BR": "Como rodar",
    en: "How to run",
  },
  howToRunOptions: {
    "pt-BR": "Como rodar — {{count}} opções",
    en: "How to run — {{count}} options",
  },
  noEmulatorKnown: {
    "pt-BR":
      "O ZeuX ainda não conhece nenhum emulador para {{consoleName}}. Nada a instalar por aqui — quando um adapter para este console existir, ele aparece nesta tela sozinho.",
    en:
      "ZeuX doesn't know of any emulator for {{consoleName}} yet. Nothing to install here — when an adapter for this console exists, it will appear on this screen automatically.",
  },
  biosAbsentMessage: {
    "pt-BR":
      "A pasta de BIOS do {{emulatorName}} está vazia. Sem o arquivo, os jogos deste console não devem abrir.",
    en:
      "The BIOS folder for {{emulatorName}} is empty. Without the file, games on this console should not open.",
  },
  onThisMachine: {
    "pt-BR": "Nesta máquina",
    en: "On this machine",
  },
  // Migrado de VerdictScreen.i18n.ts (2026-09-07): a grade de parecer por
  // console saiu da tela de Especificações — este disclaimer (D2,
  // docs/roadmap.md) segue o parecer para onde ele passou a viver de
  // verdade, aqui no detalhe de cada console.
  estimateLabel: { "pt-BR": "estimativa", en: "estimate" },
  thresholdsNotCalibrated: {
    "pt-BR": "Os patamares abaixo são uma estimativa: os requisitos do catálogo ainda não foram medidos em hardware real.",
    en: "The thresholds below are an estimate: the catalog requirements have not yet been measured on real hardware.",
  },
  couldNotPointFolder: {
    "pt-BR": "Não foi possível apontar esta pasta.",
    en: "Could not assign this folder.",
  },
  couldNotScanFolder: {
    "pt-BR": "Não foi possível varrer a pasta.",
    en: "Could not scan this folder.",
  },
  couldNotRemoveFolder: {
    "pt-BR": "Não foi possível remover a pasta.",
    en: "Could not remove this folder.",
  },
  couldNotOpenBiosFolder: {
    "pt-BR": "Não foi possível abrir a pasta do BIOS: {{error}}",
    en: "Could not open BIOS folder: {{error}}",
  },
  biosAbsent: {
    "pt-BR": "BIOS ausente",
    en: "BIOS absent",
  },
  // Trilha das quatro peças da prontidão, no topo da tela. Rótulos curtos: o
  // chip já está em caixa alta e monoespaçado, e a frase completa continua
  // sendo `readiness.detail` logo acima.
  trailEmulator: { "pt-BR": "Emulador", en: "Emulator" },
  trailCore: { "pt-BR": "Core", en: "Core" },
  trailBios: { "pt-BR": "BIOS", en: "BIOS" },
  trailFolder: { "pt-BR": "Pasta", en: "Folder" },
  trailStateOk: { "pt-BR": "no lugar", en: "in place" },
  trailStatePending: { "pt-BR": "falta", en: "missing" },
  // "o ZeuX não sabe", nunca "provavelmente ok": dado não verificável é
  // declarado desconhecido (princípio 4 do CLAUDE.md).
  trailStateUnknown: { "pt-BR": "o ZeuX não sabe", en: "ZeuX doesn't know" },
  trailStateNotApplicable: { "pt-BR": "não se aplica", en: "not applicable" },
} satisfies Dict;
