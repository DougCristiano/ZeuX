import { useState, type ReactNode } from "react";
import { consoleImageURL } from "../api";
import { consoleAccentColor } from "../lib/consoleColor";
import { ConsoleLabel } from "./ConsoleLabel";

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
 * A logo é a etiqueta de cartucho (`ConsoleLabel`) desde 2026-09-28 — a caixa
 * branca de 64px era um segundo desenho de logo de console, diferente do card
 * da grade de onde o usuário acabou de clicar. Mesma etiqueta nos dois lugares
 * = o olho reconhece o console na passagem de uma tela para a outra. O creme,
 * a faixa na cor do console e a queda para a sigla sem logo são dela.
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
  /** Flutua no canto da etiqueta da logo — hoje, o botão de trocar a logo. */
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
  // sigla acontece um quadro depois — imperceptível. Duas imagens podem
  // acusar a falha (a da etiqueta e a arte de fundo); qualquer uma basta para
  // `belowTitle` saber que não há logo no ar.
  const [imageFailed, setImageFailed] = useState(false);
  const accent = consoleAccentColor(consoleId);
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
          {/* Retangular (7:4), não quadrada como a caixa antiga: a maioria das
              logos é larga (PS2, Mega Drive, GBA chega a quase 9:1), e num
              quadrado de 64px elas viravam uma faixa fina no meio. A altura
              acompanha as duas linhas de título + metadados ao lado. */}
          <ConsoleLabel
            consoleId={consoleId}
            shortName={shortName}
            hasImage={hasImage}
            imageVersion={imageVersion}
            size="lg"
            className="h-16 w-28"
            onImageError={() => setImageFailed(true)}
          />
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
