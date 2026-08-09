import type { ReactNode } from "react";
import logoZeux from "../assets/logo-zeux.png";
import { FOCUS_RING } from "./ui";

export type NavID = "library" | "emulators" | "verdict" | "settings";

const NAV_ITEMS: { id: NavID; label: string; icon: ReactNode }[] = [
  {
    id: "library",
    label: "Biblioteca",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="6" height="6" fill="currentColor" />
        <rect x="11" y="1" width="6" height="6" fill="currentColor" />
        <rect x="1" y="11" width="6" height="6" fill="currentColor" />
        <rect x="11" y="11" width="6" height="6" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "emulators",
    label: "Emuladores",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="4" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="2" />
        <rect x="5" y="8" width="2" height="2" fill="currentColor" />
        <rect x="11" y="8" width="2" height="2" fill="currentColor" />
        <rect x="8" y="6" width="2" height="2" fill="currentColor" />
        <rect x="8" y="10" width="2" height="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "verdict",
    // Sigla "ESP" derivada por slice(0,3) existiu aqui entre 2026-08-04 e
    // 2026-08-07 (M13, docs/sprint-m-plano.md) — revertida porque não
    // comunicava nada ("ESP" não lê como "Especificações") e "CON" (item
    // abaixo teria a mesma sigla que a própria palavra "console", onipresente
    // nesta tela). A sidebar agora expande no hover/foco e mostra o `label`
    // completo em vez de qualquer sigla.
    label: "Especificações",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="3" y="1" width="12" height="16" rx="1" stroke="currentColor" strokeWidth="2" />
        <path d="M6 9 L8 11 L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "settings",
    // Item novo (2026-08-05, G1): reabre de propósito a decisão 4 do plano
    // de migração visual, que travava a sidebar em 3 itens — aprovado pelo
    // Douglas nesta sessão para dar lugar a "conectar conta do IGDB", sem
    // uma tela nem um modal específicos para isso antes.
    label: "Configurações",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
        <path
          d="M9 1.5 L9 3.2 M9 14.8 L9 16.5 M16.5 9 L14.8 9 M3.2 9 L1.5 9 M14.3 3.7 L13.1 4.9 M4.9 13.1 L3.7 14.3 M14.3 14.3 L13.1 13.1 M4.9 4.9 L3.7 3.7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

/**
 * Shell de navegação de topo (2026-08-04, Sprint 1 do plano de migração
 * visual — ver /home/douglas/.claude/plans/sleepy-roaming-pearl.md).
 * Substitui os botões de navegação cruzada que cada tela pós-onboarding
 * carregava no próprio topo — a sidebar centraliza "onde estou" num só
 * lugar.
 *
 * Inspirado em layout/src/App.tsx (Sidebar, linhas 280-310), mas com
 * componente próprio usando tokens de src/index.css, não inline style com
 * hex fixo, e sem o item "Comunidade"/"Perfil" nem o avatar decorativo do
 * mockup — Comunidade/Perfil dependem de um backend na nuvem que não existe
 * ainda (docs/roadmap.md, Sprint E), e não entram nestes sprints.
 *
 * "Biblioteca" cobre 3 fases da máquina de estados de App.tsx (all-games,
 * library, games) — pastas por console e jogos de um console são
 * sub-telas alcançadas de dentro da Biblioteca, não itens de sidebar
 * próprios (decisão de produto do plano).
 *
 * M13 (docs/sprint-m-plano.md, 2026-08-07, decidido pelo Douglas: "rail que
 * expande"): recolhida, mostra só o ícone (`w-16`, a mesma largura de
 * sempre); no hover **ou** foco de teclado/gamepad, expande e revela o
 * `item.label` inteiro — nada de sigla derivada em nenhum dos dois estados
 * (ADR 0009, "nenhuma ação existe apenas em hover": o painel expandido
 * também abre por foco, então quem navega só por teclado/D-pad chega ao
 * mesmo texto completo que quem usa mouse).
 *
 * **Achado pelo Douglas em 2026-08-08, corrigido no mesmo dia:** a primeira
 * versão disparava a expansão em `group-focus-within`, que reage a
 * **qualquer** foco — inclusive o foco que o próprio `<button>` recebe
 * depois de um clique de mouse normal (comportamento padrão do navegador,
 * não bug do ZeuX). Resultado: clicar num item da sidebar deixava o painel
 * expandido **preso aberto**, cobrindo o conteúdo, até o usuário focar outra
 * coisa. Trocado para `group-has-[:focus-visible]`: `:focus-visible` é a
 * mesma heurística do navegador que já rege `FOCUS_RING` no resto do app —
 * verdadeira só quando o foco chegou por teclado/gamepad (ou
 * `element.focus()` programático), falsa depois de um clique de mouse.
 * Confirmado ao vivo (Playwright): `document.activeElement.matches(
 * ':focus-visible')` é `false` logo após clicar um item, `true` logo após
 * `Tab` — o painel agora só fica preso aberto na segunda situação, que é
 * exatamente a que precisa (ADR 0009).
 *
 * A expansão é `position: absolute`, sobreposta ao conteúdo — **nunca**
 * `position: static` empurrando `<main>`. É o mesmo risco de refluxo que o
 * `CLAUDE.md` já registra para breakpoints: se a sidebar expandida mudasse a
 * largura real da área de conteúdo (`flex-1` em `App.tsx`), os breakpoints
 * de coluna da grade (M3/M15) disparariam de novo a cada passada de mouse. O
 * `<aside>` externo continua `w-16` fixo no fluxo do flexbox — é só o painel
 * absoluto por dentro que cresce, sem afetar a largura que `<main>` calcula.
 */
export function Sidebar({ active, onNav }: { active: NavID; onNav: (id: NavID) => void }) {
  return (
    // `w-16` aqui é o que participa do `flex` de App.tsx — nunca muda. `group`
    // e `relative` existem só para ancorar e disparar o painel absoluto abaixo.
    <aside className="group relative h-screen w-16 shrink-0">
      <div
        // `w-60`, não `w-48`: medido ao vivo (Playwright) — "Especificações"
        // (o rótulo mais longo) precisa de ~158px, e o slot do ícone já
        // consome 64px; `w-48` (192px) cortava as duas palavras mais longas
        // no meio.
        className={`absolute inset-y-0 left-0 z-20 flex w-16 flex-col items-center overflow-hidden border-r border-line bg-panel py-5 transition-[width] duration-150 ease-in-out group-hover:w-60 group-hover:shadow-xl group-has-[:focus-visible]:w-60 group-has-[:focus-visible]:shadow-xl`}
      >
        <div className="mb-7 shrink-0" aria-hidden="true">
          <img src={logoZeux} alt="" width={36} height={36} className="object-contain" />
        </div>

        <nav className="flex w-full flex-1 flex-col" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNav(item.id)}
                title={item.label}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-[52px] w-full items-center border-l-2 transition-colors ${FOCUS_RING} ${
                  isActive
                    ? "border-accent bg-fill text-accent"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {/* Slot de largura fixa igual à sidebar recolhida (`w-16`) —
                    o ícone nunca muda de posição horizontal entre os dois
                    estados, só o texto aparece ao lado quando expande. */}
                <span className="flex w-16 shrink-0 items-center justify-center">{item.icon}</span>
                {/* `max-w`/`opacity`, não `hidden`: precisa transicionar
                    suavemente (mesmo padrão de duração de `GameCover`), e
                    `width: auto` não anima em CSS — a técnica de "chutar" um
                    teto de largura maior que qualquer rótulo real é o jeito
                    padrão de contornar isso. */}
                <span className="max-w-0 overflow-hidden font-pixel text-[11px] whitespace-nowrap tracking-wide opacity-0 transition-all duration-150 ease-in-out group-hover:max-w-[176px] group-hover:opacity-100 group-has-[:focus-visible]:max-w-[176px] group-has-[:focus-visible]:opacity-100">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
