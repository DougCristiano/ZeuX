import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Play, Star, TriangleAlert } from "lucide-react";
import type { ConsoleVerdict } from "../api/types";
import { consoleAccentColor } from "../lib/consoleColor";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectTrigger, SelectValue } from "./ui/select";

/**
 * N14 (docs/roadmap.md, Sprint N): decisão do Douglas — `lucide-react` (já
 * dependência via `ui/dialog.tsx`/`ui/select.tsx`) vira a família de ícone
 * padrão do app, substituindo os SVGs desenhados à mão (o triângulo de play
 * estava duplicado literal em `ui.tsx` e `GameListRow.tsx`; a estrela de
 * favorito tinha seu próprio path à mão) e os caracteres tipográficos
 * fazendo papel de ícone (`▶`/`★`). `PlayIcon` centraliza o triângulo — os
 * dois lugares que o usavam agora importam daqui, em vez de duplicar.
 */
export function PlayIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return <Play size={size} className={className} fill="currentColor" aria-hidden="true" />;
}

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

/**
 * N4 (docs/roadmap.md, Sprint N): antes, a mesma string estava copiada em 7
 * lugares (`grep -rn` achou: EmulatorConfigPanel, ManualEmulatorForm,
 * VerdictScreen, AllGamesScreen, GamesScreen, EmulatorsScreen, e duas vezes
 * em SettingsScreen) — cada cópia era uma chance de convergir errado depois
 * de uma mudança. `h-[38px]` fixa a altura: antes o `py-2` produzia ~34px,
 * e o `SelectTrigger` do shadcn (abaixo) tinha 32px — três alturas
 * diferentes na mesma barra de filtros.
 */
// B1 (achado do critico-design, 2026-08-18): `border-line-strong`, não
// `border-line` — o N4 unificou a altura de input e select (38px) mas
// deixou a borda divergente (`ZSelect`, abaixo, já usava `border-line-strong`).
// `border-line` quase desaparece sobre `bg-fill` (as duas cores ficam muito
// próximas); os dois controles lado a lado na mesma barra tinham a mesma
// altura e bordas visivelmente diferentes.
export const inputClass =
  `h-[38px] w-full rounded border border-line-strong bg-fill px-3 text-sm text-ink placeholder:text-muted ${FOCUS_RING}`;

/**
 * N4 (docs/roadmap.md, Sprint N): wrapper sobre o `Select` do shadcn (J3)
 * que aplica a mesma altura (38px, `inputClass` acima), borda e
 * `FOCUS_RING` do input do ZeuX — sem isto, cada tela reconstruía o
 * `SelectTrigger` com um `className` própio e divergia (uma tinha `w-fit`,
 * outra `w-full max-w-xs`, nenhuma corrigia a altura de 32px nem o
 * `focus-visible:ring` de dois vocabulários — outline aqui, ring lá).
 * `data-[size=default]:h-[38px]`, não só `h-[38px]`: a base do
 * `SelectTrigger` fixa a altura sob esse mesmo seletor de atributo
 * (`data-[size=default]:h-8`) — um `h-[38px]` sem o mesmo modificador
 * perderia a MESMA disputa de especificidade que o O1 já achou nos modais
 * (`ui/dialog.tsx`): tailwind-merge não considera dois modificadores
 * diferentes como conflitantes, e a classe da base sobreviveria.
 * `focus-visible:ring-0`: desliga o ring do shadcn (grupo de utilitário
 * diferente do outline — os dois ficariam ativos ao mesmo tempo, dois
 * efeitos de foco sobrepostos, se não for desligado explicitamente).
 */
