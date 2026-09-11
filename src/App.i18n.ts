import type { Dict } from "./i18n/i18n";

export const dict = {
  loadingConsent: {
    "pt-BR": "lendo o consentimento…",
    en: "reading consent…",
  },
  scanningHardware: {
    "pt-BR": "lendo este computador…",
    en: "reading this computer…",
  },
  portConflict: {
    "pt-BR":
      "A porta 7777 já está sendo usada por outro programa, não pelo ZeuX. Feche o que estiver usando essa porta e tente de novo.",
    en: "Port 7777 is already in use by another program, not ZeuX. Close whatever is using this port and try again.",
  },
  daemonUnreachable: {
    "pt-BR": "O zeuxd não respondeu.",
    en: "zeuxd did not respond.",
  },
  scanError: {
    "pt-BR": "Não foi possível ler este computador.",
    en: "Could not read this computer.",
  },
  consentError: {
    "pt-BR": "Não foi possível registrar o consentimento.",
    en: "Could not register consent.",
  },
  gamepadConnected: {
    "pt-BR": "Controle conectado: {{name}}",
    en: "Controller connected: {{name}}",
  },
  gamepadDisconnected: {
    "pt-BR": "Controle desconectado",
    en: "Controller disconnected",
  },
  // B5 (docs/pendencias.md, "Indicador 'um jogo está rodando agora' no
  // shell") — faixa fina no shell, visível enquanto GET /sessions reportar
  // uma sessão com is_running: true.
  runningNow: {
    "pt-BR": "{{console}} · {{title}} · em andamento",
    en: "{{console}} · {{title}} · running",
  },
  close: {
    "pt-BR": "Fechar",
    en: "Close",
  },
  understand: {
    "pt-BR": "Entendi",
    en: "Got it",
  },
  // Detecção de morte rápida por 0xC0000135 (describeExitCode,
  // internal/emulator/session.go) — oferece o instalador oficial do Visual
  // C++ Redistributable.
  vcredistTitle: {
    "pt-BR": "O jogo abriu e fechou na mesma hora",
    en: "The game opened and closed right away",
  },
  vcredistMessage: {
    "pt-BR":
      "O emulador do console {{console}} não encontrou o runtime do Visual C++ da Microsoft, que precisa para abrir. Instalar o runtime resolve para todos os jogos que dependem dele, não só este.",
    en: "The emulator for the {{console}} console could not find the Microsoft Visual C++ runtime it needs to open. Installing the runtime fixes this for every game that depends on it, not just this one.",
  },
  vcredistInstallButton: {
    "pt-BR": "Instalar o Visual C++ Redistributable",
    en: "Install Visual C++ Redistributable",
  },
  vcredistInstalling: {
    "pt-BR": "Abrindo o instalador…",
    en: "Opening the installer…",
  },
  vcredistOpened: {
    "pt-BR":
      "O instalador oficial da Microsoft foi aberto numa janela própria. Siga os passos nele e depois abra o jogo de novo — o ZeuX não fica esperando o instalador fechar.",
    en: "The official Microsoft installer opened in its own window. Follow its steps, then open the game again — ZeuX does not wait for the installer to close.",
  },
  vcredistError: {
    "pt-BR": "Não foi possível abrir o instalador do Visual C++ Redistributable.",
    en: "Could not open the Visual C++ Redistributable installer.",
  },
} satisfies Dict;
