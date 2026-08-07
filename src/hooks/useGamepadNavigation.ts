import { useEffect } from "react";

// Zona morta do analógico — abaixo disso, ruído do próprio hardware não
// deveria mover o foco sozinho.
const STICK_DEADZONE = 0.5;
// Índices do Gamepad API (padrão "standard" mapping): D-pad como botões
// digitais, A e B nas mesmas posições de um controle Xbox/PlayStation.
const BUTTON_A = 0;
const BUTTON_B = 1;
const DPAD: [number, Direction][] = [
  [12, "up"],
  [13, "down"],
  [14, "left"],
  [15, "right"],
];

type Direction = "up" | "down" | "left" | "right";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function visibleFocusableElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
  });
}

/**
 * Vizinho mais próximo na direção pressionada — Tab/Shift+Tab (ordem do DOM)
 * não basta para uma grade 2D como a biblioteca de jogos, onde "próximo"
 * depende de posição na tela, não de posição no HTML. Técnica padrão de
 * navegação espacial: distância na direção certa, penalizando desvio
 * perpendicular (para não pular de fileira ao tentar ir só para o lado).
 * Sem elemento focado ainda, cai no primeiro focável (entrada "a frio").
 */
function findNextFocus(direction: Direction): HTMLElement | null {
  const candidates = visibleFocusableElements();
  if (candidates.length === 0) return null;

  const current = document.activeElement as HTMLElement | null;
  if (!current || current === document.body || !document.body.contains(current)) {
    return candidates[0];
  }

  const from = current.getBoundingClientRect();
  const fromCenter = { x: from.left + from.width / 2, y: from.top + from.height / 2 };

  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of candidates) {
    if (el === current) continue;
    const rect = el.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const dx = center.x - fromCenter.x;
    const dy = center.y - fromCenter.y;

    let primary: number;
    let cross: number;
    if (direction === "right") {
      if (dx <= 0) continue;
      primary = dx;
      cross = dy;
    } else if (direction === "left") {
      if (dx >= 0) continue;
      primary = -dx;
      cross = dy;
    } else if (direction === "down") {
      if (dy <= 0) continue;
      primary = dy;
      cross = dx;
    } else {
      if (dy >= 0) continue;
      primary = -dy;
      cross = dx;
    }

    const score = primary + Math.abs(cross) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

// Botão B ("voltar"): fecha um modal do shadcn se houver um aberto (Radix já
// escuta Esc — sintético cobre isso sem o hook saber se há modal). Sem
// modal, tenta o botão "Voltar"/"Voltar à biblioteca" da tela atual —
// convenção de texto já usada em GameDetailScreen/EmulatorsScreen/
// LibraryScreen/GamesScreen. Nenhuma tela registra um callback central de
// "voltar" hoje (cada uma recebe seu próprio onBack via prop de App.tsx),
// então clicar no botão visível é o caminho sem adicionar esse registro —
// documentado como limitação real em docs/roadmap.md, Sprint L.
function pressBack() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  const backButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((btn) =>
    btn.textContent?.trim().startsWith("Voltar"),
  );
  backButton?.click();
}

/**
 * Traduz D-pad/analógico esquerdo + botões A/B em navegação equivalente a
 * Tab/Enter/Esc — ADR 0014 (docs/decisoes/0014-navegacao-por-controle.md).
 * Só ativo com um controle conectado; sem isso, teclado e mouse continuam
 * exatamente como sempre. Mesma técnica de leitura do Gamepad API que
 * `EmulatorBindingsPanel.tsx` já usa (poll via `requestAnimationFrame`,
 * comparando estado anterior/atual de cada botão para achar transições, não
 * o estado já pressionado ao montar).
 *
 * Montado uma vez em `App.tsx` (não por tela) — opera sobre
 * `document.activeElement` e os elementos focáveis visíveis, não precisa
 * saber em qual fase o app está.
 */
export function useGamepadNavigation() {
  useEffect(() => {
    let cancelled = false;
    let frame: number;
    const prevButtons: Record<number, boolean> = {};
    let stickDirectionActive: Direction | null = null;

    function poll() {
      if (!cancelled) frame = requestAnimationFrame(poll);

      const pads = navigator.getGamepads?.() ?? [];
      const pad = Array.from(pads).find((p) => p !== null);
      if (!pad) return;

      for (const [index, direction] of DPAD) {
        const pressed = pad.buttons[index]?.pressed ?? false;
        if (pressed && !prevButtons[index]) {
          findNextFocus(direction)?.focus();
        }
        prevButtons[index] = pressed;
      }

      // Analógico: dispara na transição pra fora da zona morta, não a cada
      // frame com o stick inclinado — senão o foco "voaria" sozinho
      // enquanto o stick fica parado numa direção.
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      let stickDirection: Direction | null = null;
      if (Math.abs(x) > Math.abs(y)) {
        if (Math.abs(x) > STICK_DEADZONE) stickDirection = x > 0 ? "right" : "left";
      } else if (Math.abs(y) > STICK_DEADZONE) {
        stickDirection = y > 0 ? "down" : "up";
      }
      if (stickDirection && stickDirection !== stickDirectionActive) {
        findNextFocus(stickDirection)?.focus();
      }
      stickDirectionActive = stickDirection;

      const aPressed = pad.buttons[BUTTON_A]?.pressed ?? false;
      if (aPressed && !prevButtons[BUTTON_A]) {
        (document.activeElement as HTMLElement | null)?.click();
      }
      prevButtons[BUTTON_A] = aPressed;

      const bPressed = pad.buttons[BUTTON_B]?.pressed ?? false;
      if (bPressed && !prevButtons[BUTTON_B]) {
        pressBack();
      }
      prevButtons[BUTTON_B] = bPressed;
    }

    frame = requestAnimationFrame(poll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);
}
