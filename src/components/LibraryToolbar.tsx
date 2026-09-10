import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Clock, EyeOff, FileX, LayoutGrid, List, Star } from "lucide-react";
import { consoleAccentColor } from "../lib/consoleColor";
import { useT } from "../i18n/i18n";
import { dict } from "./LibraryToolbar.i18n";
import {
  FILTER_CHIP_BASE,
  FILTER_CHIP_OFF,
  FILTER_CHIP_ON,
  FOCUS_RING,
  inputClass,
  ZSelect,
} from "./ui";
import { SelectItem } from "./ui/select";

export type SortValue = "recentes" | "titulo" | "tempo_jogado";
export type ViewMode = "grade" | "lista";
/** P/M/G — controla só quantas colunas a grade de capas tem. */
export type CoverDensity = "compacta" | "media" | "grande";

export const SORT_VALUES: readonly SortValue[] = ["recentes", "titulo", "tempo_jogado"];
export const VIEW_MODES: readonly ViewMode[] = ["grade", "lista"];
export const COVER_DENSITIES: readonly CoverDensity[] = ["compacta", "media", "grande"];

/**
 * Breakpoints por densidade. `media` é a régua que a Sprint O já validou
 * (nada muda para quem não mexer no controle); `compacta` e `grande` sobem e
 * descem uma faixa. Cada par é [largura mínima da JANELA, colunas] — mede a
 * janela inteira, não o container, porque é assim que os breakpoints do
 * Tailwind funcionam (CLAUDE.md, layout responsivo). `lg` (1024) em vez de
 * `xl` para a faixa do meio disparar de verdade no tamanho padrão de janela
 * (1280px) depois de descontar sidebar + barra de rolagem.
 */
const GRID_BREAKPOINTS: Record<CoverDensity, readonly [minWidth: number, columns: number][]> = {
  grande: [
    [2400, 7],
    [1536, 5],
    [1024, 4],
    [768, 3],
    [640, 2],
    [0, 2],
  ],
  media: [
    [2400, 9],
    [1536, 7],
    [1024, 5],
    [768, 4],
    [640, 3],
    [0, 2],
  ],
  compacta: [
    [2400, 12],
    [1536, 9],
    [1024, 7],
    [768, 5],
    [640, 4],
    [0, 3],
  ],
};

export function columnsForWidth(density: CoverDensity, width: number): number {
  for (const [min, columns] of GRID_BREAKPOINTS[density]) {
    if (width >= min) return columns;
  }
  return 2;
}

/** Colunas da grade para a densidade atual, recalculadas ao redimensionar a janela. */
export function useGridColumns(density: CoverDensity): number {
  const [columns, setColumns] = useState(() => columnsForWidth(density, window.innerWidth));
  useEffect(() => {
    function onResize() {
      setColumns(columnsForWidth(density, window.innerWidth));
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [density]);
  return columns;
}

// Persistência das preferências de tela (sort/modo/densidade) — as três
// precisam sobreviver a reabrir o app, diferente de busca/filtro. Mesmo
// mecanismo tolerante a localStorage indisponível das outras telas.
const SORT_KEY = "zeux.library.sort";
const VIEW_MODE_KEY = "zeux.library.viewMode";
const DENSITY_KEY = "zeux.library.coverDensity";

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // preferência de tela, não dado crítico — cai no padrão em silêncio.
  }
}

export const DEFAULT_SORT: SortValue = "recentes";
export const DEFAULT_VIEW_MODE: ViewMode = "grade";
export const DEFAULT_DENSITY: CoverDensity = "media";

export function loadStoredSort(): SortValue {
  return readStored(SORT_KEY, SORT_VALUES, DEFAULT_SORT);
}
export function loadStoredViewMode(): ViewMode {
  return readStored(VIEW_MODE_KEY, VIEW_MODES, DEFAULT_VIEW_MODE);
}
export function loadStoredDensity(): CoverDensity {
  return readStored(DENSITY_KEY, COVER_DENSITIES, DEFAULT_DENSITY);
}
export function persistLibraryView(patch: {
  sort?: SortValue;
  viewMode?: ViewMode;
  coverDensity?: CoverDensity;
}) {
  if (patch.sort) writeStored(SORT_KEY, patch.sort);
  if (patch.viewMode) writeStored(VIEW_MODE_KEY, patch.viewMode);
  if (patch.coverDensity) writeStored(DENSITY_KEY, patch.coverDensity);
}

