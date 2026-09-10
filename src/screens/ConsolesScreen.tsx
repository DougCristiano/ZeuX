import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api, ApiError } from "../api";
import type { ConsoleEntry, EmulatorEntry, LibraryFolder, Report, RetroArchCoreStatus } from "../api/types";
import {
  Button,
  CardSkeleton,
  EmptyState,
  FILTER_CHIP_BASE,
  FILTER_CHIP_OFF,
  FILTER_CHIP_ON,
  FOCUS_RING,
  InlineError,
  inputClass,
  ScreenContainer,
  ScreenHeader,
  SectionHeading,
} from "../components/ui";
import { ConsoleCard, type ConsoleCardSize } from "../components/ConsoleCard";
import {
  consoleFamily,
  consoleFamilyColor,
  type ConsoleFamily,
} from "../lib/consoleColor";
import {
  buildReadinessIndex,
  evaluateConsoleReadiness,
  type ConsoleReadiness,
  type ReadinessStep,
} from "../lib/consoleReadiness";
import { useT } from "../i18n/i18n";
import { dict } from "./ConsolesScreen.i18n";

// A régua de chips (`FILTER_CHIP_*`) mora em `components/ui` desde 2026-09-09.

// Época pela década de lançamento — recorte 100% no cliente, a partir de
// `entry.year`. Quatro faixas em vez de dez décadas: o catálogo tem 33
// consoles e uma faixa por década deixaria metade dos chips com um console só.
type EraId = "70s-80s" | "90s" | "2000s" | "2010+";

function consoleEra(year: number): EraId {
  if (year < 1990) return "70s-80s";
  if (year < 2000) return "90s";
  if (year < 2010) return "2000s";
  return "2010+";
}

const FAMILY_ORDER: ConsoleFamily[] = [
  "nintendo",
  "sony",
  "sega",
  "microsoft",
  "snk",
  "atari",
  "nec",
  "outros",
];

// Nomes de fabricante são nomes próprios — só "Outros" traduz. Manter fora do
// dicionário o que não muda entre idiomas evita oito chaves iguais dos dois
// lados.
const FAMILY_LABEL: Record<ConsoleFamily, string> = {
  nintendo: "Nintendo",
  sony: "Sony",
  sega: "Sega",
  microsoft: "Microsoft",
  snk: "SNK",
  atari: "Atari",
  nec: "NEC",
  outros: "",
};

const ERA_ORDER: EraId[] = ["70s-80s", "90s", "2000s", "2010+"];

interface Avaliado {
  entry: ConsoleEntry;
  readiness: ConsoleReadiness;
  hasFolder: boolean;
  gameCount: number | null;
}

/**
 * Tela de consoles (2026-08-28, a pedido do Douglas): a entrada principal é o
 * console, não o emulador. O eixo é **prontidão** — "o que falta para este
 * console rodar".
 *
 * 2026-09-09 (direção retrô/pixelada do CLAUDE.md, achados do crítico de
 * layout): a grade única sem hierarquia virou três faixas por engajamento —
 * **Prontos para jogar** (emulador de pé + pasta apontada), **Falta
 * configurar** (já começou: tem pasta ou emulador, mas falta uma peça) e
 * **Catálogo** (ainda não tocou). O card cresceu e passa a tratar a logo como
 * arte de sistema, sobre o gradiente na cor de identidade. A paginação saiu:
 * nunca disparava nos 33 itens e cortava as faixas ao meio.
 *
 * Quatro buscas de tela inteira, nenhuma por console: `GET /consoles`,
 * `GET /emulators`, `GET /retroarch/cores` e `GET /library/folders`. O
 * cruzamento vira índice uma vez (`buildReadinessIndex`). A contagem de jogos
 * por console é buscada só para os consoles que já têm pasta — `getLibraryGames`
 * por `console_id`, o mesmo caminho que `ConsoleDetailScreen` usa.
 *
 * `report` continua na assinatura por já ser exigido por telas irmãs e por
 * App.tsx; a prontidão não depende dele de propósito (`GET /consoles` não
 * exige consentimento, então a tela funciona inteira para quem recusou o scan).
 */
