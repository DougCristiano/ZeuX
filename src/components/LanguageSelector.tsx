import { LOCALES, useLocale } from "../i18n/i18n";
import { FILTER_CHIP_BASE, FILTER_CHIP_OFF, FILTER_CHIP_ON, FOCUS_RING } from "./ui";

/**
 * Seletor de idioma explícito (pedido do Douglas, 2026-09-06): o ZeuX tem
 * público que prefere inglês, e a escolha precisa ser visível e reversível a
 * qualquer momento — nunca inferida da configuração do sistema operacional
 * (ver comentário em src/i18n/i18n.tsx). `pt-BR`/`en` são as únicas opções
 * hoje; `LOCALES` é a lista única de verdade, então um terceiro idioma
 * futuro aparece aqui sem tocar este componente.
 *
 * Mora só em Configurações desde 2026-09-28 — a cópia no rodapé da sidebar
 * (e a variante `collapsible` que existia só para ela) saiu; o motivo está no
 * comentário do fim de Sidebar.tsx.
 */
export function LanguageSelector({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  // Chips de alternância, não `<select>` nativo (2026-09-28): o card de
  // idioma fica lado a lado com o de efeitos visuais em Configurações, que
  // já usa este mesmo controle — duas escolhas de uma opção só entre poucas,
  // lado a lado, com dois controles diferentes liam como coisas de natureza
  // diferente. Com duas línguas, os chips também mostram as duas de uma vez,
  // sem abrir nada. `aria-label` bilíngue: é o controle que alguém procura
  // justamente quando não lê a língua atual.
  return (
    <div role="radiogroup" aria-label="Idioma / Language" className={`flex flex-wrap gap-2 ${className}`}>
      {LOCALES.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={locale === l.id}
          lang={l.id}
          onClick={() => setLocale(l.id)}
          className={`${FILTER_CHIP_BASE} ${locale === l.id ? FILTER_CHIP_ON : FILTER_CHIP_OFF} ${FOCUS_RING}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