export function ZSelect({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  className = "",
  children,
}: {
  // `| undefined`: LibraryScreen ainda não escolheu console num primeiro
  // render sem catálogo (`useState<string | undefined>`) — o `Select` do
  // Radix já aceita `value` ausente (mostra o placeholder), então o wrapper
  // não deveria ser mais estrito que o primitivo por baixo.
  value: string | undefined;
  onValueChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={`h-[38px] w-full rounded border-line-strong bg-fill px-3 text-sm text-ink data-[size=default]:h-[38px] focus-visible:border-line-strong focus-visible:ring-0 ${FOCUS_RING} ${className}`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border border-accent bg-accent font-semibold text-accent-ink hover:bg-accent-hover",
  secondary: "border border-line-strong bg-transparent text-ink hover:bg-fill",
  // `ghost` foi desenhado como bloco tracejado de placeholder (slot vazio,
  // "adicione algo aqui") — achado do critico-design em 2026-08-18: virou,
  // na prática, "botão terciário genérico" em lugares que não são slot
  // nenhum ("Revarrer"/"Remover" de pasta, "Ver cores"), e duas bordas
  // tracejadas lado a lado numa linha de pasta lêem como área de
  // arrastar-e-soltar. `quiet` é o terciário de verdade: sem borda, só o
  // texto ganha peso no hover — ghost continua reservado para placeholder.
  ghost: "border border-dashed border-line-strong bg-transparent text-muted hover:text-ink hover:border-ink",
  quiet: "border border-transparent bg-transparent text-muted hover:text-ink",
  // N5 (docs/roadmap.md, Sprint N): antes, toda ação destrutiva ("Excluir
  // mesmo assim", "Remover", "Desconectar") usava `primary` — a mesma cor do
  // botão de jogar, sem sinal visual antes de um clique irreversível.
  // `--danger-strong`, não `--danger` puro (comentário em src/index.css) —
  // é o fundo que mede ≥ 4.5:1 contra o texto branco.
  danger: "border border-danger-strong bg-danger-strong font-semibold text-white hover:brightness-110",
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
 * N8 (docs/roadmap.md, Sprint N): Consentimento, Recusa, Carregando e Erro
 * não tinham nenhuma cor/textura — pareciam produto diferente da biblioteca,
 * que já usa a identidade neon (ADR 0013) em glow de foco e borda de capa.
 * Um glow radial roxo de baixa opacidade atrás do conteúdo, ancorado no
 * topo — mesmo vocabulário de glow que `GameCover` já usa no hover
 * (`color-mix` sobre `--accent`), não uma linguagem nova. `pointer-events-none`
 * e `aria-hidden`: puramente decorativo, nunca compete com o texto por trás
 * (contraste do texto de consentimento continua medido e sem interferência,
 * porque o glow fica a 14% de opacidade e o texto não fica sobre ele — a tela
 * inteira que ganha o clima, não uma faixa atrás da frase). Uso: `<main
 * className="relative ...">` + `<OnboardingGlow />` como primeiro filho.
 */
export function OnboardingGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(60% 50% at 50% 30%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%)",
      }}
    />
  );
}

/**
 * N3 (docs/roadmap.md, Sprint N): antes, cada tela escolhia seu próprio teto
 * de largura e seu próprio espaçamento de topo — conferido por `grep`, eram
 * seis valores diferentes (`max-w-6xl`, `max-w-7xl`, `max-w-5xl`,
 * `max-w-4xl`, `max-w-2xl`) mais um `py-10` isolado — e navegar de uma tela
 * para outra fazia o conteúdo "pular" de largura. Dois tetos só, escolhidos
 * pelo tipo de conteúdo, não por tela:
 *
 * - `"listing"` — telas de grade/lista (Todos os jogos, Emuladores,
 *   Especificações, Biblioteca, Jogos de um console). Mesmo teto escalonado
 *   que a Sprint O já validou (O5): `max-w-6xl` até 1536px de janela,
 *   crescendo em telas grandes/4K para não deixar metade da janela vazia.
 * - `"reading"` — telas de leitura/formulário (Detalhe do jogo,
 *   Configurações). `max-w-3xl` fixo, **sem** crescer em janela grande — ao
 *   contrário de uma grade, texto e formulário não ficam mais úteis
 *   esticados; a régua de ~65-75 caracteres por linha é o motivo de existir
 *   um teto de leitura para início de conversa. (Isto supersede o ajuste do
 *   O7 em `GameDetailScreen`, feito quando essa tela ainda tinha seu próprio
 *   teto crescente — revertido junto com esta mudança, ver comentário lá.)
 *
 * `pt-16 pb-10` é o único espaçamento de topo/rodapé — inclusive
 * `VerdictScreen`, que antes usava `py-10` sozinha. O checkbox aberto do M1
 * ("3 fileiras de capa em 1280×800") foi remedido nesta sessão: a decisão do
 * Douglas foi **aceitar 2 fileiras** — sem uma janela de verdade para
 * reconfirmar ao vivo (Playwright mediu a falta em 60px), abrir uma exceção
 * de espaçamento só para uma tela, sem poder validar visualmente que resolve,
 * arriscava trocar "2 fileiras previsível" por "cabeçalho apertado" sem
 * ganho medido — o próprio M1 já listava "aceitar" como opção válida.
 */
