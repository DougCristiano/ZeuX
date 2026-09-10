import { useEffect, useRef, useState } from "react";
import controllerPhoto from "../assets/controller-reference.png";
import { api, ApiError } from "../api";
import type { EmulatorEntry } from "../api/types";
import { Button, Callout, Card, ScreenContainer, ScreenHeader } from "../components/ui";
import { CONTROLLER_SPOTS } from "../lib/controllerRegions";
import { CONTROLLER_BINDING_TARGETS } from "../lib/controllerBindingTargets";
import { useGamepad } from "../hooks/useGamepad";
import { resumeGamepadNavigation, suspendGamepadNavigation } from "../hooks/gamepadNavigationSuspend";
import { useT } from "../i18n/i18n";
import { dict } from "./ConfigureControllerScreen.i18n";

/** Mesma cor de "aqui o sistema informa" que `ControllerTestScreen` usa —
 *  `--accent-secondary`, fixada no redesenho de 2026-09-07. */
const ON_COLOR = "var(--accent-secondary)";

/**
 * Peças que não são redondas na foto — cópia consciente da lista de
 * `ControllerTestScreen`: um realce circular em cima do braço do direcional ou
 * da pílula de select vaza para fora da peça e encosta na vizinha.
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

/**
 * Marcador sobre a foto. Bem mais simples que o `Spot` da tela de teste, de
 * propósito: aqui não existe intensidade analógica nem eixo — um spot só pode
 * estar em um de três estados, e nenhum deles muda 60 vezes por segundo.
 */
function Spot({ id, state }: { id: string; state: "target" | "captured" }) {
  const spot = CONTROLLER_SPOTS[id];
  if (!spot) return null;
  const isTarget = state === "target";
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: `${spot.x}%`,
        top: `${spot.y}%`,
        width: `${spot.w}%`,
        height: `${spot.h}%`,
        transform: "translate(-50%, -50%)",
        borderRadius: BOXY_SPOTS.has(id) ? "22%" : "50%",
        background: ON_COLOR,
        // O halo só existe no alvo: é o que a pessoa vê pelo canto do olho
        // enquanto olha para o controle, não para a tela. Os já capturados
        // ficam opacos e sem halo — dizem "já passei por aqui" sem disputar
        // atenção com o botão que está sendo pedido agora.
        boxShadow: isTarget ? `0 0 14px 4px ${ON_COLOR}` : "none",
        opacity: isTarget ? 0.7 : 0.18,
        transition: "opacity 120ms linear",
      }}
    />
  );
}

/** Uma nota do resumo final: de qual emulador veio e o que ele disse. */
interface AdapterNote {
  adapterName: string;
  message: string;
}

type Phase = "idle" | "running" | "done";

/**
 * Configuração unificada de controle: a pessoa aperta cada posição física uma
 * vez e o ZeuX escreve o bind equivalente em TODOS os emuladores instalados
 * que aceitam mapeamento, de uma vez.
 *
 * Existe porque configurar controle exigia abrir Configurações e mapear PCSX2
 * e RetroArch separadamente, cada um com seu painel — apertando os mesmos 16
 * botões duas vezes. A tradução entre "posição física" e o nome da ação de
 * cada adapter mora em `lib/controllerBindingTargets.ts`; ela também registra
 * por que isso é seguro (as "ações" dos adapters não são ações de jogo, são as
 * mesmas 16 posições com nomes diferentes).
 *
 * **Esta tela não afirma que gravou.** Ela chama a API igual para todo
 * adapter e mostra o `unapplied` que voltar: o RetroArch grava de verdade, o
 * PCSX2 devolve, para cada botão, a mensagem pedindo para configurar dentro do
 * próprio PCSX2 (`WriteBindings` nunca escreve bind de botão físico — formato
 * nunca validado contra o binário real, comportamento deliberado do backend).
 * Tratar o PCSX2 como caso especial aqui esconderia isso da pessoa.
 *
 * Os painéis por emulador (`EmulatorBindingsPanel`) continuam em Configurações
 * para quem quiser ajustar um emulador específico depois — este fluxo é o
 * caminho principal, não o único.
 */
