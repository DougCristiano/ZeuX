#!/usr/bin/env node
// Bate cada rota do índice de docs/api.md contra um zeuxd real e falha se um
// campo esperado sumir — é a única defesa contra o front (src/api/types.ts) e
// o servidor Go divergindo em silêncio (item B6 do plano da Sprint B). Exige
// um zeuxd já rodando em 127.0.0.1:7777 (ex.: `go run ./cmd/zeuxd`).
//
// Efeito colateral avisado: concede e revoga o consentimento e roda um scan
// de hardware de verdade, para poder verificar as rotas que dependem deles.
// O estado original do consentimento é restaurado ao final.

const BASE = "http://127.0.0.1:7777/api/v1";
const failures = [];

function fail(route, message) {
  failures.push(`[${route}] ${message}`);
}

function has(route, obj, field) {
  if (obj == null || !(field in obj) || obj[field] === undefined) {
    fail(route, `campo "${field}" ausente na resposta`);
    return false;
  }
  return true;
}

function absent(route, obj, field) {
  if (obj != null && field in obj && obj[field] !== undefined) {
    fail(route, `campo "${field}" deveria estar ausente, veio ${JSON.stringify(obj[field])}`);
  }
}

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = res.headers.get("content-type") ?? "";
  const json = contentType.includes("application/json") ? await res.json() : null;
  return { status: res.status, body: json };
}