type Toggle = { on: boolean; onToggle: () => void };

/**
 * Régua de controle da biblioteca: busca, ordenação, grade/lista, densidade
 * das capas e os toggles de filtro. Um só painel de chassi (borda + fundo
 * `--fill`), na altura de chrome de 36px (`h-9`), para os controles não
 * boiarem soltos entre a faixa de destaque e a grade.
 *
 * Os chips de plataforma são opcionais — a tela de UM console (`GamesScreen`)
 * não passa `platforms`, e a régua omite a fileira inteira. Não é sticky de
 * propósito: uma barra fixa passaria por cima do tile focado na navegação por
 * teclado/controle (WCAG 2.2, "focus not obscured").
 *
 * 2026-09-10 (achado do Douglas: "os filtros de console estão legais, mas a
 * estética não ficou legal, tem 3 linhas de filtro"): a fileira de chips de
 * plataforma virou rolagem horizontal (`overflow-x-auto` + `flex-nowrap`) em
 * vez de `flex-wrap` — antes, numa janela estreita ou com muitos consoles na
 * biblioteca, ela quebrava em 2-3 linhas com o mesmo peso visual da régua de
 * controle acima, competindo por atenção em vez de ficar claramente
 * subordinada. Agora ocupa no máximo uma linha sempre, com um rótulo
 * (`platformFilterLabel`) que a separa como "isto filtra o quê aparece",
 * diferente da régua de cima ("isto muda como aparece" — busca, ordem,
 * densidade). `-mx-3 px-3`: a rolagem chega até a borda do chassi sem cortar
 * o padding do container, mesmo truque de faixa horizontal que `HomeScreen`
 * usa na prateleira de consoles.
 */
