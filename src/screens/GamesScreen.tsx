import { useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { api, ApiError, consoleImageURL, isDownloadingCore } from "../api";
import type { EmulatorEntry, InstallJob, LibraryGame, Report, Session } from "../api/types";
import { rescanAllFoldersIfStale } from "../lib/autoRescan";
import {
  BackButton,
  Button,
  Callout,
  CHROME_TINT_DANGER,
  CHROME_TINT_INFO,
  ConfirmModal,
  consoleIconLabel,
  EmptyState,
  ErrorModal,
  InlineError,
  inputClass,
  ManualInstallModal,
  ProgressBar,
  ScreenContainer,
  Toast,
} from "../components/ui";
import { GameTile, GameTileSkeleton } from "../components/GameTile";
import { useInlineInstall } from "../hooks/useInlineInstall";
import { useToast } from "../hooks/useToast";
import { evaluateGameLaunchability } from "../lib/gameLaunchability";
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
  report: Report;
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
  // Erro de lançamento vira modal, não texto discreto na linha do jogo —
  // achado em 2026-08-04, um texto inline passava despercebido.
  const [launchError, setLaunchError] = useState<string | null>(null);
  // A logo oficial não existe para os 3 consoles sem imagem cadastrada no
  // IGDB (ver PRODUCT.md). Esta tela não recebe o `has_image` do catálogo
  // como `ConsoleDetailScreen` recebe, então a checagem é o próprio
  // `onError` do <img> — mesma queda para a sigla, um quadro depois.
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const { toastMessage, showToast } = useToast();

  const accent = consoleAccentColor(consoleId);
  const showHeroImage = !heroImageFailed;

  const verdict = report.verdicts.find((v) => v.console_id === consoleId);

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
        return;
      }
      setRowStatus((prev) => ({ ...prev, [gameId]: { kind: "downloading-core", job } }));
      setTimeout(() => pollCoreDownload(gameId, jobId, romPath), 400);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("coreDownloadedNotFound");
      setRowStatus((prev) => ({ ...prev, [gameId]: { kind: "error", message } }));
      setLaunchError(message);
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
  const visibleGames = trimmedSearch
    ? (games ?? []).filter((g) => g.title.toLowerCase().includes(trimmedSearch.toLowerCase()))
    : games;

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
        <ErrorModal title={t("couldNotLaunchGameTitle")} message={launchError} onClose={() => setLaunchError(null)} />
      ) : install.state.kind === "error" ? (
        <ErrorModal
          title={t("couldNotInstallEmulator")}
          message={install.state.message}
          onClose={() => install.setState({ kind: "idle" })}
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

      {/* B9 (achado do critico-design, 2026-08-18): mesma posição que
          GameDetailScreen — "Voltar" sozinho, à esquerda, acima do título
          (era ao lado do h1, à direita). */}
      <BackButton label={t("backToLibrary")} onClick={onBack} />
      {/* N12 (docs/roadmap.md, Sprint N) tinha dado a esta tela a borda
          esquerda de 3px na cor do console — o sinal certo, na dose errada
          para a tela que é DESTE console: um filete ao lado de um h1 solto,
          o mesmo cabeçalho que qualquer listagem genérica teria.
          Redesenho de 2026-09-07: o cabeçalho passa a ser o mesmo hero de
          `ConsoleDetailScreen` (logo em caixa de 64px, a própria logo
          gigante e desfocada como arte de fundo, gradiente radial na cor de
          identidade, borda esquerda mantida) — vocabulário já estabelecido,
          não uma linguagem nova, e as duas telas do mesmo console deixam de
          se apresentar de jeitos diferentes. */}
      <div
        className="relative mb-6 overflow-hidden rounded-lg border border-line p-5"
        style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
      >
        {showHeroImage && (
          <img
            src={consoleImageURL(consoleId)}
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
          {/* Fundo branco quando há logo: as imagens do IGDB foram desenhadas
              para selo em fundo claro (mesma razão registrada em
              `ConsolesScreen`/`ConsoleDetailScreen`). */}
          <span
            aria-hidden="true"
            style={{ borderColor: `${accent}66`, color: accent, backgroundColor: showHeroImage ? "#fff" : undefined }}
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-fill font-pixel text-[11px] leading-none"
          >
            {showHeroImage ? (
              <img
                src={consoleImageURL(consoleId)}
                alt=""
                className="h-14 w-14 object-contain p-0.5"
                onError={() => setHeroImageFailed(true)}
              />
            ) : (
              consoleIconLabel(consoleId, shortName)
            )}
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-ink">{consoleName}</h1>
            {/* `font-mono`: sigla e contagem são dado de catálogo, não prosa —
                mesmo tratamento que o ano recebe no tile e no detalhe do
                console. A contagem só aparece depois que a lista chega; até
                lá o lugar fica vazio em vez de mostrar "0 jogos", que seria
                afirmar algo ainda não sabido. */}
            <p className="mt-1 font-mono text-sm tracking-wide text-muted">
              <span className="uppercase">{shortName}</span>
              {games && (
                <>
                  {" · "}
                  <span className="tabular-nums">
                    {games.length === 1 ? t("gameCountOne") : t("gameCountMany", { count: games.length })}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-7 min-[2400px]:grid-cols-9">
            {Array.from({ length: 10 }, (_, i) => (
              <GameTileSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {games && games.length === 0 && <EmptyState message={t("noGamesFound")} />}

      {games && games.length > 0 && (
        // Redesenho de 2026-09-07: o input era um controle solto acima da
        // grade. Vira uma régua de toolbar com a mesma altura de 36px (`h-9`,
        // via `inputClass`) do resto do chrome do app, e ganha à direita a
        // contagem do que a busca deixou visível — em coluna monoespaçada,
        // porque o número muda a cada tecla e não pode empurrar o layout.
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label htmlFor="games-search" className="sr-only">
            {t("searchGames")}
          </label>
          <input
            id="games-search"
            type="text"
            name="games-search"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchGamesPlaceholder")}
            className={`${inputClass} max-w-xs`}
          />
          {trimmedSearch && visibleGames && (
            <p
              // `aria-live`: quem usa leitor de tela recebe o resultado da
              // filtragem sem precisar varrer a grade atrás dele.
              aria-live="polite"
              className="font-mono text-xs tracking-wider text-muted uppercase tabular-nums"
            >
              {t("searchMatchCount", { count: visibleGames.length, total: games.length })}
            </p>
          )}
        </div>
      )}

      {games && games.length > 0 && visibleGames && visibleGames.length === 0 && (
        // Mesmo componente de vazio que a lista sem nenhum jogo já usava
        // acima — eram duas aparências para "não há o que mostrar" na mesma
        // tela (um `EmptyState` emoldurado e um parágrafo cinza solto).
        <EmptyState message={t("noGamesMatchingSearch", { search: trimmedSearch })} />
      )}

      {/* B5 (achado do critico-design, 2026-08-18): a Sprint O escalonou a
          grade de AllGamesScreen para telas grandes/4K (O5) mas não tocou
          esta tela — mesma GameTile, densidade travada em lg:grid-cols-5,
          capas desproporcionalmente grandes em monitor grande. Mesmos dois
          tiers extras copiados aqui e no skeleton acima. */}
      {visibleGames && visibleGames.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-7 min-[2400px]:grid-cols-9">
          {visibleGames.map((game) => {
            const status = rowStatus[game.id] ?? { kind: "idle" };
            const isPendingInstall =
              (install.state.kind === "installing" ||
                install.state.kind === "confirm-hardware" ||
                install.state.kind === "confirm-bios") &&
              install.state.pendingGamePath === game.path;
            const canPlay = status.kind !== "launching" && status.kind !== "downloading-core" && !isPendingInstall;
            // M8: mesma regra nas duas telas — só varia o que cada uma tem
            // à mão (aqui, adapterEntry já vem carregado desde sempre).
            const launchability = evaluateGameLaunchability(game, verdict, adapterEntry);

            return (
              <div key={game.id} className="flex flex-col gap-2">
                <GameTile
                  game={game}
                  shortName={shortName}
                  onOpenDetail={() => onOpenGame(game, consoleName, shortName)}
                  onPlay={canPlay ? () => install.handlePlay(game, verdict, adapterEntry) : undefined}
                  onToggleFavorite={() => toggleFavorite(game)}
                  launchability={launchability}
                  onInstall={
                    /* Q5 (docs/roadmap.md, Sprint Q): era `startInstall` direto, que
                       pulava a ramificação por motivo e disparava uma instalação que o
                       servidor recusa para fonte manual — o badge dizia "instalação
                       manual" e o clique caía num "Não foi possível instalar o
                       emulador". `handlePlay` já leva cada motivo ao lugar certo. */
                    verdict?.adapter_id ? () => install.handlePlay(game, verdict, adapterEntry) : undefined
                  }
                />

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
                    <p className="font-mono text-[11px] tracking-wider text-muted/70 uppercase">
                      {install.state.job.phase}
                    </p>
                    <div className="mt-1.5">
                      <ProgressBar percent={percentOf(install.state.job)} />
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
            );
          })}
        </div>
      )}
    </ScreenContainer>
  );
}
