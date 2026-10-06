import { useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { api, ApiError, coverImageURL } from "../api";
import type { GameScreenshotsResponse } from "../api/types";
import { useToast } from "../hooks/useToast";
import { useT } from "../i18n/i18n";
import { ScreenshotLightbox } from "./ScreenshotLightbox";
import { dict } from "./Screenshots.i18n";
import { Button, Card, ConfirmModal, InlineError, Toast } from "./ui";

/**
 * Galeria de prints de um jogo (2026-10-06). Os arquivos chegam movidos
 * pelo zeuxd ao fim de cada sessão (emulator/screenshots.go); aqui a pessoa
 * vê, apaga e escolhe um para ser o fundo do topo da tela (`onBannerChange`).
 */
export function GameScreenshotsPanel({
  gameId,
  gameTitle,
  onBannerChange,
}: {
  gameId: number;
  gameTitle: string;
  onBannerChange: (bannerUrl: string | undefined) => void;
}) {
  const t = useT(dict);
  const [data, setData] = useState<GameScreenshotsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toastMessage, showToast } = useToast();

  function load() {
    api
      .getGameScreenshots(gameId)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("readError")));
  }
  useEffect(load, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !data) return <InlineError>{error}</InlineError>;
  if (!data) return <p className="text-sm text-muted">{t("loading")}</p>;
  const shots = data.screenshots;

  async function toggleBanner(name: string) {
    if (!data) return;
    const next = data.banner_name === name ? "" : name;
    setBusy(true);
    setError(null);
    try {
      const res = await api.setGameBanner(gameId, next);
      setData({ ...data, banner_name: next });
      onBannerChange(res.banner_url);
      showToast(next ? t("bannerSet") : t("bannerCleared"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    if (!data) return;
    setConfirmDelete(null);
    setBusy(true);
    setError(null);
    try {
      await api.deleteGameScreenshot(gameId, name);
      const rest = data.screenshots.filter((s) => s.name !== name);
      // O servidor limpa o banner junto quando o print apagado era ele.
      if (data.banner_name === name) onBannerChange(undefined);
      setData({ ...data, screenshots: rest, banner_name: data.banner_name === name ? "" : data.banner_name });
      if (rest.length === 0) setOpen(null);
      else if (open !== null && open >= rest.length) setOpen(rest.length - 1);
      showToast(t("deleted"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const current = open !== null ? shots[open] : undefined;

  return (
    <Card filled className="flex flex-col gap-3">
      {toastMessage && <Toast message={toastMessage} />}
      {shots.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        // `auto-fill` com piso de 9rem: a grade ganha colunas conforme a
        // coluna da tela cresce, sem breakpoint de janela (regra de
        // responsividade do CLAUDE.md).
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
          {shots.map((s, i) => (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => setOpen(i)}
                title={s.name}
                className="group relative block aspect-video w-full overflow-hidden rounded-md border border-line bg-black transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <img
                  src={coverImageURL(s.url)}
                  alt={s.name}
                  loading="lazy"
                  className="h-full w-full object-cover [image-rendering:pixelated] transition-transform group-hover:scale-105"
                />
                {data.banner_name === s.name && (
                  <span className="absolute top-1 left-1 rounded-sm bg-paper/85 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-ink uppercase">
                    {t("isBanner")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <InlineError>{error}</InlineError>}

      {shots.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs text-muted">{t("count", { n: shots.length })}</span>
          <Button variant="chrome" size="sm" onClick={() => void openPath(data.folder).catch(() => {})}>
            {t("openFolder")}
          </Button>
        </div>
      )}

      {current && open !== null && (
        <ScreenshotLightbox
          shots={shots}
          index={open}
          onIndexChange={setOpen}
          onClose={() => setOpen(null)}
          title={gameTitle}
          actions={
            <>
              <Button variant="chrome" disabled={busy} onClick={() => setConfirmDelete(current.name)}>
                {t("delete")}
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void toggleBanner(current.name)}>
                {data.banner_name === current.name ? t("removeBanner") : t("useAsBanner")}
              </Button>
            </>
          }
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={t("deleteTitle")}
          message={t("deleteMessage")}
          onClose={() => setConfirmDelete(null)}
          actions={
            <>
              <Button variant="chrome" onClick={() => setConfirmDelete(null)}>
                {t("cancel")}
              </Button>
              <Button variant="danger" onClick={() => void remove(confirmDelete)}>
                {t("delete")}
              </Button>
            </>
          }
        />
      )}
    </Card>
  );
}
