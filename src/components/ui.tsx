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

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border border-line-strong bg-fill-strong font-semibold text-ink hover:bg-line-strong",
  secondary: "border border-line-strong bg-transparent text-ink hover:bg-fill",
  ghost: "border border-dashed border-line-strong bg-transparent text-muted hover:text-ink hover:border-ink",
};

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`rounded px-4 py-2 text-base transition-colors ${buttonVariants[variant]} ${FOCUS_RING} ${className}`}
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
    variant === "solid"
      ? "border-line-strong bg-fill-strong text-ink"
      : "border-line-strong text-muted";
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
 * Barra de progresso — mesmo vocabulário do wireframe (`.bar`/`.bar span`).
 * `percent` ausente (tamanho total desconhecido, `Job.total_bytes === 0`)
 * mostra a barra indeterminada em vez de fingir 0% ou 100%.
 */
export function ProgressBar({ percent }: { percent: number | null }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-sm border border-line" role="progressbar" aria-valuenow={percent ?? undefined}>
      <div
        className="h-full bg-fill-strong transition-[width]"
        style={{ width: percent === null ? "100%" : `${percent}%`, opacity: percent === null ? 0.4 : 1 }}
      />
    </div>
  );
}
