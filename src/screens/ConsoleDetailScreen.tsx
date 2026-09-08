import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { Pencil } from "lucide-react";
import { api, ApiError, consoleImageURL } from "../api";
import type {
  ConsoleEmulatorOption,
  ConsoleEntry,
  EmulatorEntry,
  EmulatorSource,
  LibraryFolder,
  Report,
  RetroArchCoreStatus,
} from "../api/types";
import {
  BackButton,
  Badge,
  Button,
  Callout,
  Card,
  CardSkeleton,
  ConfirmModal,
  ConsoleVerdictCard,
  consoleIconLabel,
  InlineError,
  ProgressBar,
  ScreenContainer,
  SectionHeading,
} from "../components/ui";
import { EmulatorBindingsPanel } from "../components/EmulatorBindingsPanel";
import { EmulatorConfigPanel } from "../components/EmulatorConfigPanel";
import { useCoreInstall } from "../hooks/useCoreInstall";
import { useEmulatorInstall } from "../hooks/useEmulatorInstall";
import { consoleAccentColor } from "../lib/consoleColor";
import { percentOf } from "../lib/format";
import { buildReadinessIndex, evaluateConsoleReadiness } from "../lib/consoleReadiness";
import { useT } from "../i18n/i18n";
import { dict } from "./ConsoleDetailScreen.i18n";

// D2 (docs/roadmap.md) — calibrar os limiares do catálogo — segue aberto: os
// campos `requires` de consoles.json são estimativas escritas a partir de
// conhecimento geral, nunca medidas em hardware real. Migrado de
// VerdictScreen.tsx (2026-09-07) junto com o próprio parecer, que deixou de
// ter uma grade dedicada — este é hoje o único lugar do produto que mostra
// `ConsoleVerdictCard`, então é aqui que o aviso precisa estar. Vira `true`
// quando o D2 fechar.
const THRESHOLDS_CALIBRATED = false;

/**
 * Uma forma de rodar este console. Cada opção é um card: o que é, se está
 * instalada, o core que ela precisa (quando carrega cores) e as ações.
 *
 * Os 5 consoles com mais de uma opção (ps1, n64, dreamcast, psp, nds) são o
 * motivo de isto ser uma lista e não um bloco só. A ordem vem do servidor e
 * **não** é reordenada aqui — a preferência por emulador dedicado é regra de
 * produto e mora em `Registry.ForConsole`.
 */
