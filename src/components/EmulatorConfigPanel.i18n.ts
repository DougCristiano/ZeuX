import type { Dict } from "../i18n/i18n";

export const dict = {
  loading: { "pt-BR": "Lendo a configuração do {{name}}…", en: "Loading {{name}} configuration…" },
  readError: { "pt-BR": "Não foi possível ler a configuração.", en: "Could not read configuration." },
  saveError: { "pt-BR": "Não foi possível salvar a configuração.", en: "Could not save configuration." },
  restoreError: { "pt-BR": "Não foi possível restaurar a configuração original.", en: "Could not restore original configuration." },
  fullscreenLabel: { "pt-BR": "Tela cheia", en: "Fullscreen" },
  fullscreenUnknown: { "pt-BR": "(desconhecido — nunca lido do arquivo)", en: "(unknown — never read from file)" },
  internalScaleLabel: { "pt-BR": "Resolução interna (multiplicador)", en: "Internal resolution (multiplier)" },
  internalScalePlaceholder: { "pt-BR": "desconhecido", en: "unknown" },
  rendererLabel: { "pt-BR": "Backend gráfico", en: "Graphics backend" },
  unappliedLabel: { "pt-BR": "Não aplicado", en: "Not applied" },
  saving: { "pt-BR": "Salvando…", en: "Saving…" },
  save: { "pt-BR": "Salvar", en: "Save" },
  restoreDefault: { "pt-BR": "Restaurar padrão", en: "Restore default" },
  restoreConfirmTitle: { "pt-BR": "Restaurar configuração padrão?", en: "Restore default configuration?" },
  restoreConfirmMessage: { "pt-BR": "As opções personalizadas de {{name}} salvas aqui serão descartadas.", en: "Custom options for {{name}} saved here will be discarded." },
  cancel: { "pt-BR": "Cancelar", en: "Cancel" },
  restoreAnyway: { "pt-BR": "Restaurar mesmo assim", en: "Restore anyway" },
  savedToast: { "pt-BR": "Configuração salva.", en: "Configuration saved." },
} satisfies Dict;
