import { useState } from "react";
import { consoleImageURL } from "../api";
import { useT } from "../i18n/i18n";
import { consoleAccentColor } from "../lib/consoleColor";
import { consoleIconLabel, FOCUS_RING } from "./ui";
import { dict } from "./ConsoleRail.i18n";

/**
 * Trilho de consoles da Home (2026-09-11, padrão do mockup H escolhido pelo
 * Douglas).
 *
 * Não substitui nem duplica a `Sidebar`: a sidebar é navegação do app
 * ("Biblioteca", "Consoles", "Histórico"…) e vale em toda tela; o trilho é
 * **filtro de conteúdo desta tela** — escolher qual prateleira aparece.
 * Avaliamos trocar a sidebar por ele, como o mockup faz, e não trocamos: o
 * mockup é uma tela só, o app tem doze, e o trilho só sabe falar de consoles
 * que o usuário já configurou — as outras telas perderiam a navegação.
 *
 * Só entram consoles que o usuário já começou (mesma regra da prateleira em
 * `HomeScreen`), porque um trilho com os 33 do catálogo viraria a tela
 * "Consoles" de novo.
 *
 * Largura em px fixo é deliberada e cabe na exceção do CLAUDE.md (chrome de
 * ícone, como a sidebar `w-16`): o pino é uma caixa de logo de tamanho de
 * desenho, não área que deveria crescer com a janela. Quem cresce é a coluna
 * de prateleiras ao lado.
 */
export function ConsoleRail({
  consoles,
  selected,
  onSelect,
}: {
  consoles: { consoleId: string; shortName: string; name: string; gameCount: number | null }[];
  /** `null` = "TUDO" (nenhum filtro). */
  selected: string | null;
  onSelect: (consoleId: string | null) => void;
}) {
  const t = useT(dict);
  return (
    <nav
      aria-label={t("railLabel")}
      // Horizontal e rolável enquanto a coluna não existe (janela estreita);
      // vertical a partir de `md`, onde ela vira coluna de verdade na grade
      // da Home.
      className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:pb-0"
    >
      <RailPin
        label={t("all")}
        title={t("allTitle")}
        active={selected === null}
        accent="var(--accent)"
        onClick={() => onSelect(null)}
      />
      {consoles.map((c) => (
        <RailPin
          key={c.consoleId}
          consoleId={c.consoleId}
          label={consoleIconLabel(c.consoleId, c.shortName)}
          title={c.gameCount === null ? c.name : `${c.name} — ${t("gamesCount", { count: c.gameCount })}`}
          count={c.gameCount}
          active={selected === c.consoleId}
          accent={consoleAccentColor(c.consoleId)}
          onClick={() => onSelect(selected === c.consoleId ? null : c.consoleId)}
        />
      ))}
    </nav>
  );
}

function RailPin({
  consoleId,
  label,
  title,
  count,
  active,
  accent,
  onClick,
}: {
  consoleId?: string;
  label: string;
  title: string;
  count?: number | null;
  active: boolean;
  accent: string;
  onClick: () => void;
}) {
  // Mesma estratégia do `ConsoleIcon`: tenta a logo embutida e cai na sigla
  // no `onError`, sem precisar de uma chamada extra só para saber se existe.
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = consoleId !== undefined && !imageFailed;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-current={active}
      style={{
        borderColor: active ? accent : "var(--line-strong)",
        // Bloco de cor generoso no pino ativo (pedido do Douglas: "um pouco
        // mais de cor"), não só o contorno fino que o app usava.
        backgroundColor: active ? `color-mix(in srgb, ${accent} 26%, var(--panel))` : "var(--panel)",
        boxShadow: active ? `0 0 18px -6px ${accent}` : undefined,
      }}
      className={`relative flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-[1.5px] transition duration-150 hover:brightness-125 ${FOCUS_RING}`}
    >
      {showImage ? (
        <img
          src={consoleImageURL(consoleId!)}
          alt=""
          aria-hidden="true"
          // Fundo branco pelo mesmo motivo do `ConsoleIcon`: as logos do IGDB
          // foram desenhadas para fundo claro.
          className="h-10 w-10 rounded-sm bg-white object-contain p-0.5"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="font-pixel text-[11px] leading-none" style={{ color: active ? "var(--ink)" : accent }}>
          {label}
        </span>
      )}
      {count !== null && count !== undefined && (
        <span className="font-mono text-[10px] leading-none text-muted tabular-nums">{count}</span>
      )}
    </button>
  );
}
