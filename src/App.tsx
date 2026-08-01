import { useEffect, useState } from "react";

// URL fixa por enquanto: o zeuxd ainda sobe como processo separado, gerenciado
// à mão pelo desenvolvedor. O ciclo de vida como processo filho do Tauri é o
// item B5, ainda não feito.
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

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(String(err)));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 font-mono">
        <h1 className="text-xl font-semibold">ZeuX</h1>
        <p className="mt-2 text-sm text-slate-400">
          Casca da UI (Sprint B) — ainda sem onboarding real.
        </p>

        {error && (
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
