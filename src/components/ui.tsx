import { useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, Play, Star, TriangleAlert } from "lucide-react";
import { consoleImageURL } from "../api";
import type { ConsoleVerdict } from "../api/types";
import logoZeux from "../assets/logo-zeux.png";
import logoZeuxMark from "../assets/logo-zeux-mark.png";
import { consoleAccentColor } from "../lib/consoleColor";
import { useT } from "../i18n/i18n";
import { dict } from "./ui.i18n";
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
//
// Este anel é do TECLADO. A navegação por controle não passa por aqui: ela
// foca por script, e `:focus-visible` programático não é confiável no
// WebView2 (ver `useGamepadNavigation.ts` e o bloco
// `[data-gamepad-focused]` em src/index.css). Onde um componente reage ao
// foco com mais do que o anel — o glow da capa, o overlay de play — a
// variante `[[data-gamepad-focused]_&]:` acompanha o `group-focus-visible:`
// para que o controle acenda a mesma coisa que o teclado acende.
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
// A11y 1.4.11 (auditoria de acessibilidade, 2026-09-06): `border-line-strong`
// (1.89:1 sobre --paper, 1.76:1 sobre --fill) não atinge o 3:1 que a WCAG AA
// exige para o limite visual de um controle de formulário. `border-control-border`
// é o token dedicado calibrado ≥3:1 nos dois fundos (ver src/index.css).
export const inputClass =
  `h-9 w-full rounded-lg border border-control-border bg-fill px-3 text-sm text-ink placeholder:text-muted ${FOCUS_RING}`;

/**
 * N4 (docs/roadmap.md, Sprint N): wrapper sobre o `Select` do shadcn (J3)
 * que aplica a mesma altura (`h-9`/36px, `inputClass` acima — desceu de
 * 38px em 2026-09-07 pra bater com o chip/botão `chrome` da régua de
 * filtros: achado do Douglas testando o app, "nem na mesma altura e
 * tamanho dos selects", revisando a decisão original do N4 de deixar chip
 * mais baixo que input/select de propósito), borda e `FOCUS_RING` do input
 * do ZeuX — sem isto, cada tela reconstruía o `SelectTrigger` com um
 * `className` própio e divergia (uma tinha `w-fit`, outra `w-full
 * max-w-xs`, nenhuma corrigia a altura de 32px nem o `focus-visible:ring`
 * de dois vocabulários — outline aqui, ring lá).
 * `data-[size=default]:h-9`, não só `h-9`: a base do `SelectTrigger` fixa a
 * altura sob esse mesmo seletor de atributo (`data-[size=default]:h-8`) —
 * um `h-9` sem o mesmo modificador perderia a MESMA disputa de
 * especificidade que o O1 já achou nos modais (`ui/dialog.tsx`):
 * tailwind-merge não considera dois modificadores diferentes como
 * conflitantes, e a classe da base sobreviveria.
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
  disabled,
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
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={`h-9 w-full rounded-lg border-control-border bg-fill px-3 text-sm text-ink data-[size=default]:h-9 focus-visible:border-control-border focus-visible:ring-0 ${FOCUS_RING} ${className}`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

/**
 * Marca do ZeuX como componente (2026-09-09, direção retrô do CLAUDE.md).
 *
 * O problema que resolve: cinco lugares (`Sidebar`, `ConsentScreen`,
 * `StatusScreen`, `EmptyState`, `SplashScreen`) faziam `<img src={logoZeux}>`
 * à mão, e só a abertura aplicava `image-rendering: pixelated` — nos outros a
 * interpolação do navegador borrava a grade de pixels, que é justamente o
 * caráter da marca. Pior: `logo-zeux.png` traz o wordmark "ZeuX" desenhado
 * dentro da arte, que a 36-48px vira um borrão ilegível.
 *
 * `logo-zeux-mark.png` é o recorte só-Zeus (busto + raio, sem wordmark),
 * gerado do PNG original — ver nota de arte para o Douglas. `lockup` volta ao
 * PNG completo com o wordmark, para os usos grandes (abertura) onde ele lê.
 *
 * `size` é travado nos múltiplos da grade (32/48/64/96/160): um bitmap de
 * pixel art escalado para um valor que não é múltiplo inteiro da resolução
 * nativa cintila (linhas de pixel de larguras diferentes lado a lado). Quem
 * passa 44 recebe 48 — o valor mais próximo que não cintila.
 */
const MARK_SIZES = [32, 48, 64, 96, 160] as const;

function snapMarkSize(requested: number): number {
  return MARK_SIZES.reduce((best, candidate) =>
    Math.abs(candidate - requested) < Math.abs(best - requested) ? candidate : best,
  );
}

export function ZeuXMark({
  size = 48,
  tone = "brand",
  lockup = false,
  className = "",
}: {
  size?: number;
  /** `dim` para o fundo de painel vazio, onde a marca é textura e não foco. */
  tone?: "brand" | "dim";
  /** Usa o PNG completo com o wordmark — só onde ele é grande o bastante para ler. */
  lockup?: boolean;
  className?: string;
}) {
  // `lockup` não passa pelo snap: ali o tamanho é escolhido a dedo (abertura)
  // e o wordmark precisa exatamente daquela caixa.
  const px = lockup ? size : snapMarkSize(size);
  return (
    <img
      src={lockup ? logoZeux : logoZeuxMark}
      alt=""
      aria-hidden="true"
      width={px}
      height={px}
      // `imageRendering: pixelated`: a grade de pixels é a identidade, não um
      // artefato a suavizar. `width`/`height` explícitos (não só CSS) evitam
      // o salto de layout enquanto o PNG carrega.
      style={{ width: px, height: px, imageRendering: "pixelated" }}
      className={`${tone === "dim" ? "opacity-30" : ""} ${className}`}
    />
  );
}

/**
 * Régua de chips de filtro — canto reto, borda de 1.5px que lê como chassi,
 * rótulo monoespaçado em caixa alta e o friso interno de 1px no topo (luz
 * vindo de cima). Estava só em `ConsolesScreen`; `AllGamesScreen` reescrevia a
 * string inline seis vezes e já tinha divergido (`border-line-strong` no lugar
 * de `border-control-border`, contraste 1.89:1 — reprovado pelo comentário de
 * `--control-border` em index.css). Mora aqui agora, ao lado de
 * `CHROME_TINT_*`, e as duas telas consomem a mesma constante.
 *
 * Roxo no ativo e no hover, nunca âmbar nem ciano: filtrar é ação do usuário
 * (roxo, regra da paleta em index.css). O âmbar que vários toggles de
 * `AllGamesScreen` usavam no estado ligado era uso indevido — âmbar é
 * reservado a ressalva/atenção; sobrevive só no `fill` da estrela de favorito.
 */
