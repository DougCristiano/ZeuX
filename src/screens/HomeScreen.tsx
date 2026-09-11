import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type {
  ConsoleEntry,
  ConsoleVerdict,
  EmulatorEntry,
  LibraryFolder,
  LibraryGame,
  Report,
  RetroArchCoreStatus,
} from "../api/types";
import {
  Button,
  ConfirmModal,
  EmptyState,
  ErrorModal,
  ManualInstallModal,
  ProgressBar,
  ScreenContainer,
  ScreenHeader,
  SectionHeading,
  Toast,
} from "../components/ui";
import { ConsoleCard } from "../components/ConsoleCard";
import { GameHero } from "../components/GameHero";
import { ManualEmulatorFormModal } from "../components/ManualEmulatorFormModal";
import { useInlineInstall } from "../hooks/useInlineInstall";
import { useLaunchGame } from "../hooks/useLaunchGame";
import { useToast } from "../hooks/useToast";
import { evaluateGameLaunchability } from "../lib/gameLaunchability";
import { buildReadinessIndex, evaluateConsoleReadiness } from "../lib/consoleReadiness";
import { isEmulatorMissingErrorCode } from "../lib/emulatorMissingError";
import { faseExtraDeDownload, formatPlaytimeClean, percentOf } from "../lib/format";
import { useT } from "../i18n/i18n";
import { dict } from "./HomeScreen.i18n";
import { openPath } from "@tauri-apps/plugin-opener";

/**
 * Home (A1, docs/pendencias.md — "página inicial de destaque"). Decidido pelo
 * Douglas em 2026-09-10: é sempre a tela de entrada da Biblioteca — mesmo sem
 * histórico nenhum, caso em que ela funciona como onboarding (o hero vira o
 * `EmptyState`, o resto some) em vez de existir uma tela separada só pra isso.
 * O item "Biblioteca" da sidebar abre esta tela; "Todos os jogos"
 * (`AllGamesScreen`) passa a ser alcançado a partir daqui ("Ver todos os
 * jogos"), não mais o destino direto do item.
 *
 * Três blocos, nesta ordem: o hero do último jogo jogado (mesmo componente e
 * mesma cadeia de lançamento/instalação de `AllGamesScreen` — duplicada aqui
 * de propósito por ora, ver nota abaixo), a prateleira "Seus consoles"
 * (`ConsoleCard`, rolável na horizontal, só os consoles com pelo menos uma
 * peça configurada — pasta ou emulador — para não repetir o catálogo inteiro
 * de `ConsolesScreen`) e o rodapé de estatística (tempo jogado + consoles
 * prontos, sem rota nova: `GET /sessions` e o parecer já têm o dado).
 *
 * Nota sobre a duplicação com `AllGamesScreen`: a cadeia "clicar Jogar →
 * instalar emulador → confirmar hardware/BIOS → lançar" já vive nos hooks
 * `useLaunchGame`/`useInlineInstall` — o que se repete aqui é só a fiação dos
 * modais em volta deles, não a lógica. Extrair isso para um componente
 * compartilhado (`<GameLaunchModals />` ou similar) é candidato natural se
 * uma terceira tela precisar do mesmo hero um dia; não fizemos isso agora
 * para não arriscar comportamento de uma tela madura (`AllGamesScreen`) só
 * para economizar ~80 linhas numa tela nova.
 */
