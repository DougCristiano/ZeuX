import { useState } from "react";
import { api, ApiError, isDownloadingCore } from "../api";
import type { InstallJob, LibraryGame } from "../api/types";
import { pollJob } from "../lib/pollJob";

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
 * Não cobre sozinho o fluxo mais rico de `GamesScreen` (instalar emulador
 * inline, confirmar hardware insuficiente, confirmar BIOS vazio) — essa
 * profundidade vive em `useInlineInstall`, e as telas que precisam dela
 * (por console, "Todos os jogos", detalhe do jogo) compõem os dois hooks:
 * `useInlineInstall` ramifica por motivo e, quando é hora de abrir, chama o
 * `launch` daqui.
 *
 * `onLaunched` (2026-09-09): disparado quando um lançamento de fato abre o
 * jogo (status `launched`) — nunca no caminho de download de core, que ainda
 * não abriu nada. É o gancho para a tela recarregar o que a sessão nova
 * muda (tempo de jogo, faixa "Continue jogando", capa) sem um F5.
 * `GamesScreen` já fazia isso à mão com um `loadGames()` logo após
 * `api.launch`; quem usa este hook não tinha como.
 */
export function useLaunchGame(opts?: { onLaunched?: () => void }) {
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

  // Acompanha o download do core disparado pelo próprio /games/launch. Ao
  // terminar, **esta tela** repete o lançamento — o servidor não abre o jogo
  // sozinho (decisão do Douglas, 2026-08-27): abrir um processo de jogo
  // minutos depois surpreenderia quem já tinha saído da tela. A segunda
  // chamada acha o core no lugar e cai no caminho normal de lançamento.
  function pollCoreDownload(game: LibraryGame, jobId: string) {
    const gameId = game.id;
    pollJob(jobId, {
      onProgress: (job) => setStatus(gameId, { kind: "downloading-core", job }),
      // Core baixado: **esta tela** repete o lançamento (ver comentário acima).
      // A proteção anti-laço-infinito de `afterCoreDownload` vive dentro de
      // `launch`, não aqui.
      onDone: () => {
        void launch(game, true);
      },
      onCanceled: () => setStatus(gameId, { kind: "idle" }),
      onFailed: (job) => {
        // Mensagem literal do servidor, que já nomeia o core e o motivo.
        const message = job.error ?? "O download do core não foi concluído.";
        setStatus(gameId, { kind: "error", message });
        setLaunchError(message);
      },
      onError: (message) => {
        setStatus(gameId, { kind: "error", message });
        setLaunchError(message);
      },
      networkErrorFallback: "Não foi possível acompanhar o download do core.",
    });
  }

  /**
   * `afterCoreDownload` marca a segunda tentativa, feita logo depois de um
   * download de core terminar. Se ela também pedir download, alguma coisa
   * está errada (o core não ficou onde a busca procura) — parar ali evita
   * baixar em laço infinito, gastando banda até alguém perceber.
   */
  async function launch(game: LibraryGame, afterCoreDownload = false) {
    setLastGame(game);
    setStatus(game.id, { kind: "launching" });
    try {
      const result = await api.launch({ rom_path: game.path, console_id: game.console_id });
      // 202: o core do RetroArch faltava e está sendo baixado agora. Dizer
      // "jogo aberto" aqui seria mentira — o jogo só abre no fim do download.
      if (isDownloadingCore(result)) {
        if (afterCoreDownload) {
          const message =
            "O core foi baixado, mas o ZeuX continua não encontrando ele no computador. Tente abrir o jogo de novo; se persistir, confira a lista de cores na tela de Emuladores.";
          setStatus(game.id, { kind: "error", message });
          setLaunchError(message);
          return;
        }
        setStatus(game.id, { kind: "downloading-core", job: result.install_job });
        pollCoreDownload(game, result.install_job.id);
        return;
      }
      setStatus(game.id, { kind: "launched" });
      // Só aqui: o jogo abriu de verdade. O caminho de download de core acima
      // retorna antes de chegar nesta linha; a segunda tentativa
      // (`afterCoreDownload`) volta por aqui e dispara o gancho normalmente.
      opts?.onLaunched?.();
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
