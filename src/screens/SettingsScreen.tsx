import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { api, ApiError } from "../api";
import type { EmulatorEntry, SystemInfo } from "../api/types";
import { useT } from "../i18n/i18n";
import { dict } from "./SettingsScreen.i18n";
import { Badge, Button, Card, CHROME_TINT_DANGER, ConfirmModal, EmptyState, InlineError, inputClass, ScreenAtmosphere, ScreenContainer, ScreenHeader, SectionHeading, Toast } from "../components/ui";
import { LanguageSelector } from "../components/LanguageSelector";
import { EmulatorBindingsPanel } from "../components/EmulatorBindingsPanel";
import { useToast } from "../hooks/useToast";
import { useGamepad } from "../hooks/useGamepad";
import { useVisualEffects } from "../hooks/useVisualEffects";

// Instruções fixas por adapter (2026-09-08) — passos reais confirmados
// mapeando um controle físico de verdade dentro de cada emulador. Não vem
// do backend: é texto de UI, não protocolo, e cada app tem seu próprio
// menu — um mapa aqui é mais simples que inventar uma abstração de "passo"
// genérica para dois casos.
const GUIDED_SETUP_INSTRUCTION_KEYS: Record<string, keyof typeof dict> = {
  pcsx2: "guidedSetupInstructionsPcsx2",
  retroarch: "guidedSetupInstructionsRetroarch",
};