export function HomeScreen({
  report,
  consoleCatalog,
  onOpenLibrary,
  onOpenConsole,
  onOpenAllGames,
  onOpenGame,
}: {
  /** Ausente sem consentimento/scan — a home funciona igual sem ele. */
  report?: Report;
  consoleCatalog: ConsoleEntry[];
  /** "Gerenciar pastas" — alcançado tanto pelo botão de ação quanto pelo onboarding. */
  onOpenLibrary: () => void;
  onOpenConsole: (consoleId: string, name: string, shortName: string) => void;
  onOpenAllGames: () => void;
  onOpenGame: (game: LibraryGame, consoleName: string, shortName: string) => void;
}) {
  const t = useT(dict);
  const [featured, setFeatured] = useState<LibraryGame[] | null>(null);
  const [emulators, setEmulators] = useState<EmulatorEntry[] | null>(null);
  const [cores, setCores] = useState<RetroArchCoreStatus[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [playtimeByConsole, setPlaytimeByConsole] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  function loadFeatured() {
    api
      .getAllLibraryGames(1, 1)
      .then((res) => setFeatured(res.games.filter((g) => g.playtime_seconds > 0)))
      .catch(() => setFeatured([]));
  }

  useEffect(loadFeatured, []);
  useEffect(() => {
    api.getEmulators().then((res) => setEmulators(res.emulators)).catch(() => setEmulators([]));
    api.getRetroArchCores().then((res) => setCores(res.cores)).catch(() => {});
    api.getLibraryFolders().then((res) => setFolders(res.folders)).catch(() => {});
    api
      .getSessions()
      .then((res) => setPlaytimeByConsole(res.playtime_seconds))
      .catch(() => setPlaytimeByConsole({}));
  }, []);

  const {
    statusFor,
    launch,
    activeCoreDownload,
    cancelCoreDownload,
    launchError,
    launchErrorCode,
    lastGame,
    clearLaunchError,
    retryLaunch,
  } = useLaunchGame({ onLaunched: loadFeatured });

  // B2 (docs/pendencias.md): guarda console/adapter esperados para
  // pré-preencher o `ManualEmulatorForm` quando ele abre a partir do
  // `ErrorModal` de lançamento ou do `ManualInstallModal` — `null` fechado.
  const [manualFormPrefill, setManualFormPrefill] = useState<{ name?: string; consoles?: string[] } | null>(null);

  function nameFor(consoleId: string): string {
    return (
      report?.verdicts.find((v) => v.console_id === consoleId)?.name ??
      consoleCatalog.find((c) => c.console_id === consoleId)?.name ??
      consoleId
    );
  }
  function shortNameFor(consoleId: string): string {
    return (
      report?.verdicts.find((v) => v.console_id === consoleId)?.short_name ??
      consoleCatalog.find((c) => c.console_id === consoleId)?.short_name ??
      consoleId
    );
  }
  function verdictFor(consoleId: string): ConsoleVerdict | undefined {
    return report?.verdicts.find((v) => v.console_id === consoleId);
  }
  function adapterEntryFor(verdict: ConsoleVerdict | undefined): EmulatorEntry | undefined {
    return verdict?.adapter_id ? (emulators ?? []).find((e) => e.adapter_id === verdict.adapter_id) : undefined;
  }

  async function openBiosFolder(dir: string) {
    try {
      await openPath(dir);
    } catch (err) {
      setError(t("failedToOpenBiosFolder", { error: err instanceof Error ? err.message : String(err) }));
    }
  }

  const install = useInlineInstall({
    onEmulatorInstalled: (adapterId) =>
      setEmulators((prev) => (prev ?? []).map((e) => (e.adapter_id === adapterId ? { ...e, installed: true } : e))),
    onLaunch: (romPath) => {
      const game = featured?.find((g) => g.path === romPath);
      if (game) {
        showToast(t("openingGame", { title: game.title }));
        launch(game);
      }
    },
  });

  function toggleFavorite(game: LibraryGame) {
    const next = !game.favorite;
    setFeatured((prev) => (prev ? prev.map((g) => (g.id === game.id ? { ...g, favorite: next } : g)) : prev));
    const call = next ? api.favoriteGame(game.id) : api.unfavoriteGame(game.id);
    call.catch(() => {
      setFeatured((prev) => (prev ? prev.map((g) => (g.id === game.id ? { ...g, favorite: !next } : g)) : prev));
    });
  }

  // Prateleira: só consoles que já têm alguma peça configurada (pasta OU
  // emulador escolhido) — o catálogo inteiro de 33 consoles já mora em
  // "Consoles" (sidebar), repeti-lo aqui empataria a home com ele em vez de
  // ser um resumo do que já é do usuário.
  const index = useMemo(() => buildReadinessIndex(emulators ?? [], cores, folders), [emulators, cores, folders]);
  const folderConsoleIds = useMemo(() => new Set(folders.map((f) => f.console_id)), [folders]);
  const [gameCounts, setGameCounts] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let cancelado = false;
    for (const consoleId of folderConsoleIds) {
      api
        .getLibraryGames(consoleId)
        .then((res) => {
          if (cancelado) return;
          setGameCounts((prev) => new Map(prev).set(consoleId, res.games.length));
        })
        .catch(() => {});
    }
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders]);

  const shelfConsoles = useMemo(() => {
    if (emulators === null) return null;
    return consoleCatalog
      .map((entry) => ({
        entry,
        readiness: evaluateConsoleReadiness(entry, index),
        hasFolder: folderConsoleIds.has(entry.console_id),
        gameCount: gameCounts.has(entry.console_id) ? gameCounts.get(entry.console_id)! : null,
      }))
      // Só quem já começou — tem pasta apontada OU já tem um emulador
      // instalado que serve (`readiness.chosen`). O catálogo dos 33 consoles
      // inteiro já mora em "Consoles" (sidebar); repeti-lo aqui empataria a
      // home com ele em vez de resumir o que já é do usuário.
      .filter((item) => item.hasFolder || item.readiness.chosen)
      .sort((a, b) => {
        if (a.readiness.step === "pronto" && b.readiness.step !== "pronto") return -1;
        if (b.readiness.step === "pronto" && a.readiness.step !== "pronto") return 1;
        return 0;
      });
  }, [consoleCatalog, folderConsoleIds, index, emulators, gameCounts]);

  const readyCount = report?.verdicts.filter((v) => v.level === "otimo" || v.level === "bom").length ?? 0;
  const totalConsoles = report?.verdicts.length ?? consoleCatalog.length;
  const totalPlaytime = playtimeByConsole ? Object.values(playtimeByConsole).reduce((a, b) => a + b, 0) : 0;

  const cardLabels = {
    viewGames: t("viewGames"),
    gameCount: (count: number) => (count === 1 ? t("gameCountSingular", { count }) : t("gameCountPlural", { count })),
    noGames: t("noGames"),
  };

  // Sem nenhuma pasta configurada ainda: a home vira onboarding em vez de
  // mostrar uma prateleira e um hero vazios lado a lado — pedido do Douglas
  // em 2026-09-10 ("faltam informações, motivos pra usar" logo depois do
  // primeiro scan num PC zerado).
  const isOnboarding = folders.length === 0 && featured !== null && featured.length === 0;

  function playHandlerFor(game: LibraryGame): (() => void) | undefined {
    if (emulators === null) return undefined;
    const launchStatus = statusFor(game.id).kind;
    if (launchStatus === "launching" || launchStatus === "downloading-core") return undefined;
    const verdict = verdictFor(game.console_id);
    return () => install.handlePlay(game, verdict, adapterEntryFor(verdict));
  }

  return (
    <ScreenContainer variant="listing">
      {launchError ? (
        <ErrorModal
          title={t("failedToOpenGame")}
          message={launchError}
          onClose={clearLaunchError}
          onRetry={retryLaunch}
          extraAction={
            isEmulatorMissingErrorCode(launchErrorCode)
              ? {
                  label: t("alreadyHaveEmulatorPointIt"),
                  onClick: () => {
                    const verdict = lastGame ? verdictFor(lastGame.console_id) : undefined;
                    setManualFormPrefill({
                      name: verdict?.emulator,
                      consoles: lastGame ? [lastGame.console_id] : undefined,
                    });
                    clearLaunchError();
                  },
                }
              : undefined
          }
        />
      ) : install.state.kind === "error" ? (
        <ErrorModal
          title={t("failedToInstallEmulator")}
          message={install.state.message}
          onClose={() => install.setState({ kind: "idle" })}
          /* Falha de instalação é quase sempre rede, e costuma passar na
             segunda tentativa — sem isto a pessoa tinha que refazer o caminho
             todo até "Jogar". `retry` guarda os argumentos exatos do
             `startInstall` que falhou (ver `InstallState`). */
          onRetry={
            install.state.retry
              ? ((r) => () => install.startInstall(r.adapterId, r.force, r.pendingGamePath))(install.state.retry)
              : undefined
          }
        />
      ) : (
        error && <ErrorModal title={t("failedToOpenGame")} message={error} onClose={() => setError(null)} />
      )}

      {install.state.kind === "manual-install" && (
        <ManualInstallModal
          adapterName={install.state.adapterName}
          onClose={() => install.setState({ kind: "idle" })}
          onOpenConsole={() => {
            const { consoleId } = install.state as { consoleId: string };
            const entry = consoleCatalog.find((c) => c.console_id === consoleId);
            install.setState({ kind: "idle" });
            if (entry) onOpenConsole(entry.console_id, entry.name, entry.short_name);
          }}
          onPointManually={() => {
            const { adapterName, consoleId } = install.state as { adapterName: string; consoleId: string };
            setManualFormPrefill({ name: adapterName, consoles: [consoleId] });
            install.setState({ kind: "idle" });
          }}
        />
      )}

      {manualFormPrefill && (
        <ManualEmulatorFormModal
          prefill={manualFormPrefill}
          onClose={() => setManualFormPrefill(null)}
          onSaved={() => {
            setManualFormPrefill(null);
            api.getEmulators().then((res) => setEmulators(res.emulators)).catch(() => {});
          }}
        />
      )}

      {install.state.kind === "confirm-hardware" &&
        (() => {
          const confirmState = install.state;
          return (
            <ConfirmModal
              title={t("hardwareBelowRecommended")}
              message={confirmState.message}
              onClose={() => install.setState({ kind: "idle" })}
              actions={
                <>
                  <Button variant="secondary" onClick={() => install.setState({ kind: "idle" })}>
                    {t("cancel")}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => install.startInstall(confirmState.adapterId, true, confirmState.pendingGamePath)}
                  >
                    {t("installAnyway")}
                  </Button>
                </>
              }
            />
          );
        })()}

      {install.state.kind === "confirm-bios" &&
        (() => {
          const confirmState = install.state;
          const pendingGame = featured?.find((g) => g.path === confirmState.pendingGamePath);
          const pendingAdapterEntry = pendingGame ? adapterEntryFor(verdictFor(pendingGame.console_id)) : undefined;
          return (
            <ConfirmModal
              title={t("biosAbsent")}
              message={t("biosEmptyWarning")}
              onClose={() => install.setState({ kind: "idle" })}
              actions={
                <>
                  <Button variant="secondary" onClick={() => install.setState({ kind: "idle" })}>
                    {t("cancel")}
                  </Button>
                  {pendingAdapterEntry?.bios_dir && (
                    <Button variant="secondary" onClick={() => openBiosFolder(pendingAdapterEntry.bios_dir!)}>
                      {t("openBiosFolder")}
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    onClick={() => {
                      install.setState({ kind: "idle" });
                      if (pendingGame) launch(pendingGame);
                    }}
                  >
                    {t("playAnyway")}
                  </Button>
                </>
              }
            />
          );
        })()}

      {install.state.kind === "bios-after-install" &&
        (() => {
          const s = install.state;
          const pendingGame = featured?.find((g) => g.path === s.pendingGamePath);
          return (
            <ConfirmModal
              title={t("emulatorInstalledBiosNeededTitle")}
              message={t("emulatorInstalledBiosNeededMessage", { emulator: s.adapterName })}
              onClose={() => install.setState({ kind: "idle" })}
              actions={
                <>
                  <Button variant="secondary" onClick={() => install.setState({ kind: "idle" })}>
                    {t("closeButton")}
                  </Button>
                  {s.biosDir && (
                    <Button variant="secondary" onClick={() => openBiosFolder(s.biosDir!)}>
                      {t("openBiosFolder")}
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    onClick={() => {
                      install.setState({ kind: "idle" });
                      if (pendingGame) launch(pendingGame);
                    }}
                  >
                    {t("playAnyway")}
                  </Button>
                </>
              }
            />
          );
        })()}

      {install.state.kind === "installing" ? (
        <div className="fixed right-4 bottom-4 z-40 w-72 rounded-lg border border-line bg-fill p-3 shadow-lg">
          <p className="text-sm text-ink" aria-live="polite">
            {/* Sem `job` é o instante entre o clique e a resposta do
                servidor (ver `InstallState` em useInlineInstall): o painel já
                aparece, dizendo que o pedido saiu. */}
            {install.state.job
              ? `Instalando ${install.state.job.name}… ${install.state.job.phase}`
              : "Preparando a instalação do emulador…"}
          </p>
          <div className="mt-2">
            <ProgressBar percent={install.state.job ? percentOf(install.state.job) : null} />
          </div>
        </div>
      ) : activeCoreDownload ? (
        <div className="fixed right-4 bottom-4 z-40 w-72 rounded-lg border border-line bg-fill p-3 shadow-lg">
          <p className="text-sm text-ink" aria-live="polite">
            {t("downloadingCore", { coreName: activeCoreDownload.job.core_name ?? "" })}
            {faseExtraDeDownload(activeCoreDownload.job.phase)}
            {percentOf(activeCoreDownload.job) !== null && ` · ${percentOf(activeCoreDownload.job)}%`}
          </p>
          <div className="mt-2">
            <ProgressBar
              percent={percentOf(activeCoreDownload.job)}
              label={t("downloadingCore", { coreName: activeCoreDownload.job.core_name ?? "" })}
            />
          </div>
          <Button
            className="mt-2 w-full text-xs"
            variant="secondary"
            onClick={() => cancelCoreDownload(activeCoreDownload.gameId, activeCoreDownload.job)}
          >
            {t("cancelDownload")}
          </Button>
        </div>
      ) : (
        toastMessage && <Toast message={toastMessage} />
      )}

      {/* 2026-09-10 (achado do critico-design: a home era a única tela do
          app sem `ScreenHeader` — sem <h1>, sem a voz pixel que ele agora
          carrega). Sem subtítulo no onboarding: o `EmptyState` logo abaixo
          já apresenta o app por extenso, um subtítulo repetiria a mesma
          frase duas vezes na mesma tela. */}
      <ScreenHeader title={t("title")} subtitle={isOnboarding ? undefined : t("subtitle")} />

      {isOnboarding ? (
        <EmptyState
          kicker={t("emptyKicker")}
          title={t("emptyTitle")}
          message={t("emptyMessage")}
          steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
          action={
            <Button variant="primary" onClick={onOpenLibrary}>
              {t("chooseFolderWithGames")}
            </Button>
          }
        />
      ) : (
        <>
          {featured && featured.length > 0 && (
            <div className="mb-8">
              <SectionHeading className="mb-3">{t("continuePlaying")}</SectionHeading>
              {(() => {
                const [game] = featured;
                const verdict = verdictFor(game.console_id);
                return (
                  <GameHero
                    game={game}
                    shortName={shortNameFor(game.console_id)}
                    onOpenDetail={() => onOpenGame(game, nameFor(game.console_id), shortNameFor(game.console_id))}
                    onPlay={playHandlerFor(game)}
                    onToggleFavorite={() => toggleFavorite(game)}
                    launchability={emulators ? evaluateGameLaunchability(game, verdict, adapterEntryFor(verdict)) : undefined}
                    onInstall={
                      verdict?.adapter_id
                        ? () => install.handlePlay(game, verdict, adapterEntryFor(verdict))
                        : undefined
                    }
                    installing={
                      install.state.kind === "installing" && install.state.pendingGamePath === game.path
                    }
                  />
                );
              })()}
            </div>
          )}

          <div className="mb-8">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <SectionHeading>{t("yourConsoles")}</SectionHeading>
              <button
                type="button"
                onClick={onOpenLibrary}
                className="font-mono text-xs tracking-wide text-accent-secondary uppercase hover:underline"
              >
                {t("seeAllConsoles")}
              </button>
            </div>
            {shelfConsoles === null ? (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="h-44 w-[210px] shrink-0 animate-pulse rounded-md border border-line bg-panel" />
                ))}
              </div>
            ) : shelfConsoles.length === 0 ? (
              <EmptyState
                variant="inline"
                title={t("emptyTitle")}
                message={t("emptyMessage")}
                action={
                  <Button variant="primary" onClick={onOpenLibrary}>
                    {t("chooseFolderWithGames")}
                  </Button>
                }
              />
            ) : (
              // Rolagem horizontal, não grade: a prateleira é um resumo curto
              // do que o usuário já configurou, não o catálogo — o card
              // "media" (mesmo de ConsolesScreen) cabe ~5-6 por vez numa
              // janela padrão, e rolar lateralmente é o vocabulário que a home
              // do Steam/GOG já usa para "seus jogos" vs. "a loja inteira".
              <div className="flex gap-3 overflow-x-auto pb-1">
                {shelfConsoles.map(({ entry, readiness, hasFolder, gameCount }) => (
                  <div key={entry.console_id} className="w-[210px] shrink-0">
                    <ConsoleCard
                      entry={entry}
                      readiness={readiness}
                      size="media"
                      hasFolder={hasFolder}
                      gameCount={gameCount}
                      labels={cardLabels}
                      onOpen={() => onOpenConsole(entry.console_id, entry.name, entry.short_name)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p className="font-mono text-xs tracking-wide text-muted uppercase tabular-nums">
              {report
                ? t("statsPlaytimeAndConsoles", {
                    playtime: formatPlaytimeClean(totalPlaytime),
                    ready: readyCount,
                    total: totalConsoles,
                  })
                : t("statsPlaytimeOnly", { playtime: formatPlaytimeClean(totalPlaytime) })}
            </p>
            <Button variant="chrome" onClick={onOpenAllGames} {...{ "data-gamepad-start": "" }}>
              {t("seeAllGames")}
            </Button>
          </div>
        </>
      )}
    </ScreenContainer>
  );
}
