import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api, ApiError } from "../api";
import type {
  ConsoleEntry,
  ConsoleVerdict,
  EmulatorEntry,
  LibraryFolder,
  Report,
  RetroArchCoreStatus,
} from "../api/types";
import {
  Badge,
  Button,
  Card,
  CardSkeleton,
  EmptyState,
  FOCUS_RING,
  InlineError,
  inputClass,
  LEVEL_LABEL,
  Pagination,
  ScreenContainer,
} from "../components/ui";
import { consoleAccentColor } from "../lib/consoleColor";
import {
  buildReadinessIndex,
  evaluateConsoleReadiness,
  type ConsoleReadiness,
  type ReadinessStep,
} from "../lib/consoleReadiness";

const PAGE_SIZE = 12;

// Os filtros são os passos de prontidão, não os patamares do parecer: a
// pergunta desta tela é "o que falta montar", e "falta o core" é acionável
// de um jeito que "limitado" não é. O parecer continua aparecendo no card,
// como informação — nunca como filtro que esconderia um console que o
// usuário quer configurar assim mesmo (princípio 5: informar, não bloquear).
const FILTERS: { id: ReadinessStep | "todos"; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "pronto", label: "Prontos" },
  { id: "sem-emulador", label: "Falta emulador" },
  { id: "sem-core", label: "Falta core" },
  { id: "sem-bios", label: "Falta BIOS" },
  { id: "sem-pasta", label: "Falta pasta" },
];

// `pronto` é o único estado que merece destaque visual positivo; os demais
// são pendências equivalentes entre si — nenhuma é "pior" que a outra, só
// vêm em ordem diferente na montagem. `sem-suporte` é o único que não é
// pendência do usuário: não há o que ele faça a respeito hoje.
const BADGE_VARIANT: Record<ReadinessStep, "solid" | "default"> = {
  pronto: "solid",
  "sem-emulador": "default",
  "sem-core": "default",
  "sem-bios": "default",
  "sem-pasta": "default",
  "sem-suporte": "default",
};

