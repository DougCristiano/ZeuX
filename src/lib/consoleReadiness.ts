import type { ConsoleEntry, ConsoleEmulatorOption, EmulatorEntry, LibraryFolder, RetroArchCoreStatus } from "../api/types";

/**
 * "O que falta para este console rodar?" — a regra única da tela de consoles,
 * aqui e não dentro dela pelo mesmo motivo de `gameLaunchability.ts`: a lista
 * e o detalhe do console precisam responder isso igual, e uma segunda
 * implementação por instinto divergiria calada.
 *
 * **Não olha hardware de propósito.** O parecer (`ConsoleVerdict`) responde
 * "esta máquina aguenta?", exige consentimento e scan, e nunca bloqueia nada
 * (princípio 5 do `CLAUDE.md`: informar, não bloquear). O que está aqui é
 * outra pergunta — "o ZeuX tem as peças no lugar?" —, é a mesma resposta em
 * qualquer máquina, e vale também para quem recusou o scan.
 *
 * A ordem das etapas é a ordem em que cada peça bloqueia a seguinte: sem
 * emulador não adianta falar de core, sem core o jogo não abre nem com BIOS,
 * e uma pasta de jogos apontada não serve de nada se nada disso está de pé.
 */
export type ReadinessStep = "sem-suporte" | "sem-emulador" | "sem-core" | "sem-bios" | "sem-pasta" | "pronto";

export interface ConsoleReadiness {
  step: ReadinessStep;
  /** Rótulo curto pro selo do card. */
  badge: string;
  /** Frase completa, já exibível — o que falta e o que fazer a respeito. */
  detail: string;

  /**
   * A opção que o ZeuX usaria hoje: a primeira **instalada** na ordem de
   * `console.emulators` (standalone antes do RetroArch). Espelha
   * `Registry.Resolve`, que também pega o primeiro candidato instalado.
   * Ausente quando nenhuma está instalada.
   */
  chosen?: ConsoleEmulatorOption;

  /**
   * O core que falta, quando `step` é "sem-core". Nomeado porque "instale o
   * core" sem dizer qual não diz o que fazer (mesma regra do princípio 3:
   * nomear o que barra, nunca uma nota opaca).
   */
  missingCore?: string;
}

/**
 * Índices montados uma vez por tela e reusados nos 33 consoles — sem eles,
 * cada console faria uma varredura linear nas mesmas listas, e o custo da
 * tela viraria O(consoles × emuladores). Ver o orçamento de complexidade em
 * `docs/arquitetura-a-preservar.md`.
 */
export interface ReadinessIndex {
  emulatorById: Map<string, EmulatorEntry>;
  coreByName: Map<string, RetroArchCoreStatus>;
  consolesComPasta: Set<string>;
}

export function buildReadinessIndex(
  emulators: EmulatorEntry[],
  cores: RetroArchCoreStatus[],
  folders: LibraryFolder[],
): ReadinessIndex {
  return {
    emulatorById: new Map(emulators.map((e) => [e.adapter_id, e])),
    coreByName: new Map(cores.map((c) => [c.name, c])),
    consolesComPasta: new Set(folders.map((f) => f.console_id)),
  };
}

export function evaluateConsoleReadiness(console: ConsoleEntry, index: ReadinessIndex): ConsoleReadiness {
  if (console.emulators.length === 0) {
    return {
      step: "sem-suporte",
      badge: "sem emulador no ZeuX",
      detail: `O ZeuX ainda não conhece nenhum emulador para ${console.name}.`,
    };
  }

  // O primeiro instalado na ordem que o backend mandou — nunca reordenada
  // aqui (a preferência por emulador dedicado é regra de produto e mora em
  // Registry.ForConsole).
  const chosen = console.emulators.find((option) => index.emulatorById.get(option.adapter_id)?.installed);

  if (!chosen) {
    const nomes = console.emulators.map((o) => o.name).join(" ou ");
    return {
      step: "sem-emulador",
      badge: "instalar emulador",
      detail:
        console.emulators.length === 1
          ? `${nomes} atende este console, mas não está instalado.`
          : `Nenhum emulador deste console está instalado. O ZeuX conhece ${nomes}.`,
    };
  }

  // Core só existe para quem carrega cores plugáveis (hoje só o RetroArch) —
  // `core` ausente é "este emulador não tem core", não "core desconhecido".
  if (chosen.core && !index.coreByName.get(chosen.core)?.installed) {
    return {
      step: "sem-core",
      badge: "baixar core",
      detail: `O ${chosen.name} está instalado, mas o core ${chosen.core}, que este console usa, ainda não.`,
      chosen,
      missingCore: chosen.core,
    };
  }

  // BIOS só é afirmado quando o ZeuX sabe de verdade onde ESTE emulador lê o
  // arquivo — `bios_dir` só vem preenchida nos casos verificados ao vivo (ver
  // BiosDir, internal/emulator/bios_dir.go). Um console marcado
  // `requires_external_file` cujo emulador não tem `bios_dir` conhecida
  // **não** é reportado como faltando BIOS: o ZeuX não sabe, e afirmar que
  // falta seria tão errado quanto afirmar que está lá (princípio 4 —
  // dado não verificável não conta como atendido nem como não atendido).
  const emulador = index.emulatorById.get(chosen.adapter_id);
  if (emulador?.bios_dir && emulador.bios_dir_empty) {
    return {
      step: "sem-bios",
      badge: "BIOS ausente",
      detail: `A pasta de BIOS do ${chosen.name} está vazia. Sem o arquivo, os jogos deste console não devem abrir.`,
      chosen,
    };
  }

  if (!index.consolesComPasta.has(console.console_id)) {
    return {
      step: "sem-pasta",
      badge: "apontar pasta",
      detail: `${chosen.name} está pronto. Falta apontar a pasta com os jogos de ${console.short_name}.`,
      chosen,
    };
  }

  return {
    step: "pronto",
    badge: "pronto",
    detail: `${chosen.name} instalado e pasta de jogos apontada.`,
    chosen,
  };
}
