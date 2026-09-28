import { useState } from "react";
import { consoleImageURL } from "../api";
import { consoleAccentColor } from "../lib/consoleColor";
import { consoleIconLabel } from "./ui";

/**
 * A logo de um console como etiqueta de cartucho — o jeito ÚNICO de mostrar
 * logo de console no app desde 2026-09-28. Até ali havia três: a etiqueta do
 * `ConsoleCard` (2026-09-26), uma caixa branca de 56px no `ConsoleHero` e
 * quadrados brancos na tela de Emuladores e na de pastas.
 *
 * Creme (`--cart-label`), não branco: numa tela escura, branco puro estoura;
 * e as logos do IGDB são desenhadas para fundo claro — metade delas é preta
 * sobre transparente e sumiria sobre `--fill`. `object-contain` porque as
 * logos vão de 1:1 a quase 9:1 (GBA), e `mix-blend-multiply` para que as que
 * vêm com fundo branco chapado (Fliperama, Mega Drive) se fundam no creme.
 * A faixa no topo carrega a cor de identidade do console.
 *
 * Sem imagem (3 consoles sem logo no IGDB, ou falha ao carregar), a sigla
 * impressa na própria etiqueta — por `consoleIconLabel`, nunca `slice(0, 4)`,
 * que ignoraria o mapa de exceções de sigla.
 *
 * Quem chama decide o tamanho (largura/altura ou posição absoluta) por
 * `className`; `size` só escolhe a espessura da faixa e o respiro interno.
 */
export function ConsoleLabel({
  consoleId,
  shortName,
  hasImage = true,
  imageVersion,
  size = "md",
  className = "",
}: {
  consoleId: string;
  shortName: string;
  /** O catálogo diz que este console tem logo (`ConsoleEntry.has_image`). */
  hasImage?: boolean;
  /** Cache-buster de logo trocada à mão (`ConsoleDetailScreen`). */
  imageVersion?: number;
  /** `sm` = miniatura de lista (32–64px), `md` = card, `lg` = cabeçalho. */
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = hasImage && !imageFailed;
  const accent = consoleAccentColor(consoleId);

  const stripe = size === "sm" ? "h-1" : size === "md" ? "h-1.5" : "h-2";
  const padding = size === "sm" ? "px-1 pt-1.5 pb-0.5" : size === "md" ? "px-2.5 pt-3.5 pb-2" : "px-2 pt-3 pb-1.5";

  // `relative` só quando quem chama não posiciona a etiqueta: `relative` e
  // `absolute` na mesma string são decididos pela ordem no CSS gerado, e o
  // `relative` vencia — a etiqueta do card saía do `inset` e crescia com a
  // imagem. Os dois servem de referência para a faixa `absolute` de dentro.
  const position = /\b(absolute|fixed)\b/.test(className) ? "" : "relative";

  return (
    <div
      aria-hidden="true"
      className={`${position} flex overflow-hidden rounded-sm bg-cart-label shadow-[0_2px_0_rgb(0_0_0/0.35)] ${padding} ${className}`}
    >
      <div className={`absolute inset-x-0 top-0 ${stripe}`} style={{ background: accent }} />
      {showImage ? (
        <img
          src={consoleImageURL(consoleId, imageVersion || undefined)}
          alt=""
          className="h-full min-h-0 w-full min-w-0 object-contain mix-blend-multiply"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span
          className={`m-auto font-pixel leading-none text-cart-label-ink ${size === "sm" ? "text-[8px]" : "text-[11px]"}`}
        >
          {consoleIconLabel(consoleId, shortName)}
        </span>
      )}
    </div>
  );
}
