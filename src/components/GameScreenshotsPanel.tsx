import { useEffect, useRef, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { api, ApiError, coverImageURL } from "../api";
import type { GameScreenshotsResponse } from "../api/types";
import { SESSION_ENDED_EVENT } from "../hooks/useSessionWatcher";
import { useToast } from "../hooks/useToast";
import { useT } from "../i18n/i18n";
import { formatFileDate } from "../lib/format";
import { pickAndAddScreenshots } from "../lib/pickScreenshots";
import { ScreenshotLightbox } from "./ScreenshotLightbox";
import { dict } from "./Screenshots.i18n";
import { Button, Card, ConfirmModal, InlineError, Toast } from "./ui";

/**
 * Galeria de prints de um jogo (2026-10-06). Os arquivos chegam movidos
 * pelo zeuxd ao fim de cada sessão (emulator/screenshots.go); aqui a pessoa
 * vê, apaga e escolhe um para ser o fundo do topo da tela (`onBannerChange`).
 *
 * Visualizador no topo, miniaturas embaixo (pedido do Douglas: "o print mais
 * atual tem que aparecer grande, como o visualizador de imagens"). O grande
 * abre no último print tirado; clicar nele abre em tela cheia.
 */
export function GameScreenshotsPanel({
  gameId,
  gameTitle,
  onBannerChange,
  version = 0,
}: {
  gameId: number;
  gameTitle: string;
  onBannerChange: (bannerUrl: string | undefined) => void;
  /** Sobe quando outra parte da tela (o modal de banner) mexeu na galeria. */
  version?: number;
}) {
  const t = useT(dict);
  const [data, setData] = useState<GameScreenshotsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toastMessage, showToast } = useToast();
  // Nome do print mais novo da última leitura: quando muda, chegou print
  // novo, e o visualizador pula para ele.
  const newestRef = useRef<string | undefined>(undefined);
  const thumbsRef = useRef<HTMLUListElement>(null);

  function load() {
    api
      .getGameScreenshots(gameId)
      .then((res) => {
        const newest = res.screenshots[0]?.name;
        if (newest !== newestRef.current) setSelected(0);
        else setSelected((i) => Math.min(i, Math.max(0, res.screenshots.length - 1)));
        newestRef.current = newest;
        setData(res);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("readError")));
  }
  useEffect(load, [gameId, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Releitura sozinha: os prints chegam quando o jogo fecha, com esta tela
  // já aberta — antes era preciso sair e voltar para vê-los. O fim da sessão
  // vem do poll do shell (useSessionWatcher); o foco da janela cobre o print
  // posto na pasta por fora do ZeuX.
  useEffect(() => {
    const reload = () => load();
    window.addEventListener(SESSION_ENDED_EVENT, reload);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener(SESSION_ENDED_EVENT, reload);
      window.removeEventListener("focus", reload);
    };
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A miniatura escolhida fica à vista na faixa, mesmo andando pelas setas —
  // e também quando chega print novo: ele entra no começo da faixa, e sem
  // isto a faixa continuava rolada mostrando os antigos.
  const newestName = data?.screenshots[0]?.name;
  useEffect(() => {
    const strip = thumbsRef.current;
    const item = strip?.children[selected] as HTMLElement | undefined;
    if (!strip || !item) return;
    if (item.offsetLeft < strip.scrollLeft || item.offsetLeft + item.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: item.offsetLeft, behavior: "smooth" });
    }
  }, [selected, newestName]);

  if (error && !data) return <InlineError>{error}</InlineError>;
  if (!data) return <p className="text-sm text-muted">{t("loading")}</p>;
  const shots = data.screenshots;
  const current = shots[selected];
  const count = shots.length;
  const go = (delta: number) => setSelected((i) => (i + delta + count) % count);

  async function addShots() {
    setBusy(true);
    setError(null);
    try {
      const res = await pickAndAddScreenshots(gameId, t("imageFilter"), true);
      if (!res) return;
      load();
      showToast(
        res.errors.length > 0
          ? t("addedWithErrors", { n: res.added.length, failed: res.errors.length, reason: res.errors[0].message })
          : t("added", { n: res.added.length }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

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
      newestRef.current = rest[0]?.name;
      setSelected((i) => Math.min(i, Math.max(0, rest.length - 1)));
      if (rest.length === 0) setFullscreen(false);
      showToast(t("deleted"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const arrow =
    "absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper/80 text-ink opacity-80 transition hover:border-line-strong hover:bg-paper hover:opacity-100";
  const actions = current && (
    <>
      <Button variant="chrome" size="sm" disabled={busy} onClick={() => setConfirmDelete(current.name)}>
        {t("delete")}
      </Button>
      <Button variant="primary" size="sm" disabled={busy} onClick={() => void toggleBanner(current.name)}>
        {data.banner_name === current.name ? t("removeBanner") : t("useAsBanner")}
      </Button>
    </>
  );

  return (
    <Card filled className="flex flex-col gap-3">
      {toastMessage && <Toast message={toastMessage} />}

      {!current ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <>
          {/* Visualizador. `aspect-video` com teto de altura: a imagem cresce
              com a coluna sem empurrar o resto da tela para fora da janela
              baixa. */}
          <div className="relative flex aspect-video max-h-[70vh] w-full items-center justify-center overflow-hidden rounded-md border border-line bg-black">
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              title={t("fullscreen")}
              className="group flex h-full w-full items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              {/* `pixelated`: print de console antigo é pixel art em
                  resolução baixa; o filtro suave borraria o que a pessoa quis
                  guardar. */}
              <img
                src={coverImageURL(current.url)}
                alt={current.name}
                className="h-full w-full object-contain [image-rendering:pixelated]"
              />
              <Maximize2
                aria-hidden="true"
                className="absolute right-3 bottom-3 size-5 text-ink opacity-0 drop-shadow transition-opacity group-hover:opacity-90"
              />
            </button>
            {count > 1 && (
              <>
                <button type="button" aria-label={t("previous")} className={`${arrow} left-2`} onClick={() => go(-1)}>
                  <ChevronLeft className="size-5" />
                </button>
                <button type="button" aria-label={t("next")} className={`${arrow} right-2`} onClick={() => go(1)}>
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
            {selected === 0 && (
              <span className="absolute top-2 left-2 rounded-sm bg-paper/85 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-ink uppercase">
                {t("latest")}
              </span>
            )}
            {data.banner_name === current.name && (
              <span className="absolute top-2 right-2 rounded-sm bg-paper/85 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-ink uppercase">
                {t("isBanner")}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs text-muted">
              {formatFileDate(current.taken_at)} · {t("position", { i: selected + 1, n: count })}
            </span>
            <div className="flex flex-wrap gap-2">{actions}</div>
          </div>

          {/* Miniaturas numa faixa que rola na horizontal: com muitos prints
              uma grade empurraria o resto da tela para baixo. */}
          {count > 1 && (
            <ul ref={thumbsRef} className="relative flex snap-x gap-2 overflow-x-auto pb-1 [overflow-anchor:none]">
              {shots.map((s, i) => (
                <li key={s.name} className="w-32 shrink-0 snap-start">
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    title={s.name}
                    aria-pressed={i === selected}
                    className={`relative block aspect-video w-full overflow-hidden rounded-md border-2 bg-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      i === selected ? "border-accent" : "border-line opacity-70 hover:border-line-strong hover:opacity-100"
                    }`}
                  >
                    <img
                      src={coverImageURL(s.url)}
                      alt={s.name}
                      loading="lazy"
                      className="h-full w-full object-cover [image-rendering:pixelated]"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {error && <InlineError>{error}</InlineError>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        {count > 0 ? <span className="font-mono text-xs text-muted">{t("count", { n: count })}</span> : <span />}
        <div className="flex flex-wrap gap-2">
          {count > 0 && (
            <Button variant="chrome" size="sm" onClick={() => void openPath(data.folder).catch(() => {})}>
              {t("openFolder")}
            </Button>
          )}
          <Button variant="chrome" size="sm" disabled={busy} onClick={() => void addShots()}>
            {busy ? t("adding") : t("addShots")}
          </Button>
        </div>
      </div>

      {fullscreen && current && (
        <ScreenshotLightbox
          shots={shots}
          index={selected}
          onIndexChange={setSelected}
          onClose={() => setFullscreen(false)}
          title={gameTitle}
          actions={actions}
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
