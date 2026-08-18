import type { ReactNode } from "react";
import { Cpu, Gamepad2, LayoutGrid, Settings } from "lucide-react";
import logoZeux from "../assets/logo-zeux.png";
import { FOCUS_RING } from "./ui";

export type NavID = "library" | "emulators" | "verdict" | "settings";

// N14 (docs/roadmap.md, Sprint N): os 4 ícones eram SVG desenhado à mão —
// decisão do Douglas: lucide-react (já dependência via ui/dialog.tsx e
// ui/select.tsx) vira a família padrão do app.
const NAV_ITEMS: { id: NavID; label: string; icon: ReactNode }[] = [
  {
    id: "library",
    label: "Biblioteca",
    icon: <LayoutGrid size={18} aria-hidden="true" />,
  },
  {
    id: "emulators",
    label: "Emuladores",
    icon: <Gamepad2 size={18} aria-hidden="true" />,
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
    icon: <Cpu size={18} aria-hidden="true" />,
  },
  {
    id: "settings",
    // Item novo (2026-08-05, G1): reabre de propósito a decisão 4 do plano
    // de migração visual, que travava a sidebar em 3 itens — aprovado pelo
    // Douglas nesta sessão para dar lugar a "conectar conta do IGDB", sem
    // uma tela nem um modal específicos para isso antes.
    label: "Configurações",
    icon: <Settings size={18} aria-hidden="true" />,
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
 * também abre por `:focus-within`, então quem navega só por teclado/D-pad
 * chega ao mesmo texto completo que quem usa mouse).
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
        // N17 (docs/roadmap.md, Sprint N): `w-60` media o rótulo em Press
        // Start 2P (pixel font, larga e pesada para 14 caracteres — motivo
        // documentado de a sidebar precisar de tanta largura pra caber
        // "Especificações"). O rótulo saiu do `font-pixel` (abaixo) — em
        // Inter 13px/medium, a mesma palavra estimada em ~110-130px (não
        // remedido ao vivo, sem GUI neste ambiente — Douglas, confirme e
        // ajuste `w-52`/`w-56` se cortar). `w-52` (208px) = 64px do ícone +
        // ~130px de folga pro texto mais longo, teto ainda menor que antes.
        className={`absolute inset-y-0 left-0 z-20 flex w-16 flex-col items-center overflow-hidden border-r border-line bg-panel py-5 transition-[width] duration-150 ease-in-out group-hover:w-52 group-hover:shadow-xl group-focus-within:w-52 group-focus-within:shadow-xl`}
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
                    padrão de contornar isso.
                    N17 (docs/roadmap.md, Sprint N): saiu do `font-pixel` —
                    pixel font é tempero de marca (logo, badge, contador),
                    não rótulo de navegação; em 14 caracteres ficava largo e
                    pesado, e era o motivo da sidebar precisar de tanta
                    largura (ver comentário no painel acima). */}
                <span className="max-w-0 overflow-hidden text-[13px] font-medium whitespace-nowrap tracking-wide opacity-0 transition-all duration-150 ease-in-out group-hover:max-w-[144px] group-hover:opacity-100 group-focus-within:max-w-[144px] group-focus-within:opacity-100">
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
