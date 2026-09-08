import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api, ApiError, consoleImageURL } from "../api";
import type { ConsoleEntry, EmulatorEntry, LibraryFolder, Report, RetroArchCoreStatus } from "../api/types";
import {
  Button,
  CardSkeleton,
  consoleIconLabel,
  EmptyState,
  FOCUS_RING,
  InlineError,
  inputClass,
  Pagination,
  ScreenContainer,
  ScreenHeader,
} from "../components/ui";
import { consoleAccentColor } from "../lib/consoleColor";
import {
  buildReadinessIndex,
  evaluateConsoleReadiness,
  type ConsoleReadiness,
  type ReadinessStep,
} from "../lib/consoleReadiness";
import { useT } from "../i18n/i18n";
import { dict } from "./ConsolesScreen.i18n";

// 48, não mais 24 (2026-09-07): com o tile pequeno o catálogo inteiro (33
// consoles) cabe em 3-4 fileiras, e 24 por página cortava a grade ao meio só
// para oferecer um "Próxima" que levava a uma fileira e meia. A paginação
// continua montada e volta sozinha se o catálogo passar de 48 — o que sumiu
// foi o corte artificial, não a funcionalidade.
const PAGE_SIZE = 48;

/**
 * A régua de filtros na mesma linguagem da régua de `AllGamesScreen` e do
 * `Button variant="chrome"` (2026-09-07): `h-9` — a mesma altura do
 * `inputClass` ao lado, que os chips de `py-1` não tinham —, canto reto,
 * borda de 1.5px, rótulo monoespaçado em caixa alta e o friso interno de 1px
 * no topo (luz vindo de cima) que dá o acabamento de chassi. Os três
 * controles da barra (busca, chips, e qualquer botão) passam a medir igual,
 * em vez de três alturas diferentes na mesma linha.
 *
 * Roxo no ativo e no hover, nunca ciano: filtrar é ação do usuário, e a regra
 * da paleta (src/index.css) reserva `--accent-secondary` para o que o sistema
 * informa — que aqui é o pingo de "pronto", não o filtro.
 */
const FILTER_CHIP_BASE =
  "inline-flex h-9 items-center gap-1.5 rounded-sm border-[1.5px] px-3 font-mono text-xs font-medium tracking-wider uppercase shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition duration-150 active:translate-y-px active:shadow-none";
const FILTER_CHIP_ON =
  "border-accent bg-accent/10 text-ink shadow-[0_0_14px_-4px_var(--accent),inset_0_1px_0_0_rgba(255,255,255,0.06)]";
const FILTER_CHIP_OFF =
  "border-control-border text-muted hover:border-accent hover:bg-accent/10 hover:text-ink";

/**
 * Achado do Douglas (2026-09-07): a grade de 33 consoles mostrava, de cada
 * vez, nome + ano + selo + frase de status + lista de emuladores + parecer —
 * tudo isso ANTES de qualquer clique, para os 33 ao mesmo tempo (12 por
 * página). "Deveria ter os ícones dos consoles pra clicar, e só depois
 * mostrar as informações": o detalhe inteiro (frase de status, opções de
 * emulador, parecer, BIOS, pasta) já existe em `ConsoleDetailScreen` — esta
 * grade não precisava repetir nada disso antes do clique.
 *
 * O tile mostra só o que ajuda a *achar* o console: ícone com a cor de
 * identidade (mesmo vocabulário do `ConsoleIcon`/`ConsoleDetailScreen`),
 * nome, ano, e um pingo aceso quando já está pronto para jogar — nenhuma
 * frase, nenhuma lista. `title` carrega o resto (nome completo + status) para
 * quem passa o mouse ou usa leitor de tela antes de decidir clicar.
 */
