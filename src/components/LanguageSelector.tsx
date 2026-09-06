import { Languages } from "lucide-react";
import { LOCALES, useLocale } from "../i18n/i18n";
import { FOCUS_RING } from "./ui";

/**
 * Seletor de idioma explícito (pedido do Douglas, 2026-09-06): o ZeuX tem
 * público que prefere inglês, e a escolha precisa ser visível e reversível a
 * qualquer momento — nunca inferida da configuração do sistema operacional
 * (ver comentário em src/i18n/i18n.tsx). `pt-BR`/`en` são as únicas opções
 * hoje; `LOCALES` é a lista única de verdade, então um terceiro idioma
 * futuro aparece aqui sem tocar este componente.
 */
export function LanguageSelector({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <label className={`flex items-center gap-2 text-sm text-ink ${className}`}>
      <Languages size={16} aria-hidden="true" className="shrink-0 text-muted" />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        aria-label="Idioma / Language"
        className={`rounded border border-line bg-fill px-2 py-1 text-sm text-ink ${FOCUS_RING}`}
      >
        {LOCALES.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