export const FILTER_CHIP_BASE =
  "inline-flex h-9 items-center gap-1.5 rounded-sm border-[1.5px] px-3 font-mono text-xs font-medium tracking-wider uppercase shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition duration-150 active:translate-y-px active:shadow-none";
export const FILTER_CHIP_ON =
  "border-accent bg-accent/10 text-ink shadow-[0_0_14px_-4px_var(--accent),inset_0_1px_0_0_rgba(255,255,255,0.06)]";
export const FILTER_CHIP_OFF =
  "border-control-border text-muted hover:border-accent hover:bg-accent/10 hover:text-ink";

type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet" | "danger" | "chrome";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border border-accent bg-accent font-semibold text-accent-ink hover:bg-accent-hover",
  // A11y 1.4.11: `border-control-border` (≥3:1 sobre --paper e --fill) em vez
  // de `border-line-strong` — a borda é o único contorno deste botão.
  secondary: "border border-control-border bg-transparent text-ink hover:bg-fill",
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
  // `chrome` (achado do Douglas, 2026-09-07, testando o app de verdade: "os
  // botões de voltar e pasta, buscar capas está destoando ainda"). A régua
  // de filtros de `AllGamesScreen` foi redesenhada na linguagem arcade/CRT —
  // canto reto (`rounded-sm`), rótulo miúdo em caixa alta com `tracking-wide`,
  // borda que acende no roxo — e os botões de chrome logo acima e ao lado
  // dela continuaram em `secondary`: canto arredondado de 8px, rótulo de
  // 16px em caixa mista, cinza que nunca acende. Lado a lado, liam como
  // dois aplicativos diferentes.
  //
  // Não é "secondary com outra cor": é o papel de **chrome de navegação e de
  // arquivo** (voltar, apontar/abrir pasta, buscar capas) — ação sobre o
  // aplicativo, não sobre o conteúdo da tela. `primary`/`danger` continuam
  // sendo o conteúdo ("Jogar", "Instalar", "Remover"), e por isso não mudam:
  // a hierarquia depende de o chrome ser visivelmente mais leve que eles
  // (guideline `primary-action` do ui-ux-pro-max — um CTA primário por tela,
  // ações secundárias visualmente subordinadas).
  //
  // O glow no hover/foco usa `--accent` (roxo), nunca `--accent-secondary`
  // (ciano): a regra da paleta em src/index.css é "roxo é 'aqui você age',
  // ciano é 'aqui o sistema informa'". Mesmo vocabulário de halo que o chip
  // de plataforma ativo e a capa em hover já usam — nenhum efeito novo entra
  // no projeto, só passa a valer também aqui.
  //
  // A11y: `border-control-border` em repouso (≥3:1, WCAG 1.4.11) e
  // `text-ink` no rótulo — a versão em `text-muted` foi descartada porque o
  // rótulo em 12px caixa alta já é o texto mais difícil da tela; cor não
  // deveria somar dificuldade (o peso menor sozinho já subordina).
  //
  // Segunda rodada (2026-09-07, achado do Douglas: "quero... de uma ideia
  // de botão mais retro ainda"): `border` (1px) virou `border-[1.5px]`
  // (mais chapado, lê como chassi de hardware, não como contorno de campo de
  // formulário) e ganhou `font-mono` (fonte monoespaçada do sistema, não
  // `font-pixel`/Press Start 2P — o pixel bitmap já foi tirado dos rótulos
  // de chip em 2026-09-06 por legibilidade ruim a 11px colorido; monoespaçada
  // comum não tem esse problema e ainda lê como terminal/menu de console).
  // `shadow-[inset...]` desenha um friso claro de 1px no topo por dentro —
  // truque clássico de botão físico (luz vindo de cima), e `active:` some
  // com ele e desce o botão 1px: o clique agora tem uma resposta tátil, não
  // só a mudança de cor do `:hover`.
  //
  // 2026-09-09: `font-mono` deixou de cair na monoespaçada do SO e passou a
  // resolver IBM Plex Mono embutida (`--font-mono` em index.css) — o rótulo
  // do chrome agora tem a mesma voz de mostrador em qualquer máquina.
  //
  // `border-[1.5px]`, não `border-2`: 2px
  // exatos empurrariam o texto/ícone 0.5px a mais que os outros variants
  // (ainda em `border`/1px) e desalinharia baseline entre botões vizinhos de
  // variants diferentes numa mesma linha.
  chrome:
    "border-[1.5px] border-control-border bg-transparent font-mono font-medium tracking-wider text-ink uppercase shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:border-accent hover:bg-accent/10 hover:shadow-[0_0_14px_-4px_var(--accent),inset_0_1px_0_0_rgba(255,255,255,0.06)] active:translate-y-px active:shadow-none",
};

/**
 * Geometria por variante. `chrome` é o único que sai do botão de 16px com
 * canto de 8px: precisa medir como os chips da régua de filtros
 * (`rounded-sm`, `text-xs`), não como um botão de conteúdo. Fica aqui, e não
 * concatenado em `buttonVariants`, porque a ordem de duas classes Tailwind
 * conflitantes na mesma string (`rounded-lg` + `rounded-sm`) é decidida pela
 * ordem no CSS gerado, não pela ordem na string — o resultado seria estável
 * por acaso, não por desenho.
 *
 * `h-9` (2026-09-07: subiu de `py-1.5`/altura implícita ~28px — achado do
 * Douglas, "nem na mesma altura e tamanho dos selects") deixa `chrome` com a
 * mesma altura de 36px que `inputClass`/`ZSelect` e os chips da própria
 * régua de filtros (`AllGamesScreen`) usam agora — um só valor de altura
 * para toda a barra de controles da tela, em vez de cada família de
 * controle ter a sua. `px-3` sozinho (sem `py`) mantém o alvo de clique
 * dentro do mínimo de 24×24 CSS px da WCAG 2.2 AA (`web-target-size`) com
 * folga, já que `h-9` (36px) já é maior que o piso.
 */
