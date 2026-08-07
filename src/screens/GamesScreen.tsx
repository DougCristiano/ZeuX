import { useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { api, ApiError } from "../api";
import type { EmulatorEntry, InstallJob, LibraryGame, Report, Session } from "../api/types";
import { Badge, Button, Callout, Card, ErrorModal, ProgressBar } from "../components/ui";

type RowStatus =
  | { kind: "idle" }
  | { kind: "launching" }
  | { kind: "launched"; session: Session }
  | { kind: "error"; message: string };

// Estado da instalação inline (L8): um só por tela, porque todos os jogos
// deste console compartilham o mesmo adapter. pendingGamePath guarda qual
// jogo disparou o clique, para lançar assim que a instalação terminar — o
// usuário não deveria precisar clicar em "Jogar" de novo.
type InstallState =
  | { kind: "idle" }
  | { kind: "confirm-hardware"; message: string; pendingGamePath: string }
  // Achado em 2026-08-04: diferente de hardware fraco (que pode rodar mal,
  // mas roda), sem BIOS o jogo nunca abre — confirma antes de tentar, em vez
  // de deixar clicar "Jogar" e só descobrir depois que falhou.
  | { kind: "confirm-bios"; pendingGamePath: string }
  | { kind: "installing"; job: InstallJob; pendingGamePath: string }
  | { kind: "error"; message: string };

function percentOf(job: InstallJob): number | null {
  if (job.total_bytes <= 0) return null;
  return Math.min(100, Math.round((job.downloaded_bytes / job.total_bytes) * 100));
}

function formatPlaytime(seconds: number): string {
  if (seconds <= 0) return "nunca jogado";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min jogados`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h${remainder}min jogados` : `${hours}h jogados`;
}

function formatLastPlayed(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `último acesso em ${date.toLocaleString("pt-BR")}`;
}

/**
 * Tela 05 do wireframe: grid de jogos de um console, com o botão que fecha o
 * ciclo do produto — "Jogar" chama POST /games/launch sem mandar `options`,
 * para que o preset venha do parecer (regra central do produto). Cobre
 * também o L8 ("Instalar ao jogar": clicar em Jogar sem o emulador instalado
 * dispara a instalação inline) e o L9 (aviso genérico de arquivo externo,
 * L3), porque as três decisões vivem na mesma tela do wireframe.
 */
export function GamesScreen({
  consoleId,
  consoleName,
  shortName,
  report,
  onBack,
}: {
  consoleId: string;
  consoleName: string;
  shortName: string;
  report: Report;
  onBack: () => void;
}) {
  const [games, setGames] = useState<LibraryGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emulators, setEmulators] = useState<EmulatorEntry[] | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<number, RowStatus>>({});
  const [installState, setInstallState] = useState<InstallState>({ kind: "idle" });
  // I2 (docs/roadmap.md): client-side, igual às outras telas com busca —
  // este catálogo é a lista de jogos de UM console (nunca cresce sem
  // limite como "Todos os jogos", que filtra no servidor). Filtra sobre
  // `games` sem reordenar, preservando a ordenação por último jogado que o
  // GET /library/games já devolve (L11).
  const [search, setSearch] = useState("");
  // Erro de lançamento vira modal, não texto discreto na linha do jogo —
  // achado em 2026-08-04, um texto inline passava despercebido.
  const [launchError, setLaunchError] = useState<string | null>(null);

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

  async function doLaunch(romPath: string) {
    const game = games?.find((g) => g.path === romPath);
    if (!game) return;

    setRowStatus((prev) => ({ ...prev, [game.id]: { kind: "launching" } }));
    try {
      const session = await api.launch({ rom_path: romPath, console_id: consoleId });
      setRowStatus((prev) => ({ ...prev, [game.id]: { kind: "launched", session } }));
      loadGames(); // atualiza playtime_seconds/last_played_at sem recarregar a tela
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Não foi possível abrir o jogo.";
      setRowStatus((prev) => ({ ...prev, [game.id]: { kind: "error", message } }));
      setLaunchError(message);
    }
  }

  async function pollInstallJob(jobId: string, pendingGamePath: string) {
    try {
      const job = await api.getInstallJob(jobId);
      if (job.phase === "concluido") {
        setInstallState({ kind: "idle" });
        setEmulators((prev) =>
          (prev ?? []).map((e) => (e.adapter_id === verdict?.adapter_id ? { ...e, installed: true } : e)),
        );
        await doLaunch(pendingGamePath);
        return;
      }
      if (job.phase === "falhou") {
        setInstallState({ kind: "error", message: job.error ?? "A instalação falhou." });
        return;
      }
      setInstallState({ kind: "installing", job, pendingGamePath });
      setTimeout(() => pollInstallJob(jobId, pendingGamePath), 400);
    } catch (err) {
      setInstallState({
        kind: "error",
        message: err instanceof ApiError ? err.message : "Não foi possível acompanhar a instalação.",
      });
    }
  }

  async function startInstall(force: boolean, pendingGamePath: string) {
    if (!verdict?.adapter_id) return;
    try {
      const job = await api.installEmulator(verdict.adapter_id, force);
      setInstallState({ kind: "installing", job, pendingGamePath });
      pollInstallJob(job.id, pendingGamePath);
    } catch (err) {
      if (err instanceof ApiError && err.code === "hardware_insufficient") {
        setInstallState({ kind: "confirm-hardware", message: err.message, pendingGamePath });
        return;
      }
      setInstallState({
        kind: "error",
        message: err instanceof ApiError ? err.message : "Não foi possível iniciar a instalação.",
      });
    }
  }

  function handlePlay(game: LibraryGame) {
    if (game.missing || !canAutoConfigure) return;

    if (adapterEntry && !adapterEntry.installed) {
      startInstall(false, game.path);
      return;
    }

    if (adapterEntry?.bios_dir && adapterEntry.bios_dir_empty) {
      setInstallState({ kind: "confirm-bios", pendingGamePath: game.path });
      return;
    }

    doLaunch(game.path);
  }

  const trimmedSearch = search.trim();
  const visibleGames = trimmedSearch
    ? (games ?? []).filter((g) => g.title.toLowerCase().includes(trimmedSearch.toLowerCase()))
    : games;

  return (
    <div className="mx-auto max-w-5xl px-6 pt-16 pb-10">
      {launchError && (
        <ErrorModal title="Não foi possível abrir o jogo" message={launchError} onClose={() => setLaunchError(null)} />
      )}

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">{consoleName}</h1>
        <Button variant="secondary" onClick={onBack}>
          Voltar à biblioteca
        </Button>
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

      {!canAutoConfigure && (
        <div className="mb-4">
          <Callout label="Sem preset automático">
            Este computador não alcançou nenhum patamar de compatibilidade conhecido para {consoleName}. Os jogos
            continuam listados, mas o ZeuX não tem uma configuração para sugerir.
          </Callout>
        </div>
      )}

      {installState.kind === "error" && <p className="mb-4 text-base text-danger">{installState.message}</p>}

      {error && <p className="text-base text-danger">{error}</p>}

      {games && games.length === 0 && (
        <p className="text-base text-muted">Nenhum jogo achado ainda para este console.</p>
      )}

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
            className="mb-4 w-full max-w-xs rounded border border-line bg-fill px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </>
      )}

      {games && games.length > 0 && visibleGames && visibleGames.length === 0 && (
        <p className="text-base text-muted">Nenhum jogo encontrado para "{trimmedSearch}".</p>
      )}

      {visibleGames && visibleGames.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleGames.map((game) => {
            const status = rowStatus[game.id] ?? { kind: "idle" };
            const isPendingInstall =
              (installState.kind === "installing" ||
                installState.kind === "confirm-hardware" ||
                installState.kind === "confirm-bios") &&
              installState.pendingGamePath === game.path;

            return (
              <Card key={game.id} className="flex flex-col gap-2">
                <div className="flex gap-3">
                  {/* Capa placeholder por console, não por jogo — sem scraper no MVP. */}
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-line-strong bg-fill font-mono text-xs text-muted">
                    {shortName}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink" title={game.title}>
                      {game.title}
                    </p>
                    <p className="text-xs text-muted">{formatPlaytime(game.playtime_seconds)}</p>
                    {formatLastPlayed(game.last_played_at) && (
                      <p className="text-xs text-muted">{formatLastPlayed(game.last_played_at)}</p>
                    )}
                    {game.missing && (
                      <div className="mt-1">
                        <Badge>arquivo ausente</Badge>
                      </div>
                    )}
                  </div>
                </div>

                {isPendingInstall && installState.kind === "confirm-hardware" && (
                  <div className="rounded border border-dashed border-line-strong p-2">
                    <p className="text-sm text-ink">{installState.message}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button variant="primary" onClick={() => startInstall(true, game.path)}>
                        Instalar mesmo assim
                      </Button>
                      <Button variant="secondary" onClick={() => setInstallState({ kind: "idle" })}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {isPendingInstall && installState.kind === "confirm-bios" && (
                  <div className="rounded border border-dashed border-line-strong p-2">
                    <p className="text-sm text-ink">
                      A pasta de BIOS deste emulador está vazia. Sem o arquivo, o jogo não deve abrir.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {adapterEntry?.bios_dir && (
                        <Button variant="secondary" onClick={() => openBiosFolder(adapterEntry.bios_dir!)}>
                          Abrir pasta do BIOS
                        </Button>
                      )}
                      <Button
                        variant="primary"
                        onClick={() => {
                          setInstallState({ kind: "idle" });
                          doLaunch(game.path);
                        }}
                      >
                        Jogar mesmo assim
                      </Button>
                      <Button variant="secondary" onClick={() => setInstallState({ kind: "idle" })}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {isPendingInstall && installState.kind === "installing" && (
                  <div>
                    <p className="text-sm text-muted">
                      Instalando {verdict?.emulator ?? "emulador"}… {installState.job.phase}
                    </p>
                    <div className="mt-1">
                      <ProgressBar percent={percentOf(installState.job)} />
                    </div>
                  </div>
                )}

                {status.kind === "launched" && (
                  <div className="text-sm text-ink">
                    <p>Sessão iniciada.</p>
                    {status.session.unapplied && status.session.unapplied.length > 0 && (
                      <ul className="mt-1 list-disc pl-4 text-muted">
                        {status.session.unapplied.map((note, i) => (
                          <li key={i}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {status.kind === "error" && <p className="text-sm text-danger">{status.message}</p>}

                <Button
                  variant="primary"
                  disabled={game.missing || !canAutoConfigure || status.kind === "launching" || isPendingInstall}
                  onClick={() => handlePlay(game)}
                >
                  {status.kind === "launching" ? "Abrindo…" : "Jogar"}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