// `configured` de GET /igdb/credentials nem sempre é `true` (achado real,
// 2026-09-08): a credencial de teste embutida só existe em builds oficiais
// do release, injetada via ldflags a partir de GitHub Secrets
// (internal/igdb/credentials.go, scripts/build-zeuxd.mjs) — um build local
// sem essas variáveis de ambiente sobe com `configured: false` também sem
// conta pessoal. `personal` distingue "conta própria conectada" de "usando
// o padrão compartilhado"; `configured` é o que decide se existe *algum*
// padrão compartilhado disponível quando não há conta própria.
type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; personal: boolean; configured: boolean }
  | { kind: "error"; message: string };

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
export function SettingsScreen({
  onOpenControllerTest,
  onOpenConfigureController,
  onReplayTour,
}: {
  onOpenControllerTest: () => void;
  onOpenConfigureController: () => void;
  /** Reabre o tour de primeira execução (O1, docs/pendencias.md) em qualquer
   *  execução — a marca de "já vi" no localStorage não é apagada, só ignorada
   *  desta vez. */
  onReplayTour: () => void;
}) {
  const t = useT(dict);
  const [visualEffects, setVisualEffects] = useVisualEffects();
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
  // Achado real (2026-09-08, relato do Douglas): não existia nenhum lugar
  // no app mostrando a versão instalada, o que tornava impossível
  // diagnosticar por conta própria se um auto-update realmente aplicou ou
  // se a janela aberta ainda era a versão antiga. getVersion() lê o mesmo
  // "version" que tauri.conf.json embute em tempo de build (ver
  // scripts/sync-version.mjs) — é a fonte de verdade que o próprio
  // auto-updater usa para decidir se há algo mais novo.
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(null));
  }, []);
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
  // Mesma classe de bug do "Abrir pasta de instalação" (2026-08-17), e achado
  // de novo em 2026-09-10 (relato do Douglas: "Not allowed to open url
  // ms-settings:appsfeatures" ao clicar): "opener:default"
  // (src-tauri/capabilities/default.json) só libera mailto:/tel:/https:/
  // http: (permissão opener:allow-default-urls). A correção anterior tinha
  // adicionado `opener:allow-open-url` **sem escopo** — e, como
  // `opener:allow-open-path` já mostrava ao lado (`{"path": "$CONFIG/**"}`),
  // uma permissão de URL sem escopo não libera URL nenhuma além do que o
  // escopo padrão já cobre; precisa do mesmo formato de objeto, com
  // `{"url": "ms-settings:*"}`. Sem isso o Tauri recusa "Not allowed to open
  // url" antes de sequer chegar no Windows.
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
      .then((status) => setState({ kind: "loaded", personal: status.personal, configured: status.configured }))
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
    <ScreenContainer variant="listing" className="relative">
      {/* Céu da tela (2026-09-10) — halo ancorado no topo do conteúdo. */}
      <ScreenAtmosphere />
      {toastMessage && <Toast message={toastMessage} />}
      <ScreenHeader title={t("title")} />

      <Card filled className="mb-6">
        <SectionHeading className="mb-2">{t("languageLabel")}</SectionHeading>
        <LanguageSelector />
      </Card>

      <Card filled className="mb-6">
        <SectionHeading className="mb-2">{t("visualEffectsHeading")}</SectionHeading>
        <p className="mb-4 text-sm text-muted">{t("visualEffectsDescription")}</p>
        <div role="radiogroup" aria-label={t("visualEffectsHeading")} className="flex w-fit gap-2">
          <Button
            type="button"
            variant={visualEffects === "full" ? "chrome" : "secondary"}
            aria-pressed={visualEffects === "full"}
            onClick={() => setVisualEffects("full")}
          >
            {t("visualEffectsFull")}
          </Button>
          <Button
            type="button"
            variant={visualEffects === "reduced" ? "chrome" : "secondary"}
            aria-pressed={visualEffects === "reduced"}
            onClick={() => setVisualEffects("reduced")}
          >
            {t("visualEffectsReduced")}
          </Button>
        </div>
      </Card>

      <Card filled className="mb-6">
        <SectionHeading className="mb-2">{t("tourHeading")}</SectionHeading>
        <p className="mb-4 text-sm text-muted">{t("tourDescription")}</p>
        <Button variant="chrome" className="w-fit" onClick={onReplayTour}>
          {t("replayTour")}
        </Button>
      </Card>

      <Card filled className="mb-6">
        <SectionHeading className="mb-2">{t("updatesHeading")}</SectionHeading>
        <p className="mb-1 text-sm text-muted">{t("updatesDescription")}</p>
        {appVersion && <p className="mb-4 text-sm text-muted">{t("currentVersion", { version: appVersion })}</p>}

        {updateState.kind === "available" && (
          <div className="mb-3 rounded-lg border border-accent bg-fill p-3">
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
          <Button variant="chrome" disabled={updateState.kind === "checking" || updateState.kind === "installing"} onClick={checkForUpdates}>
            {updateState.kind === "checking" ? t("checkingUpdates") : t("checkUpdates")}
          </Button>
          {updateState.kind === "available" && (
            <Button variant="primary" onClick={installUpdate}>
              {t("installUpdate")}
            </Button>
          )}
        </div>
      </Card>

      <Card filled className="mb-6">
        <SectionHeading className="mb-2">{t("controllersHeading")}</SectionHeading>
        <p className="mb-4 text-sm text-muted">{t("controllersDescription")}</p>

        <div className="mb-4 flex flex-wrap gap-3">
          <Button variant="primary" className="w-fit" onClick={onOpenConfigureController}>
            {t("configureControllerButton")}
          </Button>
          <Button variant="chrome" className="w-fit" onClick={onOpenControllerTest}>
            {t("testControllerButton")}
          </Button>
        </div>

        {emulators === null && <p className="text-sm text-muted">{t("loadingEmulatorsForControllers")}</p>}

        {emulators !== null &&
          (() => {
            const checkable = emulators.filter((e) => e.installed && e.controller_check);
            if (checkable.length > 0) {
              return (
                <div className="mb-6">
                  {/* Redesenho arcade/CRT (2026-09-09): subtítulo de bloco no mesmo
              vocabulário de kicker monoespaçado do resto do app, no lugar do
              `text-primary` (roxo reservado a ação). */}
          <h3 className="mb-2 font-mono text-xs tracking-wider text-muted uppercase">{t("guidedSetupHeading")}</h3>
                  <GamepadStatusLine />
                  <div className="mt-3 flex flex-col gap-3">
                    {checkable.map((emulator) => (
                      <GuidedControllerSetupStep key={emulator.adapter_id} emulator={emulator} />
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}

        {emulators !== null &&
          (() => {
            const bindable = emulators.filter((e) => e.installed && e.bindable);
            if (bindable.length === 0) {
              return <EmptyState variant="inline" title={t("noBindableEmulators")} />;
            }
            return (
              <div>
                <h3 className="mb-2 font-mono text-xs tracking-wider text-muted uppercase">{t("manualMappingHeading")}</h3>
                <div className="flex flex-col gap-3">
                  {bindable.map((emulator) => (
                    <div key={emulator.adapter_id}>
                      <Button
                        variant="chrome"
                        className="w-fit"
                        onClick={() =>
                          setExpandedAdapterId((id) => (id === emulator.adapter_id ? null : emulator.adapter_id))
                        }
                      >
                        {emulator.name} · {expandedAdapterId === emulator.adapter_id ? t("hideManualMapping") : t("manualMappingButton")}
                      </Button>
                      {expandedAdapterId === emulator.adapter_id && (
                        <div className="mt-3">
                          <EmulatorBindingsPanel adapterId={emulator.adapter_id} adapterName={emulator.name} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
      </Card>

      <Card filled className="mb-6">
        <SectionHeading className="mb-2">{t("installationHeading")}</SectionHeading>
        <p className="mb-4 text-sm text-muted">
          {t("installationDescription")}
        </p>

        {systemInfo.kind === "loading" && <p className="text-sm text-muted">{t("locatingFolder")}</p>}
        {systemInfo.kind === "error" && <InlineError>{systemInfo.message}</InlineError>}

        {systemInfo.kind === "loaded" && (
          <div className="flex flex-col gap-3">
            <p className="break-all rounded-lg border border-line bg-fill px-3 py-2 font-mono text-xs text-ink">
              {systemInfo.info.app_data_dir}
            </p>
            {pathError && <InlineError>{pathError}</InlineError>}
            {/* `chrome` (2026-09-07): abrir pasta é chrome de arquivo em
                toda tela do app — ver a variante em components/ui.tsx. */}
            <Button variant="chrome" onClick={openInstallFolder} className="w-fit">
              {t("openInstallFolder")}
            </Button>
          </div>
        )}
      </Card>

      <Card filled className="mb-6">
        <SectionHeading className="mb-2">{t("uninstallHeading")}</SectionHeading>

        {systemInfo.kind === "loaded" && systemInfo.info.os === "windows" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              {t("uninstallWindowsDescription")}
            </p>
            {uninstallError && <InlineError>{uninstallError}</InlineError>}
            <Button variant="chrome" onClick={openWindowsUninstall} className="w-fit">
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

      <Card filled>
        <SectionHeading className="mb-2">{t("igdbHeading")}</SectionHeading>
        <p className="mb-4 text-sm text-muted">
          {t("igdbDescription")}
        </p>

        {state.kind === "loading" && <p className="text-sm text-muted">{t("readingAccountStatus")}</p>}

        {state.kind === "error" && (
          <div>
            <InlineError className="mb-2">{state.message}</InlineError>
            <Button variant="chrome" onClick={loadStatus}>
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
              // Vermelho já em repouso (mesmo padrão de "Remover" em
              // Emuladores/Biblioteca): desconectar apaga a credencial pessoal.
              // A cor não é o único sinal — o rótulo diz "Desconectar" e o
              // `ConfirmModal` confirma —, então não viola 1.4.1.
              <Button
                type="button"
                variant="chrome"
                className={CHROME_TINT_DANGER}
                onClick={() => setConfirmingDisconnect(true)}
              >
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
                conectar a própria conta e sair da cota compartilhada.

                Achado real, 2026-09-08: essa credencial de teste só existe
                em builds oficiais do release (injetada via ldflags a partir
                de GitHub Secrets) — um build local sem essas variáveis de
                ambiente chega aqui com `configured: false`, e dizer
                "já funciona sem configurar nada" seria falso nesse caso
                (busca de capa que dependa do IGDB fica sem fonte nenhuma até
                conectar uma conta própria abaixo; libretro-thumbnails
                continua funcionando do mesmo jeito, sem depender disto). */}
            <p className="text-sm text-ink">
              {state.configured ? t("usingTestCredential") : t("noTestCredential")}
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

/** Linha de status do controle detectado, acima dos passos guiados — reusa
 * o mesmo hook que ControllerTestScreen já usa (Gamepad API da WebView). */
function GamepadStatusLine() {
  const t = useT(dict);
  const gamepad = useGamepad();
  return (
    <p className="text-sm text-muted">
      {gamepad.connected ? t("guidedSetupDetectedController", { name: gamepad.name ?? "" }) : t("guidedSetupNoController")}
    </p>
  );
}

type VerifyState = { kind: "idle" } | { kind: "checking" } | { kind: "done"; configured: boolean } | { kind: "error"; message: string };

/**
 * Um passo do fluxo guiado "Configurar controle" (2026-09-08): abre o
 * emulador real, mostra a instrução fixa daquele app, e confirma lendo o
 * arquivo dele via GET .../controller-status — o ZeuX nunca escreve o bind
 * de botão físico sozinho, cada emulador resolve isso do jeito nativo dele.
 */
function GuidedControllerSetupStep({ emulator }: { emulator: EmulatorEntry }) {
  const t = useT(dict);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ kind: "idle" });

  const instructionKey = GUIDED_SETUP_INSTRUCTION_KEYS[emulator.adapter_id];

  async function openEmulator() {
    setOpening(true);
    setOpenError(null);
    try {
      await api.openEmulator(emulator.adapter_id);
    } catch (err) {
      setOpenError(
        err instanceof ApiError ? err.message : t("guidedSetupOpenError", { emulator: emulator.name }),
      );
    } finally {
      setOpening(false);
    }
  }

  async function verifyStatus() {
    setVerify({ kind: "checking" });
    try {
      const { configured } = await api.getControllerStatus(emulator.adapter_id);
      setVerify({ kind: "done", configured });
    } catch (err) {
      setVerify({ kind: "error", message: err instanceof ApiError ? err.message : t("guidedSetupCheckError") });
    }
  }

  return (
    <Card filled dense>
      <p className="mb-2 font-semibold text-ink">{emulator.name}</p>
      {instructionKey && <p className="mb-3 text-sm text-muted">{t(instructionKey)}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="chrome" disabled={opening} onClick={openEmulator}>
          {opening ? t("guidedSetupOpening") : t("guidedSetupOpenButton", { emulator: emulator.name })}
        </Button>
        <Button variant="chrome" disabled={verify.kind === "checking"} onClick={verifyStatus}>
          {verify.kind === "checking" ? t("guidedSetupVerifying") : t("guidedSetupVerifyButton")}
        </Button>
        {verify.kind === "done" &&
          (verify.configured ? (
            <Badge variant="solid">{t("guidedSetupConfigured")}</Badge>
          ) : (
            <Badge variant="warn">{t("guidedSetupNotConfiguredYet")}</Badge>
          ))}
      </div>
      {openError && <InlineError>{openError}</InlineError>}
      {verify.kind === "error" && <InlineError>{verify.message}</InlineError>}
    </Card>
  );
}
