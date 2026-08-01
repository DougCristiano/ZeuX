import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api, ApiError, type ConsentStatus, type Report } from "./api";
import { ConsentScreen } from "./screens/ConsentScreen";
import { VerdictScreen } from "./screens/VerdictScreen";

// Dado de exemplo só para o item B7 (layout) poder ser conferido visualmente
// e por teclado sem depender de consentimento + scan reais. Some assim que o
// B8 (fluxo de onboarding de verdade) substituir isto pela chamada real a
// GET /consoles/verdicts.
const SAMPLE_REPORT: Report = {
  summary: {
    cpu: "AMD Ryzen 9 7900X — 12 núcleos físicos e 24 threads — clock base de 4.70 GHz.",
    gpu: "NVIDIA RTX 3060 Ti — 8,0 GB de memória de vídeo dedicada.",
    memory: "32 GB de memória RAM instalada.",
    system: "Windows 11 (amd64).",
  },
  precision: "completa",
  notes: [],
  verdicts: [
    {
      console_id: "ps1",
      name: "PlayStation 1",
      short_name: "PS1",
      year: 1994,
      level: "otimo",
      headline: "Ótima possibilidade de rodar a maioria dos jogos conhecidos deste console.",
      emulator: "DuckStation",
      adapter_id: "duckstation",
      preset: "Resolução interna 4x (Vulkan)",
      precision: "completa",
    },
    {
      console_id: "ps3",
      name: "PlayStation 3",
      short_name: "PS3",
      year: 2006,
      level: "limitado",
      headline: "Alcança parte do catálogo, com quedas em jogos mais pesados.",
      emulator: "RPCS3",
      adapter_id: "rpcs3",
      preset: "Resolução nativa",
      next_level: "bom",
      bottlenecks: ["Este patamar pede 12 GB de memória de vídeo; a placa RTX 3060 Ti tem 8,0 GB."],
      precision: "completa",
    },
    {
      console_id: "3ds",
      name: "Nintendo 3DS",
      short_name: "3DS",
      year: 2011,
      level: "bom",
      headline: "Boa possibilidade de rodar a maioria dos jogos conhecidos deste console.",
      precision: "parcial",
    },
    {
      console_id: "ps2",
      name: "PlayStation 2",
      short_name: "PS2",
      year: 2000,
      level: "improvavel",
      headline: "Este hardware não alcança o mínimo necessário para rodar este console de forma jogável.",
      bottlenecks: ["Este patamar pede uma placa de vídeo dedicada; esta máquina usa gráficos integrados."],
      precision: "completa",
    },
  ],
};

// App é a casca do produto: layout do item B7 (docs/sprint-b-plano.md) sobre
// dados reais quando existem. O fluxo de estado completo (consentimento →
// scan → parecer, com POST de verdade e re-checagem de PolicyVersion) é o
// item B8 — os cliques abaixo só logam, de propósito.
function App() {
  const [consent, setConsent] = useState<ConsentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Estado inicial é "indefinido" (null), não false: até a checagem no Rust
  // responder, não sabemos se há conflito, e a corrida (setup() do Tauri
  // pode terminar antes ou depois deste invoke) foi resolvida consultando sob
  // demanda em vez de escutar um evento que podia chegar cedo demais.
  const [portConflict, setPortConflict] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<boolean>("zeuxd_port_conflict")
      .then(setPortConflict)
      .catch(() => setPortConflict(false));
  }, []);

  useEffect(() => {
    // Ainda não sabemos (null) ou já sabemos que há conflito: não faz sentido
    // tentar falar com uma porta que ou não é do zeuxd, ou ainda não foi
    // checada.
    if (portConflict !== false) return;

    // O sidecar é iniciado no setup() do Tauri, em paralelo com a criação da
    // janela — pode levar um instante a mais para aceitar conexões. Tenta
    // algumas vezes antes de admitir falha, em vez de mostrar erro numa
    // corrida que se resolve sozinha um instante depois.
    let cancelled = false;
    let attempt = 0;

    async function tryFetch() {
      try {
        const result = await api.getConsent();
        if (!cancelled) setConsent(result);
      } catch (err) {
        attempt += 1;
        if (attempt >= 10) {
          if (!cancelled) {
            setError(err instanceof ApiError ? err.message : String(err));
          }
          return;
        }
        setTimeout(tryFetch, 300);
      }
    }

    tryFetch();
    return () => {
      cancelled = true;
    };
  }, [portConflict]);

  if (portConflict) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-6">
        <p className="max-w-sm text-base text-danger">
          A porta 7777 já está sendo usada por outro programa, não pelo ZeuX. Feche o que estiver usando essa
          porta e abra o ZeuX de novo.
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-6">
        <p className="max-w-sm text-base text-danger">Não foi possível falar com o zeuxd: {error}</p>
      </main>
    );
  }

  if (!consent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper">
        <p className="font-mono text-sm text-muted">lendo o consentimento…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper">
      <ConsentScreen
        policyText={consent.policy_text}
        policyVersion={consent.policy_version}
        onAccept={() => console.log("TODO(B8): POST /consent { granted: true } e disparar o scan")}
        onDecline={() => console.log("TODO(B8): POST /consent { granted: false }")}
      />

      <div className="border-t border-line px-6 py-2">
        <p className="font-mono text-xs tracking-wide text-muted uppercase">
          Pré-visualização do item B7 — dado de exemplo, substituído pelo parecer real no B8
        </p>
      </div>
      <VerdictScreen report={SAMPLE_REPORT} />
    </main>
  );
}

export default App;
