import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
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

// 24, não mais 12: o tile ocupa uma fração do espaço vertical que o card
// antigo ocupava, então 12 por página deixava a grade sozinha em 1-2
// fileiras curtas com um monte de espaço vazio antes da paginação.
const PAGE_SIZE = 24;

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

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${entry.name} (${entry.year}) — ${readiness.badge}`}
      className={`group flex flex-col items-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-fill ${FOCUS_RING}`}
    >
      <div
        className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border font-pixel text-[11px] leading-none transition-[filter] group-hover:brightness-125"
        style={{ borderColor: ready ? accent : `${accent}66` }}
      >
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
        {/* O único sinal que a grade dá antes do clique: já dá pra jogar,
            ou não. O que falta (emulador, core, BIOS, pasta) só aparece
            depois, no detalhe — é lá que vale a pena nomear a peça exata
            (princípio 3 do CLAUDE.md), não numa grade de 33 ícones. */}
        {ready && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent-secondary shadow-[0_0_4px_var(--accent-secondary)]"
          />
        )}
      </div>
      <div className="w-full min-w-0">
        <p className="truncate text-xs font-medium text-ink">{entry.name}</p>
        <p className="text-[11px] text-muted">{entry.year}</p>
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
          // `secondary`, não `quiet` (achado testando com o Douglas,
          // 2026-09-06): é uma troca de visão de tela inteira, mesma classe
          // de ação que "← Consoles"/"Voltar" nas outras telas — `quiet`
          // (sem borda) lê como texto solto, não como algo clicável.
          <Button variant="secondary" onClick={onOpenEmulators}>
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
                className={`rounded-sm border px-2.5 py-1 text-xs font-medium tracking-wide uppercase transition-colors ${FOCUS_RING} ${
                  filter === item.id ? "border-accent text-accent" : "border-line-strong text-muted hover:text-ink"
                }`}
              >
                {item.label.toUpperCase()} {total}
              </button>
            );
          })}
        </div>
      </div>

      {consoles === null && !error && (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1"
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
          conhecida e pequena (84px), então deixar o próprio CSS Grid decidir
          quantas colunas cabem evita reescrever a lista de breakpoints toda
          vez que o tile mudar de tamanho (o problema que a grade de cards
          antiga tinha, um breakpoint por card). */}
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1">
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