function ConsoleTile({
  entry,
  readiness,
  onOpen,
}: {
  entry: ConsoleEntry;
  readiness: ConsoleReadiness;
  onOpen: () => void;
}) {
  const accent = consoleAccentColor(entry.console_id);
  const ready = readiness.step === "pronto";
  // Achado do Douglas (2026-09-07): a imagem real do console, quando o
  // gerador já a trouxe (ver docs/decisoes.md, "Identidade visual por
  // console" — reversão explícita, risco de marca aceito). `has_image`
  // falso é o estado padrão até alguém rodar cmd/generate-console-images;
  // `imageFailed` cobre o caso raro do arquivo embutido existir mas o
  // <img> falhar em runtime — os dois caem no mesmo `ConsoleIcon` de
  // sempre, nunca um espaço quebrado.
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = entry.has_image && !imageFailed;

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${entry.name} (${entry.year}) — ${readiness.badge}`}
      // `--console-accent` como custom property no `style`, e não uma classe
      // Tailwind com a cor interpolada: classe arbitrária é compilada em
      // build, não lê valor dinâmico. Mesmo vocabulário que `GameCover` já
      // usa para o halo de hover — o efeito não é novo, só passa a valer
      // também aqui.
      style={{ "--console-accent": accent } as CSSProperties}
      className={`group flex flex-col items-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-fill ${FOCUS_RING}`}
    >
      <div
        // O halo na cor de identidade do console entra no hover/foco (achado
        // do Douglas nesta sessão, aplicado antes em `LibraryScreen`: a cor
        // do console é o ativo visual mais distintivo do projeto e estava
        // sendo gasta só numa borda fina). `border-color`/`box-shadow` vêm de
        // classe, nunca do `style` inline: inline venceria o `group-hover:`
        // por especificidade e o halo nunca apareceria — só o
        // `backgroundColor` branco (que não conflita) continua inline.
        className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border font-pixel text-[11px] leading-none transition duration-150 group-hover:border-[var(--console-accent)] group-hover:brightness-110 group-hover:shadow-[0_0_16px_color-mix(in_srgb,var(--console-accent)_45%,transparent)] group-focus-visible:border-[var(--console-accent)] group-focus-visible:shadow-[0_0_16px_color-mix(in_srgb,var(--console-accent)_45%,transparent)] ${
          ready
            ? "border-[var(--console-accent)]"
            : "border-[color-mix(in_srgb,var(--console-accent)_40%,transparent)]"
        }`}
        // Fundo branco atrás da logo, não `--fill` (2026-09-07, achado do
        // Douglas: "a visibilidade do console está difícil... um fundo
        // branco seja o ideal" — mesmo ajuste do `ConsoleIcon` em ui.tsx). A
        // maioria das logos do IGDB foi desenhada pra selo em fundo claro;
        // sobre o `--fill` quase preto a arte escura da própria logo se
        // perdia. `h-12` (era `h-10`, depois `h-11`): segunda rodada do
        // mesmo achado — "os ícones pequenos, queria mais destaque" — a logo
        // agora ocupa 75% da caixa de 64px, não só 62%.
        style={{ backgroundColor: showImage ? "#fff" : undefined }}
      >
        {showImage ? (
          <img
            src={consoleImageURL(entry.console_id)}
            alt=""
            // Decorativo: o nome do console já está no `title` do botão e
            // no texto abaixo do ícone — um alt redundante duplicaria a
            // mesma informação pro leitor de tela.
            aria-hidden="true"
            className="relative h-12 w-12 object-contain p-0.5"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at 30% 20%, color-mix(in srgb, ${accent} ${ready ? 40 : 20}%, transparent), transparent 70%)`,
              }}
            />
            <span className="relative" style={{ color: accent }}>
              {consoleIconLabel(entry.console_id, entry.short_name)}
            </span>
          </>
        )}
        {/* O único sinal que a grade dá antes do clique: já dá pra jogar,
            ou não. O que falta (emulador, core, BIOS, pasta) só aparece
            depois, no detalhe — é lá que vale a pena nomear a peça exata
            (princípio 3 do CLAUDE.md), não numa grade de 33 ícones. */}
        {ready && (
          <span
            aria-hidden="true"
            // `ring-1 ring-black/25`: o pingo agora pousa sobre o fundo
            // branco da logo em 30 dos 33 consoles — sem o anel escuro, ciano
            // sobre branco quase some.
            className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent-secondary ring-1 ring-black/25 shadow-[0_0_4px_var(--accent-secondary)]"
          />
        )}
      </div>
      <div className="w-full min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{entry.name}</p>
        {/* `font-mono tabular-nums`: o ano é dado, não prosa — e alinhado em
            coluna monoespaçada a grade inteira lê como uma tabela de catálogo,
            que é o tempero arcade que esta tela pode pagar sem atrapalhar a
            busca visual pela logo. */}
        <p className="font-mono text-[11px] tracking-wide text-muted tabular-nums">{entry.year}</p>
      </div>
    </button>
  );
}

/**
 * Tela de consoles (2026-08-28, a pedido do Douglas): a entrada principal
 * passa a ser o console, não o emulador. O eixo é **prontidão** — "o que
 * falta para este console rodar" —, decidido depois de medir que só 5 dos 33
 * consoles do catálogo têm mais de um emulador possível (PS1, N64, Dreamcast,
 * PSP e NDS); nos outros 28 uma tela centrada em "escolher entre emuladores"
 * mostraria uma opção só e não responderia nada.
 *
 * Três buscas, todas de tela inteira, nenhuma por console: `GET /consoles`
 * (catálogo + opções), `GET /emulators` (o que está instalado) e
 * `GET /retroarch/cores` (quais cores estão no lugar), mais
 * `GET /library/folders`. O cruzamento vira índice uma vez
 * (`buildReadinessIndex`) e cada console é O(1) sobre ele — sem isso, os 33
 * consoles varreriam as mesmas listas 33 vezes.
 *
 * `report` vem ausente quando a tela é alcançada sem consentimento/scan (o
 * mesmo caminho que `EmulatorsScreen` já cobre a partir de `DeclinedScreen`).
 * A prontidão não depende dele de propósito: `GET /consoles` não exige
 * consentimento, então esta tela funciona inteira para quem recusou o scan.
 * Aceito mas não usado agora (achado do Douglas, 2026-09-07): o tile deixou
 * de mostrar o parecer por console — só existe uma vez, dentro do detalhe.
 * Mantido na assinatura para não quebrar App.tsx e por já ser exigido por
 * outras telas irmãs (EmulatorsScreen); se sobrar de vez, remover os dois
 * juntos.
 */
export function ConsolesScreen({
  onOpenConsole,
  onOpenEmulators,
}: {
  report?: Report;
  onOpenConsole: (consoleId: string, name: string, shortName: string) => void;
  onOpenEmulators: () => void;
}) {
  const t = useT(dict);
  const [consoles, setConsoles] = useState<ConsoleEntry[] | null>(null);
  const [emulators, setEmulators] = useState<EmulatorEntry[]>([]);
  const [cores, setCores] = useState<RetroArchCoreStatus[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ReadinessStep | "todos">("todos");
  const [page, setPage] = useState(1);

  // Os filtros são os passos de prontidão, não os patamares do parecer: a
  // pergunta desta tela é "o que falta montar", e "falta o core" é acionável
  // de um jeito que "limitado" não é. O parecer continua aparecendo no card,
  // como informação — nunca como filtro que esconderia um console que o
  // usuário quer configurar assim mesmo (princípio 5: informar, não bloquear).
  const FILTERS: { id: ReadinessStep | "todos"; label: string }[] = [
    { id: "todos", label: t("filterAll") },
    { id: "pronto", label: t("filterReady") },
    { id: "sem-emulador", label: t("filterMissingEmulator") },
    { id: "sem-core", label: t("filterMissingCore") },
    { id: "sem-bios", label: t("filterMissingBios") },
    { id: "sem-pasta", label: t("filterMissingFolder") },
  ];

  useEffect(() => {
    // O catálogo é o único indispensável — falhar nele deixa a tela sem
    // conteúdo. Os outros três só enriquecem a prontidão: sem eles a tela
    // ainda lista os 33 consoles, reportando "instalar emulador" para todos.
    // Degradar assim é melhor que uma tela de erro por causa de uma das
    // quatro chamadas.
    api
      .getConsoles()
      .then((res) => setConsoles(res.consoles))
      .catch((err) => setError(err instanceof ApiError ? err.message : t("errorLoadingConsoles")));

    api.getEmulators().then((res) => setEmulators(res.emulators)).catch(() => {});
    api.getRetroArchCores().then((res) => setCores(res.cores)).catch(() => {});
    api.getLibraryFolders().then((res) => setFolders(res.folders)).catch(() => {});
  }, [t]);

  const index = useMemo(() => buildReadinessIndex(emulators, cores, folders), [emulators, cores, folders]);

  const avaliados = useMemo(
    () => (consoles ?? []).map((entry) => ({ entry, readiness: evaluateConsoleReadiness(entry, index) })),
    [consoles, index],
  );

  // Contagem por passo, para os filtros dizerem quantos consoles têm cada
  // pendência antes do clique — um filtro que leva a "nenhum resultado" é um
  // clique desperdiçado.
  const contagem = useMemo(() => {
    const out = new Map<ReadinessStep | "todos", number>([["todos", avaliados.length]]);
    for (const { readiness } of avaliados) {
      out.set(readiness.step, (out.get(readiness.step) ?? 0) + 1);
    }
    return out;
  }, [avaliados]);

  const filtrados = avaliados.filter(({ entry, readiness }) => {
    if (filter !== "todos" && readiness.step !== filter) return false;
    const termo = search.trim().toLowerCase();
    if (!termo) return true;
    return (
      entry.name.toLowerCase().includes(termo) ||
      entry.short_name.toLowerCase().includes(termo) ||
      // Buscar pelo emulador também: "quem roda PS1 aqui?" e "onde uso o
      // RetroArch?" são a mesma pergunta vista dos dois lados, e a tela de
      // emuladores deixou de ser a entrada principal.
      entry.emulators.some((o) => o.name.toLowerCase().includes(termo))
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageItems = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleFilter(id: ReadinessStep | "todos") {
    setFilter(id);
    setPage(1);
  }

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <ScreenContainer variant="listing">
      <ScreenHeader
        title={t("consoles")}
        subtitle={t("consolesDescription")}
        actions={
          // A tela de emuladores continua existindo — é onde moram os
          // emuladores personalizados, a lista completa dos cores do
          // RetroArch e os painéis de configuração/mapeamento, que não
          // pertencem a um console só. Deixou de ser a entrada principal,
          // não de existir.
          //
          // `chrome`, não `secondary` (2026-09-07): o raciocínio de
          // 2026-09-06 continua valendo — é uma troca de visão de tela
          // inteira, mesma classe de ação que "← Consoles"/"Voltar" —, só que
          // essa classe de ação ganhou variante própria desde então. Em
          // `secondary` este botão media 40px de altura e canto de 8px ao
          // lado de uma régua de filtros de 36px e canto reto, logo abaixo:
          // o mesmo desencontro que motivou a variante.
          <Button variant="chrome" onClick={onOpenEmulators}>
            {t("seeByEmulator")}
          </Button>
        }
      />

      {error && <InlineError>{error}</InlineError>}

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="consoles-search" className="sr-only">
          {t("searchConsoleOrEmulator")}
        </label>
        <input
          id="consoles-search"
          type="text"
          name="consoles-search"
          autoComplete="off"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t("searchConsoleOrEmulatorPlaceholder")}
          className={`${inputClass} max-w-xs`}
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => {
            const total = contagem.get(item.id) ?? 0;
            // Um filtro sem nenhum console some, em vez de virar um botão que
            // leva a lista vazia (achado do mesmo tipo que o M3 registrou:
            // filtro que muda de conteúdo conforme a página).
            if (item.id !== "todos" && total === 0) return null;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleFilter(item.id)}
                // A11y 4.1.2: filtros de prontidão alternáveis e mutuamente
                // exclusivos — `aria-pressed` expõe o estado ativo (o estilo
                // `border-accent`/`text-accent` só comunicava a quem vê).
                aria-pressed={filter === item.id}
                className={`${FILTER_CHIP_BASE} ${FOCUS_RING} ${
                  filter === item.id ? FILTER_CHIP_ON : FILTER_CHIP_OFF
                }`}
              >
                {item.label.toUpperCase()}
                {/* A contagem separada do rótulo, em coluna monoespaçada:
                    antes era um número solto grudado na frase e, com o chip
                    inteiro em caixa alta, lia como parte do nome do filtro. */}
                <span className={`tabular-nums ${filter === item.id ? "text-accent" : "opacity-70"}`}>{total}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legenda do pingo. Sem ela, o único sinal que a grade dá antes do
          clique era um ponto ciano de 8px que ninguém tinha como decifrar —
          cor sozinha nunca é informação (WCAG 1.4.1). Fica ao lado da régua
          de filtros, não dentro do tile, porque a explicação é uma só para os
          33. */}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full bg-accent-secondary shadow-[0_0_4px_var(--accent-secondary)]"
        />
        {t("readyLegend")}
      </p>

      {consoles === null && !error && (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2"
        >
          <span className="sr-only">{t("loadingConsoles")}</span>
          {Array.from({ length: 12 }, (_, i) => (
            <CardSkeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {consoles !== null && filtrados.length === 0 && (
        <div className="mt-4">
          <EmptyState message={t("noConsolesFound")} />
        </div>
      )}

      {/* Grade de ícones, não de cards (achado do Douglas, 2026-09-07) —
          `auto-fill`/`minmax`, não breakpoints fixos: cada tile tem largura
          conhecida e pequena (104px), então deixar o próprio CSS Grid decidir
          quantas colunas cabem evita reescrever a lista de breakpoints toda
          vez que o tile mudar de tamanho (o problema que a grade de cards
          antiga tinha, um breakpoint por card). */}
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
        {pageItems.map(({ entry, readiness }) => (
          <ConsoleTile
            key={entry.console_id}
            entry={entry}
            readiness={readiness}
            onOpen={() => onOpenConsole(entry.console_id, entry.name, entry.short_name)}
          />
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </ScreenContainer>
  );
}
