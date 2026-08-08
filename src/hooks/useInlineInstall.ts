import { useState } from "react";
import { api, ApiError } from "../api";
import type { ConsoleVerdict, EmulatorEntry, InstallJob, LibraryGame } from "../api/types";
import { evaluateGameLaunchability } from "../lib/gameLaunchability";

// Estado da instalação inline (L8): um só por tela, não por jogo — jogos do
// mesmo console compartilham o mesmo adapter, então uma instalação em
// andamento vale pra todos eles. `pendingGamePath` guarda qual jogo disparou
// o clique, pra lançar assim que a instalação terminar (usuário não deveria
// precisar clicar de novo).
export type InstallState =
  | { kind: "idle" }
  | { kind: "confirm-hardware"; message: string; pendingGamePath: string; adapterId: string }
  // Achado em 2026-08-04: diferente de hardware fraco (que pode rodar mal,
  // mas roda), sem BIOS o jogo nunca abre — confirma antes de tentar, em vez
  // de deixar clicar "Jogar" e só descobrir depois que falhou.
  | { kind: "confirm-bios"; pendingGamePath: string }
  | { kind: "installing"; job: InstallJob; pendingGamePath: string }
  | { kind: "error"; message: string };

/**
 * M8 (docs/sprint-m-plano.md, 2026-08-07): fluxo de instalação inline do L8,
 * extraído de `GamesScreen.handlePlay` pra ser compartilhado com
 * `AllGamesScreen` — clicar no badge "instalar emulador" da grade agora
 * dispara a mesma instalação, em vez de só falhar depois no `ErrorModal`.
 * É o "maior pedaço" do item, citado no próprio plano.
 *
 * `handlePlay` aqui é a mesma cadeia de decisão de antes
 * (`evaluateGameLaunchability`, agora compartilhada com o badge — critério
 * de aceite do item: uma só implementação de "este jogo pode abrir?"), só
 * que a ação de cada bloqueio (instalar, confirmar BIOS) fica centralizada
 * neste hook em vez de reescrita em cada tela.
 */
export function useInlineInstall({
  onEmulatorInstalled,
  onLaunch,
}: {
  /** Chamado quando a instalação termina — quem chama atualiza a lista local (`installed: true`). */
  onEmulatorInstalled: (adapterId: string) => void;
  /** Chamado com o caminho do jogo pendente, assim que der pra lançar (emulador pronto, BIOS confirmada). */
  onLaunch: (romPath: string) => void;
}) {
  const [state, setState] = useState<InstallState>({ kind: "idle" });

  function pollInstallJob(jobId: string, pendingGamePath: string) {
    api
      .getInstallJob(jobId)
      .then((job) => {
        if (job.phase === "concluido") {
          setState({ kind: "idle" });
          onEmulatorInstalled(job.adapter_id);
          onLaunch(pendingGamePath);
          return;
        }
        if (job.phase === "falhou") {
          setState({ kind: "error", message: job.error ?? "A instalação falhou." });
          return;
        }
        setState({ kind: "installing", job, pendingGamePath });
        setTimeout(() => pollInstallJob(jobId, pendingGamePath), 400);
      })
      .catch((err) => {
        setState({
          kind: "error",
          message: err instanceof ApiError ? err.message : "Não foi possível acompanhar a instalação.",
        });
      });
  }

  function startInstall(adapterId: string, force: boolean, pendingGamePath: string) {
    api
      .installEmulator(adapterId, force)
      .then((job) => {
        setState({ kind: "installing", job, pendingGamePath });
        pollInstallJob(job.id, pendingGamePath);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === "hardware_insufficient") {
          setState({ kind: "confirm-hardware", message: err.message, pendingGamePath, adapterId });
          return;
        }
        setState({
          kind: "error",
          message: err instanceof ApiError ? err.message : "Não foi possível iniciar a instalação.",
        });
      });
  }

  // Ponto de entrada único: mesma cadeia de decisão que
  // `evaluateGameLaunchability` descreve, agora executando a ação de cada
  // bloqueio em vez de só descrevê-la.
  function handlePlay(game: LibraryGame, verdict: ConsoleVerdict | undefined, adapterEntry: EmulatorEntry | undefined) {
    const launchability = evaluateGameLaunchability(game, verdict, adapterEntry);
    if (launchability.launchable) {
      onLaunch(game.path);
      return;
    }
    switch (launchability.reason) {
      case "not_installed":
        if (verdict?.adapter_id) startInstall(verdict.adapter_id, false, game.path);
        return;
      case "bios_empty":
        setState({ kind: "confirm-bios", pendingGamePath: game.path });
        return;
      default:
        // "missing" e "no_preset" não têm ação de instalação — informar, não
        // bloquear (princípio 5): deixa o clique cair no `launch` mesmo
        // assim, pro erro real do servidor aparecer no ErrorModal.
        onLaunch(game.path);
    }
  }

  return { state, setState, startInstall, handlePlay };
}
