import { useVirtualizer } from "@tanstack/react-virtual";
import { openPath } from "@tauri-apps/plugin-opener";
import { Clock, EyeOff, FileX, Star } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { api, ApiError } from "../api";
import type { ConsoleEntry, ConsoleVerdict, EmulatorEntry, LibraryGame, Report, ScrapeJob } from "../api/types";
import { rescanAllFoldersIfStale } from "../lib/autoRescan";
import {
  Badge,
  Button,
  ConfirmModal,
  EmptyState,
  ErrorModal,
  FOCUS_RING,
  inputClass,
  ProgressBar,
  ScreenContainer,
  ScreenHeader,
  SectionHeading,
  InlineError,
  ManualInstallModal,
  Toast,
  ZSelect,
} from "../components/ui";
import { SelectItem } from "../components/ui/select";
import { useToast } from "../hooks/useToast";
import { useT } from "../i18n/i18n";
import { dict } from "./AllGamesScreen.i18n";
import { GameHero } from "../components/GameHero";
import { GameListRow } from "../components/GameListRow";
import { GameTile, GameTileSkeleton } from "../components/GameTile";
import { useInlineInstall } from "../hooks/useInlineInstall";
import { useLaunchGame } from "../hooks/useLaunchGame";
import { consoleAccentColor } from "../lib/consoleColor";
import { faseExtraDeDownload, percentOf } from "../lib/format";
import { evaluateGameLaunchability } from "../lib/gameLaunchability";

// M15 (docs/sprint-m-plano.md, decidido pelo Douglas em 2026-08-07): 24 nunca
// fechava fileira numa grade de 5 ou 6 colunas; 30 é múltiplo dos dois. O
// `defaultLibraryPageSize` do servidor (internal/api/server.go) acompanha o
// mesmo valor — os dois divergiam em silêncio antes desta sprint.
const PAGE_SIZE = 30;
// Espera digitar antes de consultar o backend — evita uma requisição por
// tecla. 300ms é o padrão comum para busca "enquanto digita".
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Estado de navegação da tela — M4 (docs/sprint-m-plano.md, decidido pelo
 * Douglas em 2026-08-07: "opção (a)"): mora em `App.tsx`, não aqui dentro.
 * Antes, `AllGamesScreen` guardava `page`/`search`/`platformFilter` em
 * `useState` próprio — abrir um jogo desmontava a tela (App.tsx troca de
 * `phase` num `switch`) e voltar remontava do zero, perdendo tudo. Subir
 * este pedaço de estado para o componente pai, que nunca desmonta, resolve
 * sem precisar manter duas telas montadas ao mesmo tempo (a outra opção
 * cogitada, descartada por manter complexidade extra por menos ganho).
 *
 * `sort`/`viewMode` (M3) entraram no mesmo objeto — precisam sobreviver a
 * abrir um jogo e voltar igual ao resto, mas **também** a reabrir o app
 * inteiro (critério do item), por isso os dois têm espelho em
 * `localStorage` (`loadInitialAllGamesView`/`persistAllGamesView` abaixo).
 * `page`/`search`/`platformFilter` não têm esse espelho de propósito —
 * reabrir o app numa busca antiga seria mais confuso que útil.
 */
export type SortValue = "recentes" | "titulo" | "tempo_jogado";
export type ViewMode = "grade" | "lista";

export interface AllGamesViewState {
  page: number;
  search: string;
  platformFilter: string | null;
  favoriteOnly: boolean;
  // 2026-09-08, a pedido do Douglas: jogos cujo arquivo sumiu (pasta trocada
  // ou revarrida sem achar o ROM de novo) ficam fora da lista por padrão —
  // antes apareciam misturados com o resto, só com um badge. Ligado, mostra
  // só os ausentes, nunca os dois juntos — mesmo filtro que `favoriteOnly`,
  // resolvido no servidor (ver ListAllGames em internal/library/library.go).
  missingOnly: boolean;
  // 2026-09-09, a pedido do Douglas: "filtro por hora de jogo". Ligado, mostra
  // só os jogos já abertos ao menos uma vez (playtime > 0) — resolvido no
  // servidor (`?played=true`), depois da junção com as sessões.
  playedOnly: boolean;
  // 2026-09-09: contrapartida de "Remover da biblioteca". Por padrão os jogos
  // que o usuário escondeu ficam fora da lista; ligado, mostra só eles — o
  // caminho para revelar de volta (mesma mecânica de `missingOnly`).
  excludedOnly: boolean;
  sort: SortValue;
  viewMode: ViewMode;
}

export const DEFAULT_ALL_GAMES_VIEW: AllGamesViewState = {
  page: 1,
  search: "",
  platformFilter: null,
  favoriteOnly: false,
  missingOnly: false,
  playedOnly: false,
  excludedOnly: false,
  sort: "recentes",
  viewMode: "grade",
};

const SORT_VALUES: readonly SortValue[] = ["recentes", "titulo", "tempo_jogado"];
const VIEW_MODES: readonly ViewMode[] = ["grade", "lista"];

const SORT_STORAGE_KEY = "zeux.allGames.sort";
const VIEW_MODE_STORAGE_KEY = "zeux.allGames.viewMode";

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  } catch {
    // localStorage indisponível (modo privado, quota, WebView restrito) —
    // preferência de tela, não dado crítico; cai no padrão em silêncio.
    return fallback;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // mesma tolerância do read acima — não é motivo pra quebrar a tela.
  }
}

/** Lazy initializer de `App.tsx` — só sort/viewMode vêm do localStorage. */
export function loadInitialAllGamesView(): AllGamesViewState {
  return {
    ...DEFAULT_ALL_GAMES_VIEW,
    sort: readStored(SORT_STORAGE_KEY, SORT_VALUES, DEFAULT_ALL_GAMES_VIEW.sort),
    viewMode: readStored(VIEW_MODE_STORAGE_KEY, VIEW_MODES, DEFAULT_ALL_GAMES_VIEW.viewMode),
  };
}

/** Chamado por `App.tsx` a cada mudança de view — só grava o que precisa sobreviver a reabrir o app. */
export function persistAllGamesView(patch: Partial<AllGamesViewState>) {
  if (patch.sort) writeStored(SORT_STORAGE_KEY, patch.sort);
  if (patch.viewMode) writeStored(VIEW_MODE_STORAGE_KEY, patch.viewMode);
}

