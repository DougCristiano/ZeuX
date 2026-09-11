import { useEffect, useMemo, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { api, ApiError, isDownloadingCore } from "../api";
import type { EmulatorEntry, InstallJob, LibraryGame, Report, Session } from "../api/types";
import { rescanAllFoldersIfStale } from "../lib/autoRescan";
import {
  BackButton,
  Button,
  Callout,
  CHROME_TINT_DANGER,
  CHROME_TINT_INFO,
  ConfirmModal,
  EmptyState,
  ErrorModal,
  InlineError,
  ManualInstallModal,
  ProgressBar,
  ScreenContainer,
  Toast,
} from "../components/ui";
import {
  LibraryToolbar,
  useGridColumns,
  loadStoredSort,
  loadStoredViewMode,
  loadStoredDensity,
  persistLibraryView,
  type CoverDensity,
  type SortValue,
  type ViewMode,
} from "../components/LibraryToolbar";
import { ConsoleHero } from "../components/ConsoleHero";
import { GameListRow } from "../components/GameListRow";
import { GameTile, GameTileSkeleton } from "../components/GameTile";
import { ManualEmulatorFormModal } from "../components/ManualEmulatorFormModal";
import { useInlineInstall } from "../hooks/useInlineInstall";
import { useToast } from "../hooks/useToast";
import { evaluateGameLaunchability } from "../lib/gameLaunchability";
import { isEmulatorMissingErrorCode } from "../lib/emulatorMissingError";
import { faseExtraDeDownload, percentOf } from "../lib/format";
import { consoleAccentColor } from "../lib/consoleColor";
import { useT } from "../i18n/i18n";
import { dict } from "./GamesScreen.i18n";

type RowStatus =
  | { kind: "idle" }
  | { kind: "launching" }
  // ADR 0015 (R3): o core do RetroArch faltava e está sendo baixado — o jogo
  // abre sozinho no fim. Estado próprio porque anunciar "sessão iniciada"
  // aqui era mentira: o download pode levar minutos (o core do MAME passa de
  // 400 MB) e nada tinha aberto ainda.
  | { kind: "downloading-core"; job: InstallJob }
  | { kind: "launched"; session: Session }
  | { kind: "error"; message: string };

/**
 * Tela 05 do wireframe: grid de jogos de um console, com o botão que fecha o
 * ciclo do produto — "Jogar" chama POST /games/launch sem mandar `options`,
 * para que o preset venha do parecer (regra central do produto). Cobre
 * também o L8 ("Instalar ao jogar": clicar em Jogar sem o emulador instalado
 * dispara a instalação inline) e o L9 (aviso genérico de arquivo externo,
 * L3), porque as três decisões vivem na mesma tela do wireframe.
 *
 * M5 (docs/sprint-m-plano.md, 2026-08-07): a célula do jogo (capa, badge,
 * cor, favorito, clique-pro-detalhe) passou a ser `GameTile`, a mesma que
 * `AllGamesScreen` usa. M8 (mesma data): a checagem de "este jogo pode
 * abrir?" e o fluxo de instalação inline saíram daqui — viraram
 * `evaluateGameLaunchability` (src/lib/gameLaunchability.ts) e
 * `useInlineInstall` (src/hooks/useInlineInstall.ts), compartilhados com
 * `AllGamesScreen`. O que continua exclusivo desta tela (não entrou no
 * componente/hook compartilhado): o cabeçalho de parecer/BIOS. As
 * confirmações de hardware fraco/BIOS vazio (N13, docs/roadmap.md,
 * Sprint N) viraram `ConfirmModal` de tela — antes eram painel inline por
 * tile, única tela do app ainda fazendo isso depois que a M8 padronizou
 * `AllGamesScreen` em modal.
 *
 * **Limitação aceita, herdada do M1:** o botão "Jogar" full-width saiu —
 * a checagem de instalado/BIOS antes de lançar agora é o `onPlay` do overlay
 * ▶, alcançável por mouse e por leitor de tela em modo de navegação por
 * elementos, mas fora da ordem de Tab/D-pad (mesma decisão que M1 já tomou
 * para `AllGamesScreen` — ver comentário em `GameTile`). Quem só usa
 * teclado/controle chega nesse fluxo só depois de abrir o detalhe (Enter no
 * tile) e ir até o botão "▶ Jogar" de lá — que hoje lança direto, sem passar
 * pela checagem de instalado/BIOS deste console (`GameDetailScreen` ainda
 * não conhece este hook). Fica registrado como lacuna, não escondido.
 *
 * Redesenho visual de 2026-09-07 (nada de comportamento mudou): o cabeçalho
 * virou o mesmo hero de identidade de console que `ConsoleDetailScreen` usa
 * — esta é a tela de UM console, e ela se apresentava como listagem
 * genérica; a régua de busca ganhou a altura de chrome (36px) e a contagem
 * do filtro; os dois blocos de progresso sob o tile passaram a rótulo de
 * estado (mono/caixa alta) em vez de prosa; "Cancelar download" virou
 * `chrome` tingido de vermelho em repouso; e o esqueleto de carregamento
 * passou a ser `GameTileSkeleton`, com a forma do que vai chegar.
 */
export function GamesScreen({
  consoleId,
  consoleName,
  shortName,
  report,
  onBack,
  onOpenGame,
  onOpenConsole,
}: {
  consoleId: string;
  consoleName: string;
  shortName: string;
  /** Ausente sem consentimento/scan — a grade continua funcionando (jogos
   * abrem sem preset autoconfigurado), só o cabeçalho de parecer some. */
  report?: Report;
  onBack: () => void;
  onOpenGame: (game: LibraryGame, consoleName: string, shortName: string) => void;
  /** Q5: leva ao detalhe deste console, onde ficam as instruções de
   * instalação manual. Ausente se a tela for alcançada sem esse caminho. */
  onOpenConsole?: () => void;
}) {
  const t = useT(dict);
  const [games, setGames] = useState<LibraryGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emulators, setEmulators] = useState<EmulatorEntry[] | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<number, RowStatus>>({});
  // I2 (docs/roadmap.md): client-side, igual às outras telas com busca —
  // este catálogo é a lista de jogos de UM console (nunca cresce sem
  // limite como "Todos os jogos", que filtra no servidor). Filtra sobre
  // `games` sem reordenar, preservando a ordenação por último jogado que o
  // GET /library/games já devolve (L11).
  const [search, setSearch] = useState("");
  // 2026-09-08, a pedido do Douglas: jogos cujo arquivo sumiu (pasta trocada
  // ou revarrida sem achar o ROM de novo) ficam fora da grade por padrão —
  // antes apareciam misturados com o resto, só com um badge. Client-side
  // pelo mesmo motivo do `search` acima: esta tela já carrega a lista
  // inteira de um console só. Ligado, mostra só os ausentes — nunca os dois
  // juntos, mesmo comportamento do filtro equivalente em AllGamesScreen.
  const [missingOnly, setMissingOnly] = useState(false);
  // Régua compartilhada com `AllGamesScreen` (2026-09-09, redesenho retrô):
  // esta tela ganha ordenação + modo lista + densidade das capas de graça. As
  // três preferências vêm do mesmo localStorage — mudar a densidade aqui vale
  // também lá, e vice-versa (é preferência de tela, não de tela específica).
  const [sort, setSort] = useState<SortValue>(loadStoredSort);
  const [viewMode, setViewMode] = useState<ViewMode>(loadStoredViewMode);
  const [coverDensity, setCoverDensity] = useState<CoverDensity>(loadStoredDensity);
  const columns = useGridColumns(coverDensity);
  // Erro de lançamento vira modal, não texto discreto na linha do jogo —
  // achado em 2026-08-04, um texto inline passava despercebido.
  const [launchError, setLaunchError] = useState<string | null>(null);
  // B2 (docs/pendencias.md): `code` da falha, separado da mensagem — só
  // `binary_not_found`/`not_installed`/`emulator_unavailable` oferecem a
  // ação extra do `ErrorModal` (cadastro manual do emulador).
  const [launchErrorCode, setLaunchErrorCode] = useState<string | null>(null);
  // Pré-preenchimento do cadastro manual (nome do emulador + este console),
  // aberto a partir do ErrorModal de lançamento ou do ManualInstallModal.
  const [manualFormPrefill, setManualFormPrefill] = useState<{ name?: string; consoles?: string[] } | null>(null);
  const { toastMessage, showToast } = useToast();

  const accent = consoleAccentColor(consoleId);

  const verdict = report?.verdicts.find((v) => v.console_id === consoleId);

  async function openBiosFolder(dir: string) {
    try {
      await openPath(dir);
    } catch (err) {
      setError(t("couldNotOpenBiosFolder", { error: err instanceof Error ? err.message : String(err) }));
    }
  }

  async function loadGames() {
    try {
      const res = await api.getLibraryGames(consoleId);
      setGames(res.games);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("couldNotListGames"));
    }
  }

  useEffect(() => {
    loadGames();
    api
      .getEmulators()
      .then((res) => setEmulators(res.emulators))
      .catch(() => setEmulators([]));
    // Auto-rescan (2026-09-06): revarre as pastas configuradas sozinho ao
    // abrir a tela, e recarrega a lista se algo novo apareceu — sem isto, um
    // jogo copiado pra pasta só aparecia depois de um clique manual em
    // "Revarrer" (ver src/lib/autoRescan.ts).
    rescanAllFoldersIfStale().then(loadGames);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consoleId]);

  const adapterEntry = verdict?.adapter_id
    ? (emulators ?? []).find((e) => e.adapter_id === verdict.adapter_id)
    : undefined;
  const canAutoConfigure = Boolean(verdict?.adapter_id && verdict.options);

  async function cancelCoreDownload(gameId: number, job: InstallJob) {
    try {
      await api.cancelInstall(job.id);
      // Não muda o estado aqui: o poll em andamento vê a fase "cancelado" na
      // próxima resposta e volta a linha para "idle" sozinho.
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("couldNotCancelDownload");
      setRowStatus((prev) => ({ ...prev, [gameId]: { kind: "error", message } }));
      setLaunchError(message);
      setLaunchErrorCode(null);
    }
  }

  // Acompanha o download de core disparado pelo próprio /games/launch (R3).
  // Ao terminar, **esta tela** repete o lançamento — o servidor não abre o
  // jogo sozinho (decisão do Douglas, 2026-08-27). doLaunch cuida do toast e
  // do loadGames no caminho normal, então aqui é só refazer a chamada.
  async function pollCoreDownload(gameId: number, jobId: string, romPath: string) {
    try {
      const job = await api.getInstallJob(jobId);
      if (job.phase === "concluido") {
        await doLaunch(romPath, true);
        return;
      }
      if (job.phase === "cancelado") {
        setRowStatus((prev) => ({ ...prev, [gameId]: { kind: "idle" } }));
        return;
      }
      if (job.phase === "falhou") {
        const message = job.error ?? t("coreDownloadedNotFound");
        setRowStatus((prev) => ({ ...prev, [gameId]: { kind: "error", message } }));
        setLaunchError(message);
        setLaunchErrorCode(null);
        return;
      }
      setRowStatus((prev) => ({ ...prev, [gameId]: { kind: "downloading-core", job } }));
      setTimeout(() => pollCoreDownload(gameId, jobId, romPath), 400);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("coreDownloadedNotFound");
      setRowStatus((prev) => ({ ...prev, [gameId]: { kind: "error", message } }));
      setLaunchError(message);
      setLaunchErrorCode(null);
    }
  }

  // `afterCoreDownload` marca a segunda tentativa, logo depois de um download
  // de core terminar. Se ela também pedir download, o core não ficou onde a
  // busca procura — parar ali evita baixar em laço infinito.
  async function doLaunch(romPath: string, afterCoreDownload = false) {
    const game = games?.find((g) => g.path === romPath);
    if (!game) return;

    setRowStatus((prev) => ({ ...prev, [game.id]: { kind: "launching" } }));
    try {
      const result = await api.launch({ rom_path: romPath, console_id: consoleId });
      // 202: falta o core do RetroArch e o servidor está baixando agora. O
      // toast de "sessão iniciada" abaixo não pode disparar — nada abriu
      // ainda.
      if (isDownloadingCore(result)) {
        if (afterCoreDownload) {
          const message = t("coreDownloadedNotFound");
          setRowStatus((prev) => ({ ...prev, [game.id]: { kind: "error", message } }));
          setLaunchError(message);
          setLaunchErrorCode(null);
          return;
        }
        setRowStatus((prev) => ({ ...prev, [game.id]: { kind: "downloading-core", job: result.install_job } }));
        pollCoreDownload(game.id, result.install_job.id, romPath);
        return;
      }
      setRowStatus((prev) => ({ ...prev, [game.id]: { kind: "launched", session: result } }));
      // B4 (achado do critico-design, 2026-08-18): "Sessão iniciada." era
      // texto que nunca somia sozinho, preso na célula do jogo — virou
      // toast, mesma confirmação de sucesso que o resto do app já usa.
      showToast(t("sessionStarted", { title: game.title }));
      loadGames(); // atualiza playtime_seconds/last_played_at sem recarregar a tela
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("couldNotLaunchGame");
      setRowStatus((prev) => ({ ...prev, [game.id]: { kind: "error", message } }));
      setLaunchError(message);
      // B2 (docs/pendencias.md): `code` (docs/api.md) diferencia "emulador não
      // encontrado" de qualquer outro motivo de falha.
      setLaunchErrorCode(err instanceof ApiError ? err.code : null);
    }
  }

  // M8: fluxo de instalação inline compartilhado com AllGamesScreen.
  const install = useInlineInstall({
    onEmulatorInstalled: (adapterId) =>
      setEmulators((prev) => (prev ?? []).map((e) => (e.adapter_id === adapterId ? { ...e, installed: true } : e))),
    onLaunch: doLaunch,
  });

  // Toggle otimista (G4), mesmo padrão de AllGamesScreen.tsx — esta tela
  // nunca teve favoritos antes do M5 (não desenhava a estrela nenhuma).
  function toggleFavorite(game: LibraryGame) {
    const next = !game.favorite;
    setGames((prev) => (prev ? prev.map((g) => (g.id === game.id ? { ...g, favorite: next } : g)) : prev));
    // B4 (achado do critico-design, 2026-08-18): favoritar confirmava em
    // AllGamesScreen e ficava mudo aqui — a mesma ação não pode confirmar
    // numa tela e não confirmar em outra.
    const call = next ? api.favoriteGame(game.id) : api.unfavoriteGame(game.id);
    call
      .then(() => showToast(next ? t("addedToFavorites") : t("removedFromFavorites")))
      .catch(() => {
        setGames((prev) => (prev ? prev.map((g) => (g.id === game.id ? { ...g, favorite: !next } : g)) : prev));
        setError(t("couldNotSaveFavorite"));
      });
  }

  const trimmedSearch = search.trim();
  const visibleGames = useMemo(() => {
    const byMissing = (games ?? []).filter((g) => (missingOnly ? g.missing : !g.missing));
    const bySearch = trimmedSearch
      ? byMissing.filter((g) => g.title.toLowerCase().includes(trimmedSearch.toLowerCase()))
      : byMissing;
    if (sort === "titulo") {
      return [...bySearch].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    }
    if (sort === "tempo_jogado") {
      return [...bySearch].sort((a, b) => b.playtime_seconds - a.playtime_seconds);
    }
    // "recentes": a ordem que `GET /library/games` já devolve (jogado por
    // último primeiro, nunca jogado no fim) — não reordena.
    return bySearch;
  }, [games, missingOnly, trimmedSearch, sort]);

  return (
    // N3 (docs/roadmap.md, Sprint N): era `max-w-5xl` isolado — agora usa o
    // mesmo teto de listagem do resto do app (`ScreenContainer`).
    <ScreenContainer variant="listing">
      {/*
       * Um só modal de erro por vez, em ordem de prioridade — antes disto,
       * `install.state.kind === "error"` e o `error` genérico apareciam como
       * parágrafo vermelho solto no meio da tela (achado numa sessão
       * anterior, 2026-08-07: "não tá bom, nem legível"). Mesmo motivo que
       * criou o `ErrorModal` em 2026-08-04 para `launchError`, só que os
       * outros dois nunca ganharam o mesmo tratamento.
       */}
      {toastMessage && <Toast message={toastMessage} />}
      {launchError ? (
        <ErrorModal
          title={t("couldNotLaunchGameTitle")}
          message={launchError}
          onClose={() => {
            setLaunchError(null);
            setLaunchErrorCode(null);
          }}
          extraAction={
            isEmulatorMissingErrorCode(launchErrorCode)
              ? {
                  label: t("alreadyHaveEmulatorPointIt"),
                  onClick: () => {
                    setManualFormPrefill({ name: verdict?.emulator, consoles: [consoleId] });
                    setLaunchError(null);
                    setLaunchErrorCode(null);
                  },
                }
              : undefined
          }
        />
      ) : install.state.kind === "error" ? (
        <ErrorModal
          title={t("couldNotInstallEmulator")}
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
        error && <ErrorModal title={t("couldNotLoadScreen")} message={error} onClose={() => setError(null)} />
      )}

      {/* N13 (docs/roadmap.md, Sprint N): antes, esta tela mostrava as duas
          confirmações abaixo como painel inline por tile — a mesma decisão
          que `AllGamesScreen` já resolvia em `ConfirmModal` (M8). Regra
          única: instalar/lançar mesmo assim toca disco/rede ou ignora um
          aviso de compatibilidade — vira modal em toda tela, não só na que
          precisou de virtualização. */}
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

      {/* Q5 (docs/roadmap.md, Sprint Q): o clique não dispara mais uma
          instalação que o servidor recusa. Leva ao detalhe do console, onde as
          instruções já moram. */}
      {install.state.kind === "manual-install" && (
        <ManualInstallModal
          adapterName={install.state.adapterName}
          onClose={() => install.setState({ kind: "idle" })}
          onOpenConsole={
            onOpenConsole
              ? () => {
                  install.setState({ kind: "idle" });
                  onOpenConsole();
                }
              : undefined
          }
          onPointManually={() => {
            const { adapterName, consoleId: manualConsoleId } = install.state as {
              adapterName: string;
              consoleId: string;
            };
            setManualFormPrefill({ name: adapterName, consoles: [manualConsoleId] });
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

      {install.state.kind === "confirm-bios" &&
        (() => {
          const confirmState = install.state;
          return (
            <ConfirmModal
              title={t("biosAbsent")}
              message={t("biosEmptyMessage")}
              onClose={() => install.setState({ kind: "idle" })}
              actions={
                <>
                  <Button variant="secondary" onClick={() => install.setState({ kind: "idle" })}>
                    {t("cancel")}
                  </Button>
                  {/* Continua `secondary`, e não `chrome` como os outros
                      "Abrir pasta do BIOS" da tela: aqui o botão está na
                      fileira de ações de um modal, ao lado de "Cancelar" e
                      do primário — nessa fileira o que manda é as três
                      ações terem a mesma altura, não a variante de chrome. */}
                  {adapterEntry?.bios_dir && (
                    <Button variant="secondary" onClick={() => openBiosFolder(adapterEntry.bios_dir!)}>
                      {t("openBiosFolder")}
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    onClick={() => {
                      install.setState({ kind: "idle" });
                      doLaunch(confirmState.pendingGamePath);
                    }}
                  >
                    {t("playAnyway")}
                  </Button>
                </>
              }
            />
          );
        })()}

      {/* 2026-09-09: o emulador foi instalado automaticamente pelo clique em
          "Jogar", mas este console precisa de BIOS. Avisa em vez de abrir numa
          tela preta. */}
      {install.state.kind === "bios-after-install" &&
        (() => {
          const s = install.state;
          return (
            <ConfirmModal
              title={t("emulatorInstalledBiosNeededTitle")}
              message={t("emulatorInstalledBiosNeededMessage", { emulator: s.adapterName })}
              onClose={() => install.setState({ kind: "idle" })}
              actions={
                <>
                  <Button variant="secondary" onClick={() => install.setState({ kind: "idle" })}>
                    {t("close")}
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
                      doLaunch(s.pendingGamePath);
                    }}
                  >
                    {t("playAnyway")}
                  </Button>
                </>
              }
            />
          );
        })()}

      {/* B9 (achado do critico-design, 2026-08-18): mesma posição que
          GameDetailScreen — "Voltar" sozinho, à esquerda, acima do título
          (era ao lado do h1, à direita). */}
      <BackButton label={t("backToLibrary")} onClick={onBack} />
      {/* N12 (docs/roadmap.md, Sprint N) tinha dado a esta tela a borda
          esquerda de 3px na cor do console — o sinal certo, na dose errada
          para a tela que é DESTE console: um filete ao lado de um h1 solto,
          o mesmo cabeçalho que qualquer listagem genérica teria. Desde
          2026-09-07 o cabeçalho é o mesmo hero de `ConsoleDetailScreen`, e
          desde 2026-09-11 é literalmente o mesmo componente
          (`ConsoleHero`) — antes eram duas cópias que já divergiam. */}
      <ConsoleHero
        consoleId={consoleId}
        name={consoleName}
        shortName={shortName}
        meta={
          /* A contagem só aparece depois que a lista chega; até lá o lugar
             fica vazio em vez de mostrar "0 jogos", que seria afirmar algo
             ainda não sabido. */
          <>
            <span className="uppercase">{shortName}</span>
            {games && (
              <>
                {" · "}
                <span className="tabular-nums">
                  {games.length === 1 ? t("gameCountOne") : t("gameCountMany", { count: games.length })}
                </span>
              </>
            )}
          </>
        }
      />

      {/* L9: aviso genérico de dependência externa, nunca nomeando arquivo,
          nunca bloqueando o jogo — só informa (regra 5). O botão "Abrir
          pasta" só aparece quando adapterEntry.bios_dir veio preenchido —
          ou seja, quando alguém já testou de verdade onde este emulador
          específico lê o arquivo (ver BiosDir, internal/emulator/bios_dir.go).
          Sem isso, o aviso genérico continua sozinho — apontar uma pasta
          errada seria pior que nenhuma. */}
      {verdict?.requires_external_file && (
        <div className="mb-4">
          <Callout label={t("externalDependency")}>
            {t("externalFileMessage")}
            {adapterEntry?.bios_dir && (
              <div className="mt-2">
                {/* Ciano em repouso (`CHROME_TINT_INFO`), não só no hover: o
                    papel do botão já é conhecido antes do clique — abrir a
                    pasta é o sistema mostrando onde o arquivo mora, não uma
                    ação sobre o conteúdo. Token compartilhado (ui.tsx), não a
                    string de seis utilities escrita de novo à mão. */}
                <Button
                  type="button"
                  variant="chrome"
                  className={CHROME_TINT_INFO}
                  onClick={() => openBiosFolder(adapterEntry.bios_dir!)}
                >
                  {t("openBiosFolder")}
                </Button>
              </div>
            )}
          </Callout>
        </div>
      )}

      {/* M8 acrescentou o badge por tile ("sem preset — {componente}"), mas
          não substitui este aviso de tela inteira: com um console inteiro
          sem preset, repetir a mesma frase em cada uma das dezenas de capas
          seria pior que dizer uma vez só aqui em cima. */}
      {!canAutoConfigure && (
        <div className="mb-4">
          <Callout label={t("noAutoPreset")}>
            {t("noAutoPresetMessage", { consoleName })}
          </Callout>
        </div>
      )}

      {/* N11 (docs/roadmap.md, Sprint N): antes, `games === null` não
          renderizava nada aqui — a tela ficava em branco entre abrir e a
          resposta de GET /library/games chegar, a mesma armadilha que o
          M12 já tinha corrigido em AllGamesScreen. Skeleton na MESMA grade
          da lista real (linha ~340) — senão o conteúdo pula de coluna ao
          carregar. */}
      {games === null && (
        <div role="status" aria-live="polite">
          <span className="sr-only">{t("loadingGames")}</span>
          {/* Redesenho de 2026-09-07: `GameTileSkeleton`, e não um
              `CardSkeleton` de proporção 3/4 — o placeholder precisa ter a
              forma do que vai chegar (capa + duas linhas de texto), senão o
              tile "cresce" ao carregar mesmo com a grade certa. É o mesmo
              esqueleto que `AllGamesScreen` já usa. */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: "1rem" }}>
            {Array.from({ length: 10 }, (_, i) => (
              <GameTileSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {games && games.length === 0 && (
        <EmptyState title={t("noGamesTitle")} message={t("noGamesFound")} />
      )}

      {games && games.length > 0 && (
        <LibraryToolbar
          search={search}
          onSearch={setSearch}
          sort={sort}
          onSortChange={(v) => {
            persistLibraryView({ sort: v });
            setSort(v);
          }}
          viewMode={viewMode}
          onViewModeChange={(v) => {
            persistLibraryView({ viewMode: v });
            setViewMode(v);
          }}
          coverDensity={coverDensity}
          onCoverDensityChange={(v) => {
            persistLibraryView({ coverDensity: v });
            setCoverDensity(v);
          }}
          missing={
            games.some((g) => g.missing)
              ? { on: missingOnly, onToggle: () => setMissingOnly((prev) => !prev) }
              : undefined
          }
          matchCount={trimmedSearch ? { count: visibleGames.length, total: games.length } : undefined}
        />
      )}

      {games && games.length > 0 && visibleGames && visibleGames.length === 0 && (
        // Mesmo componente de vazio que a lista sem nenhum jogo já usava
        // acima — eram duas aparências para "não há o que mostrar" na mesma
        // tela (um `EmptyState` emoldurado e um parágrafo cinza solto).
        <EmptyState
          variant="inline"
          title={t("noGamesTitle")}
          message={
            trimmedSearch
              ? t("noGamesMatchingSearch", { search: trimmedSearch })
              : missingOnly
                ? t("noMissingGames")
                : t("noGamesFound")
          }
        />
      )}

      {/* B5 (achado do critico-design, 2026-08-18): a Sprint O escalonou a
          grade de AllGamesScreen para telas grandes/4K (O5) mas não tocou
          esta tela — mesma GameTile, densidade travada em lg:grid-cols-5,
          capas desproporcionalmente grandes em monitor grande. Mesmos dois
          tiers extras copiados aqui e no skeleton acima. */}
      {visibleGames && visibleGames.length > 0 && (
        <div
          style={
            viewMode === "lista"
              ? { display: "flex", flexDirection: "column" }
              : { display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: "1rem" }
          }
        >
          {visibleGames.map((game, gameIndex) => {
            const status = rowStatus[game.id] ?? { kind: "idle" };
            const isPendingInstall =
              (install.state.kind === "installing" ||
                install.state.kind === "confirm-hardware" ||
                install.state.kind === "confirm-bios") &&
              install.state.pendingGamePath === game.path;
            // `emulators !== null`: sem a lista de `GET /emulators`,
            // `adapterEntry` fica indefinido e um clique cairia num launch cru
            // que falha com "emulador não encontrado" em vez de instalar. A
            // chamada é local e rápida — segurar o clique até ela voltar é um
            // piscar imperceptível.
            const canPlay =
              emulators !== null &&
              status.kind !== "launching" &&
              status.kind !== "downloading-core" &&
              !isPendingInstall;
            // M8: mesma regra nas duas telas — só varia o que cada uma tem
            // à mão (aqui, adapterEntry já vem carregado desde sempre).
            const launchability = evaluateGameLaunchability(game, verdict, adapterEntry);

            return (
              // Sem `gap` no modo lista (correção de 2026-09-11): o
              // `GameListRow` foi desenhado para encostar no seguinte — a
              // borda inferior dele é o único separador entre um jogo e o
              // próximo (ver o comentário do componente). Um `gap-2` aqui
              // afastava as linhas e transformava cada uma num cartão solto,
              // desmontando o desenho da lista. A margem de 2 continua no
              // modo grade, onde ela separa o tile dos blocos de progresso.
              <div key={game.id} className={viewMode === "lista" ? "flex flex-col" : "flex flex-col gap-2"}>
                {/* Q5: `onInstall` passa por `handlePlay`, a mesma cadeia de
                    decisão do ▶ — ramifica por motivo e nunca dispara uma
                    instalação que o servidor recusa para fonte manual. */}
                {viewMode === "lista" ? (
                  <GameListRow
                    game={game}
                    consoleShortName={shortName}
                    accentColor={accent}
                    gamepadStart={gameIndex === 0}
                    onOpenDetail={() => onOpenGame(game, consoleName, shortName)}
                    onPlay={canPlay ? () => install.handlePlay(game, verdict, adapterEntry) : undefined}
                    onToggleFavorite={() => toggleFavorite(game)}
                    launchability={launchability}
                    onInstall={
                      verdict?.adapter_id ? () => install.handlePlay(game, verdict, adapterEntry) : undefined
                    }
                  />
                ) : (
                  <GameTile
                    game={game}
                    shortName={shortName}
                    gamepadStart={gameIndex === 0}
                    onOpenDetail={() => onOpenGame(game, consoleName, shortName)}
                    onPlay={canPlay ? () => install.handlePlay(game, verdict, adapterEntry) : undefined}
                    onToggleFavorite={() => toggleFavorite(game)}
                    launchability={launchability}
                    onInstall={
                      verdict?.adapter_id ? () => install.handlePlay(game, verdict, adapterEntry) : undefined
                    }
                  />
                )}

                {/* Os blocos abaixo (progresso, aviso, erro) foram desenhados
                    para a largura de um tile. No modo lista eles ganham o
                    mesmo recuo horizontal da linha e uma borda inferior, para
                    continuarem lendo como parte daquela linha; no modo grade
                    `contents` dissolve este wrapper e o layout fica idêntico
                    ao de antes. */}
                <div
                  className={
                    viewMode === "lista" ? "flex flex-col gap-2 border-b border-control-border px-2 py-2 empty:hidden empty:border-0" : "contents"
                  }
                >
                {/* Redesenho de 2026-09-07: a frase era o único texto em
                    português cravado no JSX desta tela (todo o resto já
                    passava pelo `dict`), e vinha em `text-sm` de prosa. Vira
                    rótulo de estado — mono, caixa alta — porque é o que os
                    dois blocos de progresso desta tela são; a fase do job vai
                    para uma segunda linha, para o nome do emulador não ser
                    empurrado para fora da largura de um tile. */}
                {isPendingInstall && install.state.kind === "installing" && (
                  <div>
                    <p className="font-mono text-[11px] tracking-wider text-muted uppercase">
                      {t("installingEmulator", { emulator: verdict?.emulator ?? t("emulatorFallbackName") })}
                    </p>
                    {/* Sem `job`, a instalação acabou de ser pedida e o
                        servidor ainda não respondeu (ver `InstallState`) —
                        a linha de fase fica de fora e a barra sem
                        porcentagem, mas o bloco já está no ar. */}
                    {install.state.job && (
                      <p className="font-mono text-[11px] tracking-wider text-muted/70 uppercase">
                        {install.state.job.phase}
                      </p>
                    )}
                    <div className="mt-1.5">
                      <ProgressBar percent={install.state.job ? percentOf(install.state.job) : null} />
                    </div>
                  </div>
                )}

                {/* R3 (ADR 0015): mesma forma visual da instalação de
                    emulador logo acima — o usuário não precisa aprender dois
                    jeitos de ver "estou baixando algo antes de abrir seu
                    jogo". "Cancelar" existe porque o core do MAME passa de
                    400 MB: desistir precisa ser possível sem fechar o app. */}
                {status.kind === "downloading-core" && (
                  <div>
                    <p className="font-mono text-[11px] tracking-wider text-muted uppercase">
                      {t("downloadingCore", { coreName: status.job.core_name ?? "" })}
                      {faseExtraDeDownload(status.job.phase)}
                      {percentOf(status.job) !== null && (
                        <span className="tabular-nums"> · {percentOf(status.job)}%</span>
                      )}
                    </p>
                    <div className="mt-1.5">
                      <ProgressBar percent={percentOf(status.job)} label={t("downloadingCore", { coreName: status.job.core_name ?? "" })} />
                    </div>
                    {/* Vermelho em repouso (`CHROME_TINT_DANGER`) e altura de
                        chrome: interromper um download já começado é a ação
                        destrutiva desta tela, e o sinal precisa chegar antes
                        do clique. Era `secondary`, que media como botão de
                        conteúdo (`text-base`, `py-2`) embaixo de um tile de
                        capa e competia com o próprio "Jogar". */}
                    <Button
                      className={`mt-2 ${CHROME_TINT_DANGER}`}
                      variant="chrome"
                      onClick={() => cancelCoreDownload(game.id, status.job)}
                    >
                      {t("cancelDownload")}
                    </Button>
                  </div>
                )}

                {/* B2 (achado do critico-design, 2026-08-18): a lista de
                    `unapplied` (ADR 0006) era um `<ul>` cinza solto — terceira
                    aparência diferente do mesmo aviso no app (a outra era
                    `Callout tone="amber"` em EmulatorConfigPanel). */}
                {status.kind === "launched" && status.session.unapplied && status.session.unapplied.length > 0 && (
                  <Callout label={t("notApplied")} tone="amber">
                    <ul className="list-disc pl-4">
                      {status.session.unapplied.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </Callout>
                )}

                {status.kind === "error" && <InlineError>{status.message}</InlineError>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ScreenContainer>
  );
}
