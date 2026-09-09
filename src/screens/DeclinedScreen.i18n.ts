import type { Dict } from "../i18n/i18n";

export const dict = {
  heading: { "pt-BR": "Sem leitura de hardware", en: "No hardware reading" },
  description: {
    "pt-BR":
      "Você optou por não autorizar a leitura deste computador. Sem essa leitura, o ZeuX não tem como sugerir quais consoles esta máquina roda.",
    en: "You chose not to authorize reading this computer. Without this reading, ZeuX cannot suggest which consoles this machine can run.",
  },
  note: {
    "pt-BR":
      "Você pode autorizar a qualquer momento — nada foi lido, e nada muda até você decidir.",
    en: "You can authorize at any time — nothing was read, and nothing changes until you decide.",
  },
  reconsider: { "pt-BR": "Autorizar agora", en: "Authorize now" },
  continueWithoutConsent: { "pt-BR": "Continuar sem autorizar", en: "Continue without authorizing" },
  viewEmulators: { "pt-BR": "Ver emuladores", en: "View emulators" },
} satisfies Dict;
