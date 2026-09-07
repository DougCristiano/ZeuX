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
} satisfies Dict;
