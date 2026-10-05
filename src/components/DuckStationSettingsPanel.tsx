import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { DuckStationSetting, DuckStationSettings } from "../api/types";
import { useToast } from "../hooks/useToast";
import { useT } from "../i18n/i18n";
import { dict } from "./DuckStationSettingsPanel.i18n";
import { Button, Callout, InlineError, Toast, inputClass, ZSelect } from "./ui";
import { SelectItem } from "./ui/select";

// Grupos da tela, pela ID que o servidor devolve. Uma opção nova no catálogo
// do servidor que não esteja aqui não aparece — melhor do que aparecer sem
// rótulo.
const GROUPS: { title: keyof typeof dict; ids: string[] }[] = [
  {
    title: "groupScreen",
    ids: ["Main.StartFullscreen", "Main.HideMainWindowWhenRunning", "Main.HideCursorInFullscreen", "Main.DoubleClickTogglesFullscreen", "Display.AutoResizeWindow"],
  },
  {
    title: "groupBehavior",
    ids: [
      "Main.ConfirmPowerOff",
      "Main.SaveStateOnExit",
      "Main.CreateSaveStateBackups",
      "Main.PauseOnFocusLoss",
      "Main.PauseOnControllerDisconnection",
      "Main.DisableBackgroundInput",
      "Main.InhibitScreensaver",
      "Main.EnableDiscordPresence",
    ],
  },
  {
    title: "groupAudio",
    ids: ["Audio.Backend", "Audio.StretchMode", "Audio.BufferMS", "Audio.OutputLatencyMS", "Audio.OutputVolume", "Audio.FastForwardVolume"],
  },
  { title: "groupCards", ids: ["MemoryCards.Card1Type", "MemoryCards.UsePlaylistTitle"] },
];

/**
 * Opções do DuckStation na tela do console PS1 (2026-10-05, decisão do
 * Douglas). Lê e grava `GET/PUT /emulators/duckstation/settings`, que mescla
 * só as chaves mudadas no settings.ini — o resto do arquivo fica como está.
 * Só a instalação feita pelo ZeuX é editável; fora dela, a frase do servidor
 * explica por quê.
 */
export function DuckStationSettingsPanel() {
  const t = useT(dict);
  const [data, setData] = useState<DuckStationSettings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toastMessage, showToast } = useToast();

  function load() {
    api
      .getDuckStationSettings()
      .then((res) => {
        setData(res);
        setDraft({});
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("readError")));
  }
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !data) return <InlineError>{error}</InlineError>;
  if (!data) return <p className="text-sm text-muted">{t("loading")}</p>;
  if (!data.available) return <p className="max-w-prose text-sm text-muted">{data.message}</p>;

  const byId = new Map((data.settings ?? []).map((s) => [s.id, s]));
  const current = (s: DuckStationSetting) => draft[s.id] ?? s.value ?? s.default;
  const changed = Object.entries(draft).filter(([id, v]) => {
    const s = byId.get(id);
    return s && v !== (s.value ?? s.default);
  });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.setDuckStationSettings(Object.fromEntries(changed));
      setData(res);
      setDraft({});
      showToast(t("saved"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  const locked = Boolean(data.running);

  return (
    <div className="flex flex-col gap-5">
      {toastMessage && <Toast message={toastMessage} />}
      {locked && <Callout label="DuckStation">{t("running")}</Callout>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {GROUPS.map((group) => (
          <fieldset key={group.title} disabled={locked} className="flex min-w-0 flex-col gap-2.5">
            <legend className="mb-1 font-mono text-[11px] tracking-wide text-muted uppercase">{t(group.title)}</legend>
            {group.ids.map((id) => {
              const s = byId.get(id);
              if (!s) return null;
              const label = t(id as keyof typeof dict);
              const value = current(s);
              const set = (v: string) => setDraft((d) => ({ ...d, [id]: v }));
              if (s.kind === "bool") {
                return (
                  <label key={id} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" className="h-4 w-4" checked={value === "true"} onChange={(e) => set(e.target.checked ? "true" : "false")} />
                    {label}
                  </label>
                );
              }
              if (s.kind === "int") {
                return (
                  <label key={id} className="flex flex-col gap-1 text-sm text-ink">
                    {label}
                    <input
                      type="number"
                      min={s.min}
                      max={s.max}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className={`${inputClass} max-w-32`}
                    />
                  </label>
                );
              }
              return (
                <label key={id} className="flex flex-col gap-1 text-sm text-ink">
                  {label}
                  <ZSelect value={value} onValueChange={set} ariaLabel={label} disabled={locked} className="max-w-md">
                    {(s.choices ?? []).map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`choice.${c}` as keyof typeof dict)}
                      </SelectItem>
                    ))}
                  </ZSelect>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>

      {error && <InlineError>{error}</InlineError>}
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={locked || saving || changed.length === 0} onClick={() => void save()}>
          {saving ? t("saving") : t("save")}
        </Button>
        {changed.length === 0 && <span className="text-xs text-muted">{t("noChanges")}</span>}
      </div>
    </div>
  );
}
