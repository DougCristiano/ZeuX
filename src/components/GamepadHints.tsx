import { useEffect, useState } from "react";
import { useT } from "../i18n/i18n";
import { dict } from "./GamepadHints.i18n";

/**
 * Rodapé fino de prompts do controle (pendência "Rodapé de prompts do
 * controle na tela", docs/pendencias.md).
 *
 * **Só aparece com um controle conectado** (`connected`, vindo de
 * `useGamepadNavigation` em `App.tsx`) — sem controle não renderiza nada e o
 * layout não reserva espaço nenhum (`return null`, não um bloco vazio). É
 * `position: fixed`: nunca empurra o conteúdo, nem entra no fluxo que quem
 * usa só teclado/mouse enxerga.
 *
 * Os prompts refletem exatamente o que `useGamepadNavigation` faz:
 *
 *  - **Ⓐ** chama `.click()` no elemento focado — sempre vale a pena mostrar
 *    ("Selecionar"), qualquer tela tem algo focável.
 *  - **Ⓑ** despacha `Escape` e clica em `[data-nav-back]`. O `Escape` fecha
 *    um diálogo do Radix se houver; o "voltar" de verdade só acontece quando
 *    a tela marcou um botão com `data-nav-back` (via `BackButton`). Por isso
 *    o prompt de Ⓑ **só aparece quando esse alvo existe na tela** — um
 *    `MutationObserver` reavalia a cada troca de tela. Prometer "voltar" numa
 *    tela sem botão de voltar seria pior que não mostrar nada (critério de
 *    aceite do item).
 *
 * `aria-hidden`: é reforço visual do que a navegação por controle já faz,
 * não um controle próprio — não deve virar ruído para leitor de tela.
 */
export function GamepadHints({ connected }: { connected: boolean }) {
  const t = useT(dict);
  const [hasBackTarget, setHasBackTarget] = useState(false);

  useEffect(() => {
    if (!connected) return;
    const check = () => setHasBackTarget(document.querySelector("[data-nav-back]") !== null);
    check();
    // A tela troca por dentro do mesmo `<main>` em `App.tsx` (o `switch` de
    // `phase` só substitui o filho) — sem observar a subárvore, o prompt de Ⓑ
    // ficaria congelado no estado da primeira tela.
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [connected]);

  if (!connected) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-5 border-t border-line bg-panel/90 px-4 py-1.5 backdrop-blur-sm"
    >
      <Hint glyph="A" label={t("select")} />
      {hasBackTarget && <Hint glyph="B" label={t("back")} />}
    </div>
  );
}

function Hint({ glyph, label }: { glyph: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-xs tracking-wide text-muted">
      <span className="flex h-4 w-4 items-center justify-center rounded-full border border-line-strong text-[10px] font-semibold text-ink">
        {glyph}
      </span>
      {label}
    </span>
  );
}
