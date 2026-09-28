import type { ConsoleEntry, LibraryFolder } from "../api/types";
import { evaluateConsoleReadiness, type ReadinessIndex } from "./consoleReadiness";

/**
 * "Por onde eu começo?" — os três primeiros passos de quem abre o ZeuX,
 * calculados do estado real da máquina, nunca de um contador guardado.
 *
 * Fica aqui, e não dentro do componente, pelo mesmo motivo de
 * `consoleReadiness.ts`: a lista precisa concordar com a tela de consoles
 * sobre o que falta, e uma segunda regra por instinto divergiria calada. O
 * passo do meio **reaproveita** `evaluateConsoleReadiness` — quem diz o que
 * falta para um console rodar continua sendo uma regra só.
 *
 * **Informa, não bloqueia** (princípio 5 do `CLAUDE.md`): o primeiro passo
 * ainda pendente é o destacado, mas os seguintes continuam legíveis. Em
 * particular, "abrir o primeiro jogo" nunca espera o passo do emulador — o
 * RetroArch baixa o core sozinho na primeira vez que o jogo abre, então
 * exigir o core antes seria mais rígido que o próprio ZeuX.
 */
export type FirstStepId = "folder" | "emulator" | "play";

/** `current` é o primeiro passo ainda não feito — o único que ganha ação. */
export type FirstStepState = "done" | "current" | "todo";

export interface FirstStep {
  id: FirstStepId;
  state: FirstStepState;
  /** O console que o passo nomeia (o pronto, se houver; senão o que falta). */
  console?: ConsoleEntry;
  /**
   * O que falta, já em frase exibível — vem direto de
   * `ConsoleReadiness.detail`, então nomeia a peça que barra (princípio 3).
   * Só existe no passo do emulador, e só enquanto ele está pendente.
   */
  detail?: string;
}

export interface FirstStepsProgress {
  steps: FirstStep[];
  doneCount: number;
  /** Jogou pelo menos uma vez — a lista deixa de fazer sentido. */
  complete: boolean;
}

export function evaluateFirstSteps({
  consoles,
  folders,
  index,
  played,
}: {
  consoles: ConsoleEntry[];
  folders: LibraryFolder[];
  index: ReadinessIndex;
  played: boolean;
}): FirstStepsProgress {
  const folderDone = folders.length > 0;

  // Só os consoles com pasta apontada entram na conta: é onde o usuário tem
  // jogo, então é o único onde "emulador pronto" muda alguma coisa para ele.
  const withFolder = new Set(folders.map((f) => f.console_id));
  const candidates = consoles
    .filter((c) => withFolder.has(c.console_id))
    .map((c) => ({ console: c, readiness: evaluateConsoleReadiness(c, index) }));

  let emulatorDone = false;
  let emulatorConsole: ConsoleEntry | undefined;
  let emulatorDetail: string | undefined;

  if (folderDone) {
    const ready = candidates.find((c) => c.readiness.step === "pronto");
    if (ready) {
      emulatorDone = true;
      emulatorConsole = ready.console;
    } else {
      // Sem console pronto, nomeia o primeiro que ao menos tem emulador
      // conhecido — "o ZeuX não conhece emulador para X" não é um passo que o
      // usuário consiga cumprir. Se nenhum tem, cai no primeiro mesmo: a
      // frase dele diz a verdade.
      const target = candidates.find((c) => c.readiness.step !== "sem-suporte") ?? candidates[0];
      emulatorConsole = target?.console;
      emulatorDetail = target?.readiness.detail;
    }
  }

  const done: Record<FirstStepId, boolean> = { folder: folderDone, emulator: emulatorDone, play: played };
  const order: FirstStepId[] = ["folder", "emulator", "play"];
  const firstPending = order.find((id) => !done[id]);

  const steps: FirstStep[] = order.map((id) => ({
    id,
    state: done[id] ? "done" : id === firstPending ? "current" : "todo",
    console: id === "emulator" ? emulatorConsole : undefined,
    detail: id === "emulator" && !done.emulator ? emulatorDetail : undefined,
  }));

  return { steps, doneCount: order.filter((id) => done[id]).length, complete: played };
}
