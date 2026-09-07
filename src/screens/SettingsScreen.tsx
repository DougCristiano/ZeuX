import { useEffect, useState } from "react";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { api, ApiError } from "../api";
import type { EmulatorEntry, SystemInfo } from "../api/types";
import { useT } from "../i18n/i18n";
import { dict } from "./SettingsScreen.i18n";
import { Button, Card, ConfirmModal, InlineError, inputClass, ScreenContainer, Toast } from "../components/ui";
import { LanguageSelector } from "../components/LanguageSelector";
import { EmulatorBindingsPanel } from "../components/EmulatorBindingsPanel";
import { useToast } from "../hooks/useToast";

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

type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string; notes?: string }
  | { kind: "upToDate" }
  | { kind: "installing"; progress: number | null }
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
  const t = useT(dict);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const { toastMessage, showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfoState>({ kind: "loading" });
  const [pathError, setPathError] = useState<string | null>(null);
  const [uninstallError, setUninstallError] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>({ kind: "idle" });
  // Achado do critico-layout-biblioteca (2026-09-06): a única forma de
  // chegar no mapeamento de controle era sidebar → Consoles → card do
  // emulador → um botão que só existe se o emulador estiver instalado E for
  // bindable — sem atalho nenhum em Configurações. Esta seção reaproveita o
  // mesmo `EmulatorBindingsPanel` que `ConsoleDetailScreen` já usa, só que
  // listado por emulador em vez de por console, para quem procura direto
  // aqui achar de primeira.
  const [emulators, setEmulators] = useState<EmulatorEntry[] | null>(null);
  const [expandedAdapterId, setExpandedAdapterId] = useState<string | null>(null);

  useEffect(() => {
    api
      .getEmulators()
      .then((res) => setEmulators(res.emulators))
      .catch(() => setEmulators([]));
  }, []);

  useEffect(() => {
    api
      .getSystemInfo()
      .then((info) => setSystemInfo({ kind: "loaded", info }))
      .catch((err) =>
        setSystemInfo({
          kind: "error",
          message: err instanceof ApiError ? err.message : t("locateInstallError"),
        }),
      );
  }, []);

  // O plugin-opener do Tauri só abre caminhos liberados em
  // src-tauri/capabilities/default.json (opener:allow-open-path). Achado
  // real, 2026-08-17: a liberação só cobria "$HOME/.config/**", que existe
  // no Linux mas não no Windows (%AppData%\Roaming) nem no macOS — abrir
  // esta pasta falhava com "Not allowed to open path" fora do Linux. A
  // liberação agora usa "$CONFIG/**" (equivalente cross-platform de
  // os.UserConfigDir() no backend Go).
  async function openInstallFolder() {
    if (systemInfo.kind !== "loaded") return;
    setPathError(null);
    try {
      await openPath(systemInfo.info.app_data_dir);
    } catch (err) {
      setPathError(t("pathOpenError", { error: err instanceof Error ? err.message : String(err) }));
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
  //
  // Mesma classe de bug do "Abrir pasta de instalação" (2026-08-17):
  // "opener:default" (src-tauri/capabilities/default.json) só libera
  // mailto:/tel:/https:/http: (permissão opener:allow-default-urls) — um
  // esquema customizado como "ms-settings:" precisa da permissão
  // opener:allow-open-url à parte, sem a qual o Tauri recusava com "Not
  // allowed to open url" antes de sequer chegar no Windows.
  async function openWindowsUninstall() {
    setUninstallError(null);
    try {
      await openUrl("ms-settings:appsfeatures");
    } catch (err) {
      setUninstallError(
        t("uninstallOpenError", { error: err instanceof Error ? err.message : String(err) }),
      );
    }
  }

  function loadStatus() {
    setState({ kind: "loading" });
    api
      .getIGDBCredentials()
      .then((status) => setState({ kind: "loaded", personal: status.personal }))
      .catch((err) =>
        setState({ kind: "error", message: err instanceof ApiError ? err.message : t("accountStatusError") }),
      );
  }

  useEffect(loadStatus, []);

  async function checkForUpdates() {
    setUpdateState({ kind: "checking" });
    try {
      const update = await check();
      if (!update) {
        setUpdateState({ kind: "upToDate" });
        return;
      }
      setUpdateState({ kind: "available", version: update.version, notes: update.body ?? undefined });
    } catch (err) {
      setUpdateState({
        kind: "error",
        message: err instanceof Error ? err.message : t("updateCheckError"),
      });
    }
  }

  async function installUpdate() {
    setUpdateState({ kind: "installing", progress: 0 });
    try {
      const update = await check();
      if (!update) {
        setUpdateState({ kind: "upToDate" });
        return;
      }

      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setUpdateState({
            kind: "installing",
            progress: total > 0 ? Math.round((downloaded / total) * 100) : null,
          });
        }
      });
      await relaunch();
    } catch (err) {
      setUpdateState({
        kind: "error",
        message: err instanceof Error ? err.message : t("updateInstallError"),
      });
    }
  }

  // B4 (achado do critico-design, 2026-08-18): conectar/desconectar não
  // dava nenhum retorno próprio — a tela troca de conteúdo (formulário ↔
  // "Conta conectada.") por causa do `loadStatus()`, mas isso é sutil o
  // bastante para passar despercebido; o toast reforça.
  async function handleConnect() {
    setSaving(true);
    setFormError(null);
    try {
      await api.setIGDBCredentials(clientId, clientSecret);
      setClientId("");
      setClientSecret("");
      loadStatus();
      showToast(t("connectedToast"));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("connectError"));
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
      showToast(t("disconnectedToast"));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("disconnectError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer variant="listing">
      {toastMessage && <Toast message={toastMessage} />}
      <h1 className="mb-5 text-2xl font-semibold text-ink">{t("title")}</h1>

      <Card className="mb-6">
        <h2 className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">{t("languageLabel")}</h2>
        <LanguageSelector />
      </Card>

      <Card className="mb-6">
        <h2 className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">{t("updatesHeading")}</h2>
        <p className="mb-4 text-sm text-muted">{t("updatesDescription")}</p>

        {updateState.kind === "available" && (
          <div className="mb-3 rounded border border-accent bg-fill p-3">
            <p className="font-semibold text-ink">{t("updateAvailable", { version: updateState.version })}</p>
            {updateState.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{updateState.notes}</p>}
          </div>
        )}
        {updateState.kind === "installing" && (
          <p className="mb-3 text-sm text-muted">
            {updateState.progress === null
              ? t("downloadingUpdate")
              : t("downloadingUpdateProgress", { progress: updateState.progress })}
          </p>
        )}
        {updateState.kind === "upToDate" && <p className="mb-3 text-sm text-ink">{t("upToDate")}</p>}
        {updateState.kind === "error" && <InlineError className="mb-3">{updateState.message}</InlineError>}

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={updateState.kind === "checking" || updateState.kind === "installing"} onClick={checkForUpdates}>
            {updateState.kind === "checking" ? t("checkingUpdates") : t("checkUpdates")}
          </Button>
          {updateState.kind === "available" && (
            <Button variant="primary" onClick={installUpdate}>
              {t("installUpdate")}
            </Button>
          )}
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">{t("controllersHeading")}</h2>
        <p className="mb-4 text-sm text-muted">{t("controllersDescription")}</p>

        {emulators === null && <p className="text-sm text-muted">{t("loadingEmulatorsForControllers")}</p>}

        {emulators !== null &&
          (() => {
            const bindable = emulators.filter((e) => e.installed && e.bindable);
            if (bindable.length === 0) {
              return <p className="text-sm text-muted">{t("noBindableEmulators")}</p>;
            }
            return (
              <div className="flex flex-col gap-3">
                {bindable.map((emulator) => (
                  <div key={emulator.adapter_id}>
                    <Button
                      variant="secondary"
                      className="w-fit"
                      onClick={() =>
                        setExpandedAdapterId((id) => (id === emulator.adapter_id ? null : emulator.adapter_id))
                      }
                    >
                      {emulator.name} · {expandedAdapterId === emulator.adapter_id ? t("hideController") : t("configureController")}
                    </Button>
                    {expandedAdapterId === emulator.adapter_id && (
                      <div className="mt-3">
                        <EmulatorBindingsPanel adapterId={emulator.adapter_id} adapterName={emulator.name} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
      </Card>

      <Card className="mb-6">
        <h2 className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">{t("installationHeading")}</h2>
        <p className="mb-4 text-sm text-muted">
          {t("installationDescription")}
        </p>

        {systemInfo.kind === "loading" && <p className="text-sm text-muted">{t("locatingFolder")}</p>}
        {systemInfo.kind === "error" && <InlineError>{systemInfo.message}</InlineError>}

        {systemInfo.kind === "loaded" && (
          <div className="flex flex-col gap-3">
            <p className="break-all rounded border border-line bg-fill px-3 py-2 font-mono text-xs text-ink">
              {systemInfo.info.app_data_dir}
            </p>
            {pathError && <InlineError>{pathError}</InlineError>}
            <Button variant="secondary" onClick={openInstallFolder} className="w-fit">
              {t("openInstallFolder")}
            </Button>
          </div>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">{t("uninstallHeading")}</h2>

        {systemInfo.kind === "loaded" && systemInfo.info.os === "windows" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              {t("uninstallWindowsDescription")}
            </p>
            {uninstallError && <InlineError>{uninstallError}</InlineError>}
            <Button variant="secondary" onClick={openWindowsUninstall} className="w-fit">
              {t("openWindowsUninstall")}
            </Button>
          </div>
        )}

        {systemInfo.kind === "loaded" && systemInfo.info.os !== "windows" && (
          <p className="text-sm text-muted">
            {systemInfo.info.os === "darwin"
              ? t("uninstallMacDescription")
              : t("uninstallLinuxDescription")}{" "}
            {t("uninstallSuffix")}
          </p>
        )}

        {systemInfo.kind !== "loaded" && (
          <p className="text-sm text-muted">{t("waitingForInstall")}</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">{t("igdbHeading")}</h2>
        <p className="mb-4 text-sm text-muted">
          {t("igdbDescription")}
        </p>

        {state.kind === "loading" && <p className="text-sm text-muted">{t("readingAccountStatus")}</p>}

        {state.kind === "error" && (
          <div>
            <InlineError className="mb-2">{state.message}</InlineError>
            <Button variant="secondary" onClick={loadStatus}>
              {t("tryAgain")}
            </Button>
          </div>
        )}

        {state.kind === "loaded" && state.personal && (
          <div>
            <p className="mb-3 text-sm text-ink">{t("accountConnected")}</p>
            {formError && <InlineError className="mb-3">{formError}</InlineError>}
            {confirmingDisconnect ? (
              // N13 (docs/roadmap.md, Sprint N): irreversível (apaga a
              // credencial pessoal salva) — era painel inline, virou modal.
              <ConfirmModal
                title={t("disconnectConfirmTitle")}
                message={t("disconnectConfirmMessage")}
                onClose={() => setConfirmingDisconnect(false)}
                actions={
                  <>
                    <Button variant="secondary" disabled={saving} onClick={() => setConfirmingDisconnect(false)}>
                      {t("cancel")}
                    </Button>
                    <Button variant="danger" disabled={saving} onClick={handleDisconnect}>
                      {t("disconnect")}
                    </Button>
                  </>
                }
              />
            ) : (
              <Button variant="secondary" onClick={() => setConfirmingDisconnect(true)}>
                {t("disconnect")}
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
              {t("usingTestCredential")}
            </p>
            {formError && <InlineError>{formError}</InlineError>}
            <label className="flex flex-col gap-1 text-sm text-ink">
              {t("clientIdLabel")}
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                autoComplete="off"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              {t("clientSecretLabel")}
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                autoComplete="off"
                className={inputClass}
              />
            </label>
            <Button
              variant="primary"
              disabled={saving || !clientId || !clientSecret}
              onClick={handleConnect}
              className="w-fit"
            >
              {saving ? t("connecting") : t("connect")}
            </Button>
          </div>
        )}
      </Card>
    </ScreenContainer>
  );
}
