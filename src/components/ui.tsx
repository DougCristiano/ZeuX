import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import type { ConsoleVerdict } from "../api/types";

// Componentes primitivos do item B7 (docs/sprint-b-plano.md), construídos
// sobre os tokens de src/index.css. Cor, tipografia e foco vivem aqui uma vez
// só — telas não escolhem cor ad-hoc.
//
// O ADR 0009 (docs/decisoes/0009-desktop-agora-controle-depois.md) exige foco
// como estado de primeira classe, visualmente distinto de hover. `Button`
// nunca desliga o anel de foco do teclado (`focus-visible`, não `focus`): ele
// só aparece pra navegação por teclado, nunca ao clicar com o mouse — que é
// exatamente a distinção que a maioria dos resets de CSS erra.

// O anel de foco usa --accent (src/index.css) — a mesma cor de interação em
// toda a interface, não uma cor de foco genérica fixa.
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

/**
 * `<select>` temático (2026-08-05) — o `<select>` nativo cru usava o chrome
 * do navegador/SO para a seta e ficava com padding/altura diferente dos
 * `input`s ao lado (o que o Douglas apontou como "CSS ruim, não condiz com o
 * projeto"). `appearance-none` tira a seta nativa e desenhamos uma própria
 * com os tokens do tema; o popup de opções em si continua fora do nosso CSS
 * (o navegador desenha), mas `color-scheme: dark` em `:root` (src/index.css)
 * faz esse popup nativo usar o esquema escuro em vez do claro do SO.
 */
export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative inline-block">
      <select
        className={`appearance-none rounded border border-line bg-fill py-2 pr-8 pl-3 text-sm text-ink transition-colors hover:border-line-strong ${FOCUS_RING} ${className}`}
        {...props}
      />
      <svg
        width="10"
        height="6"
        viewBox="0 0 10 6"
        fill="none"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
      >
        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
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
 * Capa de jogo (Sprint 2 do plano de migração visual, 2026-08-04 —
 * /home/douglas/.claude/plans/sleepy-roaming-pearl.md). Inspirado em
 * `layout/src/App.tsx` (`GameCard`), mas com o dado real de hoje: nunca
 * gradiente/emoji fake — o placeholder é a sigla do console (mesmo dado que
 * `AllGamesScreen`/`GamesScreen` já mostravam antes), só com tratamento
 * visual novo (scanline, glow de borda no hover/foco, overlay de play
 * opcional). `coverUrl` fica preparado para o dia em que existir capa de
 * jogo de verdade (scraper — já fora do MVP, ver docs/roadmap.md); até lá,
 * nunca é passado.
 */
