import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { ConsoleEntry, EmulatorEntry, LibraryFolder, RetroArchCoreStatus } from "../api/types";
import { buildReadinessIndex } from "../lib/consoleReadiness";
import { evaluateFirstSteps, type FirstStepsProgress } from "../lib/firstSteps";
import { dismissFirstSteps, isFirstStepsDismissed } from "../lib/hints";

/**
 * Estado da lista de primeiros passos da biblioteca.
 *
 * Busca aqui só o que a tela ainda não tem — pastas, cores e o histórico. Os
 * emuladores e o catálogo de consoles a `AllGamesScreen` já carrega para si, e
 * chegam por argumento em vez de serem pedidos de novo.
 *
 * "Já jogou?" junta duas fontes de propósito. O histórico (`GET /sessions`) é
 * a resposta completa, mas só é lido ao abrir a tela; o "jogado recentemente"
 * que a tela já atualiza a cada lançamento faz a lista sumir na hora em que o
 * primeiro jogo abre, sem esperar o usuário sair e voltar.
 *
 * `progress` é `null` sempre que **algum dado não chegou ou falhou**: a lista
 * não aparece. É de propósito — uma falha em `GET /retroarch/cores` tratada
 * como "lista vazia" faria todo console do RetroArch parecer sem core, e a
 * lista afirmaria uma falta que ela não verificou (princípio 4). Uma ajuda de
 * primeira execução que some é melhor que uma que erra.
 */
export function useFirstSteps({
  consoles,
  emulators,
  recentlyPlayed,
}: {
  consoles: ConsoleEntry[] | undefined;
  emulators: EmulatorEntry[] | null;
  /** `null` enquanto a lista de jogos recentes ainda não respondeu. */
  recentlyPlayed: boolean | null;
}): { progress: FirstStepsProgress | null; dismiss: () => void } {
  const [folders, setFolders] = useState<LibraryFolder[] | null>(null);
  const [cores, setCores] = useState<RetroArchCoreStatus[] | null>(null);
  const [playedBefore, setPlayedBefore] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(isFirstStepsDismissed);

  useEffect(() => {
    let alive = true;
    api
      .getLibraryFolders()
      .then((res) => alive && setFolders(res.folders))
      .catch(() => {});
    api
      .getRetroArchCores()
      .then((res) => alive && setCores(res.cores))
      .catch(() => {});
    api
      .getSessions()
      // Tempo medido > 0: uma sessão que morreu ao abrir (ou foi encerrada
      // sem duração ao reiniciar o daemon) não conta como "já joguei".
      .then((res) => alive && setPlayedBefore(res.sessions.some((s) => s.duration_seconds > 0)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const progress = useMemo(() => {
    if (dismissed || !consoles || !emulators || !folders || !cores || playedBefore === null || recentlyPlayed === null) {
      return null;
    }
    const result = evaluateFirstSteps({
      consoles,
      folders,
      index: buildReadinessIndex(emulators, cores, folders),
      played: playedBefore || recentlyPlayed,
    });
    return result.complete ? null : result;
  }, [dismissed, consoles, emulators, folders, cores, playedBefore, recentlyPlayed]);

  return {
    progress,
    dismiss: () => {
      dismissFirstSteps();
      setDismissed(true);
    },
  };
}
