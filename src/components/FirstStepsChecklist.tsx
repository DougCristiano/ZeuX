import { Button } from "./ui";
import { useT } from "../i18n/i18n";
import type { FirstStep, FirstStepsProgress } from "../lib/firstSteps";
import { dict } from "./FirstStepsChecklist.i18n";

/**
 * Lista de primeiros passos da biblioteca (2026-09-28, pedido do Douglas:
 * "falta explicação maior de como o ZeuX funciona?"). Responde "por onde eu
 * começo?" com o estado **real** da máquina — cada item se marca sozinho
 * quando o passo acontece de verdade e leva ao lugar onde ele se resolve.
 *
 * Não é um wizard nem uma sobreposição (o `TourOverlay` já apresenta o
 * produto): fica no fluxo da página, acima da grade, e some no primeiro jogo
 * aberto. Vídeo e tutorial gravado ficaram de fora de propósito — o visual
 * mudou duas vezes em três dias, e uma lista que lê o estado não envelhece.
 *
 * A regra de "o que falta" mora em `lib/firstSteps.ts`; este componente só
 * desenha o resultado.
 */
export function FirstStepsChecklist({
  progress,
  onChooseFolder,
  onOpenConsole,
  onDismiss,
}: {
  progress: FirstStepsProgress;
  onChooseFolder: () => void;
  onOpenConsole: (consoleId: string) => void;
  onDismiss: () => void;
}) {
  const t = useT(dict);

  function title(step: FirstStep): string {
    return t(step.id === "folder" ? "folderTitle" : step.id === "emulator" ? "emulatorTitle" : "playTitle");
  }

  // O texto de apoio muda com o estado: o passo do emulador é o único cuja
  // frase depende do que a máquina tem (`detail` vem de `ConsoleReadiness`).
  function body(step: FirstStep): string {
    if (step.id === "folder") return t("folderBody");
    if (step.id === "play") return t("playBody");
    if (step.state === "done") return t("emulatorDone", { console: step.console?.name ?? "" });
    return step.detail ?? t("emulatorWaiting");
  }

  function action(step: FirstStep) {
    if (step.state !== "current") return null;
    if (step.id === "folder") {
      return (
        <Button variant="primary" onClick={onChooseFolder}>
          {t("folderAction")}
        </Button>
      );
    }
    if (step.id === "emulator" && step.console) {
      const target = step.console;
      return (
        <Button variant="primary" onClick={() => onOpenConsole(target.console_id)}>
          {t("emulatorAction", { console: target.short_name })}
        </Button>
      );
    }
    return null;
  }

  return (
    <section aria-labelledby="first-steps-title" className="mb-8 rounded-lg border border-line bg-fill p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-accent-secondary uppercase">{t("kicker")}</p>
          <h2 id="first-steps-title" className="text-lg font-semibold text-ink">
            {t("title")}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted">
            {t("progress", { done: progress.doneCount, total: progress.steps.length })}
          </span>
          <Button variant="quiet" size="sm" onClick={onDismiss} title={t("dismissTitle")}>
            {t("dismiss")}
          </Button>
        </div>
      </div>

      <ol className="mt-3 flex flex-col gap-2">
        {progress.steps.map((step, i) => {
          const current = step.state === "current";
          const done = step.state === "done";
          return (
            <li
              key={step.id}
              aria-current={current ? "step" : undefined}
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2.5 ${
                current ? "border-accent/60 bg-accent/5" : "border-line"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex size-6 shrink-0 items-center justify-center rounded-sm border font-mono text-xs ${
                  done
                    ? "border-accent-secondary bg-accent-secondary/15 text-accent-secondary"
                    : current
                      ? "border-accent text-ink"
                      : "border-control-border text-muted"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <div className="min-w-[14rem] flex-1">
                <p className={`text-sm font-semibold ${done ? "text-muted" : "text-ink"}`}>
                  {title(step)}
                  {done && <span className="sr-only"> — {t("stateDone")}</span>}
                </p>
                <p className="text-sm text-muted">{body(step)}</p>
              </div>
              {action(step)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
