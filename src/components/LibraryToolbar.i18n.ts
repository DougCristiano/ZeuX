import type { Dict } from "../i18n/i18n";

/**
 * Régua de controle compartilhada pelas duas telas de biblioteca (grade de
 * um console em `GamesScreen`, acervo inteiro em `AllGamesScreen`). Antes o
 * texto vivia duplicado nos dois `.i18n.ts` de tela — aqui fica uma vez só,
 * junto do componente.
 */
export const dict = {
  searchPlaceholder: { "pt-BR": "Buscar jogos…", en: "Search games…" },
  sortByLabel: { "pt-BR": "Ordenar por", en: "Sort by" },
  sortRecentes: { "pt-BR": "Jogados por último", en: "Last played" },
  sortTitulo: { "pt-BR": "Título (A–Z)", en: "Title (A–Z)" },
  sortTempoJogado: { "pt-BR": "Mais jogados", en: "Most played" },

  viewModeLabel: { "pt-BR": "Modo de exibição", en: "View mode" },
  gridMode: { "pt-BR": "GRADE", en: "GRID" },
  listMode: { "pt-BR": "LISTA", en: "LIST" },

  // Densidade das capas (P/M/G) — mesma ideia de Playnite/Steam: quantas
  // capas cabem por fileira é escolha do usuário, não um número fixo do app.
  densityLabel: { "pt-BR": "Tamanho das capas", en: "Cover size" },
  densitySmall: { "pt-BR": "P", en: "S" },
  densityMedium: { "pt-BR": "M", en: "M" },
  densityLarge: { "pt-BR": "G", en: "L" },
  densitySmallTitle: { "pt-BR": "Capas menores, mais por fileira", en: "Smaller covers, more per row" },
  densityMediumTitle: { "pt-BR": "Tamanho médio", en: "Medium size" },
  densityLargeTitle: { "pt-BR": "Capas maiores, menos por fileira", en: "Larger covers, fewer per row" },

  favoritesLabel: { "pt-BR": "FAVORITOS", en: "FAVORITES" },
  missingLabel: { "pt-BR": "AUSENTES", en: "MISSING" },
  playedLabel: { "pt-BR": "JÁ JOGUEI", en: "PLAYED" },
  excludedLabel: { "pt-BR": "OCULTOS", en: "HIDDEN" },
  allPlatforms: { "pt-BR": "TODOS", en: "ALL" },
  // 2026-09-10: rótulo da fileira de chips de console, separando-a da régua
  // de controle acima ("isto filtra o quê aparece", não "como aparece").
  platformFilterLabel: { "pt-BR": "CONSOLE", en: "CONSOLE" },

  matchCount: { "pt-BR": "{{count}} de {{total}}", en: "{{count}} of {{total}}" },
} satisfies Dict;
