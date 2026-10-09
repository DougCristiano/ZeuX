import type { Dict } from "../i18n/i18n";

// Rótulos das opções de emulador, pela ID "Seção.Chave" que o servidor
// devolve (internal/emulator/emulator_settings.go). Uma ID igual em dois
// emuladores teria o mesmo texto — hoje não há colisão.
export const dict = {
  modalTitle: { "pt-BR": "Configurações do {{name}}", en: "{{name}} settings" },
  modalDescription: {
    "pt-BR": "Gravadas direto no arquivo de configuração do {{name}}. Só muda o que você alterar aqui — o resto do arquivo fica como está.",
    en: "Written straight to {{name}}'s configuration file. Only what you change here is touched — the rest of the file stays as is.",
  },
  // RetroArch e Flycast não têm arquivo que o ZeuX escreva: a opção fica no
  // ZeuX e vale nos próximos lançamentos (launch_prefs.go).
  modalDescriptionZeuX: {
    "pt-BR": "Estas opções ficam guardadas no ZeuX e valem para os próximos lançamentos do {{name}}. O arquivo de configuração do emulador não é alterado por aqui.",
    en: "These options are kept in ZeuX and apply to the next launches of {{name}}. The emulator's configuration file is not changed here.",
  },
  // Um só texto para a opção de auto-save nos quatro emuladores que a têm: o
  // ID é igual em todos (AutoSaveStateID no servidor).
  auto_save_state: {
    "pt-BR": "Salvar estado ao fechar o jogo — é desse estado que o botão Continuar retoma.",
    en: "Save state when closing the game — the Continue button resumes from it.",
  },
  screenshotKey: { "pt-BR": "Tecla de print", en: "Screenshot key" },
  loading: { "pt-BR": "Lendo as opções…", en: "Reading options…" },
  readError: { "pt-BR": "Não foi possível ler as opções.", en: "Could not read the options." },
  saveError: { "pt-BR": "Não foi possível salvar as opções.", en: "Could not save the options." },
  running: {
    "pt-BR": "Feche o {{name}} para mudar as opções — ele grava a configuração dele ao fechar e desfaria a mudança.",
    en: "Close {{name}} to change options — it saves its own settings on exit and would undo the change.",
  },
  save: { "pt-BR": "Salvar opções", en: "Save options" },
  saving: { "pt-BR": "Salvando…", en: "Saving…" },
  saved: { "pt-BR": "Opções salvas.", en: "Options saved." },
  noChanges: { "pt-BR": "Nada mudou ainda.", en: "Nothing changed yet." },
  defaultSuffix: { "pt-BR": "(padrão)", en: "(default)" },

  groupScreen: { "pt-BR": "Tela", en: "Screen" },
  groupBehavior: { "pt-BR": "Comportamento", en: "Behavior" },
  groupAudio: { "pt-BR": "Áudio", en: "Audio" },
  groupCards: { "pt-BR": "Cartão de memória", en: "Memory card" },
  groupStates: { "pt-BR": "Estados salvos", en: "Save states" },
  groupVideo: { "pt-BR": "Vídeo", en: "Video" },

  // PCSX2
  "UI.StartFullscreen": { "pt-BR": "Iniciar o jogo em tela cheia", en: "Start games in fullscreen" },
  "UI.ConfirmShutdown": { "pt-BR": "Perguntar antes de fechar o jogo", en: "Confirm before closing the game" },
  "UI.DoubleClickTogglesFullscreen": { "pt-BR": "Clique duplo alterna tela cheia", en: "Double-click toggles fullscreen" },
  "UI.HideMouseCursor": { "pt-BR": "Esconder o cursor", en: "Hide mouse cursor" },
  "EmuCore.InhibitScreensaver": { "pt-BR": "Impedir a proteção de tela durante o jogo", en: "Prevent screensaver while playing" },
  "EmuCore.EnableDiscordPresence": { "pt-BR": "Mostrar o jogo no Discord", en: "Show the game on Discord" },
  "EmuCore.UseSavestateSelector": { "pt-BR": "Mostrar seletor de slot ao salvar/carregar", en: "Show slot selector on save/load" },
  "EmuCore.BackupSavestate": { "pt-BR": "Guardar cópia do estado anterior", en: "Keep a backup of the previous state" },
  "SPU2/Output.BufferMS": { "pt-BR": "Buffer de áudio (ms)", en: "Audio buffer (ms)" },
  "SPU2/Output.StandardVolume": { "pt-BR": "Volume (0–100)", en: "Volume (0–100)" },
  "EmuCore/GS.upscale_multiplier": { "pt-BR": "Resolução interna (multiplicador, 1–8)", en: "Internal resolution (multiplier, 1–8)" },
  "EmuCore/GS.VsyncEnable": { "pt-BR": "Sincronia vertical (VSync)", en: "Vertical sync (VSync)" },

  // Modo portátil do PCSX2
  portableTitle: { "pt-BR": "Pasta dos dados do PCSX2", en: "PCSX2 data folder" },
  portableOn: {
    "pt-BR": "Tudo do PCSX2 (configuração, cartões, estados, BIOS) fica dentro da pasta do ZeuX.",
    en: "Everything from PCSX2 (settings, cards, states, BIOS) lives inside the ZeuX folder.",
  },
  portableOff: {
    "pt-BR": "O PCSX2 ainda guarda os dados em {{dir}}. Mover para a pasta do ZeuX deixa tudo junto do emulador e protegido nas atualizações.",
    en: "PCSX2 still keeps its data in {{dir}}. Moving it into the ZeuX folder keeps everything with the emulator and safe across updates.",
  },
  portableItems: { "pt-BR": "{{name}}: {{files}} arquivos, {{size}}", en: "{{name}}: {{files}} files, {{size}}" },
  migrate: { "pt-BR": "Mover para a pasta do ZeuX", en: "Move into the ZeuX folder" },
  migrating: { "pt-BR": "Movendo…", en: "Moving…" },
  migrateConfirmTitle: { "pt-BR": "Mover os dados do PCSX2?", en: "Move PCSX2 data?" },
  migrateConfirm: {
    "pt-BR": "O ZeuX copia tudo de {{dir}} para a pasta do emulador, confere arquivo por arquivo e só então passa a usar a cópia. Nada é apagado da pasta antiga.",
    en: "ZeuX copies everything from {{dir}} into the emulator folder, checks every file and only then switches to the copy. Nothing is deleted from the old folder.",
  },
  migrated: { "pt-BR": "Dados movidos. A pasta antiga continua lá até você apagar.", en: "Data moved. The old folder stays until you delete it." },
  legacyLeft: {
    "pt-BR": "A cópia antiga ainda está em {{dir}}.",
    en: "The old copy is still at {{dir}}.",
  },
  removeLegacy: { "pt-BR": "Apagar a pasta antiga", en: "Delete the old folder" },
  removeLegacyConfirmTitle: { "pt-BR": "Apagar a pasta antiga?", en: "Delete the old folder?" },
  removeLegacyConfirm: {
    "pt-BR": "Apaga {{dir}} de vez. O ZeuX só faz isso se cada arquivo já estiver na pasta do emulador.",
    en: "Permanently deletes {{dir}}. ZeuX only does it if every file is already in the emulator folder.",
  },
  removedLegacy: { "pt-BR": "Pasta antiga apagada.", en: "Old folder deleted." },
  cancel: { "pt-BR": "Cancelar", en: "Cancel" },
  confirm: { "pt-BR": "Confirmar", en: "Confirm" },

  "Main.StartFullscreen": { "pt-BR": "Iniciar o jogo em tela cheia", en: "Start games in fullscreen" },
  "Main.HideMainWindowWhenRunning": { "pt-BR": "Esconder a janela principal durante o jogo", en: "Hide main window while playing" },
  "Main.HideCursorInFullscreen": { "pt-BR": "Esconder o cursor em tela cheia", en: "Hide cursor in fullscreen" },
  "Main.DoubleClickTogglesFullscreen": { "pt-BR": "Clique duplo alterna tela cheia", en: "Double-click toggles fullscreen" },
  "Display.AutoResizeWindow": { "pt-BR": "Ajustar o tamanho da janela ao jogo", en: "Resize window to the game" },
  "Main.ConfirmPowerOff": { "pt-BR": "Perguntar antes de fechar o jogo", en: "Confirm before closing the game" },
  "Main.CreateSaveStateBackups": { "pt-BR": "Guardar cópia do estado anterior", en: "Keep a backup of the previous state" },
  "Main.PauseOnFocusLoss": { "pt-BR": "Pausar quando a janela perde o foco", en: "Pause when the window loses focus" },
  "Main.PauseOnControllerDisconnection": { "pt-BR": "Pausar quando o controle desconecta", en: "Pause when the controller disconnects" },
  "Main.DisableBackgroundInput": { "pt-BR": "Ignorar controle com a janela em segundo plano", en: "Ignore input while in the background" },
  "Main.InhibitScreensaver": { "pt-BR": "Impedir a proteção de tela durante o jogo", en: "Prevent screensaver while playing" },
  "Main.EnableDiscordPresence": { "pt-BR": "Mostrar o jogo no Discord", en: "Show the game on Discord" },
  "Audio.Backend": { "pt-BR": "Sistema de som", en: "Audio backend" },
  "Audio.StretchMode": { "pt-BR": "Correção de áudio em queda de FPS", en: "Audio stretching" },
  "Audio.BufferMS": { "pt-BR": "Buffer de áudio (ms)", en: "Audio buffer (ms)" },
  "Audio.OutputLatencyMS": { "pt-BR": "Latência de saída (ms)", en: "Output latency (ms)" },
  "Audio.OutputVolume": { "pt-BR": "Volume (0–100)", en: "Volume (0–100)" },
  "Audio.FastForwardVolume": { "pt-BR": "Volume no avanço rápido (0–100)", en: "Fast-forward volume (0–100)" },
  "MemoryCards.Card1Type": { "pt-BR": "Cartão do jogador 1", en: "Player 1 card" },
  "MemoryCards.UsePlaylistTitle": { "pt-BR": "Um cartão só para jogos de vários discos", en: "One card for multi-disc games" },

  "choice.Cubeb": { "pt-BR": "Cubeb (padrão)", en: "Cubeb (default)" },
  "choice.SDL": { "pt-BR": "SDL", en: "SDL" },
  "choice.TimeStretch": { "pt-BR": "Esticar o tempo (padrão)", en: "Time stretch (default)" },
  "choice.Resample": { "pt-BR": "Reamostrar", en: "Resample" },
  "choice.PerGameFileTitle": { "pt-BR": "Um por jogo, pelo nome do arquivo (o ZeuX acha o save)", en: "One per game, by file name (ZeuX finds the save)" },
  "choice.PerGameTitle": { "pt-BR": "Um por jogo, pelo título do DuckStation", en: "One per game, by DuckStation's title" },
  "choice.Shared": { "pt-BR": "Um só para todos os jogos", en: "One shared by all games" },
} satisfies Dict;
