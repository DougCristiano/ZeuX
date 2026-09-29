import { useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { EmulatorEntry } from "../api/types";
import { useT } from "../i18n/i18n";
import { dict } from "./EmulatorControllerList.i18n";
import { Badge, Button, ConfirmModal, InlineError } from "./ui";

type RowState = "needs-preset" | "manual" | "preset-done" | "auto";

function rowState(e: EmulatorEntry): RowState {
  if (e.controller_support === "auto") return "auto";
  if (e.controller_support === "manual") return "manual";
  return e.controller_preset_applied ? "preset-done" : "needs-preset";
}

// O que pede ação vem primeiro: quem abre a tela quer saber "falta alguma
// coisa?", e a resposta não pode ficar escondida entre linhas de "tudo certo".
const ORDER: Record<RowState, number> = { "needs-preset": 0, manual: 1, "preset-done": 2, auto: 3 };

/**
 * Um emulador por linha, dizendo o que falta para o controle funcionar nele
 * (2026-09-29, pedido do Douglas: "a configuração de controle para os outros
 * consoles além do RetroArch e PS2 precisa aparecer também").
 *
 * A resposta de cada um vem do servidor (`controller_support`,
 * internal/emulator/controller_preset.go), nunca de uma lista aqui: quem sabe
 * se o DuckStation desta máquina é portátil, ou se o RPCS3 roda no Windows, é
 * o daemon.
 *
 * O RPCS3 pede confirmação antes de gravar porque, lá, ligar o controle
 * **desliga o teclado** no jogador 1 (um handler por jogador). Refazer o
 * padrão por cima de um mapeamento que já existe também confirma — pode ser
 * um ajuste do próprio usuário. Aplicar pela primeira vez em PCSX2 e
 * DuckStation não confirma: o padrão liga controle e teclado juntos, e o
 * servidor guarda backup do arquivo antes.
 */
export function EmulatorControllerList({
  emulators,
  onChanged,
}: {
  emulators: EmulatorEntry[];
  onChanged: () => void;
}) {
  const t = useT(dict);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<EmulatorEntry | null>(null);

  // A ordem "o que falta primeiro" é decidida uma vez e congelada: reordenar
  // a cada recarga faria a linha pular para baixo no instante em que a pessoa
  // clica em "Aplicar" — o botão some debaixo do cursor.
  const frozenOrder = useRef<Map<string, number> | null>(null);
  const rows = emulators
    .filter((e) => e.installed && e.controller_support)
    .map((e) => ({ emulator: e, state: rowState(e) }))
    .sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  if (frozenOrder.current === null && rows.length > 0) {
    frozenOrder.current = new Map(rows.map((r, i) => [r.emulator.adapter_id, i]));
  }
  const position = (id: string) => frozenOrder.current?.get(id) ?? Number.MAX_SAFE_INTEGER;
  rows.sort((a, b) => position(a.emulator.adapter_id) - position(b.emulator.adapter_id));

  async function apply(emulator: EmulatorEntry) {
    setConfirming(null);
    setBusy(emulator.adapter_id);
    setErrors(({ [emulator.adapter_id]: _, ...rest }) => rest);
    try {
      await api.applyControllerPreset(emulator.adapter_id);
      onChanged();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [emulator.adapter_id]: err instanceof ApiError ? err.message : t("applyFailed"),
      }));
    } finally {
      setBusy(null);
    }
  }

  async function open(emulator: EmulatorEntry) {
    setErrors(({ [emulator.adapter_id]: _, ...rest }) => rest);
    try {
      await api.openEmulator(emulator.adapter_id);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [emulator.adapter_id]: err instanceof ApiError ? err.message : t("openFailed"),
      }));
    }
  }

  function requestApply(emulator: EmulatorEntry, state: RowState) {
    if (emulator.adapter_id === "rpcs3" || state === "preset-done") {
      setConfirming(emulator);
      return;
    }
    void apply(emulator);
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted">{t("noneInstalled")}</p>;
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-line">
        {rows.map(({ emulator, state }) => (
          <li key={emulator.adapter_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1 basis-64">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{emulator.name}</span>
                <Badge variant={state === "needs-preset" || state === "manual" ? "warn" : "solid"}>
                  {t(`badge_${state}` as never)}
                </Badge>
              </div>
              <p className="mt-1 max-w-prose text-sm text-muted">
                {state === "needs-preset" && emulator.adapter_id === "rpcs3"
                  ? t("detail_needs_preset_rpcs3")
                  : t(`detail_${state.replace("-", "_")}` as never, { name: emulator.name } as never)}
              </p>
              {errors[emulator.adapter_id] && (
                <InlineError className="mt-1">{errors[emulator.adapter_id]}</InlineError>
              )}
            </div>
            {(state === "needs-preset" || state === "preset-done") && (
              <Button
                variant={state === "needs-preset" ? "primary" : "chrome"}
                size="sm"
                disabled={busy !== null}
                onClick={() => requestApply(emulator, state)}
              >
                {busy === emulator.adapter_id
                  ? t("applying")
                  : state === "needs-preset"
                    ? t("applyPreset")
                    : t("reapplyPreset")}
              </Button>
            )}
            {state === "manual" && (
              <Button variant="chrome" size="sm" onClick={() => void open(emulator)}>
                {t("openEmulator", { name: emulator.name })}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {confirming && (
        <ConfirmModal
          title={t("confirmTitle", { name: confirming.name })}
          message={confirming.adapter_id === "rpcs3" ? t("confirmRPCS3") : t("confirmReapply", { name: confirming.name })}
          onClose={() => setConfirming(null)}
          actions={
            <>
              <Button variant="chrome" onClick={() => setConfirming(null)}>
                {t("cancel")}
              </Button>
              <Button variant="primary" onClick={() => void apply(confirming)}>
                {t("confirmApply")}
              </Button>
            </>
          }
        />
      )}
    </>
  );
}
