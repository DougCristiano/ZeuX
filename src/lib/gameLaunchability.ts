import type { ConsoleVerdict, EmulatorEntry, LibraryGame } from "../api/types";

/**
 * M8 (docs/sprint-m-plano.md): "este jogo pode abrir?" — regra única, usada
 * por `AllGamesScreen` e `GamesScreen` (antes só existia dentro de
 * `GamesScreen.handlePlay`, reimplementada por instinto se a grade
 * precisasse da mesma checagem). Não decide se o jogo LANÇA — decide o que
 * a grade sinaliza sem bloquear o clique (princípio 5 do `CLAUDE.md`:
 * informar, não bloquear).
 *
 * Ordem de checagem espelha exatamente `GamesScreen.handlePlay`: arquivo
 * ausente vence tudo, depois "sem preset automático" (nem vale checar
 * emulador instalado se não há preset pra aplicar), depois emulador não
 * instalado, depois BIOS vazia.
 */
export type LaunchBlockReason = "missing" | "no_preset" | "not_installed" | "bios_empty";

export interface GameLaunchability {
  launchable: boolean;
  reason?: LaunchBlockReason;
  /** Texto curto pro badge da grade. Ausente quando `launchable` é `true`. */
  badge?: string;
  /** Frase completa pro `title` (tooltip nativo) do badge — sempre mais explicativa que o badge. */
  title?: string;
}

// M8, decidido pelo Douglas em 2026-08-07: "sem preset" precisa nomear o
// motivo, não só o fato. `verdict.bottlenecks` já nomeia o componente que
// barra (princípio 3), mas como frase completa em português
// ("Este patamar pede 6 threads de processador; esta CPU oferece 4."), não
// como rótulo curto — não existe um campo estruturado "GPU"/"CPU"/"RAM" na
// API. Este mapa deriva um rótulo curto casando substrings **fixas**, uma
// por template de `checkRequirements` (internal/verdict/verdict.go) — se
// aquele texto mudar, a pior consequência é o badge cair no genérico (fallback
// abaixo), nunca quebrar. Preferido a mudar o contrato da API só pra um
// rótulo de badge.
const BOTTLENECK_COMPONENT_HINTS: readonly (readonly [substring: string, label: string])[] = [
  ["threads de processador", "CPU"],
  ["GHz de clock", "CPU"],
  ["memória RAM", "RAM"],
  ["placa de vídeo dedicada", "GPU"],
  ["memória de vídeo", "GPU"],
];

function shortBottleneckLabel(bottleneck: string): string | undefined {
  for (const [substring, label] of BOTTLENECK_COMPONENT_HINTS) {
    if (bottleneck.includes(substring)) return label;
  }
  return undefined;
}

export function evaluateGameLaunchability(
  game: LibraryGame,
  verdict: ConsoleVerdict | undefined,
  adapterEntry: EmulatorEntry | undefined,
): GameLaunchability {
  if (game.missing) {
    return {
      launchable: false,
      reason: "missing",
      badge: "arquivo ausente",
      title: "O arquivo deste jogo não foi encontrado na última varredura da pasta.",
    };
  }

  const canAutoConfigure = Boolean(verdict?.adapter_id && verdict.options);
  if (!canAutoConfigure) {
    const bottleneck = verdict?.bottlenecks?.[0];
    const shortLabel = bottleneck ? shortBottleneckLabel(bottleneck) : undefined;
    return {
      launchable: false,
      reason: "no_preset",
      badge: shortLabel ? `sem preset — ${shortLabel}` : "sem preset automático",
      title: bottleneck
        ? `O ZeuX ainda não escolheu uma configuração para este console. ${bottleneck}`
        : "O ZeuX ainda não escolheu uma configuração para este console — o hardware não alcançou nenhum patamar de compatibilidade conhecido.",
    };
  }

  if (adapterEntry && !adapterEntry.installed) {
    return {
      launchable: false,
      reason: "not_installed",
      badge: "instalar emulador",
      title: `${verdict?.emulator ?? "O emulador"} ainda não está instalado nesta máquina.`,
    };
  }

  if (adapterEntry?.bios_dir && adapterEntry.bios_dir_empty) {
    return {
      launchable: false,
      reason: "bios_empty",
      badge: "BIOS ausente",
      title: "A pasta de BIOS deste emulador está vazia. Sem o arquivo, o jogo não deve abrir.",
    };
  }

  return { launchable: true };
}
