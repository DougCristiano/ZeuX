import { useEffect, useRef, useState } from "react";
import { AmbientGlow, FOCUS_RING, ZeuXMark } from "./ui";
import { useT } from "../i18n/i18n";
import { dict } from "./SplashScreen.i18n";

/**
 * Abertura do ZeuX — "boot de console" (pedido do Douglas, 2026-09-07).
 *
 * Decidido com ele antes de escrever: **roda só na primeira vez que o app
 * abre**, nunca a cada sessão. Uma abertura que se repete todo dia deixa de
 * ser boas-vindas e vira pedágio — o produto inteiro é organizado em torno de
 * encurtar a distância entre abrir e jogar (PRODUCT.md). A marca de "já vi"
 * mora no `localStorage` porque é preferência de tela do próprio computador,
 * não dado que precise viajar pelo servidor (mesmo critério de
 * `zeux.allGames.sort`, em AllGamesScreen).
 *
 * A abertura **não atrasa a inicialização**: `App.tsx` mantém a máquina de
 * fases rodando por baixo (checagem de porta, conexão com o zeuxd,
 * consentimento) enquanto isto cobre a tela. Quando ela sai, o app já está no
 * estado em que estaria sem ela.
 *
 * Movimento: é o único momento autoral de animação do app. A sequência é
 * ligar a tela (varredura de CRT sobre a marca) → o wordmark assentar letra a
 * letra → a barra de carga completar. Tudo em `transform`/`opacity`/`filter`,
 * sem animar largura ou posição (nenhum reflow por quadro). Sob
 * `prefers-reduced-motion` o tempo cai para quase nada e as animações são
 * zeradas pelo bloco global de `index.css` — a marca aparece parada, o app
 * abre logo em seguida.
 */

const STORAGE_KEY = "zeux.splash-seen";

/** Duração total da sequência, em ms. Ver comentário de `PHASE_MS` abaixo. */
const FULL_DURATION_MS = 2300;
/** Sob movimento reduzido: tempo só de reconhecer a marca, sem coreografia. */
const REDUCED_DURATION_MS = 500;
/** Fade de saída — mais curto que a entrada, de propósito. */
const EXIT_MS = 320;

const WORDMARK = "ZEUX";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Já viu a abertura neste computador? Falha de `localStorage` (modo privado,
 * quota, WebView restrito) responde "não viu" — mostrar a abertura de novo é
 * o erro barato; escondê-la para sempre por causa de uma exceção, não.
 */
