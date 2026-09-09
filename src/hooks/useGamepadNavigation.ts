import { useEffect, useRef, useState } from "react";
import { isGamepadNavigationSuspended } from "./gamepadNavigationSuspend";

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

/**
 * Atributo que marca "o controle está AQUI" — o realce visual é escrito em
 * `src/index.css` contra este seletor.
 *
 * Por que um atributo próprio e não o `:focus-visible` que o resto do app
 * usa (`FOCUS_RING`, `group-focus-visible:` em `GameCover`): relato do
 * Douglas testando a v0.1.22 com controle real — "não vejo um seletor no
 * campo exato onde estou". A navegação move o foco com um `.focus()`
 * **programático**, e no Chromium (WebView2, o motor do Tauri no Windows)
 * `.focus()` chamado por script não satisfaz a heurística de
 * `:focus-visible` de forma confiável: o foco andava, invisível. Não há como
 * "forçar" `:focus-visible` — daí marcar o elemento explicitamente, que é
 * determinístico e independe de heurística do motor.
 */
const CURSOR_ATTR = "data-gamepad-focused";

// Elemento que a tela prefere como pouso do controle (ex.: a ação primária
// do detalhe do jogo). Sem nenhum marcado, o pouso cai no primeiro focável
// visível da área de conteúdo — ver `landingTarget`.
const START_SELECTOR = "[data-gamepad-start]";

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.opacity === "0") return false;
  // Conteúdo escondido de leitor de tela (overlay fechado, painel colapsado
  // que continua no DOM) não deve receber o cursor do controle: seria um
  // realce em cima de algo que a pessoa não enxerga.
  return el.closest('[aria-hidden="true"], [inert]') === null;
}

function visibleFocusableElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

/**
 * Move o cursor do controle: tira a marca do anterior, marca o novo e foca.
 *
 * O `.focus({ preventScroll: true })` + `scrollIntoView({ block: "nearest" })`
 * é de propósito: o scroll automático do `.focus()` centraliza o elemento e,
 * numa grade de capas, fazia a página saltar a cada passo do D-pad. "nearest"
 * só rola o mínimo para o item entrar inteiro na área visível — que é o que
 * um menu de console faz.
 */
