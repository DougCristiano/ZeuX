import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Button, Card } from "../components/ui";

type LoadState = { kind: "loading" } | { kind: "loaded"; configured: boolean } | { kind: "error"; message: string };

/**
 * Tela de Configurações (G1, docs/roadmap.md — Sprint G): único lugar do
 * ZeuX para conectar a conta do IGDB usada pelo scraper de metadados.
 * Reabre de propósito a decisão 4 do plano de migração visual (sidebar
 * travada em 3 itens) — aprovado pelo Douglas nesta sessão porque uma conta
 * de terceiro conectada merece um destino próprio, não um modal avulso.
 *
 * Nunca valida a credencial contra o IGDB aqui — só grava (POST
 * /igdb/credentials não chama a rede, ver docs/api.md). O erro real de uma
 * credencial errada só aparece na primeira busca de capa, onde já é
 * acionável ("confira o client_id/client_secret").
 */
export function SettingsScreen() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  function loadStatus() {
    setState({ kind: "loading" });
    api
      .getIGDBCredentials()
      .then((status) => setState({ kind: "loaded", configured: status.configured }))
      .catch((err) =>
        setState({ kind: "error", message: err instanceof ApiError ? err.message : "Não foi possível ler o estado da conta." }),
      );
  }

  useEffect(loadStatus, []);

  async function handleConnect() {
    setSaving(true);
    setFormError(null);
    try {
      await api.setIGDBCredentials(clientId, clientSecret);
      setClientId("");
      setClientSecret("");
      loadStatus();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Não foi possível conectar a conta.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    try {
      await api.clearIGDBCredentials();
      setConfirmingDisconnect(false);
      loadStatus();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Não foi possível desconectar a conta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 pt-16 pb-10">
      <h1 className="mb-5 text-2xl font-semibold text-ink">Configurações</h1>

      <Card>
        <h2 className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">Capas de jogo (IGDB)</h2>
        <p className="mb-4 text-sm text-muted">
          O ZeuX pode buscar a capa e a data de lançamento dos seus jogos no IGDB. Cada pessoa conecta a própria
          conta — o ID e o segredo do cliente, obtidos no painel de desenvolvedor do Twitch — para que a busca de
          todo mundo que usa o ZeuX não divida a mesma cota. A credencial fica guardada só nesta máquina, nunca é
          enviada a nenhum servidor do ZeuX.
        </p>

        {state.kind === "loading" && <p className="text-sm text-muted">Lendo o estado da conta…</p>}

        {state.kind === "error" && (
          <div>
            <p className="mb-2 text-sm text-danger">{state.message}</p>
            <Button variant="secondary" onClick={loadStatus}>
              Tentar de novo
            </Button>
          </div>
        )}

        {state.kind === "loaded" && state.configured && (
          <div>
            <p className="mb-3 text-sm text-ink">Conta conectada.</p>
            {formError && <p className="mb-3 text-sm text-danger">{formError}</p>}
            {confirmingDisconnect ? (
              <div className="flex flex-wrap gap-2">
                <p className="w-full text-sm text-ink">
                  Desconectar a conta? A biblioteca volta a mostrar o placeholder de sigla até você conectar de
                  novo.
                </p>
                <Button variant="primary" disabled={saving} onClick={handleDisconnect}>
                  Desconectar
                </Button>
                <Button variant="secondary" disabled={saving} onClick={() => setConfirmingDisconnect(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setConfirmingDisconnect(true)}>
                Desconectar conta
              </Button>
            )}
          </div>
        )}

        {state.kind === "loaded" && !state.configured && (
          <div className="flex flex-col gap-3">
            {formError && <p className="text-sm text-danger">{formError}</p>}
            <label className="flex flex-col gap-1 text-sm text-ink">
              ID do cliente
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                autoComplete="off"
                className="rounded border border-line bg-fill px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              Segredo do cliente
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                autoComplete="off"
                className="rounded border border-line bg-fill px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </label>
            <Button
              variant="primary"
              disabled={saving || !clientId || !clientSecret}
              onClick={handleConnect}
              className="w-fit"
            >
              {saving ? "Conectando…" : "Conectar"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