const buttonShapes: Record<ButtonVariant, string> = {
  primary: "rounded-lg px-4 py-2 text-base",
  secondary: "rounded-lg px-4 py-2 text-base",
  ghost: "rounded-lg px-4 py-2 text-base",
  quiet: "rounded-lg px-4 py-2 text-base",
  danger: "rounded-lg px-4 py-2 text-base",
  chrome: "h-9 gap-1.5 rounded-sm px-3 text-xs",
};

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return (
    <button
      // A11y 2.5.8 (Target Size, WCAG 2.2 AA): piso de 24px de altura em todo
      // botão, mesmo os "compactos" que passam `py-0.5`/`py-1` + `text-xs` via
      // `className` (lista de cores do RetroArch, painel de mapeamento) — esses
      // ficavam em ~20px. `inline-flex`/`items-center` mantém o rótulo centrado
      // quando o `min-h` passa a mandar na altura.
      // `transition-colors` virou `transition` (2026-09-07): `chrome` acende
      // um `box-shadow` no hover, e `transition-colors` não cobre sombra — o
      // halo apareceria de uma vez, sem a mesma inércia das cores ao lado.
      className={`inline-flex min-h-[24px] items-center justify-center transition duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${buttonShapes[variant]} ${buttonVariants[variant]} ${FOCUS_RING} ${className}`}
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
 * porque o glow fica a baixa opacidade e o texto não fica sobre ele — a tela
 * inteira que ganha o clima, não uma faixa atrás da frase). Uso: `<main
 * className="relative ...">` + `<AmbientGlow />` como primeiro filho.
 *
 * Renomeado de `OnboardingGlow` (achado do critico-design, 2026-09-06): a
 * identidade neon do ADR 0013 só existia nas telas de onboarding —
 * exatamente as que o usuário vê uma vez — e desligava sozinha assim que o
 * app de verdade começava (`App.tsx`, shell com `Sidebar`). Mesmo componente,
 * usado também no shell principal, só com `opacity` mais baixa (a versão
 * "quente" de 14% competiria com grades densas de jogos/consoles).
 */
export function AmbientGlow({ opacity = 14 }: { opacity?: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        background: `radial-gradient(60% 50% at 50% 30%, color-mix(in srgb, var(--accent) ${opacity}%, transparent), transparent 70%)`,
      }}
    />
  );
}

/**
 * "Céu" da tela (2026-09-10, achado do critico-design: o glow do shell é
 * uniforme e não varia por tela, então o app inteiro continua lendo como
 * "preto parelho").
 *
 * Diferente do `AmbientGlow`, que fica ancorado na JANELA e vale para todas as
 * fases: este halo é ancorado no TOPO DO CONTEÚDO da tela — é o degrau que faz
 * uma tela parecer diferente da anterior ao trocar de item na sidebar.
 *
 * A fórmula do gradiente é a mesma já calibrada no cabeçalho de
 * `ConsoleDetailScreen` (`radial-gradient` + `color-mix` sobre a cor de
 * identidade), só com a âncora no topo e a porcentagem mais baixa: o próprio
 * crítico avisou que acima de ~10-12% isso lê como "sujo", não como clima.
 *
 * `accent` opcional: telas que têm uma cor de console usam a dela; sem isso
 * cai no roxo `--accent` do tema. Decorativo, `aria-hidden`, nunca sobre
 * texto medido — o pai precisa ser `relative`, e o conteúdo da tela vem
 * depois no DOM.
 */
export function ScreenAtmosphere({ accent, opacity = 12 }: { accent?: string; opacity?: number }) {
  const color = accent ?? "var(--accent)";
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
      style={{
        background: `radial-gradient(55% 35% at 50% 0%, color-mix(in srgb, ${color} ${opacity}%, transparent), transparent 70%)`,
      }}
    />
  );
}

/**
 * N3 (docs/roadmap.md, Sprint N): antes, cada tela escolhia seu próprio teto
 * de largura e seu próprio espaçamento de topo — conferido por `grep`, eram
 * seis valores diferentes (`max-w-6xl`, `max-w-7xl`, `max-w-5xl`,
 * `max-w-4xl`, `max-w-2xl`) mais um `py-10` isolado — e navegar de uma tela
 * para outra fazia o conteúdo "pular" de largura. Um teto só, o mesmo teto
 * escalonado que a Sprint O já validou (O5): `max-w-6xl` até 1536px de
 * janela, crescendo em telas grandes/4K para não deixar metade da janela
 * vazia.
 *
 * **Existiu uma segunda variante ("reading", `max-w-3xl` fixo) para telas de
 * leitura/formulário** (Detalhe do jogo, Configurações), com a régua de
 * ~65-75 caracteres por linha como justificativa. **Removida a pedido do
 * Douglas (2026-09-06):** o modelo do produto é "wide" em toda tela, sem
 * exceção — inclusive as duas que só liam texto. `variant` continua existindo
 * como parâmetro (todo chamador já escreve `variant="listing"` explícito) só
 * para não obrigar uma segunda rodada de edição nos 8 chamadores existentes;
 * se um dia sobrar variante única de verdade, vale simplificar removendo o
 * parâmetro também.
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
  variant?: "listing";
  className?: string;
  children: ReactNode;
}) {
  void variant; // única variante que resta — ver comentário acima
  const width = "max-w-6xl 2xl:max-w-[1600px] min-[2400px]:max-w-[2000px]";
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
      className={`rounded-lg border border-line ${dense ? "p-3" : "p-4"} ${filled ? "bg-fill" : "bg-transparent"} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Tingimento do `Button variant="chrome"` por papel (2026-09-07, redesenho da
 * tela de Emuladores). O achado do Douglas que criou o padrão ("quero uma cor
 * diferente de base, não só no hover") tinha gerado, em `LibraryScreen`, duas
 * strings de seis utilities cada, escritas inline — e a tela de Emuladores
 * precisava exatamente das mesmas duas. Nomear aqui evita a terceira cópia
 * divergir da primeira.
 *
 * O `!` é necessário, não enfeite: `chrome` já define borda/fundo/sombra em
 * repouso e no hover, o `className` só concatena (o `Button` não usa
 * tailwind-merge), e quem vence duas utilities conflitantes é a ordem no CSS
 * gerado, não a ordem na string — mesma armadilha que O1/N4 já documentaram.
 *
 * `INFO` é o ciano de "aqui o sistema informa" (regra da paleta em
 * src/index.css); `DANGER` é o vermelho do destrutivo já em repouso, para o
 * sinal chegar ANTES do clique. A cor nunca é o único sinal (o rótulo diz
 * "Remover" e um `ConfirmModal` sempre confirma), então não viola 1.4.1.
 */
/**
 * Barra de chrome do card: altura de 28px em vez dos 36px do `chrome` padrão.
 * Um card de grade cabe 3 numa fileira (~290px de largura) e chega a ter
 * cinco destes botões; na altura cheia eles ocupariam três linhas e
 * empurrariam a ação de instalar/remover para fora do campo de visão. O piso
 * de 24px da WCAG 2.2 AA (`web-target-size`) continua respeitado com folga.
 *
 * Morava em `EmulatorsScreen.tsx` até 2026-09-11, quando `ConsoleDetailScreen`
 * passou a usar a mesma régua (os botões de "abrir a janela de outro
 * programa" viraram `chrome` nas duas telas) — mora aqui pelo mesmo motivo
 * que `CHROME_TINT_*`: duas telas com a mesma regra não podem ter duas
 * definições dela.
 */
