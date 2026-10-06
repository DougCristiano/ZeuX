import { useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { coverImageURL } from "../api";
import type { Screenshot } from "../api/types";
import { useT } from "../i18n/i18n";
import { formatFileDate } from "../lib/format";
import { dict } from "./Screenshots.i18n";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

/**
 * Visualizador de um print em tamanho grande, com setas (botão e teclado)
 * para passar pela lista. As ações variam por tela — na do jogo é
 * banner/apagar, na inicial é "abrir o jogo" — e chegam por `actions`.
 */
export function ScreenshotLightbox({
  shots,
  index,
  onIndexChange,
  onClose,
  title,
  actions,
}: {
  shots: Screenshot[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  title: string;
  actions?: ReactNode;
}) {
  const t = useT(dict);
  const shot = shots[index];
  const count = shots.length;

  // Setas do teclado: num visualizador de imagens é o primeiro gesto que a
  // pessoa tenta, e o Dialog do Radix já cuida do Esc.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && count > 1) onIndexChange((index - 1 + count) % count);
      if (e.key === "ArrowRight" && count > 1) onIndexChange((index + 1) % count);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, onIndexChange]);

  if (!shot) return null;
  const arrow =
    "absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper/80 text-ink transition-colors hover:border-line-strong hover:bg-paper";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-3 rounded-lg border border-line bg-fill p-4 ring-0 sm:max-w-[min(92vw,80rem)]">
        <DialogTitle className="pr-8 text-base font-semibold text-ink">{title}</DialogTitle>
        <DialogDescription className="-mt-2 font-mono text-xs text-muted">
          {formatFileDate(shot.taken_at)} · {t("position", { i: index + 1, n: count })}
        </DialogDescription>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-black">
          {/* `image-rendering: pixelated`: print de console antigo é pixel
              art em resolução baixa; o filtro suave padrão do navegador
              borra exatamente o que a pessoa quis guardar. */}
          <img
            src={coverImageURL(shot.url)}
            alt={shot.name}
            className="h-[70vh] w-full object-contain [image-rendering:pixelated]"
          />
          {count > 1 && (
            <>
              <button type="button" aria-label={t("previous")} className={`${arrow} left-2`} onClick={() => onIndexChange((index - 1 + count) % count)}>
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" aria-label={t("next")} className={`${arrow} right-2`} onClick={() => onIndexChange((index + 1) % count)}>
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </div>
        {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
      </DialogContent>
    </Dialog>
  );
}