export function ScreenContainer({
  variant = "listing",
  className = "",
  children,
}: {
  variant?: "listing" | "reading";
  className?: string;
  children: ReactNode;
}) {
  const width =
    variant === "listing" ? "max-w-6xl 2xl:max-w-[1600px] min-[2400px]:max-w-[2000px]" : "max-w-3xl";
  return <div className={`mx-auto px-6 pt-16 pb-10 ${width} ${className}`}>{children}</div>;
}

export function Card({
  children,
  filled = false,
  // B6 (achado do critico-design, 2026-08-18): `ConfiguredConsoleRow`
  // (LibraryScreen) montava a mesma caixa à mão (`border border-line
  // bg-fill p-3`) só por precisar de menos padding que o `p-4` fixo de
  // `Card` — uma prop, não uma cópia da string inteira do componente.
  dense = false,
  className = "",
  style,
}: {
  children: ReactNode;
  filled?: boolean;
  /** Padding menor (`p-3`), para linha de lista densa em vez de painel. */
  dense?: boolean;
  className?: string;
  /** Só para casos dinâmicos de verdade (ex.: cor de identidade por console) — nunca um substituto de classe Tailwind fixa. */
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`rounded border border-line ${dense ? "p-3" : "p-4"} ${filled ? "bg-fill" : "bg-transparent"} ${className}`}
    >
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
      // Achado do critico-design em 2026-08-18: `color: accentColor` fazia o
      // badge de plataforma reprovar contraste em ~metade dos 33 consoles do
      // catálogo (a família Nintendo, PS3, Saturn — cores escolhidas por
      // matiz de marca, não por legibilidade de texto). A cor de identidade
      // continua na borda e no fundo tingido (onde já funcionava bem, e é
      // onde `EmulatorCard`/`ConsoleVerdictCard` também a usam); o texto
      // usa `text-ink`, que passa contraste contra qualquer fundo do app —
      // mais barato e menos arriscado que clarear a paleta inteira só para
      // o caso de texto.
      className={`inline-block rounded-sm border px-1.5 py-0.5 font-mono text-xs tracking-wide ${accentColor ? "text-ink" : styles}`}
      style={accentColor ? { borderColor: accentColor, background: `${accentColor}1a` } : undefined}
    >
      {children}
    </span>
  );
}

/**
 * Bloco tracejado para o que só aparece condicionalmente — gargalo, aviso de
 * preset, estado parcial. Ver wireframe.html, ".ph"/bordas tracejadas: é o
 * mesmo vocabulário visual, agora com cor de verdade.
 *
 * `tone="amber"` (N16, docs/roadmap.md, Sprint N): o aviso de `Unapplied`
 * (ADR 0006 — opção que o emulador não suporta) montava a mesma caixa
 * rotulada à mão em `EmulatorConfigPanel`, com borda/fundo âmbar copiados
 * literais em vez de reusar este componente. `tone` deixa o `Callout`
 * cobrir esse caso sem perder o âmbar (o mesmo peso visual de "atenção" que
 * já tinha) nem duplicar a caixa.
 */
