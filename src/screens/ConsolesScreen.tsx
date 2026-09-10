import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  ScreenAtmosphere,
  ScreenContainer,
  ScreenHeader,
  SectionHeading,
  ZSelect,
} from "../components/ui";
import { SelectItem } from "../components/ui/select";
import { ConsoleCard, type ConsoleCardSize } from "../components/ConsoleCard";
import { consoleFamily, type ConsoleFamily } from "../lib/consoleColor";
import {
  buildReadinessIndex,
  evaluateConsoleReadiness,
  type ConsoleReadiness,
  type ReadinessStep,
} from "../lib/consoleReadiness";
import { useT } from "../i18n/i18n";
import { dict } from "./ConsolesScreen.i18n";

// A régua de chips (`FILTER_CHIP_*`) mora em `components/ui` desde 2026-09-09.

// Sentinela de "sem recorte" nos dois `<select>` de catálogo. O `Select` do
// Radix reserva a string vazia para "nenhum valor" e recusa `value=""` num
// item — daí um id explícito em vez de `""`.
const ANY = "todos";

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
 * 2026-09-10 (achado do Douglas, terceira rodada: "o filtro está quebrando",
 * "avalie usar select em vez de parede de chips", "repense onde vai cada peça,
 * o espaçamento, estilo e o UI/UX"). O que mudou e o porquê de cada peça:
 *
 * - **A régua de três linhas virou duas, e a primeira deixou de ser filtro
 *   para virar conteúdo.** A prontidão (`READINESS_FILTERS`) é a pergunta da
 *   tela inteira, e a contagem por etapa é a resposta mais útil que o ZeuX
 *   tem antes de qualquer clique — "7 prontos, 12 sem core" é informação, não
 *   controle. Virou um mostrador de células segmentadas (chassi único, fios
 *   de 1px entre as células, contagem em `font-pixel`), que continua sendo o
 *   filtro ao ser clicado. Some da tela o "resumo que não existia" e a fileira
 *   de chips que ocupava uma linha só para repetir números pequenos.
 * - **Fabricante e época viraram `<select>`.** Eram 8 + 4 chips numa fileira
 *   rolável que, a 1280px (a largura padrão da janela, `tauri.conf.json`),
 *   cortava "2010 em diante" na borda direita sem nenhuma indicação de que
 *   havia mais — o "quebrando" do achado. São eixos de recorte raro, de
 *   escolha única, e cujo valor cabe inteiro no rótulo fechado do controle; a
 *   contagem que os chips mostravam foi para dentro da opção ("Nintendo (9)"),
 *   onde não custa largura nenhuma. Dois selects de largura fixa por conteúdo
 *   não têm como transbordar.
 * - **"Tenho jogos deste console" continua chip**, não select: é um liga/
 *   desliga, e um `<select>` de dois estados seria um botão disfarçado.
 * - **A legenda do pingo desceu para o lado do título "Prontos para jogar"**,
 *   a faixa onde os pingos de fato aparecem — antes flutuava sozinha entre a
 *   régua e a primeira faixa, explicando um símbolo que ainda não estava na
 *   tela.
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

  // Contagem por fabricante e por época — sobre o catálogo inteiro, como a de
  // prontidão. Vai para dentro do rótulo da opção do `<select>`: é o dado que
  // os chips mostravam antes, e ali não custa largura de tela. Um fabricante
  // sem nenhum console some da lista de opções.
  const familyCount = useMemo(() => {
    const out = new Map<ConsoleFamily, number>();
    for (const { entry } of avaliados) {
      const fam = consoleFamily(entry.console_id);
      out.set(fam, (out.get(fam) ?? 0) + 1);
    }
    return out;
  }, [avaliados]);

  const eraCount = useMemo(() => {
    const out = new Map<EraId, number>();
    for (const { entry } of avaliados) {
      const era = consoleEra(entry.year);
      out.set(era, (out.get(era) ?? 0) + 1);
    }
    return out;
  }, [avaliados]);

  const ERA_LABEL: Record<EraId, string> = {
    "70s-80s": t("era70s80s"),
    "90s": t("era90s"),
    "2000s": t("era2000s"),
    "2010+": t("era2010plus"),
  };

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

  function renderSection(
    items: Avaliado[],
    titleKey: "sectionReady" | "sectionNeedsSetup" | "sectionCatalog",
    size: ConsoleCardSize,
    minCol: string,
    // Legenda opcional ao lado do título — só a faixa dos prontos tem o pingo
    // aceso para explicar.
    legend?: ReactNode,
  ) {
    if (items.length === 0) return null;
    return (
      <section className="mt-10 first:mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <SectionHeading>{t(titleKey)}</SectionHeading>
            {legend}
          </div>
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
    <ScreenContainer variant="listing" className="relative">
      {/* Céu da tela (2026-09-10) — halo ancorado no topo do conteúdo. */}
      <ScreenAtmosphere />
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

      {/* Mostrador de prontidão — resumo E filtro na mesma peça (ver o doc
          comment do componente). Chassi único, células separadas por fios de
          1px (`gap-px` sobre `bg-line`, com o fundo vindo de cada célula):
          a linguagem é a de um painel frontal de hardware, não a de uma barra
          de ferramentas. `flex-wrap` + `basis-36 grow`, nunca largura fixa —
          as células dividem a linha inteira em qualquer largura de janela e,
          quando a janela encolhe, quebram em blocos inteiros em vez de
          transbordar ou esconder opção (CLAUDE.md, layout responsivo). */}
      <div
        role="group"
        aria-label={t("readinessPanelLabel")}
        className="flex flex-wrap gap-px overflow-hidden rounded-sm border-[1.5px] border-control-border bg-line"
      >
        {READINESS_FILTERS.map((item) => {
          const total = readinessCount.get(item.id) ?? 0;
          if (item.id !== "todos" && total === 0) return null;
          const on = readinessFilter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setReadinessFilter(item.id)}
              aria-pressed={on}
              className={`relative flex min-w-0 grow basis-36 flex-col items-start gap-1 px-3 py-2.5 text-left transition duration-150 ${FOCUS_RING} ${
                on ? "bg-accent/10" : "bg-panel hover:bg-fill"
              }`}
            >
              {/* Friso aceso de 2px no topo da célula ativa: o estado ligado
                  precisa ler mesmo quando a diferença de fundo é sutil — cor
                  de fundo sozinha não é sinal suficiente (WCAG 1.4.1), e o
                  `aria-pressed` já cobre o leitor de tela. */}
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 top-0 h-0.5 ${on ? "bg-accent shadow-[0_0_10px_var(--accent)]" : "bg-transparent"}`}
              />
              <span
                className={`flex min-w-0 items-center gap-1.5 font-mono text-[11px] tracking-wider uppercase ${
                  on ? "text-ink" : "text-muted"
                }`}
              >
                {/* O mesmo pingo ciano que acende no canto do card pronto —
                    aqui ele amarra a célula à faixa lá embaixo. */}
                {item.id === "pronto" && (
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-secondary shadow-[0_0_4px_var(--accent-secondary)]"
                  />
                )}
                <span className="truncate">{item.label}</span>
              </span>
              <span className={`font-pixel text-base leading-none tabular-nums ${on ? "text-accent" : "text-ink"}`}>
                {total}
              </span>
            </button>
          );
        })}
      </div>

      {/* Linha de refino — busca + os dois recortes de catálogo + o liga/
          desliga de "tenho jogos". Uma linha só, e sem nada que possa
          transbordar: os dois `<select>` medem pelo próprio rótulo, não pela
          quantidade de opções que carregam. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
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

        <ZSelect
          ariaLabel={t("filterByMaker")}
          value={familyFilter ?? ANY}
          onValueChange={(v) => setFamilyFilter(v === ANY ? null : (v as ConsoleFamily))}
          // Borda acesa quando o recorte está ligado: num `<select>` o valor
          // já aparece fechado, mas sem isso ele fica com o mesmo peso do
          // chip desligado ao lado e "há um filtro ativo aqui" só se descobre
          // lendo. Mesmo roxo de "o usuário agiu" dos chips (regra da paleta
          // em index.css). Não é o único sinal — o rótulo diz "Sega (7)".
          className={`w-fit ${familyFilter ? "border-accent text-ink" : ""}`}
        >
          <SelectItem value={ANY}>{t("filterAllMakers")}</SelectItem>
          {FAMILY_ORDER.map((fam) => {
            const total = familyCount.get(fam) ?? 0;
            if (total === 0) return null;
            return (
              <SelectItem key={fam} value={fam}>
                {`${FAMILY_LABEL[fam] || t("familyOther")} (${total})`}
              </SelectItem>
            );
          })}
        </ZSelect>

        <ZSelect
          ariaLabel={t("filterByEra")}
          value={eraFilter ?? ANY}
          onValueChange={(v) => setEraFilter(v === ANY ? null : (v as EraId))}
          className={`w-fit ${eraFilter ? "border-accent text-ink" : ""}`}
        >
          <SelectItem value={ANY}>{t("filterAllEras")}</SelectItem>
          {ERA_ORDER.map((era) => (
            <SelectItem key={era} value={era}>
              {`${ERA_LABEL[era]} (${eraCount.get(era) ?? 0})`}
            </SelectItem>
          ))}
        </ZSelect>

        <button
          type="button"
          onClick={() => setOnlyWithGames((v) => !v)}
          aria-pressed={onlyWithGames}
          className={`${FILTER_CHIP_BASE} ${FOCUS_RING} ${onlyWithGames ? FILTER_CHIP_ON : FILTER_CHIP_OFF}`}
        >
          {t("filterOnlyWithGames").toUpperCase()}
        </button>

        {anyFilterActive && (
          // Saída de emergência, não um filtro: fica em `quiet` (sem chassi)
          // para não somar um sétimo controle do mesmo peso à linha, mas
          // herda a voz monoespaçada em caixa alta do resto dela.
          <Button
            variant="quiet"
            className="font-mono text-xs tracking-wider uppercase"
            onClick={clearFilters}
          >
            {t("clearFilters")}
          </Button>
        )}
      </div>


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
      {renderSection(
        prontos,
        "sectionReady",
        "grande",
        "260px",
        // Legenda do pingo aceso — cor sozinha nunca é informação (WCAG
        // 1.4.1). Fica ao lado do título desta faixa, e não solta acima da
        // tela: é aqui que os pingos aparecem.
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-accent-secondary shadow-[0_0_4px_var(--accent-secondary)]"
          />
          {t("readyLegend")}
        </span>,
      )}
      {renderSection(faltaConfigurar, "sectionNeedsSetup", "media", "210px")}
      {renderSection(catalogo, "sectionCatalog", "densa", "190px")}
    </ScreenContainer>
  );
}
