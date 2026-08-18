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
  LEVEL_LABEL,
  Pagination,
  PartialNotice,
  ScreenContainer,
} from "../components/ui";

const LEVEL_ORDER: ConsoleVerdict["level"][] = ["otimo", "bom", "limitado", "improvavel"];
const PAGE_SIZE = 9;

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "desconhecido";
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
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getHardware()
      .then(setHardware)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível ler o hardware."));
  }, []);

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
        <span className="sr-only">Lendo hardware…</span>
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
        <p className="mb-3 font-pixel text-[11px] tracking-wide text-muted uppercase">Sistema</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted">Plataforma</dt>
          <dd className="text-ink">{hardware.os.platform}</dd>
          <dt className="text-muted">Versão</dt>
          <dd className="text-ink">{hardware.os.version}</dd>
          <dt className="text-muted">Arquitetura</dt>
          <dd className="text-ink">{hardware.os.arch}</dd>
        </dl>
      </Card>

      <Card filled>
        <p className="mb-3 font-pixel text-[11px] tracking-wide text-muted uppercase">Processador</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted">Modelo</dt>
          <dd className="text-ink">{hardware.cpu.model}</dd>
          <dt className="text-muted">Fabricante</dt>
          <dd className="text-ink">{hardware.cpu.vendor}</dd>
          <dt className="text-muted">Núcleos físicos</dt>
          <dd className="text-ink">{hardware.cpu.physical_cores}</dd>
          <dt className="text-muted">Núcleos lógicos</dt>
          <dd className="text-ink">{hardware.cpu.logical_cores}</dd>
          <dt className="text-muted">Clock-base</dt>
          <dd className="text-ink">
            {hardware.cpu.base_clock_mhz > 0 ? `${(hardware.cpu.base_clock_mhz / 1000).toFixed(2)} GHz` : "desconhecido"}
          </dd>
        </dl>
      </Card>

      <Card filled>
        <p className="mb-3 font-pixel text-[11px] tracking-wide text-muted uppercase">Memória</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted">Total</dt>
          <dd className="text-ink">{formatBytes(hardware.memory.total_bytes)}</dd>
          <dt className="text-muted">Disponível</dt>
          <dd className="text-ink">{formatBytes(hardware.memory.available_bytes)}</dd>
        </dl>
      </Card>

      {hardware.gpus && hardware.gpus.length > 0 ? (
        hardware.gpus.map((gpu, i) => (
          <Card filled key={`${gpu.model}-${i}`}>
            <p className="mb-3 font-pixel text-[11px] tracking-wide text-muted uppercase">
              Placa de vídeo{hardware.gpus!.length > 1 ? ` ${i + 1}` : ""}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">Modelo</dt>
              <dd className="text-ink">{gpu.model}</dd>
              <dt className="text-muted">Fabricante</dt>
              <dd className="text-ink">{gpu.vendor}</dd>
              <dt className="text-muted">Memória de vídeo</dt>
              <dd className="text-ink">{formatBytes(gpu.vram_bytes)}</dd>
              <dt className="text-muted">Tipo</dt>
              <dd className="text-ink">{gpu.integrated ? "integrada" : "dedicada"}</dd>
              {gpu.driver_version && (
                <>
                  <dt className="text-muted">Driver</dt>
                  <dd className="text-ink">{gpu.driver_version}</dd>
                </>
              )}
              <dt className="text-muted">Fonte da leitura</dt>
              <dd className="text-ink">{gpu.source}</dd>
            </dl>
          </Card>
        ))
      ) : (
        <Card filled>
          <p className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">Placa de vídeo</p>
          <p className="text-sm text-muted">Nenhuma placa de vídeo foi identificada nesta leitura.</p>
        </Card>
      )}

      {hardware.warnings.length > 0 && (
        <Callout label="Avisos da leitura de hardware">
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
          <h1 className="text-2xl font-semibold text-ink">Especificações</h1>
          <SpecsPanel />
        </aside>

        <div>
          {!THRESHOLDS_CALIBRATED && (
            <p className="mb-4 text-sm text-muted">
              Os patamares abaixo são uma estimativa: os requisitos do catálogo ainda não foram medidos em
              hardware real.
            </p>
          )}

          {report.precision === "parcial" && (
            <div className="mb-4">
              <PartialNotice>Nem tudo pôde ser lido desta máquina — o parecer abaixo é uma estimativa.</PartialNotice>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="verdict-search" className="sr-only">
              Buscar console
            </label>
            <input
              id="verdict-search"
              type="text"
              name="verdict-search"
              autoComplete="off"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar console…"
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
                TODOS
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
                  {LEVEL_LABEL[level].toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 && (
            <p className="mt-4 text-base text-muted">Nenhum console encontrado para "{search}".</p>
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
