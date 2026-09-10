import type { Dict } from "../i18n/i18n";

export const dict = {
  title: { "pt-BR": "Histórico", en: "History" },
  subtitle: {
    "pt-BR": "Onde você parou e quanto já jogou.",
    en: "Where you left off and how much you have played.",
  },
  recentHeading: { "pt-BR": "Jogados recentemente", en: "Recently played" },
  playtimeHeading: { "pt-BR": "Tempo de jogo", en: "Playtime" },
  totalPlaytime: { "pt-BR": "Tempo total", en: "Total playtime" },
  // "em <console>" — frase descritiva, nunca "você só jogou X" (princípio 2).
  playtimeOnConsole: { "pt-BR": "{{time}} em {{console}}", en: "{{time}} on {{console}}" },
  playedOn: { "pt-BR": "{{console}} · jogado em {{date}}", en: "{{console}} · played on {{date}}" },
  loading: { "pt-BR": "Carregando o histórico…", en: "Loading history…" },
  empty: {
    "pt-BR": "O histórico aparece aqui depois que você abrir o primeiro jogo.",
    en: "Your history shows up here after you open your first game.",
  },
  emptyTitle: {
    "pt-BR": "Nada jogado ainda",
    en: "Nothing played yet",
  },
  emptyAction: {
    "pt-BR": "Ver biblioteca",
    en: "Go to library",
  },
  loadError: {
    "pt-BR": "Não foi possível carregar o histórico.",
    en: "Could not load the history.",
  },
} satisfies Dict;
