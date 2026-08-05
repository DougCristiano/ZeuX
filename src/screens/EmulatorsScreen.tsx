import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, ApiError } from "../api";
import type { ConsoleVerdict, EmulatorEntry, EmulatorSource, InstallJob, Report, RetroArchCoreStatus } from "../api/types";
import { Badge, Button, Card, ConsoleIcon, ConsoleInfoModal, ConsoleMoreBadge, Pagination, ProgressBar, Select } from "../components/ui";

const PAGE_SIZE = 6;
// Quantos ícones de console cabem no card sem esticar a altura entre
// emuladores de 1 console (ex.: xemu) e emuladores de 20+ (RetroArch) —
// acima disso, o resto vira "···" (ConsoleMoreBadge).
const MAX_CONSOLE_ICONS = 6;

// Item B10 (docs/sprint-b-plano.md): instalar com ressalva de hardware. O
// servidor já faz a parte que importa — hardwareBlocks recusa com 409 e
// override_hint, /installs/{id} acompanha o progresso — esta tela só não pode
// estragar isso.
type RowState =
  | { kind: "idle" }
  | { kind: "starting" }
  // message vem de ApiError.message (docs/api.md, code hardware_insufficient)
  // — nunca uma frase escrita aqui. Ver ConsoleVerdict/handleInstall em
  // internal/api/server.go, hardwareBlocks.
  | { kind: "confirm-hardware"; message: string }
  | { kind: "installing"; job: InstallJob }
  | { kind: "done"; job: InstallJob }
  | { kind: "error"; message: string }
  | { kind: "confirm-remove" }
  | { kind: "removing" }
  | { kind: "remove-error"; message: string };

function percentOf(job: InstallJob): number | null {
  if (job.total_bytes <= 0) return null;
  return Math.min(100, Math.round((job.downloaded_bytes / job.total_bytes) * 100));
}

