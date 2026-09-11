import { useState, type ReactNode } from "react";
import { consoleImageURL } from "../api";
import { consoleAccentColor, consoleTextColor } from "../lib/consoleColor";
import { consoleIconLabel } from "./ui";

/**
 * Cabeçalho das duas telas que pertencem a UM console: `ConsoleDetailScreen`
 * e `GamesScreen`. O bloco existia desenhado desde 2026-09-07, mas copiado nos
 * dois arquivos — mesma borda esquerda de 3px na cor de identidade, mesma logo
 * gigante e desfocada como arte de fundo, mesmo gradiente radial, mesma caixa
 * de 64px com fundo branco — e as cópias já tinham começado a divergir (uma
 * com `mt-3`, a outra sem; uma com o botão de trocar a logo, a outra com a
 * contagem de jogos). Extraído em 2026-09-11: o que varia entre as telas entra
 * por prop, o desenho é um só.
 *
 * Por que o fundo branco atrás da logo: as imagens do IGDB foram desenhadas
 * para selo em fundo claro (mesma razão já registrada em `ConsolesScreen`).
 * Nos 3 consoles sem imagem cadastrada, o `onError` do `<img>` derruba para a
 * sigla em `font-pixel` — por `consoleIconLabel`, nunca `slice(0, 4)` à mão,
 * que ignoraria o mapa de exceções.
 *
 * O título vem em `font-pixel` (voz de marca da direção retrô, CLAUDE.md) um
 * degrau ABAIXO do `ScreenHeader` de listagem: aqui ele divide espaço com a
 * logo e com a arte de fundo, e no tamanho de topo de tela brigaria com as
 * duas. Não usa `ScreenHeader` direto justamente por isso — o hero é outra
 * coisa, não um cabeçalho genérico com outra fonte.
 */
export function ConsoleHero({
  consoleId,
  name,
  shortName,
  imageVersion,
  hasImage = true,
  meta,
  logoOverlay,
  belowTitle,
  footer,
  className = "mb-6",
}: {
  consoleId: string;
  name: string;
  shortName: string;
  /** Cache-buster de logo trocada à mão (só `ConsoleDetailScreen` tem isso). */
  imageVersion?: number;
  /**
   * O catálogo diz que este console tem logo (`ConsoleEntry.has_image`).
   * `GamesScreen` não recebe o catálogo e omite — aí a única checagem é o
   * `onError` do <img>, que já cobre o mesmo caso um quadro depois.
   */
  hasImage?: boolean;
  /** Linha de dados sob o título: ano/sigla, ou sigla + contagem de jogos. */
  meta: ReactNode;
  /** Flutua no canto da caixa de 64px — hoje, o botão de trocar a logo. */
  logoOverlay?: ReactNode;
  /**
   * Conteúdo extra abaixo da linha de metadados (ex.: "restaurar padrão").
   * Recebe se há logo no ar: "restaurar padrão" sem nada para restaurar seria
   * uma ação sem efeito visível.
   */
  belowTitle?: (showImage: boolean) => ReactNode;
  /** Conteúdo no rodapé do hero, fora da linha da logo (ex.: erro de imagem). */
  footer?: ReactNode;
  className?: string;
}) {
  // A logo oficial não existe para os 3 consoles sem imagem cadastrada no
  // IGDB. A checagem é o próprio `onError` do <img>, e não um `has_image` do
  // catálogo: as duas telas nem sempre têm esse campo à mão, e a queda para a
  // sigla acontece um quadro depois — imperceptível.
  const [imageFailed, setImageFailed] = useState(false);
  const accent = consoleAccentColor(consoleId);
  // A sigla é TEXTO sobre `--fill` quando não há logo: variante clara da mesma
  // matiz (≥4.5:1, WCAG 1.4.3 — ver `consoleTextColor`). A borda e o gradiente
  // seguem com o `accent` puro, que é decoração.
  const labelColor = consoleTextColor(consoleId);
  const showImage = hasImage && !imageFailed;
  const src = consoleImageURL(consoleId, imageVersion || undefined);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-line p-5 ${className}`}
      // Borda esquerda de 3px na cor de identidade — o mesmo tratamento que
      // `ConsoleVerdictCard` e `EmulatorCard` dão a uma linha de lista,
      // aplicado à tela que é DESTE console.
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      {/* A própria logo, gigante e desfocada, como arte de fundo — mesmo
          recurso que `GameHero` usa com a capa do jogo (`blur-3xl`, nunca um
          desfoque sutil). Sem ela, o cabeçalho seria um gradiente e nada
          mais. */}
      {showImage && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -left-10 h-72 w-72 object-contain opacity-40 blur-3xl saturate-[1.8]"
          onError={() => setImageFailed(true)}
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(65% 90% at 12% 25%, color-mix(in srgb, ${accent} 22%, transparent), transparent 70%)`,
        }}
      />
      <div className="relative flex items-center gap-4">
        <div className="relative shrink-0">
          <span
            aria-hidden="true"
            style={{
              borderColor: `${accent}66`,
              color: labelColor,
              backgroundColor: showImage ? "#fff" : undefined,
            }}
            className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border bg-fill font-pixel text-[11px] leading-none"
          >
            {showImage ? (
              <img src={src} alt="" className="h-14 w-14 object-contain p-0.5" onError={() => setImageFailed(true)} />
            ) : (
              consoleIconLabel(consoleId, shortName)
            )}
          </span>
          {/* Só aparece quando há logo de verdade para trocar/restaurar — a
              tela que passa o overlay decide isso, aqui só reservamos o
              canto. */}
          {logoOverlay}
        </div>
        <div>
          <h1 className="font-pixel text-lg leading-relaxed tracking-[0.04em] text-ink">{name}</h1>
          {/* `font-mono`: ano, sigla e contagem são dado de catálogo, não
              prosa — o mesmo tratamento que o ano recebe no tile da grade. */}
          <p className="mt-1 font-mono text-sm tracking-wide text-muted">{meta}</p>
          {belowTitle?.(showImage)}
        </div>
      </div>
      {footer}
    </div>
  );
}
