import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { InputBinding } from "../api/types";
import { translateKeyForAdapter } from "../lib/keyMapping";
import { Button, InlineError, Toast } from "./ui";
import { useToast } from "../hooks/useToast";

/**
 * Tela de mapeamento de teclado/controle (H3/H4, docs/roadmap.md) — só
 * aparece para adapters com `bindable: true` (PCSX2/RetroArch nesta v1.0).
 *
 * **Detecção de controle via Gamepad API do navegador, não uma rota do
 * ZeuX.** O roadmap cogitava `GET /api/v1/controllers`, mas isso exigiria
 * uma lib de gamepad em Go — o H3 já registra que isso arrisca quebrar o
 * build sem CGO que o ADR 0011 preserva de propósito, e sugere a
 * alternativa adotada aqui: a própria WebView já expõe
 * `navigator.getGamepads()`/`gamepadconnected`, sem custar dependência
 * nenhuma. Decisão tomada nesta sessão, registrada no roadmap.
 *
 * **O que esta tela NÃO pôde verificar nesta sessão: nenhum controle físico
 * estava conectado.** A escrita do vínculo de botão (`_btn`/formato de
 * botão do PCSX2) funciona e está testada com valores sintéticos, mas o
 * significado real de cada índice de botão — "o índice 0 é o botão Cross
 * de verdade?" — só pode ser confirmado com hardware conectado. Mesma
 * classe de achado que D11/B11 já registram: fica para o Douglas fechar.
 */
