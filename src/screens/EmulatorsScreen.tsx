import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { api, ApiError } from "../api";
import type {
  ConsoleVerdict,
  CustomDefinition,
  EmulatorEntry,
  EmulatorSource,
  InstallJob,
  Report,
  RetroArchCoreStatus,
} from "../api/types";
import { Badge, Button, Callout, Card, ConsoleIcon, ConsoleInfoModal, ConsoleMoreBadge, ErrorModal, Pagination, ProgressBar } from "../components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ManualEmulatorForm } from "../components/ManualEmulatorForm";
import { EmulatorConfigPanel } from "../components/EmulatorConfigPanel";
import { EmulatorBindingsPanel } from "../components/EmulatorBindingsPanel";
import { consoleAccentColor } from "../lib/consoleColor";

const PAGE_SIZE = 6;
// Quantos ícones de console cabem no card sem esticar a altura entre
// emuladores de 1 console (ex.: xemu) e emuladores de 20+ (RetroArch) —
// acima disso, o resto vira "···" (ConsoleMoreBadge).
const MAX_CONSOLE_ICONS = 6;

// O `Select` do shadcn/Radix recusa `value=""` num `SelectItem` (string
// vazia é reservada para "nada selecionado") — este sentinela representa
// "todos os consoles" no lugar do "" que o filtro usava com o <select>
// nativo. Convertido de volta para "" ao sair do componente (J3,
// docs/roadmap.md), então `consoleFilter` continua "" pro resto da tela.
const ALL_CONSOLES = "__all__";

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
  if (!cores) return <p className="text-sm text-muted">Carregando cores…</p>;

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

// Ponto de identidade (2026-08-05, a pedido do Douglas — reverte a decisão
// anterior de "cor comunica estado real"): a cor não é mais instalado/erro/
// não instalado — isso continua visível pelo Badge/texto logo abaixo. Aqui é
// só a cor do console (consoleAccentColor), pra "padronizar de quem é o
// jogo" mesmo na tela de Emuladores. Emulador de console único usa a cor
// desse console; RetroArch e qualquer outro multi-console (sem uma
// identidade só) cai no cinza neutro — decorar 20+ consoles com uma cor só
// seria a mesma mentira de escolher uma ao acaso.
function IdentityDot({ color }: { color: string | undefined }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: color ?? "var(--muted)" }}
      aria-hidden="true"
    />
  );
}

