import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../i18n/i18n";
import { dict } from "./WindowFrame.i18n";

/**
 * A moldura da janela: a barra de título própria do ZeuX e a área de conteúdo
 * embaixo dela (2026-09-28, pergunta do Douglas: "por que o header, onde
 * maximizo/fecho/minimizo, não está estilizado também?").
 *
 * A barra que existia era a do sistema operacional — o app só controla o que
 * está abaixo dela, então nenhum dos redesenhos retrôs chegava lá. Aqui ela
 * passa a ser desenhada pelo ZeuX, com a mesma fonte pixel da marca e ícones
 * de pixel (`PixelGlyph`) no lugar dos símbolos do sistema.
 *
 * **Três modos, decididos pela plataforma e pela janela de verdade:**
 * - `custom` (Windows e Linux): a janela nasce sem moldura
 *   (`decorations: false`, em `tauri.windows.conf.json`/`tauri.linux.conf.json`)
 *   e esta barra traz os três botões.
 * - `overlay` (macOS): o sistema mantém os botões coloridos dele por cima da
 *   barra (`titleBarStyle: "Overlay"`, em `tauri.macos.conf.json`) — desenhar
 *   botões novos ali quebraria o atalho de tela cheia e o menu da janela. A
 *   barra só reserva o espaço deles e serve de alça de arrasto.
 * - `none`: navegador (dev/testes) ou uma janela que **ainda tem** a moldura do
 *   sistema. Sem barra, para nunca aparecerem duas.
 * O modo `custom` só liga depois de `isDecorated()` responder `false` — se a
 * configuração por plataforma não pegou, o app fica com a barra nativa em vez
 * de sem nenhuma.
 *
 * O conteúdo mora em um contêiner rolável de altura definida, e não mais no
 * documento: as telas que eram `h-screen` viraram `h-full`, porque a barra
 * ocupa parte da janela e `100vh` passaria dela.
 */

type Mode = "none" | "overlay" | "custom";

// A API não exporta o tipo da direção; deriva-se do próprio método.
type ResizeDirection = Parameters<ReturnType<typeof getCurrentWindow>["startResizeDragging"]>[0];

// User agent, e não `@tauri-apps/plugin-os`: é a única informação que falta e
// não vale uma dependência (nem um plugin do lado Rust) só para ela.
const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
const IS_MAC = /Macintosh|Mac OS X/.test(ua);
const IS_LINUX = /Linux/.test(ua) && !/Android/.test(ua);

function useWindowChrome(): { mode: Mode; maximized: boolean } {
  const [mode, setMode] = useState<Mode>("none");
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    const win = getCurrentWindow();

    if (IS_MAC) {
      setMode("overlay");
    } else {
      win
        .isDecorated()
        .then((decorated) => alive && setMode(decorated ? "none" : "custom"))
        .catch(() => {});
    }

    const sync = () =>
      win
        .isMaximized()
        .then((value) => alive && setMaximized(value))
        .catch(() => {});
    sync();
    const unlisten = win.onResized(sync);

    return () => {
      alive = false;
      unlisten.then((off) => off()).catch(() => {});
    };
  }, []);

  return { mode, maximized };
}