function moveCursor(el: HTMLElement) {
  document.querySelectorAll<HTMLElement>(`[${CURSOR_ATTR}]`).forEach((old) => {
    if (old !== el) old.removeAttribute(CURSOR_ATTR);
  });
  el.setAttribute(CURSOR_ATTR, "");
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function clearCursor() {
  document.querySelectorAll<HTMLElement>(`[${CURSOR_ATTR}]`).forEach((el) => el.removeAttribute(CURSOR_ATTR));
}

function currentCursor(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[${CURSOR_ATTR}]`);
  if (!el || !document.body.contains(el) || !isVisible(el)) return null;
  return el;
}

/**
 * Onde o cursor pousa quando não há nenhum — ao conectar o controle e a cada
 * troca de tela (a tela antiga desmonta, o foco cai no `<body>` e o app fica
 * "sem cursor" até a pessoa apertar o D-pad).
 *
 * Preferência, nesta ordem: o que a tela declarou em `data-gamepad-start`;
 * senão o primeiro focável da área de conteúdo (`<main>`) — não da sidebar,
 * que é chrome de navegação e seria um pouso desorientador; senão qualquer
 * focável. "Primeiro" é por posição na TELA (topo, depois esquerda), não
 * ordem do DOM, pela mesma razão que `findNextFocus` é espacial.
 */
function landingTarget(): HTMLElement | null {
  const declared = Array.from(document.querySelectorAll<HTMLElement>(START_SELECTOR)).find(isVisible);
  if (declared) return declared;

  const all = visibleFocusableElements();
  const main = document.querySelector("main");
  const pool = main ? all.filter((el) => main.contains(el)) : [];
  const candidates = pool.length > 0 ? pool : all;

  let best: HTMLElement | null = null;
  let bestKey = Infinity;
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    // Linhas de ~40px contam como a mesma fileira: sem isso, um botão
    // dois pixels mais alto ganharia de um vizinho à sua esquerda.
    const key = Math.round(rect.top / 40) * 100000 + rect.left;
    if (key < bestKey) {
      bestKey = key;
      best = el;
    }
  }
  return best;
}

// Distância entre dois intervalos no eixo perpendicular — 0 quando eles se
// sobrepõem.
function gap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  if (bEnd < aStart) return aStart - bEnd;
  if (bStart > aEnd) return bStart - aEnd;
  return 0;
}

/**
 * Vizinho mais próximo na direção pressionada — Tab/Shift+Tab (ordem do DOM)
 * não basta para uma grade 2D como a biblioteca de jogos, onde "próximo"
 * depende de posição na tela, não de posição no HTML. Técnica padrão de
 * navegação espacial: distância na direção certa, penalizando desvio
 * perpendicular (para não pular de fileira ao tentar ir só para o lado).
 * Sem cursor nem foco ainda, cai no pouso padrão (`landingTarget`).
 */
function findNextFocus(direction: Direction): HTMLElement | null {
  const candidates = visibleFocusableElements();
  if (candidates.length === 0) return null;

  // O cursor do controle vale mais que `document.activeElement`: um `.focus()`
  // pode ter sido desfeito por fora (um diálogo do Radix que abriu e fechou
  // devolve o foco ao `<body>`), e sem isto a próxima direção pressionada
  // teleportaria o cursor para o primeiro focável da tela em vez de continuar
  // de onde a marca visível está.
  const marked = currentCursor();
  const active = document.activeElement as HTMLElement | null;
  const current =
    marked ?? (active && active !== document.body && document.body.contains(active) ? active : null);
  if (!current) {
    return landingTarget() ?? candidates[0];
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
      cross = gap(from.top, from.bottom, rect.top, rect.bottom);
    } else if (direction === "left") {
      if (dx >= 0) continue;
      primary = -dx;
      cross = gap(from.top, from.bottom, rect.top, rect.bottom);
    } else if (direction === "down") {
      if (dy <= 0) continue;
      primary = dy;
      cross = gap(from.left, from.right, rect.left, rect.right);
    } else {
      if (dy >= 0) continue;
      primary = -dy;
      cross = gap(from.left, from.right, rect.left, rect.right);
    }

    // Desvio perpendicular medido entre BORDAS, não entre centros (`gap`
    // acima): dois elementos da mesma fileira com larguras diferentes — a
    // barra de busca larga e o chip de filtro estreito, lado a lado — têm
    // centros longe um do outro mesmo se sobrepostos verticalmente, e o
    // desvio por centro os fazia perder para um elemento de outra fileira.
    // Com sobreposição o desvio é zero, que é o comportamento esperado de
    // "ir para o lado".
    const score = primary + cross * 3;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

// Botão B ("voltar"): fecha um modal do shadcn se houver um aberto (Radix já
// escuta Esc — sintético cobre isso sem o hook saber se há modal). Sem
// modal, clica o botão "voltar" canônico da tela atual.
//
// A11y 2.1.4 (auditoria de acessibilidade, 2026-09-06): antes o seletor era
// `button` cujo `textContent` começa com "Voltar" — frágil (quebra se a cópia
// mudar, e acertaria um "Voltar à configuração padrão" que não é navegação).
// Agora cada tela marca o seu botão de voltar com `data-nav-back`; o texto
// deixou de ser contrato. Nenhuma tela registra um callback central de
// "voltar" (cada uma recebe seu `onBack` via prop de App.tsx), então clicar
// no botão visível continua sendo o caminho — só a forma de achá-lo mudou.
function pressBack() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  const backButton = document.querySelector<HTMLButtonElement>("[data-nav-back]");
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
 *
 * Devolve `{ connected }` — se há algum controle plugado agora — para que o
 * rodapé de prompts (`GamepadHints`) saiba quando aparecer. A detecção usa
 * os eventos `gamepadconnected`/`gamepaddisconnected` (mesma técnica de
 * `useGamepad`), não o laço de poll: o poll só roda com um pad presente e
 * não teria como sinalizar a ausência. Continua um laço só no app — este
 * hook é montado uma única vez em `App.tsx`; `GamepadHints` recebe o
 * `connected` por prop em vez de chamar o hook de novo (dois laços de poll
 * duplicariam cada ação de navegação).
 */
export function useGamepadNavigation(): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  // "A última entrada veio de mouse/teclado". Enquanto for verdade, o pouso
  // automático não acende cursor nenhum: quem está no mouse não deve ganhar um
  // realce de controle só porque a tela trocou. Volta a falso no primeiro
  // comando do controle.
  const pointerMode = useRef(false);

  useEffect(() => {
    function refresh() {
      const pads = Array.from(navigator.getGamepads?.() ?? []);
      setConnected(pads.some((p) => p !== null));
    }
    refresh();
    window.addEventListener("gamepadconnected", refresh);
    window.addEventListener("gamepaddisconnected", refresh);
    return () => {
      window.removeEventListener("gamepadconnected", refresh);
      window.removeEventListener("gamepaddisconnected", refresh);
    };
  }, []);

  /**
   * O cursor do controle é exclusivo do controle: assim que a pessoa mexe no
   * mouse ou no teclado, ele some e a interface volta ao comportamento normal
   * (`:focus-visible` do teclado, nada no mouse). Sem isto ficariam dois
   * indicadores de "onde estou" na tela ao mesmo tempo, um deles mentindo.
   */
  useEffect(() => {
    function onPointer() {
      pointerMode.current = true;
      clearCursor();
    }
    function onKey(e: KeyboardEvent) {
      pointerMode.current = true;
      // Teclas que movem o foco por conta própria. Uma tecla qualquer
      // (digitar num campo de busca, por exemplo) não deve apagar o cursor:
      // com o controle conectado, quem digita continua "dentro" do elemento
      // realçado.
      if (e.key === "Tab" || e.key.startsWith("Arrow")) clearCursor();
    }
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  /**
   * Sempre um cursor visível enquanto houver controle conectado.
   *
   * Sem isto o app fica no limbo em dois momentos que o Douglas encontra o
   * tempo todo: ao plugar o controle (nada tem foco, `document.activeElement`
   * é o `<body>`) e a cada troca de tela (o elemento focado desmonta junto com
   * a tela anterior). Antes, só o primeiro toque no D-pad "acendia" alguma
   * coisa — e mesmo esse pouso a frio era invisível.
   *
   * `MutationObserver` no `<body>` em vez de um efeito por `phase`: este hook
   * é montado uma vez em `App.tsx` e de propósito não sabe em que fase o app
   * está (mesma razão do `GamepadHints`). O `requestAnimationFrame` agrupa a
   * rajada de mutações de uma troca de tela num único reposicionamento.
   */
  useEffect(() => {
    if (!connected) {
      clearCursor();
      return;
    }

    let scheduled = 0;
    function ensureCursor() {
      scheduled = 0;
      if (currentCursor()) return;
      if (pointerMode.current) return;
      const active = document.activeElement as HTMLElement | null;
      // Já existe um elemento focado (o `autoFocus` do botão "Jogar" em
      // `GameDetailScreen`, por exemplo): adota esse em vez de escolher outro
      // — mover o foco por baixo de uma tela que acabou de decidir onde ele
      // deveria estar seria discordar dela. O que faltava era só a marca
      // visível.
      if (active && active !== document.body && document.body.contains(active) && isVisible(active)) {
        moveCursor(active);
        return;
      }
      const target = landingTarget();
      if (target) moveCursor(target);
    }
    function schedule() {
      if (scheduled) return;
      scheduled = requestAnimationFrame(ensureCursor);
    }

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (scheduled) cancelAnimationFrame(scheduled);
    };
  }, [connected]);

  useEffect(() => {
    let cancelled = false;
    let frame: number;
    const prevButtons: Record<number, boolean> = {};
    let stickDirectionActive: Direction | null = null;
    let wasSuspended = false;

    function poll() {
      if (!cancelled) frame = requestAnimationFrame(poll);

      const pads = navigator.getGamepads?.() ?? [];
      const pad = Array.from(pads).find((p) => p !== null);
      if (!pad) return;

      // `ControllerTestScreen.tsx` precisa do controle inteiro para si: lá a
      // pessoa aperta B só para ver se o botão funciona, e traduzir isso em
      // "voltar" fechava a própria tela de teste. Só o processamento deste
      // quadro é pulado — o `requestAnimationFrame` no topo já reagendou o
      // próximo, então retomar é imediato quando o teste termina.
      const suspended = isGamepadNavigationSuspended();
      if (suspended) {
        wasSuspended = true;
        return;
      }
      if (wasSuspended) {
        // `prevButtons` não foi atualizado durante a suspensão. Sem isto, um
        // botão ainda pressionado no instante em que o teste termina (ex.:
        // soltando B depois de clicar em "Parar teste" com o próprio B) lê
        // como uma transição nova neste primeiro quadro e dispara a ação —
        // repõe a base silenciosamente, sem processar navegação, e só volta
        // a agir a partir do quadro seguinte.
        wasSuspended = false;
        for (let i = 0; i < pad.buttons.length; i++) {
          prevButtons[i] = pad.buttons[i]?.pressed ?? false;
        }
        return;
      }

      for (const [index, direction] of DPAD) {
        const pressed = pad.buttons[index]?.pressed ?? false;
        if (pressed && !prevButtons[index]) {
          pointerMode.current = false;
          const next = findNextFocus(direction);
          if (next) moveCursor(next);
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
        pointerMode.current = false;
        const next = findNextFocus(stickDirection);
        if (next) moveCursor(next);
      }
      stickDirectionActive = stickDirection;

      const aPressed = pad.buttons[BUTTON_A]?.pressed ?? false;
      if (aPressed && !prevButtons[BUTTON_A]) {
        // O cursor visível manda: Ⓐ tem que acionar exatamente o que a
        // pessoa está VENDO realçado, mesmo que algo tenha roubado o foco
        // do DOM no meio do caminho.
        (currentCursor() ?? (document.activeElement as HTMLElement | null))?.click();
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

  return { connected };
}