// Header com nome, ponto de identidade e badge de instalação — extraído do
// EmulatorCard monolítico (K6, docs/roadmap.md) para o card parar de crescer
// como um arquivo só. Puramente apresentacional, sem estado próprio.
function EmulatorCardHeader({ entry, identityColor }: { entry: EmulatorEntry; identityColor: string | undefined }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-start gap-2">
        <span className="mt-1.5">
          <IdentityDot color={identityColor} />
        </span>
        <p className="font-semibold text-ink">{entry.name}</p>
      </div>
      {entry.installed && (
        <div className="flex flex-col items-end gap-1">
          <Badge variant="solid">{entry.installation?.managed ? "instalado pelo ZeuX" : "já estava na máquina"}</Badge>
          {/* Só presente em instalação gerenciada (Sprint A) — o ZeuX não
              executa o binário de uma instalação alheia para descobrir a
              versão dela. */}
          {entry.installation?.version && <span className="text-xs text-muted">{entry.installation.version}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Ícones de console em vez da lista de texto (2026-08-04, a pedido do
 * Douglas): cada um abre ConsoleInfoModal com a descrição do console.
 * Tamanho fixo do card — a partir de MAX_CONSOLE_ICONS o resto vira "···"
 * (ConsoleMoreBadge), nunca clicável, pra não estourar altura entre um
 * emulador de console único e o RetroArch (20+).
 */
function EmulatorCardConsoles({
  entry,
  verdictById,
  onSelectConsole,
}: {
  entry: EmulatorEntry;
  verdictById: Map<string, ConsoleVerdict>;
  onSelectConsole: (consoleId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {entry.consoles.slice(0, MAX_CONSOLE_ICONS).map((consoleId) => (
        <ConsoleIcon
          key={consoleId}
          consoleId={consoleId}
          label={verdictById.get(consoleId)?.short_name ?? consoleId}
          onClick={() => onSelectConsole(consoleId)}
        />
      ))}
      {entry.consoles.length > MAX_CONSOLE_ICONS && (
        <ConsoleMoreBadge count={entry.consoles.length - MAX_CONSOLE_ICONS} />
      )}
    </div>
  );
}

/**
 * H2/H3/H4 (docs/roadmap.md): configuração e mapeamento persistidos, só
 * quando entry.configurable/bindable vêm true — hoje só PCSX2 e RetroArch
 * (H1 piloto). Emulador ainda não coberto degrada visivelmente (H5): mostra
 * que ainda é configurado por fora, em vez de simplesmente não ter nenhum
 * botão. showConfig/showBindings são estado genuinamente local a este
 * bloco — não precisam subir para o card.
 */
function EmulatorCardConfigPanels({ entry }: { entry: EmulatorEntry }) {
  const [showConfig, setShowConfig] = useState(false);
  const [showBindings, setShowBindings] = useState(false);

  if (!entry.installed) return null;

  if (!entry.configurable && !entry.bindable) {
    return <p className="text-xs text-muted">Configuração e controles ainda só dentro do próprio {entry.name}.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {entry.configurable && (
          <Button variant="secondary" onClick={() => setShowConfig((v) => !v)}>
            {showConfig ? "Ocultar configurações" : "Configurações"}
          </Button>
        )}
        {entry.bindable && (
          <Button variant="secondary" onClick={() => setShowBindings((v) => !v)}>
            {showBindings ? "Ocultar mapeamento" : "Mapear controles"}
          </Button>
        )}
      </div>
      {showConfig && entry.configurable && (
        <EmulatorConfigPanel adapterId={entry.adapter_id} adapterName={entry.name} />
      )}
      {showBindings && entry.bindable && (
        <EmulatorBindingsPanel adapterId={entry.adapter_id} adapterName={entry.name} />
      )}
    </>
  );
}

/**
 * "Abrir pasta do BIOS" (2026-08-05): existia só dentro da tela de jogos de
 * um console (GamesScreen.tsx), a pedido do Douglas em 2026-08-04 — mas aí é
 * preciso navegar Biblioteca → console → jogos pra achar. GET /emulators já
 * traz bios_dir/bios_dir_empty por emulador (EmulatorEntry), então o botão
 * cabe aqui direto. Só aparece quando alguém já verificou de verdade onde
 * ESTE emulador lê o BIOS/firmware (BiosDir, internal/emulator/bios_dir.go)
 * — nunca um palpite por convenção.
 */
function EmulatorCardBios({ entry }: { entry: EmulatorEntry }) {
  const [biosError, setBiosError] = useState<string | null>(null);

  if (!entry.bios_dir) return null;

  async function openBiosFolder() {
    setBiosError(null);
    try {
      await openPath(entry.bios_dir!);
    } catch (err) {
      setBiosError(`Não foi possível abrir a pasta do BIOS: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {entry.bios_dir_empty && (
        <Callout label="BIOS ausente">
          A pasta de BIOS deste emulador está vazia. Sem o arquivo, o jogo não deve abrir.
        </Callout>
      )}
      <Button type="button" variant="secondary" onClick={openBiosFolder}>
        Abrir pasta do BIOS
      </Button>
      {biosError && <p className="text-sm text-danger">{biosError}</p>}
    </div>
  );
}

/**
 * Instalar/remover/configurar externamente e as ações de emulador
 * personalizado — o pedaço de verdade complexo do card (máquina de estados
 * `RowState`), isolado num componente próprio (K6) para não se misturar com
 * header/consoles/config/BIOS na leitura. `RowState` continua sendo union
 * discriminada, sem mudança de comportamento — só de onde o código mora.
 */
function EmulatorCardActions({
  entry,
  source,
  customDef,
  onChanged,
  onEditCustom,
}: {
  entry: EmulatorEntry;
  source?: EmulatorSource;
  customDef?: CustomDefinition;
  onChanged: () => void;
  onEditCustom: (def: CustomDefinition) => void;
}) {
  const [state, setState] = useState<RowState>({ kind: "idle" });
  const [openError, setOpenError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteCustom() {
    if (!customDef) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteCustomEmulator(customDef.id);
      onChanged();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Não foi possível excluir este emulador.");
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

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

  return (
    <>
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
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">{source.reason}</p>
          {/* O site oficial abre pelo botão abaixo, mas o download em si
              precisa ir pra algum lugar que o ZeuX ache sozinho depois
              (findBinary, internal/emulator/discovery.go) — o Program
              Files funciona (é o primeiro lugar verificado fora da pasta
              gerenciada), mas essa pasta é a garantia: colar/extrair aqui
              sempre funciona, sem depender de onde o instalador do
              Dolphin decidir instalar por padrão (achado real,
              2026-08-17). */}
          <p className="text-sm text-muted">
            Extraia (ou instale) o {entry.name} nesta pasta para o ZeuX encontrar sozinho:
          </p>
          {entry.managed_dir && (
            <p className="break-all rounded border border-line bg-fill px-3 py-2 font-mono text-xs text-ink select-all">
              {entry.managed_dir}
            </p>
          )}
        </div>
      )}

      {/* RetroArch ("kind": "bundled") deveria ser encontrado por Locate()
          antes de qualquer clique — a cópia vem dentro do instalador do ZeuX
          (ADR 0012). Mas isso só é verdade para o build oficial cortado com
          RetroArch empacotado (ZEUX_BUNDLE_RETROARCH=1, hoje só a tag
          v0.5.0 em release.yml); um `npm run tauri build`/`tauri dev` comum
          empacota a pasta vazia. Chegar aqui com entry.installed=false
          significa que este build não tem a cópia — mostrar o botão
          genérico "Instalar" levava a um beco sem saída (Start() sempre
          recusa "bundled" com "não há nada para baixar", já que o servidor
          não sabe a diferença entre "ainda não copiou" e "este build nunca
          empacotou"). Trata como "manual": manda para o site oficial, de
          onde também se baixam os cores pelo Online Updater interno do
          RetroArch (achado real, 2026-08-17). */}
      {!entry.installed && source?.kind === "bundled" && (
        <p className="text-sm text-muted">
          Este build do ZeuX não trouxe o RetroArch empacotado. Baixe pelo site oficial — os cores
          são baixados de dentro do próprio RetroArch, pelo Online Updater.
        </p>
      )}

      {/* Emulador personalizado (I1) cujo caminho não foi encontrado —
          continua na lista (nunca some sozinho), com Editar/Excluir
          disponíveis para o usuário corrigir o caminho ou desistir. */}
      {customDef && !entry.installed && (
        <p className="text-sm text-danger">O executável não foi encontrado em "{customDef.binary_path}".</p>
      )}

      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}
      {openError && <p className="text-sm text-danger">{openError}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {entry.installed && (
          // Renomeado de "Configurar" para "Abrir configurações do
          // emulador" (H2, docs/roadmap.md) — continua existindo como
          // escape hatch mesmo para os adapters que já têm
          // EmulatorConfigPanel/EmulatorBindingsPanel: informar, não
          // bloquear, o ZeuX nunca vira o único caminho.
          <Button variant="secondary" disabled={opening} onClick={openStandalone} title="Abre o emulador sem nenhum jogo, para configurar dentro dele.">
            {opening ? "Abrindo…" : "Abrir configurações do emulador"}
          </Button>
        )}

        {customDef ? (
          // Emulador personalizado (I1): nunca passa por install/uninstall
          // genérico (não tem fonte de download) — Editar/Excluir são as
          // únicas ações, disponíveis mesmo se o binário sumiu do caminho.
          <>
            <Button variant="secondary" onClick={() => onEditCustom(customDef)}>
              Editar
            </Button>
            {confirmingDelete ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" autoFocus disabled={deleting} onClick={deleteCustom}>
                  Excluir mesmo assim
                </Button>
                <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button variant="secondary" disabled={deleting} onClick={() => setConfirmingDelete(true)}>
                Excluir
              </Button>
            )}
          </>
        ) : entry.installed ? (
          canRemove &&
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
          ))
        ) : source?.kind === "manual" || source?.kind === "bundled" ? (
          <Button variant="primary" onClick={() => openUrl(source.homepage)}>
            Abrir site oficial
          </Button>
        ) : state.kind === "installing" || state.kind === "done" || state.kind === "confirm-hardware" ? null : (
          <Button variant="primary" disabled={state.kind === "starting"} onClick={() => install(false)}>
            {state.kind === "error" ? "Tentar de novo" : "Instalar"}
          </Button>
        )}
      </div>
    </>
  );
}

// Orquestrador (pós-K6, docs/roadmap.md): compõe os pedaços acima em vez de
// misturar header, consoles, config, BIOS e a máquina de estados de
// instalação num único componente de ~370 linhas.
function EmulatorCard({
  entry,
  source,
  customDef,
  verdictById,
  onSelectConsole,
  onChanged,
  onEditCustom,
}: {
  entry: EmulatorEntry;
  source?: EmulatorSource;
  /** Presente quando este entry veio de um cadastro manual (I1,
   * docs/roadmap.md) — troca Instalar/Remover pelo par Editar/Excluir. */
  customDef?: CustomDefinition;
  verdictById: Map<string, ConsoleVerdict>;
  onSelectConsole: (consoleId: string) => void;
  onChanged: () => void;
  onEditCustom: (def: CustomDefinition) => void;
}) {
  const [showCores, setShowCores] = useState(false);

  // Só um console = a cor dele vira a identidade do card inteiro (12 dos 13
  // adapters embutidos além do RetroArch atendem exatamente 1). Mais de um
  // (RetroArch) não tem uma identidade só — fica neutro.
  const identityColor = entry.consoles.length === 1 ? consoleAccentColor(entry.consoles[0]) : undefined;
  const cardStyle: CSSProperties | undefined = identityColor
    ? { borderLeftColor: identityColor, borderLeftWidth: 3 }
    : undefined;

  return (
    <Card className="flex flex-col gap-3" style={cardStyle}>
      <EmulatorCardHeader entry={entry} identityColor={identityColor} />
      <EmulatorCardConsoles entry={entry} verdictById={verdictById} onSelectConsole={onSelectConsole} />
      <EmulatorCardConfigPanels entry={entry} />
      <EmulatorCardBios entry={entry} />

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

      <EmulatorCardActions
        entry={entry}
        source={source}
        customDef={customDef}
        onChanged={onChanged}
        onEditCustom={onEditCustom}
      />
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
  const [customs, setCustoms] = useState<CustomDefinition[]>([]);
  const [placeholders, setPlaceholders] = useState<Record<string, string>>({});
  // "closed" | "new" | a definição sendo editada — controla o formulário do
  // I1, que substitui tanto o botão "+ Adicionar" quanto o "Editar" de um
  // card específico.
  const [formMode, setFormMode] = useState<"closed" | "new" | CustomDefinition>("closed");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [consoleFilter, setConsoleFilter] = useState("");
  const [modalConsoleId, setModalConsoleId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const verdictById = useMemo(() => new Map(report?.verdicts.map((v) => [v.console_id, v]) ?? []), [report]);
  const customById = useMemo(() => new Map(customs.map((c) => [c.id, c])), [customs]);

  useEffect(() => {
    api
      .getEmulators()
      .then((res) => setEmulators(res.emulators))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível listar os emuladores."));
  }, [reloadKey]);

  // Emuladores personalizados (I1, docs/roadmap.md) — mesma dependência de
  // reloadKey que a lista de emuladores, para as duas ficarem em sincronia
  // depois de salvar/excluir uma definição.
  useEffect(() => {
    api
      .getCustomEmulators()
      .then((res) => {
        setCustoms(res.custom_emulators);
        setPlaceholders(res.placeholders);
      })
      .catch(() => {
        // Falha aqui só esconde Editar/Excluir dos cartões personalizados —
        // eles continuam aparecendo como emulador comum na lista (via
        // GET /emulators, que não depende desta chamada). Não vale um
        // Callout dedicado por uma degradação tão parcial.
      });
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
    // O5 (docs/roadmap.md, Sprint O): mesmo teto escalonado de AllGamesScreen —
    // nada muda abaixo de 1536px, evita o container travar em 1152px de
    // conteúdo útil em janela grande/4K.
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-10 2xl:max-w-[1600px] min-[2400px]:max-w-[2000px]">
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
          <>
            <label htmlFor="emulators-search" className="sr-only">
              Buscar emulador ou console
            </label>
            <input
              id="emulators-search"
              type="text"
              name="emulators-search"
              autoComplete="off"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar emulador ou console…"
              className="w-full max-w-xs rounded border border-line bg-fill px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </>
        )}

        {consoleOptions.length > 0 && (
          <Select
            value={consoleFilter || ALL_CONSOLES}
            onValueChange={(v) => handleConsoleFilter(v === ALL_CONSOLES ? "" : v)}
          >
            <SelectTrigger aria-label="Filtrar por console" className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CONSOLES}>Todos os consoles</SelectItem>
              {consoleOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Falha ao listar os emuladores é erro de tela inteira (nada renderiza
          sem essa lista) — vira modal, não parágrafo vermelho solto no topo
          (mesmo achado do Douglas em GamesScreen/AllGamesScreen,
          2026-08-07). Os erros por card (instalar/remover/abrir pasta de
          BIOS, em EmulatorCardActions/EmulatorCardBios abaixo) continuam
          inline, de propósito: aparecem dentro do próprio card cuja ação
          falhou, ao lado do botão que a disparou — diferente do erro que
          motivou a troca, que ficava longe da célula que o causou. */}
      {error && <ErrorModal title="Não foi possível listar os emuladores" message={error} onClose={() => setError(null)} />}

      {emulators && filtered.length === 0 && (
        <p className="text-base text-muted">Nenhum emulador encontrado para "{search}".</p>
      )}

      {pageItems.length > 0 && (
        <>
          {/* O4 (docs/roadmap.md, Sprint O): a causa raiz do estouro em
              1024-1279px era o grid interno do EmulatorBindingsPanel, já
              corrigido lá para flex-wrap — um card de ~290px (3 colunas em
              1024px) agora só quebra o mapeamento em mais linhas, sem gerar
              rolagem horizontal. Por isso o breakpoint continua em `lg`, sem
              usar `xl` (proibido pelo K3). O5: `2xl`/`min-[2400px]` acompanham
              o teto do container acima — sem eles, o card ficaria cada vez
              mais largo (e mais vazio) conforme a janela cresce, em vez de
              ganhar mais uma coluna. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[2400px]:grid-cols-5">
            {pageItems.map((entry) => (
              <EmulatorCard
                key={entry.adapter_id}
                entry={entry}
                source={sources[entry.adapter_id]}
                customDef={customById.get(entry.adapter_id)}
                verdictById={verdictById}
                onSelectConsole={setModalConsoleId}
                onChanged={() => setReloadKey((k) => k + 1)}
                onEditCustom={setFormMode}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {/* I1, docs/roadmap.md: o backend já existia por inteiro
          (GET/POST/DELETE /custom-emulators, internal/emulator/custom.go) —
          esta tela era o único pedaço faltando. */}
      <div className="mt-6">
        <p className="mb-2 font-pixel text-[11px] tracking-wide text-muted uppercase">Adicionar emulador</p>
        {formMode === "closed" ? (
          <button
            type="button"
            onClick={() => setFormMode("new")}
            className="w-full rounded border border-dashed border-line-strong px-4 py-3 text-center font-pixel text-[11px] text-muted transition-colors hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            + Adicionar emulador manualmente
          </button>
        ) : (
          <ManualEmulatorForm
            existing={formMode === "new" ? undefined : formMode}
            existingIds={customs.map((c) => c.id).filter((id) => formMode === "new" || id !== (formMode as CustomDefinition).id)}
            placeholders={placeholders}
            onSaved={() => {
              setFormMode("closed");
              setReloadKey((k) => k + 1);
            }}
            onCancel={() => setFormMode("closed")}
          />
        )}
      </div>

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
