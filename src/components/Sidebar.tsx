import type { ReactNode } from "react";
import logoZeux from "../assets/logo-zeux.png";
import { FOCUS_RING } from "./ui";

export type NavID = "library" | "emulators" | "verdict";

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
    // "ESP" (2026-08-04, a pedido do Douglas) — o label.slice(0,3) abaixo já
    // deriva a sigla certa a partir do nome completo, sem precisar de um
    // campo de sigla separado.
    label: "Especificações",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="3" y="1" width="12" height="16" rx="1" stroke="currentColor" strokeWidth="2" />
        <path d="M6 9 L8 11 L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
 */
export function Sidebar({ active, onNav }: { active: NavID; onNav: (id: NavID) => void }) {
  return (
    <aside className="flex h-screen w-16 shrink-0 flex-col items-center border-r border-line bg-panel py-5">
      <div className="mb-7" aria-hidden="true">
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
              className={`flex h-[52px] w-full flex-col items-center justify-center gap-1 border-l-2 transition-colors ${FOCUS_RING} ${
                isActive
                  ? "border-accent bg-fill text-accent"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {item.icon}
              <span className="font-pixel text-[11px] leading-none tracking-wide">{item.label.slice(0, 3).toUpperCase()}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
