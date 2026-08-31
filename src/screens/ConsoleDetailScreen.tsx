import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { api, ApiError } from "../api";
import type {
  ConsoleEmulatorOption,
  ConsoleEntry,
  EmulatorEntry,
  EmulatorSource,
  LibraryFolder,
  Report,
  RetroArchCoreStatus,
} from "../api/types";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardSkeleton,
  ConfirmModal,
  ConsoleVerdictCard,
  InlineError,
  ProgressBar,
  ScreenContainer,
} from "../components/ui";
import { useCoreInstall } from "../hooks/useCoreInstall";
import { useEmulatorInstall } from "../hooks/useEmulatorInstall";
import { consoleAccentColor } from "../lib/consoleColor";
import { percentOf } from "../lib/format";
import { buildReadinessIndex, evaluateConsoleReadiness } from "../lib/consoleReadiness";

/**
 * Uma forma de rodar este console. Cada opção é um card: o que é, se está
 * instalada, o core que ela precisa (quando carrega cores) e as ações.
 *
 * Os 5 consoles com mais de uma opção (ps1, n64, dreamcast, psp, nds) são o
 * motivo de isto ser uma lista e não um bloco só. A ordem vem do servidor e
 * **não** é reordenada aqui — a preferência por emulador dedicado é regra de
 * produto e mora em `Registry.ForConsole`.
 */
