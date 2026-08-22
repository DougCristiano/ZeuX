import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  // Preview em navegador via GitHub Pages (branch `web-preview`, ver
  // .github/workflows/web-preview.yml): um site de projeto do GitHub Pages
  // fica em "https://<usuário>.github.io/ZeuX/", não na raiz — sem o
  // `base` certo, os assets (JS/CSS/fontes) pedem caminho absoluto errado e
  // a página abre em branco. A build do Tauri (`npm run build` local, sem a
  // env var) continua servindo da raiz, intocada. A API continua apontando
  // pra `http://127.0.0.1:7777` (src/api/client.ts) — isso é o que permite
  // abrir a página do GitHub Pages e ela falar com o zeuxd rodando na
  // própria máquina de quem está testando (ver `SetDevOrigin`/
  // `ZEUX_DEV_ORIGIN` em internal/api/server.go).
  base: process.env.ZEUX_GH_PAGES_BASE || "/",

  // Alias exigido pelo shadcn/ui (J1, docs/roadmap.md) — espelha o "paths"
  // de tsconfig.json, que resolve o import mas não o bundler. fileURLToPath
  // em vez de `__dirname`: o projeto é "type": "module" (ESM), onde
  // `__dirname` não existe.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