export function WindowFrame({ children }: { children: ReactNode }) {
  const { mode, maximized } = useWindowChrome();

  return (
    <div className="flex h-screen flex-col">
      {mode !== "none" && <TitleBar mode={mode} maximized={maximized} />}
      {mode === "custom" && IS_LINUX && <ResizeEdges />}
      {/* `min-h-0` deixa o contêiner encolher abaixo do conteúdo (senão o flex
          o esticaria até a altura da tela mais alta); `overflow-y-auto` faz as
          telas que rolam o documento rolarem aqui dentro. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function TitleBar({ mode, maximized }: { mode: Exclude<Mode, "none">; maximized: boolean }) {
  const t = useT(dict);

  return (
    // `z-[60]`: acima de modais e do tour (`z-50`), para os botões continuarem
    // ao alcance com um diálogo aberto. `data-tauri-drag-region` só vale no
    // elemento em que está — por isso a marca e o título abaixo são
    // `pointer-events-none`, para o clique cair aqui em vez de num filho.
    <div
      data-tauri-drag-region
      className="relative z-[60] flex h-8 shrink-0 items-center justify-between border-b border-line bg-panel select-none"
    >
      {/* Mesma textura de tubo das outras superfícies, bem apagada. */}
      <div aria-hidden="true" className="zeux-scanlines pointer-events-none absolute inset-0 opacity-25" />

      {/* No macOS o sistema põe os três botões coloridos nos ~70px da
          esquerda; a marca começa depois deles. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none relative font-pixel text-[10px] leading-none tracking-[0.2em] text-muted ${
          mode === "overlay" ? "pl-20" : "pl-3"
        }`}
      >
        ZEUX
      </span>

      {mode === "custom" && (
        <div role="group" aria-label={t("controls")} className="relative flex h-full">
          <ControlButton label={t("minimize")} glyph="minimize" onClick={() => void getCurrentWindow().minimize()} />
          <ControlButton
            label={maximized ? t("restore") : t("maximize")}
            glyph={maximized ? "restore" : "maximize"}
            onClick={() => void getCurrentWindow().toggleMaximize()}
          />
          <ControlButton label={t("close")} glyph="close" danger onClick={() => void getCurrentWindow().close()} />
        </div>
      )}
    </div>
  );
}

function ControlButton({
  label,
  glyph,
  danger = false,
  onClick,
}: {
  label: string;
  glyph: Glyph;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    // `tabIndex={-1}`: é chrome de mouse, como os botões do sistema — não entra
    // na ordem de Tab (senão seriam a primeira parada de cada tela). O controle
    // de jogo também os ignora (ver FOCUSABLE_SELECTOR em useGamepadNavigation).
    <button
      type="button"
      tabIndex={-1}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-full w-11 items-center justify-center border-l border-line text-muted transition-colors ${
        danger ? "hover:bg-danger-strong hover:text-white" : "hover:bg-fill hover:text-ink"
      }`}
    >
      <PixelGlyph glyph={glyph} />
    </button>
  );
}

type Glyph = "minimize" | "maximize" | "restore" | "close";

// Grade de 6×6 desenhada a 12px: cada "pixel" mede 2px inteiros, então nenhuma
// aresta cai em meio pixel (`crispEdges` sozinho não basta com escala
// fracionária). Cada retângulo é [x, y, largura, altura] na grade.
const GLYPHS: Record<Glyph, [number, number, number, number][]> = {
  minimize: [[0, 4, 6, 1]],
  maximize: [
    [0, 0, 6, 1],
    [0, 5, 6, 1],
    [0, 0, 1, 6],
    [5, 0, 1, 6],
  ],
  restore: [
    // quadrado da frente
    [0, 2, 4, 1],
    [0, 5, 4, 1],
    [0, 2, 1, 4],
    [3, 2, 1, 4],
    // o de trás, só o que aparece
    [2, 0, 4, 1],
    [5, 0, 1, 4],
    [2, 0, 1, 2],
  ],
  close: [0, 1, 2, 3, 4, 5].flatMap((i): [number, number, number, number][] => [
    [i, i, 1, 1],
    [5 - i, i, 1, 1],
  ]),
};

function PixelGlyph({ glyph }: { glyph: Glyph }) {
  return (
    <svg width="12" height="12" viewBox="0 0 6 6" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      {GLYPHS[glyph].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} />
      ))}
    </svg>
  );
}

/**
 * Bordas de redimensionar para o Linux. Uma janela sem moldura no GTK não tem
 * nenhuma — sem isto ela ficaria com tamanho fixo. No Windows o próprio
 * sistema resolve a borda de janela sem moldura, então lá não se desenha nada
 * (as faixas invisíveis também cobririam a ponta da barra de rolagem).
 */
function ResizeEdges() {
  const edges: { dir: ResizeDirection; className: string }[] = [
    { dir: "North", className: "inset-x-2 top-0 h-1 cursor-n-resize" },
    { dir: "South", className: "inset-x-2 bottom-0 h-1 cursor-s-resize" },
    { dir: "West", className: "inset-y-2 left-0 w-1 cursor-w-resize" },
    { dir: "East", className: "inset-y-2 right-0 w-1 cursor-e-resize" },
    { dir: "NorthWest", className: "top-0 left-0 size-2 cursor-nw-resize" },
    { dir: "NorthEast", className: "top-0 right-0 size-2 cursor-ne-resize" },
    { dir: "SouthWest", className: "bottom-0 left-0 size-2 cursor-sw-resize" },
    { dir: "SouthEast", className: "right-0 bottom-0 size-2 cursor-se-resize" },
  ];

  return (
    <>
      {edges.map(({ dir, className }) => (
        <div
          key={dir}
          aria-hidden="true"
          className={`fixed z-[70] ${className}`}
          onMouseDown={(e) => {
            if (e.button === 0) void getCurrentWindow().startResizeDragging(dir);
          }}
        />
      ))}
    </>
  );
}
