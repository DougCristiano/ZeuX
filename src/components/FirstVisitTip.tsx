import { useState, type ReactNode } from "react";
import { Button } from "./ui";
import { useT } from "../i18n/i18n";
import { hasSeenTip, markTipSeen, type TipId } from "../lib/hints";
import { dict } from "./FirstVisitTip.i18n";

/**
 * Dica de primeira visita a uma tela densa (2026-09-28). Aparece uma vez,
 * no ponto da tela a que se refere, e some para sempre com "Entendi" —
 * "Rever dicas", em Configurações, traz todas de volta.
 *
 * **Faixa no fluxo da página, não balão apontando para um elemento.** Um
 * balão preso a um alvo precisa medir o layout, e o layout muda toda vez que
 * a tela é redesenhada (o que já aconteceu duas vezes em três dias); uma faixa
 * posicionada pelo próprio JSX acompanha a tela sem manutenção. A dica diz o
 * nome do que descreve ("estas quatro etapas"), e fica logo acima disso.
 *
 * Não bloqueia nada e não rouba foco: é `role="note"`, com um botão comum.
 */
export function FirstVisitTip({
  id,
  title,
  children,
  className = "",
}: {
  id: TipId;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const t = useT(dict);
  const [open, setOpen] = useState(() => !hasSeenTip(id));
  if (!open) return null;

  return (
    <aside
      role="note"
      aria-label={`${t("kicker")}: ${title}`}
      className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg border border-accent-secondary/40 bg-accent-secondary/5 px-4 py-3 ${className}`}
    >
      <div className="min-w-[16rem] flex-1">
        <p className="font-mono text-xs tracking-[0.2em] text-accent-secondary uppercase">
          {t("kicker")} · {title}
        </p>
        <p className="mt-1 text-sm text-ink">{children}</p>
      </div>
      <Button
        variant="chrome"
        size="sm"
        title={t("gotItTitle")}
        onClick={() => {
          markTipSeen(id);
          setOpen(false);
        }}
      >
        {t("gotIt")}
      </Button>
    </aside>
  );
}
