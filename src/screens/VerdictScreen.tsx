import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { HardwareInfo, Report } from "../api/types";
import {
  Callout,
  Card,
  CardSkeleton,
  InlineError,
  PartialNotice,
  ScreenContainer,
  ScreenHeader,
} from "../components/ui";
import { useT } from "../i18n/i18n";
import { dict } from "./VerdictScreen.i18n";

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
      <div role="status" aria-live="polite" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <span className="sr-only">{t("loadingHardware")}</span>
        <CardSkeleton className="h-32" />
        <CardSkeleton className="h-44" />
        <CardSkeleton className="h-24" />
        <CardSkeleton className="h-36" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        // `sm:col-span-2 lg:col-span-3`: um aviso de texto solto não deveria
        // ficar espremido numa célula de card — ocupa a largura cheia da
        // grade, como qualquer aviso de tela inteira do resto do app.
        <Callout label={t("hardwareWarnings")} className="sm:col-span-2 lg:col-span-3">
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
// específica); este é sobre o catálogo inteiro, em toda máquina. O aviso
// correspondente (`estimateLabel`/`thresholdsNotCalibrated`) migrou junto
// com o próprio parecer para `ConsoleDetailScreen` — ver comentário lá.

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
export function VerdictScreen({ report }: { report: Report }) {
  const t = useT(dict);

  return (
    // N3 (docs/roadmap.md, Sprint N): era `max-w-7xl` + `py-10` própria (a
    // única tela do app com esse espaçamento de topo diferente) — agora usa
    // o mesmo teto/espaçamento de listagem do resto do app
    // (`ScreenContainer`, que já herda o teto escalonado que o O5 validou).
    <ScreenContainer variant="listing">
      <ScreenHeader title={t("specifications")} />

      {report.precision === "parcial" && (
        <div className="mb-4">
          <PartialNotice>{t("partialPrecision")}</PartialNotice>
        </div>
      )}

      <SpecsPanel />
    </ScreenContainer>
  );
}
