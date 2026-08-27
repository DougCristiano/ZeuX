import { useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { api, ApiError, isDownloadingCore } from "../api";
import type { EmulatorEntry, InstallJob, LibraryGame, Report, Session } from "../api/types";
import {
  Button,
  Callout,
  CardSkeleton,
  ConfirmModal,
  EmptyState,
  ErrorModal,
  InlineError,
  inputClass,
  ProgressBar,
  ScreenContainer,
  Toast,
} from "../components/ui";
import { GameTile } from "../components/GameTile";
import { useInlineInstall } from "../hooks/useInlineInstall";
import { useToast } from "../hooks/useToast";
import { evaluateGameLaunchability } from "../lib/gameLaunchability";
import { percentOf } from "../lib/format";
import { consoleAccentColor } from "../lib/consoleColor";

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
 */
export function GamesScreen({
  consoleId,
  consoleName,
  shortName,
  report,
  onBack,
  onOpenGame,
}: {
  consoleId: string;
  consoleName: string;
  shortName: string;
  report: Report;
  onBack: () => void;
  onOpenGame: (game: LibraryGame, consoleName: string, shortName: string) => void;
}) {
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
  const { toastMessage, showToast } = useToast();

  const verdict = report.verdicts.find((v) => v.console_id === consoleId);

  async function openBiosFolder(dir: string) {
    try {
      await openPath(dir);
    } catch (err) {
      setError(`Não foi possível abrir a pasta do BIOS: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function loadGames() {
    try {
      const res = await api.getLibraryGames(consoleId);
      setGames(res.games);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível listar os jogos.");
    }
  }

  useEffect(() => {
    loadGames();
    api
      .getEmulators()
      .then((res) => setEmulators(res.emulators))
      .catch(() => setEmulators([]));
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
      const message = err instanceof ApiError ? err.message : "Não foi possível cancelar o download.";
      setRowStatus((prev) => ({ ...prev, [gameId]: { kind: "error", message } }));
      setLaunchError(message);
    }
  }

  // Acompanha o download de core disparado pelo próprio /games/launch (R3).
  // Ao terminar, o servidor já abriu o jogo sozinho (launchWhenCoreReady) —
  // por isso o sucesso aqui confirma a sessão, sem uma segunda chamada.
  async function pollCoreDownload(gameId: number, jobId: string, title: string) {
    try {
      const job = await api.getInstallJob(jobId);
      if (job.phase === "concluido") {
        setRowStatus((prev) => ({ ...prev, [gameId]: { kind: "idle" } }));
        showToast(`${title}: sessão iniciada.`);
        loadGames();
        return;
      }
      if (job.phase === "cancelado") {
        setRowStatus((prev) => ({ ...prev, [gameId]: { kind: "idle" } }));
        return;
      }
      if (job.phase === "falhou") {
        const message = job.error ?? "O download do core não foi concluído.";
        setRowStatus((prev) => ({ ...prev, [gameId]: { kind: "error", message } }));
        setLaunchError(message);
        return;
      }
      setRowStatus((prev) => ({ ...prev, [gameId]: { kind: "downloading-core", job } }));
      setTimeout(() => pollCoreDownload(gameId, jobId, title), 400);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Não foi possível acompanhar o download do core.";
      setRowStatus((prev) => ({ ...prev, [gameId]: { kind: "error", message } }));
      setLaunchError(message);
    }
  }

  async function doLaunch(romPath: string) {
    const game = games?.find((g) => g.path === romPath);
    if (!game) return;

    setRowStatus((prev) => ({ ...prev, [game.id]: { kind: "launching" } }));
    try {
      const result = await api.launch({ rom_path: romPath, console_id: consoleId });
      // 202: falta o core do RetroArch e o servidor está baixando agora. O
      // toast de "sessão iniciada" abaixo não pode disparar — nada abriu
      // ainda.
      if (isDownloadingCore(result)) {
        setRowStatus((prev) => ({ ...prev, [game.id]: { kind: "downloading-core", job: result.install_job } }));
        pollCoreDownload(game.id, result.install_job.id, game.title);
        return;
      }
      setRowStatus((prev) => ({ ...prev, [game.id]: { kind: "launched", session: result } }));
      // B4 (achado do critico-design, 2026-08-18): "Sessão iniciada." era
      // texto que nunca somia sozinho, preso na célula do jogo — virou
      // toast, mesma confirmação de sucesso que o resto do app já usa.
      showToast(`${game.title}: sessão iniciada.`);
      loadGames(); // atualiza playtime_seconds/last_played_at sem recarregar a tela
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Não foi possível abrir o jogo.";
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
      .then(() => showToast(next ? "Adicionado aos favoritos." : "Removido dos favoritos."))
      .catch(() => {
        setGames((prev) => (prev ? prev.map((g) => (g.id === game.id ? { ...g, favorite: !next } : g)) : prev));
        setError("Não foi possível salvar o favorito. Tente de novo.");
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
        <ErrorModal title="Não foi possível abrir o jogo" message={launchError} onClose={() => setLaunchError(null)} />
      ) : install.state.kind === "error" ? (
        <ErrorModal
          title="Não foi possível instalar o emulador"
          message={install.state.message}
          onClose={() => install.setState({ kind: "idle" })}
        />
      ) : (
        error && <ErrorModal title="Não foi possível carregar a tela" message={error} onClose={() => setError(null)} />
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
              title="Hardware abaixo do recomendado"
              message={confirmState.message}
              onClose={() => install.setState({ kind: "idle" })}
              actions={
                <>
                  <Button variant="secondary" onClick={() => install.setState({ kind: "idle" })}>
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => install.startInstall(confirmState.adapterId, true, confirmState.pendingGamePath)}
                  >
                    Instalar mesmo assim
                  </Button>
                </>
              }
            />
          );
        })()}

      {install.state.kind === "confirm-bios" &&
        (() => {
          const confirmState = install.state;
          return (
            <ConfirmModal
              title="BIOS ausente"
              message="A pasta de BIOS deste emulador está vazia. Sem o arquivo, o jogo não deve abrir."
              onClose={() => install.setState({ kind: "idle" })}
              actions={
                <>
                  <Button variant="secondary" onClick={() => install.setState({ kind: "idle" })}>
                    Cancelar
                  </Button>
                  {adapterEntry?.bios_dir && (
                    <Button variant="secondary" onClick={() => openBiosFolder(adapterEntry.bios_dir!)}>
                      Abrir pasta do BIOS
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    onClick={() => {
                      install.setState({ kind: "idle" });
                      doLaunch(confirmState.pendingGamePath);
                    }}
                  >
                    Jogar mesmo assim
                  </Button>
                </>
              }
            />
          );
        })()}

      {/* B9 (achado do critico-design, 2026-08-18): mesma posição que
          GameDetailScreen — "Voltar" sozinho, à esquerda, acima do título
          (era ao lado do h1, à direita). */}
      <Button variant="secondary" onClick={onBack} className="mb-4">
        Voltar à biblioteca
      </Button>
      {/* N12 (docs/roadmap.md, Sprint N): mesmo tratamento de borda esquerda
          que EmulatorCard/ConsoleVerdictCard já usam — antes, esta era uma
          das duas telas (junto do parecer, já corrigido) sem nenhum sinal da
          cor de identidade por console, mesmo sendo a tela de UM console só. */}
      <div className="mb-4 border-l-[3px] py-1 pl-3" style={{ borderColor: consoleAccentColor(consoleId) }}>
        <h1 className="text-2xl font-semibold text-ink">{consoleName}</h1>
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
          <Callout label="Dependência externa">
            Este console costuma exigir um arquivo externo (BIOS, firmware ou plugin) que o ZeuX não fornece nem
            verifica. Se o jogo não abrir, confira essa configuração diretamente no emulador.
            {adapterEntry?.bios_dir && (
              <div className="mt-2">
                <Button type="button" variant="secondary" onClick={() => openBiosFolder(adapterEntry.bios_dir!)}>
                  Abrir pasta do BIOS
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
          <Callout label="Sem preset automático">
            Este computador não alcançou nenhum patamar de compatibilidade conhecido para {consoleName}. Os jogos
            continuam listados, mas o ZeuX não tem uma configuração para sugerir.
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
          <span className="sr-only">Carregando jogos…</span>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-7 min-[2400px]:grid-cols-9">
            {Array.from({ length: 10 }, (_, i) => (
              <CardSkeleton key={i} className="aspect-[3/4] h-auto" />
            ))}
          </div>
        </div>
      )}

      {games && games.length === 0 && <EmptyState message="Nenhum jogo achado ainda para este console." />}

      {games && games.length > 0 && (
        <>
          <label htmlFor="games-search" className="sr-only">
            Buscar jogos
          </label>
          <input
            id="games-search"
            type="text"
            name="games-search"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar jogos…"
            className={`mb-4 ${inputClass} max-w-xs`}
          />
        </>
      )}

      {games && games.length > 0 && visibleGames && visibleGames.length === 0 && (
        <p className="text-base text-muted">Nenhum jogo encontrado para "{trimmedSearch}".</p>
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
                    verdict?.adapter_id ? () => install.startInstall(verdict.adapter_id!, false, game.path) : undefined
                  }
                />

                {isPendingInstall && install.state.kind === "installing" && (
                  <div>
                    <p className="text-sm text-muted">
                      Instalando {verdict?.emulator ?? "emulador"}… {install.state.job.phase}
                    </p>
                    <div className="mt-1">
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
                    <p className="text-sm text-muted">
                      Baixando o core {status.job.core_name ?? ""}… {status.job.phase}
                      {percentOf(status.job) !== null && ` · ${percentOf(status.job)}%`}
                    </p>
                    <div className="mt-1">
                      <ProgressBar percent={percentOf(status.job)} label={`Baixando o core ${status.job.core_name ?? ""}`} />
                    </div>
                    <Button
                      className="mt-2"
                      variant="secondary"
                      onClick={() => cancelCoreDownload(game.id, status.job)}
                    >
                      Cancelar download
                    </Button>
                  </div>
                )}

                {/* B2 (achado do critico-design, 2026-08-18): a lista de
                    `unapplied` (ADR 0006) era um `<ul>` cinza solto — terceira
                    aparência diferente do mesmo aviso no app (a outra era
                    `Callout tone="amber"` em EmulatorConfigPanel). */}
                {status.kind === "launched" && status.session.unapplied && status.session.unapplied.length > 0 && (
                  <Callout label="Não aplicado" tone="amber">
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
