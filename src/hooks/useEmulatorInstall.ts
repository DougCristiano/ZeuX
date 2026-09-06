import { useState } from "react";
import { api, ApiError } from "../api";
import type { InstallJob } from "../api/types";

/**
 * Item B10 (docs/sprint-b-plano.md): instalar com ressalva de hardware. O
 * servidor já faz a parte que importa — `hardwareBlocks` recusa com 409 e
 * `override_hint`, `/installs/{id}` acompanha o progresso — quem usa isto só
 * não pode estragar isso.
 */
export type EmulatorInstallState =
  | { kind: "idle" }
  | { kind: "starting" }
  // message vem de ApiError.message (docs/api.md, code hardware_insufficient)
  // — nunca uma frase escrita no cliente. Ver handleInstall em
  // internal/api/server.go, hardwareBlocks.
  | { kind: "confirm-hardware"; message: string }
  | { kind: "installing"; job: InstallJob }
  | { kind: "done"; job: InstallJob }
  | { kind: "error"; message: string }
  | { kind: "confirm-remove" }
  | { kind: "removing" }
  | { kind: "remove-error"; message: string };

/**
 * P2 (docs/roadmap.md, Sprint P): a máquina de instalar/remover um emulador,
 * extraída de `EmulatorCardActions` (`EmulatorsScreen`) para o detalhe do
 * console poder oferecer as mesmas ações sem uma segunda cópia dela.
 *
 * Diferente de `useInlineInstall` (M8), que é a instalação disparada por
 * "Jogar" e carrega o jogo pendente para lançar no fim: aqui a instalação é
 * o fim em si, não um meio para abrir uma ROM.
 *
 * `onChanged` é chamado quando algo que a lista de emuladores mostra muda
 * (instalou, removeu) — quem usa recarrega o que precisa.
 */
export function useEmulatorInstall({ adapterId, onChanged }: { adapterId: string; onChanged: () => void }) {
  const [state, setState] = useState<EmulatorInstallState>({ kind: "idle" });

  function pollJob(jobId: string) {
    api
      .getInstallJob(jobId)
      .then((job) => {
        if (job.phase === "concluido") {
          setState({ kind: "done", job });
          onChanged();
          return;
        }
        if (job.phase === "falhou") {
          // job.error é a mensagem original do servidor (docs/api.md) —
          // exibida como veio, igual ao erro de rota.
          setState({ kind: "error", message: job.error ?? "A instalação falhou." });
          return;
        }
        setState({ kind: "installing", job });
        setTimeout(() => pollJob(jobId), 400);
      })
      .catch((err) => {
        setState({
          kind: "error",
          message: err instanceof ApiError ? err.message : "Não foi possível acompanhar a instalação.",
        });
      });
  }

  async function install(force: boolean) {
    setState({ kind: "starting" });
    try {
      const job = await api.installEmulator(adapterId, force);
      setState({ kind: "installing", job });
      pollJob(job.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === "hardware_insufficient") {
        setState({ kind: "confirm-hardware", message: err.message });
        return;
      }
      setState({
        kind: "error",
        message: err instanceof ApiError ? err.message : "Não foi possível iniciar a instalação.",
      });
    }
  }

  async function remove() {
    setState({ kind: "removing" });
    try {
      await api.uninstallEmulator(adapterId);
      onChanged();
      setState({ kind: "idle" });
    } catch (err) {
      setState({
        kind: "remove-error",
        // err.message já vem do servidor — nunca reescrita aqui.
        message: err instanceof ApiError ? err.message : "Não foi possível remover este emulador.",
      });
    }
  }

  return { state, setState, install, remove };
}
