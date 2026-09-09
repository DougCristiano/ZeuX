import { useEffect, useState } from "react";
import controllerPhoto from "../assets/controller-reference.png";
import { Button, Callout, Card, ScreenContainer, ScreenHeader } from "../components/ui";
import { CONTROLLER_SPOTS } from "../lib/controllerRegions";
import { useGamepad } from "../hooks/useGamepad";
import { resumeGamepadNavigation, suspendGamepadNavigation } from "../hooks/gamepadNavigationSuspend";
import { useT } from "../i18n/i18n";
import { dict } from "./ControllerTestScreen.i18n";

// Índices da Gamepad API no mapeamento "standard" — os mesmos que
// useGamepadNavigation.ts já assume para D-pad/A/B. Documentado aqui de novo
// porque este componente usa o conjunto inteiro, não só 6 botões.
const BTN = {
  faceBottom: 0,
  faceRight: 1,
  faceLeft: 2,
  faceTop: 3,
  shoulderLeft: 4,
  shoulderRight: 5,
  triggerLeft: 6,
  triggerRight: 7,
  select: 8,
  start: 9,
  stickLeftClick: 10,
  stickRightClick: 11,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
  home: 16,
} as const;

type ButtonSnapshot = { pressed: boolean; value: number };

interface GamepadSnapshot {
  buttons: ButtonSnapshot[];
  axes: number[];
}

const EMPTY_SNAPSHOT: GamepadSnapshot = { buttons: [], axes: [] };

/**
 * Zona morta do analógico — mesma constante de useGamepadNavigation.ts, mas
 * aqui só evita que o ponto do stick trema por ruído do próprio hardware
 * quando "parado", não decide navegação.
 */
const STICK_VISUAL_DEADZONE = 0.08;

function readSnapshot(): GamepadSnapshot {
  const pad = Array.from(navigator.getGamepads?.() ?? []).find((p) => p !== null);
  if (!pad) return EMPTY_SNAPSHOT;
  return {
    buttons: pad.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
    axes: Array.from(pad.axes),
  };
}

function pressed(snapshot: GamepadSnapshot, index: number): boolean {
  return snapshot.buttons[index]?.pressed ?? false;
}

function analogValue(snapshot: GamepadSnapshot, index: number): number {
  return snapshot.buttons[index]?.value ?? 0;
}

function axis(snapshot: GamepadSnapshot, index: number): number {
  const v = snapshot.axes[index] ?? 0;
  return Math.abs(v) < STICK_VISUAL_DEADZONE ? 0 : v;
}

/**
 * A foto é clara (controle branco) sobre o tema escuro do app, então o realce
 * é uma mancha ciano com halo — `--accent-secondary`, a cor que o redesenho de
 * 2026-09-07 fixou como "aqui o sistema informa" (docs/decisoes.md). Cor por
 * `style` e não por classe Tailwind: a opacidade muda a cada quadro
 * (`requestAnimationFrame`), e montar string de classe 60x por segundo é
 * desperdício — mesma razão que o SVG anterior já registrava aqui.
 */
const ON_COLOR = "var(--accent-secondary)";

/**
 * Peças que não são redondas na foto: braços do direcional, ombros, gatilhos e
 * as pílulas de select/start. Um realce circular em cima delas vaza para fora
 * da peça e encosta na vizinha.
 */
const BOXY_SPOTS = new Set([
  "dpadUp",
  "dpadDown",
  "dpadLeft",
  "dpadRight",
  "shoulderLeft",
  "shoulderRight",
  "triggerLeft",
  "triggerRight",
  "select",
  "start",
]);

