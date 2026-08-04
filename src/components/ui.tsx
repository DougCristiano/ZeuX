import type { ButtonHTMLAttributes, ReactNode } from "react";

// Componentes primitivos do item B7 (docs/sprint-b-plano.md), construídos
// sobre os tokens de src/index.css. Cor, tipografia e foco vivem aqui uma vez
// só — telas não escolhem cor ad-hoc.
//
// O ADR 0009 (docs/decisoes/0009-desktop-agora-controle-depois.md) exige foco
// como estado de primeira classe, visualmente distinto de hover. `Button`
// nunca desliga o anel de foco do teclado (`focus-visible`, não `focus`): ele
// só aparece pra navegação por teclado, nunca ao clicar com o mouse — que é
// exatamente a distinção que a maioria dos resets de CSS erra.

// O anel de foco usa a cor de acento do tema ativo (ThemePicker) — cada
// identidade visual (fósforo/cartucho/sala) tem a sua, não uma cor de foco
// genérica fixa.
export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border border-accent bg-accent font-semibold text-accent-ink hover:bg-accent-hover",
  secondary: "border border-line-strong bg-transparent text-ink hover:bg-fill",
  ghost: "border border-dashed border-line-strong bg-transparent text-muted hover:text-ink hover:border-ink",
};

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`rounded px-4 py-2 text-base transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${FOCUS_RING} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, filled = false, className = "" }: { children: ReactNode; filled?: boolean; className?: string }) {
  return (
    <div
      className={`rounded border border-line p-4 ${filled ? "bg-fill" : "bg-transparent"} ${className}`}
    >
      {children}
    </div>
  );
}

type BadgeVariant = "default" | "solid";

export function Badge({ children, variant = "default" }: { children: ReactNode; variant?: BadgeVariant }) {
  const styles =
    variant === "solid" ? "border-accent bg-accent text-accent-ink" : "border-line-strong text-muted";
  return (
    <span className={`inline-block rounded-sm border px-1.5 py-0.5 font-mono text-xs tracking-wide ${styles}`}>
      {children}
    </span>
  );
}

/**
 * Bloco tracejado para o que só aparece condicionalmente — gargalo, aviso de
 * preset, estado parcial. Ver wireframe.html, ".ph"/bordas tracejadas: é o
 * mesmo vocabulário visual, agora com cor de verdade.
 */
export function Callout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-line-strong p-3">
      <p className="mb-1 font-mono text-xs tracking-wide text-muted uppercase">{label}</p>
      <div className="text-base text-ink">{children}</div>
    </div>
  );
}

/** Card com borda âmbar — reservado para o aviso de precisão "parcial" (regra: nunca escondido). */
export function PartialNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded border border-amber-line bg-amber-bg p-3 text-base text-ink">
      <Badge>parcial</Badge>
      <p className="mt-2">{children}</p>
    </div>
  );
}

/**
 * Modal de erro: para falhas que merecem atenção explícita do usuário (ex.:
 * lançar um jogo falhou) em vez de um texto discreto que passa despercebido
 * na tela — achado em 2026-08-04, quando "Não foi possível abrir o jogo"
 * apareceu como texto inline e o Douglas pediu algo mais visível. Fecha só
 * pelo botão ou pela tecla Esc, nunca clicando fora — erro não deveria
 * desaparecer sem o usuário perceber que leu.
 */
export function ErrorModal({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-modal-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-md rounded border border-line bg-fill p-5">
        <h2 id="error-modal-title" className="mb-2 text-lg font-semibold text-danger">
          {title}
        </h2>
        <p className="text-base text-ink">{message}</p>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" autoFocus onClick={onClose}>
            Entendi
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Barra de progresso — mesmo vocabulário do wireframe (`.bar`/`.bar span`).
 * `percent` ausente (tamanho total desconhecido, `Job.total_bytes === 0`)
 * mostra a barra indeterminada em vez de fingir 0% ou 100%.
 */
export function ProgressBar({ percent }: { percent: number | null }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-sm border border-line" role="progressbar" aria-valuenow={percent ?? undefined}>
      <div
        className="h-full bg-accent transition-[width]"
        style={{ width: percent === null ? "100%" : `${percent}%`, opacity: percent === null ? 0.4 : 1 }}
      />
    </div>
  );
}
