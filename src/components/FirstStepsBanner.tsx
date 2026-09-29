import { useT } from "../i18n/i18n";
import type { FirstStepId, FirstStepsProgress } from "../lib/firstSteps";
import { dict } from "./FirstStepsBanner.i18n";
import { Button } from "./ui";

/**
 * Faixa dos primeiros passos nas telas aonde a lista leva (2026-09-29, teste
 * com um usuário novo): ele apontou a pasta, ficou na tela de Pastas de jogos
 * e não entendeu que havia mais passos — só viu os seguintes depois de clicar
 * em Voltar por acaso. A lista (`FirstStepsChecklist`) mora na biblioteca;
 * esta faixa acompanha a pessoa fora dela.
 *
 * Enquanto o passo desta tela (`step`) está pendente, diz o que fazer aqui.
 * Assim que ele é concluído — sem sair da tela: `refreshKey` do hook relê o
 * estado a cada pasta apontada ou emulador instalado —, vira "Feito" com o
 * próximo passo e o botão que volta para a lista. Some quando a lista some
 * (primeiro jogo aberto ou "Dispensar").
 */
export function FirstStepsBanner({
  progress,
  step,
  onContinue,
}: {
  progress: FirstStepsProgress;
  /** O passo que esta tela resolve. */
  step: FirstStepId;
  onContinue: () => void;
}) {
  const t = useT(dict);
  const thisStep = progress.steps.find((s) => s.id === step);
  const next = progress.steps.find((s) => s.state === "current");
  const justDone = thisStep?.state === "done";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border px-4 py-3 ${
        justDone ? "border-accent-secondary/60 bg-accent-secondary/10" : "border-accent/40 bg-accent/5"
      }`}
    >
      <div className="min-w-[16rem] flex-1">
        <p className="font-mono text-xs tracking-[0.2em] text-accent-secondary uppercase">
          {t("kicker", { done: progress.doneCount, total: progress.steps.length })}
        </p>
        {justDone ? (
          <p className="mt-1 text-sm text-ink">
            <span className="font-semibold">{t("done", { step: t(step) })}</span>{" "}
            {next && t("next", { step: t(next.id) })}
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink">
            <span className="font-semibold">{t(step)}.</span> {t(step === "folder" ? "hereFolder" : "hereEmulator")}
          </p>
        )}
      </div>
      <Button variant={justDone ? "primary" : "quiet"} size={justDone ? "md" : "sm"} onClick={onContinue}>
        {justDone ? t("continue") : t("seeAll")}
      </Button>
    </div>
  );
}
