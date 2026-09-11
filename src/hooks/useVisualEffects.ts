import { useEffect, useState } from "react";

/**
 * B6 (docs/pendencias.md): o toggle manual "Efeitos visuais" de
 * Configurações, complemento do `@media (prefers-contrast: more)` de
 * `index.css` — aquele já reage ao SO sozinho; isto é para quem quer desligar
 * scanline/glow sem que o SO inteiro esteja em alto contraste (ex.: sala
 * clara, fotossensibilidade, sem querer mudar mais nada do ambiente).
 *
 * Não é "tema": não troca paleta nem vira o app claro (ver comentário do
 * `--paper`/`color-scheme: dark` em index.css — isso continua fixo). Só some
 * com decoração CRT. `data-visual-effects="reduced"` no `<html>` é o mesmo
 * mecanismo de acoplamento que `[data-gamepad-focused]` já usa (marcar o
 * elemento raiz e deixar o CSS reagir), e as regras que ele ativa vivem ao
 * lado do bloco de `prefers-contrast` em index.css para as duas fontes
 * (SO e escolha manual) caírem nas mesmas linhas.
 */
export type VisualEffects = "full" | "reduced";

const STORAGE_KEY = "zeux.visual-effects";

/** Falha de `localStorage` (ex.: modo privado restrito) responde "completo"
 *  — o padrão do produto é o visual cheio; reduzir é opt-in. */
function readStored(): VisualEffects {
  try {
    return localStorage.getItem(STORAGE_KEY) === "reduced" ? "reduced" : "full";
  } catch {
    return "full";
  }
}

/**
 * Aplica no `<html>`, não num wrapper interno: `AmbientGlow`/`.zeux-scanlines`
 * aparecem em telas espalhadas (`ConsentScreen`, `StatusScreen`,
 * `SplashScreen`, `TourOverlay`, `App.tsx` shell...) que não compartilham um
 * ancestral comum abaixo da raiz — só `document.documentElement` cobre todas
 * de uma vez, igual ao `color-scheme: dark` do próprio index.css.
 */
export function applyVisualEffects(value: VisualEffects) {
  if (value === "reduced") {
    document.documentElement.setAttribute("data-visual-effects", "reduced");
  } else {
    document.documentElement.removeAttribute("data-visual-effects");
  }
}

// Aplicado uma vez, na carga do módulo (importado por `main.tsx` antes do
// primeiro render) — sem isso a tela reabriria sempre em "completo" por um
// instante até o SettingsScreen montar e ler o localStorage, gerando um
// flash de scanline/glow para quem escolheu "reduzido".
applyVisualEffects(readStored());

/** Hook usado só por `SettingsScreen` para ler/trocar a preferência. */
export function useVisualEffects() {
  const [value, setValue] = useState<VisualEffects>(readStored);

  useEffect(() => {
    applyVisualEffects(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Preferência de tela, não dado crítico — se não persistir, o app
      // continua funcionando só sem lembrar na próxima abertura.
    }
  }, [value]);

  return [value, setValue] as const;
}