export function Callout({
  label,
  tone = "neutral",
  children,
}: {
  label: string;
  tone?: "neutral" | "amber";
  children: ReactNode;
}) {
  return (
    <div
      className={
        tone === "amber"
          ? "rounded border border-amber-line bg-amber-bg p-3"
          : "rounded border border-dashed border-line-strong p-3"
      }
    >
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
      {/* O1 (docs/roadmap.md, Sprint O): a base do DialogContent (src/components/ui/dialog.tsx)
          já traz "sm:max-w-sm". Como o tailwind-merge não considera "max-w-md" e
          "sm:max-w-sm" conflitantes (modificador diferente), as duas sobreviviam no
          className final e a variante prefixada vencia — todo modal ficava em 384px
          na prática, ignorando o teto que cada tela pedia. Por isso o teto aqui também
          precisa do prefixo "sm:", para sobrescrever de verdade. */}
      <DialogContent
        className="sm:max-w-md rounded border border-line bg-fill p-5 ring-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="mb-2 text-lg font-semibold text-danger">{title}</DialogTitle>
        {/* C3: `<p>` solto não é lido pelo `aria-describedby` que o Radix
            monta a partir do `Content` — o leitor de tela anunciava só o
            título. `DialogDescription` resolve isso sem mudar a aparência
            (o `cn` do componente usa twMerge, então `text-base text-ink`
            vence de verdade os tokens padrão dele). */}
        <DialogDescription className="text-base text-ink">{message}</DialogDescription>
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
        className="sm:max-w-md rounded border border-line bg-fill p-5 ring-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="mb-2 text-lg font-semibold text-ink">{title}</DialogTitle>
        {/* C3: mesmo ajuste do ErrorModal — DialogDescription em vez de
            `<p>` solto, pra entrar no aria-describedby do Radix. */}
        <DialogDescription className="text-base text-ink">{message}</DialogDescription>
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
 * opcional). `coverUrl` chega preenchido desde o G1 (scraper de metadados
 * IGDB, docs/roadmap.md) — quando `GET /library/games` devolve uma capa já
 * baixada em disco.
 *
 * `consoleId` (2026-08-05, a pedido do Douglas): cor de identidade por
 * console (`consoleAccentColor`) no badge de plataforma e no glow de
 * hover/foco — decorativa, não estado. Sem `consoleId`, cai no cinza neutro
 * de sempre (nenhuma tela hoje deixa de passar, mas o componente não exige).
 *
 * M11 (docs/sprint-m-plano.md, 2026-08-07): com `coverUrl`, a capa vira duas
 * `<img>` sobrepostas — fundo desfocado (`object-cover`, preenche a célula
 * `aspect-[3/4]` inteira) e a capa real por cima (`object-contain`, sem
 * corte). Antes, uma capa quadrada ou muito alta (comum em SNES, Mega Drive,
 * o jewel case do PS1) era cortada pelo `object-cover` único que a célula
 * usava. A célula continua `aspect-[3/4]` fixa — a correção é só de como a
 * imagem preenche o espaço, não do tamanho da grade.
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
        <>
          {/* M11 (docs/sprint-m-plano.md, 2026-08-07): fundo com a própria
              capa, `object-cover` + desfocada + escurecida — preenche o
              espaço que a capa real (que raramente bate 3/4 exato: SNES,
              Mega Drive, o jewel case do PS1 variam) deixaria como faixa
              cinza chapada atrás da capa de verdade (abaixo). `scale-110`
              evita a borda transparente/clara que o blur revelaria na beira
              do recorte; o `overflow-hidden` do wrapper corta o excesso.
              Puramente decorativo — nunca a imagem que o usuário lê. */}
          <img
            src={coverUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-md brightness-50"
          />
          {/* A capa de verdade — `object-contain`, não `object-cover`: a
              célula continua `aspect-[3/4]` fixa (grade uniforme, critério
              do item), mas a arte agora aparece inteira, sem cortar os lados
              de uma capa quadrada nem o topo/base de uma capa alta. */}
          <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
        </>
      ) : (
        <>
          <div
            className={`absolute inset-0 flex items-center justify-center font-pixel text-muted opacity-25 ${
              size === "lg" ? "text-4xl" : "text-lg"
            }`}
            aria-hidden="true"
          >
            {label}
          </div>
          {/* M15 (docs/sprint-m-plano.md, 2026-08-07): a scanline só entra
              sobre o placeholder de sigla — ela existe para dar textura ao
              vazio, não para degradar a capa que o usuário acabou de baixar
              (G1). Movida pra dentro deste ramo do ternário; antes era
              irmã dos dois ramos e caía por cima de qualquer capa real
              também. */}
          <div className="game-cover-scanline pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        </>
      )}
      {/* Órfão do M7 corrigido nesta sessão: este gradiente existia para dar
          contraste ao título escrito por cima da arte — mas o M7 já move
          esse título para fora da capa (GameTile.tsx, comentário abaixo)
          sempre que existe `coverUrl`. Ficou aplicado incondicionalmente e
          escurecia o rodapé de toda capa real sem nenhum texto para
          proteger — só entra agora quando falta capa de verdade, junto com
          o título em pixel font que ele existe para sustentar. */}
      {!coverUrl && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/75 to-transparent" />
      )}

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
          // `color`, não `fill` direto no ícone: PlayIcon usa
          // `fill="currentColor"`, então herdar a cor de identidade do
          // console pelo wrapper (abaixo) é o jeito de colorir sem duplicar
          // a lógica de accent dentro do componente do ícone.
          const iconStyle: CSSProperties = { color: accent ?? "var(--accent)" };
          const icon = <PlayIcon size={16} className="translate-x-0.5" />;
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
                  style={iconStyle}
                >
                  {icon}
                </button>
              ) : (
                <div className={circleClass} style={iconStyle}>
                  {icon}
                </div>
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
      <Star size={14} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
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

/**
 * N9 (docs/roadmap.md, Sprint N): antes, nenhuma ação de sucesso confirmava
 * nada — salvar configuração, gravar mapeamento — o rótulo do botão só
 * voltava ao normal, sem dizer que funcionou. Reaproveita exatamente a caixa
 * flutuante que a instalação já usa (`fixed right-4 bottom-4 w-72`,
 * AllGamesScreen/EmulatorsScreen) — mesmo lugar, mesma forma, não um
 * componente novo do zero. `role="status"`/`aria-live="polite"`: um anúncio
 * de leitor de tela sem interromper o que a pessoa estava fazendo. Some
 * sozinho — use com `useToast` (src/hooks/useToast.ts), que controla o
 * timer; nunca cobre o controle que originou a ação porque fica ancorado no
 * canto, longe de onde o usuário acabou de clicar.
 */
export function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-4 z-40 w-72 rounded border border-line bg-fill p-3 shadow-lg"
    >
      <p className="text-sm text-ink">{message}</p>
    </div>
  );
}

