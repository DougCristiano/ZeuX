import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// O zeuxd agora sobe como sidecar do Tauri (item B5, src-tauri/src/lib.rs) e
// escuta sempre neste endereço fixo — descoberta dinâmica de porta é backlog
// sem sprint.
const API_BASE = "http://127.0.0.1:7777/api/v1";

type Health = {
  status: string;
  schema_version: number;
  consoles: number;
};

// App é só um placeholder que prova que o scaffold (React + Tailwind + fetch)
// fala com o zeuxd de verdade. O onboarding real (consentimento → scan →
// parecer) é o item B8, construído sobre o wireframe em docs/wireframe.md.
function App() {
  const [health, setHealth] = useState<Health | null>(null);
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
        const res = await fetch(`${API_BASE}/health`);
        if (!cancelled) setHealth(await res.json());
      } catch (err) {
        attempt += 1;
        if (attempt >= 10) {
          if (!cancelled) setError(String(err));
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 font-mono">
        <h1 className="text-xl font-semibold">ZeuX</h1>
        <p className="mt-2 text-sm text-slate-400">
          Casca da UI (Sprint B) — ainda sem onboarding real.
        </p>

        {portConflict && (
          <p className="mt-4 max-w-sm text-sm text-red-400">
            A porta 7777 já está sendo usada por outro programa, não pelo
            ZeuX. Feche o que estiver usando essa porta e abra o ZeuX de novo.
          </p>
        )}

        {!portConflict && error && (
          <p className="mt-4 text-sm text-red-400">
            Não foi possível falar com o zeuxd: {error}
          </p>
        )}

        {health && (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-400">status</dt>
            <dd>{health.status}</dd>
            <dt className="text-slate-400">schema_version</dt>
            <dd>{health.schema_version}</dd>
            <dt className="text-slate-400">consoles</dt>
            <dd>{health.consoles}</dd>
          </dl>
        )}
      </div>
    </main>
  );
}

export default App;
