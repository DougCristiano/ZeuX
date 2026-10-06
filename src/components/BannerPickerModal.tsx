import { useEffect, useState } from "react";
import { api, ApiError, coverImageURL } from "../api";
import type { Screenshot } from "../api/types";
import { useT } from "../i18n/i18n";
import { pickAndAddScreenshots } from "../lib/pickScreenshots";
import { dict } from "./Screenshots.i18n";
import { Button, InlineError } from "./ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

/**
 * Escolha do banner do jogo (2026-10-06, pedido do Douglas: "deixar ele
 * decidir qual será o banner"). A galeria inteira em grade; um clique
 * define. Dá para enviar uma imagem nova já como banner, ou voltar à capa.
 * O banner sempre é um arquivo da galeria — uma imagem enviada aqui entra
 * nela também, para a pessoa achá-la e apagá-la no mesmo lugar.
 */
export function BannerPickerModal({
  gameId,
  onClose,
  onChanged,
}: {
  gameId: number;
  onClose: () => void;
  /** Banner novo (ou ausente) e aviso de que a galeria mudou. */
  onChanged: (bannerUrl: string | undefined) => void;
}) {
  const t = useT(dict);
  const [shots, setShots] = useState<Screenshot[] | null>(null);
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getGameScreenshots(gameId)
      .then((res) => {
        setShots(res.screenshots);
        setCurrent(res.banner_name);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : t("readError")),
      );
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function choose(name: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.setGameBanner(gameId, name);
      setCurrent(name);
      onChanged(res.banner_url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    setBusy(true);
    setError(null);
    try {
      const res = await pickAndAddScreenshots(gameId, t("imageFilter"), false);
      if (!res) return;
      const [first] = res.added;
      setShots((prev) => [...res.added, ...(prev ?? [])]);
      if (first) {
        const banner = await api.setGameBanner(gameId, first.name);
        setCurrent(first.name);
        onChanged(banner.banner_url);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-3 rounded-lg border border-line bg-fill p-5 ring-0 sm:max-w-3xl">
        <DialogTitle className="text-lg font-semibold text-ink">
          {t("bannerTitle")}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted">
          {t("bannerHelp")}
        </DialogDescription>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {shots === null ? (
            !error && <p className="text-sm text-muted">{t("loading")}</p>
          ) : shots.length === 0 ? (
            <p className="text-sm text-muted">{t("bannerEmpty")}</p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2 p-1">
              {shots.map((s) => {
                const selected = s.name === current;
                return (
                  <li key={s.name}>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={selected}
                      onClick={() => void choose(s.name)}
                      title={s.name}
                      className={`relative block aspect-video w-full overflow-hidden rounded-md border-2 bg-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                        selected
                          ? "border-accent"
                          : "border-line hover:border-line-strong"
                      }`}
                    >
                      <img
                        src={coverImageURL(s.url)}
                        alt={s.name}
                        loading="lazy"
                        className="h-full w-full object-cover [image-rendering:pixelated]"
                      />
                      {selected && (
                        <span className="absolute top-1 left-1 rounded-sm bg-paper/85 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-ink uppercase">
                          {t("isBanner")}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && <InlineError>{error}</InlineError>}

        {/* Sem botão "Fechar" próprio: o X do Dialog já fecha, e a escolha
            vale no clique — não há nada para confirmar. */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="chrome"
            disabled={busy}
            onClick={() => void upload()}
          >
            {busy ? t("adding") : t("uploadBanner")}
          </Button>
          {current && (
            <Button
              variant="chrome"
              disabled={busy}
              onClick={() => void choose("")}
            >
              {t("useCover")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
