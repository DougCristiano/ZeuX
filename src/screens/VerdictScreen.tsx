import type { ConsoleVerdict, Report } from "../api/types";
import { Badge, Callout, Card, PartialNotice } from "../components/ui";

const LEVEL_LABEL: Record<ConsoleVerdict["level"], string> = {
  otimo: "ótimo",
  bom: "bom",
  limitado: "limitado",
  improvavel: "improvável",
};

function ConsoleCard({ verdict }: { verdict: ConsoleVerdict }) {
  const isGoodTier = verdict.level === "otimo" || verdict.level === "bom";

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">{verdict.name}</p>
        <Badge variant={isGoodTier ? "solid" : "default"}>{LEVEL_LABEL[verdict.level]}</Badge>
      </div>

      {/* Regra de produto: texto descritivo, nunca julgador — exibido como
          veio da API, sem reescrever (docs/api.md, ConsoleVerdict.headline). */}
      <p className="text-sm text-muted">{verdict.headline}</p>

      {verdict.preset && (
        <p className="text-sm text-muted">
          {verdict.emulator} · {verdict.preset}
        </p>
      )}

      {verdict.precision === "parcial" && (
        <PartialNotice>
          Não foi possível confirmar todos os requisitos deste console — este parecer é uma estimativa.
        </PartialNotice>
      )}

      {/* bottlenecks vem ausente (não []) quando não há gargalo a reportar —
          ver src/api/types.ts. Regra de produto: nomear o componente que
          barra, nunca uma nota opaca. */}
      {verdict.bottlenecks && verdict.bottlenecks.length > 0 && (
        <Callout label="O que separa do patamar acima">
          <ul className="list-disc space-y-1 pl-4">
            {verdict.bottlenecks.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Callout>
      )}
    </Card>
  );
}

const SUMMARY_FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

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
 * Decisão de layout que o wireframe deixava em aberto ("como 33 consoles
 * escalam além de cartão empilhado"): consoles em "otimo"/"bom"/"limitado"
 * ficam sempre visíveis, empilhados; os "improvavel" ficam atrás de um
 * <details> nativo — colapsado por padrão, mas nunca escondido de verdade
 * (expande com Enter/Espaço, sem JavaScript de foco customizado, então
 * funciona por teclado de graça). Isso cumpre "informar, não bloquear": o
 * console e o motivo continuam a uma tecla de distância, só não ocupam a
 * primeira dobra por padrão.
 */
export function VerdictScreen({ report }: { report: Report }) {
  const visible = report.verdicts.filter((v) => v.level !== "improvavel");
  const improbable = report.verdicts.filter((v) => v.level === "improvavel");

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Card filled>
        <p className="mb-2 font-mono text-xs tracking-wide text-muted uppercase">Resumo do que foi lido</p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          <p className="text-sm text-ink">{report.summary.cpu}</p>
          <p className="text-sm text-ink">{report.summary.gpu}</p>
          <p className="text-sm text-ink">{report.summary.memory}</p>
          <p className="text-sm text-ink">{report.summary.system}</p>
        </div>
      </Card>

      {!THRESHOLDS_CALIBRATED && (
        <p className="mt-4 text-sm text-muted">
          Os patamares abaixo são uma estimativa: os requisitos do catálogo ainda não foram medidos em
          hardware real.
        </p>
      )}

      {report.precision === "parcial" && (
        <div className="mt-4">
          <PartialNotice>Nem tudo pôde ser lido desta máquina — o parecer abaixo é uma estimativa.</PartialNotice>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {visible.map((verdict) => (
          <ConsoleCard key={verdict.console_id} verdict={verdict} />
        ))}
      </div>

      {improbable.length > 0 && (
        <details className="mt-4 rounded border border-line">
          <summary className={`cursor-pointer rounded px-4 py-2 font-mono text-sm text-muted select-none ${SUMMARY_FOCUS}`}>
            {improbable.length} console(s) provavelmente não rodam aqui — mostrar
          </summary>
          <div className="flex flex-col gap-3 p-4 pt-0">
            {improbable.map((verdict) => (
              <ConsoleCard key={verdict.console_id} verdict={verdict} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