function EmulatorOptionCard({
  option,
  entry,
  source,
  core,
  isChosen,
  onChanged,
}: {
  option: ConsoleEmulatorOption;
  /** Ausente só se `GET /emulators` não conhecer este adapter — não deveria acontecer. */
  entry?: EmulatorEntry;
  source?: EmulatorSource;
  /** Estado do core que este console pede. Ausente para emulador standalone. */
  core?: RetroArchCoreStatus;
  /** Esta é a opção que o ZeuX usaria hoje (a primeira instalada). */
  isChosen: boolean;
  onChanged: () => void;
}) {
  const { state, setState, install, remove } = useEmulatorInstall({ adapterId: option.adapter_id, onChanged });
  const coreInstall = useCoreInstall({ onCoreReady: onChanged });
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const installed = entry?.installed ?? false;
  // Só faz sentido remover o que o ZeuX colocou na pasta gerenciada — o
  // emulador que o usuário já tinha por conta própria não é nosso para apagar.
  const canRemove = installed && entry?.installation?.managed;

  async function openStandalone() {
    setOpening(true);
    setOpenError(null);
    try {
      await api.openEmulator(option.adapter_id);
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : "Não foi possível abrir o emulador.");
    } finally {
      setOpening(false);
    }
  }

  const coreState = option.core ? coreInstall.stateFor(option.core) : { kind: "idle" as const };
  const corePercent =
    coreState.kind === "installing" || coreState.kind === "canceling" ? percentOf(coreState.job) : null;

  return (
    <Card className="flex flex-col gap-3" style={isChosen ? { borderColor: "var(--accent)" } : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{option.name}</p>
          {/* Diz o que o ZeuX faria sem o usuário escolher nada — a resposta
              para "e se eu tiver os dois instalados?" nos 5 consoles onde
              isso é possível. Só aparece quando há mais de uma opção; num
              console de emulador único seria ruído. */}
          {isChosen && <p className="text-xs text-accent">É o que o ZeuX usa para abrir os jogos deste console.</p>}
        </div>
        <span className="shrink-0 whitespace-nowrap">
          {installed ? (
            <Badge variant="solid">{entry?.installation?.managed ? "instalado pelo ZeuX" : "já estava na máquina"}</Badge>
          ) : (
            <Badge>não instalado</Badge>
          )}
        </span>
      </div>

      {/* O core é a peça que falta com mais frequência: o RetroArch pode
          estar instalado e o core deste console não, e aí o jogo não abre.
          Fica no card da opção, e não numa seção separada, porque é
          propriedade dela — um standalone não tem core nenhum. */}
      {option.core && (
        <div className="flex flex-col gap-1.5 rounded border border-line bg-fill px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Core deste console:</span>
            <span className="font-mono text-sm text-ink">{option.core}</span>
            <Badge variant={core?.installed ? "solid" : undefined}>{core?.installed ? "baixado" : "faltando"}</Badge>

            {!core?.installed && coreState.kind === "idle" && (
              <Button
                variant="secondary"
                className="ml-auto shrink-0 px-2 py-1 text-xs"
                onClick={() => coreInstall.installCore(option.core!)}
              >
                Baixar core
              </Button>
            )}
            {coreState.kind === "starting" && <span className="ml-auto text-xs text-muted">Iniciando…</span>}
          </div>

          {(coreState.kind === "installing" || coreState.kind === "canceling") && (
            <div className="flex items-center gap-1.5">
              <ProgressBar className="flex-1" percent={corePercent} label={`Baixando o core ${option.core}`} />
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {corePercent === null ? coreState.job.phase : `${corePercent}%`}
              </span>
              <Button
                variant="quiet"
                className="shrink-0 px-1.5 py-0.5 text-xs"
                disabled={coreState.kind === "canceling"}
                onClick={() => coreInstall.cancelCore(option.core!, coreState.job)}
              >
                {coreState.kind === "canceling" ? "Cancelando…" : "Cancelar"}
              </Button>
            </div>
          )}

          {coreState.kind === "error" && <InlineError>{coreState.message}</InlineError>}

          {/* Descritivo, nunca cobrança: o modelo sob demanda (ADR 0015) baixa
              o core sozinho ao abrir um jogo, então um core ausente não é
              pendência do usuário — é o comportamento normal. */}
          {!core?.installed && coreState.kind === "idle" && (
            <p className="text-xs text-muted">
              O ZeuX baixa este core sozinho na primeira vez que você abrir um jogo deste console.
            </p>
          )}
        </div>
      )}

      {state.kind === "confirm-hardware" && (
        <ConfirmModal
          title="Hardware abaixo do recomendado"
          message={state.message}
          onClose={() => setState({ kind: "idle" })}
          actions={
            <>
              <Button variant="secondary" onClick={() => setState({ kind: "idle" })}>
                Cancelar
              </Button>
              <Button variant="primary" autoFocus onClick={() => install(true)}>
                Instalar mesmo assim
              </Button>
            </>
          }
        />
      )}

      {state.kind === "confirm-remove" && (
        <ConfirmModal
          title="Remover emulador?"
          message={`${option.name} será desinstalado da pasta gerenciada pelo ZeuX.`}
          onClose={() => setState({ kind: "idle" })}
          actions={
            <>
              <Button variant="secondary" onClick={() => setState({ kind: "idle" })}>
                Cancelar
              </Button>
              <Button variant="danger" autoFocus onClick={remove}>
                Remover mesmo assim
              </Button>
            </>
          }
        />
      )}

      {(state.kind === "installing" || state.kind === "done") && (
        <div>
          <p className="text-sm text-muted">
            {state.job.phase}
            {state.job.asset_name ? ` · ${state.job.asset_name}` : ""}
          </p>
          {state.kind === "installing" && (
            <div className="mt-1">
              <ProgressBar percent={percentOf(state.job)} label={`Instalando ${option.name}`} />
            </div>
          )}
        </div>
      )}

      {state.kind === "error" && <InlineError>{state.message}</InlineError>}
      {state.kind === "remove-error" && <InlineError>{state.message}</InlineError>}
      {openError && <InlineError>{openError}</InlineError>}

      {/* Fontes "manual" (RetroArch e Dolphin) não distribuem por releases do
          GitHub — não há como o ZeuX resolver a versão mais recente por API
          (docs/adapters.md). Em vez de um botão "Instalar" que sempre falha,
          abre o site oficial e mostra a pasta onde extrair para o ZeuX
          encontrar sozinho depois (achado real, 2026-08-17). */}
      {!installed && source?.kind === "manual" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">{source.reason}</p>
          <p className="text-sm text-muted">
            Extraia (ou instale) o {option.name} nesta pasta para o ZeuX encontrar sozinho:
          </p>
          {entry?.managed_dir && (
            <p className="break-all rounded border border-line bg-fill px-3 py-2 font-mono text-xs text-ink select-all">
              {entry.managed_dir}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {installed ? (
          <>
            <Button
              variant="primary"
              disabled={opening}
              onClick={openStandalone}
              title="Abre o emulador sem nenhum jogo, para configurar dentro dele."
            >
              {opening ? "Abrindo…" : "Abrir configurações do emulador"}
            </Button>
            {canRemove && (
              <Button
                variant="secondary"
                disabled={state.kind === "removing"}
                onClick={() => setState({ kind: "confirm-remove" })}
              >
                {state.kind === "remove-error" ? "Tentar remover de novo" : "Remover"}
              </Button>
            )}
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
 * A pasta com os jogos deste console. Apontar a pasta é a única das quatro
 * peças da prontidão que o ZeuX **não** pode resolver sozinho — o caminho
 * vem do seletor nativo do sistema, escolhido pelo usuário.
 *
 * É também o único lugar da tela que toca o disco fora de `%AppData%`: o
 * `plugin-dialog` não passa pela capability `opener:allow-open-path`
 * (restrita a `$CONFIG/**`) justamente porque quem escolhe é a pessoa.
 * Ver a Sprint P em docs/roadmap.md.
 */
function GamesFolderSection({
  consoleId,
  shortName,
  folders,
  onChanged,
  onOpenGames,
}: {
  consoleId: string;
  shortName: string;
  folders: LibraryFolder[];
  onChanged: () => void;
  onOpenGames?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<number | null>(null);

  useEffect(() => {
    if (folders.length === 0) {
      setCount(null);
      return;
    }
    api
      .getLibraryGames(consoleId)
      .then((res) => setCount(res.games.length))
      // Contagem é conveniência: falhar aqui não pode tirar do usuário os
      // botões de apontar/varrer a pasta.
      .catch(() => setCount(null));
  }, [consoleId, folders.length]);

  async function pickFolder() {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked !== "string") return;

    setBusy(true);
    setError(null);
    try {
      await api.addLibraryFolder(consoleId, picked);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível apontar esta pasta.");
    } finally {
      setBusy(false);
    }
  }

  async function runFolderAction(action: Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action;
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
      setConfirmingRemove(null);
    }
  }

  return (
    <Card filled className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">Jogos de {shortName}</p>
        {count !== null && (
          <span className="text-sm text-muted">
            {count} {count === 1 ? "jogo encontrado" : "jogos encontrados"}
          </span>
        )}
      </div>

      {error && <InlineError>{error}</InlineError>}

      {folders.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhuma pasta apontada ainda. O ZeuX lê os jogos direto de onde eles já estão no seu disco — nada é
          copiado nem movido.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {folders.map((folder) => (
            <li key={folder.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-muted" title={folder.path}>
                {folder.path}
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  variant="quiet"
                  disabled={busy}
                  onClick={() => runFolderAction(api.rescanLibraryFolder(folder.id), "Não foi possível varrer a pasta.")}
                >
                  Varrer de novo
                </Button>
                <Button variant="quiet" disabled={busy} onClick={() => setConfirmingRemove(folder.id)}>
                  Remover
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {confirmingRemove !== null && (
        <ConfirmModal
          title="Remover esta pasta?"
          message="Os jogos dela saem da biblioteca do ZeuX. Nenhum arquivo é apagado do seu disco."
          onClose={() => setConfirmingRemove(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setConfirmingRemove(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                autoFocus
                onClick={() =>
                  runFolderAction(api.removeLibraryFolder(confirmingRemove), "Não foi possível remover a pasta.")
                }
              >
                Remover mesmo assim
              </Button>
            </>
          }
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant={folders.length === 0 ? "primary" : "secondary"} disabled={busy} onClick={pickFolder}>
          {folders.length === 0 ? "Escolher pasta" : "Apontar outra pasta"}
        </Button>
        {onOpenGames && folders.length > 0 && (
          <Button variant="secondary" onClick={onOpenGames}>
            Ver jogos
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * O BIOS/firmware do console, quando o ZeuX sabe onde o emulador escolhido lê
 * o arquivo.
 *
 * **O que esta seção deliberadamente não faz:** apontar uma pasta por
 * convenção. `BiosDir` (internal/emulator/bios_dir.go) só responde para
 * DuckStation instalado pelo ZeuX e PCSX2 no Linux — nos demais casos o
 * caminho nunca foi verificado contra o emulador rodando, e uma pasta errada
 * é pior que nenhuma: o usuário coloca o arquivo, o jogo continua não
 * abrindo, e agora ele nem sabe mais por quê. Console marcado
 * `requires_external_file` sem pasta conhecida recebe o aviso genérico, sem
 * caminho — princípio 4 do CLAUDE.md.
 *
 * O ZeuX também nunca sugere onde obter o arquivo. Ver o princípio 6.
 */
function BiosSection({ entry, requiresExternalFile }: { entry?: EmulatorEntry; requiresExternalFile: boolean }) {
  const [error, setError] = useState<string | null>(null);

  if (!entry?.bios_dir) {
    if (!requiresExternalFile) return null;
    return (
      <Card filled className="flex flex-col gap-2">
        <p className="font-semibold text-ink">BIOS / firmware</p>
        <p className="text-sm text-muted">
          Este console costuma exigir um arquivo de BIOS ou firmware do próprio aparelho.
        </p>
        {/* Dois motivos diferentes para não haver pasta, e dizer "o ZeuX não
            sabe" nos dois seria impreciso no primeiro: sem emulador instalado
            a pasta não é desconhecida, ela ainda não existe — depende de qual
            emulador for instalado. Achado ao ver a tela do PS1 de verdade
            (2026-08-28), que caía no texto de "não sabe" com nada instalado. */}
        <p className="text-sm text-muted">
          {entry
            ? `O ZeuX ainda não sabe em que pasta o ${entry.name} lê esse arquivo — a configuração fica dentro do próprio emulador.`
            : "A pasta depende do emulador. Instale um acima e ela aparece aqui, se o ZeuX souber onde aquele emulador lê o arquivo."}
        </p>
      </Card>
    );
  }

  async function openBiosFolder() {
    setError(null);
    try {
      await openPath(entry!.bios_dir!);
    } catch (err) {
      setError(`Não foi possível abrir a pasta do BIOS: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <Card filled className="flex flex-col gap-2">
      <p className="font-semibold text-ink">BIOS / firmware</p>
      {entry.bios_dir_empty && (
        <Callout label="BIOS ausente">
          A pasta de BIOS do {entry.name} está vazia. Sem o arquivo, os jogos deste console não devem abrir.
        </Callout>
      )}
      <p className="break-all rounded border border-line bg-panel px-3 py-2 font-mono text-xs text-ink select-all">
        {entry.bios_dir}
      </p>
      {error && <InlineError>{error}</InlineError>}
      <Button type="button" variant="secondary" onClick={openBiosFolder}>
        Abrir pasta do BIOS
      </Button>
    </Card>
  );
}

/**
 * Detalhe de um console (P2, docs/roadmap.md, Sprint P): tudo que este console
 * precisa para rodar, num lugar só — as formas de rodá-lo, o core, o BIOS e a
 * pasta de jogos.
 *
 * Busca sozinha em vez de receber a `ConsoleEntry` da lista: assim a tela
 * sobrevive a um reload e às ações que mudam o estado (instalar, baixar core,
 * apontar pasta) sem depender de o pai revalidar. `reload` é o único caminho
 * de atualização — cada seção o chama ao mudar algo, e a prontidão do topo
 * reflete a mudança na mesma volta.
 *
 * As quatro buscas são de tela inteira, nenhuma por opção de emulador; a
 * prontidão reusa `evaluateConsoleReadiness`, a mesma da lista, para as duas
 * telas nunca discordarem sobre o que falta.
 */
export function ConsoleDetailScreen({
  consoleId,
  report,
  onBack,
  onOpenGames,
}: {
  consoleId: string;
  report?: Report;
  onBack: () => void;
  /** Ausente sem parecer carregado — `GamesScreen` exige o preset. */
  onOpenGames?: () => void;
}) {
  const [entry, setEntry] = useState<ConsoleEntry | null>(null);
  const [emulators, setEmulators] = useState<EmulatorEntry[]>([]);
  const [sources, setSources] = useState<Record<string, EmulatorSource>>({});
  const [cores, setCores] = useState<RetroArchCoreStatus[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .getConsoles()
      .then((res) => {
        const found = res.consoles.find((c) => c.console_id === consoleId);
        if (!found) {
          setError(`O console "${consoleId}" não está no catálogo do ZeuX.`);
          return;
        }
        setEntry(found);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível carregar este console."));

    // As três abaixo só enriquecem a tela: falhar numa delas degrada o que
    // ela mostra, nunca troca a tela inteira por um erro.
    api.getEmulators().then((res) => setEmulators(res.emulators)).catch(() => {});
    api.getRetroArchCores().then((res) => setCores(res.cores)).catch(() => {});
    api.getLibraryFolders().then((res) => setFolders(res.folders)).catch(() => {});
  }, [consoleId]);

  useEffect(() => {
    reload();
    // As fontes de download não mudam em tempo de execução (catálogo embutido)
    // — buscadas uma vez, fora do `reload`.
    api
      .getEmulatorSources()
      .then((res) => setSources(Object.fromEntries(res.sources.map((s) => [s.adapter_id, s]))))
      .catch(() => {});
  }, [reload]);

  if (error) {
    return (
      <ScreenContainer variant="listing">
        <Button variant="quiet" onClick={onBack}>
          ← Consoles
        </Button>
        <div className="mt-4">
          <InlineError>{error}</InlineError>
        </div>
      </ScreenContainer>
    );
  }

  if (!entry) {
    return (
      <ScreenContainer variant="listing">
        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          <span className="sr-only">Carregando console…</span>
          <CardSkeleton className="h-24" />
          <CardSkeleton className="h-48" />
        </div>
      </ScreenContainer>
    );
  }

  const index = buildReadinessIndex(emulators, cores, folders);
  const readiness = evaluateConsoleReadiness(entry, index);
  const emulatorById = new Map(emulators.map((e) => [e.adapter_id, e]));
  const coreByName = new Map(cores.map((c) => [c.name, c]));
  const consoleFolders = folders.filter((f) => f.console_id === consoleId);
  const verdict = report?.verdicts.find((v) => v.console_id === consoleId);
  const accent = consoleAccentColor(consoleId);
  const chosenEntry = readiness.chosen ? emulatorById.get(readiness.chosen.adapter_id) : undefined;

  return (
    <ScreenContainer variant="listing">
      <Button variant="quiet" onClick={onBack}>
        ← Consoles
      </Button>

      <div className="mt-3 mb-6 border-l-[3px] pl-4" style={{ borderLeftColor: accent }}>
        <h1 className="text-2xl font-semibold text-ink">{entry.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {entry.year} · {entry.short_name}
        </p>
      </div>

      {/* A prontidão abre a tela porque é a resposta à pergunta que trouxe o
          usuário aqui. Uma frase, e ela nomeia a peça que falta — nunca uma
          nota opaca (princípio 3). */}
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-3" filled>
        <p className="text-base text-ink">{readiness.detail}</p>
        <span className="shrink-0 whitespace-nowrap">
          <Badge variant={readiness.step === "pronto" ? "solid" : "default"}>{readiness.badge}</Badge>
        </span>
      </Card>

      {/* O6 (Sprint O) e a regra de layout responsivo do CLAUDE.md: coluna
          lateral com teto, nunca largura fixa; `lg` e não `xl` porque esta
          área já divide espaço com a sidebar. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(280px,360px)]">
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-ink">
            {entry.emulators.length === 1 ? "Como rodar" : `Como rodar — ${entry.emulators.length} opções`}
          </h2>

          {entry.emulators.length === 0 ? (
            <Card filled>
              <p className="text-sm text-muted">
                O ZeuX ainda não conhece nenhum emulador para {entry.name}. Nada a instalar por aqui — quando um
                adapter para este console existir, ele aparece nesta tela sozinho.
              </p>
            </Card>
          ) : (
            entry.emulators.map((option) => (
              <EmulatorOptionCard
                key={option.adapter_id}
                option={option}
                entry={emulatorById.get(option.adapter_id)}
                source={sources[option.adapter_id]}
                core={option.core ? coreByName.get(option.core) : undefined}
                isChosen={entry.emulators.length > 1 && readiness.chosen?.adapter_id === option.adapter_id}
                onChanged={reload}
              />
            ))
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <GamesFolderSection
            consoleId={consoleId}
            shortName={entry.short_name}
            folders={consoleFolders}
            onChanged={reload}
            onOpenGames={onOpenGames}
          />

          <BiosSection entry={chosenEntry} requiresExternalFile={entry.requires_external_file ?? false} />

          {/* O parecer de hardware é a outra pergunta ("esta máquina
              aguenta?"), respondida pelo mesmo card que a tela de
              Especificações usa — nunca uma segunda formatação da mesma
              informação. Ausente sem consentimento/scan. */}
          {verdict && (
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-ink">Nesta máquina</h2>
              <ConsoleVerdictCard verdict={verdict} />
            </div>
          )}
        </aside>
      </div>
    </ScreenContainer>
  );
}