export const CARD_CHROME = "h-7! px-2! whitespace-nowrap";

export const CHROME_TINT_INFO =
  "border-accent-secondary/50! text-accent-secondary! hover:border-accent-secondary! hover:bg-accent-secondary/10! hover:shadow-[0_0_14px_-4px_var(--accent-secondary),inset_0_1px_0_0_rgba(255,255,255,0.06)]!";
export const CHROME_TINT_DANGER =
  "border-danger/50! text-danger! hover:border-danger! hover:bg-danger/10! hover:shadow-[0_0_14px_-4px_var(--danger),inset_0_1px_0_0_rgba(255,255,255,0.06)]!";

type BadgeVariant = "default" | "solid" | "warn";

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
  // `variant="solid"` é sempre estado passivo do sistema — "instalado",
  // "conectado" — nunca uma ação; achado do critico-design (2026-09-06)
  // deu esse papel ao ciano em vez do roxo (`--accent`, comentário em
  // index.css), pra "pronto" parar de competir visualmente com "Instalar",
  // que é a ação de verdade e continua roxa. `text-accent-ink`, não um
  // "-ink" próprio do ciano: o mesmo quase-preto passa contraste alto contra
  // qualquer um dos dois fundos claros (medido: 4.62:1 do roxo, 12.7:1 do
  // ciano — ambos folgados o bastante pra não precisar de um segundo tom).
  // `warn` (2026-09-07, redesenho da tela de Emuladores): "BIOS ausente"
  // precisava ser escaneável na grade inteira de cards, não só depois de
  // achar o `Callout` tracejado dentro de um card. Reusa os tokens âmbar que
  // `Callout tone="amber"`/`PartialNotice` já usam — é o mesmo peso de
  // "atenção", em tamanho de badge. Não é estado de erro: o texto continua
  // descritivo ("a pasta está vazia"), nunca uma cobrança ao usuário.
  const styles =
    variant === "solid"
      ? "border-accent-secondary bg-accent-secondary text-accent-ink"
      : variant === "warn"
        ? "border-amber-line bg-amber-bg text-ink"
        : "border-line-strong text-muted";
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
  className = "",
  children,
}: {
  label: string;
  tone?: "neutral" | "amber";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`${
        tone === "amber"
          ? "rounded-lg border border-amber-line bg-amber-bg p-3"
          : "rounded-lg border border-dashed border-line-strong p-3"
      } ${className}`}
    >
      <p className="mb-1 font-mono text-xs tracking-wide text-muted uppercase">{label}</p>
      <div className="text-base text-ink">{children}</div>
    </div>
  );
}

/** Card com borda âmbar — reservado para o aviso de precisão "parcial" (regra: nunca escondido). */
export function PartialNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-line bg-amber-bg p-3 text-base text-ink">
      <Badge>parcial</Badge>
      <p className="mt-2">{children}</p>
    </div>
  );
}

/**
 * "Voltar" — um componente, não cinco cópias (2026-09-07). O botão existia
 * em seis lugares (`ScreenHeader`, `LibraryScreen`, `GamesScreen`,
 * `GameDetailScreen` e duas vezes em `ConsoleDetailScreen`), sempre como
 * `<Button variant="secondary" className="mb-4">` copiado à mão — e as
 * cópias já tinham divergido: `GameDetailScreen` e `ConsoleDetailScreen`
 * estavam sem `data-nav-back`, ou seja, o botão B do controle não voltava
 * dessas duas telas (A11y 2.1.4). Com um componente só, o atributo e o
 * espaçamento não têm mais como se perder na próxima cópia.
 *
 * O rótulo continua vindo de fora, e não fixo em "Voltar": as telas usam
 * rótulos específicos de propósito ("Voltar à biblioteca", "Consoles") —
 * `back-behavior` do ui-ux-pro-max pede um voltar previsível, e dizer para
 * onde se volta é mais previsível que um genérico.
 *
 * A seta é `ChevronLeft` do lucide (N14: nada de "←" tipográfico fazendo
 * papel de ícone) e é `aria-hidden` — decorativa ao lado de um rótulo que
 * já diz a mesma coisa (`icon-context`).
 */
export function BackButton({
  label,
  onClick,
  className = "",
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    // A11y 2.1.4: `data-nav-back` — alvo do botão B do controle.
    <Button variant="chrome" data-nav-back onClick={onClick} className={`mb-4 ${className}`}>
      <ChevronLeft size={13} aria-hidden="true" />
      {label}
    </Button>
  );
}

/**
 * Cabeçalho de tela — achado do critico-design (2026-09-06): seis telas
 * (`ConsolesScreen`, `EmulatorsScreen`, `SettingsScreen`, `AllGamesScreen`,
 * `ConsoleDetailScreen`, `VerdictScreen`) tinham seis anatomias de cabeçalho
 * diferentes — layout, margem inferior do título (4 valores: `mb-4`, `mb-5`,
 * `mb-6`, nenhum) e posição das ações mudavam tela a tela, sem motivo além
 * de "foi assim que essa tela foi pedida". Causa mecânica direta da queixa
 * "a composição parece blocos empilhados, não desenhada com intenção".
 *
 * `back` é `{ label, onClick }`, não um texto fixo "Voltar": os rótulos já
 * existentes variam por tela de propósito (`ConsoleDetailScreen` usa
 * "← Consoles", mais específico que um "Voltar" genérico) — o componente
 * não deveria ser mais rígido que o que já existia. `data-nav-back` (A11y
 * 2.1.4, alvo do botão B do controle) fica embutido aqui, não repetido em
 * cada chamador.
 *
 * `actions` alinhado pela mesma linha de base do título (`items-start`, não
 * o `items-end`/`items-center` que cada tela escolhia à mão) — é o ajuste
 * que a proposta original do agente pedia: ação nunca deveria "flutuar"
 * conforme a altura do bloco de título/subtítulo ao lado.
 */
