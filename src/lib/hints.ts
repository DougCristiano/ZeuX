/**
 * Memória das ajudas de primeira visita: as dicas por tela (`FirstVisitTip`)
 * e a lista de primeiros passos da biblioteca (`FirstStepsChecklist`).
 *
 * Mora no `localStorage`, como o tour (`TourOverlay`) e o splash: é preferência
 * de tela deste computador, não dado que precise viajar pelo servidor nem
 * sobreviver a uma reinstalação do banco.
 *
 * As duas funções de leitura erram para lados opostos de propósito. O tour
 * responde "não vi" quando o `localStorage` falha, porque mostrar de novo é o
 * erro barato — acontece uma vez por abertura. Uma dica por tela, se errasse
 * assim, voltaria a cada visita e sem jeito de ser dispensada de verdade;
 * então sem memória ela **não aparece** ("já vi"). A lista de primeiros
 * passos não tem esse problema: ela some sozinha no primeiro jogo aberto.
 */

const TIP_PREFIX = "zeux.tip.";
const FIRST_STEPS_DISMISSED_KEY = "zeux.first-steps-dismissed";

/** Uma dica por tela que ganhou uma (ver `FirstVisitTip`). */
export type TipId = "consoles" | "console-detail" | "settings";

const ALL_TIPS: TipId[] = ["consoles", "console-detail", "settings"];

export function hasSeenTip(id: TipId): boolean {
  try {
    return localStorage.getItem(TIP_PREFIX + id) === "1";
  } catch {
    return true;
  }
}

export function markTipSeen(id: TipId) {
  try {
    localStorage.setItem(TIP_PREFIX + id, "1");
  } catch {
    // Sem persistência a dica só some nesta visita — e `hasSeenTip` já
    // responde "vista" da próxima vez, então ela não vira um incômodo.
  }
}

export function isFirstStepsDismissed(): boolean {
  try {
    return localStorage.getItem(FIRST_STEPS_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissFirstSteps() {
  try {
    localStorage.setItem(FIRST_STEPS_DISMISSED_KEY, "1");
  } catch {
    // Vale só até fechar a tela — a lista some sozinha no primeiro jogo.
  }
}

/**
 * "Rever dicas" (Configurações): traz de volta as dicas por tela e a lista de
 * primeiros passos. Não mexe no tour, que tem o próprio botão.
 */
export function resetHints() {
  try {
    for (const id of ALL_TIPS) localStorage.removeItem(TIP_PREFIX + id);
    localStorage.removeItem(FIRST_STEPS_DISMISSED_KEY);
  } catch {
    // Nada a fazer — sem `localStorage` também não havia o que rever.
  }
}
