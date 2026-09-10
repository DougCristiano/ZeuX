import { useEffect, useState } from "react";
import { AmbientGlow, Button, FOCUS_RING } from "./ui";
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
 * As ilustrações são arte esquemática no vocabulário visual do app (janela
 * de emulador, medidor, pasta, nós da rede), **sem texto embutido** — a
 * legenda vem do i18n. Print real envelhece a cada redesenho (o visual mudou
 * duas vezes em três dias) e precisaria de um jogo de imagens por idioma.
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

type StepArt = "autoconfig" | "verdict" | "library" | "social";

const STEPS: { art: StepArt; kicker: keyof typeof dict; title: keyof typeof dict; body: keyof typeof dict }[] = [
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
          botão "Próximo" abaixo é o alvo do botão A do controle. */}
      <button
        type="button"
        onClick={finish}
        className={`absolute top-6 right-6 rounded-lg px-3 py-1.5 text-xs tracking-wide text-muted uppercase transition-colors hover:text-ink ${FOCUS_RING}`}
      >
        {t("skip")}
      </button>

      <div className="relative flex w-full max-w-md flex-col items-center gap-5">
        {/* Moldura de tubo: a ilustração troca a cada passo; a coreografia de
            fade usa o keyframe autoral já existente (`zeux-boot-letter`), que
            o bloco global de `prefers-reduced-motion` do index.css zera. */}
        <div
          key={step}
          className="relative w-full overflow-hidden rounded-lg border border-line-strong bg-fill"
          style={{ animation: "zeux-boot-letter 320ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
        >
          <StepArtwork art={current.art} />
          <div aria-hidden="true" className="zeux-scanlines pointer-events-none absolute inset-0 opacity-50" />
        </div>

        <div key={`text-${step}`} className="flex flex-col items-center gap-2 text-center">
          <p className="font-mono text-xs tracking-[0.2em] text-accent-secondary uppercase">{t(current.kicker)}</p>
          <p className="text-xl font-semibold text-ink">{t(current.title)}</p>
          <p className="max-w-sm text-sm text-muted">{t(current.body)}</p>
        </div>

        {/* Marcadores de passo — decorativos; a contagem real vai no
            `aria-label` do grupo para o leitor de tela. */}
        <div className="flex items-center gap-2" role="group" aria-label={t("stepLabel", { current: step + 1, total: STEPS.length })}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full transition-colors"
              style={{ background: i === step ? "var(--accent)" : "var(--line-strong)" }}
            />
          ))}
        </div>

        <div className="flex items-center gap-3">
          {step > 0 && (
            <Button type="button" variant="chrome" onClick={back}>
              {t("back")}
            </Button>
          )}
          <Button type="button" variant="primary" autoFocus onClick={next} {...{ "data-gamepad-start": "" }}>
            {isLast ? t("done") : t("next")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Ilustração esquemática por passo. Sem texto — todo rótulo é do i18n. Traços
 * finos, canto reto, paleta de tokens: o mesmo chassi/CRT do resto do app.
 * `viewBox` fixo, largura fluida.
 */
function StepArtwork({ art }: { art: StepArt }) {
  const common = {
    viewBox: "0 0 240 150",
    className: "block h-auto w-full",
    role: "img" as const,
    "aria-hidden": true,
  };
  const line = "var(--line-strong)";
  const ink = "var(--muted)";
  const accent = "var(--accent)";
  const cyan = "var(--accent-secondary)";

  if (art === "autoconfig") {
    return (
      <svg {...common}>
        {/* Chip que "lê o hardware" alimentando a janela do emulador */}
        <rect x="18" y="58" width="30" height="30" rx="2" fill="none" stroke={cyan} strokeWidth="1.5" />
        <path d="M24 58v-6M36 58v-6M24 88v6M36 88v6M18 66h-6M18 78h-6M48 66h6M48 78h6" stroke={cyan} strokeWidth="1.5" />
        <path d="M56 73h26m0 0-6-5m6 5-6 5" stroke={accent} strokeWidth="1.5" fill="none" />
        {/* Janela do emulador com barra de título e três "sliders" preenchidos */}
        <rect x="92" y="30" width="128" height="90" rx="3" fill="none" stroke={line} strokeWidth="1.5" />
        <path d="M92 44h128" stroke={line} strokeWidth="1.5" />
        <circle cx="100" cy="37" r="2" fill={ink} />
        <circle cx="108" cy="37" r="2" fill={ink} />
        <circle cx="116" cy="37" r="2" fill={ink} />
        <path d="M104 60h96M104 78h96M104 96h96" stroke={line} strokeWidth="4" strokeLinecap="round" />
        <path d="M104 60h60M104 78h34M104 96h78" stroke={accent} strokeWidth="4" strokeLinecap="round" />
        <circle cx="164" cy="60" r="4" fill="var(--paper)" stroke={accent} strokeWidth="1.5" />
        <circle cx="138" cy="78" r="4" fill="var(--paper)" stroke={accent} strokeWidth="1.5" />
        <circle cx="182" cy="96" r="4" fill="var(--paper)" stroke={accent} strokeWidth="1.5" />
      </svg>
    );
  }

  if (art === "verdict") {
    return (
      <svg {...common}>
        {/* Medidor segmentado; um segmento marcado por uma chave que aponta
            para o "componente que barra" (chip abaixo) */}
        <rect x="30" y="52" width="180" height="20" rx="2" fill="none" stroke={line} strokeWidth="1.5" />
        <rect x="32" y="54" width="52" height="16" fill={accent} opacity="0.9" />
        <rect x="86" y="54" width="52" height="16" fill={accent} opacity="0.5" />
        <path d="M84 54v16M138 54v16" stroke="var(--paper)" strokeWidth="1.5" />
        {/* Chave sob o segundo segmento */}
        <path d="M86 80v5h52v-5M112 85v8" stroke={cyan} strokeWidth="1.5" fill="none" />
        {/* Chip = o componente nomeado */}
        <rect x="96" y="100" width="32" height="24" rx="2" fill="none" stroke={cyan} strokeWidth="1.5" />
        <path d="M104 100v-5M120 100v-5M96 108h-5M96 116h-5M128 108h5M128 116h5" stroke={cyan} strokeWidth="1.5" />
        {/* Ponteiro de escala, sem números */}
        <path d="M30 44v-6M120 44v-6M210 44v-6" stroke={ink} strokeWidth="1.5" />
      </svg>
    );
  }

  if (art === "library") {
    return (
      <svg {...common}>
        {/* Pasta no disco → grade de capas. A pasta não se move: a seta é só
            de leitura. */}
        <path
          d="M20 50h26l8 10h44v58H20z"
          fill="none"
          stroke={line}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* "Discos" dentro da pasta */}
        <circle cx="45" cy="88" r="10" fill="none" stroke={ink} strokeWidth="1.5" />
        <circle cx="45" cy="88" r="2.5" fill={ink} />
        <circle cx="70" cy="94" r="10" fill="none" stroke={ink} strokeWidth="1.5" />
        <circle cx="70" cy="94" r="2.5" fill={ink} />
        <path d="M104 84h22m0 0-6-5m6 5-6 5" stroke={cyan} strokeWidth="1.5" fill="none" />
        {/* Grade de capas */}
        <rect x="138" y="40" width="24" height="32" rx="2" fill="none" stroke={accent} strokeWidth="1.5" />
        <rect x="170" y="40" width="24" height="32" rx="2" fill="none" stroke={line} strokeWidth="1.5" />
        <rect x="202" y="40" width="24" height="32" rx="2" fill="none" stroke={line} strokeWidth="1.5" />
        <rect x="138" y="82" width="24" height="32" rx="2" fill="none" stroke={line} strokeWidth="1.5" />
        <rect x="170" y="82" width="24" height="32" rx="2" fill="none" stroke={accent} strokeWidth="1.5" />
        <rect x="202" y="82" width="24" height="32" rx="2" fill="none" stroke={line} strokeWidth="1.5" />
      </svg>
    );
  }

  // social
  return (
    <svg {...common}>
      {/* Três nós ligados; ícones de save / controle / textura viajam pelos
          links. Um cartucho com traço: o jogo não circula. */}
      <path d="M60 40 120 75 60 110M180 40 120 75 180 110" stroke={line} strokeWidth="1.5" fill="none" />
      <circle cx="52" cy="35" r="10" fill="none" stroke={cyan} strokeWidth="1.5" />
      <circle cx="52" cy="115" r="10" fill="none" stroke={cyan} strokeWidth="1.5" />
      <circle cx="188" cy="35" r="10" fill="none" stroke={cyan} strokeWidth="1.5" />
      <circle cx="120" cy="75" r="12" fill="none" stroke={accent} strokeWidth="1.5" />
      {/* save (disquete) */}
      <rect x="84" y="49" width="12" height="12" rx="1" fill="none" stroke={accent} strokeWidth="1.5" />
      <path d="M87 49v4h6v-4" stroke={accent} strokeWidth="1.5" />
      {/* controle */}
      <rect x="84" y="89" width="14" height="9" rx="4.5" fill="none" stroke={accent} strokeWidth="1.5" />
      {/* textura (swatch) */}
      <rect x="146" y="49" width="12" height="12" fill="none" stroke={accent} strokeWidth="1.5" />
      <path d="M146 55h12M152 49v12" stroke={accent} strokeWidth="1" />
      {/* cartucho com traço = a ROM não circula */}
      <rect x="150" y="90" width="20" height="24" rx="2" fill="none" stroke={ink} strokeWidth="1.5" />
      <path d="M155 90v-4h10v4" stroke={ink} strokeWidth="1.5" />
      <circle cx="160" cy="102" r="15" fill="none" stroke="var(--danger)" strokeWidth="2" />
      <path d="M150 92 170 112" stroke="var(--danger)" strokeWidth="2" />
    </svg>
  );
}
