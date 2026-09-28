import type { Dict } from "../i18n/i18n";

// Rótulos dos controles da janela — só leitor de tela e tooltip. O texto
// visível da barra é a marca "ZEUX", que não se traduz.
export const dict = {
  controls: { "pt-BR": "Controles da janela", en: "Window controls" },
  minimize: { "pt-BR": "Minimizar", en: "Minimize" },
  maximize: { "pt-BR": "Maximizar", en: "Maximize" },
  restore: { "pt-BR": "Restaurar", en: "Restore" },
  close: { "pt-BR": "Fechar", en: "Close" },
} satisfies Dict;
