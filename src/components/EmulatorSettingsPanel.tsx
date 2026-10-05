import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { EmulatorSetting, EmulatorSettings, PCSX2Portable } from "../api/types";
import { useToast } from "../hooks/useToast";
import { useT } from "../i18n/i18n";
import { dict } from "./EmulatorSettingsPanel.i18n";
import { formatBytes } from "../lib/format";
import { Button, Callout, ConfirmModal, InlineError, Toast, inputClass, ZSelect } from "./ui";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { SelectItem } from "./ui/select";

// Grupos da tela por emulador, pela ID que o servidor devolve. Uma opção nova
// no catálogo do servidor que não esteja aqui não aparece — melhor do que
// aparecer sem rótulo.
type Group = { title: keyof typeof dict; ids: string[] };
const GROUPS: Record<string, Group[]> = {
  duckstation: [
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
  ],
  pcsx2: [
    { title: "groupScreen", ids: ["UI.StartFullscreen", "UI.DoubleClickTogglesFullscreen", "UI.HideMouseCursor"] },
    {
      title: "groupBehavior",
      ids: ["UI.ConfirmShutdown", "EmuCore.InhibitScreensaver", "EmuCore.EnableDiscordPresence"],
    },
    {
      title: "groupStates",
      ids: ["EmuCore.SaveStateOnShutdown", "EmuCore.BackupSavestate", "EmuCore.UseSavestateSelector"],
    },
    { title: "groupAudio", ids: ["SPU2/Output.BufferMS", "SPU2/Output.StandardVolume"] },
    { title: "groupVideo", ids: ["EmuCore/GS.upscale_multiplier", "EmuCore/GS.VsyncEnable"] },
  ],
};

/**
 * Opções de um emulador na tela do console (2026-10-05, decisão do Douglas:
 * DuckStation no PS1, PCSX2 no PS2). Lê e grava `GET/PUT
 * /emulators/{id}/settings`, que mescla só as chaves mudadas no arquivo do
 * emulador — o resto fica como está. Quando não há o que editar, a frase do
 * servidor explica por quê.
 */
export function EmulatorSettingsPanel({ adapterId, name }: { adapterId: string; name: string }) {
  const t = useT(dict);
  const [data, setData] = useState<EmulatorSettings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toastMessage, showToast } = useToast();

  function load() {
    api
      .getEmulatorSettings(adapterId)
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
  const current = (s: EmulatorSetting) => draft[s.id] ?? s.value ?? s.default;
  const changed = Object.entries(draft).filter(([id, v]) => {
    const s = byId.get(id);
    return s && v !== (s.value ?? s.default);
  });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.setEmulatorSettings(adapterId, Object.fromEntries(changed));
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
      {locked && <Callout label={name}>{t("running", { name })}</Callout>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {(GROUPS[adapterId] ?? []).map((group) => (
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
      {/* Rodapé fixo: no modal a lista rola, e "Salvar" no fim da rolagem
          ficava fora de vista. */}
      <div className="sticky -bottom-1 z-10 -mx-5 flex items-center gap-3 border-t border-line bg-fill px-5 pt-3 pb-4">
        <Button variant="primary" disabled={locked || saving || changed.length === 0} onClick={() => void save()}>
          {saving ? t("saving") : t("save")}
        </Button>
        {changed.length === 0 && <span className="text-xs text-muted">{t("noChanges")}</span>}
      </div>
    </div>
  );
}

/**
 * O painel dentro de um modal, aberto pelo botão no topo da tela do console.
 * Largura com teto (`max-w`), nunca fixa; a altura acompanha a janela e o
 * conteúdo rola por dentro — a lista de opções passa da altura de uma janela
 * pequena. No PCSX2 o modal abre com a pasta dos dados (modo portátil).
 */
export function EmulatorSettingsModal({ adapterId, name, onClose }: { adapterId: string; name: string; onClose: () => void }) {
  const t = useT(dict);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-lg border border-line bg-fill p-5 pb-0 ring-0 sm:max-w-3xl">
        <DialogTitle className="text-lg font-semibold text-ink">{t("modalTitle", { name })}</DialogTitle>
        <DialogDescription className="mb-2 text-sm text-muted">{t("modalDescription", { name })}</DialogDescription>
        {adapterId === "pcsx2" && <PCSX2PortableSection />}
        <EmulatorSettingsPanel adapterId={adapterId} name={name} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Modo portátil do PCSX2 (2026-10-05): mostra onde estão os dados e oferece
 * mover de Documentos para a pasta do ZeuX — com confirmação, sem apagar a
 * origem. Apagar a pasta antiga é um segundo passo, com outra confirmação.
 */
function PCSX2PortableSection() {
  const t = useT(dict);
  const [st, setSt] = useState<PCSX2Portable | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"migrate" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    api.getPCSX2Portable().then(setSt).catch(() => {});
  }, []);

  if (!st || !st.supported || !st.managed) return null;

  async function run(kind: "migrate" | "remove") {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      const res = kind === "migrate" ? await api.migratePCSX2() : await api.removePCSX2Legacy();
      setSt(res);
      setNote(kind === "migrate" ? t("migrated") : t("removedLegacy"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-5 flex flex-col gap-2 border-b border-line pb-5">
      <h3 className="font-mono text-[11px] tracking-wide text-muted uppercase">{t("portableTitle")}</h3>
      {st.portable ? (
        <>
          <p className="text-sm text-ink">{t("portableOn")}</p>
          {st.legacy_exists && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted">{t("legacyLeft", { dir: st.legacy_dir ?? "" })}</p>
              <Button variant="chrome" disabled={busy} onClick={() => setConfirm("remove")}>
                {t("removeLegacy")}
              </Button>
            </div>
          )}
        </>
      ) : st.legacy_exists ? (
        <>
          <p className="max-w-prose text-sm text-ink">{t("portableOff", { dir: st.legacy_dir ?? "" })}</p>
          <ul className="font-mono text-xs text-muted">
            {st.items.map((it) => (
              <li key={it.name}>{t("portableItems", { name: it.name, files: it.files, size: formatBytes(it.bytes) })}</li>
            ))}
          </ul>
          <Button variant="primary" className="w-fit" disabled={busy} onClick={() => setConfirm("migrate")}>
            {busy ? t("migrating") : t("migrate")}
          </Button>
        </>
      ) : null}
      {note && <p className="text-sm text-accent-secondary">{note}</p>}
      {error && <InlineError>{error}</InlineError>}
      {confirm && (
        <ConfirmModal
          title={confirm === "migrate" ? t("migrateConfirmTitle") : t("removeLegacyConfirmTitle")}
          message={confirm === "migrate" ? t("migrateConfirm", { dir: st.legacy_dir ?? "" }) : t("removeLegacyConfirm", { dir: st.legacy_dir ?? "" })}
          onClose={() => setConfirm(null)}
          actions={
            <>
              <Button variant="chrome" onClick={() => setConfirm(null)}>
                {t("cancel")}
              </Button>
              <Button variant="primary" onClick={() => void run(confirm)}>
                {t("confirm")}
              </Button>
            </>
          }
        />
      )}
    </section>
  );
}
