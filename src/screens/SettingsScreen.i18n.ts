import type { Dict } from "../i18n/i18n";

export const dict = {
  title: { "pt-BR": "Configurações", en: "Settings" },

  // Language section
  languageLabel: { "pt-BR": "Idioma", en: "Language" },

  // Updates section
  updatesHeading: { "pt-BR": "Atualizações", en: "Updates" },
  updatesDescription: {
    "pt-BR": "Confira as releases oficiais do ZeuX no GitHub e instale uma versão nova diretamente pelo aplicativo.",
    en: "Check the official ZeuX releases on GitHub and install a new version directly from the app.",
  },
  currentVersion: { "pt-BR": "Versão instalada: {{version}}", en: "Installed version: {{version}}" },
  checkUpdates: { "pt-BR": "Procurar atualização", en: "Check for updates" },
  checkingUpdates: { "pt-BR": "Procurando…", en: "Checking…" },
  updateAvailable: { "pt-BR": "Atualização disponível: v{{version}}", en: "Update available: v{{version}}" },
  installUpdate: { "pt-BR": "Baixar e instalar", en: "Download and install" },
  downloadingUpdate: { "pt-BR": "Baixando e instalando…", en: "Downloading and installing…" },
  downloadingUpdateProgress: { "pt-BR": "Baixando e instalando… {{progress}}%", en: "Downloading and installing… {{progress}}%" },
  upToDate: { "pt-BR": "O ZeuX já está atualizado.", en: "ZeuX is up to date." },
  updateCheckError: { "pt-BR": "Não foi possível procurar atualizações.", en: "Could not check for updates." },
  updateInstallError: { "pt-BR": "Não foi possível instalar a atualização.", en: "Could not install the update." },

  // Installation section
  installationHeading: { "pt-BR": "Instalação", en: "Installation" },
  installationDescription: {
    "pt-BR": "Emuladores instalados pelo ZeuX, biblioteca, capas e configurações desta máquina ficam todos dentro da mesma pasta.",
    en: "Emulators installed by ZeuX, library, covers, and configuration for this machine are all in the same folder.",
  },
  locatingFolder: { "pt-BR": "Localizando a pasta…", en: "Locating folder…" },
  locateInstallError: { "pt-BR": "Não foi possível localizar a pasta de instalação.", en: "Could not locate installation folder." },
  openInstallFolder: { "pt-BR": "Abrir pasta de instalação", en: "Open installation folder" },

  // Controllers section
  controllersHeading: { "pt-BR": "Controles", en: "Controllers" },
  controllersDescription: {
    "pt-BR": "Configure seu controle físico uma vez só abaixo — o ZeuX abre cada emulador, diz o passo exato e confirma que funcionou. Sem emuladores instalados que suportem isso, a lista fica vazia.",
    en: "Set up your physical controller once below — ZeuX opens each emulator, tells you the exact step, and confirms it worked. With no installed emulator that supports this, the list stays empty.",
  },
  configureControllerButton: { "pt-BR": "Configurar controle", en: "Configure controller" },
  testControllerButton: { "pt-BR": "Testar controle", en: "Test controller" },
  loadingEmulatorsForControllers: { "pt-BR": "Carregando emuladores…", en: "Loading emulators…" },
  noBindableEmulators: {
    "pt-BR": "Nenhum emulador instalado suporta mapeamento de controle ainda (hoje: PCSX2 e RetroArch).",
    en: "No installed emulator supports controller mapping yet (currently: PCSX2 and RetroArch).",
  },

  // Configurar controle — fluxo guiado (2026-09-08): um passo por emulador,
  // que abre o app real e confirma lendo o arquivo dele depois. O ZeuX
  // nunca escreve o bind de botão físico sozinho — cada emulador resolve
  // isso do seu jeito nativo (PCSX2: SDL posicional; RetroArch: autoconfig
  // por vendor/product).
  guidedSetupHeading: { "pt-BR": "Configurar controle", en: "Set up controller" },
  guidedSetupDetectedController: { "pt-BR": "Controle detectado: {{name}}", en: "Detected controller: {{name}}" },
  guidedSetupNoController: {
    "pt-BR": "Nenhum controle detectado ainda — conecte um e aperte qualquer botão.",
    en: "No controller detected yet — connect one and press any button.",
  },
  guidedSetupOpenButton: { "pt-BR": "Abrir {{emulator}}", en: "Open {{emulator}}" },
  guidedSetupOpening: { "pt-BR": "Abrindo…", en: "Opening…" },
  guidedSetupOpenError: { "pt-BR": "Não foi possível abrir o {{emulator}}.", en: "Could not open {{emulator}}." },
  guidedSetupVerifyButton: { "pt-BR": "Concluído, verificar", en: "Done, verify" },
  guidedSetupVerifying: { "pt-BR": "Verificando…", en: "Verifying…" },
  guidedSetupCheckError: { "pt-BR": "Não foi possível verificar agora.", en: "Could not check right now." },
  guidedSetupConfigured: { "pt-BR": "Configurado", en: "Configured" },
  guidedSetupNotConfiguredYet: {
    "pt-BR": "Ainda não detectamos — siga os passos acima e verifique de novo.",
    en: "Not detected yet — follow the steps above and check again.",
  },
  guidedSetupInstructionsPcsx2: {
    "pt-BR": "Configurações → Controladores → Pad1: aperte cada botão do vocabulário do PCSX2 (Up, Cross, Triangle...) com o seu controle físico, sem criar um perfil de entrada separado.",
    en: "Settings → Controllers → Pad1: press each PCSX2 action (Up, Cross, Triangle...) with your physical controller, without creating a separate input profile.",
  },
  guidedSetupInstructionsRetroarch: {
    "pt-BR": "Configurações → Entrada → Porta 1 → Configurar: aperte cada botão pedido com o seu controle físico e, ao final, escolha \"Salvar perfil de controle\".",
    en: "Settings → Input → Port 1 Controls → Configure: press each requested button with your physical controller, and at the end choose \"Save Controller Profile\".",
  },

  // Mapeamento manual (avançado) — o painel de teclado/botão por ação que
  // já existia antes do fluxo guiado acima; continua para overrides finos.
  manualMappingHeading: { "pt-BR": "Mapeamento manual (avançado)", en: "Manual mapping (advanced)" },
  manualMappingButton: { "pt-BR": "Mapear teclado/controle", en: "Map keyboard/controller" },
  hideManualMapping: { "pt-BR": "Ocultar", en: "Hide" },

  // Uninstall section
  uninstallHeading: { "pt-BR": "Desinstalar o ZeuX", en: "Uninstall ZeuX" },
  uninstallWindowsDescription: {
    "pt-BR": "O ZeuX já tem um desinstalador registrado no Windows — este botão só leva direto até ele, em Configurações › Aplicativos. Remover o programa por lá não apaga a pasta acima (seus emuladores instalados, saves e biblioteca continuam no disco, para o caso de reinstalar depois); apague-a manualmente se quiser também limpar esses dados.",
    en: "ZeuX already has an uninstaller registered with Windows — this button just takes you to it directly in Settings › Apps. Removing the program from there won't delete the folder above (your installed emulators, saves, and library stay on disk in case you reinstall later); delete it manually if you also want to clean up that data.",
  },
  uninstallMacDescription: {
    "pt-BR": "No macOS, desinstalar é mover o ZeuX.app para a Lixeira, como qualquer outro aplicativo.",
    en: "On macOS, uninstalling is as simple as moving ZeuX.app to the Trash, like any other app.",
  },
  uninstallLinuxDescription: {
    "pt-BR": "No Linux, desinstale pelo mesmo gerenciador de pacotes usado para instalar (ex.: seu gerenciador de .deb/.rpm, ou apague o AppImage). Isso não apaga a pasta acima — apague-a manualmente se também quiser remover emuladores instalados, saves e biblioteca.",
    en: "On Linux, uninstall using the same package manager you used to install (e.g., your .deb/.rpm manager, or delete the AppImage). This won't delete the folder above — delete it manually if you also want to remove installed emulators, saves, and library.",
  },
  uninstallSuffix: {
    "pt-BR": "Isso não apaga a pasta acima — apague-a manualmente se também quiser remover emuladores instalados, saves e biblioteca.",
    en: "This won't delete the folder above — delete it manually if you also want to remove installed emulators, saves, and library.",
  },
  waitingForInstall: { "pt-BR": "Aguardando localizar a instalação…", en: "Waiting to locate installation…" },
  openWindowsUninstall: { "pt-BR": "Abrir desinstalação do Windows", en: "Open Windows uninstall" },

  // IGDB section
  igdbHeading: { "pt-BR": "Capas de jogo (IGDB)", en: "Game covers (IGDB)" },
  igdbDescription: {
    "pt-BR": "O ZeuX pode buscar a capa e a data de lançamento dos seus jogos no IGDB. O ideal é cada pessoa conectar a própria conta — o ID e o segredo do cliente, obtidos no painel de desenvolvedor do Twitch — para que a busca de todo mundo que usa o ZeuX não divida a mesma cota. A credencial fica guardada só nesta máquina, nunca é enviada a nenhum servidor do ZeuX.",
    en: "ZeuX can fetch game covers and release dates from IGDB. It's ideal for each person to connect their own account — the client ID and secret, obtained from the Twitch developer panel — so that everyone using ZeuX doesn't share the same quota. The credential is stored only on this machine and never sent to any ZeuX server.",
  },
  readingAccountStatus: { "pt-BR": "Lendo o estado da conta…", en: "Reading account status…" },
  tryAgain: { "pt-BR": "Tentar de novo", en: "Try again" },
  accountConnected: { "pt-BR": "Conta conectada.", en: "Account connected." },
  disconnectConfirmTitle: { "pt-BR": "Desconectar conta?", en: "Disconnect account?" },
  disconnectConfirmMessage: {
    "pt-BR": "O ZeuX volta a usar a credencial de teste compartilhada (abaixo) até você conectar de novo.",
    en: "ZeuX will go back to using the shared test credential (below) until you connect again.",
  },
  disconnect: { "pt-BR": "Desconectar", en: "Disconnect" },
  usingTestCredential: {
    "pt-BR": "Usando a credencial de teste do ZeuX — a busca de capa já funciona, sem precisar configurar nada. Ela é compartilhada com quem também não conectou a própria conta; conecte a sua para não depender dessa cota.",
    en: "Using ZeuX's test credential — cover search already works without any setup. It's shared with anyone else who hasn't connected their own account; connect yours to avoid depending on that quota.",
  },
  noTestCredential: {
    "pt-BR": "Esta instalação não tem a credencial de teste do ZeuX (ela só vem em builds oficiais do release). A busca de capa continua funcionando pela fonte livre (libretro-thumbnails) para a maioria dos jogos; para os que dependem do IGDB, conecte sua própria conta abaixo.",
    en: "This installation doesn't have ZeuX's test credential (it only ships with official release builds). Cover search still works through the free source (libretro-thumbnails) for most games; for ones that depend on IGDB, connect your own account below.",
  },
  clientIdLabel: { "pt-BR": "ID do cliente", en: "Client ID" },
  clientSecretLabel: { "pt-BR": "Segredo do cliente", en: "Client secret" },
  connecting: { "pt-BR": "Conectando…", en: "Connecting…" },
  connect: { "pt-BR": "Conectar", en: "Connect" },
  connectError: { "pt-BR": "Não foi possível conectar a conta.", en: "Could not connect account." },
  accountStatusError: { "pt-BR": "Não foi possível ler o estado da conta.", en: "Could not read account status." },
  connectedToast: { "pt-BR": "Conta conectada.", en: "Account connected." },
  disconnectedToast: { "pt-BR": "Conta desconectada.", en: "Account disconnected." },
  disconnectError: { "pt-BR": "Não foi possível desconectar a conta.", en: "Could not disconnect account." },
  cancel: { "pt-BR": "Cancelar", en: "Cancel" },
  pathOpenError: { "pt-BR": "Não foi possível abrir a pasta: {{error}}", en: "Could not open folder: {{error}}" },
  uninstallOpenError: { "pt-BR": "Não foi possível abrir a tela de desinstalação do Windows: {{error}}", en: "Could not open Windows uninstall screen: {{error}}" },
} satisfies Dict;
