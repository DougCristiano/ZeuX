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
export function LanguageSelector({
  className = "",
  collapsible = false,
}: {
  className?: string;
  /**
   * Achado do critico-design (2026-09-06): a sidebar recolhida (`w-16`,
   * `overflow-hidden`) montava este componente do mesmo jeito que a versão
   * expandida — um `<select>` com o texto "Português (Brasil)" inteiro —
   * cortado no meio pelo container estreito, em vez de reduzir a só o ícone
   * como os itens de navegação ao lado já fazem. Mesma técnica de
   * `max-w`/`opacity` do rótulo de nav (Sidebar.tsx): "chuta" um teto maior
   * que qualquer rótulo real porque `width: auto` não anima em CSS. Some por
   * completo no estado recolhido — só o ícone `Languages` fica, e `.group`
   * (a `<aside>` de Sidebar.tsx) é quem dispara a expansão no hover/foco.
   */
  collapsible?: boolean;
}) {
  const { locale, setLocale } = useLocale();
  return (
    <label className={`flex items-center gap-2 text-sm text-ink ${className}`}>
      <Languages size={16} aria-hidden="true" className="shrink-0 text-muted" />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        aria-label="Idioma / Language"
        className={`rounded border border-line bg-fill px-2 py-1 text-sm text-ink ${FOCUS_RING} ${
          collapsible
            ? "max-w-0 overflow-hidden opacity-0 transition-all duration-150 ease-in-out group-hover:max-w-[144px] group-hover:opacity-100 group-focus-within:max-w-[144px] group-focus-within:opacity-100"
            : ""
        }`}
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
