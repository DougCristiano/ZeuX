import type { Dict } from "../i18n/i18n";

export const dict = {
  seeDetails: { "pt-BR": "Ver detalhes de {{title}}", en: "View details for {{title}}" },
  lastPlayedOn: { "pt-BR": "{{console}} · jogado em {{date}}", en: "{{console}} · played on {{date}}" },
  // 2026-09-09: chip acionável para "sem preset" / "BIOS vazia" — antes era
  // um badge sem ação (princípio 5: informar, nunca bloquear).
  playAnywayBadge: { "pt-BR": "jogar assim mesmo", en: "play anyway" },
} satisfies Dict;
