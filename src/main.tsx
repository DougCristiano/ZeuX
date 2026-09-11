import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LanguageProvider } from "./i18n/i18n";
import "./index.css";
// Efeito colateral de import: marca `data-visual-effects` no `<html>` antes
// do primeiro render (ver comentário em useVisualEffects.ts, B6 de
// docs/pendencias.md) — evita um flash de scanline/glow para quem já
// escolheu "reduzido".
import "./hooks/useVisualEffects";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
);
