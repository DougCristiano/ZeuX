#!/usr/bin/env node
// Compila o zeuxd (núcleo Go) e o deixa em src-tauri/binaries com o nome que o
// Tauri espera de um "sidecar" (externalBin em src-tauri/tauri.conf.json):
// <nome>-<target triple do Rust>[.exe]. Sem isso, "npm run tauri build"
// empacotaria o app sem o daemon dentro, e o ADR 0001 (docs/decisoes/) já
// decidiu que o núcleo é um binário Go separado, não código Rust — então essa
// compilação não pode ser substituída por algo dentro do próprio Tauri.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const binariesDir = path.join(repoRoot, "src-tauri", "binaries");

const rustcInfo = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
const targetLine = rustcInfo.split("\n").find((line) => line.startsWith("host:"));
if (!targetLine) {
  throw new Error("não foi possível determinar o target do Rust via `rustc -vV`");
}
const target = targetLine.split(":")[1].trim();
const ext = target.includes("windows") ? ".exe" : "";
const outPath = path.join(binariesDir, `zeuxd-${target}${ext}`);

mkdirSync(binariesDir, { recursive: true });

// A credencial de teste do IGDB compartilhada por quem não conecta a
// própria conta (internal/igdb/credentials.go, defaultClientID/
// defaultClientSecret) não fica mais escrita no código-fonte — só o
// workflow oficial de release (.github/workflows/release.yml) tem essas
// duas variáveis como GitHub Secret e as injeta aqui via ldflags. Um build
// local sem elas simplesmente não embute credencial nenhuma: o app
// continua funcionando, só exige conta pessoal conectada em Configurações
// para buscar capa via IGDB (thumbnails.libretro.com, sem conta, não é
// afetado).
const ldflags = [];
const defaultClientID = process.env.IGDB_DEFAULT_CLIENT_ID;
const defaultClientSecret = process.env.IGDB_DEFAULT_CLIENT_SECRET;
if (defaultClientID && defaultClientSecret) {
  ldflags.push(`-X github.com/doufl/zeux/internal/igdb.defaultClientID=${defaultClientID}`);
  ldflags.push(`-X github.com/doufl/zeux/internal/igdb.defaultClientSecret=${defaultClientSecret}`);
}

console.log(`build-zeuxd: compilando ./cmd/zeuxd para ${target} -> ${path.relative(repoRoot, outPath)}`);
const goArgs = ["build", "-o", outPath];
if (ldflags.length > 0) {
  goArgs.push("-ldflags", ldflags.join(" "));
}
goArgs.push("./cmd/zeuxd");
execFileSync("go", goArgs, {
  cwd: repoRoot,
  stdio: "inherit",
});
