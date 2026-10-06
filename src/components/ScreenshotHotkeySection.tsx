import { useEffect, useState } from "react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, ApiError } from "../api";
import type { ScreenshotButton, ScreenshotHotkeyResponse, ScreenshotHotkeyState } from "../api/types";
import { useToast } from "../hooks/useToast";
import { useT } from "../i18n/i18n";
import { dict } from "./ScreenshotHotkeySection.i18n";
import { Button, Callout, InlineError, PathTail, Toast, ZSelect } from "./ui";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { SelectItem } from "./ui/select";

/** Combinação sugerida (levantamento de 2026-10-06): Select + R3, testada nos três. */
const SUGGESTED: [ScreenshotButton, ScreenshotButton] = ["back", "r3"];
const NONE = "none";

type Mode = "keyboard" | "controller" | "none";

/**
 * Tecla de print por emulador (2026-10-06): tecla do teclado OU combinação
 * do controle (no RetroArch, os dois juntos). As opções são fechadas — F1 a
 * F12 e seis botões — para que nada que o Windows capture antes (PrintScreen,
 * botão Xbox) possa ser escolhido. Conflito com outro atalho do emulador é
 * recusado pelo servidor, que lê o arquivo de verdade.
 */
export function ScreenshotHotkeySection({ adapterId, name }: { adapterId: string; name: string }) {
  const t = useT(dict);
  const [res, setRes] = useState<ScreenshotHotkeyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyboard, setKeyboard] = useState(NONE);
  const [combo, setCombo] = useState<[ScreenshotButton, ScreenshotButton] | null>(null);
  const [mode, setMode] = useState<Mode>("none");
  const { toastMessage, showToast } = useToast();

  function apply(r: ScreenshotHotkeyResponse) {
    setRes(r);
    if (!r.available) return;
    const cur = r.hotkey.current;
    setKeyboard(cur.keyboard || NONE);
    const c = cur.controller && cur.controller.length === 2 ? (cur.controller as [ScreenshotButton, ScreenshotButton]) : null;
    setCombo(c);
    setMode(cur.keyboard ? "keyboard" : c ? "controller" : "none");
  }

  useEffect(() => {
    api
      .getScreenshotHotkey(adapterId)
      .then(apply)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("readError")));
  }, [adapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !res) return <InlineError>{error}</InlineError>;
  if (!res) return <p className="text-sm text-muted">{t("loading")}</p>;
  if (!res.available) return <p className="text-sm text-muted">{res.message}</p>;
  const st: ScreenshotHotkeyState = res.hotkey;
  const locked = res.running;

  async function save() {
    setSaving(true);
    setError(null);
    // Sem teclado+controle juntos onde o emulador só aceita uma ligação: o
    // modo escolhido decide qual dos dois vai.
    const sendKeyboard = st.coexist || mode === "keyboard" ? (keyboard === NONE ? "" : keyboard) : "";
    const sendCombo = st.coexist || mode === "controller" ? combo : null;
    try {
      const r = await api.setScreenshotHotkey(adapterId, { keyboard: sendKeyboard, controller: sendCombo ?? [] });
      apply(r);
      showToast(t("saved"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function openFolder() {
    if (!st.folder) return;
    // openPath só alcança a pasta de configuração do usuário; a do RetroArch
    // ou a do PCSX2 em Documentos podem estar fora dela — aí o Explorer abre
    // a pasta-mãe com esta selecionada.
    try {
      await openPath(st.folder);
    } catch {
      await revealItemInDir(st.folder).catch(() => {});
    }
  }

  const keyLabel = (k: string) => (k === st.default_keyboard ? `${k} ${t("defaultSuffix")}` : k);
  const buttonSelect = (index: 0 | 1, label: string) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-muted">
      {label}
      <ZSelect
        value={(combo ?? SUGGESTED)[index]}
        onValueChange={(v) => {
          const next = [...(combo ?? SUGGESTED)] as [ScreenshotButton, ScreenshotButton];
          next[index] = v as ScreenshotButton;
          setCombo(next);
        }}
        ariaLabel={label}
        disabled={locked}
      >
        {st.buttons.map((b) => (
          <SelectItem key={b} value={b}>
            {t(`button.${b}` as keyof typeof dict)}
          </SelectItem>
        ))}
      </ZSelect>
    </label>
  );
  const comboRow = <div className="flex flex-wrap gap-3">{buttonSelect(0, t("hold"))}{buttonSelect(1, t("press"))}</div>;
  const keySelect = (withNone: boolean) => (
    <ZSelect value={keyboard} onValueChange={setKeyboard} ariaLabel={t("key")} disabled={locked} className="max-w-xs">
      {withNone && <SelectItem value={NONE}>{t("none")}</SelectItem>}
      {st.keys.map((k) => (
        <SelectItem key={k} value={k}>
          {keyLabel(k)}
        </SelectItem>
      ))}
    </ZSelect>
  );

  return (
    <div className="flex flex-col gap-3">
      {toastMessage && <Toast message={toastMessage} />}
      <p className="max-w-prose text-sm text-muted">{t("intro", { name })}</p>
      {locked ? (
        <Callout label={t("title")} tone="amber">
          {t("running", { name })}
        </Callout>
      ) : (
        <p className="max-w-prose text-xs text-muted">{t("closeFirst", { name })}</p>
      )}
      {st.unrecognized && <p className="text-sm text-amber">{t("unrecognized", { value: st.unrecognized })}</p>}
      {st.warnings.map((w) => (
        <p key={w} className="max-w-prose text-sm text-amber">
          {w}
        </p>
      ))}

      {st.coexist ? (
        <>
          <label className="flex flex-col gap-1 text-sm text-ink">
            {t("keyboard")}
            {keySelect(true)}
          </label>
          <div className="flex flex-col gap-1 text-sm text-ink">
            {t("controller")}
            <ZSelect
              value={combo ? "combo" : NONE}
              onValueChange={(v) => setCombo(v === NONE ? null : (combo ?? SUGGESTED))}
              ariaLabel={t("controller")}
              disabled={locked}
              className="max-w-xs"
            >
              <SelectItem value={NONE}>{t("none")}</SelectItem>
              <SelectItem value="combo">{t("combo")}</SelectItem>
            </ZSelect>
            {combo && comboRow}
            {combo && <p className="max-w-prose text-xs text-muted">{t("retroarchCombo")}</p>}
          </div>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm text-ink">
            {t("mode")}
            <ZSelect
              value={mode}
              onValueChange={(v) => {
                setMode(v as Mode);
                if (v === "keyboard" && keyboard === NONE) setKeyboard(st.default_keyboard);
                if (v === "controller" && !combo) setCombo(SUGGESTED);
              }}
              ariaLabel={t("mode")}
              disabled={locked}
              className="max-w-xs"
            >
              <SelectItem value="keyboard">{t("modeKeyboard")}</SelectItem>
              <SelectItem value="controller">{t("modeController")}</SelectItem>
              <SelectItem value="none">{t("modeNone")}</SelectItem>
            </ZSelect>
          </label>
          {mode === "keyboard" && keySelect(false)}
          {mode === "controller" && comboRow}
          <p className="max-w-prose text-xs text-muted">{t("oneBinding", { name })}</p>
        </>
      )}
      <p className="max-w-prose text-xs text-muted">{t("guideNote")}</p>

      {st.folder && (
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-[11px] tracking-wide text-muted uppercase">{t("folder", { name })}</p>
          <PathTail path={st.folder} className="font-mono text-xs text-ink" />
          {st.folder_exists ? (
            <Button variant="chrome" size="sm" className="w-fit" onClick={() => void openFolder()}>
              {t("openFolder")}
            </Button>
          ) : (
            <p className="text-xs text-muted">{t("folderMissing")}</p>
          )}
        </div>
      )}

      {error && <InlineError>{error}</InlineError>}
      <Button variant="primary" className="w-fit" disabled={locked || saving} onClick={() => void save()}>
        {saving ? t("saving") : t("save")}
      </Button>
    </div>
  );
}

/** Modal só com a tecla de print — para o RetroArch, que não tem as outras opções. */
export function ScreenshotHotkeyModal({ adapterId, name, onClose }: { adapterId: string; name: string; onClose: () => void }) {
  const t = useT(dict);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-lg border border-line bg-fill p-5 ring-0 sm:max-w-2xl">
        <DialogTitle className="text-lg font-semibold text-ink">{t("modalTitle", { name })}</DialogTitle>
        <DialogDescription className="sr-only">{t("intro", { name })}</DialogDescription>
        <ScreenshotHotkeySection adapterId={adapterId} name={name} />
      </DialogContent>
    </Dialog>
  );
}
