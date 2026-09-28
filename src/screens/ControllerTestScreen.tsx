import { useEffect, useState } from "react";
import { PixelController } from "../components/PixelController";
import { Button, Callout, Card, ScreenContainer, ScreenHeader } from "../components/ui";
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
 * O controle em pixel art (`PixelController`, desde 2026-09-28) com cada
 * botão acendendo no ritmo da Gamepad API. Até ali era uma foto de controle
 * real com manchas sobrepostas (docs/decisoes.md, "Controle em pixel art no
 * lugar da foto").
 */
function ControllerDiagram({ snapshot }: { snapshot: GamepadSnapshot }) {
  const lx = axis(snapshot, 0);
  const ly = axis(snapshot, 1);
  const rx = axis(snapshot, 2);
  const ry = axis(snapshot, 3);

  const digital = (index: number) => (pressed(snapshot, index) ? 1 : 0);

  return (
    <div className="mx-auto w-full max-w-xl">
      <PixelController
        lit={{
          triggerLeft: analogValue(snapshot, BTN.triggerLeft),
          triggerRight: analogValue(snapshot, BTN.triggerRight),
          shoulderLeft: digital(BTN.shoulderLeft),
          shoulderRight: digital(BTN.shoulderRight),
          dpadUp: digital(BTN.dpadUp),
          dpadDown: digital(BTN.dpadDown),
          dpadLeft: digital(BTN.dpadLeft),
          dpadRight: digital(BTN.dpadRight),
          faceTop: digital(BTN.faceTop),
          faceLeft: digital(BTN.faceLeft),
          faceRight: digital(BTN.faceRight),
          faceBottom: digital(BTN.faceBottom),
          select: digital(BTN.select),
          start: digital(BTN.start),
          home: digital(BTN.home),
          // Analógico acende com o eixo, não só com o clique: mover o stick
          // sem apertar é o caso mais comum de "meu controle está com drift?",
          // que é metade do motivo desta tela existir. O clique (L3/R3) soma.
          leftStick: Math.max(digital(BTN.stickLeftClick), Math.min(1, Math.hypot(lx, ly))),
          rightStick: Math.max(digital(BTN.stickRightClick), Math.min(1, Math.hypot(rx, ry))),
        }}
        sticks={{ leftStick: { x: lx, y: ly }, rightStick: { x: rx, y: ry } }}
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
        <Callout label={t("controllerStatusLabel")} className="mb-4">
          {t("noController")}
        </Callout>
      )}

      {/* `flex-wrap` + `max-w-*` no texto: a linha divide espaço com a sidebar
          e precisa quebrar em janela estreita em vez de empurrar o botão para
          fora (CLAUDE.md, "Layout responsivo"). */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {testing ? (
          <Button variant="chrome" onClick={stopTest}>
            {t("stopTest")}
          </Button>
        ) : (
          <Button variant="primary" onClick={startTest}>
            {t("startTest")}
          </Button>
        )}
        <p className="max-w-prose text-sm text-muted">{testing ? t("testingActiveHint") : t("idleHint")}</p>
      </div>

      <Card filled>
        <ControllerDiagram snapshot={snapshot} />
      </Card>

      <p className="mt-4 text-sm text-muted">{t("photoNote")}</p>
    </ScreenContainer>
  );
}
