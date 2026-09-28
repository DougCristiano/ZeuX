import type { Dict } from "../i18n/i18n";

// Rótulos comuns a todas as dicas de primeira visita. O texto de cada dica
// fica no dicionário da tela dona dela — quem muda a tela muda a dica.
export const dict = {
  kicker: { "pt-BR": "Dica", en: "Tip" },
  gotIt: { "pt-BR": "Entendi", en: "Got it" },
  gotItTitle: {
    "pt-BR": "Não mostrar de novo. Dá para rever em Configurações → Rever dicas.",
    en: "Don't show again. You can bring tips back in Settings → Replay tips.",
  },
} satisfies Dict;
