import { useEffect, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, ApiError, coverImageURL } from "../api";
import type { LibraryGame, Report } from "../api/types";
import {
  Badge,
  Button,
  Card,
  ConsoleVerdictCard,
  ErrorModal,
  FavoriteToggle,
  GameCover,
  InlineError,
  PlayIcon,
  ScreenContainer,
} from "../components/ui";
import { useIGDBStatus } from "../hooks/useIGDBStatus";
import { useLaunchGame } from "../hooks/useLaunchGame";
import { consoleAccentColor } from "../lib/consoleColor";

function formatPlaytime(seconds: number): string {
  if (seconds <= 0) return "nunca jogado";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h${remainder}min` : `${hours}h`;
}

function formatLastPlayed(iso: string | undefined): string {
  if (!iso) return "nunca jogado";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "nunca jogado";
  return date.toLocaleString("pt-BR");
}

/**
 * Tela de Detalhe do jogo (Sprint 3 do plano de migração visual, 2026-08-04
 * — /home/douglas/.claude/plans/sleepy-roaming-pearl.md). Inspirada em
 * `layout/src/App.tsx` (`GameDetailView`), mas só com painéis de dado real:
 * hero + "Jogar" grande + estatísticas de sessão. Sem `CommunityPanel`
 * (fórum — depende de backend de nuvem que não existe, ver docs/roadmap.md
 * Sprint E) e sem save states/conquistas do mock (`MY_DATA.saves`/
 * `achievements` — sem contrapartida de backend, não inventados aqui).
 *
 * Estatísticas: `playtime_seconds`/`last_played_at` já vêm no `LibraryGame`
 * recebido (a mesma junção com sessões que `GET /library/games` já faz —
 * não precisa recalcular). A contagem de sessões é a única coisa que exige
 * uma chamada própria (`GET /sessions`, filtrando por `rom_path` — o
 * launcher não conhece a biblioteca, ver docs/arquitetura-a-preservar.md).
 *
 * M6 (docs/sprint-m-plano.md, 2026-08-07): a tela ganhou `report`, pra
 * mostrar com o que o jogo vai rodar — o dado que faltava era exatamente
 * "o diferencial declarado do produto". Reaproveita `ConsoleVerdictCard`
 * (o mesmo cartão de `VerdictScreen`/`ConsoleInfoModal`), não um texto
 * novo: `verdict.headline` já cobre o caso "sem preset automático"
 * (`Level.Headline()`, `internal/verdict/catalog.go` — a frase para o
 * patamar "improvável" já diz "este hardware não alcança o mínimo
 * necessário", sem julgar a máquina, princípio 2 do `CLAUDE.md`). A
 * correção ao próprio plano: `GamesScreen` **não** mostrava
 * `verdict.emulator`/`verdict.preset` como texto — só usava esses campos
 * internamente para decidir o fluxo de instalação; o roadmap dizia que sim,
 * ficou desatualizado.
 */
export function GameDetailScreen({
  game,
  consoleName,
  shortName,
  year,
  report,
  onBack,
}: {
  game: LibraryGame;
  consoleName: string;
  shortName: string;
  /** Ano do console no catálogo — dado real (verdict.year), não inventado. */
  year?: number;
  report: Report;
  onBack: () => void;
}) {
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { statusFor, launch, launchError, clearLaunchError } = useLaunchGame();
  const igdbConfigured = useIGDBStatus();
  // Estado próprio, não `game.cover_url` direto: o prop `game` vem de um
  // snapshot guardado no App.tsx no momento do clique e não muda sozinho
  // depois de uma busca de capa bem-sucedida nesta tela.
  const [coverUrl, setCoverUrl] = useState(game.cover_url);
  const [scrapingCover, setScrapingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  // Mesmo raciocínio de coverUrl: estado próprio, não game.favorite direto,
  // porque o snapshot em App.tsx não muda sozinho depois do toggle aqui.
  const [favorite, setFavorite] = useState(game.favorite);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  // M6: "abrir a pasta do jogo" — erro fica colado no botão (mesmo padrão
  // de favoriteError/coverError), não solto pela tela.
  const [folderError, setFolderError] = useState<string | null>(null);
  // "Revarrer pasta" (2026-08-17, a pedido do Douglas): mesma ação que já
  // existia em LibraryScreen (Revarrer/Remover por pasta), só que acessível
  // sem sair da tela do jogo — não precisa voltar até a Biblioteca e achar
  // o console/pasta certos lá. Só "revarrer" aqui, não "remover": remover
  // apagaria a pasta inteira (todos os jogos dela), ação grande demais para
  // botão perdido na tela de UM jogo — essa continua só em LibraryScreen.
  const [rescanState, setRescanState] = useState<
    { kind: "idle" } | { kind: "rescanning" } | { kind: "done"; gamesFound: number } | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    setCoverUrl(game.cover_url);
    setFavorite(game.favorite);
  }, [game.id, game.cover_url, game.favorite]);

  function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    setFavoriteError(null);
    const call = next ? api.favoriteGame(game.id) : api.unfavoriteGame(game.id);
    call.catch(() => {
      setFavorite(!next);
      setFavoriteError("Não foi possível salvar o favorito. Tente de novo.");
    });
  }

  function pollCoverJob(jobId: string) {
    api
      .getScrapeJob(jobId)
      .then((job) => {
        if (job.phase === "concluido") {
          setScrapingCover(false);
          const result = job.results[0];
          if (result?.status === "error") {
            setCoverError(result.message ?? "Não foi possível buscar a capa deste jogo.");
          } else if (result?.status === "not_found") {
            setCoverError("O IGDB não tem capa para este jogo.");
          } else {
            // Encontrada: recarrega este jogo para pegar o cover_url novo —
            // a rota de busca não devolve o caminho da capa, só o status.
            api
              .getLibraryGames(game.console_id)
              .then((res) => {
                const updated = res.games.find((g) => g.id === game.id);
                if (updated) setCoverUrl(updated.cover_url);
              })
              .catch(() => {});
          }
          return;
        }
        if (job.phase === "falhou") {
          setScrapingCover(false);
          setCoverError(job.error ?? "Não foi possível buscar a capa agora.");
          return;
        }
        setTimeout(() => pollCoverJob(jobId), 400);
      })
      .catch((err) => {
        setScrapingCover(false);
        setCoverError(err instanceof ApiError ? err.message : "Não foi possível acompanhar a busca de capa.");
      });
  }

  function handleScrapeCover() {
    setCoverError(null);
    setScrapingCover(true);
    api
      .scrapeCovers(game.id)
      .then((job) => pollCoverJob(job.id))
      .catch((err) => {
        setScrapingCover(false);
        setCoverError(err instanceof ApiError ? err.message : "Não foi possível iniciar a busca de capa.");
      });
  }

  // M6 — abrir a pasta do jogo no explorador de arquivos do SO, com o
  // arquivo já selecionado. `revealItemInDir` (não `openPath` + dirname
  // calculado à mão): evita reimplementar dirname pros dois separadores de
  // caminho (Windows usa `\`, o resto usa `/`) e já entrega o arquivo em
  // destaque, não só a pasta aberta. Nunca um link — só revela o que já
  // está no disco do usuário (regra 6 do CLAUDE.md).
  async function openGameFolder() {
    setFolderError(null);
    try {
      await revealItemInDir(game.path);
    } catch (err) {
      setFolderError(`Não foi possível abrir a pasta do jogo: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function rescanFolder() {
    setRescanState({ kind: "rescanning" });
    try {
      const res = await api.rescanLibraryFolder(game.folder_id);
      setRescanState({ kind: "done", gamesFound: res.games_found });
    } catch (err) {
      setRescanState({
        kind: "error",
        message: err instanceof ApiError ? err.message : "Não foi possível revarrer esta pasta.",
      });
    }
  }

  useEffect(() => {
    api
      .getSessions()
      .then((res) => {
        setSessionCount(res.sessions.filter((s) => s.rom_path === game.path).length);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível ler as sessões."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.path]);

  const status = statusFor(game.id);
  const verdict = report.verdicts.find((v) => v.console_id === game.console_id);
  const heroCoverUrl = coverImageURL(coverUrl);

  const heroContent = (
    <>
      {/* O7 media esta capa contra um container que ainda crescia em janela
          grande — o N3 (docs/roadmap.md, Sprint N) tornou `reading` um teto
          fixo (`ScreenContainer`, motivo no comentário de lá: tela de
          leitura não fica mais útil esticada em 4K), então a capa também
          volta a ser fixa — não há mais "espaço sobrando" para acompanhar. */}
      <div className="relative w-full max-w-[220px]">
        <GameCover label={shortName} consoleId={game.console_id} coverUrl={heroCoverUrl} size="lg" />
        <FavoriteToggle favorite={favorite} onToggle={toggleFavorite} className="absolute top-1.5 right-1.5" />
        {favoriteError && <InlineError className="mt-1">{favoriteError}</InlineError>}
        {igdbConfigured && (
          <div className="mt-2">
            <Button variant="secondary" disabled={scrapingCover} onClick={handleScrapeCover} className="w-full text-xs">
              {scrapingCover ? "Buscando…" : coverUrl ? "Buscar capa de novo" : "Buscar capa"}
            </Button>
            {coverError && <InlineError className="mt-1">{coverError}</InlineError>}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{game.title}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge accentColor={consoleAccentColor(game.console_id)}>{consoleName}</Badge>
            {year !== undefined && <Badge>{year}</Badge>}
            {game.missing && <Badge>arquivo ausente</Badge>}
          </div>
        </div>

        <Button
          variant="primary"
          autoFocus
          disabled={game.missing || status.kind === "launching"}
          onClick={() => launch(game)}
          className="flex w-fit items-center gap-2 px-8 py-3 text-lg"
        >
          {/* N14 (docs/roadmap.md, Sprint N): era o caractere "▶". */}
          {status.kind === "error" ? "Tentar de novo" : (
            <>
              <PlayIcon size={16} />
              Jogar
            </>
          )}
        </Button>

        {game.missing && (
          <InlineError>O arquivo deste jogo não foi encontrado na última varredura da pasta.</InlineError>
        )}

        {/* M6: nenhum link, nenhuma sugestão de onde obter o arquivo (regra
            6 do CLAUDE.md) — só revela o que já está no disco do usuário. */}
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={openGameFolder} className="w-fit">
              Abrir pasta do jogo
            </Button>
            {/* "Revarrer pasta": mesma ação de LibraryScreen, sem precisar
                voltar até lá. Não bloqueia o resto da tela — erro e
                resultado ficam colados no botão. */}
            <Button
              variant="secondary"
              disabled={rescanState.kind === "rescanning"}
              onClick={rescanFolder}
              className="w-fit"
            >
              {rescanState.kind === "rescanning" ? "Revarrendo…" : "Revarrer pasta"}
            </Button>
          </div>
          {folderError && <InlineError>{folderError}</InlineError>}
          {rescanState.kind === "done" && (
            <p className="text-xs text-ink">
              {rescanState.gamesFound} jogo(s) encontrado(s) nesta pasta.
            </p>
          )}
          {rescanState.kind === "error" && <InlineError>{rescanState.message}</InlineError>}
          <p className="truncate text-xs text-muted" title={game.path}>
            {game.path}
          </p>
        </div>
      </div>
    </>
  );

  return (
    <ScreenContainer variant="reading">
      {/* A contagem de sessões falhar não impede o resto da tela de
          funcionar — mas o texto vermelho solto dentro do card de
          estatísticas era fácil de perder (mesmo achado do Douglas em
          GamesScreen/AllGamesScreen, 2026-08-07). `favoriteError`/
          `coverError`/`folderError` continuam inline, de propósito: aparecem
          colados no botão que falhou (favoritar, buscar capa, abrir pasta),
          não soltos pela tela. */}
      {launchError ? (
        <ErrorModal title="Não foi possível abrir o jogo" message={launchError} onClose={clearLaunchError} />
      ) : (
        error && <ErrorModal title="Não foi possível ler as estatísticas" message={error} onClose={() => setError(null)} />
      )}

      <Button variant="secondary" onClick={onBack} className="mb-4">
        Voltar
      </Button>

      {/* M6: fundo do topo com a própria capa desfocada — só quando existe
          capa real. Sem capa, o topo fica exatamente como estava (nada de
          padding/fundo novo por cima do placeholder de sigla). */}
      {heroCoverUrl ? (
        <div className="relative overflow-hidden rounded-lg">
          <img
            src={heroCoverUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-3xl"
          />
          <div className="relative flex flex-col gap-5 p-6 sm:flex-row">{heroContent}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row">{heroContent}</div>
      )}

      {/* M6: com o que o jogo vai rodar — o diferencial declarado do
          produto, que faltava nesta tela. Mesmo cartão de VerdictScreen/
          ConsoleInfoModal, não um texto novo: já cobre emulador+preset,
          "sem preset automático" (via headline) e o gargalo nomeado. */}
      {verdict && (
        <div className="mt-6">
          <ConsoleVerdictCard verdict={verdict} />
        </div>
      )}

      <Card className="mt-6">
        <h2 className="mb-3 font-pixel text-[11px] tracking-wide text-muted uppercase">Suas estatísticas</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted">Tempo jogado</p>
            <p className="text-lg text-ink">{formatPlaytime(game.playtime_seconds)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Última vez</p>
            <p className="text-lg text-ink">{formatLastPlayed(game.last_played_at)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Sessões</p>
            <p className="text-lg text-ink">{sessionCount === null ? "…" : sessionCount}</p>
          </div>
        </div>
      </Card>
    </ScreenContainer>
  );
}
