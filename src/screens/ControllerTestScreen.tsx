import { useEffect, useState } from "react";
import { Callout, Card, ScreenContainer, ScreenHeader, SectionHeading } from "../components/ui";
import { useGamepad } from "../hooks/useGamepad";
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

// Cores por CSS var (não classe Tailwind) porque o SVG usa `fill`/`stroke`
// como atributo, e as duas cores trocam por estado a cada frame — variável
// direta evita recalcular uma string de classe 60x por segundo.
const OFF_FILL = "var(--fill)";
const OFF_STROKE = "var(--line)";
const ON_FILL = "var(--accent-secondary)";
const ON_STROKE = "var(--accent-secondary)";

function Part({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <g aria-label={label} style={{ transition: "fill 60ms linear, stroke 60ms linear" }}>
      {children}
    </g>
  );
}

/**
 * Desenho genérico do controle — sem "A/B/X/Y" nem "✕/○/□/△" (vocabulário de
 * fabricante, Xbox e PlayStation respectivamente; mesma regra que já mantém
 * o Nintendo Switch fora do catálogo e a logo de console fora de
 * `ConsoleIcon`, ver docs/decisoes.md). Cada parte é rotulada só pelo índice
 * que a própria Gamepad API reporta. Pesquisado antes de desenhar (2026-09-07):
 * nenhum SVG pronto encontrado servia sem essa mesma ressalva de marca ou sem
 * licença clara — ver commit desta feature.
 */