function EmulatorOptionCard({
  option,
  entry,
  source,
  core,
  isChosen,
  onChanged,
}: {
  option: ConsoleEmulatorOption;
  /** Ausente só se `GET /emulators` não conhecer este adapter — não deveria acontecer. */
  entry?: EmulatorEntry;
  source?: EmulatorSource;
  /** Estado do core que este console pede. Ausente para emulador standalone. */
  core?: RetroArchCoreStatus;
  /** Esta é a opção que o ZeuX usaria hoje (a primeira instalada). */
  isChosen: boolean;
  onChanged: () => void;
}) {
  const t = useT(dict);
  const { state, setState, install, remove } = useEmulatorInstall({ adapterId: option.adapter_id, onChanged });
  const coreInstall = useCoreInstall({ onCoreReady: onChanged });
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showBindings, setShowBindings] = useState(false);
  const [verificando, setVerificando] = useState(false);
  // Só depois de uma verificação que não achou nada — no primeiro carregamento
  // a ausência é o estado esperado, não um resultado a comentar.
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const installed = entry?.installed ?? false;
  // Só faz sentido remover o que o ZeuX colocou na pasta gerenciada — o
  // emulador que o usuário já tinha por conta própria não é nosso para apagar.
  const canRemove = installed && entry?.installation?.managed;

  async function openStandalone() {
    setOpening(true);
    setOpenError(null);
    try {
      await api.openEmulator(option.adapter_id);
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : t("couldNotOpenEmulator"));
    } finally {
      setOpening(false);
    }
  }

  async function abrirPastaGerenciada() {
    if (!entry?.managed_dir) return;
    setOpenError(null);
    try {
      await openPath(entry.managed_dir);
    } catch (err) {
      setOpenError(
        t("couldNotOpenFolder", { error: err instanceof Error ? err.message : String(err) }) + ". " +
          t("createFolderIfNotExists"),
      );
    }
  }

  // Reconsulta o disco. `GET /emulators` roda o Survey a cada chamada, então
  // recarregar já é a verificação — o que faltava era um jeito de pedir isso
  // sem sair da tela, e um retorno dizendo o que aconteceu.
  async function verificarInstalacao() {
    setVerificando(true);
    setNaoEncontrado(false);
    try {
      const res = await api.getEmulators();
      const achou = res.emulators.find((e) => e.adapter_id === option.adapter_id)?.installed ?? false;
      if (achou) {
        onChanged();
      } else {
        setNaoEncontrado(true);
      }
    } catch {
      // Falhar em verificar não merece um erro na cara: o botão continua ali
      // para tentar de novo, e nada do estado da tela mudou.
      setNaoEncontrado(true);
    } finally {
      setVerificando(false);
    }
  }

  const coreState = option.core ? coreInstall.stateFor(option.core) : { kind: "idle" as const };
  const corePercent =
    coreState.kind === "installing" || coreState.kind === "canceling" ? percentOf(coreState.job) : null;

  return (
    <Card
      className="flex flex-col gap-3"
      // Barra esquerda de 3px, não a borda inteira em roxo (2026-09-07): o
      // contorno roxo fechado lia como "selecionado/em foco", competindo com o
      // botão primário dentro do próprio card. A barra lateral é o mesmo
      // vocabulário de marcação que `ConsoleVerdictCard`/`EmulatorCard` usam
      // para identidade, aqui com `--accent` porque quem marca é o ZeuX.
      style={isChosen ? { borderLeftColor: "var(--accent)", borderLeftWidth: 3 } : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{option.name}</p>
          {/* Diz o que o ZeuX faria sem o usuário escolher nada — a resposta
              para "e se eu tiver os dois instalados?" nos 5 consoles onde
              isso é possível. Só aparece quando há mais de uma opção; num
              console de emulador único seria ruído. */}
          {isChosen && <p className="text-xs text-accent">{t("isChosenEmulator")}</p>}
        </div>
        <span className="shrink-0 whitespace-nowrap">
          {installed ? (
            <Badge variant="solid">{entry?.installation?.managed ? t("installedByZeuxBadge") : t("alreadyInstalledBadge")}</Badge>
          ) : (
            <Badge>{t("notInstalledBadge")}</Badge>
          )}
        </span>
      </div>

      {/* O core é a peça que falta com mais frequência: o RetroArch pode
          estar instalado e o core deste console não, e aí o jogo não abre.
          Fica no card da opção, e não numa seção separada, porque é
          propriedade dela — um standalone não tem core nenhum. */}
      {option.core && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-fill px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">{t("coreForConsole")}</span>
            <span className="font-mono text-sm text-ink">{option.core}</span>
            <Badge variant={core?.installed ? "solid" : undefined}>{core?.installed ? t("downloadedBadge") : t("missingBadge")}</Badge>

            {!core?.installed && coreState.kind === "idle" && (
              <Button
                variant="secondary"
                className="ml-auto shrink-0 px-2 py-1 text-xs"
                onClick={() => coreInstall.installCore(option.core!)}
              >
                {t("downloadCore")}
              </Button>
            )}
            {coreState.kind === "starting" && <span className="ml-auto text-xs text-muted">{t("starting")}</span>}
          </div>

          {(coreState.kind === "installing" || coreState.kind === "canceling") && (
            <div className="flex items-center gap-1.5">
              <ProgressBar className="flex-1" percent={corePercent} label={t("downloadCore")} />
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {corePercent === null ? coreState.job.phase : `${corePercent}%`}
              </span>
              <Button
                variant="quiet"
                className="shrink-0 px-1.5 py-0.5 text-xs"
                disabled={coreState.kind === "canceling"}
                onClick={() => coreInstall.cancelCore(option.core!, coreState.job)}
              >
                {coreState.kind === "canceling" ? t("canceling") : t("cancel")}
              </Button>
            </div>
          )}

          {coreState.kind === "error" && <InlineError>{coreState.message}</InlineError>}

          {/* Descritivo, nunca cobrança: o modelo sob demanda (ADR 0015) baixa
              o core sozinho ao abrir um jogo, então um core ausente não é
              pendência do usuário — é o comportamento normal. */}
          {!core?.installed && coreState.kind === "idle" && (
            <p className="text-xs text-muted">
              {t("coreAutoDownload")}
            </p>
          )}
        </div>
      )}

      {state.kind === "confirm-hardware" && (
        <ConfirmModal
          title={t("hardwareBelowRecommended")}
          message={state.message}
          onClose={() => setState({ kind: "idle" })}
          actions={
            <>
              <Button variant="secondary" onClick={() => setState({ kind: "idle" })}>
                {t("cancel")}
              </Button>
              <Button variant="primary" autoFocus onClick={() => install(true)}>
                {t("installAnyway")}
              </Button>
            </>
          }
        />
      )}

      {state.kind === "confirm-remove" && (
        <ConfirmModal
          title={t("removeEmulatorTitle")}
          message={t("removeEmulatorMessage", { emulatorName: option.name })}
          onClose={() => setState({ kind: "idle" })}
          actions={
            <>
              <Button variant="secondary" onClick={() => setState({ kind: "idle" })}>
                {t("cancel")}
              </Button>
              <Button variant="danger" autoFocus onClick={remove}>
                {t("removeAnyway")}
              </Button>
            </>
          }
        />
      )}

      {(state.kind === "installing" || state.kind === "done") && (
        <div>
          <p className="text-sm text-muted">
            {state.job.phase}
            {state.job.asset_name ? ` · ${state.job.asset_name}` : ""}
          </p>
          {state.kind === "installing" && (
            <div className="mt-1">
              <ProgressBar percent={percentOf(state.job)} label={`Instalando ${option.name}`} />
            </div>
          )}
        </div>
      )}

      {state.kind === "error" && <InlineError>{state.message}</InlineError>}
      {state.kind === "remove-error" && <InlineError>{state.message}</InlineError>}
      {openError && <InlineError>{openError}</InlineError>}

      {/* Fontes "manual" (RetroArch e Dolphin) não distribuem por releases do
          GitHub — não há como o ZeuX resolver a versão mais recente por API
          (docs/adapters.md). Em vez de um botão "Instalar" que sempre falha,
          abre o site oficial e mostra a pasta onde extrair para o ZeuX
          encontrar sozinho depois (achado real, 2026-08-17). */}
      {!installed && source?.kind === "manual" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">{source.reason}</p>
          <p className="text-sm text-muted">
            {t("extractManualInstall", { emulatorName: option.name })}
          </p>
          {entry?.managed_dir && (
            <>
              <p className="break-all rounded-lg border border-line bg-fill px-3 py-2 font-mono text-xs text-ink select-all">
                {entry.managed_dir}
              </p>
              <div className="flex flex-wrap gap-2">
                {/* A pasta pode não existir ainda — o `openPath` do Tauri
                    falharia, e "criar" é o que o usuário faria em seguida de
                    qualquer jeito. Só aparece para instalação manual: nos
                    outros o ZeuX cria a pasta ele mesmo ao instalar. */}
                {/* `chrome` (2026-09-07): botão de pasta. O `px-2 py-1
                    text-xs` que estava aqui à mão era, na prática, um
                    "chrome" improvisado — a variante agora traz essa
                    geometria (e a borda que faltava). */}
                <Button variant="chrome" onClick={abrirPastaGerenciada}>
                  {t("openFolder")}
                </Button>
                {/* Q5 (docs/roadmap.md, Sprint Q): "o ZeuX confirmando sozinho
                    quando o binário aparecer". Sem isto, quem acabou de
                    extrair o RetroArch precisava sair da tela e voltar para o
                    app perceber — e não tinha como saber que era isso que
                    faltava fazer. */}
                {/* `chrome` pelo mesmo motivo do botão de pasta ao lado: os
                    dois estão na mesma fileira e vinham com a mesma
                    geometria improvisada em `className`. */}
                <Button
                  variant="chrome"
                  disabled={verificando}
                  onClick={verificarInstalacao}
                >
                  {verificando ? t("verifying") : t("alreadyInstalledVerify")}
                </Button>
              </div>
              {naoEncontrado && (
                <p className="text-xs text-muted">
                  {t("notFoundEmulator", { emulatorName: option.name })}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Q4 (docs/roadmap.md, Sprint Q): configuração e mapeamento passam a ser
          alcançáveis daqui. Até então só existiam na tela de Emuladores — que
          deixou de ser a entrada principal na Sprint P, deixando o caminho
          para "mapear o controle deste console" atrás de uma tela que o
          usuário não visita mais. `configurable`/`bindable` vêm de
          GET /emulators e dizem a capacidade real de cada adapter (hoje só
          PCSX2 e RetroArch), em vez de a tela tentar a rota e tratar erro. */}
      {installed && (entry?.configurable || entry?.bindable) && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {entry.configurable && (
              <Button variant="secondary" onClick={() => setShowConfig((v) => !v)}>
                {showConfig ? t("hideConfig") : t("config")}
              </Button>
            )}
            {entry.bindable && (
              <Button variant="secondary" onClick={() => setShowBindings((v) => !v)}>
                {showBindings ? t("hideBindings") : t("mapControls")}
              </Button>
            )}
          </div>
          {showConfig && entry.configurable && (
            <EmulatorConfigPanel adapterId={option.adapter_id} adapterName={option.name} />
          )}
          {showBindings && entry.bindable && (
            <EmulatorBindingsPanel adapterId={option.adapter_id} adapterName={option.name} />
          )}
        </div>
      )}

      {/* Degrada visivelmente (H5) em vez de simplesmente não ter botão: o
          usuário precisa saber que aquele emulador ainda se configura por
          fora, não ficar procurando um botão que nunca existiu. */}
      {installed && !entry?.configurable && !entry?.bindable && (
        <p className="text-xs text-muted">
          {t("configureElsewhereMessage", { emulatorName: option.name })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {installed ? (
          <>
            <Button
              variant="primary"
              disabled={opening}
              onClick={openStandalone}
              title={t("openEmulatorTooltip")}
            >
              {opening ? t("opening") : t("openEmulatorSettings")}
            </Button>
            {canRemove && (
              <Button
                variant="secondary"
                disabled={state.kind === "removing"}
                onClick={() => setState({ kind: "confirm-remove" })}
              >
                {state.kind === "remove-error" ? t("retryRemove") : t("remove")}
              </Button>
            )}
          </>
        ) : source?.kind === "manual" ? (
          <Button variant="primary" onClick={() => openUrl(source.homepage)}>
            {t("openOfficialSite")}
          </Button>
        ) : state.kind === "installing" || state.kind === "done" || state.kind === "confirm-hardware" ? null : (
          <Button variant="primary" disabled={state.kind === "starting"} onClick={() => install(false)}>
            {state.kind === "error" ? t("retryInstall") : t("install")}
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * A pasta com os jogos deste console. Apontar a pasta é a única das quatro
 * peças da prontidão que o ZeuX **não** pode resolver sozinho — o caminho
 * vem do seletor nativo do sistema, escolhido pelo usuário.
 *
 * É também o único lugar da tela que toca o disco fora de `%AppData%`: o
 * `plugin-dialog` não passa pela capability `opener:allow-open-path`
 * (restrita a `$CONFIG/**`) justamente porque quem escolhe é a pessoa.
 * Ver a Sprint P em docs/roadmap.md.
 */
function GamesFolderSection({
  consoleId,
  shortName,
  folders,
  onChanged,
  onOpenGames,
}: {
  consoleId: string;
  shortName: string;
  folders: LibraryFolder[];
  onChanged: () => void;
  onOpenGames?: () => void;
}) {
  const t = useT(dict);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<number | null>(null);

  useEffect(() => {
    if (folders.length === 0) {
      setCount(null);
      return;
    }
    api
      .getLibraryGames(consoleId)
      .then((res) => setCount(res.games.length))
      // Contagem é conveniência: falhar aqui não pode tirar do usuário os
      // botões de apontar/varrer a pasta.
      .catch(() => setCount(null));
  }, [consoleId, folders.length]);

  async function pickFolder() {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked !== "string") return;

    setBusy(true);
    setError(null);
    try {
      await api.addLibraryFolder(consoleId, picked);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("couldNotPointFolder"));
    } finally {
      setBusy(false);
    }
  }

  async function runFolderAction(action: Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action;
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
      setConfirmingRemove(null);
    }
  }

  return (
    <Card filled className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">{t("gamesForConsole", { shortName })}</p>
        {count !== null && (
          <span className="text-sm text-muted">
            {count === 1 ? t("gameCountSingular") : t("gameCountPlural", { count })}
          </span>
        )}
      </div>

      {error && <InlineError>{error}</InlineError>}

      {folders.length === 0 ? (
        <p className="text-sm text-muted">
          {t("noFoldersAssigned")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {folders.map((folder) => (
            <li key={folder.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-muted" title={folder.path}>
                {folder.path}
              </span>
              <span className="flex shrink-0 gap-1">
                {/* "Revarrer", não "Varrer de novo" (achado testando com o
                    Douglas, 2026-09-06): mesma ação que LibraryScreen/
                    GameDetailScreen já chamam de "Revarrer"/"Revarrer
                    pasta" — duas frases diferentes pra a mesma coisa em
                    telas diferentes. */}
                <Button
                  variant="quiet"
                  disabled={busy}
                  onClick={() => runFolderAction(api.rescanLibraryFolder(folder.id), t("couldNotScanFolder"))}
                >
                  {t("rescan")}
                </Button>
                <Button variant="quiet" disabled={busy} onClick={() => setConfirmingRemove(folder.id)}>
                  {t("remove")}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {confirmingRemove !== null && (
        <ConfirmModal
          title={t("removeFolderTitle")}
          message={t("removeFolderMessage")}
          onClose={() => setConfirmingRemove(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setConfirmingRemove(null)}>
                {t("cancel")}
              </Button>
              <Button
                variant="danger"
                autoFocus
                onClick={() =>
                  runFolderAction(api.removeLibraryFolder(confirmingRemove), t("couldNotRemoveFolder"))
                }
              >
                {t("removeAnyway")}
              </Button>
            </>
          }
        />
      )}

      <div className="flex flex-wrap gap-2">
        {/* Sem pasta nenhuma, apontar uma é O que a tela pede — segue
            `primary` (guideline `primary-action`: um CTA primário por tela).
            Já tendo pasta, apontar outra vira chrome de arquivo, como os
            outros botões de pasta do app. */}
        <Button variant={folders.length === 0 ? "primary" : "chrome"} disabled={busy} onClick={pickFolder}>
          {folders.length === 0 ? t("chooseFolder") : t("assignAnotherFolder")}
        </Button>
        {onOpenGames && folders.length > 0 && (
          <Button variant="secondary" onClick={onOpenGames}>
            {t("seeGames")}
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * O BIOS/firmware do console, quando o ZeuX sabe onde o emulador escolhido lê
 * o arquivo.
 *
 * **O que esta seção deliberadamente não faz:** apontar uma pasta por
 * convenção. `BiosDir` (internal/emulator/bios_dir.go) só responde para
 * DuckStation instalado pelo ZeuX e PCSX2 no Linux — nos demais casos o
 * caminho nunca foi verificado contra o emulador rodando, e uma pasta errada
 * é pior que nenhuma: o usuário coloca o arquivo, o jogo continua não
 * abrindo, e agora ele nem sabe mais por quê. Console marcado
 * `requires_external_file` sem pasta conhecida recebe o aviso genérico, sem
 * caminho — princípio 4 do CLAUDE.md.
 *
 * O ZeuX também nunca sugere onde obter o arquivo. Ver o princípio 6.
 */
function BiosSection({ entry, requiresExternalFile }: { entry?: EmulatorEntry; requiresExternalFile: boolean }) {
  const t = useT(dict);
  const [error, setError] = useState<string | null>(null);

  if (!entry?.bios_dir) {
    if (!requiresExternalFile) return null;
    return (
      <Card filled className="flex flex-col gap-2">
        <p className="font-semibold text-ink">{t("biosFireware")}</p>
        <p className="text-sm text-muted">
          {t("biosRequired")}
        </p>
        {/* Dois motivos diferentes para não haver pasta, e dizer "o ZeuX não
            sabe" nos dois seria impreciso no primeiro: sem emulador instalado
            a pasta não é desconhecida, ela ainda não existe — depende de qual
            emulador for instalado. Achado ao ver a tela do PS1 de verdade
            (2026-08-28), que caía no texto de "não sabe" com nada instalado. */}
        <p className="text-sm text-muted">
          {entry
            ? t("biosPathUnknown", { emulatorName: entry.name })
            : t("biosDependsOnEmulator")}
        </p>
      </Card>
    );
  }

  async function openBiosFolder() {
    setError(null);
    try {
      await openPath(entry!.bios_dir!);
    } catch (err) {
      setError(t("couldNotOpenBiosFolder", { error: err instanceof Error ? err.message : String(err) }));
    }
  }

  return (
    <Card filled className="flex flex-col gap-2">
      <p className="font-semibold text-ink">{t("biosFireware")}</p>
      {entry.bios_dir_empty && (
        <Callout label={t("biosAbsent")}>
          {t("biosAbsentMessage", { emulatorName: entry.name })}
        </Callout>
      )}
      <p className="break-all rounded-lg border border-line bg-panel px-3 py-2 font-mono text-xs text-ink select-all">
        {entry.bios_dir}
      </p>
      {error && <InlineError>{error}</InlineError>}
      <Button type="button" variant="chrome" className="w-fit" onClick={openBiosFolder}>
        {t("openBiosFolder")}
      </Button>
    </Card>
  );
}

/**
 * Detalhe de um console (P2, docs/roadmap.md, Sprint P): tudo que este console
 * precisa para rodar, num lugar só — as formas de rodá-lo, o core, o BIOS e a
 * pasta de jogos.
 *
 * Busca sozinha em vez de receber a `ConsoleEntry` da lista: assim a tela
 * sobrevive a um reload e às ações que mudam o estado (instalar, baixar core,
 * apontar pasta) sem depender de o pai revalidar. `reload` é o único caminho
 * de atualização — cada seção o chama ao mudar algo, e a prontidão do topo
 * reflete a mudança na mesma volta.
 *
 * As quatro buscas são de tela inteira, nenhuma por opção de emulador; a
 * prontidão reusa `evaluateConsoleReadiness`, a mesma da lista, para as duas
 * telas nunca discordarem sobre o que falta.
 */
export function ConsoleDetailScreen({
  consoleId,
  report,
  onBack,
  onOpenGames,
}: {
  consoleId: string;
  report?: Report;
  onBack: () => void;
  /** Ausente sem parecer carregado — `GamesScreen` exige o preset. */
  onOpenGames?: () => void;
}) {
  const t = useT(dict);
  const [entry, setEntry] = useState<ConsoleEntry | null>(null);
  const [emulators, setEmulators] = useState<EmulatorEntry[]>([]);
  const [sources, setSources] = useState<Record<string, EmulatorSource>>({});
  const [cores, setCores] = useState<RetroArchCoreStatus[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [error, setError] = useState<string | null>(null);
  // `has_image` falso é o estado padrão até alguém rodar
  // cmd/generate-console-images; este estado cobre o caso raro do arquivo
  // embutido existir mas o <img> falhar em runtime. Os dois caem na sigla,
  // nunca num espaço quebrado — mesma rede de segurança de `ConsolesScreen`.
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  // 2026-09-08: troca manual de logo (a pedido do Douglas — a busca
  // automática do IGDB erra a variante com frequência, ver
  // internal/verdict/data/console-images/README.md). `imageVersion` força o
  // <img> a recarregar depois de trocar/restaurar: o servidor já manda
  // `Cache-Control: no-store`, mas o navegador ainda reaproveita a última
  // imagem carregada para o mesmo `src` sem esse empurrão.
  const [imageVersion, setImageVersion] = useState(0);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  async function handleChangeImage() {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: t("imageFileFilter"), extensions: ["png", "jpg", "jpeg"] }],
    });
    if (typeof picked !== "string") return;

    setImageBusy(true);
    setImageError(null);
    try {
      await api.setConsoleImage(consoleId, picked);
      setHeroImageFailed(false);
      setImageVersion((v) => v + 1);
      reload(); // has_image pode virar true se o console não tinha imagem nenhuma antes
    } catch (err) {
      setImageError(err instanceof ApiError ? err.message : t("couldNotChangeImage"));
    } finally {
      setImageBusy(false);
    }
  }

  async function handleResetImage() {
    setImageBusy(true);
    setImageError(null);
    try {
      await api.resetConsoleImage(consoleId);
      setHeroImageFailed(false);
      setImageVersion((v) => v + 1);
      reload();
    } catch (err) {
      setImageError(err instanceof ApiError ? err.message : t("couldNotChangeImage"));
    } finally {
      setImageBusy(false);
    }
  }

  const reload = useCallback(() => {
    api
      .getConsoles()
      .then((res) => {
        const found = res.consoles.find((c) => c.console_id === consoleId);
        if (!found) {
          setError(t("consoleNotInCatalog", { consoleId }));
          return;
        }
        setEntry(found);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("couldNotLoadConsole")));

    // As três abaixo só enriquecem a tela: falhar numa delas degrada o que
    // ela mostra, nunca troca a tela inteira por um erro.
    api.getEmulators().then((res) => setEmulators(res.emulators)).catch(() => {});
    api.getRetroArchCores().then((res) => setCores(res.cores)).catch(() => {});
    api.getLibraryFolders().then((res) => setFolders(res.folders)).catch(() => {});
  }, [consoleId]);

  useEffect(() => {
    reload();
    // As fontes de download não mudam em tempo de execução (catálogo embutido)
    // — buscadas uma vez, fora do `reload`.
    api
      .getEmulatorSources()
      .then((res) => setSources(Object.fromEntries(res.sources.map((s) => [s.adapter_id, s]))))
      .catch(() => {});
  }, [reload]);

  if (error) {
    return (
      <ScreenContainer variant="listing">
        {/* O achado de 2026-09-06 continua valendo — este botão precisa de
            borda, `quiet` (sem borda nenhuma) lia como texto solto no topo
            da tela. O que mudou em 2026-09-07 é só de onde a borda vem:
            `BackButton` (variante `chrome`), o mesmo componente das outras
            cinco telas, em vez de `secondary` copiado à mão. */}
        <BackButton label={t("backConsoles")} onClick={onBack} />
        <div className="mt-4">
          <InlineError>{error}</InlineError>
        </div>
      </ScreenContainer>
    );
  }

  if (!entry) {
    return (
      <ScreenContainer variant="listing">
        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          <span className="sr-only">{t("loadingConsole")}</span>
          <CardSkeleton className="h-24" />
          <CardSkeleton className="h-48" />
        </div>
      </ScreenContainer>
    );
  }

  const index = buildReadinessIndex(emulators, cores, folders);
  const readiness = evaluateConsoleReadiness(entry, index);
  const emulatorById = new Map(emulators.map((e) => [e.adapter_id, e]));
  const coreByName = new Map(cores.map((c) => [c.name, c]));
  const consoleFolders = folders.filter((f) => f.console_id === consoleId);
  const verdict = report?.verdicts.find((v) => v.console_id === consoleId);
  const accent = consoleAccentColor(consoleId);
  const chosenEntry = readiness.chosen ? emulatorById.get(readiness.chosen.adapter_id) : undefined;
  const showHeroImage = entry.has_image && !heroImageFailed;
  const requiresExternalFile = entry.requires_external_file ?? false;

  /**
   * A trilha das quatro peças, derivada do MESMO dado que as seções abaixo já
   * mostram — nenhuma regra de prontidão nova, nenhuma chamada nova.
   *
   * Existe por causa do princípio 3 do CLAUDE.md: `readiness.detail` nomeia a
   * peça que barra AGORA, mas não diz onde ela fica na sequência nem o que já
   * está resolvido — o usuário resolvia o emulador, voltava, e a frase trocava
   * por outra sem que ele visse que tinha avançado. A trilha mostra a
   * sequência inteira de uma vez.
   *
   * O estado "desconhecido" não é enfeite: `BiosDir` só responde para alguns
   * casos verificados ao vivo (ver `BiosSection` abaixo), e afirmar "no lugar"
   * ou "falta" nesses casos seria fingir certeza — princípio 4. Cada chip diz
   * o estado por escrito, além da cor, porque cor sozinha não é informação.
   */
  type TrailState = "ok" | "pendente" | "desconhecido" | "na";
  const emulatorState: TrailState = readiness.chosen ? "ok" : "pendente";
  const coreState: TrailState = !readiness.chosen
    ? "desconhecido" // depende de qual emulador for instalado
    : !readiness.chosen.core
      ? "na"
      : coreByName.get(readiness.chosen.core)?.installed
        ? "ok"
        : "pendente";
  const biosState: TrailState = !requiresExternalFile
    ? "na"
    : !chosenEntry?.bios_dir
      ? "desconhecido"
      : chosenEntry.bios_dir_empty
        ? "pendente"
        : "ok";
  const folderState: TrailState = consoleFolders.length > 0 ? "ok" : "pendente";

  const trail: { label: string; state: TrailState }[] = [
    { label: t("trailEmulator"), state: emulatorState },
    { label: t("trailCore"), state: coreState },
    { label: t("trailBios"), state: biosState },
    { label: t("trailFolder"), state: folderState },
  ];
  const trailStateLabel: Record<TrailState, string> = {
    ok: t("trailStateOk"),
    pendente: t("trailStatePending"),
    desconhecido: t("trailStateUnknown"),
    na: t("trailStateNotApplicable"),
  };
  // Ciano = "o sistema informa que está resolvido"; roxo = "aqui você age";
  // âmbar = o mesmo tom que `PartialNotice`/`Callout` já usam para dado não
  // verificável. Nenhuma cor nova entra no projeto.
  const trailStateClass: Record<TrailState, string> = {
    ok: "border-accent-secondary/60 text-accent-secondary",
    pendente: "border-accent text-accent",
    desconhecido: "border-amber-line text-muted",
    na: "border-line text-muted opacity-60",
  };

  return (
    <ScreenContainer variant="listing">
      <BackButton label={t("backConsoles")} onClick={onBack} />

      {/* Achado do critico-design (2026-09-06): a cor de identidade por
          console — o ativo de marca mais distintivo do projeto
          (`consoleColor.ts`, 33 entradas por fabricante) — só aparecia como
          uma borda de 3px em quatro telas. Esta é a única tela do produto
          com direito legítimo a uma cor própria dominando o espaço (é a
          página DESTE console); o gradiente usa o mesmo vocabulário do
          `AmbientGlow` do shell, só trocando `--accent` por `--console-accent`
          — vocabulário reaproveitado, não uma linguagem nova. Nenhum asset
          novo: o "ícone" ao lado do título é a mesma caixa/sigla que
          `ConsoleIcon` desenha em outras telas, só sem o `<button>` (não há
          o que abrir clicando no ícone da própria tela que já é dele). */}
      <div
        className="relative mt-3 mb-6 overflow-hidden rounded-lg border border-line p-5"
        // Borda esquerda de 3px na cor de identidade — o mesmo tratamento que
        // `ConsoleVerdictCard` e `EmulatorCard` já dão a uma linha de lista,
        // aplicado à tela que é DESTE console.
        style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
      >
        {/* A própria logo, gigante e desfocada, como arte de fundo — mesmo
            recurso que `GameHero` usa com a capa do jogo (`blur-3xl`, nunca
            um desfoque sutil). É o único asset de arte que esta tela tem, e
            sem ele o cabeçalho era um gradiente e nada mais. Só entra quando
            a logo existe de verdade: nos 3 consoles sem imagem cadastrada o
            gradiente abaixo continua sozinho, como antes. */}
        {showHeroImage && (
          <img
            src={consoleImageURL(consoleId, imageVersion || undefined)}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-10 h-72 w-72 object-contain opacity-40 blur-3xl saturate-[1.8]"
            onError={() => setHeroImageFailed(true)}
          />
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(65% 90% at 12% 25%, color-mix(in srgb, ${accent} 22%, transparent), transparent 70%)`,
          }}
        />
        <div className="relative flex items-center gap-4">
          {/* Achado desta sessão: quem clicava na logo oficial do console na
              grade caía numa tela que mostrava "NINT" em sigla — as duas
              telas exibiam identidades diferentes para o mesmo console. Mesma
              caixa de 64px com fundo branco de `ConsolesScreen`/`ConsoleIcon`
              (as logos do IGDB foram desenhadas para selo em fundo claro), e
              a sigla — via `consoleIconLabel`, não `slice(0, 4)` à mão, que
              ignorava o mapa de exceções do G5 — segue como fallback sobre
              `--fill`. */}
          <div className="relative shrink-0">
            <span
              aria-hidden="true"
              style={{ borderColor: `${accent}66`, color: accent, backgroundColor: showHeroImage ? "#fff" : undefined }}
              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border bg-fill font-pixel text-[11px] leading-none"
            >
              {showHeroImage ? (
                <img
                  src={consoleImageURL(consoleId, imageVersion || undefined)}
                  alt=""
                  className="h-14 w-14 object-contain p-0.5"
                  onError={() => setHeroImageFailed(true)}
                />
              ) : (
                consoleIconLabel(consoleId, entry.short_name)
              )}
            </span>
            {/* Troca manual de logo (2026-09-08): mesmo padrão visual de
                FavoriteToggle (botão circular pequeno flutuando sobre a
                arte) — aqui reposicionado no canto porque a caixa de 64px
                já é pequena, um botão do mesmo tamanho por cima escondia a
                logo inteira. */}
            <button
              type="button"
              disabled={imageBusy}
              onClick={handleChangeImage}
              aria-label={t("changeImage")}
              title={t("changeImage")}
              className="absolute -right-1.5 -bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-black/70 text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil size={11} aria-hidden="true" />
            </button>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ink">{entry.name}</h1>
            {/* `font-mono`: ano e sigla são dado de catálogo, não prosa — o
                mesmo tratamento que o ano recebeu no tile da grade, para as
                duas telas continuarem lendo como a mesma família. */}
            <p className="mt-1 font-mono text-sm tracking-wide text-muted">
              {t("consoleYearShortName", { year: entry.year, shortName: entry.short_name })}
            </p>
            {/* Só quando há uma logo de verdade (embutida ou customizada) —
                "restaurar padrão" sem nada pra restaurar seria uma ação sem
                efeito visível, mais confusa que útil. */}
            {showHeroImage && (
              <button
                type="button"
                disabled={imageBusy}
                onClick={handleResetImage}
                className="mt-1 font-mono text-xs tracking-wide text-muted underline decoration-dotted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("restoreDefaultImage")}
              </button>
            )}
          </div>
        </div>
        {imageError && (
          <p className="relative mt-2 text-sm text-danger">{imageError}</p>
        )}
      </div>

      {/* A prontidão abre a tela porque é a resposta à pergunta que trouxe o
          usuário aqui. Uma frase, e ela nomeia a peça que falta — nunca uma
          nota opaca (princípio 3). */}
      <Card
        className="mb-6 flex flex-col gap-3"
        filled
        // Barra esquerda na cor do papel, em repouso e não só no hover: ciano
        // quando não falta nada (o sistema informa), roxo enquanto há uma peça
        // a resolver (aqui você age). Mesmo par de papéis da paleta em
        // src/index.css.
        style={{
          borderLeftColor: readiness.step === "pronto" ? "var(--accent-secondary)" : "var(--accent)",
          borderLeftWidth: 3,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-base text-ink">{readiness.detail}</p>
          <span className="shrink-0 whitespace-nowrap">
            <Badge variant={readiness.step === "pronto" ? "solid" : "default"}>{readiness.badge}</Badge>
          </span>
        </div>

        <ul className="flex flex-wrap gap-1.5">
          {trail.map((piece) => (
            <li
              key={piece.label}
              className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-xs tracking-wide uppercase ${trailStateClass[piece.state]}`}
            >
              <span className="text-ink">{piece.label}</span>
              <span aria-hidden="true" className="opacity-40">
                ·
              </span>
              <span>{trailStateLabel[piece.state]}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* O6 (Sprint O) e a regra de layout responsivo do CLAUDE.md: coluna
          lateral com teto, nunca largura fixa; `lg` e não `xl` porque esta
          área já divide espaço com a sidebar.

          `BiosSection` mora na coluna esquerda, não na direita (achado
          testando com o Douglas, 2026-09-06): com um console de emulador só
          e ainda não instalado, a esquerda tinha só o card "Instalar" e a
          direita empilhava Jogos + BIOS + Nesta máquina — colunas
          visivelmente desbalanceadas, a direita bem mais alta que a
          esquerda. BIOS é requisito pra rodar, no mesmo grupo semântico do
          card do emulador ("o que este console precisa"); a direita fica
          só com "sobre a sua biblioteca/máquina" (Jogos + Nesta máquina). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(280px,360px)]">
        <div className="flex flex-col gap-3">
          {/* `SectionHeading`, não um `<h2>` montado à mão: os dois títulos
              desta tela eram a última cópia manual do degrau intermediário da
              escala (17px, caixa alta, ciano) que o componente já resolve. */}
          <SectionHeading>
            {entry.emulators.length === 1 ? t("howToRun") : t("howToRunOptions", { count: entry.emulators.length })}
          </SectionHeading>

          {entry.emulators.length === 0 ? (
            <Card filled>
              <p className="text-sm text-muted">
                {t("noEmulatorKnown", { consoleName: entry.name })}
              </p>
            </Card>
          ) : (
            entry.emulators.map((option) => (
              <EmulatorOptionCard
                key={option.adapter_id}
                option={option}
                entry={emulatorById.get(option.adapter_id)}
                source={sources[option.adapter_id]}
                core={option.core ? coreByName.get(option.core) : undefined}
                isChosen={entry.emulators.length > 1 && readiness.chosen?.adapter_id === option.adapter_id}
                onChanged={reload}
              />
            ))
          )}

          <BiosSection entry={chosenEntry} requiresExternalFile={requiresExternalFile} />
        </div>

        <aside className="flex flex-col gap-4">
          <GamesFolderSection
            consoleId={consoleId}
            shortName={entry.short_name}
            folders={consoleFolders}
            onChanged={reload}
            onOpenGames={onOpenGames}
          />

          {/* O parecer de hardware é a outra pergunta ("esta máquina
              aguenta?"), respondida pelo mesmo card que a tela de
              Especificações usa — nunca uma segunda formatação da mesma
              informação. Ausente sem consentimento/scan. */}
          {verdict && (
            <div className="flex flex-col gap-2">
              <SectionHeading>{t("onThisMachine")}</SectionHeading>
              <ConsoleVerdictCard verdict={verdict} />
              {!THRESHOLDS_CALIBRATED && (
                <Callout label={t("estimateLabel")}>{t("thresholdsNotCalibrated")}</Callout>
              )}
            </div>
          )}
        </aside>
      </div>
    </ScreenContainer>
  );
}