export function ConfigureControllerScreen({ onBack }: { onBack: () => void }) {
  const t = useT(dict);
  const gamepad = useGamepad();

  const [phase, setPhase] = useState<Phase>("idle");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  /** Emuladores instalados e mapeáveis, congelados no início da sequência:
   *  a lista precisa ser a mesma do primeiro ao último botão. */
  const [adapters, setAdapters] = useState<EmulatorEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState<AdapterNote[]>([]);
  // Só true depois de uma tentativa real de listar emuladores — antes disso
  // `adapters` vazio não significa nada (ninguém perguntou ao servidor
  // ainda), e mostrar "nenhum emulador aceita" seria afirmar algo que o
  // ZeuX não verificou.
  const [checkedAdapters, setCheckedAdapters] = useState(false);

  const total = CONTROLLER_BINDING_TARGETS.length;
  const target = CONTROLLER_BINDING_TARGETS[index];

  // Rede de segurança da desmontagem: dá para sair pelo "Voltar" do cabeçalho
  // no meio da sequência. Sem este retomar incondicional a navegação por
  // controle ficaria suspensa no resto do app — o pior estado possível,
  // porque o sintoma aparece longe daqui.
  useEffect(() => resumeGamepadNavigation, []);

  async function start() {
    setStartError(null);
    setStarting(true);
    try {
      const { emulators } = await api.getEmulators();
      const bindable = emulators.filter((e) => e.installed && e.bindable);
      setAdapters(bindable);
      setCheckedAdapters(true);
      // Sem ninguém para receber o mapeamento, entrar na sequência pediria 16
      // botões para gravar nada.
      if (bindable.length === 0) return;
      setNotes([]);
      setIndex(0);
      suspendGamepadNavigation();
      setPhase("running");
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : t("loadEmulatorsError"));
    } finally {
      setStarting(false);
    }
  }

  function stop(next: Phase) {
    resumeGamepadNavigation();
    setPhase(next);
  }

  /** Avança, ou encerra se este era o último. Um caminho só para "gravou" e
   *  para "pulou" — a diferença entre os dois já aconteceu antes daqui.
   *  Lê `index` do render atual em vez de usar a forma com função: o efeito de
   *  captura já é recriado a cada posição, então o valor nunca está velho, e
   *  chamar `stop` (que mexe em outro estado) de dentro de um atualizador o
   *  faria rodar duas vezes no StrictMode. */
  function advance() {
    if (index + 1 >= total) {
      stop("done");
      return;
    }
    setIndex(index + 1);
  }

  /**
   * Escreve o botão capturado em todos os adapters, em paralelo.
   *
   * Cada chamada tem o próprio `catch`: um emulador com problema não pode
   * travar a pessoa no meio de 16 botões, então a falha vira nota no resumo e
   * a sequência continua. Mesma coisa com o `unapplied` — ele não é erro, é o
   * emulador dizendo honestamente o que não aplicou.
   */
  async function applyButton(buttonIndex: number) {
    const button = String(buttonIndex);
    const collected: AdapterNote[] = [];
    await Promise.all(
      adapters.map(async (emulator) => {
        const action = target.actionsByAdapter[emulator.adapter_id];
        // Adapter que não conhece esta posição simplesmente não recebe nada —
        // inventar um nome de ação faria o backend recusar a escrita inteira.
        if (!action) return;
        try {
          const result = await api.setEmulatorBindings(emulator.adapter_id, [{ action, button }]);
          for (const message of result.unapplied) {
            collected.push({ adapterName: emulator.name, message });
          }
        } catch (err) {
          collected.push({
            adapterName: emulator.name,
            message: t("writeFailed", {
              action,
              error: err instanceof ApiError ? err.message : String(err),
            }),
          });
        }
      }),
    );
    if (collected.length > 0) setNotes((prev) => [...prev, ...collected]);
  }

  // Captura de botão: poll via requestAnimationFrame procurando uma transição
  // solto→pressionado em QUALQUER botão — o índice cru dele é o valor gravado
  // (`String(i)`), o mesmo que `EmulatorBindingsPanel` já grava. Eixos ficam
  // de fora: as 16 posições desta lista são todas digitais.
  const prevButtonsRef = useRef<boolean[]>([]);
  useEffect(() => {
    if (phase !== "running") return;
    let frame: number;
    let cancelled = false;

    // **Semeado com o estado ATUAL do controle, não vazio.** Zerar aqui faria
    // um botão ainda segurado contar como transição nova no primeiro quadro da
    // próxima posição — um único aperto consumiria a sequência inteira,
    // gravando o mesmo botão em tudo (achado real em `EmulatorBindingsPanel`,
    // 2026-08-28).
    prevButtonsRef.current =
      Array.from(navigator.getGamepads?.() ?? [])
        .find((pad) => pad !== null)
        ?.buttons.map((b) => b.pressed) ?? [];

    function poll() {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find((p) => p !== null);
      if (pad) {
        for (let i = 0; i < pad.buttons.length; i++) {
          const isPressed = pad.buttons[i].pressed;
          const wasPressed = prevButtonsRef.current[i] ?? false;
          if (isPressed && !wasPressed && !cancelled) {
            cancelled = true;
            // A escrita é assíncrona, mas o avanço não espera por ela: a
            // sequência é do ritmo da pessoa, e as notas do que não aplicou só
            // são lidas no resumo final de qualquer jeito.
            void applyButton(i);
            advance();
            return;
          }
          prevButtonsRef.current[i] = isPressed;
        }
      }
      if (!cancelled) frame = requestAnimationFrame(poll);
    }
    frame = requestAnimationFrame(poll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
    // O efeito precisa reiniciar a cada posição da sequência (para semear o
    // estado anterior de novo), daí o `index` na lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  const capturedSpots = new Set(CONTROLLER_BINDING_TARGETS.slice(0, index).map((b) => b.spotId));
  // Só depois de uma tentativa real de iniciar: antes disso, a lista estar
  // vazia não significa nada (ninguém perguntou ao servidor ainda), e avisar
  // "nenhum emulador aceita" seria afirmar algo que o ZeuX não verificou.
  const semBindable = phase === "idle" && !starting && startError === null && checkedAdapters && adapters.length === 0;

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

      {startError && (
        <Callout label="—" tone="amber" className="mb-4">
          {startError}
        </Callout>
      )}

      {/* `flex-wrap` + `max-w-*` no texto: a linha divide espaço com a sidebar
          e precisa quebrar em janela estreita em vez de empurrar o botão para
          fora (CLAUDE.md, "Layout responsivo"). */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {phase === "running" ? (
          <>
            <Button variant="primary" onClick={advance}>
              {t("skipButton")}
            </Button>
            <Button variant="secondary" onClick={() => stop("idle")}>
              {t("cancelButton")}
            </Button>
            <p className="max-w-prose text-sm text-muted">
              <span className="font-mono text-xs tracking-wide text-muted uppercase">
                {t("progressLabel", { current: index + 1, total })}
              </span>{" "}
              — {t(`target_${target.id}` as never)}. {t("waitingForButton")}
            </p>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={() => void start()} disabled={!gamepad.connected || starting}>
              {phase === "done" ? t("restartButton") : t("startButton")}
            </Button>
            {starting && <p className="text-sm text-muted">{t("loadingEmulators")}</p>}
          </>
        )}
      </div>

      {semBindable && (
        <Callout label="—" tone="amber" className="mb-4">
          {t("noBindableEmulators")}
        </Callout>
      )}

      {phase === "done" && (
        <div className="mb-4">
          <h2 className="mb-1 text-lg font-semibold text-ink">{t("doneTitle")}</h2>
          <p className="text-sm text-muted">{t("doneSummary", { count: adapters.length })}</p>
        </div>
      )}

      {phase === "done" && notes.length > 0 && (
        <Callout label={t("perAdapterNotesHeading")} tone="amber" className="mb-4">
          <ul className="space-y-1 text-sm">
            {notes.map((note, i) => (
              <li key={i}>
                <span className="font-semibold">{note.adapterName}:</span> {note.message}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <Card filled>
        <div className="relative mx-auto w-full max-w-xl">
          <img
            src={controllerPhoto}
            alt=""
            aria-hidden="true"
            className="block w-full select-none"
            draggable={false}
          />
          {phase === "running" && (
            <>
              {[...capturedSpots].map((spotId) => (
                <Spot key={spotId} id={spotId} state="captured" />
              ))}
              <Spot id={target.spotId} state="target" />
            </>
          )}
        </div>
      </Card>
    </ScreenContainer>
  );
}
