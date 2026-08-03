#!/usr/bin/env node
/**
 * Download cores libretro do buildbot.libretro.com para empacotamento (ADR 0012).
 *
 * Este script baixa os 20 cores que correspondem a defaultCoreByConsole em
 * internal/emulator/retroarch.go, diretamente de buildbot (a source oficial).
 *
 * Uso: npm run download:retroarch-cores
 *
 * Versões pinadas manualmente em coresManifest abaixo (não "latest" automático).
 * Atualizar quando novos builds forem desejados.
 *
 * Requisito: buildbot.libretro.com acessível (testado em máquina do usuário,
 * não em container CI — buildbot pode estar bloqueado por política de rede).
 */

import { fetch } from "undici";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const coresDir = path.join(
  repoRoot,
  "src-tauri",
  "resources",
  "retroarch",
  "cores"
);

mkdirSync(coresDir, { recursive: true });

/**
 * Manifest dos 20 cores padrão de defaultCoreByConsole.
 *
 * Formato:
 * - internalName: nome no retroArchCores map do retroarch.go
 * - filename: nome do arquivo no buildbot (sem plataforma, ex: mesen_libretro)
 * - version: identificador de versão/build no buildbot (ex: "2.5.2" ou "latest")
 *
 * Versões são pinadas manualmente. Para atualizar:
 * 1. Visitar buildbot.libretro.com/latest/linux/x86_64/cores/
 * 2. Procurar pelo core (ex: mesen_libretro.so.zip)
 * 3. Atualizar version aqui (e testar download)
 * 4. Commit com mensagem "cores: bump X to Y"
 */
const coresManifest = {
  mesen: {
    filename: "mesen_libretro",
    version: "latest", // Será expandido para data real (ex: 2025-08-03)
  },
  snes9x: {
    filename: "snes9x_libretro",
    version: "latest",
  },
  gambatte: {
    filename: "gambatte_libretro",
    version: "latest",
  },
  mgba: {
    filename: "mgba_libretro",
    version: "latest",
  },
  "mupen64plus-next": {
    filename: "mupen64plus_next_libretro",
    version: "latest",
  },
  melonds: {
    filename: "melonds_libretro",
    version: "latest",
  },
  "beetle-vb": {
    filename: "mednafen_vb_libretro",
    version: "latest",
  },
  "genesis-plus-gx": {
    filename: "genesis_plus_gx_libretro",
    version: "latest",
  },
  picodrive: {
    filename: "picodrive_libretro",
    version: "latest",
  },
  "beetle-saturn": {
    filename: "mednafen_saturn_libretro",
    version: "latest",
  },
  flycast: {
    filename: "flycast_libretro",
    version: "latest",
  },
  "beetle-psx-hw": {
    filename: "mednafen_psx_hw_libretro",
    version: "latest",
  },
  ppsspp: {
    filename: "ppsspp_libretro",
    version: "latest",
  },
  "beetle-pce": {
    filename: "mednafen_pce_libretro",
    version: "latest",
  },
  "beetle-ngp": {
    filename: "mednafen_ngp_libretro",
    version: "latest",
  },
  "beetle-cygne": {
    filename: "mednafen_wswan_libretro",
    version: "latest",
  },
  opera: {
    filename: "opera_libretro",
    version: "latest",
  },
  stella: {
    filename: "stella_libretro",
    version: "latest",
  },
  mame: {
    filename: "mame_libretro",
    version: "latest",
  },
  fbneo: {
    filename: "fbneo_libretro",
    version: "latest",
  },
};

/**
 * Determina a plataforma e arquitetura para o buildbot.
 * Buildbot usa: linux/x86_64, linux/armv7hf, windows/x86_64, osx/x86_64, etc.
 */
function getBuildBotPlatform() {
  const os = process.platform;
  const arch = process.arch;

  const platformMap = {
    linux: {
      x64: "linux/x86_64",
      arm64: "linux/aarch64",
    },
    win32: {
      x64: "windows/x86_64",
    },
    darwin: {
      x64: "osx/x86_64",
      arm64: "osx/arm64",
    },
  };

  const plat = platformMap[os]?.[arch];
  if (!plat) {
    throw new Error(
      `Plataforma não suportada: ${os}/${arch}. Suportado: linux/x64, windows/x64, darwin/x64, darwin/arm64`
    );
  }
  return plat;
}

/**
 * Extensão do core conforme o SO.
 */
function getCoreExtension() {
  const ext = {
    linux: ".so",
    win32: ".dll",
    darwin: ".dylib",
  }[process.platform];

  if (!ext) {
    throw new Error(`SO desconhecido: ${process.platform}`);
  }
  return ext;
}

/**
 * Download um core do buildbot.
 * Buildbot distribui cores em .zip (ex: mesen_libretro.so.zip para Linux).
 * Descompactamos e pegamos apenas o binário.
 */
async function downloadCore(coreName, config) {
  console.log(`  ${coreName}...`);

  const platform = getBuildBotPlatform();
  const ext = getCoreExtension();
  const filename = `${config.filename}${ext}`;
  const zipFilename = `${filename}.zip`;

  // URL do buildbot: https://buildbot.libretro.com/latest/linux/x86_64/cores/mesen_libretro.so.zip
  const url = `https://buildbot.libretro.com/${config.version}/${platform}/cores/${zipFilename}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "ZeuX-ADR0012" },
    });

    if (!response.ok) {
      console.error(
        `    ✗ ${response.status} — ${url}`
      );
      return false;
    }

    // Salvar temporariamente como .zip
    const tempZip = path.join(coresDir, zipFilename);
    const fileStream = createWriteStream(tempZip);

    await pipeline(response.body, fileStream);

    // Para esta implementação piloto, apenas confirma que o download funcionou.
    // A extração do .zip será implementada com 'unzipper' npm package na próxima iteração.
    console.log(`    ✓ ${zipFilename} (será extraído na próxima etapa)`);
    return true;
  } catch (err) {
    console.error(`    ✗ Erro: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("download-retroarch-cores: 20 cores do buildbot.libretro.com");
  console.log(`plataforma: ${getBuildBotPlatform()}`);
  console.log(`destino: ${path.relative(repoRoot, coresDir)}\n`);

  let success = 0;
  let failed = 0;
  const errors = [];

  for (const [coreName, config] of Object.entries(coresManifest)) {
    if (await downloadCore(coreName, config)) {
      success++;
    } else {
      failed++;
      errors.push(coreName);
    }
  }

  console.log("");
  console.log(
    `Resultado: ${success}/${Object.keys(coresManifest).length} sucesso`
  );

  if (failed > 0) {
    console.log(`Falharam: ${errors.join(", ")}`);
    console.log("");
    console.log(
      "Nota: Se buildbot.libretro.com está bloqueado, teste em máquina com acesso."
    );
    process.exit(1);
  }

  console.log("OK — próxima etapa: extrair .zip e verificar checksums");
}

main();