function Spot({
  id,
  intensity,
  offsetX = 0,
  offsetY = 0,
}: {
  id: string;
  /** 0 = solto, 1 = totalmente apertado. Analógico (L2/R2) usa o meio-termo. */
  intensity: number;
  /** Deslocamento em % do próprio marcador — só os analógicos usam, para o
   *  realce acompanhar o eixo em vez de só acender no clique. */
  offsetX?: number;
  offsetY?: number;
}) {
  const spot = CONTROLLER_SPOTS[id];
  const on = intensity > 0.02;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: `${spot.x}%`,
        top: `${spot.y}%`,
        width: `${spot.w}%`,
        height: `${spot.h}%`,
        transform: `translate(calc(-50% + ${offsetX}%), calc(-50% + ${offsetY}%))`,
        borderRadius: BOXY_SPOTS.has(id) ? "22%" : "50%",
        background: ON_COLOR,
        // O halo é o que faz o realce ser visto no canto do olho enquanto a
        // pessoa está olhando para o controle, não para a tela.
        boxShadow: on ? `0 0 14px 4px ${ON_COLOR}` : "none",
        opacity: on ? 0.25 + 0.5 * intensity : 0,
        transition: "opacity 60ms linear",
      }}
    />
  );
}

/**
 * Foto de um controle real com uma camada de marcadores por cima — um por
 * botão, posicionado em % da imagem (nunca px: a foto encolhe com a janela).
 *
 * **Isto substituiu, em 2026-09-08, um SVG desenhado do zero e deliberadamente
 * sem marca** ("sem A/B/X/Y, sem ✕/○/□/△"). Duas rodadas de desenho à mão não
 * chegaram a uma geometria que parecesse um controle de verdade, e o Douglas
 * decidiu — perguntado e confirmado antes, ciente do risco de marca de
 * terceiro — usar a foto como está, logo e letras A/B/X/Y inclusas. Mesmo
 * precedente da imagem real de console em `ConsolesScreen`. O porquê completo,
 * o risco aceito e a saída caso precise ser desfeito estão em docs/decisoes.md,
 * "Foto de controle real no lugar do SVG desenhado à mão (2026-09-08)".
 *
 * A geometria mora em `lib/controllerRegions.ts`, compartilhada com o painel
 * de mapeamento — as duas telas leem a mesma foto e não podem divergir sobre
 * onde cada botão está.
 */
function ControllerDiagram({ snapshot }: { snapshot: GamepadSnapshot }) {
  const lx = axis(snapshot, 0);
  const ly = axis(snapshot, 1);
  const rx = axis(snapshot, 2);
  const ry = axis(snapshot, 3);
  // 35% do próprio marcador: percurso visível sem que o realce saia da
  // depressão do analógico na foto.
  const travel = 35;

  const digital = (index: number) => (pressed(snapshot, index) ? 1 : 0);

  return (
    <div className="relative mx-auto w-full max-w-xl">
      <img
        src={controllerPhoto}
        alt=""
        aria-hidden="true"
        className="block w-full select-none"
        draggable={false}
      />

      <Spot id="triggerLeft" intensity={analogValue(snapshot, BTN.triggerLeft)} />
      <Spot id="triggerRight" intensity={analogValue(snapshot, BTN.triggerRight)} />
      <Spot id="shoulderLeft" intensity={digital(BTN.shoulderLeft)} />
      <Spot id="shoulderRight" intensity={digital(BTN.shoulderRight)} />

      <Spot id="dpadUp" intensity={digital(BTN.dpadUp)} />
      <Spot id="dpadDown" intensity={digital(BTN.dpadDown)} />
      <Spot id="dpadLeft" intensity={digital(BTN.dpadLeft)} />
      <Spot id="dpadRight" intensity={digital(BTN.dpadRight)} />

      <Spot id="faceTop" intensity={digital(BTN.faceTop)} />
      <Spot id="faceLeft" intensity={digital(BTN.faceLeft)} />
      <Spot id="faceRight" intensity={digital(BTN.faceRight)} />
      <Spot id="faceBottom" intensity={digital(BTN.faceBottom)} />

      <Spot id="select" intensity={digital(BTN.select)} />
      <Spot id="start" intensity={digital(BTN.start)} />
      <Spot id="home" intensity={digital(BTN.home)} />

      {/* Analógico acende com o eixo, não só com o clique: mover o stick sem
          apertar é o caso mais comum de "meu controle está com drift?", que é
          metade do motivo desta tela existir. O clique (L3/R3) soma por cima. */}
      <Spot
        id="leftStick"
        intensity={Math.max(digital(BTN.stickLeftClick), Math.min(1, Math.hypot(lx, ly)))}
        offsetX={lx * travel}
        offsetY={ly * travel}
      />
      <Spot
        id="rightStick"
        intensity={Math.max(digital(BTN.stickRightClick), Math.min(1, Math.hypot(rx, ry)))}
        offsetX={rx * travel}
        offsetY={ry * travel}
      />
    </div>
  );
}

