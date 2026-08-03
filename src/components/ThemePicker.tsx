import { useEffect, useState } from "react";
import { FOCUS_RING } from "./ui";

export const THEMES = ["fosforo", "cartucho", "sala"] as const;
export type Theme = (typeof THEMES)[number];

const THEME_LABEL: Record<Theme, string> = {
  fosforo: "Fósforo",
  cartucho: "Cartucho",
  sala: "Sala escura",
};

// Cor de acento de cada tema, só para a amostra do próprio seletor — o resto
// do app nunca lê essas cores diretamente, sempre pelo token --accent do
// tema ativo (src/index.css).
const THEME_SWATCH: Record<Theme, string> = {
  fosforo: "#3fe08a",
  cartucho: "#e07b3a",
  sala: "#f0a94a",
};

const STORAGE_KEY = "zeux-theme";
const DEFAULT_THEME: Theme = "fosforo";

function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as readonly string[]).includes(value);
}

/**
 * Lê/grava a escolha de tema. O valor inicial já é aplicado por um script
 * embutido em index.html antes do React montar (evita o flash do tema padrão
 * e depois trocar para o salvo). Este hook só assume o controle depois.
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    return isTheme(attr) ? attr : DEFAULT_THEME;
  });

  function setTheme(next: Theme) {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return [theme, setTheme];
}

/**
 * Troca entre as três identidades visuais do ZeuX — todas escuras, cada uma
 * com temperatura e acento próprios (nunca o azul da Steam, o roxo da GOG ou
 * o preto/branco genérico da Epic). Fixo no canto para ficar acessível de
 * qualquer tela, já que ainda não existe uma tela de configurações.
 */
export function ThemePicker() {
  const [theme, setTheme] = useTheme();

  // Mantém em sincronia se o tema mudar por outra aba/janela.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && isTheme(e.newValue)) {
        document.documentElement.setAttribute("data-theme", e.newValue);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div className="fixed top-3 right-3 z-50 flex gap-1 rounded border border-line bg-panel/90 p-1 backdrop-blur">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          title={THEME_LABEL[t]}
          aria-label={`Tema ${THEME_LABEL[t]}`}
          aria-pressed={theme === t}
          onClick={() => setTheme(t)}
          className={`flex items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-xs transition-colors ${FOCUS_RING} ${
            theme === t ? "bg-fill text-ink" : "text-muted hover:text-ink"
          }`}
        >
          <span
            className="inline-block h-2 w-2 rounded-full border border-line-strong"
            style={{ background: THEME_SWATCH[t] }}
            aria-hidden="true"
          />
          {THEME_LABEL[t]}
        </button>
      ))}
    </div>
  );
}
