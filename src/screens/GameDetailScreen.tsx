import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, ApiError, coverImageURL } from "../api";
import type { EmulatorEntry, LibraryGame, Report } from "../api/types";
import {
  BackButton,
  Badge,
  Button,
  Card,
  ConfirmModal,
  ConsoleVerdictCard,
  ErrorModal,
  FavoriteToggle,
  GameCover,
  InlineError,
  inputClass,
  ManualInstallModal,
  PlayIcon,
  ProgressBar,
  ScreenContainer,
  SectionHeading,
  Toast,
} from "../components/ui";
import { useInlineInstall } from "../hooks/useInlineInstall";
import { useLaunchGame } from "../hooks/useLaunchGame";
import { useToast } from "../hooks/useToast";
import { evaluateGameLaunchability } from "../lib/gameLaunchability";
import { consoleAccentColor } from "../lib/consoleColor";
import { faseExtraDeDownload, percentOf } from "../lib/format";
import { useT } from "../i18n/i18n";
import { dict } from "./GameDetailScreen.i18n";

function formatPlaytime(
  seconds: number,
  neverPlayedText: string,
  lessThanOneMinText: string,
  minUnitText: string,
  hUnitText: string,
): string {
  if (seconds <= 0) return neverPlayedText;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return lessThanOneMinText;
  if (minutes < 60) return `${minutes} ${minUnitText}`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}${hUnitText}${remainder}${minUnitText}` : `${hours}${hUnitText}`;
}

function formatLastPlayed(iso: string | undefined, neverPlayedText: string): string {
  if (!iso) return neverPlayedText;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return neverPlayedText;
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
 * necessário", sem julgar a máquina, princípio 2 do `CLAUDE.md`).
 *
 * Redesenho visual (2026-09-07, continuação do redesenho da tela inicial):
 * nenhuma funcionalidade mudou — o que mudou foi a tela passar a falar a
 * mesma língua visual do resto do app. O hero adotou as camadas de
 * `GameHero` (arte desfocada pesada + tingimento na cor do console + piso de
 * `--paper` + scanlines) e passou a existir **sempre**, com e sem capa; a
 * capa ganhou o halo na cor de identidade do console que os cards de linha já
 * usavam como borda esquerda; e os três cards empilhados viraram uma grade
 * `lg:grid-cols-3` que promove o parecer — a resposta que a tela existe para
 * dar — para a coluna maior, ao lado das caixas de estatísticas e de arquivo.
 * A
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
  onOpenConsole,
}: {
  game: LibraryGame;
  consoleName: string;
  shortName: string;
  /** Ano do console no catálogo — dado real (verdict.year), não inventado. */
  year?: number;
  /** Ausente sem consentimento/scan — "Jogar" continua funcionando (sem
   * preset autoconfigurado), só o card de parecer some. */
  report?: Report;
  onBack: () => void;
  /** Q5: leva ao detalhe do console deste jogo, onde ficam as instruções de
   * instalação manual (RetroArch, Dolphin). */
  onOpenConsole?: () => void;
}) {
  const t = useT(dict);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emulators, setEmulators] = useState<EmulatorEntry[] | null>(null);
  // 2026-09-09: recarrega a contagem de sessões quando o jogo abre de fato —
  // era o único número desta tela que ficava velho até um F5.
  const { statusFor, launch, cancelCoreDownload, launchError, clearLaunchError } = useLaunchGame({
    onLaunched: () => {
      api
        .getSessions()
        .then((res) => setSessionCount(res.sessions.filter((s) => s.rom_path === game.path).length))
        .catch(() => {});
    },
  });
  const { toastMessage, showToast } = useToast();
  // Estado próprio, não `game.cover_url` direto: o prop `game` vem de um
  // snapshot guardado no App.tsx no momento do clique e não muda sozinho
  // depois de uma busca de capa bem-sucedida nesta tela.
  const [coverUrl, setCoverUrl] = useState(game.cover_url);
  const [scrapingCover, setScrapingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  // 2026-09-08, a pedido do Douglas: troca manual de capa, independente do
  // IGDB estar configurado — mesma mecânica de setConsoleImage
  // (ConsoleDetailScreen). `coverVersion` força o <img> a recarregar depois
  // da troca: o arquivo físico sempre se chama "cover.jpg", então
  // sobrescrevê-lo não muda a URL, e o navegador reaproveitaria a versão
  // antiga do cache sem esse empurrão.
  const [changingCover, setChangingCover] = useState(false);
  const [coverChangeError, setCoverChangeError] = useState<string | null>(null);
  const [coverVersion, setCoverVersion] = useState(0);
  // Mesmo raciocínio de coverUrl: estado próprio, não game.favorite direto,
  // porque o snapshot em App.tsx não muda sozinho depois do toggle aqui.
  const [favorite, setFavorite] = useState(game.favorite);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  // Título editável à mão (2026-09-09): `title` é o de exibição já resolvido
  // pelo servidor; `titleOverride` diz se há o que "restaurar ao padrão".
  // Estado próprio pelo mesmo motivo de coverUrl/favorite: o snapshot em
  // App.tsx não muda sozinho depois de editar aqui.
  const [title, setTitle] = useState(game.title);
  const [titleOverride, setTitleOverride] = useState(game.title_override);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(game.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
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
  // "Remover da biblioteca" (2026-09-09, a pedido do Douglas): esconde o jogo
  // da biblioteca sem tocar o arquivo no disco (regra 6 do CLAUDE.md — o ZeuX
  // nunca mexe na ROM) e sem que ele volte no próximo rescan. Reversível pelo
  // filtro "Ocultos" de "Todos os jogos". Confirmação porque some da tela;
  // `danger` porque é a ação mais destrutiva desta tela.
  const [confirmingExclude, setConfirmingExclude] = useState(false);
  const [excluding, setExcluding] = useState(false);
  const [excludeError, setExcludeError] = useState<string | null>(null);
  // `game.excluded` vem do snapshot em App.tsx: `true` quando a tela foi
  // aberta a partir do filtro "Ocultos" de Todos os jogos. Nesse caso a ação
  // é o inverso — "Trazer de volta" — e não precisa de confirmação (revelar
  // não some com nada).
  const excluded = game.excluded;

  async function excludeFromLibrary() {
    setExcluding(true);
    setExcludeError(null);
    try {
      await api.excludeGame(game.id);
      // Volta para a lista — o jogo já não aparece mais lá (a tela remonta e
      // rebusca). Não há para onde "ficar": a tela é deste jogo específico.
      onBack();
    } catch (err) {
      setExcludeError(err instanceof ApiError ? err.message : t("errorRemovingFromLibrary"));
      setExcluding(false);
    }
  }

  async function restoreToLibrary() {
    setExcluding(true);
    setExcludeError(null);
    try {
      await api.unexcludeGame(game.id);
      onBack();
    } catch (err) {
      setExcludeError(err instanceof ApiError ? err.message : t("errorRemovingFromLibrary"));
      setExcluding(false);
    }
  }

  useEffect(() => {
    setCoverUrl(game.cover_url);
    setFavorite(game.favorite);
    setTitle(game.title);
    setTitleOverride(game.title_override);
    setEditingTitle(false);
    setTitleError(null);
  }, [game.id, game.cover_url, game.favorite, game.title, game.title_override]);

  // `value` vazio limpa o override e volta ao título derivado do nome do
  // arquivo. A resposta traz o `title` de exibição já resolvido — não é
  // preciso rebuscar a listagem.
  async function saveTitle(value: string) {
    setSavingTitle(true);
    setTitleError(null);
    try {
      const res = await api.setGameTitle(game.id, value);
      setTitle(res.title);
      setTitleOverride(res.title_override);
      setEditingTitle(false);
      showToast(res.title_override ? t("titleSaved") : t("titleRestored"));
    } catch (err) {
      setTitleError(err instanceof ApiError ? err.message : t("errorSavingTitle"));
    } finally {
      setSavingTitle(false);
    }
  }

  // B4 (achado do critico-design, 2026-08-18): favoritar confirmava em
  // AllGamesScreen e ficava mudo aqui e em GamesScreen.
  function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    setFavoriteError(null);
    const call = next ? api.favoriteGame(game.id) : api.unfavoriteGame(game.id);
    call
      .then(() => showToast(next ? t("addedToFavorites") : t("removedFromFavorites")))
      .catch(() => {
        setFavorite(!next);
        setFavoriteError(t("errorSavingFavorite"));
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
            setCoverError(result.message ?? t("errorSearchingCover"));
          } else if (result?.status === "not_found") {
            setCoverError(t("errorCoverNotFound"));
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
          setCoverError(job.error ?? t("errorSearchingCoverGeneric"));
          return;
        }
        setTimeout(() => pollCoverJob(jobId), 400);
      })
      .catch((err) => {
        setScrapingCover(false);
        setCoverError(err instanceof ApiError ? err.message : t("errorSearchingCoverGeneric"));
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
        setCoverError(err instanceof ApiError ? err.message : t("errorInitiatingCoverSearch"));
      });
  }

  async function handleChangeCover() {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: t("imageFileFilter"), extensions: ["png", "jpg", "jpeg"] }],
    });
    if (typeof picked !== "string") return;

    setChangingCover(true);
    setCoverChangeError(null);
    try {
      const res = await api.setGameCover(game.id, picked);
      setCoverUrl(res.cover_url);
      setCoverVersion((v) => v + 1);
    } catch (err) {
      setCoverChangeError(err instanceof ApiError ? err.message : t("errorChangingCover"));
    } finally {
      setChangingCover(false);
    }
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
      setFolderError(t("errorOpeningFolder", { error: err instanceof Error ? err.message : String(err) }));
    }
  }

  async function rescanFolder() {
    setRescanState({ kind: "rescanning" });
    try {
      const res = await api.rescanLibraryFolder(game.folder_id);
      setRescanState({ kind: "done", gamesFound: res.games_found });
      // B4 (achado do critico-design, 2026-08-18): o resultado ficava como
      // `<p>` que nunca somia sozinho, preso embaixo do botão.
      showToast(t("gamesFoundAfterRescan", { count: res.games_found }));
    } catch (err) {
      setRescanState({
        kind: "error",
        message: err instanceof ApiError ? err.message : t("errorRescanningFolder"),
      });
    }
  }

  useEffect(() => {
    api
      .getSessions()
      .then((res) => {
        setSessionCount(res.sessions.filter((s) => s.rom_path === game.path).length);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("errorReadingSessions")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.path, t]);

  useEffect(() => {
    api
      .getEmulators()
      .then((res) => setEmulators(res.emulators))
      .catch(() => setEmulators([]));
  }, []);

  const status = statusFor(game.id);
  const verdict = report?.verdicts.find((v) => v.console_id === game.console_id);
  const heroCoverUrl = coverImageURL(coverUrl, coverVersion || undefined);
  const accent = consoleAccentColor(game.console_id);

  // 2026-09-09 (princípio 5: informar, nunca bloquear): até esta data o botão
  // "Jogar" desta tela chamava `launch(game)` direto — sem instalar o
  // emulador que falta, sem confirmar BIOS vazio, sem oferecer "jogar assim
  // mesmo" num console sem preset. As duas outras telas de jogo já
  // compunham `useInlineInstall` (a cadeia de decisão compartilhada); esta
  // era a lacuna registrada no doc comment de `GamesScreen`. Agora o clique
  // passa pela mesma `handlePlay`, que ramifica por motivo.
  const adapterEntry = verdict?.adapter_id
    ? (emulators ?? []).find((e) => e.adapter_id === verdict.adapter_id)
    : undefined;
  const launchability = emulators ? evaluateGameLaunchability(game, verdict, adapterEntry) : undefined;
  const install = useInlineInstall({
    onEmulatorInstalled: (adapterId) =>
      setEmulators((prev) => (prev ?? []).map((e) => (e.adapter_id === adapterId ? { ...e, installed: true } : e))),
    onLaunch: () => launch(game),
  });
  const pendingInstall =
    (install.state.kind === "installing" ||
      install.state.kind === "confirm-hardware" ||
      install.state.kind === "confirm-bios") &&
    install.state.pendingGamePath === game.path;
  const playBusy =
    game.missing || status.kind === "launching" || status.kind === "downloading-core" || pendingInstall;

  async function openBiosFolder(dir: string) {
    try {
      await openPath(dir);
    } catch (err) {
      setFolderError(t("errorOpeningFolder", { error: err instanceof Error ? err.message : String(err) }));
    }
  }

  const heroContent = (
    <>
      {/* Tamanho de capa fixo por design (não acompanha o teto da tela): uma
          capa maior que isso não fica mais útil, só mais vazia ao redor —
          mesmo raciocínio de `ConsoleIcon`/badges no CLAUDE.md (elemento de
          tamanho de design fixo, não área que deveria crescer com a janela).
          A tela em volta é `variant="listing"` (wide) desde 2026-09-06 — a
          variante `"reading"` que existia antes foi removida a pedido do
          Douglas, ver comentário em `ScreenContainer`. */}
      {/* `shrink-0` (2026-09-07): sem ele o `flex-1` da coluna de texto
          espremia a capa quando o título é longo — o `max-w` sozinho é teto,
          não piso. */}
      <div className="w-full max-w-[220px] shrink-0">
        {/* Halo na cor de identidade do console em volta da arte — a mesma
            regra dos cards de linha (`ConsoleVerdictCard`, `EmulatorCard`),
            que ali é uma borda esquerda de 3px e aqui contorna a peça toda,
            porque nesta tela a capa é o objeto e não uma linha de lista. Fica
            num wrapper só da capa, não na coluna inteira: o botão "Buscar
            capa" e o erro logo abaixo não fazem parte da arte e não deveriam
            entrar na moldura. A sombra desenha a borda (`0 0 0 1px`) em vez
            de `border`, para não somar 1px ao lado de fora do
            `aspect-[3/4]` que a própria `GameCover` mantém. */}
        <div
          className="relative rounded-lg"
          style={{
            boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 55%, var(--line-strong)), 0 0 34px -10px color-mix(in srgb, ${accent} 90%, transparent)`,
          }}
        >
          <GameCover label={shortName} consoleId={game.console_id} coverUrl={heroCoverUrl} size="lg" />
          <FavoriteToggle favorite={favorite} onToggle={toggleFavorite} className="absolute top-1.5 right-1.5" />
        </div>
        {favoriteError && <InlineError className="mt-1">{favoriteError}</InlineError>}
        {/* Troca manual (2026-09-08), independente de conta IGDB conectada —
            "Buscar capa" abaixo é a fonte automática, esta é o escape hatch
            pra quando ela erra ou não acha nada. */}
        <div className="mt-2">
          <Button variant="chrome" disabled={changingCover} onClick={handleChangeCover} className="w-full">
            {changingCover ? t("searching") : t("changeCover")}
          </Button>
          {coverChangeError && <InlineError className="mt-1">{coverChangeError}</InlineError>}
        </div>
        {/* Sempre visível (2026-09-08) — ver o mesmo comentário em
            AllGamesScreen.tsx: a busca tenta libretro-thumbnails antes do
            IGDB, então não precisa de conta conectada pra valer a pena. */}
        <div className="mt-2">
          {/* `chrome` (2026-09-07): mesma variante que "Buscar capas" da
              biblioteca — a mesma ação, em escopo de um jogo só, não
              deveria ter outro visual. O `text-xs` que estava no
              `className` era exatamente a correção que a variante agora
              faz por padrão. */}
          <Button variant="chrome" disabled={scrapingCover} onClick={handleScrapeCover} className="w-full">
            {scrapingCover ? t("searching") : coverUrl ? t("searchCoverAgain") : t("searchCover")}
          </Button>
          {coverError && <InlineError className="mt-1">{coverError}</InlineError>}
        </div>
      </div>

      {/* Achado #5 do critico-layout-biblioteca (2026-09-06): o hero lia como
          "card ampliado", não como página — título do mesmo tamanho de uma
          seção qualquer, e "Jogar" competindo em peso visual com "Abrir
          pasta"/"Revarrer" logo abaixo. `justify-center` dá presença vertical
          ao bloco de texto sem depender de esticar a capa (que já é
          `aspect-[3/4]` fixa por design, comentário acima); as ações de
          arquivo saíram para a seção "Arquivo" mais abaixo — "Jogar" agora é
          a única ação primária aqui.

          `max-w-3xl` (2026-09-07) é teto, não largura (CLAUDE.md, layout
          responsivo): a coluna continua encolhendo livre com a janela — o teto
          só impede que o texto alcance a faixa direita do gradiente do hero,
          onde a arte volta a aparecer e o contraste deixa de ser garantido.
          Mesma precaução de `GameHero`. */}
      <div className="flex min-w-0 max-w-3xl flex-1 flex-col justify-center gap-4">
        <div>
          {editingTitle ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveTitle(titleDraft);
              }}
            >
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                aria-label={t("titleInputLabel")}
                placeholder={game.title}
                className={inputClass}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" disabled={savingTitle || titleDraft.trim() === ""}>
                  {savingTitle ? t("savingTitle") : t("saveTitle")}
                </Button>
                <Button type="button" variant="secondary" disabled={savingTitle} onClick={() => setEditingTitle(false)}>
                  {t("cancelTitle")}
                </Button>
                {titleOverride !== "" && (
                  <Button
                    type="button"
                    variant="chrome"
                    disabled={savingTitle}
                    onClick={() => void saveTitle("")}
                  >
                    {t("restoreDerivedTitle")}
                  </Button>
                )}
              </div>
              {titleError && <InlineError>{titleError}</InlineError>}
            </form>
          ) : (
            <div className="flex items-start gap-2">
              <h1 className="text-3xl font-semibold text-balance text-ink sm:text-4xl">{title}</h1>
              {/* `chrome` (chrome de arquivo, não ação sobre conteúdo) — mesma
                  família de "Abrir pasta"/"Trocar capa". */}
              <Button
                variant="chrome"
                className="mt-1 shrink-0"
                onClick={() => {
                  setTitleDraft(title);
                  setTitleError(null);
                  setEditingTitle(true);
                }}
              >
                {t("editTitle")}
              </Button>
            </div>
          )}
          {!editingTitle && titleOverride !== "" && (
            <p className="mt-1 text-xs text-muted">{t("titleIsCustom")}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge accentColor={accent}>{consoleName}</Badge>
            {year !== undefined && <Badge>{year}</Badge>}
            {game.missing && <Badge>{t("missingFile")}</Badge>}
          </div>
        </div>

        <Button
          variant="primary"
          autoFocus
          disabled={playBusy}
          // 2026-09-09: passa pela cadeia de decisão compartilhada
          // (`useInlineInstall.handlePlay`) em vez de `launch` direto —
          // instala o emulador que falta, confirma BIOS vazio, e num console
          // sem preset deixa o clique cair no lançamento sem `options` (o
          // emulador abre na config padrão dele). Princípio 5.
          onClick={() => install.handlePlay(game, verdict, adapterEntry)}
          className="flex w-fit items-center gap-2 px-8 py-3 text-lg"
        >
          {/* N14 (docs/roadmap.md, Sprint N): era o caractere "▶".
              A4 (achado do critico-design, 2026-08-18): o botão só
              desabilitava durante "launching", sem trocar o rótulo — o
              clique mais importante do produto ficava sem retorno até a
              janela do emulador subir. Mesma técnica de "Salvando…" em
              EmulatorConfigPanel. */}
          {pendingInstall && install.state.kind === "installing" ? (
            t("installingEmulator")
          ) : status.kind === "error" ? (
            t("retryButton")
          ) : status.kind === "launching" ? (
            t("opening")
          ) : status.kind === "downloading-core" ? (
            // R3 (ADR 0015): mesma razão do "Abrindo…" acima — o clique mais
            // importante do produto não pode ficar mudo. Aqui a espera é bem
            // maior (centenas de MB), então o rótulo diz o que está
            // acontecendo, e o progresso detalhado vem logo abaixo.
            t("downloadingCore")
          ) : launchability && !launchability.launchable && launchability.reason === "not_installed" ? (
            t("installAndPlay")
          ) : (
            <>
              <PlayIcon size={16} />
              {t("playButton")}
            </>
          )}
        </Button>

        {/* Princípios 2 e 3: quando o jogo não abre no clique simples, dizer
            o motivo — e, para "sem preset", qual componente barra (a frase
            já vem pronta de `evaluateGameLaunchability`, derivada de
            `verdict.bottlenecks`). Nunca julga a máquina. O botão acima
            continua funcionando: em "sem preset" ele lança assim mesmo. */}
        {launchability &&
          !launchability.launchable &&
          (launchability.reason === "no_preset" || launchability.reason === "bios_empty") && (
            <p className="max-w-md text-sm text-amber">{launchability.title}</p>
          )}

        {pendingInstall && install.state.kind === "installing" && (
          <div className="w-full max-w-md">
            <p className="font-mono text-xs tracking-wider text-muted uppercase">
              {t("installingEmulatorPhase", { phase: install.state.job.phase })}
            </p>
            <div className="mt-1.5">
              <ProgressBar percent={percentOf(install.state.job)} />
            </div>
          </div>
        )}

        {/* R3 (ADR 0015): o jogo abre sozinho quando o download terminar —
            até lá, dizer o que falta e deixar desistir. Mesma dupla
            "texto + ProgressBar" que a instalação de emulador já usa em
            GamesScreen, para não inventar um segundo vocabulário de espera. */}
        {status.kind === "downloading-core" && (
          <div className="w-full max-w-md">
            <p className="text-sm text-muted">
              {t("coreDownloadingMessage", {
                core_name: status.job.core_name ?? "",
                extra: faseExtraDeDownload(status.job.phase),
                percent: percentOf(status.job) !== null ? ` · ${percentOf(status.job)}%` : "",
              })}
            </p>
            <div className="mt-1">
              <ProgressBar percent={percentOf(status.job)} label={t("downloadingCoreLabel", { core_name: status.job.core_name ?? "" })} />
            </div>
            <Button
              className="mt-2"
              variant="secondary"
              onClick={() => cancelCoreDownload(game.id, status.job)}
            >
              {t("cancelDownload")}
            </Button>
          </div>
        )}

        {game.missing && (
          <InlineError>{t("fileMissingError")}</InlineError>
        )}
      </div>
    </>
  );

  return (
    <ScreenContainer variant="listing">
      {/* A contagem de sessões falhar não impede o resto da tela de
          funcionar — mas o texto vermelho solto dentro do card de
          estatísticas era fácil de perder (mesmo achado do Douglas em
          GamesScreen/AllGamesScreen, 2026-08-07). `favoriteError`/
          `coverError`/`folderError` continuam inline, de propósito: aparecem
          colados no botão que falhou (favoritar, buscar capa, abrir pasta),
          não soltos pela tela. */}
      {toastMessage && <Toast message={toastMessage} />}
      {confirmingExclude && (
        <ConfirmModal
          title={t("removeFromLibraryTitle")}
          message={t("removeFromLibraryConfirm", { title })}
          onClose={() => setConfirmingExclude(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setConfirmingExclude(false)}>
                {t("cancelRemove")}
              </Button>
              <Button
                variant="danger"
                autoFocus
                onClick={() => {
                  setConfirmingExclude(false);
                  void excludeFromLibrary();
                }}
              >
                {t("removeFromLibrary")}
              </Button>
            </>
          }
        />
      )}
      {launchError ? (
        <ErrorModal title={t("errorOpeningGame")} message={launchError} onClose={clearLaunchError} />
      ) : install.state.kind === "error" ? (
        <ErrorModal
          title={t("couldNotInstallEmulator")}
          message={install.state.message}
          onClose={() => install.setState({ kind: "idle" })}
        />
      ) : (
        error && <ErrorModal title={t("errorReadingStats")} message={error} onClose={() => setError(null)} />
      )}

      {/* 2026-09-09: as mesmas confirmações das outras telas de jogo (M8/N13)
          — instalar/lançar mesmo assim toca disco/rede ou ignora um aviso de
          compatibilidade, então vira modal. */}
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
                    {t("cancelRemove")}
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

      {install.state.kind === "confirm-bios" && (
        <ConfirmModal
          title={t("biosAbsent")}
          message={t("biosEmptyMessage")}
          onClose={() => install.setState({ kind: "idle" })}
          actions={
            <>
              <Button variant="secondary" onClick={() => install.setState({ kind: "idle" })}>
                {t("cancelRemove")}
              </Button>
              {adapterEntry?.bios_dir && (
                <Button variant="secondary" onClick={() => openBiosFolder(adapterEntry.bios_dir!)}>
                  {t("openBiosFolder")}
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => {
                  install.setState({ kind: "idle" });
                  launch(game);
                }}
              >
                {t("playAnyway")}
              </Button>
            </>
          }
        />
      )}

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

      <BackButton label={t("backButton")} onClick={onBack} />

      {/* Hero (redesenho de 2026-09-07). Antes: a capa desfocada entrava como
          `opacity-30 blur-3xl` **e só quando existia capa real** — sem capa, o
          topo perdia moldura, fundo e presença, e a mesma tela tinha duas
          aparências muito diferentes conforme o IGDB tivesse respondido ou
          não. Agora as camadas são sempre as mesmas de `GameHero` (a faixa de
          retomada da tela inicial), com o fallback de gradiente na cor do
          console no lugar da arte: um vocabulário só de "arte de fundo" no
          app, não um por tela.

          Por que `opacity-30` saiu: opacidade achata a arte inteira contra o
          fundo e mata a cor junto com o contraste. O par
          `brightness-[0.55] saturate-[1.8]` + tingimento na cor de identidade
          em `mix-blend-overlay` guarda a cor (é o que o Douglas pediu na
          faixa inicial) e o piso de contraste vem de uma camada separada de
          `--paper`, que não depende do brilho da arte por baixo dela. Com 88%
          de `--paper` sobre arte a 55% de brilho, `--ink` (12.6:1 sobre
          `--paper` puro) e `--muted` (7.62:1) passam com folga em todo o
          trecho onde há texto — a coluna de texto tem teto de largura
          justamente para não alcançar a faixa direita, onde a arte reaparece.
          `scale-150`, não `scale-125`: blur de 64px revela a beira do frame
          se o elemento não estourar a área visível com margem. */}
      <div
        className="relative overflow-hidden rounded-xl border"
        style={{
          borderColor: `color-mix(in srgb, ${accent} 45%, var(--line))`,
          boxShadow: `0 0 60px -16px color-mix(in srgb, ${accent} 85%, transparent)`,
        }}
      >
        <div aria-hidden="true" className="absolute inset-0">
          {heroCoverUrl ? (
            <img
              src={heroCoverUrl}
              alt=""
              className="h-full w-full scale-150 object-cover blur-3xl brightness-[0.55] saturate-[1.8]"
            />
          ) : (
            <div
              className="h-full w-full"
              style={{ background: `linear-gradient(135deg, ${accent}55, transparent 65%)` }}
            />
          )}
          <div
            className="absolute inset-0 mix-blend-overlay"
            style={{ background: `linear-gradient(135deg, ${accent}, transparent 70%)`, opacity: 0.55 }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to right, var(--paper) 0%, color-mix(in srgb, var(--paper) 90%, transparent) 55%, color-mix(in srgb, var(--paper) 88%, transparent) 72%, color-mix(in srgb, var(--paper) 18%, transparent) 100%)",
            }}
          />
          {/* Mesmas linhas de CRT da abertura do app e da faixa inicial — a
              marca aparece na mesma língua nos três lugares, não em três. */}
          <div className="zeux-scanlines absolute inset-0 opacity-40" />
        </div>

        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:gap-6 sm:p-6">{heroContent}</div>
      </div>

      {/* Três cards de largura total empilhados viravam uma fita muito longa
          numa janela larga (`ScreenContainer` chega a 2000px): cada card com
          três linhas de texto e 1900px de vazio à direita, e a resposta que a
          tela existe para dar ("com o que este jogo vai rodar") empurrada
          para baixo por rolagem. A grade põe o parecer na coluna maior, ao
          lado das duas caixas de serviço.

          `lg:` (1024px), não `xl:`: o breakpoint mede a janela inteira, e a
          área útil aqui já perde a sidebar (64px) e a barra de rolagem
          (~16px) — um `xl:` nunca dispararia no tamanho padrão da janela
          (1280px, `src-tauri/tauri.conf.json`). Regra registrada no
          CLAUDE.md, aprendida num bug real. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* M6: com o que o jogo vai rodar — o diferencial declarado do
            produto, que faltava nesta tela. Mesmo cartão de VerdictScreen/
            ConsoleInfoModal, não um texto novo: já cobre emulador+preset,
            "sem preset automático" (via headline) e o gargalo nomeado.
            Ganhou título de seção (2026-09-07) porque, fora da grade de 33
            consoles da VerdictScreen, um card solto embaixo do hero não
            dizia sozinho o que ele responde. O título fala do jogo, nunca da
            máquina (princípio 2 do CLAUDE.md). */}
        {verdict && (
          <section className="lg:col-span-2">
            <SectionHeading className="mb-3">{t("howItRuns")}</SectionHeading>
            <ConsoleVerdictCard verdict={verdict} />
          </section>
        )}

        {/* Sem parecer (console fora do catálogo, ou relatório sem esse
            console), a coluna de serviço ocupa a largura toda em vez de
            deixar duas colunas vazias à esquerda dela. */}
        <div className={`flex flex-col gap-6 ${verdict ? "" : "lg:col-span-3"}`}>
          <section>
            <SectionHeading className="mb-3">{t("yourStats")}</SectionHeading>
            <Card>
              {/* Empilhado em linhas rotuladas, não em três colunas: na
                  coluna estreita da grade os valores ("nunca jogado",
                  "07/09/2026 21:14") quebravam em duas linhas cada um e
                  desalinhavam entre si. Rótulo em `font-mono` caixa alta é o
                  mesmo acabamento de legenda que `Callout`/`Badge` já usam —
                  nenhum estilo novo entra no projeto. O valor em `font-mono`
                  alinha os dígitos verticalmente, que é a única razão de a
                  fonte mudar aqui. */}
              <dl className="flex flex-col gap-3">
                {[
                  {
                    label: t("playtime"),
                    value: formatPlaytime(
                      game.playtime_seconds,
                      t("neverPlayed"),
                      t("lessThanOneMinute"),
                      t("minuteUnit"),
                      t("hourUnit"),
                    ),
                  },
                  { label: t("lastPlayed"), value: formatLastPlayed(game.last_played_at, t("neverPlayed")) },
                  { label: t("sessions"), value: sessionCount === null ? "…" : String(sessionCount) },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="font-mono text-xs tracking-wide text-muted uppercase">{stat.label}</dt>
                    <dd className="mt-0.5 font-mono text-lg text-ink">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </section>

          {/* Achado #5 do critico-layout-biblioteca: "Abrir pasta"/"Revarrer"
              moraram no hero até esta sessão, competindo em peso visual com
              "Jogar" — a única ação primária que um hero deveria ter. Viraram
              seção própria, mesmo texto/comportamento de antes (M6: nenhum
              link, nenhuma sugestão de onde obter o arquivo, regra 6 do
              CLAUDE.md — só revela o que já está no disco do usuário). */}
          <section>
            <SectionHeading className="mb-3">{t("fileHeading")}</SectionHeading>
            <Card>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button variant="chrome" onClick={openGameFolder} className="w-fit">
                    {t("openGameFolder")}
                  </Button>
                  <Button
                    variant="chrome"
                    disabled={rescanState.kind === "rescanning"}
                    onClick={rescanFolder}
                    className="w-fit"
                  >
                    {rescanState.kind === "rescanning" ? t("rescanning") : t("rescanFolder")}
                  </Button>
                </div>
                {folderError && <InlineError>{folderError}</InlineError>}
                {rescanState.kind === "error" && <InlineError>{rescanState.message}</InlineError>}
                {/* `font-mono`: é um caminho de arquivo, e o `title` continua
                    carregando o valor inteiro quando o `truncate` corta. */}
                <p className="truncate font-mono text-xs text-muted" title={game.path}>
                  {game.path}
                </p>
              </div>
            </Card>
          </section>

          {/* "Remover da biblioteca" (2026-09-09): esconde este jogo da lista.
              O arquivo continua no disco — o ZeuX nunca o toca (regra 6). Fica
              numa seção própria, longe de "Jogar", com o botão em `danger`
              já em repouso: é a única ação irreversível-na-prática da tela
              (dá pra desfazer pelo filtro "Ocultos", mas o usuário não sabe
              disso no momento do clique). */}
          <section>
            <SectionHeading className="mb-3">
              {excluded ? t("restoreHeading") : t("removeHeading")}
            </SectionHeading>
            <Card>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">
                  {excluded ? t("restoreToLibraryHelp") : t("removeFromLibraryHelp")}
                </p>
                {excluded ? (
                  <Button
                    variant="chrome"
                    disabled={excluding}
                    onClick={() => void restoreToLibrary()}
                    className="w-fit"
                  >
                    {excluding ? t("removing") : t("restoreToLibrary")}
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    disabled={excluding}
                    onClick={() => setConfirmingExclude(true)}
                    className="w-fit"
                  >
                    {excluding ? t("removing") : t("removeFromLibrary")}
                  </Button>
                )}
                {excludeError && <InlineError>{excludeError}</InlineError>}
              </div>
            </Card>
          </section>
        </div>
      </div>
    </ScreenContainer>
  );
}
