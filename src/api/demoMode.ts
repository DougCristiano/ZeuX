// Modo demo (branch `web-preview`, GitHub Pages — ver
// .github/workflows/web-preview.yml): deixa alguém abrir a página publicada
// e clicar pelas telas sem instalar o ZeuX e sem nenhum zeuxd rodando em
// lugar nenhum. Ativado só por "?demo=1" na URL; persiste em localStorage
// pra sobreviver a um F5 sem precisar repetir o parâmetro (o app é uma
// página só, sem router, então a URL não muda sozinha navegando entre
// telas). "?demo=0" desativa de novo.
//
// A build normal (Tauri, ou `npm run build` local sem essa flag) nunca
// entra neste caminho — ninguém que instala o ZeuX de verdade vê dado
// fictício por engano.
const DEMO_STORAGE_KEY = "zeux-demo-mode";

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEMO_STORAGE_KEY) === "1";
  } catch {
    // Storage bloqueado (aba privada, política do navegador) — sem modo
    // demo em vez de quebrar a leitura.
    return false;
  }
}

// Chamado uma única vez, no bootstrap (src/main.tsx), antes de qualquer
// tela renderizar.
export function initDemoModeFromURL(): void {
  if (typeof window === "undefined") return;
  const value = new URLSearchParams(window.location.search).get("demo");
  if (value !== "1" && value !== "0") return;
  try {
    if (value === "1") window.localStorage.setItem(DEMO_STORAGE_KEY, "1");
    else window.localStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    // Storage bloqueado — a flag da URL simplesmente não persiste; não é
    // motivo para impedir o resto do app de carregar.
  }
}

// Botão "Iniciar modo demonstração" (ErrorScreen, só na build do preview
// web — ver VITE_ZEUX_WEB_PREVIEW em App.tsx): digitar "?demo=1" na mão
// era o único jeito antes disso. Recarrega a página de propósito — mais
// simples e mais confiável do que tentar reiniciar o fluxo de
// consentimento/scan em cima do estado que já falhou.
export function enableDemoModeAndReload(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, "1");
  } catch {
    // Sem storage, a flag não sobrevive ao reload — mas o reload ainda
    // acontece; só não vai persistir numa próxima aba.
  }
  window.location.reload();
}