export function hasSeenSplash(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSplashSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Sem persistência, a abertura roda de novo na próxima vez — o app
    // continua funcionando igual, então não é motivo para quebrar nada.
  }
}

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const t = useT(dict);
  const reduced = prefersReducedMotion();
  const [leaving, setLeaving] = useState(false);
  // `onDone` só pode disparar uma vez: o temporizador e o "pular" competem
  // pelo mesmo fim, e um segundo disparo trocaria de fase duas vezes.
  const finished = useRef(false);

  function finish() {
    if (finished.current) return;
    finished.current = true;
    markSplashSeen();
    setLeaving(true);
    setTimeout(onDone, reduced ? 0 : EXIT_MS);
  }

  useEffect(() => {
    const timer = setTimeout(finish, reduced ? REDUCED_DURATION_MS : FULL_DURATION_MS);
    // Qualquer tecla pula — quem já conhece a abertura não deveria precisar
    // procurar o botão. O clique no botão "Pular" (abaixo) é o caminho
    // visível e o alvo do botão A do controle, que `useGamepadNavigation`
    // traduz em clique no elemento focado.
    function onKeyDown() {
      finish();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="relative flex h-screen flex-col items-center justify-center overflow-hidden bg-paper"
      style={
        leaving && !reduced
          ? { animation: `zeux-boot-out ${EXIT_MS}ms ease-in forwards` }
          : undefined
      }
    >
      <AmbientGlow opacity={18} />

      {/* A11y: a tela é puramente visual; este é o único texto que o leitor
          anuncia. `role="status"` em vez de `alert` — é progresso, não erro. */}
      <p className="sr-only" role="status">
        {t("bootingApp")}
      </p>

      <div className="relative flex flex-col items-center gap-6 px-6">
        <div className="relative">
          {/* `lockup`: a abertura é o único lugar grande o bastante para o
              wordmark "ZeuX" da arte ler — os usos pequenos passam a marca
              só-Zeus via `ZeuXMark` sem `lockup`. `image-rendering: pixelated`
              vem de dentro de `ZeuXMark`; a animação de "ligar a tela" vai no
              wrapper (transform/opacity/filter, sem reflow por quadro). */}
          <div
            style={{
              animation: reduced ? undefined : "zeux-boot-in 900ms cubic-bezier(0.16, 1, 0.3, 1) both",
            }}
          >
            <ZeuXMark lockup size={168} />
          </div>
          {/* Varredura de tubo: passa uma vez só sobre a marca. Decorativa,
              recortada pelo próprio contêiner (`overflow-hidden`). */}
          {!reduced && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <div
                className="h-1/3 w-full"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent, color-mix(in srgb, var(--accent-secondary) 55%, transparent), transparent)",
                  animation: "zeux-boot-sweep 1100ms cubic-bezier(0.4, 0, 0.2, 1) 120ms both",
                }}
              />
            </div>
          )}
          {/* Linhas de CRT por cima da marca — o mesmo material que o herói da
              biblioteca usa, para a abertura e o app falarem a mesma língua. */}
          <div aria-hidden="true" className="zeux-scanlines pointer-events-none absolute inset-0 opacity-60" />
        </div>

        {/* Wordmark: a fonte pixel em tamanho grande é o uso que ela sempre
            mereceu (CLAUDE.md restringe a pixel font a marca/rótulo curto e
            impõe piso de 11px — aqui ela está a 40px, bem acima). Letra a
            letra, com 45ms de atraso entre elas. */}
        <h1
          className="font-pixel text-[2rem] leading-none tracking-[0.18em] text-ink sm:text-[2.5rem]"
          aria-label="ZeuX"
        >
          {WORDMARK.split("").map((letter, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="inline-block"
              style={{
                animation: reduced
                  ? undefined
                  : `zeux-boot-letter 420ms cubic-bezier(0.16, 1, 0.3, 1) ${700 + i * 45}ms both`,
              }}
            >
              {letter}
            </span>
          ))}
        </h1>

        <p
          className="text-sm tracking-wide text-muted"
          style={{
            animation: reduced ? undefined : "zeux-boot-letter 500ms cubic-bezier(0.16, 1, 0.3, 1) 1000ms both",
          }}
        >
          {t("tagline")}
        </p>

        {/* Barra de carga: 2px, largura fixa, cresce por `scaleX` (nunca por
            `width`, que refluiria o layout a cada quadro). Decorativa — o
            progresso real de conexão com o zeuxd tem tela própria
            (`StatusScreen`), esta só marca o tempo da abertura. */}
        <div aria-hidden="true" className="h-0.5 w-40 overflow-hidden rounded-full bg-line">
          <div
            className="h-full w-full origin-left bg-accent"
            style={{
              boxShadow: "0 0 10px color-mix(in srgb, var(--accent) 70%, transparent)",
              animation: reduced
                ? undefined
                : `zeux-boot-bar ${FULL_DURATION_MS - 300}ms cubic-bezier(0.4, 0, 0.2, 1) 300ms both`,
            }}
          />
        </div>
      </div>

      {/* Saída explícita, sempre presente. `autoFocus` põe o foco aqui de
          cara: é o único controle da tela, então o botão A do controle e a
          barra de espaço já caem nele sem o usuário procurar nada. */}
      <button
        type="button"
        autoFocus
        onClick={finish}
        className={`absolute right-6 bottom-6 rounded-lg px-3 py-1.5 text-xs tracking-wide text-muted uppercase transition-colors hover:text-ink ${FOCUS_RING}`}
      >
        {t("skip")}
      </button>
    </div>
  );
}
