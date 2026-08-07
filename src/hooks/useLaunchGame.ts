import { useState } from "react";
import { api, ApiError } from "../api";
import type { LibraryGame } from "../api/types";

export type LaunchStatus =
  | { kind: "idle" }
  | { kind: "launching" }
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

  async function launch(game: LibraryGame) {
    setLastGame(game);
    setStatusByGameId((prev) => ({ ...prev, [game.id]: { kind: "launching" } }));
    try {
      await api.launch({ rom_path: game.path, console_id: game.console_id });
      setStatusByGameId((prev) => ({ ...prev, [game.id]: { kind: "launched" } }));
    } catch (err) {
      // Mensagem literal do servidor — nunca reescrita (regra do projeto).
      const message = err instanceof ApiError ? err.message : "Não foi possível abrir o jogo.";
      setStatusByGameId((prev) => ({ ...prev, [game.id]: { kind: "error", message } }));
      setLaunchError(message);
    }
  }

  // Relança o mesmo jogo da última tentativa, sem o chamador precisar
  // guardar o `LibraryGame` por conta própria.
  function retryLaunch() {
    if (lastGame) launch(lastGame);
  }

  return {
    statusFor,
    launch,
    launchError,
    clearLaunchError: () => setLaunchError(null),
    retryLaunch,
  };
}
