import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { EmulatorEntry, InstallJob } from "../api/types";
import { Badge, Button, Card, ProgressBar } from "../components/ui";

// Item B10 (docs/sprint-b-plano.md): instalar com ressalva de hardware. O
// servidor já faz a parte que importa — hardwareBlocks recusa com 409 e
// override_hint, /installs/{id} acompanha o progresso — esta tela só não pode
// estragar isso.
type RowState =
  | { kind: "idle" }
  | { kind: "starting" }
  // message vem de ApiError.message (docs/api.md, code hardware_insufficient)
  // — nunca uma frase escrita aqui. Ver ConsoleVerdict/handleInstall em
  // internal/api/server.go, hardwareBlocks.
  | { kind: "confirm-hardware"; message: string }
  | { kind: "installing"; job: InstallJob }
  | { kind: "done"; job: InstallJob }
  | { kind: "error"; message: string };

function percentOf(job: InstallJob): number | null {
  if (job.total_bytes <= 0) return null;
  return Math.min(100, Math.round((job.downloaded_bytes / job.total_bytes) * 100));
}

function EmulatorRow({ entry, onChanged }: { entry: EmulatorEntry; onChanged: () => void }) {
  const [state, setState] = useState<RowState>({ kind: "idle" });

  async function pollJob(jobId: string) {
    try {
      const job = await api.getInstallJob(jobId);
      if (job.phase === "concluido") {
        setState({ kind: "done", job });
        onChanged();
        return;
      }
      if (job.phase === "falhou") {
        // job.error é a mensagem original do servidor (docs/api.md) — exibida
        // como veio, igual ao erro de rota.
        setState({ kind: "error", message: job.error ?? "A instalação falhou." });
        return;
      }
      setState({ kind: "installing", job });
      setTimeout(() => pollJob(jobId), 400);
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof ApiError ? err.message : "Não foi possível acompanhar a instalação.",
      });
    }
  }

  async function install(force: boolean) {
    setState({ kind: "starting" });
    try {
      const job = await api.installEmulator(entry.adapter_id, force);
      setState({ kind: "installing", job });
      pollJob(job.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === "hardware_insufficient") {
        setState({ kind: "confirm-hardware", message: err.message });
        return;
      }
      setState({
        kind: "error",
        message: err instanceof ApiError ? err.message : "Não foi possível iniciar a instalação.",
      });
    }
  }

  return (
    <tr className="border-b border-line">
      <td className="px-3 py-3 align-top">
        <p className="font-semibold text-ink">{entry.name}</p>
        <p className="text-sm text-muted">{entry.consoles.join(", ")}</p>
      </td>
      <td className="px-3 py-3 align-top">
        {entry.installed ? (
          <Badge variant="solid">{entry.installation?.managed ? "instalado pelo ZeuX" : "já estava na máquina"}</Badge>
        ) : (
          <Badge>não instalado</Badge>
        )}

        {state.kind === "confirm-hardware" && (
          // Regra: recusar não some com a linha nem desabilita o botão de
          // instalar — "Cancelar" só volta ao estado normal.
          <div className="mt-2 max-w-sm rounded border border-dashed border-line-strong p-3">
            <p className="text-sm text-ink">{state.message}</p>
          </div>
        )}

        {(state.kind === "installing" || state.kind === "done") && (
          <div className="mt-2 max-w-sm">
            <p className="text-sm text-muted">
              {state.job.phase}
              {state.job.asset_name ? ` · ${state.job.asset_name}` : ""}
            </p>
            {state.kind === "installing" && (
              <div className="mt-1">
                <ProgressBar percent={percentOf(state.job)} />
              </div>
            )}
          </div>
        )}

        {state.kind === "error" && <p className="mt-2 max-w-sm text-sm text-danger">{state.message}</p>}
      </td>
      <td className="px-3 py-3 align-top">
        {entry.installed || state.kind === "installing" || state.kind === "done" ? null : state.kind === "confirm-hardware" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" autoFocus onClick={() => install(true)}>
              Instalar mesmo assim
            </Button>
            <Button variant="secondary" onClick={() => setState({ kind: "idle" })}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            disabled={state.kind === "starting"}
            onClick={() => install(false)}
          >
            {state.kind === "error" ? "Tentar de novo" : "Instalar"}
          </Button>
        )}
      </td>
    </tr>
  );
}

/**
 * Tela de emuladores (wireframe 06/07 combinadas): lista o que o `GET
 * /emulators` conhece, e cada linha carrega seu próprio fluxo de instalação.
 * Escopo deliberadamente menor que o wireframe completo: sem remoção, sem
 * cadastro manual (nenhum dos dois é exigido pelo B10) — só o necessário para
 * a ressalva de hardware ser testável de verdade.
 */
export function EmulatorsScreen({ onBack }: { onBack: () => void }) {
  const [emulators, setEmulators] = useState<EmulatorEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api
      .getEmulators()
      .then((res) => setEmulators(res.emulators))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível listar os emuladores."));
  }, [reloadKey]);

  return (
    <div className="mx-auto max-w-3xl px-6 pt-16 pb-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Emuladores</h1>
        <Button variant="secondary" onClick={onBack}>
          Voltar ao parecer
        </Button>
      </div>

      {error && <p className="text-base text-danger">{error}</p>}

      {emulators && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line font-mono text-xs tracking-wide text-muted uppercase">
                <th className="px-3 py-2">Emulador</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {emulators.map((entry) => (
                <EmulatorRow key={entry.adapter_id} entry={entry} onChanged={() => setReloadKey((k) => k + 1)} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