export function LibraryToolbar({
  search,
  onSearch,
  sort,
  onSortChange,
  viewMode,
  onViewModeChange,
  coverDensity,
  onCoverDensityChange,
  favorites,
  missing,
  played,
  excluded,
  platforms,
  platformFilter,
  onPlatformFilterChange,
  matchCount,
}: {
  search: string;
  onSearch: (value: string) => void;
  sort: SortValue;
  onSortChange: (value: SortValue) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  coverDensity: CoverDensity;
  onCoverDensityChange: (value: CoverDensity) => void;
  favorites?: Toggle;
  missing?: Toggle;
  played?: Toggle;
  excluded?: Toggle;
  /** Ausente numa tela de console único — a fileira de chips de plataforma some. */
  platforms?: { id: string; label: string }[];
  platformFilter?: string | null;
  onPlatformFilterChange?: (id: string | null) => void;
  /** Contagem "N de M" da busca (telas de console único, que filtram no cliente). */
  matchCount?: { count: number; total: number };
}) {
  const t = useT(dict);

  return (
    <div className="mb-5 flex flex-col gap-2.5 rounded-lg border border-line bg-fill/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="library-search" className="sr-only">
          {t("searchPlaceholder")}
        </label>
        <input
          id="library-search"
          type="text"
          name="library-search"
          autoComplete="off"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className={`${inputClass} max-w-xs`}
        />

        <ZSelect
          ariaLabel={t("sortByLabel")}
          value={sort}
          onValueChange={(v) => onSortChange(v as SortValue)}
          className="w-fit"
        >
          {SORT_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(value === "recentes" ? "sortRecentes" : value === "titulo" ? "sortTitulo" : "sortTempoJogado")}
            </SelectItem>
          ))}
        </ZSelect>

        {/* Grade / lista — segmento de chassi, mesma linguagem dos chips. */}
        <div
          className="flex h-9 items-center gap-1 rounded-sm border-[1.5px] border-control-border p-0.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
          role="group"
          aria-label={t("viewModeLabel")}
        >
          {VIEW_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              aria-label={mode === "grade" ? t("gridMode") : t("listMode")}
              onClick={() => onViewModeChange(mode)}
              className={`flex h-full items-center gap-1.5 rounded-sm px-2.5 font-mono text-xs font-medium tracking-wider uppercase transition duration-150 active:translate-y-px ${FOCUS_RING} ${
                viewMode === mode ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
              }`}
            >
              {mode === "grade" ? <LayoutGrid size={12} aria-hidden="true" /> : <List size={12} aria-hidden="true" />}
              {mode === "grade" ? t("gridMode") : t("listMode")}
            </button>
          ))}
        </div>

        {/* Densidade — só faz sentido na grade; some no modo lista. */}
        {viewMode === "grade" && (
          <div
            className="flex h-9 items-center gap-1 rounded-sm border-[1.5px] border-control-border p-0.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
            role="group"
            aria-label={t("densityLabel")}
          >
            {COVER_DENSITIES.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={coverDensity === d}
                title={
                  d === "compacta"
                    ? t("densitySmallTitle")
                    : d === "media"
                      ? t("densityMediumTitle")
                      : t("densityLargeTitle")
                }
                onClick={() => onCoverDensityChange(d)}
                className={`h-full w-7 rounded-sm font-mono text-xs font-medium uppercase transition duration-150 active:translate-y-px ${FOCUS_RING} ${
                  coverDensity === d ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
                }`}
              >
                {d === "compacta" ? t("densitySmall") : d === "media" ? t("densityMedium") : t("densityLarge")}
              </button>
            ))}
          </div>
        )}

        {/* Divisor fino antes dos toggles de filtro (2026-09-10): separa
            "como a grade aparece" (busca, ordem, grade/lista, densidade — à
            esquerda) de "o que aparece nela" (favoritos/ausentes/jogado/
            oculto — à direita), que antes liam como um só bloco de sete
            controles do mesmo peso. */}
        {(favorites || missing || played || excluded) && (
          <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-line sm:block" />
        )}
        {favorites && (
          <Chip on={favorites.on} onToggle={favorites.onToggle} label={t("favoritesLabel")}>
            <Star size={11} fill={favorites.on ? "currentColor" : "none"} aria-hidden="true" />
          </Chip>
        )}
        {missing && (
          <Chip on={missing.on} onToggle={missing.onToggle} label={t("missingLabel")}>
            <FileX size={11} aria-hidden="true" />
          </Chip>
        )}
        {played && (
          <Chip on={played.on} onToggle={played.onToggle} label={t("playedLabel")}>
            <Clock size={11} aria-hidden="true" />
          </Chip>
        )}
        {excluded && (
          <Chip on={excluded.on} onToggle={excluded.onToggle} label={t("excludedLabel")}>
            <EyeOff size={11} aria-hidden="true" />
          </Chip>
        )}

        {matchCount && (
          <p
            aria-live="polite"
            className="font-mono text-xs tracking-wider text-muted uppercase tabular-nums"
          >
            {t("matchCount", { count: matchCount.count, total: matchCount.total })}
          </p>
        )}
      </div>

      {platforms && platforms.length > 1 && onPlatformFilterChange && (
        <div className="-mx-3 flex items-center gap-2 border-t border-line/60 px-3 pt-2.5">
          {/* Rótulo curto, fora da linha rolável: âncora visual que separa
              esta fileira ("filtra o quê aparece") da régua de controle
              acima ("muda como aparece") sem precisar de outro painel. */}
          <span className="shrink-0 font-mono text-[11px] tracking-wide text-muted uppercase">
            {t("platformFilterLabel")}
          </span>
          <div className="flex flex-nowrap gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => onPlatformFilterChange(null)}
              aria-pressed={platformFilter == null}
              className={`shrink-0 ${FILTER_CHIP_BASE} ${FOCUS_RING} ${platformFilter == null ? FILTER_CHIP_ON : FILTER_CHIP_OFF}`}
            >
              {t("allPlatforms")}
            </button>
            {platforms.map(({ id, label }) => {
              const active = platformFilter === id;
              const accent = consoleAccentColor(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onPlatformFilterChange(id)}
                  aria-pressed={active}
                  style={
                    active
                      ? ({
                          borderColor: accent,
                          background: `${accent}1a`,
                          boxShadow: `0 0 12px -4px ${accent}`,
                        } as CSSProperties)
                      : undefined
                  }
                  className={`shrink-0 ${FILTER_CHIP_BASE} ${FOCUS_RING} ${active ? "text-ink" : FILTER_CHIP_OFF}`}
                >
                  {label.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  on,
  onToggle,
  label,
  children,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`${FILTER_CHIP_BASE} ${FOCUS_RING} ${on ? FILTER_CHIP_ON : FILTER_CHIP_OFF}`}
    >
      {children}
      {label}
    </button>
  );
}
