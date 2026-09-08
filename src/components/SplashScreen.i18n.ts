import type { Dict } from "../i18n/i18n";

export const dict = {
  // Lido só por leitor de tela: a abertura é visual, mas quem não a vê
  // precisa saber que o app está subindo, não travado.
  bootingApp: {
    "pt-BR": "Abrindo o ZeuX…",
    en: "Starting ZeuX…",
  },
  // Assinatura da marca. Descritiva do que o produto faz, sem prometer
  // desempenho nem qualificar a máquina de ninguém (CLAUDE.md, princípio 2).
  tagline: {
    "pt-BR": "Seus jogos, já configurados",
    en: "Your games, already set up",
  },
  skip: {
    "pt-BR": "Pular",
    en: "Skip",
  },
} satisfies Dict;
