import { useState } from "react";
import { api, ApiError, isDownloadingCore } from "../api";
import type { InstallJob, LibraryGame } from "../api/types";

export type LaunchStatus =
  | { kind: "idle" }
  | { kind: "launching" }
  // ADR 0015 (R3): o console é atendido pelo RetroArch e o core ainda não
  // está no computador. O servidor baixa e abre o jogo sozinho ao terminar —
  // esta fase existe para que a tela diga isso, em vez de anunciar uma
  // sessão que ainda não começou.
  | { kind: "downloading-core"; job: InstallJob }
  | { kind: "launched" }
  | { kind: "error"; message: string };

/**
 * Lógica de "clicar Jogar e lançar direto" (autoconfigurado pelo parecer,
 * `options` omitido), extraída de `AllGamesScreen`/`GameDetailScreen`
 * (Sprint 3 do plano de migração visual, 2026-08-04 —
 * /home/douglas/.claude/plans/sleepy-roaming-pearl.md) para não duplicar a
 * mesma lógica pela terceira vez.
 *
 * Deliberadamente NÃO cobre o fluxo mais rico de `GamesScreen` (instalar
 * emulador inline, confirmar hardware insuficiente, confirmar BIOS vazio) —
 * essa profundidade continua só na tela por console, de propósito.
 */
export function useLaunchGame() {
  const [statusByGameId, setStatusByGameId] = useState<Record<number, LaunchStatus>>({});
  const [launchError, setLaunchError] = useState<string | null>(null);
  // Guardado só para o "Tentar de novo" do ErrorModal (M1,
  // docs/sprint-m-plano.md) — sem isto o botão não saberia qual jogo
  // relançar, já que o erro em si (`launchError`) não carrega o jogo.
  const [lastGame, setLastGame] = useState<LibraryGame | null>(null);

  function statusFor(gameId: number): LaunchStatus {
    return statusByGameId[gameId] ?? { kind: "idle" };
  }

  function setStatus(gameId: number, status: LaunchStatus) {
    setStatusByGameId((prev) => ({ ...prev, [gameId]: status }));
  }

  // Acompanha o download do core disparado pelo próprio /games/launch. Quando
  // termina, o servidor já abriu o jogo (launchWhenCoreReady, R3) — daí ir
  // direto para "launched" sem uma segunda chamada de lançamento.
  async function pollCoreDownload(gameId: number, jobId: string) {
    try {
      const job = await api.getInstallJob(jobId);
      if (job.phase === "concluido") {
        setStatus(gameId, { kind: "launched" });
        return;
      }
      if (job.phase === "cancelado") {
        setStatus(gameId, { kind: "idle" });
        return;
      }
      if (job.phase === "falhou") {
        // Mensagem literal do servidor, que já nomeia o core e o motivo.
        const message = job.error ?? "O download do core não foi concluído.";
        setStatus(gameId, { kind: "error", message });
        setLaunchError(message);
        return;
      }
      setStatus(gameId, { kind: "downloading-core", job });
      setTimeout(() => pollCoreDownload(gameId, jobId), 400);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Não foi possível acompanhar o download do core.";
      setStatus(gameId, { kind: "error", message });
      setLaunchError(message);
    }
  }

  async function launch(game: LibraryGame) {
    setLastGame(game);
    setStatus(game.id, { kind: "launching" });
    try {
      const result = await api.launch({ rom_path: game.path, console_id: game.console_id });
      // 202: o core do RetroArch faltava e está sendo baixado agora. Dizer
      // "jogo aberto" aqui seria mentira — o jogo só abre no fim do download.
      if (isDownloadingCore(result)) {
        setStatus(game.id, { kind: "downloading-core", job: result.install_job });
        pollCoreDownload(game.id, result.install_job.id);
        return;
      }
      setStatus(game.id, { kind: "launched" });
    } catch (err) {
      // Mensagem literal do servidor — nunca reescrita (regra do projeto).
      const message = err instanceof ApiError ? err.message : "Não foi possível abrir o jogo.";
      setStatus(game.id, { kind: "error", message });
      setLaunchError(message);
    }
  }

  // Desiste de um download de core em andamento (R3) — o jogo não abre, e o
  // botão volta a "Jogar" sozinho quando o poll vir a fase "cancelado".
  async function cancelCoreDownload(gameId: number, job: InstallJob) {
    try {
      await api.cancelInstall(job.id);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Não foi possível cancelar o download.";
      setStatus(gameId, { kind: "error", message });
      setLaunchError(message);
    }
  }

  // Download de core em andamento, se houver — para telas que mostram o
  // progresso num painel único (AllGamesScreen usa grade virtualizada, onde
  // um indicador preso ao tile do jogo some quando ele sai da viewport).
  // Só um por vez na prática: o usuário clica um "Jogar" de cada vez.
  const activeCoreDownload = (() => {
    const entries = Object.entries(statusByGameId) as [string, LaunchStatus][];
    for (const [gameId, status] of entries) {
      if (status.kind === "downloading-core") return { gameId: Number(gameId), job: status.job };
    }
    return null;
  })();

  // Relança o mesmo jogo da última tentativa, sem o chamador precisar
  // guardar o `LibraryGame` por conta própria.
  function retryLaunch() {
    if (lastGame) launch(lastGame);
  }

  return {
    statusFor,
    launch,
    activeCoreDownload,
    cancelCoreDownload,
    launchError,
    clearLaunchError: () => setLaunchError(null),
    retryLaunch,
  };
}
