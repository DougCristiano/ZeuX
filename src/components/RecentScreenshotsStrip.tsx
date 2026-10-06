import { useEffect, useState } from "react";
import { api, coverImageURL } from "../api";
import type { RecentScreenshot } from "../api/types";
import { useT } from "../i18n/i18n";
import { ScreenshotLightbox } from "./ScreenshotLightbox";
import { dict } from "./Screenshots.i18n";
import { Button, SectionHeading } from "./ui";

/**
 * Faixa "Últimos prints" da tela inicial (2026-10-06, pedido do Douglas: a
 * galeria também na página de destaque). Os prints mais novos de toda a
 * biblioteca; o clique abre o visualizador, e dele se vai ao jogo. Sem
 * nenhum print a faixa não aparece — um vazio aqui não ensinaria nada que a
 * tela do jogo já não ensine.
 */
export function RecentScreenshotsStrip({ onOpenGame }: { onOpenGame: (gameId: number) => void }) {
  const t = useT(dict);
  const [shots, setShots] = useState<RecentScreenshot[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    api
      .getRecentScreenshots(12)
      .then((res) => setShots(res.screenshots))
      .catch(() => setShots([]));
  }, []);

  if (shots.length === 0) return null;
  const current = open !== null ? shots[open] : undefined;

  return (
    <div className="mb-8">
      <SectionHeading className="mb-3">{t("recentHeading")}</SectionHeading>
      {/* Rolagem horizontal com largura de item em rem: a faixa acompanha a
          janela sem breakpoint, e o que não cabe fica a um gesto de
          distância em vez de quebrar em várias linhas. */}
      <ul className="flex snap-x gap-3 overflow-x-auto pb-2">
        {shots.map((s, i) => (
          <li key={`${s.game_id}/${s.name}`} className="w-60 shrink-0 snap-start">
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="block aspect-video overflow-hidden rounded-md border border-line bg-black transition-colors group-hover:border-line-strong">
                <img
                  src={coverImageURL(s.url)}
                  alt={s.name}
                  loading="lazy"
                  className="h-full w-full object-cover [image-rendering:pixelated] transition-transform group-hover:scale-105"
                />
              </span>
              <span className="mt-1.5 block truncate text-sm text-ink">{s.game_title}</span>
            </button>
          </li>
        ))}
      </ul>

      {current && open !== null && (
        <ScreenshotLightbox
          shots={shots}
          index={open}
          onIndexChange={setOpen}
          onClose={() => setOpen(null)}
          title={current.game_title}
          actions={
            <Button variant="primary" onClick={() => onOpenGame(current.game_id)}>
              {t("openGame")}
            </Button>
          }
        />
      )}
    </div>
  );
}
