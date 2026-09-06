import { useEffect, useState } from "react";

/**
 * O controle conectado, pela Gamepad API da própria WebView.
 *
 * **Não existe rota do ZeuX para isso, de propósito.** Uma detecção no lado Go
 * exigiria uma biblioteca de gamepad, que arrisca o build sem CGO que o
 * ADR 0011 preserva — e a WebView já expõe `navigator.getGamepads()` sem
 * custar dependência nenhuma. Decisão registrada no H3 (docs/roadmap.md).
 *
 * Extraído de dentro de `EmulatorBindingsPanel` no Q4 (Sprint Q) para que o
 * nome do controle possa aparecer também fora do painel de mapeamento.
 */
export interface GamepadState {
  connected: boolean;
  /**
   * O que o navegador reporta como identificação, já enxugado — ex.:
   * "Xbox 360 Controller". Ausente quando nada está conectado.
   *
   * É rótulo para o usuário reconhecer o que plugou, **nunca** chave: o
   * mesmo controle físico reporta strings diferentes conforme navegador e
   * sistema, então nada de lógica deve depender deste texto.
   */
  name?: string;
}

// A Gamepad API acrescenta os identificadores de fornecedor/produto e o
// mapeamento entre parênteses ("Xbox 360 Controller (XInput STANDARD
// GAMEPAD)", "045e-028e-Microsoft X-Box 360 pad"). Isso é ruído para quem só
// quer confirmar que plugou o controle certo.
function nomeLegivel(id: string): string {
  const semParenteses = id.replace(/\([^)]*\)/g, " ");
  // Prefixo "vendor-product-" que o Linux costuma antepor.
  const semIDs = semParenteses.replace(/^\s*[0-9a-f]{4}-[0-9a-f]{4}-/i, "");
  return semIDs.replace(/\s+/g, " ").trim() || id;
}

export function useGamepad(): GamepadState {
  const [state, setState] = useState<GamepadState>({ connected: false });

  useEffect(() => {
    function refresh() {
      // `getGamepads` devolve posições vazias para portas livres — daí o
      // filtro, e não um `length > 0`.
      const pads = Array.from(navigator.getGamepads?.() ?? []);
      const pad = pads.find((p) => p !== null);
      setState(pad ? { connected: true, name: nomeLegivel(pad.id) } : { connected: false });
    }

    refresh();
    // A Gamepad API só popula `getGamepads()` depois de o controle mandar o
    // primeiro evento, então o `refresh` do mount pode não ver um controle já
    // plugado — os dois eventos abaixo cobrem isso.
    window.addEventListener("gamepadconnected", refresh);
    window.addEventListener("gamepaddisconnected", refresh);
    return () => {
      window.removeEventListener("gamepadconnected", refresh);
      window.removeEventListener("gamepaddisconnected", refresh);
    };
  }, []);

  return state;
}
