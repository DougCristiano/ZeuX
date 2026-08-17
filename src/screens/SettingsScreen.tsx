import { useEffect, useState } from "react";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { api, ApiError } from "../api";
import type { SystemInfo } from "../api/types";
import { Button, Card } from "../components/ui";

// `configured` de GET /igdb/credentials é sempre `true` desde 2026-08-17 —
// sem conta pessoal, o ZeuX cai numa credencial de teste embutida (ver
// docs/api.md e internal/igdb/credentials.go). `personal` é o campo que
// importa aqui: distingue "conta própria conectada" de "usando o padrão
// compartilhado".
type LoadState = { kind: "loading" } | { kind: "loaded"; personal: boolean } | { kind: "error"; message: string };

type SystemInfoState =
  | { kind: "loading" }
  | { kind: "loaded"; info: SystemInfo }
  | { kind: "error"; message: string };

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
  const [systemInfo, setSystemInfo] = useState<SystemInfoState>({ kind: "loading" });
  const [pathError, setPathError] = useState<string | null>(null);
  const [uninstallError, setUninstallError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSystemInfo()
      .then((info) => setSystemInfo({ kind: "loaded", info }))
      .catch((err) =>
        setSystemInfo({
          kind: "error",
          message: err instanceof ApiError ? err.message : "Não foi possível localizar a pasta de instalação.",
        }),
      );
  }, []);

  async function openInstallFolder() {
    if (systemInfo.kind !== "loaded") return;
    setPathError(null);
    try {
      await openPath(systemInfo.info.app_data_dir);
    } catch (err) {
      setPathError(`Não foi possível abrir a pasta: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // "ms-settings:appsfeatures" é o esquema de URI que o próprio Windows
  // registra para abrir Configurações › Aplicativos — não é um link do
  // ZeuX. O ZeuX não se desinstala sozinho (o instalador MSI/NSIS já
  // registra um desinstalador de verdade em "Add/Remove Programs" na hora
  // da instalação); este botão só evita o usuário ter que saber onde essa
  // tela do Windows fica. Não existe equivalente confiável em Linux/macOS
  // (depende de como o pacote foi instalado — .deb, .rpm, .AppImage,
  // .dmg —, então não tem um único URI ou comando certo para todos), por
  // isso o botão só aparece no Windows; nos outros dois a tela explica o
  // caminho manual em vez de fingir automação que não existe.
  async function openWindowsUninstall() {
    setUninstallError(null);
    try {
      await openUrl("ms-settings:appsfeatures");
    } catch (err) {
      setUninstallError(
        `Não foi possível abrir a tela de desinstalação do Windows: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  function loadStatus() {
    setState({ kind: "loading" });
    api
      .getIGDBCredentials()
      .then((status) => setState({ kind: "loaded", personal: status.personal }))
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

      <Card className="mb-6">
        <h2 className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">Instalação</h2>
        <p className="mb-4 text-sm text-muted">
          Emuladores instalados pelo ZeuX, biblioteca, capas e configurações desta máquina ficam todos dentro da
          mesma pasta.
        </p>

        {systemInfo.kind === "loading" && <p className="text-sm text-muted">Localizando a pasta…</p>}
        {systemInfo.kind === "error" && <p className="text-sm text-danger">{systemInfo.message}</p>}

        {systemInfo.kind === "loaded" && (
          <div className="flex flex-col gap-3">
            <p className="break-all rounded border border-line bg-fill px-3 py-2 font-mono text-xs text-ink">
              {systemInfo.info.app_data_dir}
            </p>
            {pathError && <p className="text-sm text-danger">{pathError}</p>}
            <Button variant="secondary" onClick={openInstallFolder} className="w-fit">
              Abrir pasta de instalação
            </Button>
          </div>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">Desinstalar o ZeuX</h2>

        {systemInfo.kind === "loaded" && systemInfo.info.os === "windows" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              O ZeuX já tem um desinstalador registrado no Windows — este botão só leva direto até ele, em
              Configurações › Aplicativos. Remover o programa por lá não apaga a pasta acima (seus emuladores
              instalados, saves e biblioteca continuam no disco, para o caso de reinstalar depois); apague-a
              manualmente se quiser também limpar esses dados.
            </p>
            {uninstallError && <p className="text-sm text-danger">{uninstallError}</p>}
            <Button variant="secondary" onClick={openWindowsUninstall} className="w-fit">
              Abrir desinstalação do Windows
            </Button>
          </div>
        )}

        {systemInfo.kind === "loaded" && systemInfo.info.os !== "windows" && (
          <p className="text-sm text-muted">
            {systemInfo.info.os === "darwin"
              ? "No macOS, desinstalar é mover o ZeuX.app para a Lixeira, como qualquer outro aplicativo."
              : "No Linux, desinstale pelo mesmo gerenciador de pacotes usado para instalar (ex.: seu gerenciador de .deb/.rpm, ou apague o AppImage)."}{" "}
            Isso não apaga a pasta acima — apague-a manualmente se também quiser remover emuladores instalados,
            saves e biblioteca.
          </p>
        )}

        {systemInfo.kind !== "loaded" && (
          <p className="text-sm text-muted">Aguardando localizar a instalação…</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">Capas de jogo (IGDB)</h2>
        <p className="mb-4 text-sm text-muted">
          O ZeuX pode buscar a capa e a data de lançamento dos seus jogos no IGDB. O ideal é cada pessoa conectar a
          própria conta — o ID e o segredo do cliente, obtidos no painel de desenvolvedor do Twitch — para que a
          busca de todo mundo que usa o ZeuX não divida a mesma cota. A credencial fica guardada só nesta máquina,
          nunca é enviada a nenhum servidor do ZeuX.
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

        {state.kind === "loaded" && state.personal && (
          <div>
            <p className="mb-3 text-sm text-ink">Conta conectada.</p>
            {formError && <p className="mb-3 text-sm text-danger">{formError}</p>}
            {confirmingDisconnect ? (
              <div className="flex flex-wrap gap-2">
                <p className="w-full text-sm text-ink">
                  Desconectar a conta? O ZeuX volta a usar a credencial de teste compartilhada (abaixo) até você
                  conectar de novo.
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

        {state.kind === "loaded" && !state.personal && (
          <div className="flex flex-col gap-3">
            {/* Achado real, 2026-08-17: pequenos grupos de testadores não têm
                conta própria do IGDB ainda quando começam a usar o ZeuX — em
                vez de deixar a busca de capa travada até alguém configurar
                algo, o ZeuX já busca sozinho com uma credencial de teste
                embutida (internal/igdb/credentials.go, defaultCredentials).
                O formulário abaixo continua disponível pra quem quiser
                conectar a própria conta e sair da cota compartilhada. */}
            <p className="text-sm text-ink">
              Usando a credencial de teste do ZeuX — a busca de capa já funciona, sem precisar configurar nada.
              Ela é compartilhada com quem também não conectou a própria conta; conecte a sua para não depender
              dessa cota.
            </p>
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
