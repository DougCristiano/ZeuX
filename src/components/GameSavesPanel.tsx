import { useEffect, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, ApiError } from "../api";
import type { GameSavesResponse, SaveBackup, SaveFileInfo } from "../api/types";
import { useToast } from "../hooks/useToast";
import { useT } from "../i18n/i18n";
import { formatBytes, formatFileDate } from "../lib/format";
import { dict } from "./GameSavesPanel.i18n";
import { Button, Card, InlineError, Toast } from "./ui";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

/**
 * Saves de um jogo na tela do jogo (2026-10-05): cartão de memória, estados
 * salvos por slot (com a "cópia anterior" que o emulador guarda e o estado de
 * Continuar), backup e restauração, e abrir a pasta. Só PS1 (DuckStation) e
 * PS2 (PCSX2) — os dois com o local dos saves verificado. Nunca toca na ROM.
 */
export function GameSavesPanel({ gameId }: { gameId: number }) {
  const t = useT(dict);
  const [data, setData] = useState<GameSavesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<SaveBackup | null>(null);
  const [includeCard, setIncludeCard] = useState(false);
  const { toastMessage, showToast } = useToast();

  function load() {
    api
      .getGameSaves(gameId)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("readError")));
  }
  useEffect(load, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !data) return <InlineError>{error}</InlineError>;
  if (!data) return <p className="text-sm text-muted">{t("loading")}</p>;
  if (!data.known || !data.saves) return <p className="text-sm text-muted">{t("unknown")}</p>;
  const saves = data.saves;
  const backups = data.backups ?? [];

  async function backup() {
    setBusy(true);
    setError(null);
    try {
      await api.backupGameSaves(gameId);
      showToast(t("backupDone"));
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function restore(b: SaveBackup) {
    setRestoring(null);
    setBusy(true);
    setError(null);
    try {
      await api.restoreGameSaves(gameId, b.id, includeCard);
      showToast(t("restored"));
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
      setIncludeCard(false);
    }
  }

  const stateLabel = (f: SaveFileInfo) =>
    f.slot === -1 ? t("resume") : f.slot !== undefined ? t("slot", { n: f.slot }) : f.name;
  const reveal = (path?: string) => {
    if (path) void revealItemInDir(path).catch(() => {});
  };
  const hasFiles = saves.memory_cards.length + saves.save_states.length > 0;

  return (
    <Card filled className="flex flex-col gap-4">
      {toastMessage && <Toast message={toastMessage} />}

      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[11px] tracking-wide text-muted uppercase">{t("memoryCard")}</p>
        {saves.memory_cards.length === 0 ? (
          <p className="text-sm text-muted">{t("noMemoryCard")}</p>
        ) : (
          saves.memory_cards.map((f) => (
            <FileRow key={f.path} label={f.name} file={f} onReveal={() => reveal(f.path)} />
          ))
        )}
        {saves.memory_card_shared && <p className="text-xs text-muted">{t("memoryCardShared")}</p>}
        {saves.memory_cards_approximate && <p className="text-xs text-amber">{t("memoryCardApprox")}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[11px] tracking-wide text-muted uppercase">{t("states")}</p>
        {!saves.serial ? (
          <p className="text-sm text-muted">{t("noSerial")}</p>
        ) : saves.save_states.length === 0 ? (
          <p className="text-sm text-muted">{t("noStates")}</p>
        ) : (
          saves.save_states.map((f) => (
            <FileRow
              key={f.path}
              label={stateLabel(f) + (f.backup ? ` · ${t("previous")}` : "")}
              file={f}
              onReveal={() => reveal(f.path)}
            />
          ))
        )}
      </div>

      {error && <InlineError>{error}</InlineError>}

      <div className="flex flex-wrap gap-2">
        <Button variant="chrome" disabled={busy || !hasFiles} onClick={() => void backup()}>
          {busy ? t("backingUp") : t("backup")}
        </Button>
        <Button variant="chrome" onClick={() => reveal(saves.save_states[0]?.path ?? saves.memory_cards[0]?.path ?? saves.states_dir)}>
          {t("openFolder")}
        </Button>
      </div>

      {backups.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-[11px] tracking-wide text-muted uppercase">{t("backups")}</p>
          {backups.slice(0, 5).map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="font-mono text-xs text-ink">
                {formatFileDate(b.created_at)} · {b.files}
              </span>
              <Button variant="chrome" size="sm" disabled={busy} onClick={() => setRestoring(b)}>
                {t("restore")}
              </Button>
            </div>
          ))}
        </div>
      )}

      {restoring && (
        <Dialog open onOpenChange={(open) => !open && setRestoring(null)}>
          <DialogContent className="rounded-lg border border-line bg-fill p-5 ring-0 sm:max-w-md">
            <DialogTitle className="mb-2 text-lg font-semibold text-ink">{t("restoreTitle")}</DialogTitle>
            <DialogDescription className="text-sm text-ink">
              {t("restoreMessage", { date: formatFileDate(restoring.created_at) })}
            </DialogDescription>
            {restoring.has_memory_card && (
              <label className="mt-3 flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={includeCard} onChange={(e) => setIncludeCard(e.target.checked)} />
                {saves.memory_card_shared ? t("includeCardShared") : t("includeCard")}
              </label>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="chrome" onClick={() => setRestoring(null)}>
                {t("cancel")}
              </Button>
              <Button variant="primary" onClick={() => void restore(restoring)}>
                {t("restore")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function FileRow({ label, file, onReveal }: { label: string; file: SaveFileInfo; onReveal: () => void }) {
  return (
    <button
      type="button"
      onClick={onReveal}
      title={file.path}
      className="flex items-center justify-between gap-3 rounded-sm px-1 py-0.5 text-left text-sm text-ink hover:bg-white/5"
    >
      <span className="min-w-0 break-words">{label}</span>
      <span className="shrink-0 font-mono text-xs text-muted">
        {formatFileDate(file.modified_at)} · {formatBytes(file.size_bytes)}
      </span>
    </button>
  );
}
