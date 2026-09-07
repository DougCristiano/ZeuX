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
    "pt-BR": "Escolha o perfil de controle e mapeie botões para cada emulador que suporta isso. Sem emuladores instalados que suportem mapeamento, esta lista fica vazia.",
    en: "Choose the controller profile and map buttons for each emulator that supports it. With no installed emulator that supports mapping, this list stays empty.",
  },
  testControllerButton: { "pt-BR": "Testar controle", en: "Test controller" },
  loadingEmulatorsForControllers: { "pt-BR": "Carregando emuladores…", en: "Loading emulators…" },
  noBindableEmulators: {
    "pt-BR": "Nenhum emulador instalado suporta mapeamento de controle ainda (hoje: PCSX2 e RetroArch).",
    en: "No installed emulator supports controller mapping yet (currently: PCSX2 and RetroArch).",
  },
  configureController: { "pt-BR": "Configurar controle", en: "Configure controller" },
  hideController: { "pt-BR": "Ocultar", en: "Hide" },

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