// M3 (virtualização): quantas colunas a grade tem, replicando os
// breakpoints do próprio className abaixo (`grid-cols-2 sm: md: lg: 2xl:
// min-[2400px]:`).
// Precisa ser calculado em JS porque a virtualização substitui o
// `display: grid` que faria isso sozinho — cada "linha" virtualizada tem
// que saber quantos jogos ela carrega. Mede a LARGURA DA JANELA, não a do
// container: os breakpoints do Tailwind são media query sobre viewport,
// não sobre elemento (CLAUDE.md, "layout responsivo").
// O5 (docs/roadmap.md, Sprint O): as duas faixas acima de 1536px são novas —
// antes a densidade parava em 6 colunas para sempre a partir daí, e como o
// container também tinha teto fixo (ver o comentário no JSX abaixo), a capa
// só encolhia (208px em 1280px de janela -> 170px em 1536px+) sem nunca
// ganhar coluna nenhuma. Nada abaixo de 1536 muda — é o que o critério de
// aceite do O5 exige (sem regressão em 1024/1280/1366px).
const GRID_BREAKPOINTS: readonly [minWidth: number, columns: number][] = [
  [2400, 9], // janela ~4K
  [1536, 7], // 2xl
  [1024, 5], // lg
  [768, 4], // md
  [640, 3], // sm
  [0, 2],
];
function columnsForWidth(width: number): number {
  for (const [min, columns] of GRID_BREAKPOINTS) {
    if (width >= min) return columns;
  }
  return 2;
}
function useGridColumns(): number {
  const [columns, setColumns] = useState(() => columnsForWidth(window.innerWidth));
  useEffect(() => {
    function onResize() {
      setColumns(columnsForWidth(window.innerWidth));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return columns;
}

/**
 * Tela "Todos os jogos" (2026-08-04, a pedido do Douglas): landing page
 * depois do parecer, junta jogos de qualquer console numa lista só, sem
 * precisar escolher o console primeiro — "clicar direto e começar a jogar".
 * Paginada (não scroll infinito), com page_size fixo — GET /library/games
 * sem console_id (ver internal/api/server.go, handleListLibraryGames).
 *
 * Sprint 2 do plano de migração visual (2026-08-04 —
 * /home/douglas/.claude/plans/sleepy-roaming-pearl.md): busca por título
 * (`?q=` no backend — acha o jogo em qualquer página, não só na carregada)
 * e filtro por plataforma. M4 (2026-08-07) moveu o filtro de plataforma do
 * cliente para o servidor (`?platform=<console_id>`); M3 (mesma data)
 * acrescentou ordenação (`?sort=`), modo lista e virtualização — a página do
 * servidor continua limitada a `PAGE_SIZE`, a virtualização é sobre o DOM
 * **daquela página**, não substitui a paginação.
 *
 * M8 (mesma data): a checagem "este jogo pode abrir?" e o fluxo de
 * instalação inline (antes exclusivos de `GamesScreen`) passaram a valer
 * aqui também, via `evaluateGameLaunchability`/`useInlineInstall`
 * (src/lib/gameLaunchability.ts, src/hooks/useInlineInstall.ts) — mesma
 * regra nas duas telas, critério do próprio item. O que muda é só a
 * apresentação: a grade é virtualizada (M3), então confirmação de hardware
 * fraco/BIOS vazio vira `ConfirmModal` (screen-level, um por vez) em vez do
 * painel inline por tile que `GamesScreen` usa — inserir um painel dentro de
 * uma linha virtualizada quebraria a altura uniforme que `useVirtualizer`
 * exige. Pelo mesmo motivo, o progresso de instalação vira um painel
 * flutuante fixo (não preso a um tile): se o usuário rolar a grade e o tile
 * que disparou a instalação sair da viewport, a linha virtualizada dele é
 * desmontada — um indicador por tile sumiria com ela.
 */
export function AllGamesScreen({
  report,
  consoleCatalog,
  onOpenLibrary,
  onOpenGame,
  onOpenConsole,
  view,
  onViewChange,
  scrollElementRef,
  initialScrollTop,
}: {
  /** Ausente sem consentimento/scan — a biblioteca continua funcionando
   * (jogos abrem sem preset autoconfigurado), só o badge de compatibilidade
   * some. Nome/sigla de console então vêm de `consoleCatalog`. */
  report?: Report;
  /** `GET /consoles` — nome/sigla/ano por console, independente de scan.
   * Fonte de nome quando `report` está ausente ou não cobre o console. */
  consoleCatalog: ConsoleEntry[];
  onOpenLibrary: () => void;
  onOpenGame: (game: LibraryGame, consoleName: string, shortName: string) => void;
  /** Q5: leva ao detalhe do console do jogo, onde ficam as instruções de
   * instalação manual. */
  onOpenConsole?: (consoleId: string) => void;
  /** Página/busca/filtro/ordem/modo atuais — controlados por App.tsx (M4). */
  view: AllGamesViewState;
  /** Patch parcial — só os campos que mudaram, como o `setState` de objeto. */
  onViewChange: (patch: Partial<AllGamesViewState>) => void;
  /**
   * M3 (virtualização): o elemento que rola de verdade é `<main>`, em
   * `App.tsx` — sobrevive à troca de fase (M4), esta tela nunca teve o
   * próprio scroll container. `useVirtualizer` precisa dele pra saber o que
   * está visível.
   */
  scrollElementRef: RefObject<HTMLElement | null>;
  /**
   * M4: a rolagem salva antes de abrir o jogo. Só é aplicada **depois** que
   * `games` deixa de ser `null` — antes disso a grade não tem altura
   * nenhuma pra rolar, e o navegador zeraria de volta sozinho (achado
   * testando ao vivo: aplicar isto num efeito do `App.tsx`, disparado só
   * por `phase`, rodava cedo demais, antes da resposta assíncrona de
   * `GET /library/games` chegar).
   */
  initialScrollTop: number;
}) {
  const t = useT(dict);
  const { page, search, platformFilter, favoriteOnly, missingOnly, playedOnly, excludedOnly, sort, viewMode } = view;
  const [games, setGames] = useState<LibraryGame[] | null>(null);
  const [total, setTotal] = useState(0);
  // Consoles presentes no resultado completo (M4) — vem do servidor, não é
  // mais calculado sobre a página carregada.
  const [consoles, setConsoles] = useState<string[]>([]);
  // Inicializado a partir de `search` (não ""): ao voltar do detalhe com uma
  // busca já digitada, a primeira requisição já sai com o termo certo, sem
  // esperar os 300ms de debounce de novo.
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());
  const [error, setError] = useState<string | null>(null);
  // 2026-09-09: fechar o ciclo pós-jogo sem F5. `GamesScreen` já recarregava
  // a lista logo após lançar; aqui o lançamento passa pelo `useLaunchGame`,
  // que agora avisa quando o jogo abriu de fato. Recarrega a grade e a faixa
  // "Continue jogando" — não a tela inteira, e sem tocar `restoredScrollRef`
  // (que já travou na primeira restauração do M4), então a rolagem do
  // usuário fica onde está.
  const { statusFor, launch, activeCoreDownload, cancelCoreDownload, launchError, clearLaunchError, retryLaunch } =
    useLaunchGame({
      onLaunched: () => {
        loadGames();
        loadRecentGames();
      },
    });
  const { toastMessage, showToast } = useToast();
  const [scrapeJob, setScrapeJob] = useState<ScrapeJob | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const columns = useGridColumns();
  // M8: carregado uma vez só para a tela inteira — diferente de GamesScreen
  // (um console por vez), aqui os jogos abrangem qualquer console, então o
  // lookup de adapter é por jogo (`adapterEntryFor` abaixo), não fixo.
  const [emulators, setEmulators] = useState<EmulatorEntry[] | null>(null);
  // Achado do critico-layout-biblioteca (2026-09-06): a tela era uma grade
  // única sem hierarquia nenhuma — toda a biblioteca com o mesmo peso
  // visual, do jogo jogado ontem ao nunca aberto. Faixa própria, independente
  // dos filtros/ordenação da grade principal (sempre "recentes", sempre sem
  // busca/plataforma) — o padrão que Steam/Epic/GOG adotaram em 2019 para dar
  // à biblioteca "um lugar a que pertencer" em vez de só um catálogo.
  // `?sort=` nem precisa ser passado: é o padrão do servidor para
  // `console_id` vazio (handleListLibraryGames, internal/api/server.go) —
  // jogado mais recentemente primeiro, nunca jogado no fim. O filtro
  // `playtime_seconds > 0` corta esse fim: a faixa só existe para quem já
  // jogou algo, nunca aparece com jogos aleatórios só para preencher espaço.
  const [recentGames, setRecentGames] = useState<LibraryGame[] | null>(null);

  useEffect(() => {
    api
      .getEmulators()
      .then((res) => setEmulators(res.emulators))
      .catch(() => setEmulators([]));
  }, []);

  function loadRecentGames() {
    api
      .getAllLibraryGames(1, 1)
      .then((res) => setRecentGames(res.games.filter((g) => g.playtime_seconds > 0)))
      .catch(() => setRecentGames([]));
  }

  useEffect(loadRecentGames, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Buscar (ou trocar o filtro de favoritos/ausentes) reseta pra página 1 —
  // senão "página 3" de um filtro novo quase sempre estaria vazia.
  // `isFirstRun` existe para NÃO resetar a página restaurada (M4) quando a
  // tela remonta com uma busca/filtro que já vieram de antes — sem ele,
  // voltar do detalhe na página 3 com busca "mario" cairia direto na página
  // 1 de novo, o exato bug que o item corrige.
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    onViewChange({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, favoriteOnly, missingOnly, playedOnly, excludedOnly]);

  // M4: restaura a rolagem uma vez só, na primeira vez que `games` chega
  // depois do mount — depois disso, `restoredScrollRef` trava, pra não
  // brigar com a rolagem do próprio usuário a cada recarregamento de página
  // (ex.: trocar de página não deveria voltar pra rolagem antiga).
  const restoredScrollRef = useRef(false);
  useEffect(() => {
    if (restoredScrollRef.current) return;
    if (!games || !scrollElementRef.current) return;
    scrollElementRef.current.scrollTop = initialScrollTop;
    restoredScrollRef.current = true;
  }, [games, initialScrollTop, scrollElementRef]);

  // Achado #3 do critico-layout-biblioteca (2026-09-06): paginação numerada
  // numa grade que já é virtualizada (`useVirtualizer`, abaixo) é o sinal
  // clássico de "isso parece um formulário de admin" — nenhum launcher de
  // referência (Steam, GOG, Epic, Playnite, ES-DE) pagina biblioteca.
  //
  // `page` continua existindo no estado hoisted de App.tsx, mas muda de
  // sentido: não é mais "qual página está na tela", é "quantas páginas de
  // PAGE_SIZE itens já foram carregadas" — começa em 1, sobe quando o
  // usuário chega perto do fim da lista (efeito `loadingMore` abaixo). Por
  // isso `loadGames` busca da página 1 até `page` (em paralelo) e concatena,
  // em vez de substituir: refazer as páginas já vistas custa pouco (consulta
  // local ao SQLite) e mantém a reconstrução do M4 funcionando de graça — ao
  // voltar do detalhe com `page=3` já hoisted, a tela busca as 3 páginas de
  // uma vez, só então `games` fica não-nulo, e só então a rolagem salva
  // (`restoredScrollRef`, abaixo) encontra altura suficiente pra se aplicar.
  const [loadingMore, setLoadingMore] = useState(false);

  function loadGames() {
    const pagesToFetch = Array.from({ length: page }, (_, i) => i + 1);
    Promise.all(
      pagesToFetch.map((p) =>
        api.getAllLibraryGames(p, PAGE_SIZE, {
          query: debouncedSearch || undefined,
          favoriteOnly,
          missingOnly,
          playedOnly,
          excludedOnly,
          platform: platformFilter ?? undefined,
          sort,
        }),
      ),
    )
      .then((responses) => {
        const last = responses[responses.length - 1];
        setGames(responses.flatMap((r) => r.games));
        setTotal(last.total);
        setConsoles(last.consoles);
        // A plataforma escolhida pode ter deixado de existir no resultado
        // (busca/favoritos mudaram e não sobrou jogo daquele console) — cai
        // pra "todos" em vez de continuar filtrando por algo que já não
        // aparece nem nos próprios chips.
        if (platformFilter && !last.consoles.includes(platformFilter)) {
          onViewChange({ platformFilter: null });
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("failedToListGames")))
      .finally(() => setLoadingMore(false));
  }

  useEffect(loadGames, [page, debouncedSearch, favoriteOnly, missingOnly, playedOnly, excludedOnly, platformFilter, sort]);

  // Auto-rescan (2026-09-06): "Todos os jogos" é a tela de entrada mais
  // comum do app (ver comentário de App.tsx sobre a fase "all-games") — é
  // aqui que um jogo copiado recentemente teria mais chance de aparecer sem
  // o usuário precisar saber que existe um botão "Revarrer" escondido em
  // "Gerenciar pastas" (ver src/lib/autoRescan.ts).
  useEffect(() => {
    rescanAllFoldersIfStale().then(() => {
      loadGames();
      // A revarredura pode ter disparado um lote automático de capas no
      // servidor — só agora ele existe para ser adotado.
      adoptRunningScrapeJob();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle otimista (G4): atualiza a lista na hora, sem esperar a resposta
  // nem recarregar a página inteira. Se a chamada falhar, desfaz.
  function toggleFavorite(game: LibraryGame) {
    const next = !game.favorite;
    setGames((prev) => (prev ? prev.map((g) => (g.id === game.id ? { ...g, favorite: next } : g)) : prev));
    setRecentGames((prev) => (prev ? prev.map((g) => (g.id === game.id ? { ...g, favorite: next } : g)) : prev));
    // N9 (docs/roadmap.md, Sprint N): a estrela já muda na hora (otimista,
    // acima) — o toast aqui é sutil de propósito, só reforça pra quem não
    // olhou o ícone no instante do clique. Só no sucesso: um "desfeito"
    // duplicado em cima do próprio `setError` do catch abaixo seria ruído.
    const call = next ? api.favoriteGame(game.id) : api.unfavoriteGame(game.id);
    call
      .then(() => showToast(next ? t("addedToFavorites") : t("removedFromFavorites")))
      .catch(() => {
        setGames((prev) => (prev ? prev.map((g) => (g.id === game.id ? { ...g, favorite: !next } : g)) : prev));
        setRecentGames((prev) => (prev ? prev.map((g) => (g.id === game.id ? { ...g, favorite: !next } : g)) : prev));
        setError(t("failedToSaveFavorite"));
      });
  }

  // Busca de capas em lote (G1, docs/roadmap.md) — poll com setTimeout
  // recursivo (não setInterval, mesmo padrão de EmulatorsScreen.pollJob),
  // pra nunca sobrepor duas checagens da mesma busca.
  function pollScrapeJob(jobId: string) {
    api
      .getScrapeJob(jobId)
      .then((job) => {
        setScrapeJob(job);
        if (job.phase === "concluido") {
          const found = job.results.filter((r) => r.status === "found").length;
          const notFound = job.results.length - found;
          // B4 (achado do critico-design, 2026-08-18): o resumo da busca em
          // lote ficava como `<p>` que nunca sumia sozinho — persistia até a
          // próxima busca. Virou toast, mesma confirmação de sucesso.
          showToast(
            notFound > 0
              ? t("scrapeCoversSuccess", { found, pluralFound: found === 1 ? "" : "s", pluralFoundEn: found === 1 ? "" : "s", notFound, pluralNotFound: notFound === 1 ? "" : "s" })
              : t("scrapeCoversSingleSuccess", { found, pluralFound: found === 1 ? "" : "s", pluralFoundEn: found === 1 ? "" : "s" }),
          );
          setScrapeJob(null);
          loadGames();
          return;
        }
        if (job.phase === "falhou") {
          setScrapeError(job.error ?? t("failedToScrapeCovers"));
          setScrapeJob(null);
          return;
        }
        setTimeout(() => pollScrapeJob(jobId), 400);
      })
      .catch((err) => {
        setScrapeError(err instanceof ApiError ? err.message : "Não foi possível acompanhar a busca de capas.");
        setScrapeJob(null);
      });
  }

  // 2026-09-09: o lote automático de capas (autoScrapeCovers no servidor,
  // disparado ao adicionar/revarrer pasta) roda sem a tela saber — sem um id
  // de job em mãos, o placeholder de sigla parado lia como "a busca falhou".
  // Aqui a tela pergunta ao servidor se há uma busca em andamento e, se
  // houver, mostra o mesmo progresso discreto do botão "Buscar capas".
  function adoptRunningScrapeJob() {
    if (scrapeJob) return;
    api
      .getScrapeJobs()
      .then((res) => {
        const running = res.jobs.find((j) => j.finished_at === null && j.phase !== "falhou");
        if (running) {
          setScrapeJob(running);
          pollScrapeJob(running.id);
        }
      })
      .catch(() => {
        // Sem indicador é melhor que um erro: a busca segue no servidor de
        // qualquer forma, e a próxima abertura da tela tenta de novo.
      });
  }

  useEffect(adoptRunningScrapeJob, []);

  function startScrapeCovers() {
    setScrapeError(null);
    api
      .scrapeCovers()
      .then((job) => {
        setScrapeJob(job);
        pollScrapeJob(job.id);
      })
      .catch((err) => setScrapeError(err instanceof ApiError ? err.message : t("failedToInitiateCoverScrape")));
  }

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

  // M8: fluxo de instalação inline compartilhado com GamesScreen.
  const install = useInlineInstall({
    onEmulatorInstalled: (adapterId) =>
      setEmulators((prev) => (prev ?? []).map((e) => (e.adapter_id === adapterId ? { ...e, installed: true } : e))),
    // A4 (achado do critico-design, 2026-08-18): clicar em ▶ não dava
    // nenhum retorno até a janela do emulador subir — no Windows, com o
    // antivírus varrendo o binário, isso pode não ser instantâneo. O toast
    // não espera a resposta do lançamento (que já tem seu próprio tratamento
    // de erro via `launchError`/`ErrorModal`) — é só o "recebi seu clique".
    onLaunch: (romPath) => {
      const game = games?.find((g) => g.path === romPath);
      if (game) {
        showToast(t("openingGame", { title: game.title }));
        launch(game);
      }
    },
  });

  function isPendingInstallFor(path: string): boolean {
    return (
      (install.state.kind === "installing" ||
        install.state.kind === "confirm-hardware" ||
        install.state.kind === "confirm-bios") &&
      install.state.pendingGamePath === path
    );
  }

  // Chips ordenados por rótulo visível (não por console_id cru) — só um
  // detalhe de leitura, o servidor já manda a lista deduplicada.
  const platformOptions = consoles
    .map((id) => ({ id, label: shortNameFor(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const gameCount = games?.length ?? 0;
  // M3: virtualização por linha — na grade, cada "linha" carrega `columns`
  // jogos lado a lado; na lista, uma linha é um jogo. O total de nós no DOM
  // fica limitado ao que cabe na viewport (+ overscan), não ao PAGE_SIZE
  // inteiro — é isto que o critério de aceite mede.
  const rowCount = viewMode === "grade" ? Math.ceil(gameCount / columns) : gameCount;
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElementRef.current,
    // Chute inicial — `measureElement` (abaixo) corrige pela altura real
    // renderizada, então não precisa ser exato (título pode quebrar em 1 ou
    // 2 linhas, mudando a altura de verdade da célula).
    estimateSize: () => (viewMode === "grade" ? 280 : 52),
    overscan: viewMode === "grade" ? 2 : 6,
    // Cola o offset do scroll ao trocar de página/ordenação/modo — sem isto
    // o virtualizer tentaria reaproveitar posições da lista anterior.
    // O3 (docs/roadmap.md, Sprint O): `columns` também entra na chave —
    // redimensionar a janela muda quantos jogos cabem por linha, então a
    // altura medida de uma linha em cache (calculada para o `columns`
    // antigo) ficava errada para o novo, e o scroll saltava (mais visível
    // ao arrastar a janela para um monitor de tamanho diferente).
    getItemKey: (index) => `${viewMode}-${columns}-${index}`,
  });

  // Gatilho do scroll infinito (achado #3, acima): dispara a próxima página
  // quando a última linha renderizada pelo virtualizer chega perto do fim da
  // lista já carregada — 3 linhas de folga, não a última exata, pra buscar
  // antes do usuário ver o chão da lista. `loadingMore` evita empilhar um
  // `onViewChange` por re-render de scroll enquanto a busca anterior ainda
  // não voltou; `games.length >= total` para de vez quando não sobra mais
  // página (server já devolveu tudo).
  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastVirtualItem = virtualItems[virtualItems.length - 1];
  useEffect(() => {
    if (!lastVirtualItem || !games) return;
    if (loadingMore) return;
    if (games.length >= total) return;
    if (lastVirtualItem.index < rowCount - 3) return;
    setLoadingMore(true);
    onViewChange({ page: page + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastVirtualItem?.index, rowCount, games, total, loadingMore]);

  // M8: mesma cadeia de decisão de GamesScreen — só varia o que cada tela
  // tem à mão (aqui, verdict/adapterEntry são resolvidos por jogo, não
  // fixos para um único console). Continua clicável em jogo `missing`
  // (deixa o erro real do servidor aparecer, em vez de esconder o botão) —
  // mesma escolha de GamesScreen.
  function playHandlerFor(game: LibraryGame): (() => void) | undefined {
    const launchStatus = statusFor(game.id).kind;
    if (launchStatus === "launching" || launchStatus === "downloading-core") return undefined;
    if (isPendingInstallFor(game.path)) return undefined;
    const verdict = verdictFor(game.console_id);
    return () => install.handlePlay(game, verdict, adapterEntryFor(verdict));
  }

  return (
    // O5 fixou o teto escalonado (nada muda abaixo de 1536px de janela; acima,
    // cresce até 2000px — motivo completo no comentário de `ScreenContainer`,
    // src/components/ui.tsx); N3 (Sprint N) moveu esse teto para lá, um único
    // lugar em vez de repetido em 5 telas.
    <ScreenContainer variant="listing">
      {/*
       * Um só modal por vez — antes disto, `error` (falha ao listar/
       * favoritar) aparecia como parágrafo vermelho solto no meio da tela
       * (achado numa sessão anterior, 2026-08-07: "não tá bom, nem
       * legível"). Mesmo motivo que criou o `ErrorModal` em 2026-08-04, só
       * que este caso nunca ganhou o mesmo tratamento.
       */}
      {launchError ? (
        <ErrorModal
          title={t("failedToOpenGame")}
          message={launchError}
          onClose={clearLaunchError}
          onRetry={retryLaunch}
        />
      ) : install.state.kind === "error" ? (
        <ErrorModal
          title={t("failedToInstallEmulator")}
          message={install.state.message}
          onClose={() => install.setState({ kind: "idle" })}
        />
      ) : (
        error && <ErrorModal title={t("failedToLoadLibrary")} message={error} onClose={() => setError(null)} />
      )}

      {/*
       * M8: confirmação de hardware fraco/BIOS vazio, em modal (não painel
       * inline por tile) — motivo no comentário da própria tela, acima. Só
       * um pode estar ativo por vez (`install.state` é único pra tela
       * inteira), então não precisa de prioridade entre os dois como o
       * bloco de erro acima.
       */}
      {/* Q5 (docs/roadmap.md, Sprint Q): fonte que o ZeuX não sabe automatizar
          (RetroArch, Dolphin). O clique não dispara mais uma instalação que o
          servidor recusa — leva ao detalhe do console, onde as instruções já
          moram. */}
      {install.state.kind === "manual-install" && (
        <ManualInstallModal
          adapterName={install.state.adapterName}
          onClose={() => install.setState({ kind: "idle" })}
          onOpenConsole={
            onOpenConsole
              ? () => {
                  const { consoleId } = install.state as { consoleId: string };
                  install.setState({ kind: "idle" });
                  onOpenConsole(consoleId);
                }
              : undefined
          }
        />
      )}

      {install.state.kind === "confirm-hardware" &&
        (() => {
          const confirmState = install.state;
          return (
            <ConfirmModal
              title={t("weakHardware")}
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
          const pendingGame = games?.find((g) => g.path === confirmState.pendingGamePath);
          const pendingVerdict = pendingGame ? verdictFor(pendingGame.console_id) : undefined;
          const pendingAdapterEntry = adapterEntryFor(pendingVerdict);
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

      {/* 2026-09-09: emulador instalado pelo clique em "Jogar", mas o console
          precisa de BIOS — avisa em vez de abrir numa tela preta. */}
      {install.state.kind === "bios-after-install" &&
        (() => {
          const s = install.state;
          const pendingGame = games?.find((g) => g.path === s.pendingGamePath);
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

      {/*
       * Painel flutuante, não modal — instalar não deveria travar o resto
       * da tela (o usuário pode continuar rolando/buscando enquanto baixa).
       * Fixo na tela, não no tile: ver comentário no topo do arquivo sobre
       * por que um indicador por tile não sobrevive à virtualização.
       */}
      {install.state.kind === "installing" ? (
        <div className="fixed right-4 bottom-4 z-40 w-72 rounded-lg border border-line bg-fill p-3 shadow-lg">
          {/* A11y 4.1.3: o texto de fase da instalação muda sozinho — sem
              `aria-live` o leitor de tela não anuncia o progresso a menos que
              o usuário volte o foco ao elemento. */}
          <p className="text-sm text-ink" aria-live="polite">
            Instalando {install.state.job.name}… {install.state.job.phase}
          </p>
          <div className="mt-2">
            <ProgressBar percent={percentOf(install.state.job)} />
          </div>
        </div>
      ) : activeCoreDownload ? (
        // R3 (ADR 0015): terceiro competidor pelo mesmo canto — encadeado no
        // ternário pelo mesmo motivo que o N9 registra abaixo, não como um
        // `&&` solto que se sobreporia ao painel de instalação.
        <div className="fixed right-4 bottom-4 z-40 w-72 rounded-lg border border-line bg-fill p-3 shadow-lg">
          {/* A11y 4.1.3: progresso que muda sozinho — anunciado por `aria-live`. */}
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
        // N9 (docs/roadmap.md, Sprint N): mesmo canto que o painel de
        // instalação acima — por isso o `ternário`, não dois `&&`
        // independentes: os dois competiriam pelo mesmo `fixed right-4
        // bottom-4`, um por cima do outro, se ambos ficassem verdadeiros ao
        // mesmo tempo (favoritar durante uma instalação em andamento).
        toastMessage && <Toast message={toastMessage} />
      )}

      <ScreenHeader
        title={
          <>
            {/* M12 (docs/sprint-m-plano.md): a partir de `total`, que
                `loadGames` já guarda em estado — sem chamada nova (critério
                do item). Ausente durante o carregamento inicial (`games`
                ainda `null`): a contagem some junto com o resto, não sobra
                sozinha.
                Achado do Douglas (2026-09-07): texto solto do mesmo tamanho
                do corpo, grudado no `<h1>` por um simples `· `, lia como
                "mal feito" — nenhum peso próprio ao lado de um título de
                28px. Virou `Badge` (mesmo componente que já mostra contagem
                em outras telas, ex.: "instalado pelo ZeuX"), com respiro de
                verdade (`ml-3`) em vez de colado no texto. */}
            Todos os jogos{" "}
            {games && (
              <span className="ml-3 inline-flex align-middle">
                <Badge title={t("gamesCountTitle", { count: total.toLocaleString("pt-BR") })}>
                  {total.toLocaleString("pt-BR")}
                </Badge>
              </span>
            )}
          </>
        }
        actions={
          <>
            {/* Sempre visível (2026-09-08) — antes só aparecia com conta do
                IGDB conectada, mas a busca tenta libretro-thumbnails primeiro
                (sem credencial nenhuma) e só recorre ao IGDB se essa fonte
                não achar, então esconder o botão sem conta escondia também a
                fonte livre. */}
            <div className="flex flex-col items-stretch gap-1">
              {/* M15 (docs/sprint-m-plano.md, 2026-08-07): o progresso saiu
                  do rótulo do botão (`Buscando capas… 7/30` crescia e
                  encolhia a cada jogo, empurrando o botão vizinho) e foi
                  pra `ProgressBar`, abaixo — mesmo componente que a
                  instalação inline já usa. Rótulo do botão agora é fixo. */}
              {/* `chrome`, não `secondary` (2026-09-07): buscar capa é
                  ação sobre o acervo, não sobre o jogo em foco — e ficava
                  a poucos pixels da régua de filtros já redesenhada, com
                  outro canto, outro tamanho de texto e outra caixa. Ver o
                  comentário da variante em components/ui.tsx. */}
              <Button variant="chrome" disabled={scrapeJob !== null} onClick={startScrapeCovers}>
                {scrapeJob ? t("fetchingCovers") : t("fetchCoversButton")}
              </Button>
              {scrapeJob && (
                <>
                  <ProgressBar percent={scrapeJob.total > 0 ? Math.round((scrapeJob.processed / scrapeJob.total) * 100) : null} />
                  {/* A11y 4.1.3: contador que muda sozinho — anunciado por
                      aria-live. O texto ("buscando capas… 12/48") diz o que
                      está acontecendo: um lote automático (adotado por
                      `adoptRunningScrapeJob`) roda sem nenhum clique do
                      usuário, e um número solto não explicava a si mesmo. */}
                  <p className="text-center text-xs text-muted" aria-live="polite">
                    {t("scrapingCoversProgress", { processed: scrapeJob.processed, total: scrapeJob.total })}
                  </p>
                </>
              )}
            </div>

            {/* Navegação de topo (Emuladores/Parecer) mudou para a sidebar
                (2026-08-04, Sprint 1) — "Gerenciar pastas" continua aqui
                porque é sub-navegação da própria Biblioteca, não um destino
                de primeiro nível. */}
            <Button variant="chrome" onClick={onOpenLibrary}>
              {t("manageFolders")}
            </Button>
          </>
        }
      />

      {scrapeError && (
        <InlineError className="mb-3">
          {scrapeError}{" "}
          <button type="button" onClick={startScrapeCovers} className="underline">
            {t("retryButton")}
          </button>
        </InlineError>
      )}

      {recentGames && recentGames.length > 0 && (
        // 2026-09-09 (pedido do Douglas): a seção "Continue jogando" mostra
        // só UM jogo — o último jogado — num `GameHero` de destaque. Antes
        // trazia o carrossel dos outros recentes abaixo do hero (`RecentStrip`,
        // removido): a grade principal, logo abaixo, já é ordenada por último
        // jogado por padrão, então o carrossel repetia os mesmos jogos duas
        // vezes na mesma tela. `getAllLibraryGames(1, 1)` filtrada por
        // `playtime_seconds > 0` — nenhum dado novo, só menos. O motivo do
        // destaque está no doc comment de `GameHero`.
        <div className="mb-8">
          <SectionHeading className="mb-3">{t("continuePlaying")}</SectionHeading>
          {(() => {
            const [featured] = recentGames;
            const featuredVerdict = verdictFor(featured.console_id);
            const featuredConsoleName = nameFor(featured.console_id);
            return (
              <GameHero
                game={featured}
                shortName={shortNameFor(featured.console_id)}
                onOpenDetail={() =>
                  onOpenGame(featured, featuredConsoleName, shortNameFor(featured.console_id))
                }
                onPlay={playHandlerFor(featured)}
                onToggleFavorite={() => toggleFavorite(featured)}
                launchability={
                  emulators
                    ? evaluateGameLaunchability(featured, featuredVerdict, adapterEntryFor(featuredVerdict))
                    : undefined
                }
                onInstall={
                  featuredVerdict?.adapter_id
                    ? () => install.handlePlay(featured, featuredVerdict, adapterEntryFor(featuredVerdict))
                    : undefined
                }
              />
            );
          })()}
        </div>
      )}

      {/* M3: uma barra só, com busca, ordenação, alternância grade/lista,
          favoritos e chips de plataforma — nada solto fora dela (critério
          do item).
          2026-09-06 (critico-design + auditoria de a11y): os chips saíram do
          `font-pixel text-[11px]` para Inter `text-xs` medium — um chip de
          filtro *ativável* é um controle, não badge nem título de navegação,
          e Press Start 2P a 11px colorido tem leitura ruim. Mesma decisão da
          N17 (que tirou a pixel font da sidebar), agora nos controles.
          2026-09-07: a decisão original do N4 (input/select em 38px, chips
          "de propósito mais baixos") foi revista pelo Douglas testando o app
          — "nem na mesma altura e tamanho dos selects, quero que deixe todos
          com mesmo tamanho". Toda a barra mede `h-9` (36px) agora: input,
          select, toggle grade/lista, chip de favoritos e chips de
          plataforma. Os chips ganharam junto o mesmo acabamento do `Button
          variant="chrome"` (borda `1.5px`, `font-mono`, friso claro no topo
          via `shadow` inset, resposta de `active:` ao clicar) — um vocabulário
          só de "controle físico" para toda a régua, não um por família. */}
      {/* 2026-09-07: a barra virou um painel de verdade (borda + fundo
          `--fill` + raio), em vez de controles soltos sobre o fundo da página.
          Motivo: com a faixa de destaque acima dela, uma linha de controles
          sem contorno ficava boiando entre dois blocos de peso visual alto e
          não lia mais como "a régua que manda na grade abaixo". Não é sticky
          de propósito — uma barra fixa no topo do `<main>` passaria por cima
          do tile focado ao navegar a grade por teclado/controle (WCAG 2.2,
          "focus not obscured"), e essa navegação é requisito real do produto,
          não detalhe. */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-fill/60 px-3 py-2.5">
        <label htmlFor="all-games-search" className="sr-only">
          {t("searchPlaceholder")}
        </label>
        <input
          id="all-games-search"
          type="text"
          name="all-games-search"
          autoComplete="off"
          value={search}
          onChange={(e) => onViewChange({ search: e.target.value })}
          placeholder={t("searchPlaceholder")}
          className={`${inputClass} max-w-xs`}
        />

        <ZSelect
          ariaLabel={t("sortByLabel")}
          value={sort}
          onValueChange={(v) => onViewChange({ sort: v as SortValue })}
          className="w-fit"
        >
          {SORT_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(value === "recentes" ? "sortRecentes" : value === "titulo" ? "sortTitulo" : "sortTempoJogado")}
            </SelectItem>
          ))}
        </ZSelect>

        <div
          className="flex h-9 items-center gap-1 rounded-sm border-[1.5px] border-line-strong p-0.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
          role="group"
          aria-label={t("viewModeLabel")}
        >
          {(["grade", "lista"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              onClick={() => onViewChange({ viewMode: mode })}
              className={`h-full rounded-sm px-2.5 font-mono text-xs font-medium tracking-wider uppercase transition duration-150 active:translate-y-px ${FOCUS_RING} ${
                viewMode === mode ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
              }`}
            >
              {mode === "grade" ? t("gridMode") : t("listMode")}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onViewChange({ favoriteOnly: !favoriteOnly })}
          aria-pressed={favoriteOnly}
          className={`flex h-9 items-center gap-1 rounded-sm border-[1.5px] px-2.5 font-mono text-xs font-medium tracking-wider uppercase shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition duration-150 active:translate-y-px active:shadow-none ${FOCUS_RING} ${
            favoriteOnly ? "border-amber text-amber" : "border-line-strong text-muted hover:text-ink"
          }`}
        >
          {/* N14 (docs/roadmap.md, Sprint N): era o caractere "★" — lucide
              agora é a família de ícone padrão do app. */}
          <Star size={11} fill={favoriteOnly ? "currentColor" : "none"} aria-hidden="true" />
          {t("favoritesLabel")}
        </button>
        <button
          type="button"
          onClick={() => onViewChange({ missingOnly: !missingOnly })}
          aria-pressed={missingOnly}
          className={`flex h-9 items-center gap-1 rounded-sm border-[1.5px] px-2.5 font-mono text-xs font-medium tracking-wider uppercase shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition duration-150 active:translate-y-px active:shadow-none ${FOCUS_RING} ${
            missingOnly ? "border-amber text-amber" : "border-line-strong text-muted hover:text-ink"
          }`}
        >
          <FileX size={11} aria-hidden="true" />
          {t("missingLabel")}
        </button>
        {/* 2026-09-09, a pedido do Douglas: "filtro por hora de jogo" — só os
            jogos já abertos alguma vez. Mesmo vocabulário de toggle de
            Favoritos/Ausentes. */}
        <button
          type="button"
          onClick={() => onViewChange({ playedOnly: !playedOnly })}
          aria-pressed={playedOnly}
          className={`flex h-9 items-center gap-1 rounded-sm border-[1.5px] px-2.5 font-mono text-xs font-medium tracking-wider uppercase shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition duration-150 active:translate-y-px active:shadow-none ${FOCUS_RING} ${
            playedOnly ? "border-amber text-amber" : "border-line-strong text-muted hover:text-ink"
          }`}
        >
          <Clock size={11} aria-hidden="true" />
          {t("playedLabel")}
        </button>
        {/* 2026-09-09: contrapartida de "Remover da biblioteca" — revela os
            jogos escondidos para poder trazê-los de volta. */}
        <button
          type="button"
          onClick={() => onViewChange({ excludedOnly: !excludedOnly })}
          aria-pressed={excludedOnly}
          className={`flex h-9 items-center gap-1 rounded-sm border-[1.5px] px-2.5 font-mono text-xs font-medium tracking-wider uppercase shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition duration-150 active:translate-y-px active:shadow-none ${FOCUS_RING} ${
            excludedOnly ? "border-amber text-amber" : "border-line-strong text-muted hover:text-ink"
          }`}
        >
          <EyeOff size={11} aria-hidden="true" />
          {t("excludedLabel")}
        </button>
        {platformOptions.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onViewChange({ platformFilter: null, page: 1 })}
              // A11y 4.1.2: os chips de plataforma são filtros alternáveis
              // mutuamente exclusivos — `aria-pressed` expõe qual está ativo
              // para o leitor de tela (o estilo só comunicava a quem vê).
              aria-pressed={platformFilter === null}
              className={`h-9 rounded-sm border-[1.5px] px-2.5 font-mono text-xs font-medium tracking-wider uppercase shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition duration-150 active:translate-y-px active:shadow-none ${FOCUS_RING} ${
                platformFilter === null ? "border-accent text-accent" : "border-line-strong text-muted hover:text-ink"
              }`}
            >
              {t("allPlatforms")}
            </button>
            {platformOptions.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => onViewChange({ platformFilter: id, page: 1 })}
                // C5: o chip ativo usava sempre roxo/`border-accent`, igual
                // pra qualquer console — a cor de marca (já usada nas capas
                // e no badge de plataforma) não cumpria papel nenhum de
                // navegação aqui. Filtrando um console, o chip ativo herda
                // a cor dele; "TODOS" continua roxo (não representa um
                // console específico).
                //
                // A11y 1.4.3 (auditoria de acessibilidade, 2026-09-06): a cor
                // de identidade por console reprova contraste como TEXTO em
                // ~metade dos 33 consoles (Nintendo, PS3, Saturn — cores de
                // marca, não de legibilidade), o mesmo motivo pelo qual `Badge`
                // já tinha largado `color: accentColor`. Agora a cor fica só na
                // borda + fundo tingido (`${accent}1a`); o texto do chip ativo
                // vai para `text-ink`, que passa contraste sobre qualquer
                // fundo do app.
                aria-pressed={platformFilter === id}
                style={
                  platformFilter === id
                    ? {
                        borderColor: consoleAccentColor(id),
                        background: `${consoleAccentColor(id)}1a`,
                        // 2026-09-07: o chip ativo tinha borda tingida e nada
                        // mais — num painel de chips todos com borda, "o que
                        // está ligado" dependia de comparar matizes de azul.
                        // O halo é a mesma linguagem de glow que a capa e a
                        // faixa de destaque já usam, e some junto com a borda
                        // quando o filtro é desligado.
                        boxShadow: `0 0 12px -4px ${consoleAccentColor(id)}`,
                      }
                    : undefined
                }
                className={`h-9 rounded-sm border-[1.5px] px-2.5 font-mono text-xs font-medium tracking-wider uppercase shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition duration-150 active:translate-y-px active:shadow-none ${FOCUS_RING} ${
                  platformFilter === id ? "text-ink" : "border-line-strong text-muted hover:text-ink"
                }`}
              >
                {label.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* M12 (docs/sprint-m-plano.md, 2026-08-07): skeleton na mesma grade,
          `PAGE_SIZE` células — antes, `games === null` não renderizava nada
          aqui, a tela ficava em branco entre abrir e a resposta de
          `GET /library/games` chegar. `role="status"`/`aria-live`: um
          anúncio só pra leitor de tela, não 30 (`GameTileSkeleton` é
          `aria-hidden` célula a célula). As colunas espelham
          `GRID_BREAKPOINTS` (acima) em classes Tailwind puras — não precisa
          de `useGridColumns()` aqui porque não há virtualização de linha pra
          alinhar, só uma grade estática de PAGE_SIZE itens. */}
      {games === null && (
        <div role="status" aria-live="polite">
          <span className="sr-only">{t("loadingGames")}</span>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-7 min-[2400px]:grid-cols-9">
            {Array.from({ length: PAGE_SIZE }, (_, i) => (
              <GameTileSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {games && games.length === 0 && (
        (() => {
          // M12: precedência idêntica às mensagens abaixo — "biblioteca
          // vazia de verdade" é só quando nenhum filtro está em jogo; os
          // outros três continuam texto simples (critério do item: os três
          // estados vazios continuam distintos entre si, não colapsam num
          // só). Só este ganha painel + ação principal, porque só este é a
          // primeira tela real de um usuário novo (docs/roadmap.md).
          const trulyEmpty =
            !debouncedSearch && !platformFilter && !favoriteOnly && !missingOnly && !playedOnly && !excludedOnly;
          if (trulyEmpty) {
            return (
              <EmptyState
                message={t("noGamesInLibrary")}
                action={
                  <>
                    {/* 2026-09-09 (docs/pendencias.md, "Onboarding para quem
                        abre o app sem nenhuma ROM"): não é um wizard — é o
                        `EmptyState` de sempre, com o que o app faz em 3 passos
                        curtos antes da ação, em vez de um botão solto que só
                        se explica depois do clique. Sem vocabulário de
                        emulador, sem dizer de onde tirar jogo (princípio 6): a
                        pasta é a que já existe no computador da pessoa.
                        `max-w-md` ~65 caracteres por linha; a caixa vazia é
                        larga demais para texto solto. */}
                    <ol className="mb-4 max-w-md list-none space-y-2 text-left text-sm text-muted">
                      {[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")].map((step, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span
                            aria-hidden="true"
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-xs text-ink"
                          >
                            {i + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                    <Button variant="primary" onClick={onOpenLibrary}>
                      {t("chooseFolderWithGames")}
                    </Button>
                  </>
                }
              />
            );
          }
          // Os outros dois estados vazios (busca sem resultado, filtro sem
          // resultado) continuam distintos entre si e distintos do de cima —
          // critério do M12, preservado. O que muda em 2026-09-07: o texto
          // deixou de ser um `<p>` solto no meio da página, alinhado com nada,
          // e ganhou a mesma caixa tracejada do outro estado (sem a marca, que
          // é reservada à biblioteca de fato vazia) mais a saída óbvia — antes
          // o usuário tinha que descobrir sozinho qual dos quatro controles da
          // barra desfazer.
          return (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
              <p className="max-w-md text-base text-muted">
                {debouncedSearch
                  ? t("noGamesFound", { search: debouncedSearch })
                  : platformFilter
                    ? t("noGamesForPlatform", { platformName: shortNameFor(platformFilter) })
                    : missingOnly
                      ? t("noMissingGames")
                      : playedOnly
                        ? t("noPlayedGames")
                        : excludedOnly
                          ? t("noExcludedGames")
                          : t("noFavoritedGames")}
              </p>
              <Button
                variant="secondary"
                onClick={() =>
                  onViewChange({
                    search: "",
                    platformFilter: null,
                    favoriteOnly: false,
                    missingOnly: false,
                    playedOnly: false,
                    excludedOnly: false,
                    page: 1,
                  })
                }
              >
                {t("clearFilters")}
              </Button>
            </div>
          );
        })()
      )}

      {games && games.length > 0 && (
        <>
          <div style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const rowStyle: CSSProperties = {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${virtualRow.start}px)`,
              };

              if (viewMode === "lista") {
                const game = games[virtualRow.index];
                const consoleName = nameFor(game.console_id);
                const verdict = verdictFor(game.console_id);
                // Ausente até `emulators` responder — tile/linha aparece
                // sem badge nesse meio-tempo, nunca com um palpite (mesma
                // regra documentada em GameTile).
                const launchability = emulators
                  ? evaluateGameLaunchability(game, verdict, adapterEntryFor(verdict))
                  : undefined;
                return (
                  <div key={virtualRow.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement} style={rowStyle}>
                    <GameListRow
                      game={game}
                      consoleShortName={shortNameFor(game.console_id)}
                      accentColor={consoleAccentColor(game.console_id)}
                      onOpenDetail={() => onOpenGame(game, consoleName, shortNameFor(game.console_id))}
                      onPlay={playHandlerFor(game)}
                      onToggleFavorite={() => toggleFavorite(game)}
                      launchability={launchability}
                      onInstall={
                        /* Q5 (docs/roadmap.md, Sprint Q): era `startInstall` direto, que pulava a
                         ramificação por motivo e disparava uma instalação que o servidor
                         recusa para fonte manual (RetroArch, Dolphin) — o badge dizia
                         "instalação manual" e o clique caía num "Não foi possível instalar
                         o emulador". `handlePlay` é a mesma cadeia de decisão do botão ▶ e
                         já leva cada motivo ao lugar certo. */
                        verdict?.adapter_id ? () => install.handlePlay(game, verdict, adapterEntryFor(verdict)) : undefined
                      }
                    />
                  </div>
                );
              }

              const rowGames = games.slice(virtualRow.index * columns, virtualRow.index * columns + columns);
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    ...rowStyle,
                    display: "grid",
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gap: "1rem",
                    paddingBottom: "1rem",
                  }}
                >
                  {rowGames.map((game) => {
                    const consoleName = nameFor(game.console_id);
                    const verdict = verdictFor(game.console_id);
                    const launchability = emulators
                      ? evaluateGameLaunchability(game, verdict, adapterEntryFor(verdict))
                      : undefined;
                    return (
                      <GameTile
                        key={game.id}
                        game={game}
                        shortName={shortNameFor(game.console_id)}
                        onOpenDetail={() => onOpenGame(game, consoleName, shortNameFor(game.console_id))}
                        onPlay={playHandlerFor(game)}
                        onToggleFavorite={() => toggleFavorite(game)}
                        launchability={launchability}
                        onInstall={
                        /* Q5 (docs/roadmap.md, Sprint Q): era `startInstall` direto, que pulava a
                         ramificação por motivo e disparava uma instalação que o servidor
                         recusa para fonte manual (RetroArch, Dolphin) — o badge dizia
                         "instalação manual" e o clique caía num "Não foi possível instalar
                         o emulador". `handlePlay` é a mesma cadeia de decisão do botão ▶ e
                         já leva cada motivo ao lugar certo. */
                        verdict?.adapter_id ? () => install.handlePlay(game, verdict, adapterEntryFor(verdict)) : undefined
                      }
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Substitui a paginação numerada (achado #3, comentário perto de
              `loadGames`) — só aparece enquanto uma próxima página está a
              caminho; some sozinho quando não sobra mais jogo, sem "página X
              de Y" nem botão nenhum pra clicar. */}
          {loadingMore && (
            <p className="py-4 text-center text-sm text-muted" aria-live="polite">
              {t("loadingMoreGames")}
            </p>
          )}
        </>
      )}
    </ScreenContainer>
  );
}