// Achado em 2026-08-04: um core podia estar ausente por um bug silencioso
// (log de aviso, nunca erro) e nada avisava até o usuário tentar lançar um
// jogo e receber "core não encontrado" na cara — só o RetroArch carrega
// cores plugáveis, então isto só aparece na linha dele.
function RetroArchCoresList() {
  const [cores, setCores] = useState<RetroArchCoreStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getRetroArchCores()
      .then((res) => setCores(res.cores))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível listar os cores."));
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!cores) return <p className="text-sm text-muted">Carregando cores...</p>;

  const missing = cores.filter((c) => !c.installed);

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-muted">
        {cores.length - missing.length} de {cores.length} cores instalados
        {missing.length > 0 && ` — faltam: ${missing.map((c) => c.name).join(", ")}`}
      </p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-3">
        {cores.map((core) => (
          <li key={core.name} className="flex items-center gap-1.5">
            <Badge variant={core.installed ? "solid" : undefined}>{core.installed ? "ok" : "faltando"}</Badge>
            <span className="truncate text-ink" title={core.path ?? core.filename}>
              {core.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Ponto de status: a cor comunica estado real (instalado/erro/não
// instalado), nunca decoração por índice — diferente do "neon" arbitrário
// por card do mockup de referência (Sprint 4 do plano de migração visual,
// 2026-08-04). Verde/accent = pronto para uso; vermelho = algo falhou;
// cinza = ainda não instalado.
function StatusDot({ state }: { state: "installed" | "error" | "not-installed" }) {
  const color = state === "installed" ? "bg-accent" : state === "error" ? "bg-danger" : "bg-muted";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />;
}

function EmulatorCard({
  entry,
  source,
  verdictById,
  onSelectConsole,
  onChanged,
}: {
  entry: EmulatorEntry;
  source?: EmulatorSource;
  verdictById: Map<string, ConsoleVerdict>;
  onSelectConsole: (consoleId: string) => void;
  onChanged: () => void;
}) {
  const [state, setState] = useState<RowState>({ kind: "idle" });
  const [showCores, setShowCores] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  // Botão "Configurar" (2026-08-04): abre o emulador sozinho, sem jogo — o
  // ZeuX ainda não grava/aplica configuração nenhuma (backlog separado, ver
  // docs/roadmap.md). Por ora, "configurar" é literalmente abrir o próprio
  // emulador para o usuário mexer na configuração dele diretamente.
  async function openStandalone() {
    setOpening(true);
    setOpenError(null);
    try {
      await api.openEmulator(entry.adapter_id);
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : "Não foi possível abrir o emulador.");
    } finally {
      setOpening(false);
    }
  }

  async function pollJob(jobId: string) {
    try {
      const job = await api.getInstallJob(jobId);
      if (job.phase === "concluido") {
        setState({ kind: "done", job });
        onChanged();
        return;
      }
      if (job.phase === "falhou") {
        // job.error é a mensagem original do servidor (docs/api.md) — exibida
        // como veio, igual ao erro de rota.
        setState({ kind: "error", message: job.error ?? "A instalação falhou." });
        return;
      }
      setState({ kind: "installing", job });
      setTimeout(() => pollJob(jobId), 400);
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof ApiError ? err.message : "Não foi possível acompanhar a instalação.",
      });
    }
  }

  async function install(force: boolean) {
    setState({ kind: "starting" });
    try {
      const job = await api.installEmulator(entry.adapter_id, force);
      setState({ kind: "installing", job });
      pollJob(job.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === "hardware_insufficient") {
        setState({ kind: "confirm-hardware", message: err.message });
        return;
      }
      setState({
        kind: "error",
        message: err instanceof ApiError ? err.message : "Não foi possível iniciar a instalação.",
      });
    }
  }

  async function remove() {
    setState({ kind: "removing" });
    try {
      await api.uninstallEmulator(entry.adapter_id);
      onChanged();
    } catch (err) {
      setState({
        kind: "remove-error",
        // err.message já vem do servidor (ex.: "o RetroArch vem empacotado
        // com o ZeuX e não pode ser removido por aqui") — nunca reescrita
        // aqui, mesma regra do resto da tela.
        message: err instanceof ApiError ? err.message : "Não foi possível remover este emulador.",
      });
    }
  }

  // O RetroArch nunca oferece remoção nesta tela — ele vem empacotado com o
  // próprio instalador do ZeuX (ADR 0012), não foi baixado por um clique em
  // "Instalar", e removê-lo quebraria os 24 consoles que dependem dele sem
  // uma forma simples de reinstalar. O backend (internal/install/manager.go,
  // Uninstall) já recusa mesmo que esse botão apareça por engano — esconder
  // aqui é só para não convidar o clique.
  const canRemove = entry.installed && entry.installation?.managed && entry.adapter_id !== "retroarch";

  const dotState: "installed" | "error" | "not-installed" =
    state.kind === "error" || state.kind === "remove-error"
      ? "error"
      : entry.installed
        ? "installed"
        : "not-installed";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="mt-1.5">
            <StatusDot state={dotState} />
          </span>
          <p className="font-semibold text-ink">{entry.name}</p>
        </div>
        {entry.installed && (
          <Badge variant="solid">{entry.installation?.managed ? "instalado pelo ZeuX" : "já estava na máquina"}</Badge>
        )}
      </div>

      {/* Ícones de console em vez da lista de texto (2026-08-04, a pedido do
          Douglas): cada um abre ConsoleInfoModal com a descrição do console.
          Tamanho fixo do card — a partir de MAX_CONSOLE_ICONS o resto vira
          "···" (ConsoleMoreBadge), nunca clicável, pra não estourar altura
          entre um emulador de console único e o RetroArch (20+). */}
      <div className="flex flex-wrap gap-1.5">
        {entry.consoles.slice(0, MAX_CONSOLE_ICONS).map((consoleId) => (
          <ConsoleIcon
            key={consoleId}
            label={verdictById.get(consoleId)?.short_name ?? consoleId}
            onClick={() => onSelectConsole(consoleId)}
          />
        ))}
        {entry.consoles.length > MAX_CONSOLE_ICONS && (
          <ConsoleMoreBadge count={entry.consoles.length - MAX_CONSOLE_ICONS} />
        )}
      </div>

      {state.kind === "confirm-hardware" && (
        // Regra: recusar não some com o card nem desabilita o botão de
        // instalar — "Cancelar" só volta ao estado normal.
        <div className="rounded border border-dashed border-line-strong p-3">
          <p className="text-sm text-ink">{state.message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="primary" autoFocus onClick={() => install(true)}>
              Instalar mesmo assim
            </Button>
            <Button variant="secondary" onClick={() => setState({ kind: "idle" })}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {(state.kind === "installing" || state.kind === "done") && (
        <div>
          <p className="text-sm text-muted">
            {state.job.phase}
            {state.job.asset_name ? ` · ${state.job.asset_name}` : ""}
          </p>
          {state.kind === "installing" && (
            <div className="mt-1">
              <ProgressBar percent={percentOf(state.job)} />
            </div>
          )}
        </div>
      )}

      {state.kind === "error" && <p className="text-sm text-danger">{state.message}</p>}
      {state.kind === "remove-error" && <p className="text-sm text-danger">{state.message}</p>}

      {/* Fontes "manual" (hoje só o Dolphin) não distribuem por releases do
          GitHub — não há como o ZeuX resolver a versão mais recente por API
          (docs/adapters.md). Em vez do botão "Instalar" tentar e sempre
          falhar com o motivo em texto puro, abre o site oficial direto no
          navegador (2026-08-04, a pedido do Douglas). */}
      {!entry.installed && source?.kind === "manual" && (
        <p className="text-sm text-muted">{source.reason}</p>
      )}

      {entry.adapter_id === "retroarch" && (
        <div>
          <Button type="button" variant="ghost" onClick={() => setShowCores((v) => !v)}>
            {showCores ? "Ocultar cores" : "Ver cores"}
          </Button>
          {showCores && (
            <div className="mt-2">
              <RetroArchCoresList />
            </div>
          )}
        </div>
      )}

      {openError && <p className="text-sm text-danger">{openError}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {entry.installed ? (
          <>
            {/* "Configurar" só abre o emulador sozinho hoje — o ZeuX ainda
                não grava/aplica configuração nenhuma (backlog separado). */}
            <Button variant="secondary" disabled={opening} onClick={openStandalone} title="Abre o emulador sem nenhum jogo, para configurar dentro dele.">
              {opening ? "Abrindo…" : "Configurar"}
            </Button>
            {canRemove &&
              (state.kind === "confirm-remove" ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" autoFocus onClick={remove}>
                    Remover mesmo assim
                  </Button>
                  <Button variant="secondary" onClick={() => setState({ kind: "idle" })}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  disabled={state.kind === "removing"}
                  onClick={() => setState({ kind: "confirm-remove" })}
                >
                  {state.kind === "remove-error" ? "Tentar remover de novo" : "Remover"}
                </Button>
              ))}
          </>
        ) : source?.kind === "manual" ? (
          <Button variant="primary" onClick={() => openUrl(source.homepage)}>
            Abrir site oficial
          </Button>
        ) : state.kind === "installing" || state.kind === "done" || state.kind === "confirm-hardware" ? null : (
          <Button variant="primary" disabled={state.kind === "starting"} onClick={() => install(false)}>
            {state.kind === "error" ? "Tentar de novo" : "Instalar"}
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * Tela de emuladores — cards por emulador (Sprint 4 do plano de migração
 * visual, 2026-08-04 — /home/douglas/.claude/plans/sleepy-roaming-pearl.md),
 * antes uma tabela. Troca de apresentação só: 100% da lógica de instalar/
 * remover/ver cores continua igual, sem tocar `RowState`. Inspirado em
 * `layout/src/App.tsx` (`EmulatorListView`), mas sem o botão avulso
 * "+ Instalar emulador" do mock (a lista já é fixa pelo catálogo, não há
 * "adicionar" livre) e sem a tela de configuração avançada por emulador
 * (`EmulatorConfigView` — backlog separado, ver o plano).
 */
// onBack só é passado quando esta tela é alcançada a partir de DeclinedScreen
// (sem consentimento ainda, sem sidebar — ver App.tsx). Quando alcançada pela
// sidebar (2026-08-04, Sprint 1), a navegação de volta já é a própria sidebar,
// então nenhum botão extra aparece aqui.
// report vem ausente quando esta tela é alcançada a partir de DeclinedScreen
// (sem consentimento/scan ainda — ver App.tsx). Sem ele, os ícones de console
// e o modal caem no fallback do próprio id (ConsoleInfoModal, fallbackName) e
// o filtro lista os ids em vez do nome — a tela continua funcional, só menos
// legível até existir um parecer.
export function EmulatorsScreen({ onBack, report }: { onBack?: () => void; report?: Report }) {
  const [emulators, setEmulators] = useState<EmulatorEntry[] | null>(null);
  const [sources, setSources] = useState<Record<string, EmulatorSource>>({});
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [consoleFilter, setConsoleFilter] = useState("");
  const [modalConsoleId, setModalConsoleId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const verdictById = useMemo(() => new Map(report?.verdicts.map((v) => [v.console_id, v]) ?? []), [report]);

  useEffect(() => {
    api
      .getEmulators()
      .then((res) => setEmulators(res.emulators))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível listar os emuladores."));
  }, [reloadKey]);

  // Fonte de kind/homepage (docs/api.md, GET /emulator-sources) — catálogo à
  // parte de GET /emulators porque só existe pra decidir COMO instalar, não
  // faz sentido em toda tela que só quer "instalado sim/não".
  useEffect(() => {
    api
      .getEmulatorSources()
      .then((res) => setSources(Object.fromEntries(res.sources.map((s) => [s.adapter_id, s]))))
      .catch(() => {
        // Falha aqui só perde o botão "Abrir site oficial" do Dolphin — o
        // resto da tela continua funcionando, não vale um Callout dedicado.
      });
  }, []);

  // Opções do filtro "Console" (2026-08-04, a pedido do Douglas: "saber qual
  // emulador que funciona o console escolhido") — só consoles que algum
  // emulador de fato atende, não o catálogo inteiro de 33, senão sobrariam
  // opções sem nenhum resultado possível.
  const consoleOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const e of emulators ?? []) for (const id of e.consoles) ids.add(id);
    return Array.from(ids)
      .map((id) => ({ id, name: verdictById.get(id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [emulators, verdictById]);

  // Catálogo pequeno e fixo (uma dúzia e tanto de adapters embutidos) — já
  // vem inteiro em GET /emulators, sem paginação no servidor. Filtro e
  // paginação (2026-08-04) são client-side de propósito: diferente da
  // Biblioteca (que cresce sem limite pelo uso real), este catálogo nunca
  // fica grande o bastante pra justificar ida ao servidor a cada página.
  const filtered = (emulators ?? []).filter((e) => {
    if (consoleFilter && !e.consoles.includes(consoleFilter)) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      e.name.toLowerCase().includes(term) ||
      e.consoles.some((c) => c.toLowerCase().includes(term) || (verdictById.get(c)?.name ?? "").toLowerCase().includes(term))
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleConsoleFilter(value: string) {
    setConsoleFilter(value);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Emuladores</h1>
        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            Voltar
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {emulators && emulators.length > PAGE_SIZE && (
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar emulador ou console..."
            className="w-full max-w-xs rounded border border-line bg-fill px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        )}

        {consoleOptions.length > 0 && (
          <Select value={consoleFilter} onChange={(e) => handleConsoleFilter(e.target.value)} aria-label="Filtrar por console">
            <option value="">Todos os consoles</option>
            {consoleOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {error && <p className="text-base text-danger">{error}</p>}

      {emulators && filtered.length === 0 && (
        <p className="text-base text-muted">Nenhum emulador encontrado para "{search}".</p>
      )}

      {pageItems.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((entry) => (
              <EmulatorCard
                key={entry.adapter_id}
                entry={entry}
                source={sources[entry.adapter_id]}
                verdictById={verdictById}
                onSelectConsole={setModalConsoleId}
                onChanged={() => setReloadKey((k) => k + 1)}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {modalConsoleId && (
        <ConsoleInfoModal
          verdict={verdictById.get(modalConsoleId)}
          fallbackName={modalConsoleId}
          onClose={() => setModalConsoleId(null)}
        />
      )}
    </div>
  );
}
