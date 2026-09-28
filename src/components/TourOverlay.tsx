import { useEffect, useState } from "react";
import { AmbientGlow, Button } from "./ui";
import { TourArt, type TourArtKind } from "./TourArt";
import { useT } from "../i18n/i18n";
import { dict } from "./TourOverlay.i18n";

/**
 * Tour de primeira execução (O1, docs/pendencias.md).
 *
 * **Sobreposição, não uma `Phase`** — mesma decisão do `SplashScreen` e pelo
 * mesmo motivo: uma fase nova entraria no `switch` de `App.tsx` e somaria
 * tempo ao boot de quem só quer abrir o jogo de sempre. Aqui o tour só
 * *cobre* a tela; a máquina de fases já terminou (o tour aparece depois do
 * scan) e `all-games` está montada por baixo.
 *
 * A marca de "já vi" mora no `localStorage` (mesmo critério do splash e de
 * `zeux.allGames.sort`): é preferência de tela deste computador, não dado que
 * precise viajar pelo servidor. Reabre por Configurações → "Rever
 * apresentação" em qualquer execução; **não** reaparece por biblioteca vazia
 * (quem esvaziou a biblioteca já conhece o app).
 *
 * As ilustrações são pixel art gerada por código (`TourArt.tsx`, desde
 * 2026-09-28 — antes eram SVG de traço liso, que destoava do resto do app),
 * **sem texto embutido** — a legenda vem do i18n. Print real envelhece a cada
 * redesenho (o visual mudou duas vezes em três dias) e precisaria de um jogo
 * de imagens por idioma.
 */

const STORAGE_KEY = "zeux.tour-seen";

/** Já viu o tour neste computador? Falha de `localStorage` responde "não
 *  viu" — mostrar o tour de novo é o erro barato. */
export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Sem persistência o tour roda de novo na próxima abertura — o app
    // continua funcionando igual, não é motivo para quebrar nada.
  }
}

const STEPS: { art: TourArtKind; kicker: keyof typeof dict; title: keyof typeof dict; body: keyof typeof dict }[] = [
  { art: "autoconfig", kicker: "s1Kicker", title: "s1Title", body: "s1Body" },
  { art: "verdict", kicker: "s2Kicker", title: "s2Title", body: "s2Body" },
  { art: "library", kicker: "s3Kicker", title: "s3Title", body: "s3Body" },
  { art: "social", kicker: "s4Kicker", title: "s4Title", body: "s4Body" },
];

export function TourOverlay({ onClose }: { onClose: () => void }) {
  const t = useT(dict);
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  function finish() {
    markTourSeen();
    onClose();
  }

  function next() {
    if (isLast) finish();
    else setStep((s) => s + 1);
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-paper px-6">
      <AmbientGlow opacity={16} />

      <h2 className="sr-only">{t("srHeading")}</h2>

      {/* Saída sempre visível, em toda tela. `autoFocus` não vai aqui — o
          botão "Próximo" abaixo é o alvo do botão A do controle. `quiet`: é o
          terciário do app (só texto), com a mesma voz mono dos outros dois
          botões do tour — antes era um `<button>` avulso em sans. */}
      <Button type="button" variant="quiet" size="sm" onClick={finish} className="absolute top-6 right-6">
        {t("skip")}
      </Button>

      {/* `max-w-[480px]`: teto, não largura — é a medida em que a grade de
          80×50 da arte cai em 6px inteiros por célula (ver TourArt.tsx). */}
      <div className="relative flex w-full max-w-[480px] flex-col items-center gap-5">
        {/* Moldura de tubo: a ilustração troca a cada passo; a coreografia de
            fade usa o keyframe autoral já existente (`zeux-boot-letter`), que
            o bloco global de `prefers-reduced-motion` do index.css zera.
            Contorno por `ring` (sombra), não `border`: a borda comeria 2px da
            largura e a escala da arte deixaria de ser inteira. Canto reto,
            como os botões e chips — pixel art em moldura arredondada lia como
            imagem colada. */}
        <div
          key={step}
          className="relative w-full overflow-hidden rounded-sm bg-fill ring-1 ring-line-strong"
          style={{ animation: "zeux-boot-letter 320ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
        >
          <TourArt art={current.art} />
          <div aria-hidden="true" className="zeux-scanlines pointer-events-none absolute inset-0 opacity-40" />
        </div>

        <div key={`text-${step}`} className="flex flex-col items-center gap-3 text-center">
          <p className="font-mono text-xs tracking-[0.2em] text-accent-secondary uppercase">{t(current.kicker)}</p>
          {/* Título na fonte pixel, como o `<h1>` de toda tela do app
              (`ScreenHeader`). 16px, não os 22px de lá: aqui a frase é longa
              e quebraria em três linhas; a 16px a Press Start 2P ainda lê
              bem, e `leading-relaxed` dá a folga que a altura-x dela pede. */}
          <p className="font-pixel text-base leading-relaxed tracking-[0.02em] text-balance text-ink">{t(current.title)}</p>
          <p className="max-w-sm text-sm text-muted">{t(current.body)}</p>
        </div>

        {/* Marcadores de passo — decorativos; a contagem real vai no
            `aria-label` do grupo para o leitor de tela. Quadrados, não
            bolinhas: um pixel de 8px, o mesmo marcador do `SectionHeading`. */}
        <div className="flex items-center gap-2" role="group" aria-label={t("stepLabel", { current: step + 1, total: STEPS.length })}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="size-2 transition-colors"
              style={{ background: i === step ? "var(--accent)" : "var(--line-strong)" }}
            />
          ))}
        </div>

        {/* "Próximo" fixo no centro, "Voltar" à esquerda dele: com os dois
            num `flex` centralizado, o "Próximo" pulava de posição debaixo do
            cursor quando o "Voltar" aparecia no passo 2 — quem avança
            clicando sem olhar clicava no vazio. */}
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
          {step > 0 ? (
            <Button type="button" variant="chrome" onClick={back} className="justify-self-end">
              {t("back")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="primary" autoFocus onClick={next} {...{ "data-gamepad-start": "" }}>
            {isLast ? t("done") : t("next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
