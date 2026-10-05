import type { Dict } from "../i18n/i18n";

// Rótulos das opções do DuckStation, pela ID "Seção.Chave" que o servidor
// devolve (internal/emulator/duckstation_settings.go).
export const dict = {
  modalTitle: { "pt-BR": "Configurações do DuckStation", en: "DuckStation settings" },
  modalDescription: {
    "pt-BR": "Gravadas direto no settings.ini do DuckStation instalado pelo ZeuX. Só muda o que você alterar aqui.",
    en: "Written straight to the settings.ini of the DuckStation installed by ZeuX. Only what you change here is touched.",
  },
  loading: { "pt-BR": "Lendo as opções do DuckStation…", en: "Reading DuckStation options…" },
  readError: { "pt-BR": "Não foi possível ler as opções do DuckStation.", en: "Could not read DuckStation options." },
  saveError: { "pt-BR": "Não foi possível salvar as opções.", en: "Could not save the options." },
  running: {
    "pt-BR": "Feche o DuckStation para mudar as opções — ele grava a configuração dele ao fechar e desfaria a mudança.",
    en: "Close DuckStation to change options — it saves its own settings on exit and would undo the change.",
  },
  save: { "pt-BR": "Salvar opções", en: "Save options" },
  saving: { "pt-BR": "Salvando…", en: "Saving…" },
  saved: { "pt-BR": "Opções do DuckStation salvas.", en: "DuckStation options saved." },
  noChanges: { "pt-BR": "Nada mudou ainda.", en: "Nothing changed yet." },
  defaultSuffix: { "pt-BR": "(padrão)", en: "(default)" },

  groupScreen: { "pt-BR": "Tela", en: "Screen" },
  groupBehavior: { "pt-BR": "Comportamento", en: "Behavior" },
  groupAudio: { "pt-BR": "Áudio", en: "Audio" },
  groupCards: { "pt-BR": "Cartão de memória", en: "Memory card" },

  "Main.StartFullscreen": { "pt-BR": "Iniciar o jogo em tela cheia", en: "Start games in fullscreen" },
  "Main.HideMainWindowWhenRunning": { "pt-BR": "Esconder a janela principal durante o jogo", en: "Hide main window while playing" },
  "Main.HideCursorInFullscreen": { "pt-BR": "Esconder o cursor em tela cheia", en: "Hide cursor in fullscreen" },
  "Main.DoubleClickTogglesFullscreen": { "pt-BR": "Clique duplo alterna tela cheia", en: "Double-click toggles fullscreen" },
  "Display.AutoResizeWindow": { "pt-BR": "Ajustar o tamanho da janela ao jogo", en: "Resize window to the game" },
  "Main.ConfirmPowerOff": { "pt-BR": "Perguntar antes de fechar o jogo", en: "Confirm before closing the game" },
  "Main.SaveStateOnExit": { "pt-BR": "Salvar o estado ao fechar (permite Continuar)", en: "Save state on exit (enables Continue)" },
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
