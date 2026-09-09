import { useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { ConsoleVerdict, EmulatorEntry, InstallJob, LibraryGame } from "../api/types";
import { evaluateGameLaunchability } from "../lib/gameLaunchability";
import { pollJob } from "../lib/pollJob";

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
  // 2026-09-09 (pedido do Douglas): o emulador acabou de ser instalado
  // automaticamente pelo clique em "Jogar", mas este console precisa de um
  // arquivo de BIOS que o ZeuX não fornece. Em vez de lançar mesmo assim (o
  // jogo abriria numa tela preta) ou de esperar o lançamento falhar, o app
  // avisa na hora: o emulador está pronto, falta o BIOS, e é aqui que ele
  // vai. Estado próprio, e não `confirm-bios`, porque a mensagem é outra
  // ("instalei o emulador pra você" vs. "você mandou jogar sem BIOS").
  | { kind: "bios-after-install"; adapterName: string; biosDir?: string; pendingGamePath: string }
  // Q5 (docs/roadmap.md, Sprint Q): o emulador é de fonte que o ZeuX não sabe
  // automatizar (emulador personalizado, ou plataforma/arquitetura sem asset).
  // Estado próprio, e não `error`: não aconteceu falha nenhuma — o app
  // simplesmente não instala este, e o que a pessoa precisa é saber onde
  // baixar e onde colocar.
  | { kind: "manual-install"; adapterId: string; adapterName: string; consoleId: string }
  | { kind: "error"; message: string };

/**
 * M8 (docs/sprint-m-plano.md, 2026-08-07): fluxo de instalação inline do L8,
 * extraído de `GamesScreen.handlePlay` pra ser compartilhado com
 * `AllGamesScreen` — clicar no badge "instalar emulador" da grade agora
 * dispara a mesma instalação, em vez de só falhar depois no `ErrorModal`.
 *
 * `handlePlay` aqui é a mesma cadeia de decisão de `evaluateGameLaunchability`
 * (compartilhada com o badge — uma só implementação de "este jogo pode
 * abrir?"), só que a ação de cada bloqueio (instalar, confirmar BIOS) fica
 * centralizada neste hook.
 *
 * Cadeia completa de "clicar Jogar num console cru" (2026-09-09):
 *  1. `not_installed` → instala o emulador mais compatível (o do parecer).
 *  2. Terminou a instalação → relê `GET /emulators` e reavalia:
 *     - RetroArch sem o core → `onLaunch` cai no 202 de `POST /games/launch`,
 *       que baixa o core e relança (a tela cuida disso em `doLaunch`).
 *     - BIOS necessária e ausente → `bios-after-install` (avisa, não lança).
 *     - senão → lança.
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
  // Guarda o jogo/parecer do último `handlePlay` para a reavaliação pós-
  // instalação (BIOS/core) — a instalação em si só carrega o `pendingGamePath`
  // como string, mas o passo seguinte precisa do console e do parecer.
  const lastPlay = useRef<{ game: LibraryGame; verdict: ConsoleVerdict | undefined } | null>(null);

  // Depois que a instalação do emulador termina: relê os emuladores (agora com
  // `installed: true` e o estado real da pasta de BIOS) e decide o próximo
  // passo. Sem a releitura, `bios_dir_empty` continuaria com o valor de antes
  // da instalação e o aviso de BIOS nunca apareceria.
  async function afterEmulatorInstalled(adapterId: string, pendingGamePath: string) {
    onEmulatorInstalled(adapterId);

    const play = lastPlay.current;
    if (!play || play.game.path !== pendingGamePath) {
      onLaunch(pendingGamePath);
      return;
    }

    try {
      const { emulators } = await api.getEmulators();
      const fresh = emulators.find((e) => e.adapter_id === adapterId);
      const launchability = evaluateGameLaunchability(play.game, play.verdict, fresh);
      if (launchability.reason === "bios_empty") {
        setState({
          kind: "bios-after-install",
          adapterName: fresh?.name ?? play.verdict?.emulator ?? "O emulador",
          biosDir: fresh?.bios_dir,
          pendingGamePath,
        });
        return;
      }
    } catch {
      // A releitura é só pra decidir se avisa do BIOS antes de lançar — se
      // falhar, seguimos pro lançamento, que ainda vai barrar sozinho se o
      // BIOS de fato faltar (o comportamento de antes desta cadeia).
    }
    onLaunch(pendingGamePath);
  }

  function pollInstallJob(jobId: string, pendingGamePath: string) {
    pollJob(jobId, {
      onProgress: (job) => setState({ kind: "installing", job, pendingGamePath }),
      onDone: (job) => {
        setState({ kind: "idle" });
        void afterEmulatorInstalled(job.adapter_id, pendingGamePath);
      },
      onFailed: (job) => setState({ kind: "error", message: job.error ?? "A instalação falhou." }),
      onError: (message) => setState({ kind: "error", message }),
      networkErrorFallback: "Não foi possível acompanhar a instalação.",
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
    lastPlay.current = { game, verdict };
    const launchability = evaluateGameLaunchability(game, verdict, adapterEntry);
    if (launchability.launchable) {
      onLaunch(game.path);
      return;
    }
    switch (launchability.reason) {
      case "not_installed":
        if (verdict?.adapter_id) startInstall(verdict.adapter_id, false, game.path);
        return;
      case "install_manual":
        setState({
          kind: "manual-install",
          adapterId: adapterEntry?.adapter_id ?? verdict?.adapter_id ?? "",
          adapterName: adapterEntry?.name ?? verdict?.emulator ?? "o emulador",
          consoleId: game.console_id,
        });
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