export function EmulatorBindingsPanel({ adapterId, adapterName }: { adapterId: string; adapterName: string }) {
  const [actions, setActions] = useState<string[]>([]);
  const [bindings, setBindings] = useState<InputBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listeningKeyFor, setListeningKeyFor] = useState<string | null>(null);
  const [listeningButtonFor, setListeningButtonFor] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ action: string; key: string; withAction: string } | null>(null);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  // N9 (docs/roadmap.md, Sprint N): antes, gravar um mapeamento não dizia
  // nada — só o painel recarregava em silêncio.
  const { toastMessage, showToast } = useToast();

  function load() {
    setLoading(true);
    setError(null);
    api
      .getEmulatorBindings(adapterId)
      .then((res) => {
        setActions(res.actions ?? []);
        setBindings(res.bindings ?? []);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível ler o mapeamento."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [adapterId]);

  // Detecção de controle conectado — só isso (listar), não captura de
  // botão. A captura de botão (abaixo) só entra quando o usuário clica
  // "Mapear controle" para uma ação específica.
  useEffect(() => {
    function refresh() {
      const pads = navigator.getGamepads?.() ?? [];
      setGamepadConnected(Array.from(pads).some((p) => p !== null));
    }
    refresh();
    window.addEventListener("gamepadconnected", refresh);
    window.addEventListener("gamepaddisconnected", refresh);
    return () => {
      window.removeEventListener("gamepadconnected", refresh);
      window.removeEventListener("gamepaddisconnected", refresh);
    };
  }, []);

  async function saveBinding(action: string, patch: Partial<Pick<InputBinding, "key" | "button">>) {
    setError(null);
    try {
      const result = await api.setEmulatorBindings(adapterId, [{ action, ...patch }]);
      if ((result.unapplied ?? []).length > 0) {
        setError(result.unapplied.join(" "));
      } else {
        showToast("Mapeamento salvo.");
      }
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar o mapeamento.");
    }
  }

  function currentKeyOwner(key: string, exceptAction: string): string | null {
    const owner = bindings.find((b) => b.key === key && b.action !== exceptAction);
    return owner ? owner.action : null;
  }

  // Captura de tecla: um listener global de keydown enquanto
  // listeningKeyFor não é null — mesma técnica de qualquer tela de
  // "pressione uma tecla" (ex.: rebind de atalho).
  useEffect(() => {
    if (!listeningKeyFor) return;
    const action = listeningKeyFor;

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      const translated = translateKeyForAdapter(adapterId, e);
      setListeningKeyFor(null);
      if (!translated) {
        setError(`A tecla "${e.key}" não pode ser mapeada para o ${adapterName}.`);
        return;
      }
      const owner = currentKeyOwner(translated, action);
      if (owner) {
        setConflict({ action, key: translated, withAction: owner });
        return;
      }
      saveBinding(action, { key: translated });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listeningKeyFor]);

  // Captura de botão: poll via requestAnimationFrame comparando o estado
  // anterior de cada botão do primeiro controle conectado, para achar uma
  // transição solto→pressionado (não o estado já pressionado ao entrar no
  // modo de captura).
  const prevButtonsRef = useRef<boolean[]>([]);
  useEffect(() => {
    if (!listeningButtonFor) return;
    const action = listeningButtonFor;
    let frame: number;
    let cancelled = false;

    prevButtonsRef.current = [];

    function poll() {
      const pads = navigator.getGamepads?.() ?? [];
      const pad = Array.from(pads).find((p) => p !== null);
      if (pad) {
        pad.buttons.forEach((b, i) => {
          const wasPressed = prevButtonsRef.current[i] ?? false;
          if (b.pressed && !wasPressed && !cancelled) {
            cancelled = true;
            setListeningButtonFor(null);
            saveBinding(action, { button: String(i) });
            return;
          }
          prevButtonsRef.current[i] = b.pressed;
        });
      }
      if (!cancelled) frame = requestAnimationFrame(poll);
    }
    frame = requestAnimationFrame(poll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listeningButtonFor]);

  if (loading) return <p className="text-sm text-muted">Lendo o mapeamento do {adapterName}…</p>;

  return (
    <div className="flex flex-col gap-3">
      {toastMessage && <Toast message={toastMessage} />}
      {error && <InlineError>{error}</InlineError>}

      {!gamepadConnected && (
        <p className="text-xs text-muted">
          Nenhum controle detectado — conecte um para mapear botões. O mapeamento de teclado funciona sem controle
          nenhum.
        </p>
      )}

      {conflict && (
        <div className="rounded border border-dashed border-line-strong p-3">
          <p className="text-sm text-ink">
            A tecla já está em "{conflict.withAction}". Trocar para "{conflict.action}" também?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="primary"
              autoFocus
              onClick={() => {
                const { action, key } = conflict;
                setConflict(null);
                saveBinding(action, { key });
              }}
            >
              Trocar mesmo assim
            </Button>
            <Button variant="secondary" onClick={() => setConflict(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* O4 (docs/roadmap.md, Sprint O): era `grid grid-cols-[1fr_auto_auto]` —
          em janela de notebook (1024-1279px) o card fica estreito demais para
          duas colunas `auto` de botão + a coluna `1fr` do nome da ação, e o
          grid estourava o card com rolagem horizontal. `flex-wrap` deixa os
          botões quebrarem para a linha de baixo em vez de forçar largura. */}
      <div className="flex flex-col gap-2">
        {actions.map((action) => {
          const binding = bindings.find((b) => b.action === action);
          return (
            <div key={action} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 shrink text-sm break-words text-ink">
                {action}
                <span className="ml-2 text-xs text-muted">
                  {binding?.key ?? "sem tecla"}
                  {binding?.button ? ` · botão ${binding.button}` : ""}
                </span>
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={listeningKeyFor !== null}
                  onClick={() => setListeningKeyFor(action)}
                >
                  {listeningKeyFor === action ? "Aperte uma tecla…" : "Mapear tecla"}
                </Button>
                {gamepadConnected && (
                  <Button
                    variant="secondary"
                    disabled={listeningButtonFor !== null}
                    onClick={() => setListeningButtonFor(action)}
                  >
                    {listeningButtonFor === action ? "Aperte um botão…" : "Mapear controle"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