export function ScreenHeader({
  back,
  title,
  subtitle,
  actions,
}: {
  back?: { label: string; onClick: () => void };
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {back && <BackButton label={back.label} onClick={back.onClick} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* 2026-09-10 (achado do critico-design: "a voz pixel virou
              resíduo, sobrevive só na abertura"): a fonte pixel volta ao
              topo de TODA tela, não como exceção — mas só aqui, a 22px, onde
              ela é legível de verdade (o motivo de tê-la tirado dos rótulos
              pequenos em 2026-09-06/N17 continua válido abaixo deste
              tamanho). `leading-relaxed` porque a altura-x da Press Start 2P
              é maior que a de uma sans no mesmo tamanho de fonte — sem
              folga extra a entrelinha lê apertada. Acentos (ç/ã/õ/é, pt-BR)
              cobertos pelo subset `latin`/`latin-ext` que o `400.css` já
              importa por inteiro (conferido: sem tofu). */}
          <h1 className="font-pixel text-xl leading-relaxed tracking-[0.04em] text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * Título de seção dentro de uma tela (`<h2>`). Papel intermediário da
 * hierarquia entre o `<h1>` de 28px e o corpo de 15px (achado do
 * critico-design, 2026-09-06 — "o app salta de 28px para 15px sem degrau no
 * meio"): ocupa o `text-lg` (17px) que a escala de seis degraus define mas
 * quase ninguém usava.
 *
 * Saiu do `font-pixel text-[11px]` que os `<h2>` de seção usavam: pixel font a
 * 11px é *menor* que o corpo e comunica "título" só pelo estilo, não pelo
 * tamanho — o mesmo raciocínio da N17, que tirou a pixel font dos rótulos da
 * sidebar. A pixel font continua nos *rótulos* de card ("SISTEMA",
 * "PROCESSADOR" no SpecsPanel) e em badge/contador — ali é tempero, não
 * estrutura de página. Mantém `uppercase tracking-wide text-muted` para não
 * romper o vocabulário visual do app; só o tamanho sobe.
 *
 * `text-accent-secondary` (ciano), não `text-muted` (achado do
 * critico-design, 2026-09-06): é o papel que o token ganhou nesta sessão —
 * "aqui o sistema informa", ver comentário de `--accent-secondary` em
 * `index.css`. Contraste medido a 12.7:1 contra `--paper`, folga maior que
 * o `text-muted` que saiu daqui (7.62:1) — troca de identidade, não de
 * legibilidade.
 */
export function SectionHeading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`text-lg font-semibold tracking-wide text-accent-secondary uppercase ${className}`}>{children}</h2>
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
  extraAction,
}: {
  title: string;
  message: string;
  onClose: () => void;
  onRetry?: () => void;
  /** B2 (docs/pendencias.md): terceira ação opcional, ao lado de
   *  Fechar/Tentar de novo — hoje só usada pelo erro de "emulador não
   *  encontrado" (`binary_not_found`/`not_installed`/`emulator_unavailable`),
   *  levando ao cadastro manual do emulador. Genérica de propósito: este
   *  componente não sabe o que `onClick` abre, só desenha o botão. */
  extraAction?: { label: string; onClick: () => void };
}) {
  const t = useT(dict);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* O1 (docs/roadmap.md, Sprint O): a base do DialogContent (src/components/ui/dialog.tsx)
          já traz "sm:max-w-sm". Como o tailwind-merge não considera "max-w-md" e
          "sm:max-w-sm" conflitantes (modificador diferente), as duas sobreviviam no
          className final e a variante prefixada vencia — todo modal ficava em 384px
          na prática, ignorando o teto que cada tela pedia. Por isso o teto aqui também
          precisa do prefixo "sm:", para sobrescrever de verdade. */}
      <DialogContent
        className="sm:max-w-md rounded-lg border border-line bg-fill p-5 ring-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="mb-2 text-lg font-semibold text-danger">{title}</DialogTitle>
        {/* C3: `<p>` solto não é lido pelo `aria-describedby` que o Radix
            monta a partir do `Content` — o leitor de tela anunciava só o
            título. `DialogDescription` resolve isso sem mudar a aparência
            (o `cn` do componente usa twMerge, então `text-base text-ink`
            vence de verdade os tokens padrão dele). */}
        <DialogDescription className="text-base text-ink">{message}</DialogDescription>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {extraAction && (
            <Button variant="secondary" onClick={extraAction.onClick}>
              {extraAction.label}
            </Button>
          )}
          {onRetry && (
            <Button variant="secondary" onClick={onClose}>
              {t("close")}
            </Button>
          )}
          <Button variant="primary" autoFocus onClick={onRetry ?? onClose}>
            {onRetry ? t("retryButton") : t("understand")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Q5 (docs/roadmap.md, Sprint Q): o emulador deste jogo é de fonte que o ZeuX
 * não sabe automatizar (RetroArch, Dolphin — 21 dos 33 consoles dependem do
 * primeiro). Antes disto, o clique em "Jogar" disparava uma instalação que o
 * servidor recusava com 400, e a tela mostrava a recusa como se algo tivesse
 * quebrado. Não quebrou nada: o app simplesmente não instala este.
 *
 * **Não repete as instruções aqui.** Onde baixar e onde extrair já vivem no
 * detalhe do console, com o caminho exato da pasta gerenciada e o botão do
 * site oficial — duas cópias desse texto divergiriam na primeira correção. O
 * modal explica o estado e leva até lá.
 */
export function ManualInstallModal({
  adapterName,
  onClose,
  onOpenConsole,
  onPointManually,
}: {
  adapterName: string;
  onClose: () => void;
  /** Ausente quando a tela não sabe navegar para o console — o modal ainda
   * explica o estado, só não oferece o atalho. */
  onOpenConsole?: () => void;
  /** B2 (docs/pendencias.md): quem já tem este emulador instalado, só que
   *  fora de onde o ZeuX olha, não precisa do trilho "baixe e coloque
   *  aqui" — precisa apontar o executável. Ausente pelo mesmo motivo de
   *  `onOpenConsole`: a tela que não sabe abrir o form não oferece o
   *  atalho. */
  onPointManually?: () => void;
}) {
  const t = useT(dict);
  return (
    <ConfirmModal
      title={t("manualInstallTitle")}
      message={t("manualInstallMessage", { adapterName })}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("close")}
          </Button>
          {onPointManually && (
            <Button variant="secondary" onClick={onPointManually}>
              {t("alreadyInstalledPointManually")}
            </Button>
          )}
          {onOpenConsole && (
            <Button variant="primary" autoFocus onClick={onOpenConsole}>
              {t("seeConsole")}
            </Button>
          )}
        </>
      }
    />
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
        className="sm:max-w-md rounded-lg border border-line bg-fill p-5 ring-0"
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
  hoverInfo,
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
  /**
   * Achado do critico-layout-biblioteca (2026-09-06): metadado que hoje só
   * aparece abrindo o detalhe do jogo — console/última vez jogado — some
   * numa faixa que sobe do rodapé no hover/foco, sobre a capa real. Ausente
   * = nenhuma faixa (ex.: jogo nunca jogado, sem dado extra que valha
   * antecipar). Só entra com `coverUrl`: sem capa real, a sigla + o título em
   * pixel font já ocupam o rodapé (ver ramo `!coverUrl` abaixo) — duas faixas
   * disputando o mesmo espaço.
   */
  hoverInfo?: ReactNode;
}) {
  const t = useT(dict);
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
      className={`game-cover group relative aspect-[3/4] overflow-hidden rounded-lg border border-line-strong bg-fill transition-[border-color,box-shadow] duration-150 ease-in-out hover:border-[var(--console-accent,var(--accent))] group-focus-visible:border-[var(--console-accent,var(--accent))] hover:shadow-[0_0_16px_color-mix(in_srgb,var(--console-accent,var(--accent))_45%,transparent)] group-focus-visible:shadow-[0_0_16px_color-mix(in_srgb,var(--console-accent,var(--accent))_45%,transparent)] ${className}`}
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
          {/* Achado do critico-layout-biblioteca (2026-09-06): faixa que sobe
              do rodapé no hover/foco, com o metadado que hoje só aparece
              abrindo o detalhe. `translate-y-full` → `translate-y-0`: some
              fora da célula em vez de só ficar transparente, então não
              atrapalha o `object-contain` da capa por cima quando escondida.
              `pointer-events-none`: é informação, não abre nada sozinha — o
              clique continua indo para o wrapper `role="button"` por baixo. */}
          {hoverInfo && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/85 via-black/70 to-transparent px-2 pt-5 pb-1.5 opacity-0 transition-[transform,opacity] duration-150 ease-in-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 [[data-gamepad-focused]_&]:translate-y-0 [[data-gamepad-focused]_&]:opacity-100"
              aria-hidden="true"
            >
              <p className="line-clamp-2 text-[11px] leading-tight text-white/90">{hoverInfo}</p>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Achado do critico-layout-biblioteca (2026-09-06): com a
              credencial do IGDB suspensa (docs/roadmap.md), este placeholder
              deixou de ser exceção rara e virou o estado padrão de boa parte
              da biblioteca — trinta retângulos cinza idênticos lado a lado
              liam como "biblioteca quebrada", não "sem capa ainda". Um
              gradiente com a cor de identidade do console (mesma variável
              que o badge/glow já usam) dá variedade sem asset novo nenhum;
              30% de opacidade que se dissolve a partir de um canto, não um
              tingimento parelho — some antes de competir com a sigla ou
              reprovar contraste, porque só o fundo muda, o texto continua
              `text-muted`/branco como já era. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 25% 15%, color-mix(in srgb, var(--console-accent, var(--accent)) 30%, transparent), transparent 70%)",
            }}
            aria-hidden="true"
          />
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
            <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/60 group-hover:flex group-focus-visible:flex [[data-gamepad-focused]_&]:flex">
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
                  aria-label={t("playGame", { title: title ?? label })}
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
  const t = useT(dict);
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={favorite ? t("removeFavorite") : t("addFavorite")}
      title={favorite ? t("removeFavorite") : t("addFavorite")}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      // `hover:brightness-125` no estado favoritado (achado testando com o
      // Douglas, 2026-09-06): só o ramo "não favoritado" tinha `hover:` —
      // passar o mouse sobre uma estrela já preenchida não mudava nada,
      // parecia ícone decorativo em vez de alternável.
      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
        favorite
          ? "border-amber bg-black/60 text-amber hover:brightness-125"
          : "border-line-strong bg-black/60 text-muted hover:text-ink"
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
  const t = useT(dict);
  if (totalPages <= 1) return null;
  return (
    <div className="mt-6 flex items-center justify-center gap-3">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t("previousPage")}
      </Button>
      <span className="font-mono text-sm text-muted">
        {t("pageIndicator", { page, totalPages })}
      </span>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        {t("nextPage")}
      </Button>
    </div>
  );
}

