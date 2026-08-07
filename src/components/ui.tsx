import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import type { ConsoleVerdict } from "../api/types";
import { consoleAccentColor } from "../lib/consoleColor";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

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

export function Card({
  children,
  filled = false,
  className = "",
  style,
}: {
  children: ReactNode;
  filled?: boolean;
  className?: string;
  /** Só para casos dinâmicos de verdade (ex.: cor de identidade por console) — nunca um substituto de classe Tailwind fixa. */
  style?: CSSProperties;
}) {
  return (
    <div style={style} className={`rounded border border-line p-4 ${filled ? "bg-fill" : "bg-transparent"} ${className}`}>
      {children}
    </div>
  );
}

type BadgeVariant = "default" | "solid";

/**
 * `accentColor` (2026-08-05): sobrepõe borda/texto com uma cor específica —
 * usado para a cor de identidade por console (`consoleAccentColor`), nunca
 * para comunicar estado (isso continua sendo `variant`/texto). Sem
 * `accentColor`, o badge se comporta exatamente como antes.
 */
export function Badge({
  children,
  variant = "default",
  accentColor,
  title,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  accentColor?: string;
  /** M8 (docs/sprint-m-plano.md): tooltip nativo com a frase completa, quando o texto do badge é um resumo curto. */
  title?: string;
}) {
  const styles =
    variant === "solid" ? "border-accent bg-accent text-accent-ink" : "border-line-strong text-muted";
  return (
    <span
      title={title}
      className={`inline-block rounded-sm border px-1.5 py-0.5 font-mono text-xs tracking-wide ${accentColor ? "" : styles}`}
      style={accentColor ? { borderColor: accentColor, color: accentColor, background: `${accentColor}1a` } : undefined}
    >
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
 * pelo botão, pela tecla Esc ou pelo X do `Dialog` — nunca clicando fora
 * (`onInteractOutside` recusado): erro não deveria desaparecer sem o usuário
 * perceber que leu.
 *
 * J2 (docs/roadmap.md): shell trocado pelo `Dialog` do shadcn (Radix) —
 * focus-trap e `aria-modal` de graça, em vez do shell escrito à mão que
 * `ConsoleInfoModal` duplicava por conta própria. Conteúdo (título,
 * mensagem, botão) continua usando o `Button` do ZeuX, não o do shadcn — a
 * identidade visual das ações não muda.
 *
 * `onRetry` (M1, docs/sprint-m-plano.md, decidido pelo Douglas em
 * 2026-08-07): com o botão "Jogar" saindo da célula da grade em
 * `AllGamesScreen`, o jeito de tentar de novo depois de uma falha deixou de
 * ser "clicar o botão embaixo do tile de novo" — vira este botão aqui. Opcional
 * porque `GameDetailScreen` continua usando `ErrorModal` sem retry embutido
 * (o botão "▶ Jogar" da própria tela já cumpre esse papel).
 */
export function ErrorModal({
  title,
  message,
  onClose,
  onRetry,
}: {
  title: string;
  message: string;
  onClose: () => void;
  onRetry?: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md rounded border border-line bg-fill p-5 ring-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="mb-2 text-lg font-semibold text-danger">{title}</DialogTitle>
        <p className="text-base text-ink">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          {onRetry && (
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          )}
          <Button variant="primary" autoFocus onClick={onRetry ?? onClose}>
            {onRetry ? "Tentar de novo" : "Entendi"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Modal de confirmação: mesmo shell do `ErrorModal` (Dialog do shadcn, sem
 * fechar clicando fora), mas para decisões com mais de um botão de saída —
 * "instalar mesmo assim"/"cancelar", ou "abrir pasta"/"jogar mesmo
 * assim"/"cancelar". `ErrorModal` fixa o par retry/fechar; aqui quem chama
 * monta os próprios botões em `actions`, porque cada fluxo tem sua própria
 * sequência (M8, docs/sprint-m-plano.md).
 *
 * Criado para `AllGamesScreen`: a grade é virtualizada (M3), então um painel
 * inline de confirmação por tile — o que `GamesScreen` faz, sem
 * virtualização — quebraria a altura uniforme que o `useVirtualizer` exige
 * por linha. Como só existe uma instalação pendente por vez (estado
 * compartilhado de `useInlineInstall`), um modal por tela resolve sem
 * precisar ensinar a virtualização a lidar com altura variável.
 */
export function ConfirmModal({
  title,
  message,
  actions,
  onClose,
}: {
  title: string;
  message: string;
  actions: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md rounded border border-line bg-fill p-5 ring-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="mb-2 text-lg font-semibold text-ink">{title}</DialogTitle>
        <p className="text-base text-ink">{message}</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">{actions}</div>
      </DialogContent>
    </Dialog>
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
 *
 * `consoleId` (2026-08-05, a pedido do Douglas): cor de identidade por
 * console (`consoleAccentColor`) no badge de plataforma e no glow de
 * hover/foco — decorativa, não estado. Sem `consoleId`, cai no cinza neutro
 * de sempre (nenhuma tela hoje deixa de passar, mas o componente não exige).
 */
export function GameCover({
  label,
  title,
  consoleId,
  size = "md",
  showPlayOverlay = false,
  onPlay,
  coverUrl,
  className = "",
}: {
  /** Sigla do console — único dado real disponível hoje como "capa". */
  label: string;
  /** Título do jogo, mostrado sobre a arte — cai em `label` quando ausente. */
  title?: string;
  consoleId?: string;
  size?: "md" | "lg";
  /** Mostra um ícone de play sobreposto no hover/foco (ex.: card clicável que lança direto). */
  showPlayOverlay?: boolean;
  /**
   * M1 (docs/sprint-m-plano.md): sem `onPlay`, o overlay continua
   * decorativo (`pointer-events-none`) — é o caso de `GameDetailScreen`,
   * onde um segundo botão de jogar dentro da capa não faz sentido. Com
   * `onPlay`, o overlay vira um `<button>` de verdade que lança o jogo.
   */
  onPlay?: () => void;
  /** Preparado para o futuro — nenhuma tela passa isto ainda. */
  coverUrl?: string;
  className?: string;
}) {
  const accent = consoleId ? consoleAccentColor(consoleId) : undefined;
  const accentVars = accent ? ({ "--console-accent": accent } as CSSProperties) : undefined;

  return (
    <div
      style={accentVars}
      // M2 (docs/sprint-m-plano.md): borda e glow no hover/foco vivem aqui,
      // não em CSS solto — evita o bug de cascade layer que fazia o glow
      // nunca usar --console-accent (ver comentário em src/index.css).
      // `var(--console-accent, var(--accent))` funciona com ou sem
      // `consoleId`: cai no roxo genérico quando não há cor de console.
      // `group-focus-visible`, não `focus-within`: quem recebe foco de
      // teclado/gamepad é o `<button>` ancestral (quando existe um — ver
      // AllGamesScreen.tsx), nunca esta div; `group-focus-visible` cascateia
      // por qualquer ancestral `.group` com foco visível, `focus-within`
      // olharia só para dentro desta div e nunca dispararia.
      className={`game-cover group relative aspect-[3/4] overflow-hidden rounded border border-line-strong bg-fill transition-[border-color,box-shadow] duration-150 ease-in-out hover:border-[var(--console-accent,var(--accent))] group-focus-visible:border-[var(--console-accent,var(--accent))] hover:shadow-[0_0_16px_color-mix(in_srgb,var(--console-accent,var(--accent))_45%,transparent)] group-focus-visible:shadow-[0_0_16px_color-mix(in_srgb,var(--console-accent,var(--accent))_45%,transparent)] ${className}`}
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

      {/* Badge de plataforma (2026-08-05) — cor de identidade do console,
          não estado. Substitui a repetição da sigla que existia no centro E
          no rodapé antes do título entrar aqui.
          M7 (docs/sprint-m-plano.md, decidido pelo Douglas em 2026-08-07):
          9px → 11px — o piso da fonte pixel (src/index.css, "nada abaixo de
          11px"). Fica ~20% maior sobre a capa; "podemos alterar depois se
          não ficar bom" foi a condição do próprio Douglas. */}
      <span
        className="pointer-events-none absolute top-1.5 left-1.5 rounded-sm border px-1.5 py-0.5 font-pixel text-[11px]"
        style={{ borderColor: accent ?? "var(--line-strong)", color: accent ?? "var(--muted)", background: "rgba(0,0,0,0.7)" }}
      >
        {label}
      </span>

      {/* M7: título sobre a arte só quando NÃO há capa real — com capa, ele
          duplicava o rótulo em Inter que AllGamesScreen já desenha embaixo
          do tile (um title longo, sem truncamento, ainda subia sobre a
          arte). `line-clamp-3` deixa a "capa de texto" (placeholder de
          sigla) legível sem estourar a célula. */}
      {!coverUrl && (
        <div className="pointer-events-none absolute right-1.5 bottom-1.5 left-1.5 line-clamp-3 font-pixel text-[11px] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
          {title ?? label}
        </div>
      )}
      {showPlayOverlay &&
        (() => {
          const circleClass = `flex h-11 w-11 items-center justify-center rounded-full border-2 ${
            accent
              ? "border-[var(--console-accent)] shadow-[0_0_16px_var(--console-accent)]"
              : "border-accent shadow-[0_0_16px_var(--accent)]"
          }`;
          const icon = (
            <svg width="14" height="16" viewBox="0 0 14 16" fill={accent ?? "var(--accent)"} aria-hidden="true">
              <path d="M0 0 L14 8 L0 16 Z" />
            </svg>
          );
          return (
            // Escurecimento mais forte (J4, docs/roadmap.md — referência real
            // do Playnite em docs/referencias-playnite.md: overlay de hover em
            // `#AA000000`, ~67% opaco, mais forte que o glow de borda que o
            // ZeuX já tinha) — o placeholder de sigla continua legível por
            // baixo. O wrapper continua `pointer-events-none`: só o círculo
            // (quando `onPlay` existe) reativa clique, o resto da capa
            // continua abrindo o detalhe por baixo (M1).
            <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/60 group-hover:flex group-focus-visible:flex">
              {onPlay ? (
                // M1 (docs/sprint-m-plano.md): botão real, não mais
                // decorativo. `tabIndex={-1}` tira este botão da ordem
                // sequencial de Tab e — como ele fica sobreposto ao centro
                // exato do wrapper focável (AllGamesScreen.tsx) — nenhuma
                // direção do D-pad o alcançaria mesmo sem isso
                // (`findNextFocus` exige distância estritamente positiva na
                // direção pressionada). É assim que o critério "1 movimento
                // por fileira" se sustenta com dois alvos por tile: quem
                // navega por Tab/D-pad chega ao jogo pelo wrapper (abre o
                // detalhe) e lança de lá; mouse e leitor de tela em modo de
                // navegação por elementos continuam alcançando este botão
                // direto, só não entram nele pela sequência linear de Tab.
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Jogar ${title ?? label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlay();
                  }}
                  className={`pointer-events-auto ${circleClass}`}
                >
                  {icon}
                </button>
              ) : (
                <div className={circleClass}>{icon}</div>
              )}
            </div>
          );
        })()}
    </div>
  );
}

/**
 * Estrela de favorito (G4, docs/roadmap.md) — **sempre visível**, nunca só
 * no hover: ADR 0009 exige que toda ação alcançável por mouse tenha
 * equivalente por teclado, e uma estrela hover-only some do fluxo de quem
 * navega só com Tab. `aria-pressed` comunica o estado a leitor de tela;
 * `stopPropagation` evita que clicar na estrela também dispare o clique do
 * card por baixo dela (ex.: abrir o jogo) quando ela é posicionada
 * sobreposta a um elemento clicável.
 */
export function FavoriteToggle({
  favorite,
  onToggle,
  className = "",
}: {
  favorite: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={favorite ? "Remover dos favoritos" : "Favoritar"}
      title={favorite ? "Remover dos favoritos" : "Favoritar"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
        favorite ? "border-amber bg-black/60 text-amber" : "border-line-strong bg-black/60 text-muted hover:text-ink"
      } ${FOCUS_RING} ${className}`}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill={favorite ? "currentColor" : "none"} aria-hidden="true">
        <path
          d="M8 1.5 L9.85 5.6 L14.3 6.15 L11 9.15 L11.9 13.6 L8 11.4 L4.1 13.6 L5 9.15 L1.7 6.15 L6.15 5.6 Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </button>
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
/**
 * `consoleId` (2026-08-05): mesma cor de identidade que `GameCover` usa no
 * badge de plataforma — decorativa, não estado. `label` continua sendo o que
 * é exibido (sigla); `consoleId` só resolve a cor.
 */
export function ConsoleIcon({ label, consoleId, onClick }: { label: string; consoleId: string; onClick: () => void }) {
  const accent = consoleAccentColor(consoleId);
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{ borderColor: `${accent}66`, color: accent }}
      // M7 (docs/sprint-m-plano.md): 8px violava o piso de 11px da fonte
      // pixel (src/index.css) — mesma regra do badge de GameCover.
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border bg-fill font-pixel text-[11px] leading-none transition-colors hover:brightness-125 ${FOCUS_RING}`}
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
// J2 (docs/roadmap.md): mesmo shell `Dialog` do `ErrorModal` — os dois
// reimplementavam o mesmo `fixed inset-0`/backdrop/`role="dialog"`/Esc à mão
// antes da adoção do shadcn.
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md rounded border border-line bg-fill p-5 ring-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <DialogTitle className="text-lg font-semibold text-ink">{verdict?.name ?? fallbackName}</DialogTitle>
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
      </DialogContent>
    </Dialog>
  );
}
