import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initDemoModeFromURL } from "./api/demoMode";
import "./index.css";

// Precisa rodar antes do primeiro render: App.tsx já dispara chamadas de
// API no primeiro efeito, e essas chamadas precisam encontrar a flag de
// modo demo já lida do localStorage (ver src/api/demoMode.ts).
initDemoModeFromURL();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