function ConsoleCard({
  entry,
  readiness,
  verdict,
  onOpen,
}: {
  entry: ConsoleEntry;
  readiness: ConsoleReadiness;
  verdict?: ConsoleVerdict;
  onOpen: () => void;
}) {
  const accent = consoleAccentColor(entry.console_id);
  const style: CSSProperties = { borderLeftColor: accent, borderLeftWidth: 3 };

  return (
    <Card className="flex flex-col gap-3" style={style}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink" title={entry.name}>
            {entry.name}
          </p>
          <p className="text-xs text-muted">{entry.year}</p>
        </div>
        {/* `shrink-0 whitespace-nowrap` achado ao ver a tela de verdade
            (Playwright, 2026-08-28): sem isso "instalar emulador" quebrava em
            duas linhas nos cards de título longo (NES, PC Engine) e esticava
            a altura do card, deixando a grade irregular. Quem cede largura é
            o título, que já trunca — o selo é curto e precisa ser lido
            inteiro. Fica aqui, e não no `Badge`, porque `whitespace-nowrap`
            para todo badge do app impediria quebra onde ela é desejável. */}
        <span className="shrink-0 whitespace-nowrap">
          <Badge variant={BADGE_VARIANT[readiness.step]}>{readiness.badge}</Badge>
        </span>
      </div>

      <p className="text-sm text-muted">{readiness.detail}</p>

      {/* As opções, na ordem que o backend mandou — nunca reordenada aqui
          (a preferência por emulador dedicado é regra de produto e mora em
          Registry.ForConsole). A cor de acento marca a que o ZeuX usaria
          hoje: é a resposta visual pra "posso escolher entre dois?" nos 5
          consoles onde a escolha existe, sem virar ruído nos 28 que têm uma
          opção só. */}
      {entry.emulators.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {entry.emulators.map((option) => {
            const isChosen = readiness.chosen?.adapter_id === option.adapter_id;
            return (
              <li
                key={option.adapter_id}
                className={`rounded border px-2 py-1 text-xs ${
                  isChosen ? "border-accent text-accent" : "border-line text-muted"
                }`}
                title={option.core ? `${option.name} · core ${option.core}` : option.name}
              >
                {option.name}
                {option.core && <span className="opacity-70"> · {option.core}</span>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between gap-2">
        {/* O parecer é informação secundária aqui, e some quando não existe
            (sem consentimento/scan) em vez de virar um "desconhecido" que
            ocuparia o mesmo espaço sem dizer nada. */}
        {verdict ? (
          <span className="text-xs text-muted">Parecer: {LEVEL_LABEL[verdict.level].toLowerCase()}</span>
        ) : (
          <span />
        )}
        <Button variant="secondary" onClick={onOpen}>
          Ver console
        </Button>
      </div>
    </Card>
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
 * consentimento, então esta tela funciona inteira para quem recusou o scan —
 * só o rodapé de parecer de cada card não aparece.
 */
export function ConsolesScreen({
  report,
  onOpenConsole,
  onOpenEmulators,
}: {
  report?: Report;
  onOpenConsole: (consoleId: string, name: string, shortName: string) => void;
  onOpenEmulators: () => void;
}) {
  const [consoles, setConsoles] = useState<ConsoleEntry[] | null>(null);
  const [emulators, setEmulators] = useState<EmulatorEntry[]>([]);
  const [cores, setCores] = useState<RetroArchCoreStatus[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ReadinessStep | "todos">("todos");
  const [page, setPage] = useState(1);

  useEffect(() => {
    // O catálogo é o único indispensável — falhar nele deixa a tela sem
    // conteúdo. Os outros três só enriquecem a prontidão: sem eles a tela
    // ainda lista os 33 consoles, reportando "instalar emulador" para todos.
    // Degradar assim é melhor que uma tela de erro por causa de uma das
    // quatro chamadas.
    api
      .getConsoles()
      .then((res) => setConsoles(res.consoles))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível listar os consoles."));

    api.getEmulators().then((res) => setEmulators(res.emulators)).catch(() => {});
    api.getRetroArchCores().then((res) => setCores(res.cores)).catch(() => {});
    api.getLibraryFolders().then((res) => setFolders(res.folders)).catch(() => {});
  }, []);

  const index = useMemo(() => buildReadinessIndex(emulators, cores, folders), [emulators, cores, folders]);
  const verdictById = useMemo(() => new Map(report?.verdicts.map((v) => [v.console_id, v]) ?? []), [report]);

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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Consoles</h1>
          <p className="mt-1 text-sm text-muted">
            O que cada console precisa para rodar nesta máquina: emulador, core, BIOS e pasta de jogos.
          </p>
        </div>
        {/* A tela de emuladores continua existindo — é onde moram os
            emuladores personalizados, a lista completa dos cores do RetroArch
            e os painéis de configuração/mapeamento, que não pertencem a um
            console só. Deixou de ser a entrada principal, não de existir. */}
        <Button variant="quiet" onClick={onOpenEmulators}>
          Ver por emulador
        </Button>
      </div>

      {error && <InlineError>{error}</InlineError>}

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="consoles-search" className="sr-only">
          Buscar console ou emulador
        </label>
        <input
          id="consoles-search"
          type="text"
          name="consoles-search"
          autoComplete="off"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar console ou emulador…"
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
                className={`rounded-sm border px-2.5 py-1 font-pixel text-[11px] transition-colors ${FOCUS_RING} ${
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
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[2000px]:grid-cols-4"
        >
          <span className="sr-only">Carregando consoles…</span>
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} className="h-44" />
          ))}
        </div>
      )}

      {consoles !== null && filtrados.length === 0 && (
        <div className="mt-4">
          <EmptyState message="Nenhum console encontrado com esse filtro." />
        </div>
      )}

      {/* `lg`, não `xl` (regra de breakpoint do CLAUDE.md): esta grade ocupa
          a largura inteira menos a sidebar (64px) e a barra de rolagem, então
          `xl` (1280) bateria exatamente no tamanho padrão da janela e a
          terceira coluna nunca apareceria de verdade. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[2000px]:grid-cols-4">
        {pageItems.map(({ entry, readiness }) => (
          <ConsoleCard
            key={entry.console_id}
            entry={entry}
            readiness={readiness}
            verdict={verdictById.get(entry.console_id)}
            onOpen={() => onOpenConsole(entry.console_id, entry.name, entry.short_name)}
          />
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </ScreenContainer>
  );
}