async function main() {
  console.log(`verify-api: conferindo ${BASE} contra docs/api.md\n`);

  // --- GET /health ---
  {
    const { status, body } = await call("GET", "/health");
    if (status !== 200) {
      console.error(`zeuxd não respondeu 200 em /health (${status}) — ele está rodando?`);
      process.exit(1);
    }
    has("GET /health", body, "status");
    has("GET /health", body, "schema_version");
    has("GET /health", body, "consoles");
  }

  // --- GET /consent (estado original, para restaurar depois) ---
  const original = (await call("GET", "/consent")).body;
  has("GET /consent", original, "granted");
  has("GET /consent", original, "policy_version");
  has("GET /consent", original, "policy_text");
  if (original.granted === false) {
    absent("GET /consent", original, "granted_at");
  }

  // --- POST /consent {granted:true} ---
  const granted = (await call("POST", "/consent", { granted: true })).body;
  if (granted.granted !== true) {
    fail("POST /consent", `esperava granted=true depois de conceder, veio ${granted.granted}`);
  }
  has("POST /consent (granted)", granted, "granted_at");

  // --- POST /hardware/scan ---
  const scanResult = await call("POST", "/hardware/scan");
  if (scanResult.status !== 200) {
    fail("POST /hardware/scan", `esperava 200, veio ${scanResult.status}: ${JSON.stringify(scanResult.body)}`);
  } else {
    const hw = scanResult.body;
    for (const field of ["scanned_at", "os", "cpu", "gpus", "memory", "warnings"]) {
      has("POST /hardware/scan", hw, field);
    }
    for (const field of ["platform", "version", "arch"]) {
      has("POST /hardware/scan .os", hw.os, field);
    }
    for (const field of ["model", "vendor", "physical_cores", "logical_cores", "base_clock_mhz"]) {
      has("POST /hardware/scan .cpu", hw.cpu, field);
    }
    for (const field of ["total_bytes", "available_bytes"]) {
      has("POST /hardware/scan .memory", hw.memory, field);
    }
  }

  // --- GET /hardware ---
  {
    const { status, body } = await call("GET", "/hardware");
    if (status !== 200) fail("GET /hardware", `esperava 200 depois do scan, veio ${status}`);
    has("GET /hardware", body, "scanned_at");
  }

  // --- GET /consoles/verdicts ---
  {
    const { status, body: report } = await call("GET", "/consoles/verdicts");
    if (status !== 200) {
      fail("GET /consoles/verdicts", `esperava 200, veio ${status}`);
    } else {
      for (const field of ["summary", "verdicts", "precision", "notes"]) {
        has("GET /consoles/verdicts", report, field);
      }
      if (report.summary) {
        for (const field of ["cpu", "gpu", "memory", "system"]) {
          has("GET /consoles/verdicts .summary", report.summary, field);
        }
      }
      if (Array.isArray(report.verdicts)) {
        if (report.verdicts.length === 0) {
          fail("GET /consoles/verdicts", "catálogo devolveu 0 verdicts — nada para conferir os dois formatos de ConsoleVerdict");
        }
        const otimista = report.verdicts.find((v) => v.level !== "improvavel");
        const pessimista = report.verdicts.find((v) => v.level === "improvavel");
        // "bottlenecks" fica de fora desta lista de propósito: omitempty no Go
        // remove o campo quando não há gargalo a reportar (ex.: melhor
        // patamar já alcançado) — ausência é o comportamento correto, não uma
        // falha a apontar aqui.
        for (const field of ["console_id", "name", "short_name", "year", "level", "headline", "precision"]) {
          if (otimista) has("GET /consoles/verdicts [level != improvavel]", otimista, field);
          if (pessimista) has("GET /consoles/verdicts [level == improvavel]", pessimista, field);
        }
        if (otimista) {
          for (const field of ["emulator", "adapter_id", "preset", "options"]) {
            has("GET /consoles/verdicts [level != improvavel]", otimista, field);
          }
        }
        if (pessimista) {
          // Contrato central do B6: estes campos precisam estar AUSENTES, não
          // vazios, quando o console é "improvavel" — ver docs/api.md.
          for (const field of ["emulator", "adapter_id", "preset", "options"]) {
            absent("GET /consoles/verdicts [level == improvavel]", pessimista, field);
          }
        }
      } else {
        fail("GET /consoles/verdicts", "campo verdicts não é um array");
      }
    }
  }

  // --- GET /emulators ---
  {
    const { status, body } = await call("GET", "/emulators");
    if (status !== 200) fail("GET /emulators", `esperava 200, veio ${status}`);
    has("GET /emulators", body, "emulators");
    if (Array.isArray(body?.emulators)) {
      for (const entry of body.emulators) {
        for (const field of ["adapter_id", "name", "consoles", "installed"]) {
          has("GET /emulators [entry]", entry, field);
        }
        if (entry.installed) {
          has("GET /emulators [instalado]", entry, "installation");
        } else {
          absent("GET /emulators [não instalado]", entry, "installation");
        }
      }
    }
  }

  // --- GET /custom-emulators ---
  {
    const { status, body } = await call("GET", "/custom-emulators");
    if (status !== 200) fail("GET /custom-emulators", `esperava 200, veio ${status}`);
    for (const field of ["custom_emulators", "file_path", "placeholders"]) {
      has("GET /custom-emulators", body, field);
    }
  }

  // --- GET /emulator-sources ---
  {
    const { status, body } = await call("GET", "/emulator-sources");
    if (status !== 200) fail("GET /emulator-sources", `esperava 200, veio ${status}`);
    has("GET /emulator-sources", body, "sources");
    if (Array.isArray(body?.sources)) {
      const manual = body.sources.find((s) => s.kind === "manual");
      const automatica = body.sources.find((s) => s.kind !== "manual");
      if (manual) has("GET /emulator-sources [manual]", manual, "reason");
      if (automatica) absent("GET /emulator-sources [não manual]", automatica, "reason");
    }
  }

  // --- GET /installs ---
  {
    const { status, body } = await call("GET", "/installs");
    if (status !== 200) fail("GET /installs", `esperava 200, veio ${status}`);
    has("GET /installs", body, "installs");
  }

  // --- GET /sessions ---
  {
    const { status, body } = await call("GET", "/sessions");
    if (status !== 200) fail("GET /sessions", `esperava 200, veio ${status}`);
    for (const field of ["sessions", "playtime_seconds"]) {
      has("GET /sessions", body, field);
    }
    if (Array.isArray(body?.sessions)) {
      for (const session of body.sessions) {
        for (const field of ["id", "console_id", "adapter_id", "emulator", "rom_path", "started_at", "ended_at", "duration_seconds", "is_running"]) {
          has("GET /sessions [sessão]", session, field);
        }
      }
    }
  }

  // --- Formato de erro: um 400 conhecido, sem precisar de nenhum estado prévio ---
  {
    const { status, body } = await call("POST", "/games/launch", {});
    if (status !== 400) fail("POST /games/launch {}", `esperava 400, veio ${status}`);
    has("POST /games/launch {} .error", body?.error, "code");
    has("POST /games/launch {} .error", body?.error, "message");
    if (body?.error?.code !== "missing_fields") {
      fail("POST /games/launch {}", `esperava code=missing_fields, veio ${body?.error?.code}`);
    }
  }

  // --- Restaura o consentimento original ---
  await call("POST", "/consent", { granted: original.granted === true });

  console.log(`\n${failures.length === 0 ? "OK" : "FALHOU"}: ${failures.length} problema(s) encontrado(s).`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("verify-api: erro inesperado ao falar com o zeuxd:", err);
  process.exit(1);
});