/**
 * N10 (docs/roadmap.md, Sprint N): antes, erro que não justificava um
 * `ErrorModal` inteiro (falha ao favoritar, revarrer uma pasta, salvar um
 * campo) virava `<p className="text-sm text-danger">` solto — 28 ocorrências
 * (`grep -rn 'text-danger">' src/screens src/components`), texto do mesmo
 * tamanho do que está ao redor, sem ícone nem fundo, fácil de perder num
 * painel denso. `role="alert"`: leitor de tela anuncia sem precisar de foco.
 * A mensagem em si nunca muda — continua vindo do servidor sem reescrita
 * (regra do projeto), só a moldura é nova. Sem tamanho de texto fixo por
 * dentro do componente: variava entre `text-xs`/`text-sm` nos usos antigos
 * por acidente, não por decisão — `text-sm` aqui consolida num só.
 */
export function InlineError({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-sm border-l-2 border-danger bg-danger/10 px-2 py-1.5 text-sm text-ink ${className}`}
    >
      <TriangleAlert size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/**
 * N11 (docs/roadmap.md, Sprint N): `AllGamesScreen` já resolveu carregando/
 * vazio no M12 — `GamesScreen`, `LibraryScreen` e `EmulatorsScreen` ainda
 * mostravam tela em branco enquanto o dado era `null` (sem nenhum sinal de
 * que algo estava vindo) e um parágrafo solto quando não havia nada.
 * `CardSkeleton` é o placeholder genérico — cada tela desenha na MESMA grade
 * da lista real (mesmas classes `grid-cols-*`), senão o conteúdo pula de
 * layout ao carregar (a mesma armadilha que o O5 documentou pra grade
 * virtualizada). `role="status"`/`sr-only`: um anúncio só, não um por
 * célula — mesmo padrão do `GameTileSkeleton` (M12).
 */
export function CardSkeleton({ className = "" }: { className?: string }) {
  // Sem altura padrão: cada chamador já passa a sua (ver os 7 usos atuais).
  // Um `h-24` fixo aqui dependeria de concatenação de string pra ser
  // sobrescrito — mesma armadilha do O1 (largura do modal) e do N4 (altura
  // do ZSelect): a ordem das classes no CSS compilado, não a ordem no JSX,
  // decide quem vence, e isso não é garantido.
  return <div aria-hidden="true" className={`animate-pulse rounded border border-line-strong bg-fill ${className}`} />;
}

/**
 * N11 (docs/roadmap.md, Sprint N): mesmo painel tracejado + ação primária
 * que `AllGamesScreen` já usava para "biblioteca vazia" (M12), extraído
 * daqui pra não duplicar em toda tela que precisar do mesmo tratamento.
 * `action` fica de fora quando a tela já tem a ação em outro lugar visível
 * (ex.: `GamesScreen` sempre mostra "Voltar à biblioteca" no cabeçalho).
 */
export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded border border-dashed border-line-strong px-6 py-16 text-center">
      <p className="text-base text-muted">{message}</p>
      {action}
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
  // N12 (docs/roadmap.md, Sprint N): mesmo tratamento que `EmulatorCard`
  // (src/screens/EmulatorsScreen.tsx) já usa — borda esquerda de 3px na cor
  // de `consoleAccentColor`. Antes, esta era a única grade de cards do app
  // sem a cor de identidade que M10 introduziu — 33+ cards visualmente
  // idênticos, cinza, diferindo só pelo texto.
  const accent = consoleAccentColor(verdict.console_id);

  return (
    <Card className="flex flex-col gap-2" style={{ borderLeftColor: accent, borderLeftWidth: 3 }}>
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
// G5 (docs/roadmap.md, achado em 2026-08-07): `label.slice(0, 4)` colidia de
// verdade pra 5 consoles — verificado por script contra os 33 `short_name`
// do catálogo, não "parece parecido": `gb` ("Game Boy"), `gamegear` ("Game
// Gear") e `gamecube` ("GameCube") resolviam os três pra "GAME"; `xbox`
// ("Xbox") e `xbox360` ("Xbox 360") resolviam os dois pra "XBOX". A cor por
// fabricante (M10) ajuda em parte — `gamegear` é Sega (ciano), longe de
// `gb`/`gamecube` (Nintendo, vermelho) — mas não separa `gb` de `gamecube`,
// mesma família de cor.
//
// Corrigido aqui, não em `short_name` (usado como texto **completo** em
// badge/chip por toda a biblioteca) — trocar `short_name` pra abreviar
// resolveria a colisão do ícone mas quebraria o texto legível nas outras
// telas. Mapa pequeno, só pros 4 casos que colidem de verdade; o resto
// continua caindo no `slice(0, 4)` de sempre.
const ICON_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  gb: "GB", // short_name é "Game Boy" por inconsistência com gba/gbc (já abreviados) — "GB" também resolve isso
  gamegear: "GG", // abreviação comum em comunidade retro
  gamecube: "GC", // idem
  xbox360: "X360", // `xbox` sozinho continua "XBOX" (slice normal, sem entrada aqui)
};

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
      {(ICON_LABEL_OVERRIDES[consoleId] ?? label.slice(0, 4)).toUpperCase()}
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
        className="sm:max-w-md rounded border border-line bg-fill p-5 ring-0"
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
            {/* C3: headline como DialogDescription — é o resumo que
                descreve o modal, então é o texto certo pro aria-describedby
                do Radix (evita o aviso de acessibilidade no console). */}
            <DialogDescription className="text-sm text-muted">{verdict.headline}</DialogDescription>

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
