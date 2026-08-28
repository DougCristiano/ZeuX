import { useState } from "react";
import { api, ApiError } from "../api";
import type { InstallJob } from "../api/types";

/**
 * Estado de download de UM core (ADR 0015, R2/R3) — por nome, não um único
 * estado pra tela inteira, porque baixar "sameboy" não pode travar o botão de
 * "mesen" numa lista de 25.
 */
export type CoreInstallState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "installing"; job: InstallJob }
  | { kind: "canceling"; job: InstallJob }
  | { kind: "error"; message: string };

/**
 * P2 (docs/roadmap.md, Sprint P): a máquina de download de core, extraída de
 * dentro de `RetroArchCoresList` (`EmulatorsScreen`) para ser compartilhada
 * com o detalhe do console — que precisa baixar **um** core (o que aquele
 * console usa), não a lista dos 25.
 *
 * Extraída em vez de reimplementada pelo mesmo motivo do M8/`useInlineInstall`:
 * o polling, o tratamento de "cancelado" como desistência e não falha, e a
 * readoção de jobs em andamento são detalhes que uma segunda implementação
 * por instinto erraria em silêncio — e o pior erro possível aqui (dois
 * caminhos disparando o mesmo core) já tem uma mensagem de servidor dedicada
 * ("já existe um download em andamento").
 *
 * `onCoreReady` é chamado quando um core conclui: quem usa o hook recarrega
 * o que precisa (a lista de cores, a prontidão do console). O hook não sabe
 * o que a tela mostra.
 */
export function useCoreInstall({ onCoreReady }: { onCoreReady?: () => void } = {}) {
  const [state, setState] = useState<Record<string, CoreInstallState>>({});

  function stateFor(name: string): CoreInstallState {
    return state[name] ?? { kind: "idle" };
  }

  function setCoreState(name: string, next: CoreInstallState) {
    setState((prev) => ({ ...prev, [name]: next }));
  }

  function pollCoreJob(name: string, jobId: string) {
    api
      .getInstallJob(jobId)
      .then((job) => {
        if (job.phase === "concluido") {
          setCoreState(name, { kind: "idle" });
          onCoreReady?.();
          return;
        }
        // "cancelado" (fase própria do R3) volta ao estado ocioso sem erro:
        // desistir não é falha.
        if (job.phase === "cancelado") {
          setCoreState(name, { kind: "idle" });
          return;
        }
        if (job.phase === "falhou") {
          // job.error já vem do servidor nomeando o core e o que aconteceu
          // (docs/api.md) — exibido como veio, sem reescrita.
          setCoreState(name, { kind: "error", message: job.error ?? "O download não foi concluído." });
          return;
        }
        setCoreState(name, { kind: "installing", job });
        setTimeout(() => pollCoreJob(name, jobId), 400);
      })
      .catch((err) => {
        setCoreState(name, {
          kind: "error",
          message: err instanceof ApiError ? err.message : "Não foi possível acompanhar o download.",
        });
      });
  }

  /**
   * Resolve quando o job deste core termina (de qualquer jeito). Existe para o
   * "baixar os que faltam", que precisa esperar um core antes de começar o
   * próximo — 25 downloads em paralelo castigariam a rede do usuário e o
   * buildbot sem nenhum ganho.
   */
  function waitForCore(name: string, jobId: string): Promise<void> {
    return new Promise((resolve) => {
      const tick = async () => {
        try {
          const job = await api.getInstallJob(jobId);
          if (job.phase === "concluido") {
            setCoreState(name, { kind: "idle" });
            onCoreReady?.();
            resolve();
            return;
          }
          if (job.phase === "cancelado") {
            setCoreState(name, { kind: "idle" });
            resolve();
            return;
          }
          if (job.phase === "falhou") {
            setCoreState(name, { kind: "error", message: job.error ?? "O download não foi concluído." });
            resolve();
            return;
          }
          setCoreState(name, { kind: "installing", job });
          setTimeout(tick, 400);
        } catch (err) {
          setCoreState(name, {
            kind: "error",
            message: err instanceof ApiError ? err.message : "Não foi possível acompanhar o download.",
          });
          resolve();
        }
      };
      tick();
    });
  }

  async function installCore(name: string) {
    setCoreState(name, { kind: "starting" });
    try {
      const job = await api.installRetroArchCore(name);
      if (job.phase === "concluido") {
        // No-op: StartCore achou o core já instalado antes de baixar
        // qualquer coisa (checagem que roda antes do manifesto, R3).
        setCoreState(name, { kind: "idle" });
        onCoreReady?.();
        return;
      }
      setCoreState(name, { kind: "installing", job });
      pollCoreJob(name, job.id);
    } catch (err) {
      setCoreState(name, {
        kind: "error",
        message: err instanceof ApiError ? err.message : "Não foi possível iniciar o download.",
      });
    }
  }

  async function cancelCore(name: string, job: InstallJob) {
    setCoreState(name, { kind: "canceling", job });
    try {
      await api.cancelInstall(job.id);
      // Não muda o estado aqui: o poll em andamento (pollCoreJob) vai ver
      // phase "cancelado" na próxima resposta e encerrar sozinho.
    } catch (err) {
      setCoreState(name, {
        kind: "error",
        message: err instanceof ApiError ? err.message : "Não foi possível cancelar o download.",
      });
    }
  }

  /**
   * Readota os downloads de core já em andamento neste daemon. Sem isto,
   * montar a tela durante um download mostrava "Instalar" para um core que já
   * estava baixando — e clicar de novo batia em "já existe um download em
   * andamento". Falhar aqui não impede usar a tela: o pior caso volta a ser
   * o de antes, o botão aparece e o servidor recusa com a mensagem certa.
   */
  function adoptRunningJobs() {
    api
      .getInstalls()
      .then((res) => {
        const running: Record<string, CoreInstallState> = {};
        for (const job of res.installs) {
          const name = job.core_name;
          if (!name) continue;
          if (job.phase === "concluido" || job.phase === "falhou" || job.phase === "cancelado") continue;
          running[name] = { kind: "installing", job };
        }
        if (Object.keys(running).length === 0) return;
        setState((prev) => ({ ...running, ...prev }));
        for (const [name, adopted] of Object.entries(running)) {
          if (adopted.kind === "installing") pollCoreJob(name, adopted.job.id);
        }
      })
      .catch(() => {});
  }

  return { stateFor, setCoreState, installCore, cancelCore, waitForCore, adoptRunningJobs };
}
