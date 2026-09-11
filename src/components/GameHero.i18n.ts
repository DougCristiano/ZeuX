import type { Dict } from "../i18n/i18n";

export const dict = {
  resume: {
    "pt-BR": "Continuar",
    en: "Resume",
  },
  seeDetails: {
    "pt-BR": "Ver detalhes",
    en: "See details",
  },
  lastPlayed: {
    "pt-BR": "Jogado em {{date}}",
    en: "Played on {{date}}",
  },
  // 2026-09-09: sem preset / BIOS vazia — o jogo abre assim mesmo (princípio 5).
  playAnyway: {
    "pt-BR": "Jogar assim mesmo",
    en: "Play anyway",
  },
  // 2026-09-11: rótulo do botão de instalar enquanto o pedido está em curso —
  // o retorno precisa chegar no clique, não quando o servidor responder.
  installingEmulator: {
    "pt-BR": "Instalando…",
    en: "Installing…",
  },
} satisfies Dict;