/**
 * Q4/M14 (docs/pendencias.md): "testar controle", pedido do Douglas em
 * 2026-09-07, referência XOutput/gamepad-tester.com/Steam. Poll via
 * requestAnimationFrame igual EmulatorBindingsPanel já fazia para capturar
 * bind — aqui não para na primeira transição, lê o snapshot inteiro (botões
 * + eixos) a cada quadro enquanto o teste estiver ativo.
 *
 * O teste tem início e fim explícitos (e não começa sozinho ao montar) porque
 * ele precisa desligar a navegação global por controle enquanto roda — ver
 * `hooks/gamepadNavigationSuspend.ts`. Desligar a navegação é uma mudança de
 * comportamento do app inteiro; sem um "Iniciar"/"Parar" visível, a pessoa não
 * teria como saber por que o controle parou de navegar nem como retomá-lo.
 */
export function ControllerTestScreen({ onBack }: { onBack: () => void }) {
  const t = useT(dict);
  const gamepad = useGamepad();
  const [snapshot, setSnapshot] = useState<GamepadSnapshot>(EMPTY_SNAPSHOT);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!testing) return;
    let frame: number;
    let cancelled = false;
    function poll() {
      setSnapshot(readSnapshot());
      if (!cancelled) frame = requestAnimationFrame(poll);
    }
    frame = requestAnimationFrame(poll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      // Volta ao desenho apagado: com o teste parado, marcador aceso seria a
      // última leitura congelada, indistinguível de um botão travado.
      setSnapshot(EMPTY_SNAPSHOT);
    };
  }, [testing]);

  // Rede de segurança da desmontagem: dá para sair desta tela pelo "Voltar" do
  // cabeçalho (mouse ou teclado) sem passar pelo "Parar teste". Sem este
  // retomar incondicional, a navegação por controle ficaria suspensa para
  // sempre no resto do app — o pior estado possível, porque o sintoma
  // aparece longe daqui.
  useEffect(() => resumeGamepadNavigation, []);

  function startTest() {
    suspendGamepadNavigation();
    setTesting(true);
  }

  function stopTest() {
    resumeGamepadNavigation();
    setTesting(false);
  }

  return (
    <ScreenContainer>
      <ScreenHeader back={{ label: t("back"), onClick: onBack }} title={t("title")} subtitle={t("subtitle")} />

      {gamepad.connected ? (
        <>
          <p className="mb-4 text-sm text-muted">{t("connectedAs", { name: gamepad.name ?? "" })}</p>
          {gamepad.mapping !== "standard" && (
            <Callout label={t("nonStandardMappingLabel")} tone="amber" className="mb-4">
              {t("nonStandardMapping", { mapping: gamepad.mapping || "—" })}
            </Callout>
          )}
        </>
      ) : (
        <Callout label="—" className="mb-4">
          {t("noController")}
        </Callout>
      )}

      {/* `flex-wrap` + `max-w-*` no texto: a linha divide espaço com a sidebar
          e precisa quebrar em janela estreita em vez de empurrar o botão para
          fora (CLAUDE.md, "Layout responsivo"). */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {testing ? (
          <Button variant="secondary" onClick={stopTest}>
            {t("stopTest")}
          </Button>
        ) : (
          <Button variant="primary" onClick={startTest}>
            {t("startTest")}
          </Button>
        )}
        <p className="max-w-prose text-sm text-muted">{testing ? t("testingActiveHint") : t("idleHint")}</p>
      </div>

      <Card>
        <ControllerDiagram snapshot={snapshot} />
      </Card>

      <p className="mt-4 text-sm text-muted">{t("photoNote")}</p>
    </ScreenContainer>
  );
}