/**
 * Barra de progresso — mesmo vocabulário do wireframe (`.bar`/`.bar span`).
 * `percent` ausente (tamanho total desconhecido, `Job.total_bytes === 0`)
 * mostra a barra indeterminada em vez de fingir 0% ou 100%.
 */
export function ProgressBar({
  percent,
  label,
  className = "",
}: {
  percent: number | null;
  /** O que esta barra mede. Sem isto, várias barras na mesma tela são
   *  indistinguíveis para quem usa leitor de tela — o caso concreto é a
   *  grade de cores do RetroArch, com uma barra por core baixando. */
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-sm border border-line ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent ?? undefined}
      aria-valuemin={percent === null ? undefined : 0}
      aria-valuemax={percent === null ? undefined : 100}
    >
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
      className="fixed right-4 bottom-4 z-40 w-72 rounded-lg border border-line bg-fill p-3 shadow-lg"
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
 * Mesmo peso visual do `InlineError`, mas âmbar e `role="status"` — para o
 * caso em que a ação até funcionou, só ficou uma ressalva (hoje: um core do
 * RetroArch instalado sem confirmar a soma de verificação contra esta versão
 * do ZeuX). Vermelho aqui seria mentira: nada falhou.
 */
export function InlineWarning({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-sm border-l-2 border-amber bg-amber-bg px-2 py-1.5 text-sm text-ink ${className}`}
    >
      <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber" aria-hidden="true" />
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
  // A11y 2.3.3: sob `prefers-reduced-motion: reduce`, o bloco global em
  // src/index.css troca o pulso do `animate-pulse` por `opacity: 0.6` fixo —
  // o skeleton continua perceptível como "carregando", só não pisca.
  return <div aria-hidden="true" className={`animate-pulse rounded-lg border border-line-strong bg-fill ${className}`} />;
}

/**
 * N11 (docs/roadmap.md, Sprint N): mesmo painel tracejado + ação primária
 * que `AllGamesScreen` já usava para "biblioteca vazia" (M12), extraído
 * daqui pra não duplicar em toda tela que precisar do mesmo tratamento.
 * `action` fica de fora quando a tela já tem a ação em outro lugar visível
 * (ex.: `GamesScreen` sempre mostra "Voltar à biblioteca" no cabeçalho).
 */
/**
 * Estado vazio (reescrito 2026-09-09, direção retrô do CLAUDE.md).
 *
 * O que tinha antes: `<img opacity-15>` + `<p text-base text-muted>` — nenhum
 * texto em `--ink`, nenhum degrau de hierarquia, a marca borrada e quase
 * invisível. E `AllGamesScreen` empurrava um `<ol>` de três passos pela prop
 * `action`, que não é o lugar dele.
 *
 * Agora a anatomia é explícita: `kicker` (mono, ciano — "aqui o sistema
 * informa", padrão dos kickers de onboarding), `title` (o degrau que faltava,
 * em `--ink`), `message` (corpo, `--muted`, régua curta), `steps` (o `<ol>`
 * que era gambiarra) e `action`. A moldura ganha a marca em pixel art de
 * verdade (`ZeuXMark`, `pixelated`) atrás de tudo, com scanlines e um halo
 * roxo — o mesmo material de `AmbientGlow`/`SplashScreen`, não uma linguagem
 * nova.
 *
 * `variant="inline"`: sem marca, sem altura mínima, só a caixa tracejada com
 * título e mensagem — para o vazio de uma seção dentro de uma tela que já tem
 * conteúdo, onde o painel cheio de 420px seria exagero.
 */
export function EmptyState({
  kicker,
  title,
  message,
  steps,
  action,
  variant = "panel",
}: {
  kicker?: string;
  title: string;
  message?: string;
  /** Passos curtos ("aponte uma pasta…") — vira um `<ol>` numerado. */
  steps?: string[];
  action?: ReactNode;
  variant?: "panel" | "inline";
}) {
  if (variant === "inline") {
    return (
      <div className="rounded-lg border border-dashed border-control-border px-5 py-6 text-center">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {message && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{message}</p>}
        {action && <div className="mt-3 flex justify-center">{action}</div>}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[420px] flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-control-border px-6 py-12 text-center">
      {/* Camadas de fundo — decorativas, `aria-hidden`, nunca sobre o texto
          medido: o halo é radial e a 12%, a grade de pixels a 3%, as
          scanlines só sobre a própria marca. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 45% at 50% 38%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%)",
        }}
      />
      <div aria-hidden="true" className="zeux-pixel-grid pointer-events-none absolute inset-0" />

      <div aria-hidden="true" className="relative mb-5 opacity-35">
        <ZeuXMark size={96} />
        <div className="zeux-scanlines pointer-events-none absolute inset-0 opacity-70" />
      </div>

      <div className="relative flex flex-col items-center gap-2">
        {kicker && (
          <p className="font-mono text-xs tracking-[0.2em] text-accent-secondary uppercase">{kicker}</p>
        )}
        <p className="text-lg font-semibold text-ink">{title}</p>
        {message && <p className="max-w-md text-sm text-muted">{message}</p>}

        {steps && steps.length > 0 && (
          <ol className="mt-2 max-w-md list-none space-y-2 text-left text-sm text-muted">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-control-border font-mono text-xs text-ink"
                >
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}

        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

// `level` é chave de enum (inglês/sem acento, ver CLAUDE.md: "chaves de JSON
// e valores de enum ficam em inglês/sem acento") — o texto que o usuário lê é
// sempre resolvido por este hook, nunca lido direto da chave. Antes era um
// objeto estático `LEVEL_LABEL` em português fixo; virou hook porque o rótulo
// muda com o idioma escolhido (`useT` precisa do contexto de locale).
export function useLevelLabel(): (level: ConsoleVerdict["level"]) => string {
  const t = useT(dict);
  const labels: Record<ConsoleVerdict["level"], string> = {
    otimo: t("levelOtimo"),
    bom: t("levelBom"),
    limitado: t("levelLimitado"),
    improvavel: t("levelImprovavel"),
  };
  return (level) => labels[level];
}

/**
 * Cartão de parecer por console — extraído de VerdictScreen (2026-08-04) para
 * ser reaproveitado também dentro de `ConsoleInfoModal` (Emuladores): mesmo
 * dado, mesma regra ("texto descritivo, nunca julgador", bottlenecks nomeando
 * o componente que barra), duas telas diferentes.
 */
export function ConsoleVerdictCard({ verdict }: { verdict: ConsoleVerdict }) {
  const t = useT(dict);
  const levelLabel = useLevelLabel();
  const isGoodTier = verdict.level === "otimo" || verdict.level === "bom";
  // N12 (docs/roadmap.md, Sprint N): mesmo tratamento que `EmulatorCard`
  // (src/screens/EmulatorsScreen.tsx) já usa — borda esquerda de 3px na cor
  // de `consoleAccentColor`. Antes, esta era a única grade de cards do app
  // sem a cor de identidade que M10 introduziu — 33+ cards visualmente
  // idênticos, cinza, diferindo só pelo texto.
  const accent = consoleAccentColor(verdict.console_id);

  return (
    // `filled` como todo card do app — era o último `<Card>` sem a prop, e
    // sem ela este card ficava um degrau de superfície abaixo dos vizinhos na
    // mesma tela (ver a escada de superfícies em src/index.css).
    <Card filled className="flex flex-col gap-2" style={{ borderLeftColor: accent, borderLeftWidth: 3 }}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">{verdict.name}</p>
        <Badge variant={isGoodTier ? "solid" : "default"}>{levelLabel(verdict.level)}</Badge>
      </div>

      {/* `headline` vem de `Level.Headline()` — é o mesmo texto para TODO
          console do mesmo patamar (33 consoles, 4 patamares possíveis). Numa
          tela com vários cards "ótimo" lado a lado, essa repetição treinava o
          olho a pular o bloco inteiro — e o preset, que é a informação que
          de fato muda por console, tinha exatamente o mesmo peso visual
          (`text-sm text-muted`) que essa frase fixa. Achado de design ao
          testar com o Douglas (2026-09-06): reduzido para legenda (`text-xs`)
          e o preset promovido a `text-ink`/`font-medium`, que é o único dos
          dois que carrega decisão real do hardware da pessoa. */}
      <p className="text-xs text-muted">{verdict.headline}</p>

      {verdict.preset && (
        <p className="text-sm font-medium text-ink">
          {verdict.emulator} · {verdict.preset}
        </p>
      )}

      {/* Q3 (docs/roadmap.md, Sprint Q): o preset do catálogo é calibrado para
          1080p, e numa tela menor a resolução interna cai junto. A nota
          aparece porque, sem ela, o texto do preset ("Resolução interna 4x")
          contradiria o que o ZeuX vai realmente aplicar. */}
      {verdict.display_note && <p className="text-xs text-muted">{verdict.display_note}</p>}

      {verdict.precision === "parcial" && (
        <PartialNotice>
          {t("partialPrecisionMessage")}
        </PartialNotice>
      )}

      {verdict.bottlenecks && verdict.bottlenecks.length > 0 && (
        <Callout label={t("bottleneckLabel")}>
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
// telas. Mapa pequeno, pros casos que colidem de verdade ou que o
// `slice(0, 4)` deixa ambíguo sem colidir com ninguém; o resto continua
// caindo no `slice(0, 4)` de sempre.
const ICON_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  gb: "GB", // short_name é "Game Boy" por inconsistência com gba/gbc (já abreviados) — "GB" também resolve isso
  gamegear: "GG", // abreviação comum em comunidade retro
  gamecube: "GC", // idem
  xbox360: "X360", // `xbox` sozinho continua "XBOX" (slice normal, sem entrada aqui)
  // Sem override, "Sega CD".slice(0, 4) daria "SEGA" — não colide com
  // ninguém, mas parece sigla genérica da Sega (poderia ser Master
  // System, 32X, Saturn). "SCD" é a abreviação usada pela própria
  // comunidade retro para esse console, sem PNG de logo do IGDB.
  segacd: "SCD",
};

/**
 * Resolve a sigla que os ícones de console mostram — extraído de dentro de
 * `ConsoleIcon` (2026-09-07) para `ConsolesScreen` poder desenhar seu
 * próprio tile clicável (não pode aninhar o `<button>` de `ConsoleIcon`
 * dentro de outro `<button>`, HTML inválido) sem duplicar o mapa de
 * exceções. Mesma regra de sempre: overrides pros 4 casos que colidem de
 * verdade, `slice(0, 4)` pro resto.
 */
export function consoleIconLabel(consoleId: string, label: string): string {
  return (ICON_LABEL_OVERRIDES[consoleId] ?? label.slice(0, 4)).toUpperCase();
}

/**
 * `ConsoleIcon` (2026-09-07: passou a tentar a logo real primeiro, achado do
 * Douglas — "os consoles deveriam ter o mesmo ícone aqui do que tem na aba
 * Consoles"). Antes só desenhava a sigla, mesmo para os 30 de 33 consoles
 * que já têm logo oficial embutida (`cmd/generate-console-images`,
 * `ConsolesScreen` já usa) — as duas telas mostravam identidades diferentes
 * para o mesmo console. Sem `has_image` aqui (esse campo só vem de
 * `GET /consoles`, que nem toda tela que usa `ConsoleIcon` busca): tenta a
 * imagem direto e cai pra sigla no `onError` — mesmo efeito prático que
 * `ConsolesScreen` obtém checando `has_image` antes, só que sem precisar de
 * uma segunda chamada de API só pra isso. Onde a imagem falha, é 1 request
 * 404 por ícone, não um estado quebrado visível.
 *
 * Fundo branco atrás da logo, não `--fill` (2026-09-07, achado do Douglas:
 * "a visibilidade do console está difícil... muita cor escura, talvez um
 * fundo branco seja o ideal"). A maioria das logos que o IGDB devolve (a da
 * Nintendo incluída) foi desenhada pra selo/embalagem em fundo claro — sobre
 * o `--fill` quase preto do tema, a arte escura da própria logo se perdia
 * dentro do próprio ícone. Só entra quando a imagem carrega: a sigla
 * (`imageFailed`) continua sobre `--fill`, porque essa foi desenhada com a
 * cor de acento em mente para fundo escuro, e um branco atrás dela
 * desligaria o contraste que já funciona.
 */
export function ConsoleIcon({ label, consoleId, onClick }: { label: string; consoleId: string; onClick: () => void }) {
  const accent = consoleAccentColor(consoleId);
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{ borderColor: `${accent}66`, color: accent, backgroundColor: imageFailed ? undefined : "#fff" }}
      // M7 (docs/sprint-m-plano.md): 8px violava o piso de 11px da fonte
      // pixel (src/index.css) — mesma regra do badge de GameCover.
      //
      // `w-12` (não `w-9`, achado ao testar com o Douglas, 2026-09-06):
      // medido ao vivo com Playwright, `label.slice(0, 4)` em Press Start 2P
      // 11px renderiza ~41px de largura — a caixa de 36px que existia antes
      // ficava 5px curta, e um `w-10` (40px) intermediário ainda cortava a
      // primeira/última letra. O G5 (docs/roadmap.md) só travou colisão de
      // SIGLA IGUAL entre dois consoles diferentes (script comparando
      // strings), nunca mediu se o texto cabia na própria caixa —
      // "arcade"/"atari2600"/"dreamcast" (e qualquer outro console cujo
      // `short_name` não caiba em 3 letras e não tenha entrada em
      // `ICON_LABEL_OVERRIDES`) vazava sobre o ícone vizinho, sem colidir em
      // sigla nenhuma. `overflow-hidden` fica como rede de segurança: um
      // label futuro ainda maior corta em vez de vazar.
      //
      // `h-16 w-16` (era `h-12 w-12`): achado do Douglas testando a logo
      // nova, 2026-09-07 — "os ícones pequenos, queria mais destaque". A
      // sigla de texto continua no mesmo `text-[11px]` (ela só precisava
      // caber, não precisa crescer); é a caixa ao redor — e a logo dentro
      // dela — que ganham presença.
      className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-fill font-pixel text-[11px] leading-none transition-colors hover:brightness-125 ${FOCUS_RING}`}
    >
      {imageFailed ? (
        consoleIconLabel(consoleId, label)
      ) : (
        <img
          src={consoleImageURL(consoleId)}
          alt=""
          // Decorativo: `title` do botão já carrega o nome do console.
          aria-hidden="true"
          className="h-14 w-14 object-contain p-0.5"
          onError={() => setImageFailed(true)}
        />
      )}
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
    // `h-12 w-12` acompanha o `ConsoleIcon` acima (2026-09-06, ver comentário
    // lá) — os dois convivem na mesma fileira, tamanhos diferentes
    // desalinhariam a grade.
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-line-strong text-sm text-muted"
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
  const t = useT(dict);
  const levelLabel = useLevelLabel();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-md rounded-lg border border-line bg-fill p-5 ring-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <DialogTitle className="text-lg font-semibold text-ink">{verdict?.name ?? fallbackName}</DialogTitle>
            {verdict?.year && <p className="text-sm text-muted">{verdict.year}</p>}
          </div>
          {verdict && (
            <Badge variant={verdict.level === "otimo" || verdict.level === "bom" ? "solid" : "default"}>
              {levelLabel(verdict.level)}
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
              <Callout label={t("externalDependency")}>
                {t("externalDependencyMessage")}
              </Callout>
            )}

            {verdict.bottlenecks && verdict.bottlenecks.length > 0 && (
              <Callout label={t("bottleneckLabel")}>
                <ul className="list-disc space-y-1 pl-4">
                  {verdict.bottlenecks.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </Callout>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">{t("noConsoleVerdictYet")}</p>
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="primary" autoFocus onClick={onClose}>
            {t("close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
