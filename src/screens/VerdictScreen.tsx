import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../api";
import type { HardwareInfo, Report } from "../api/types";
import {
  Button,
  Callout,
  InlineError,
  PartialNotice,
  ScreenContainer,
  ScreenHeader,
} from "../components/ui";
import { useT } from "../i18n/i18n";
import { dict } from "./VerdictScreen.i18n";
import { formatFileDate } from "../lib/format";

function formatBytes(bytes: number, unknownText: string): string {
  if (bytes <= 0) return unknownText;
  const gib = bytes / 1024 ** 3;
  return `${gib.toFixed(gib >= 10 ? 0 : 1)} GB`;
}

/**
 * Detalhe cru do hardware (2026-08-04, a pedido do Douglas), vindo de
 * `GET /hardware` — dado que já existia na API (`HardwareInfo`) mas nunca
 * era mostrado; `report.summary` só tinha 4 strings pré-formatadas. Busca
 * separada porque `Report` não carrega isso.
 *
 * Achado do Douglas (2026-09-07): até esta sessão isto vivia numa coluna
 * lateral de até 340px, ao lado da grade de parecer por console — 5-6 cards
 * empilhados numa coluna estreita ficavam desproporcionalmente mais altos
 * que a grade ao lado, com a paginação dela sobrando solta no meio do
 * desequilíbrio. A grade de parecer saiu da tela (documentação completa em
 * `VerdictScreen`, abaixo); sem ela, este painel virou o conteúdo inteiro da
 * página e ganhou uma grade própria (`sm:grid-cols-2 lg:grid-cols-3`) em vez
 * da pilha de uma coluna só — a largura cheia que sobrou é isso que resolve
 * o desequilíbrio, não um layout novo.
 *
 * 2026-09-26: a grade de cards virou uma tela de POST (`PostScreen`, abaixo)
 * — uma linha por componente, com "LIDO"/"NÃO LIDO" à direita.
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
      <PostScreen title={t("postTitle")}>
        <InlineError>{error}</InlineError>
      </PostScreen>
    );
  }

  if (!hardware) {
    // A forma de carregando é o próprio monitor com o cursor, não um
    // skeleton de cards: é o "a máquina está sendo lida" da tela de POST.
    return (
      <PostScreen title={t("postTitle")}>
        <p role="status" aria-live="polite" className="text-muted">
          {t("loadingHardware")}
          <Cursor />
        </p>
      </PostScreen>
    );
  }

  const unknown = t("unknown");
  const gpus = hardware.gpus ?? [];
  const displays = hardware.displays ?? [];

  return (
    <PostScreen title={t("postTitle")} meta={t("scannedAt", { date: formatFileDate(hardware.scanned_at) })}>
      <dl className="flex flex-col">
        <PostRow label={t("system")} read={t("statusRead")}>
          <PostValue>
            {hardware.os.platform} {hardware.os.version}
          </PostValue>
          <PostDetail>{hardware.os.arch}</PostDetail>
        </PostRow>

        <PostRow label={t("processor")} read={t("statusRead")}>
          <PostValue>{hardware.cpu.model}</PostValue>
          <PostDetail>
            {[
              hardware.cpu.vendor,
              t("coresLine", { physical: hardware.cpu.physical_cores, logical: hardware.cpu.logical_cores }),
              hardware.cpu.base_clock_mhz > 0 ? `${(hardware.cpu.base_clock_mhz / 1000).toFixed(2)} GHz` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </PostDetail>
        </PostRow>

        <PostRow label={t("memory")} read={t("statusRead")}>
          <PostValue>{formatBytes(hardware.memory.total_bytes, unknown)}</PostValue>
          <PostDetail>{t("memoryAvailable", { amount: formatBytes(hardware.memory.available_bytes, unknown) })}</PostDetail>
        </PostRow>

        {gpus.length > 0 ? (
          gpus.map((gpu, i) => (
            <PostRow
              key={`${gpu.model}-${i}`}
              label={`${t("gpuCard")}${gpus.length > 1 ? ` ${i + 1}` : ""}`}
              read={t("statusRead")}
            >
              <PostValue>{gpu.model}</PostValue>
              <PostDetail>
                {[
                  gpu.vendor,
                  `${t("vram")} ${formatBytes(gpu.vram_bytes, unknown)}`,
                  gpu.integrated ? t("integrated") : t("dedicated"),
                  gpu.driver_version ? `${t("driver")} ${gpu.driver_version}` : null,
                  `${t("readingSource")}: ${gpu.source}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </PostDetail>
            </PostRow>
          ))
        ) : (
          <PostRow label={t("gpuCard")} notRead={t("statusNotRead")}>
            <PostDetail>{t("gpuNotIdentified")}</PostDetail>
          </PostRow>
        )}

        {/* Q3 (docs/roadmap.md, Sprint Q): o monitor entra ao lado de CPU/
            GPU/memória porque é a quarta peça que decide a configuração do
            jogo — o preset de resolução interna é ajustado por ela. */}
        {displays.length > 0 ? (
          displays.map((display, i) => (
            <PostRow
              key={`${display.name ?? "tela"}-${i}`}
              label={`${t("display")}${displays.length > 1 ? ` ${i + 1}` : ""}`}
              read={t("statusRead")}
            >
              <PostValue>
                {display.width}×{display.height}
                {/* Ausente quando o sistema não reportou — no Linux fora do
                    X11 o caminho pelo sysfs só informa resolução. Some em vez
                    de mostrar um zero que pareceria medição. */}
                {display.refresh_hz ? ` @ ${display.refresh_hz} ${t("hz")}` : ""}
              </PostValue>
              <PostDetail>
                {[
                  display.name ? `${t("output")} ${display.name}` : null,
                  display.primary ? t("primary") : null,
                  `${t("readingSource")}: ${display.source}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </PostDetail>
            </PostRow>
          ))
        ) : (
          <PostRow label={t("display")} notRead={t("statusNotRead")}>
            <PostDetail>{t("displayNotIdentified")}</PostDetail>
          </PostRow>
        )}
      </dl>

      {hardware.warnings.length > 0 && (
        <div className="mt-4 border-t border-dashed border-line pt-3">
          <p className="mb-1.5 text-[11px] tracking-wider text-muted uppercase">{t("hardwareWarnings")}</p>
          <ul className="flex flex-col gap-1">
            {hardware.warnings.map((line) => (
              <li key={line} className="flex gap-2 text-amber">
                <span aria-hidden="true">!</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-ink">
        {t("readyLine")}
        <Cursor />
      </p>
    </PostScreen>
  );
}

/**
 * Moldura de "monitor" da tela de POST (2026-09-26, revisão de design tela
 * por tela: "Especificações" era a maior oportunidade retrô do app e lia como
 * painel de SaaS — seis cards de chave/valor soltos). Uma tela só, fundo mais
 * escuro que `--paper` (tubo desligado), tudo em mono, scanlines por cima, e
 * uma linha por componente como a contagem de memória de um BIOS dos anos 90.
 * As scanlines obedecem ao "efeitos reduzidos" pela classe `.zeux-scanlines`
 * (src/index.css).
 */
function PostScreen({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-lg border-[1.5px] border-control-border bg-[#04060c] font-mono text-sm shadow-[inset_0_0_60px_rgba(0,0,0,0.6)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
        <p className="font-pixel text-xs text-accent-secondary">ZeuX · {title}</p>
        {meta && <p className="text-xs text-muted">{meta}</p>}
      </div>
      <div className="relative px-5 py-4">{children}</div>
      <div aria-hidden="true" className="zeux-scanlines pointer-events-none absolute inset-0 opacity-60" />
    </div>
  );
}

/**
 * Uma linha de componente: rótulo com pontilhado até o valor (a "régua" de
 * tela de BIOS) e, à direita, se o ZeuX conseguiu ler aquilo. Em janela
 * estreita o rótulo sobe para cima do valor em vez de espremer os três.
 */
function PostRow({
  label,
  read,
  notRead,
  children,
}: {
  label: string;
  read?: string;
  notRead?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-b border-line/40 py-2.5 last:border-b-0 sm:grid-cols-[13rem_1fr_auto]">
      <dt className="col-span-2 flex items-baseline gap-2 text-[11px] tracking-wider text-muted uppercase sm:col-span-1">
        <span className="shrink-0">{label}</span>
        <span aria-hidden="true" className="hidden flex-1 border-b border-dotted border-line-strong sm:block" />
      </dt>
      <dd className="min-w-0">{children}</dd>
      <dd
        className={`self-start text-[11px] tracking-wider whitespace-nowrap ${notRead ? "text-amber" : "text-accent-secondary"}`}
      >
        [ {notRead ?? read} ]
      </dd>
    </div>
  );
}

function PostValue({ children }: { children: ReactNode }) {
  return <p className="break-words text-ink">{children}</p>;
}

function PostDetail({ children }: { children: ReactNode }) {
  return <p className="mt-0.5 break-words text-xs text-muted">{children}</p>;
}

// `motion-safe:`: o cursor pisca só para quem não pediu movimento reduzido.
function Cursor() {
  return (
    <span aria-hidden="true" className="ml-1 inline-block h-[1em] w-[0.6em] translate-y-[0.15em] bg-current motion-safe:animate-pulse" />
  );
}

// D2 (docs/roadmap.md) — calibrar os limiares do catálogo — segue aberto: os
// campos `requires` de consoles.json são estimativas escritas a partir de
// conhecimento geral, nunca medidas em hardware real. Enquanto isso não
// mudar, a tela precisa dizer isso, sempre — não é o mesmo aviso da
// `precision: "parcial"` (que é sobre o que não pôde ser lido desta máquina
// específica); este é sobre o catálogo inteiro, em toda máquina. O aviso
// correspondente mora hoje dentro do próprio `ConsoleVerdictCard`
// (`VerdictCaveat`, em components/ui.tsx), então aparece onde quer que o
// parecer apareça.

/**
 * Tela 01 do wireframe (docs/wireframe.html): o retrato desta máquina.
 * Puramente apresentacional (props-driven) — quem busca o `Report` e trata
 * erro/carregamento é o item B8.
 *
 * Achado do Douglas (2026-09-07): até esta sessão, esta tela também tinha
 * uma segunda função — a grade de parecer por console (busca + filtro por
 * patamar + paginação), ao lado do `SpecsPanel` numa coluna estreita.
 * Virou poluição dupla: (1) os mesmos 33 pareceres já existem individualmente
 * dentro de `ConsoleDetailScreen`, então esta era a segunda vez que o mesmo
 * dado aparecia; (2) 5-6 cards de hardware empilhados numa coluna de até
 * 340px ficavam desproporcionalmente altos ao lado da grade de consoles,
 * com a paginação sobrando solta no desequilíbrio. Removida — "Especificações"
 * agora é só o retrato da máquina, largura cheia, sem coluna dupla.
 */
export function VerdictScreen({ report, onAuthorize }: { report?: Report; onAuthorize: () => void }) {
  const t = useT(dict);

  return (
    // N3 (docs/roadmap.md, Sprint N): era `max-w-7xl` + `py-10` própria (a
    // única tela do app com esse espaçamento de topo diferente) — agora usa
    // o mesmo teto/espaçamento de listagem do resto do app
    // (`ScreenContainer`, que já herda o teto escalonado que o O5 validou).
    <ScreenContainer variant="listing">
      <ScreenHeader title={t("specifications")} subtitle={t("specificationsSubtitle")} />

      {!report ? (
        // 2026-09-08: sem consentimento, `GET /hardware` (que `SpecsPanel`
        // busca sozinho) devolveria 404 "sem scan" — em vez de deixar isso
        // aparecer como um erro genérico de rede, a tela já sabe por que não
        // há nada pra mostrar e diz exatamente isso, com o caminho de volta.
        <Callout label={t("noReadingHeading")} className="mb-4">
          <p className="mb-3">{t("noReadingDescription")}</p>
          <Button variant="primary" onClick={onAuthorize}>
            {t("authorizeNow")}
          </Button>
        </Callout>
      ) : (
        <>
          {report.precision === "parcial" && (
            <div className="mb-4">
              <PartialNotice>{t("partialPrecision")}</PartialNotice>
            </div>
          )}

          {/* O título de seção "Componentes" saiu em 2026-09-26: o painel de
              POST tem título próprio no cabeçalho do "monitor". */}
          <SpecsPanel />
        </>
      )}
    </ScreenContainer>
  );
}
