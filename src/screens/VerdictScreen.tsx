import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { ConsoleVerdict, HardwareInfo, Report } from "../api/types";
import {
  Callout,
  Card,
  CardSkeleton,
  ConsoleVerdictCard,
  FOCUS_RING,
  InlineError,
  inputClass,
  useLevelLabel,
  Pagination,
  PartialNotice,
  ScreenContainer,
} from "../components/ui";
import { useT } from "../i18n/i18n";
import { dict } from "./VerdictScreen.i18n";

const LEVEL_ORDER: ConsoleVerdict["level"][] = ["otimo", "bom", "limitado", "improvavel"];
const PAGE_SIZE = 9;

function formatBytes(bytes: number, unknownText: string): string {
  if (bytes <= 0) return unknownText;
  const gib = bytes / 1024 ** 3;
  return `${gib.toFixed(gib >= 10 ? 0 : 1)} GB`;
}

/**
 * Coluna esquerda da tela (2026-08-04, a pedido do Douglas): detalhe cru do
 * hardware, vindo de `GET /hardware` — dado que já existia na API
 * (`HardwareInfo`) mas nunca era mostrado; `report.summary` só tinha 4
 * strings pré-formatadas. Busca separada porque `Report` não carrega isso.
 */
function SpecsPanel() {
  const t = useT(dict);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getHardware()
      .then(setHardware)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("errorLoadingHardware")));
  }, [t]);

  if (error) {
    return (
      <Card filled>
        <InlineError>{error}</InlineError>
      </Card>
    );
  }

  if (!hardware) {
    // B10 (achado do critico-design, 2026-08-18): era um único "Lendo
    // hardware…" — o painel tem forma fixa e conhecida (4 cards: Sistema,
    // Processador, Memória, Placa de vídeo), então o skeleton na mesma
    // forma evita o conteúdo saltar quando os dados chegam.
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-4">
        <span className="sr-only">{t("loadingHardware")}</span>
        <CardSkeleton className="h-32" />
        <CardSkeleton className="h-44" />
        <CardSkeleton className="h-24" />
        <CardSkeleton className="h-36" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card filled>
        <p className="mb-3 font-pixel text-[11px] tracking-wide text-muted uppercase">{t("system")}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted">{t("platform")}</dt>
          <dd className="text-ink">{hardware.os.platform}</dd>
          <dt className="text-muted">{t("version")}</dt>
          <dd className="text-ink">{hardware.os.version}</dd>
          <dt className="text-muted">{t("architecture")}</dt>
          <dd className="text-ink">{hardware.os.arch}</dd>
        </dl>
      </Card>

      <Card filled>
        <p className="mb-3 font-pixel text-[11px] tracking-wide text-muted uppercase">{t("processor")}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted">{t("model")}</dt>
          <dd className="text-ink">{hardware.cpu.model}</dd>
          <dt className="text-muted">{t("vendor")}</dt>
          <dd className="text-ink">{hardware.cpu.vendor}</dd>
          <dt className="text-muted">{t("physicalCores")}</dt>
          <dd className="text-ink">{hardware.cpu.physical_cores}</dd>
          <dt className="text-muted">{t("logicalCores")}</dt>
          <dd className="text-ink">{hardware.cpu.logical_cores}</dd>
          <dt className="text-muted">{t("baseClock")}</dt>
          <dd className="text-ink">
            {hardware.cpu.base_clock_mhz > 0 ? `${(hardware.cpu.base_clock_mhz / 1000).toFixed(2)} GHz` : t("unknown")}
          </dd>
        </dl>
      </Card>

      <Card filled>
        <p className="mb-3 font-pixel text-[11px] tracking-wide text-muted uppercase">{t("memory")}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted">{t("total")}</dt>
          <dd className="text-ink">{formatBytes(hardware.memory.total_bytes, t("unknown"))}</dd>
          <dt className="text-muted">{t("available")}</dt>
          <dd className="text-ink">{formatBytes(hardware.memory.available_bytes, t("unknown"))}</dd>
        </dl>
      </Card>

      {hardware.gpus && hardware.gpus.length > 0 ? (
        hardware.gpus.map((gpu, i) => (
          <Card filled key={`${gpu.model}-${i}`}>
            <p className="mb-3 font-pixel text-[11px] tracking-wide text-muted uppercase">
              {t("gpuCard")}{hardware.gpus!.length > 1 ? ` ${i + 1}` : ""}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">{t("model")}</dt>
              <dd className="text-ink">{gpu.model}</dd>
              <dt className="text-muted">{t("vendor")}</dt>
              <dd className="text-ink">{gpu.vendor}</dd>
              <dt className="text-muted">{t("vram")}</dt>
              <dd className="text-ink">{formatBytes(gpu.vram_bytes, t("unknown"))}</dd>
              <dt className="text-muted">{t("type")}</dt>
              <dd className="text-ink">{gpu.integrated ? t("integrated") : t("dedicated")}</dd>
              {gpu.driver_version && (
                <>
                  <dt className="text-muted">{t("driver")}</dt>
                  <dd className="text-ink">{gpu.driver_version}</dd>
                </>
              )}
              <dt className="text-muted">{t("readingSource")}</dt>
              <dd className="text-ink">{gpu.source}</dd>
            </dl>
          </Card>
        ))
      ) : (
        <Card filled>
          <p className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">{t("gpuCard")}</p>
          <p className="text-sm text-muted">{t("gpuNotIdentified")}</p>
        </Card>
      )}

      {/* Q3 (docs/roadmap.md, Sprint Q): o monitor entra ao lado de CPU/GPU/
          memória porque é a quarta peça que decide a configuração do jogo — o
          preset de resolução interna é ajustado por ela. Cai no mesmo padrão
          dos outros: quando não pôde ser lido, diz isso em vez de sumir. */}
      {hardware.displays && hardware.displays.length > 0 ? (
        hardware.displays.map((display, i) => (
          <Card filled key={`${display.name ?? "tela"}-${i}`}>
            <p className="mb-3 font-pixel text-[11px] tracking-wide text-muted uppercase">
              {t("display")}{hardware.displays!.length > 1 ? ` ${i + 1}` : ""}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">{t("resolution")}</dt>
              <dd className="text-ink">
                {display.width}×{display.height}
              </dd>
              {/* Ausente quando o sistema não reportou — no Linux fora do
                  X11 o caminho pelo sysfs só informa resolução. Some em vez
                  de mostrar um zero que pareceria medição. */}
              {display.refresh_hz ? (
                <>
                  <dt className="text-muted">{t("refreshRate")}</dt>
                  <dd className="text-ink">{display.refresh_hz} {t("hz")}</dd>
                </>
              ) : null}
              {display.name && (
                <>
                  <dt className="text-muted">{t("output")}</dt>
                  <dd className="text-ink">{display.name}</dd>
                </>
              )}
              {display.primary && (
                <>
                  <dt className="text-muted">{t("primary")}</dt>
                  <dd className="text-ink">{t("yes")}</dd>
                </>
              )}
              <dt className="text-muted">{t("readingSource")}</dt>
              <dd className="text-ink">{display.source}</dd>
            </dl>
          </Card>
        ))
      ) : (
        <Card filled>
          <p className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">{t("display")}</p>
          <p className="text-sm text-muted">{t("displayNotIdentified")}</p>
        </Card>
      )}

      {hardware.warnings.length > 0 && (
        <Callout label={t("hardwareWarnings")}>
          <ul className="list-disc space-y-1 pl-4">
            {hardware.warnings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  );
}

// D2 (docs/roadmap.md) — calibrar os limiares do catálogo — segue aberto: os
// campos `requires` de consoles.json são estimativas escritas a partir de
// conhecimento geral, nunca medidas em hardware real. Enquanto isso não
// mudar, a tela precisa dizer isso, sempre — não é o mesmo aviso da
// `precision: "parcial"` (que é sobre o que não pôde ser lido desta máquina
// específica); este é sobre o catálogo inteiro, em toda máquina. Vira `true`
// quando o D2 fechar.
const THRESHOLDS_CALIBRATED = false;

/**
 * Tela 03 do wireframe (docs/wireframe.html): o parecer por console.
 * Puramente apresentacional (props-driven) — como a tela 01, quem busca o
 * `Report` e trata erro/carregamento é o item B8.
 *
 * Duas colunas (2026-08-04, a pedido do Douglas): à esquerda o detalhe do
 * hardware lido (`SpecsPanel`, busca própria de `GET /hardware`); à direita
 * a grade de consoles com busca + filtro por patamar + paginação — a
 * paginação vale só para a coluna direita, a esquerda nunca pagina porque
 * não é uma lista, é um retrato só desta máquina.
 */
export function VerdictScreen({ report }: { report: Report }) {
  const t = useT(dict);
  const levelLabel = useLevelLabel();
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<ConsoleVerdict["level"] | null>(null);
  const [page, setPage] = useState(1);

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleLevelFilter(level: ConsoleVerdict["level"] | null) {
    setLevelFilter(level);
    setPage(1);
  }

  const filtered = report.verdicts.filter((v) => {
    if (levelFilter && v.level !== levelFilter) return false;
    const term = search.trim().toLowerCase();
    return !term || v.name.toLowerCase().includes(term);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    // N3 (docs/roadmap.md, Sprint N): era `max-w-7xl` + `py-10` própria (a
    // única tela do app com esse espaçamento de topo diferente) — agora usa
    // o mesmo teto/espaçamento de listagem do resto do app
    // (`ScreenContainer`, que já herda o teto escalonado que o O5 validou).
    <ScreenContainer variant="listing">
      {/* O6 (docs/roadmap.md, Sprint O): era `320px` fixo — largura fixa numa
          coluna dentro da área que divide espaço com a sidebar, proibida pela
          regra de "Layout responsivo" do CLAUDE.md. `minmax(260px, 340px)`
          continua com teto (não estica sem limite num monitor grande, o que
          ia deixar o texto de spec — nomes de CPU/GPU — perdido num espaço
          vazio), mas encolhe de verdade em janela pequena; o `max-w` do
          `<aside>` some porque a coluna do grid já é o teto, era redundante. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(260px,340px)_1fr]">
        <aside className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold text-ink">{t("specifications")}</h1>
          <SpecsPanel />
        </aside>

        <div>
          {!THRESHOLDS_CALIBRATED && (
            <p className="mb-4 text-sm text-muted">
              {t("thresholdsNotCalibrated")}
            </p>
          )}

          {report.precision === "parcial" && (
            <div className="mb-4">
              <PartialNotice>{t("partialPrecision")}</PartialNotice>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="verdict-search" className="sr-only">
              {t("searchConsole")}
            </label>
            <input
              id="verdict-search"
              type="text"
              name="verdict-search"
              autoComplete="off"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={t("searchConsolePlaceholder")}
              className={`${inputClass} max-w-xs`}
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleLevelFilter(null)}
                className={`rounded-sm border px-2.5 py-1 font-pixel text-[11px] transition-colors ${FOCUS_RING} ${
                  levelFilter === null ? "border-accent text-accent" : "border-line-strong text-muted hover:text-ink"
                }`}
              >
                {t("filterAll")}
              </button>
              {LEVEL_ORDER.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => handleLevelFilter(level)}
                  className={`rounded-sm border px-2.5 py-1 font-pixel text-[11px] transition-colors ${FOCUS_RING} ${
                    levelFilter === level ? "border-accent text-accent" : "border-line-strong text-muted hover:text-ink"
                  }`}
                >
                  {levelLabel(level).toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 && (
            <p className="mt-4 text-base text-muted">{t("noConsolesFound", { search })}</p>
          )}

          {/* 2xl, não xl (CLAUDE.md, regra de breakpoint): esta grade divide
              espaço com a coluna lateral de até 340px acima, então tem menos
              largura disponível que uma grade de tela cheia — xl (1280,
              quase o tamanho padrão da janela) já era o valor frágil que
              causou o bug de 2026-08-04 em outro lugar; aqui seria pior.
              min-[2400px] (O5, Sprint O) acompanha o teto do container acima:
              sem essa quarta coluna, os cards só ficariam maiores num monitor
              grande, sem usar a largura extra pra mostrar mais consoles de
              uma vez. */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3 min-[2400px]:grid-cols-4">
            {pageItems.map((verdict) => (
              <ConsoleVerdictCard key={verdict.console_id} verdict={verdict} />
            ))}
          </div>

          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      </div>
    </ScreenContainer>
  );
}