function ControllerDiagram({ snapshot }: { snapshot: GamepadSnapshot }) {
  const lx = axis(snapshot, 0);
  const ly = axis(snapshot, 1);
  const rx = axis(snapshot, 2);
  const ry = axis(snapshot, 3);
  const stickTravel = 10; // px que o ponto do analógico se desloca no limite

  const dUp = pressed(snapshot, BTN.dpadUp);
  const dDown = pressed(snapshot, BTN.dpadDown);
  const dLeft = pressed(snapshot, BTN.dpadLeft);
  const dRight = pressed(snapshot, BTN.dpadRight);

  const triggerL = analogValue(snapshot, BTN.triggerLeft);
  const triggerR = analogValue(snapshot, BTN.triggerRight);

  return (
    <svg viewBox="0 0 360 220" className="mx-auto w-full max-w-xl" role="img" aria-hidden="true">
      {/* Corpo — dois lóbulos + ponte central, formato neutro de controle
          "genérico", sem contorno de nenhuma marca específica. */}
      <path
        d="M 60 90 Q 20 90 15 140 Q 10 195 45 200 Q 75 204 90 165 L 270 165 Q 285 204 315 200 Q 350 195 345 140 Q 340 90 300 90 Z"
        fill="var(--fill)"
        stroke="var(--line)"
        strokeWidth="2"
      />

      {/* Gatilhos (analógicos: L2/R2, índices 6/7) — barra que enche
          conforme o value (0 a 1), não só um on/off. */}
      <Part label="L2">
        <rect x="35" y="55" width="40" height="14" rx="4" fill="none" stroke={OFF_STROKE} strokeWidth="1.5" />
        <rect
          x="35"
          y="55"
          width={40 * triggerL}
          height="14"
          rx="4"
          fill={ON_FILL}
          opacity={triggerL > 0.05 ? 0.85 : 0}
        />
      </Part>
      <Part label="R2">
        <rect x="285" y="55" width="40" height="14" rx="4" fill="none" stroke={OFF_STROKE} strokeWidth="1.5" />
        <rect
          x="285"
          y="55"
          width={40 * triggerR}
          height="14"
          rx="4"
          fill={ON_FILL}
          opacity={triggerR > 0.05 ? 0.85 : 0}
        />
      </Part>

      {/* Ombros (L1/R1, índices 4/5) — digital, on/off. */}
      <rect
        x="35"
        y="72"
        width="40"
        height="10"
        rx="3"
        fill={pressed(snapshot, BTN.shoulderLeft) ? ON_FILL : OFF_FILL}
        stroke={pressed(snapshot, BTN.shoulderLeft) ? ON_STROKE : OFF_STROKE}
        strokeWidth="1.5"
      />
      <rect
        x="285"
        y="72"
        width="40"
        height="10"
        rx="3"
        fill={pressed(snapshot, BTN.shoulderRight) ? ON_FILL : OFF_FILL}
        stroke={pressed(snapshot, BTN.shoulderRight) ? ON_STROKE : OFF_STROKE}
        strokeWidth="1.5"
      />

      {/* D-pad (12-15) — cruz de 3 retângulos, cada braço realça sozinho. */}
      <g transform="translate(95, 118)">
        <rect x="-8" y="-24" width="16" height="48" rx="3" fill="var(--fill)" stroke="var(--line)" strokeWidth="1.5" />
        <rect x="-24" y="-8" width="48" height="16" rx="3" fill="var(--fill)" stroke="var(--line)" strokeWidth="1.5" />
        <rect x="-7" y="-22" width="14" height="18" rx="2" fill={dUp ? ON_FILL : "transparent"} />
        <rect x="-7" y="4" width="14" height="18" rx="2" fill={dDown ? ON_FILL : "transparent"} />
        <rect x="-22" y="-7" width="18" height="14" rx="2" fill={dLeft ? ON_FILL : "transparent"} />
        <rect x="4" y="-7" width="18" height="14" rx="2" fill={dRight ? ON_FILL : "transparent"} />
      </g>

      {/* Botões de face (0-3) — círculos neutros, só o índice como rótulo. */}
      {(
        [
          [BTN.faceTop, 265, 100],
          [BTN.faceLeft, 245, 120],
          [BTN.faceRight, 285, 120],
          [BTN.faceBottom, 265, 140],
        ] as const
      ).map(([index, cx, cy]) => {
        const isOn = pressed(snapshot, index);
        return (
          <g key={index}>
            <circle cx={cx} cy={cy} r="11" fill={isOn ? ON_FILL : "var(--fill)"} stroke={isOn ? ON_STROKE : "var(--line)"} strokeWidth="1.5" />
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              fontSize="10"
              fill={isOn ? "var(--accent-ink)" : "var(--muted)"}
            >
              {index}
            </text>
          </g>
        );
      })}

      {/* Select/Start (8/9) — pílulas pequenas no centro. */}
      <rect
        x="150"
        y="112"
        width="22"
        height="10"
        rx="5"
        fill={pressed(snapshot, BTN.select) ? ON_FILL : "var(--fill)"}
        stroke={pressed(snapshot, BTN.select) ? ON_STROKE : "var(--line)"}
        strokeWidth="1.5"
      />
      <rect
        x="188"
        y="112"
        width="22"
        height="10"
        rx="5"
        fill={pressed(snapshot, BTN.start) ? ON_FILL : "var(--fill)"}
        stroke={pressed(snapshot, BTN.start) ? ON_STROKE : "var(--line)"}
        strokeWidth="1.5"
      />
      {/* Home/guide (16) — nem todo controle reporta; só aparece realçado
          quando pressionado, sem ocupar espaço de "ausente". */}
      {pressed(snapshot, BTN.home) && <circle cx="180" cy="95" r="6" fill={ON_FILL} stroke={ON_STROKE} strokeWidth="1.5" />}

      {/* Analógicos (axes 0/1 e 2/3, clique em 10/11) — base fixa + ponto que
          se desloca com o eixo real, realça quando clicado. */}
      {(
        [
          [BTN.stickLeftClick, 130, 165, lx, ly],
          [BTN.stickRightClick, 235, 165, rx, ry],
        ] as const
      ).map(([clickIndex, cx, cy, x, y]) => {
        const clicked = pressed(snapshot, clickIndex);
        return (
          <g key={clickIndex}>
            <circle cx={cx} cy={cy} r="20" fill="var(--fill)" stroke="var(--line)" strokeWidth="1.5" />
            <circle
              cx={cx + x * stickTravel}
              cy={cy + y * stickTravel}
              r="11"
              fill={clicked ? ON_FILL : "var(--muted)"}
              stroke={clicked ? ON_STROKE : "var(--line)"}
              strokeWidth="1.5"
            />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Q4/M14 (docs/pendencias.md): "testar controle", pedido do Douglas em
 * 2026-09-07, referência XOutput/gamepad-tester.com/Steam. Poll via
 * requestAnimationFrame igual EmulatorBindingsPanel já fazia para capturar
 * bind — aqui não para na primeira transição, lê o snapshot inteiro (botões
 * + eixos) a cada quadro enquanto a tela estiver montada.
 */
export function ControllerTestScreen({ onBack }: { onBack: () => void }) {
  const t = useT(dict);
  const gamepad = useGamepad();
  const [snapshot, setSnapshot] = useState<GamepadSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
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
    };
  }, []);

  return (
    <ScreenContainer>
      <ScreenHeader back={{ label: t("back"), onClick: onBack }} title={t("title")} subtitle={t("subtitle")} />

      {gamepad.connected ? (
        <p className="mb-4 text-sm text-muted">{t("connectedAs", { name: gamepad.name ?? "" })}</p>
      ) : (
        <Callout label="—" className="mb-4">
          {t("noController")}
        </Callout>
      )}

      <Card>
        <ControllerDiagram snapshot={snapshot} />
      </Card>

      <SectionHeading className="mt-6 mb-2">{t("faceButtons")}</SectionHeading>
      <p className="text-sm text-muted">{t("buttonIndexNote")}</p>
    </ScreenContainer>
  );
}