export function GameCover({
  label,
  size = "md",
  showPlayOverlay = false,
  coverUrl,
  className = "",
}: {
  /** Sigla do console — único dado real disponível hoje como "capa". */
  label: string;
  size?: "md" | "lg";
  /** Mostra um ícone de play sobreposto no hover/foco (ex.: card clicável que lança direto). */
  showPlayOverlay?: boolean;
  /** Preparado para o futuro — nenhuma tela passa isto ainda. */
  coverUrl?: string;
  className?: string;
}) {
  return (
    <div
      className={`game-cover group relative aspect-[3/4] overflow-hidden rounded border border-line-strong bg-fill ${className}`}
    >
      {coverUrl ? (
        <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div
          className={`absolute inset-0 flex items-center justify-center font-pixel text-muted opacity-25 ${
            size === "lg" ? "text-4xl" : "text-lg"
          }`}
          aria-hidden="true"
        >
          {label}
        </div>
      )}
      <div className="game-cover-scanline pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/75 to-transparent" />
      <div className="pointer-events-none absolute right-1.5 bottom-1.5 left-1.5 font-pixel text-[11px] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
        {label}
      </div>
      {showPlayOverlay && (
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/40 group-hover:flex group-focus-visible:flex">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-accent shadow-[0_0_16px_var(--accent)]">
            <svg width="14" height="16" viewBox="0 0 14 16" fill="var(--accent)" aria-hidden="true">
              <path d="M0 0 L14 8 L0 16 Z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Paginação — "Anterior/Próxima" mais indicador de página, extraída de
 * `AllGamesScreen` (2026-08-04) para reaproveitar em `EmulatorsScreen` e
 * `VerdictScreen`, que ganharam o mesmo padrão. Sempre "página N de M",
 * nunca números de página clicáveis — a lista é pequena o bastante (dezenas
 * de itens, não milhares) para não precisar de navegação mais complexa.
 */
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-6 flex items-center justify-center gap-3">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>
      <span className="font-mono text-sm text-muted">
        página {page} de {totalPages}
      </span>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Próxima
      </Button>
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

export const LEVEL_LABEL: Record<ConsoleVerdict["level"], string> = {
  otimo: "ótimo",
  bom: "bom",
  limitado: "limitado",
  improvavel: "improvável",
};

/**
 * Cartão de parecer por console — extraído de VerdictScreen (2026-08-04) para
 * ser reaproveitado também dentro de `ConsoleInfoModal` (Emuladores): mesmo
 * dado, mesma regra ("texto descritivo, nunca julgador", bottlenecks nomeando
 * o componente que barra), duas telas diferentes.
 */
export function ConsoleVerdictCard({ verdict }: { verdict: ConsoleVerdict }) {
  const isGoodTier = verdict.level === "otimo" || verdict.level === "bom";

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">{verdict.name}</p>
        <Badge variant={isGoodTier ? "solid" : "default"}>{LEVEL_LABEL[verdict.level]}</Badge>
      </div>

      <p className="text-sm text-muted">{verdict.headline}</p>

      {verdict.preset && (
        <p className="text-sm text-muted">
          {verdict.emulator} · {verdict.preset}
        </p>
      )}

      {verdict.precision === "parcial" && (
        <PartialNotice>
          Não foi possível confirmar todos os requisitos deste console — este parecer é uma estimativa.
        </PartialNotice>
      )}

      {verdict.bottlenecks && verdict.bottlenecks.length > 0 && (
        <Callout label="O que separa do patamar acima">
          <ul className="list-disc space-y-1 pl-4">
            {verdict.bottlenecks.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Callout>
      )}
    </Card>
  );
}

/**
 * Ícone de console (2026-08-04, a pedido do Douglas): não é logo real — o
 * ZeuX nunca baixa/embute marca de terceiro sem fonte própria (mesma regra
 * de `GameCover`, que usa a sigla como "capa" em vez de arte inventada).
 * Quadrado com a sigla, clicável, abre `ConsoleInfoModal`.
 */
export function ConsoleIcon({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line-strong bg-fill font-pixel text-[8px] leading-none text-muted transition-colors hover:border-accent hover:text-accent ${FOCUS_RING}`}
    >
      {label.slice(0, 4).toUpperCase()}
    </button>
  );
}

/**
 * Indicador "···" quando a lista de consoles de um emulador não cabe no
 * tamanho fixo do card (2026-08-04) — vários emuladores (ex.: RetroArch)
 * atendem 20+ consoles; sem isso, cada card teria uma altura diferente.
 * Não é clicável de propósito: só sinaliza "tem mais", o filtro de console
 * já cobre "quero saber quais são".
 */
export function ConsoleMoreBadge({ count }: { count: number }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-dashed border-line-strong text-sm text-muted"
      title={`mais ${count} console(s)`}
      aria-hidden="true"
    >
      ···
    </span>
  );
}

/**
 * Modal de descrição do console (2026-08-04, a pedido do Douglas), aberto ao
 * clicar num `ConsoleIcon`. `verdict` vem ausente quando esta tela foi
 * alcançada sem `Report` carregado ainda (Emuladores é alcançável a partir de
 * DeclinedScreen, antes do consentimento/scan) — mostra só o nome que já se
 * conhece nesse caso, nunca finge um parecer que não existe.
 */
export function ConsoleInfoModal({
  verdict,
  fallbackName,
  onClose,
}: {
  verdict?: ConsoleVerdict;
  fallbackName: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="console-modal-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-md rounded border border-line bg-fill p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 id="console-modal-title" className="text-lg font-semibold text-ink">
              {verdict?.name ?? fallbackName}
            </h2>
            {verdict?.year && <p className="text-sm text-muted">{verdict.year}</p>}
          </div>
          {verdict && (
            <Badge variant={verdict.level === "otimo" || verdict.level === "bom" ? "solid" : "default"}>
              {LEVEL_LABEL[verdict.level]}
            </Badge>
          )}
        </div>

        {verdict ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{verdict.headline}</p>

            {verdict.preset && (
              <p className="text-sm text-muted">
                {verdict.emulator} · {verdict.preset}
              </p>
            )}

            {verdict.requires_external_file && (
              <Callout label="Dependência externa">
                Este console costuma exigir um arquivo externo (BIOS, firmware ou plugin) que o ZeuX não fornece
                nem verifica.
              </Callout>
            )}

            {verdict.bottlenecks && verdict.bottlenecks.length > 0 && (
              <Callout label="O que separa do patamar acima">
                <ul className="list-disc space-y-1 pl-4">
                  {verdict.bottlenecks.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </Callout>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">O parecer de compatibilidade para este console ainda não foi lido nesta máquina.</p>
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="primary" autoFocus onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
