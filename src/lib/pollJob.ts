import { api, ApiError } from "../api";
import type { InstallJob, InstallPhase } from "../api/types";

/**
 * A máquina de "operação demorada que devolve um Job na hora, roda desligada
 * do contexto HTTP, e a UI acompanha por `GET /installs/{id}` até a fase
 * virar terminal" estava reimplementada com `setTimeout` recursivo em quatro
 * hooks (`useInlineInstall`, `useEmulatorInstall`, `useCoreInstall`,
 * `useLaunchGame`) — cada cópia com uma divergência calada (uma tratava
 * `"cancelado"`, outra carregava um caminho de jogo pendente, outra devolvia
 * uma `Promise`). O próximo bug de "o polling não parou" ou "fase terminal
 * tratada como intermediária" nascia numa das quatro e a correção não se
 * propagava.
 *
 * Aqui a máquina tem um lugar só. O que é genuinamente específico de cada
 * hook — o que fazer em cada fase — fica nos handlers.
 */

// Antes estava copiado como literal `400` em quatro hooks.
export const JOB_POLL_INTERVAL_MS = 400;

/**
 * As fases terminais que qualquer job assíncrono do ZeuX pode alcançar
 * (docs/api.md, `InstallPhase`). `"cancelado"` só nasce em download de core
 * do RetroArch (ADR 0015, R3), mas classificar num lugar só evita que cada
 * hook redescubra o conjunto e erre por omissão.
 */
export type JobOutcome = "done" | "failed" | "canceled" | "pending";

export function jobOutcome(phase: InstallPhase): JobOutcome {
  switch (phase) {
    case "concluido":
      return "done";
    case "falhou":
      return "failed";
    case "cancelado":
      return "canceled";
    default:
      return "pending";
  }
}

export type PollJobHandlers = {
  /** Cada resposta enquanto o job ainda não terminou — atualize a barra de progresso aqui. */
  onProgress: (job: InstallJob) => void;
  /** Fase `"concluido"`. */
  onDone: (job: InstallJob) => void;
  /**
   * Fase `"falhou"`. A frase exibível vem SEMPRE de `job.error` (regra do
   * projeto: mensagem de erro é a do servidor, nunca reescrita no cliente) —
   * o handler é quem decide o texto de reserva quando `job.error` está vazio.
   */
  onFailed: (job: InstallJob) => void;
  /**
   * Fase `"cancelado"`. Ausente = a fase é tratada como intermediária,
   * exatamente como faziam os hooks que não a conheciam (`useInlineInstall`,
   * `useEmulatorInstall`): num daemon são, o job em cancelamento real sempre
   * alcança `"cancelado"`, então na prática o loop encerra na volta seguinte.
   */
  onCanceled?: (job: InstallJob) => void;
  /**
   * Erro de rede no meio do acompanhamento — não é o job falhando, é o
   * `GET /installs/{id}` que não respondeu. `message` já vem pronta: a do
   * servidor quando é `ApiError`, senão `networkErrorFallback`.
   */
  onError: (message: string) => void;
  /** Frase de reserva quando o erro de rede não é um `ApiError` com mensagem própria. */
  networkErrorFallback: string;
};

/**
 * Acompanha um job por `GET /installs/{id}` até a fase virar terminal,
 * reagendando a cada {@link JOB_POLL_INTERVAL_MS} enquanto for intermediária.
 *
 * Não cancela sozinho no unmount do componente: nenhum dos hooks de origem
 * fazia isso, e mudar agora — sem suíte de teste no front — arriscaria o
 * contrato de que as telas dependem. O reagendamento só continua enquanto a
 * fase for intermediária, então o loop tem fim garantido quando o job termina.
 */
export function pollJob(jobId: string, handlers: PollJobHandlers): void {
  api
    .getInstallJob(jobId)
    .then((job) => {
      const outcome = jobOutcome(job.phase);
      if (outcome === "done") {
        handlers.onDone(job);
        return;
      }
      if (outcome === "failed") {
        handlers.onFailed(job);
        return;
      }
      if (outcome === "canceled" && handlers.onCanceled) {
        handlers.onCanceled(job);
        return;
      }
      // Intermediária — ou `"cancelado"` num hook que não a distingue, que é
      // o comportamento original desses hooks.
      handlers.onProgress(job);
      setTimeout(() => pollJob(jobId, handlers), JOB_POLL_INTERVAL_MS);
    })
    .catch((err) => {
      handlers.onError(err instanceof ApiError ? err.message : handlers.networkErrorFallback);
    });
}

/**
 * Igual a {@link pollJob}, mas resolve uma `Promise<void>` assim que o job
 * alcança qualquer fase terminal (ou erro de rede). Existe para o "baixar os
 * que faltam" sequencial de `EmulatorsScreen`, que precisa esperar um core
 * terminar antes de começar o próximo — 25 downloads em paralelo castigariam
 * a rede do usuário e o buildbot sem ganho nenhum.
 */
export function pollJobUntilSettled(jobId: string, handlers: PollJobHandlers): Promise<void> {
  return new Promise((resolve) => {
    const settling = (fn?: (job: InstallJob) => void) => (job: InstallJob) => {
      fn?.(job);
      resolve();
    };
    pollJob(jobId, {
      ...handlers,
      onDone: settling(handlers.onDone),
      onFailed: settling(handlers.onFailed),
      onCanceled: settling(handlers.onCanceled),
      onError: (message) => {
        handlers.onError(message);
        resolve();
      },
    });
  });
}