export function ConsolesScreen({
  onOpenConsole,
  onOpenEmulators,
}: {
  report?: Report;
  onOpenConsole: (consoleId: string, name: string, shortName: string) => void;
  onOpenEmulators: () => void;
}) {
  const t = useT(dict);
  const [consoles, setConsoles] = useState<ConsoleEntry[] | null>(null);
  const [emulators, setEmulators] = useState<EmulatorEntry[]>([]);
  const [cores, setCores] = useState<RetroArchCoreStatus[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [gameCounts, setGameCounts] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [readinessFilter, setReadinessFilter] = useState<ReadinessStep | "todos">("todos");
  const [familyFilter, setFamilyFilter] = useState<ConsoleFamily | null>(null);
  const [eraFilter, setEraFilter] = useState<EraId | null>(null);
  const [onlyWithGames, setOnlyWithGames] = useState(false);

  const READINESS_FILTERS: { id: ReadinessStep | "todos"; label: string }[] = [
    { id: "todos", label: t("filterAll") },
    { id: "pronto", label: t("filterReady") },
    { id: "sem-emulador", label: t("filterMissingEmulator") },
    { id: "sem-core", label: t("filterMissingCore") },
    { id: "sem-bios", label: t("filterMissingBios") },
    { id: "sem-pasta", label: t("filterMissingFolder") },
  ];

  useEffect(() => {
    // O catálogo é o único indispensável — falhar nele deixa a tela sem
    // conteúdo. Os outros três só enriquecem a prontidão.
    api
      .getConsoles()
      .then((res) => setConsoles(res.consoles))
      .catch((err) => setError(err instanceof ApiError ? err.message : t("errorLoadingConsoles")));

    api.getEmulators().then((res) => setEmulators(res.emulators)).catch(() => {});
    api.getRetroArchCores().then((res) => setCores(res.cores)).catch(() => {});
    api.getLibraryFolders().then((res) => setFolders(res.folders)).catch(() => {});
  }, [t]);

  // Contagem de jogos só para os consoles que já têm pasta — `getLibraryGames`
  // por `console_id`, o mesmo caminho de `ConsoleDetailScreen`. É um punhado
  // de chamadas (só os consoles configurados), não 33. Contagem é
  // conveniência: falhar numa não pode tirar o card do usuário.
  const consolesComPasta = useMemo(
    () => Array.from(new Set(folders.map((f) => f.console_id))),
    [folders],
  );

  useEffect(() => {
    let cancelado = false;
    for (const consoleId of consolesComPasta) {
      api
        .getLibraryGames(consoleId)
        .then((res) => {
          if (cancelado) return;
          setGameCounts((prev) => {
            const next = new Map(prev);
            next.set(consoleId, res.games.length);
            return next;
          });
        })
        .catch(() => {});
    }
    return () => {
      cancelado = true;
    };
  }, [consolesComPasta]);

  const index = useMemo(() => buildReadinessIndex(emulators, cores, folders), [emulators, cores, folders]);
  const folderSet = useMemo(() => new Set(consolesComPasta), [consolesComPasta]);

  const avaliados = useMemo<Avaliado[]>(
    () =>
      (consoles ?? []).map((entry) => ({
        entry,
        readiness: evaluateConsoleReadiness(entry, index),
        hasFolder: folderSet.has(entry.console_id),
        gameCount: gameCounts.has(entry.console_id) ? gameCounts.get(entry.console_id)! : null,
      })),
    [consoles, index, folderSet, gameCounts],
  );

  // Contagem por passo de prontidão, para a régua dizer quantos consoles têm
  // cada pendência antes do clique.
  const readinessCount = useMemo(() => {
    const out = new Map<ReadinessStep | "todos", number>([["todos", avaliados.length]]);
    for (const { readiness } of avaliados) {
      out.set(readiness.step, (out.get(readiness.step) ?? 0) + 1);
    }
    return out;
  }, [avaliados]);

  // Contagem por fabricante — sobre o catálogo inteiro, como a régua de
  // prontidão. Um fabricante sem nenhum console some da régua.
  const familyCount = useMemo(() => {
    const out = new Map<ConsoleFamily, number>();
    for (const { entry } of avaliados) {
      const fam = consoleFamily(entry.console_id);
      out.set(fam, (out.get(fam) ?? 0) + 1);
    }
    return out;
  }, [avaliados]);

  const anyFilterActive =
    search.trim() !== "" ||
    readinessFilter !== "todos" ||
    familyFilter !== null ||
    eraFilter !== null ||
    onlyWithGames;

  function clearFilters() {
    setSearch("");
    setReadinessFilter("todos");
    setFamilyFilter(null);
    setEraFilter(null);
    setOnlyWithGames(false);
  }

  const filtrados = avaliados.filter(({ entry, readiness, hasFolder }) => {
    if (readinessFilter !== "todos" && readiness.step !== readinessFilter) return false;
    if (familyFilter && consoleFamily(entry.console_id) !== familyFilter) return false;
    if (eraFilter && consoleEra(entry.year) !== eraFilter) return false;
    if (onlyWithGames && !hasFolder) return false;

    const termo = search.trim().toLowerCase();
    if (!termo) return true;
    return (
      entry.name.toLowerCase().includes(termo) ||
      entry.short_name.toLowerCase().includes(termo) ||
      entry.emulators.some((o) => o.name.toLowerCase().includes(termo))
    );
  });

  // As três faixas, por engajamento. "Falta configurar" é quem já começou —
  // apontou uma pasta ou instalou um emulador que serve — mas ainda tem uma
  // peça pendente. "Catálogo" é quem não tocou em nada.
  const prontos: Avaliado[] = [];
  const faltaConfigurar: Avaliado[] = [];
  const catalogo: Avaliado[] = [];
  for (const item of filtrados) {
    if (item.readiness.step === "pronto") {
      prontos.push(item);
    } else if (item.hasFolder || item.readiness.chosen) {
      faltaConfigurar.push(item);
    } else {
      catalogo.push(item);
    }
  }

  const cardLabels = {
    viewGames: t("viewGames"),
    gameCount: (count: number) =>
      count === 1 ? t("cardGameCountSingular", { count }) : t("cardGameCountPlural", { count }),
    noGames: t("cardNoGames"),
  };

  function renderSection(items: Avaliado[], titleKey: "sectionReady" | "sectionNeedsSetup" | "sectionCatalog", size: ConsoleCardSize, minCol: string) {
    if (items.length === 0) return null;
    return (
      <section className="mt-8 first:mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <SectionHeading>{t(titleKey)}</SectionHeading>
          <span className="font-mono text-xs text-muted tabular-nums">
            {items.length === 1
              ? t("sectionReadyCount", { count: items.length })
              : t("sectionReadyCountPlural", { count: items.length })}
          </span>
        </div>
        <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minCol}, 1fr))` }}>
          {items.map(({ entry, readiness, hasFolder, gameCount }) => (
            <ConsoleCard
              key={entry.console_id}
              entry={entry}
              readiness={readiness}
              size={size}
              hasFolder={hasFolder}
              gameCount={gameCount}
              labels={cardLabels}
              onOpen={() => onOpenConsole(entry.console_id, entry.name, entry.short_name)}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <ScreenContainer variant="listing">
      <ScreenHeader
        title={t("consoles")}
        subtitle={t("consolesDescription")}
        actions={
          <Button variant="chrome" onClick={onOpenEmulators}>
            {t("seeByEmulator")}
          </Button>
        }
      />

      {error && <InlineError>{error}</InlineError>}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="consoles-search" className="sr-only">
            {t("searchConsoleOrEmulator")}
          </label>
          <input
            id="consoles-search"
            type="text"
            name="consoles-search"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchConsoleOrEmulatorPlaceholder")}
            className={`${inputClass} max-w-xs`}
          />
          {anyFilterActive && (
            <button
              type="button"
              onClick={clearFilters}
              className={`${FILTER_CHIP_BASE} ${FILTER_CHIP_OFF} ${FOCUS_RING}`}
            >
              {t("clearFilters")}
            </button>
          )}
        </div>

        {/* Régua 1 — prontidão: "o que falta montar". */}
        <div className="flex flex-wrap gap-1.5">
          {READINESS_FILTERS.map((item) => {
            const total = readinessCount.get(item.id) ?? 0;
            if (item.id !== "todos" && total === 0) return null;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setReadinessFilter(item.id)}
                aria-pressed={readinessFilter === item.id}
                className={`${FILTER_CHIP_BASE} ${FOCUS_RING} ${
                  readinessFilter === item.id ? FILTER_CHIP_ON : FILTER_CHIP_OFF
                }`}
              >
                {item.label.toUpperCase()}
                <span className={`tabular-nums ${readinessFilter === item.id ? "text-accent" : "opacity-70"}`}>
                  {total}
                </span>
              </button>
            );
          })}
        </div>

        {/* Régua 2 — catálogo: fabricante, época e "tenho jogos". Separada da
            de cima de propósito: juntas virariam uma parede de doze chips onde
            "falta core" e "Sega" leriam como o mesmo tipo de recorte. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[11px] tracking-wide text-muted uppercase">{t("filterByMaker")}</span>
          {FAMILY_ORDER.map((fam) => {
            const total = familyCount.get(fam) ?? 0;
            if (total === 0) return null;
            const on = familyFilter === fam;
            const color = consoleFamilyColor(fam);
            return (
              <button
                key={fam}
                type="button"
                onClick={() => setFamilyFilter(on ? null : fam)}
                aria-pressed={on}
                // Chip de fabricante ativo pega a cor da família (a mesma fonte
                // que pinta os cards) — `var(--fam)` é a parte dinâmica, a
                // classe arbitrária compila normalmente.
                style={on ? ({ "--fam": color } as CSSProperties) : undefined}
                className={`${FILTER_CHIP_BASE} ${FOCUS_RING} ${
                  on
                    ? "border-[var(--fam)] bg-[color-mix(in_srgb,var(--fam)_14%,transparent)] text-ink shadow-[0_0_14px_-4px_var(--fam)]"
                    : FILTER_CHIP_OFF
                }`}
              >
                {(FAMILY_LABEL[fam] || t("familyOther")).toUpperCase()}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[11px] tracking-wide text-muted uppercase">{t("filterByEra")}</span>
          {ERA_ORDER.map((era) => {
            const on = eraFilter === era;
            const label = { "70s-80s": t("era70s80s"), "90s": t("era90s"), "2000s": t("era2000s"), "2010+": t("era2010plus") }[era];
            return (
              <button
                key={era}
                type="button"
                onClick={() => setEraFilter(on ? null : era)}
                aria-pressed={on}
                className={`${FILTER_CHIP_BASE} ${FOCUS_RING} ${on ? FILTER_CHIP_ON : FILTER_CHIP_OFF}`}
              >
                {label.toUpperCase()}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setOnlyWithGames((v) => !v)}
            aria-pressed={onlyWithGames}
            className={`${FILTER_CHIP_BASE} ${FOCUS_RING} ${onlyWithGames ? FILTER_CHIP_ON : FILTER_CHIP_OFF}`}
          >
            {t("filterOnlyWithGames").toUpperCase()}
          </button>
        </div>
      </div>

      {/* Legenda do pingo aceso — cor sozinha nunca é informação (WCAG 1.4.1). */}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full bg-accent-secondary shadow-[0_0_4px_var(--accent-secondary)]"
        />
        {t("readyLegend")}
      </p>

      {consoles === null && !error && (
        <div
          role="status"
          aria-live="polite"
          className="mt-6 grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}
        >
          <span className="sr-only">{t("loadingConsoles")}</span>
          {Array.from({ length: 12 }, (_, i) => (
            <CardSkeleton key={i} className="h-44" />
          ))}
        </div>
      )}

      {consoles !== null && filtrados.length === 0 && (
        <div className="mt-6">
          <EmptyState
            variant="inline"
            title={t("noConsolesFoundTitle")}
            message={t("noConsolesFound")}
            action={
              anyFilterActive ? (
                <Button variant="secondary" onClick={clearFilters}>
                  {t("clearFilters")}
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Card grande na faixa dos prontos (logo grande + contagem + "Ver
          jogos"), médio no "falta configurar", denso no catálogo. `auto-fill`
          nas três — imune à regra de breakpoint do CLAUDE.md. */}
      {renderSection(prontos, "sectionReady", "grande", "260px")}
      {renderSection(faltaConfigurar, "sectionNeedsSetup", "media", "210px")}
      {renderSection(catalogo, "sectionCatalog", "densa", "190px")}
    </ScreenContainer>
  );
}
