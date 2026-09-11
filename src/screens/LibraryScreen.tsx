import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronRight, Folder, FolderPlus, RefreshCw, Trash2 } from "lucide-react";
import { api, ApiError, consoleImageURL } from "../api";
import { consoleAccentColor } from "../lib/consoleColor";
import type { BulkMatchedFolder, ConsoleEntry, LibraryFolder, LibraryGame, Report } from "../api/types";
import { rescanAllFoldersIfStale } from "../lib/autoRescan";
import {
  Button,
  Callout,
  Card,
  CardSkeleton,
  ConfirmModal,
  consoleIconLabel,
  ConsoleInfoModal,
  EmptyState,
  ErrorModal,
  FOCUS_RING,
  InlineError,
  ScreenContainer,
  ScreenHeader,
  SectionHeading,
  ZSelect,
} from "../components/ui";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { SelectItem } from "../components/ui/select";
import { useT } from "../i18n/i18n";
import { dict } from "./LibraryScreen.i18n";

type ConsoleInfo = { console_id: string; name: string; short_name: string };

/**
 * "Selecionar pasta para todos os jogos" (2026-08-05, a pedido do Douglas):
 * uma pasta-raiz organizada com uma subpasta por console — o ZeuX casa cada
 * subpasta pelo nome (POST /library/folders/bulk), nunca por extensão de
 * arquivo solto (essa rota foi descartada de propósito em 2026-08-02, ver o
 * docstring de LibraryScreen abaixo). Fica no topo da tela, fora da lista de
 * consoles, porque não pertence a nenhum console em particular. M9
 * (docs/sprint-m-plano.md): continua sendo o único assistente — a
 * reorganização não construiu um segundo.
 */
function BulkFolderPicker({ onDone }: { onDone: () => void }) {
  const t = useT(dict);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ matched: BulkMatchedFolder[]; unmatched: string[] } | null>(null);

  async function handlePick() {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked !== "string") return;

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.bulkAddLibraryFolders(picked);
      setResult(res);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("couldNotScanFolder"));
    } finally {
      setBusy(false);
    }
  }

  return (
    /* 2026-09-07 (redesenho arcade/CRT): este cartão e as linhas de console
       tinham exatamente o mesmo peso visual (`Card filled`, borda cinza) —
       numa tela em que ele é o atalho que resolve 33 consoles de uma vez e
       elas são o resultado, os dois liam como itens irmãos de uma lista. Ganha
       a borda esquerda roxa (a cor de ação da paleta) e a scanline decorativa
       que a abertura e o herói já usam, marcando "isto é o caminho rápido"
       sem tirar espaço nenhum de conteúdo. `overflow-hidden`: a scanline é um
       overlay absoluto e precisa ser cortada no raio do cartão. */
    <Card
      filled
      className="relative mb-4 flex flex-col gap-3 overflow-hidden"
      style={{ borderLeftColor: "var(--accent)", borderLeftWidth: 3 }}
    >
      <div aria-hidden="true" className="zeux-scanlines pointer-events-none absolute inset-0 opacity-30" />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <div>
          {/* Rótulo-kicker em monoespaçada: mesmo vocabulário de "etiqueta de
              chassi" dos chips e do `Callout`, e o degrau que diz o papel do
              cartão antes do título. */}
          <p className="mb-1 font-mono text-xs tracking-wider text-accent uppercase">{t("bulkKicker")}</p>
          <p className="font-semibold text-ink">{t("selectFolderForAllGames")}</p>
          <p className="text-sm text-muted">{t("selectFolderDescription")}</p>
        </div>
        {/* Continua `primary` (e não `chrome`, embora "apontar pasta" seja
            papel de chrome no vocabulário de ui.tsx): é o único CTA primário
            da tela — a ação que resolve a tarefa inteira de uma vez. O
            "Escolher pasta" console a console, abaixo, é que virou `chrome`,
            preservando um primário por tela. */}
        <Button type="button" variant="primary" disabled={busy} onClick={handlePick}>
          {busy ? t("scanning") : t("chooseFolderButton")}
        </Button>
      </div>

      {error && <InlineError>{error}</InlineError>}

      {result && (
        <div className="relative flex flex-col gap-2">
          {result.matched.length > 0 ? (
            <p className="text-sm text-ink">
              {t("consolesMatched", { count: result.matched.length, names: result.matched.map((m) => `${m.name} (${m.games_found})`).join(", ") })}
            </p>
          ) : (
            <EmptyState variant="inline" title={t("noConsolesMatched")} />
          )}

          {result.unmatched.length > 0 && (
            <Callout label={t("unmatchedSubfolders")}>
              {result.unmatched.join(", ")} {t("unmatchedFoldersHelp")}
            </Callout>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Linha de gerência de um console configurado (redesenho retrô 2026-09-09,
 * achados 1 e 2 do critico-layout: "matar o card dentro do card" e "a tela de
 * pastas é GERÊNCIA, não vitrine").
 *
 * Era um `Card filled dense` com quatro molduras aninhadas (caixa de 64px do
 * ConsoleIcon, bloco separado por `border-t`, botões com borda + sombra
 * interna). Agora o console é a ÚNICA superfície: uma linha densa no formato
 * de `GameListRow` — [logo 40px] nome · N jogos … [caminho mono] [ações no
 * hover]. `grid-cols-1` sempre, mesmo em janela larga: tabela de gerência não
 * quer 2 colunas. Pastas extras do mesmo console viram sub-linhas separadas
 * só por `border-t border-line`, sem caixa nenhuma.
 *
 * `games` ausente (`undefined`) enquanto a contagem carrega — nunca um
 * palpite de quantidade. A navegação de biblioteca (entrar no console para
 * ver jogos) é da tela de consoles; aqui "Ver jogos" continua existindo, mas
 * com peso de gerência, não de vitrine.
 */
function ConfiguredConsoleRow({
  consoleInfo,
  folders,
  games,
  busy,
  onRescan,
  onRemove,
  onOpenGames,
  onSelectConsole,
}: {
  consoleInfo: ConsoleInfo;
  folders: LibraryFolder[];
  /** Ausente enquanto `GET /library/games?console_id=` ainda não respondeu para este console. */
  games: LibraryGame[] | undefined;
  busy: boolean;
  onRescan: (folderId: number) => void;
  onRemove: (folderId: number) => void;
  onOpenGames: () => void;
  onSelectConsole: () => void;
}) {
  const t = useT(dict);
  // A5 (achado do critico-design): "Remover" apaga o apontamento sem volta —
  // confirmação obrigatória. `folderId`, não booleano: mais de uma pasta pode
  // existir por console.
  const [confirmingRemove, setConfirmingRemove] = useState<number | null>(null);
  const confirmingFolder = folders.find((f) => f.id === confirmingRemove);
  const accent = consoleAccentColor(consoleInfo.console_id);
  // A logo oficial não existe para os 3 consoles sem imagem cadastrada no
  // IGDB — cai para a sigla em pixel font, um quadro depois.
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div
      className="group/console border-t border-line first:border-t-0"
      // Borda esquerda de 3px na cor de identidade — mesmo sinal de
      // `EmulatorCard`/`ConsoleVerdictCard`, decorativo, nunca estado.
      style={{ borderLeftColor: accent, borderLeftWidth: 3 } as CSSProperties}
    >
      {confirmingFolder && (
        <ConfirmModal
          title={t("removeFolderTitle")}
          message={t("removeFolderMessage", { path: confirmingFolder.path })}
          onClose={() => setConfirmingRemove(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setConfirmingRemove(null)}>
                {t("cancel")}
              </Button>
              <Button
                variant="danger"
                autoFocus
                onClick={() => {
                  onRemove(confirmingFolder.id);
                  setConfirmingRemove(null);
                }}
              >
                {t("removeAnyway")}
              </Button>
            </>
          }
        />
      )}

      {/* Linha de identidade: logo + nome + contagem à esquerda (abre o modal
          de detalhe do console), "Ver jogos" à direita. */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={onSelectConsole}
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left transition-colors hover:bg-fill ${FOCUS_RING}`}
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-white"
            style={{ borderColor: `${accent}66` }}
          >
            {logoFailed ? (
              <span className="font-pixel text-[9px] leading-none text-ink">
                {consoleIconLabel(consoleInfo.console_id, consoleInfo.short_name)}
              </span>
            ) : (
              <img
                src={consoleImageURL(consoleInfo.console_id)}
                alt=""
                className="h-8 w-8 object-contain"
                onError={() => setLogoFailed(true)}
              />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{consoleInfo.name}</span>
            {/* Ciano quando a contagem chega ("aqui o sistema informa", regra
                da paleta), cinza enquanto conta. Não é badge nem chip: texto
                estático. */}
            <span
              className={`block font-mono text-xs tracking-wide ${games ? "text-accent-secondary" : "text-muted"}`}
            >
              {games ? t("gamesCount", { count: games.length }) : t("countingGames")}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenGames}
          className={`flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 font-mono text-xs tracking-wider text-muted uppercase transition-colors hover:text-ink ${FOCUS_RING}`}
        >
          {t("seeGames")}
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      </div>

      {/* Pastas apontadas — sub-linhas da MESMA superfície, separadas só por
          `border-t border-line`. Revarrer/Remover são icon-only e aparecem no
          hover/foco da linha do console. */}
      <ul aria-label={t("folderPathsLabel")}>
        {folders.map((folder) => (
          <li
            key={folder.id}
            className="flex items-center gap-2 border-t border-line py-1.5 pr-3 pl-16 text-muted"
          >
            <Folder size={12} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={folder.path}>
              {folder.path}
            </span>
            <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/console:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                title={t("rescan")}
                aria-label={t("rescan")}
                disabled={busy}
                onClick={() => onRescan(folder.id)}
                className={`rounded-sm p-1.5 text-muted transition-colors hover:text-accent-secondary disabled:opacity-40 ${FOCUS_RING}`}
              >
                <RefreshCw size={13} aria-hidden="true" className={busy ? "animate-spin" : ""} />
              </button>
              <button
                type="button"
                title={t("remove")}
                aria-label={t("remove")}
                disabled={busy}
                onClick={() => setConfirmingRemove(folder.id)}
                className={`rounded-sm p-1.5 text-muted transition-colors hover:text-danger disabled:opacity-40 ${FOCUS_RING}`}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * M9: seletor de console + "Escolher pasta" — só oferece consoles que
 * **ainda não** têm pasta apontada (senão duplicaria o que "Consoles
 * configurados" já resolve, e o usuário podia acabar com duas pastas
 * diferentes pro mesmo console sem perceber que já tinha uma). O diálogo
 * nativo aponta a pasta direto pro console escolhido, sem campo de texto
 * manual — critério do item é só "escolher o console + escolher a pasta";
 * `ConsoleLibraryCard` (removido) também aceitava colar um caminho à mão,
 * mas isso nunca foi parte do critério, só sobrou do desenho antigo.
 */
function AddConsoleSection({
  availableConsoles,
  onAdded,
}: {
  availableConsoles: ConsoleInfo[];
  onAdded: () => void;
}) {
  const t = useT(dict);
  const [consoleId, setConsoleId] = useState<string | undefined>(availableConsoles[0]?.console_id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A lista de disponíveis encolhe a cada pasta apontada (o console some
  // daqui e aparece em "Consoles configurados") — se o valor selecionado
  // saiu da lista, cai pro primeiro que sobrou, nunca trava num id inválido.
  useEffect(() => {
    if (consoleId && !availableConsoles.some((c) => c.console_id === consoleId)) {
      setConsoleId(availableConsoles[0]?.console_id);
    }
  }, [availableConsoles, consoleId]);

  async function handlePick() {
    if (!consoleId) return;
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked !== "string") return;

    setBusy(true);
    setError(null);
    try {
      await api.addLibraryFolder(consoleId, picked);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("couldNotPointFolder"));
    } finally {
      setBusy(false);
    }
  }

  if (availableConsoles.length === 0) {
    return <EmptyState variant="inline" title={t("allConsolesConfigured")} />;
  }

  // Redesenho retrô (2026-09-09, achado 1 do critico-layout): era um `Card`
  // tracejado ao lado dos cards sólidos — lia como "item quebrado" da lista.
  // Vira uma linha de ação no rodapé da seção: select + botão, sem moldura.
  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <p className="flex items-center gap-2 font-mono text-xs tracking-wider text-muted uppercase">
        <FolderPlus size={13} aria-hidden="true" />
        {t("availableCount", { count: availableConsoles.length })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ZSelect
          ariaLabel={t("chooseConsole")}
          value={consoleId}
          onValueChange={setConsoleId}
          placeholder={t("chooseConsole")}
          className="max-w-xs"
        >
          {availableConsoles.map((c) => (
            <SelectItem key={c.console_id} value={c.console_id}>
              {c.name}
            </SelectItem>
          ))}
        </ZSelect>
        <Button type="button" variant="chrome" disabled={busy || !consoleId} onClick={handlePick}>
          <FolderPlus size={13} aria-hidden="true" />
          {busy ? t("pointing") : t("chooseFolderButton")}
        </Button>
      </div>
      {error && <InlineError>{error}</InlineError>}
    </div>
  );
}

/**
 * Nomes de subpasta que `POST /library/folders/bulk` reconhece (2026-08-17,
 * a pedido do Douglas): antes disso só existia o caminho de tentativa e
 * erro (escolher a pasta e, se algo não bateu, `BulkFolderPicker` mostra
 * quem ficou de fora em "Subpastas não reconhecidas") — sem lugar nenhum
 * que dissesse os nomes aceitos ANTES de organizar as pastas. Espelha
 * `normalizeConsoleMatch`/`byNormalized` (internal/api/server.go,
 * handleBulkAddLibraryFolders) sem reimplementar a comparação aqui: mostra
 * os três valores que o servidor aceita — id, nome e sigla — e cabe ao
 * usuário copiar um deles. Maiúscula/minúscula, espaço e hífen não
 * importam pro servidor (ex.: "Mega Drive", "megadrive" e "MEGA-DRIVE"
 * casam igual), então isso não precisa ser explicado campo a campo, só uma
 * vez no topo do modal.
 */
function FolderNameGuideModal({ consoles, onClose }: { consoles: ConsoleInfo[]; onClose: () => void }) {
  const t = useT(dict);
  const sorted = [...consoles].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* O1 (docs/roadmap.md, Sprint O): precisa do prefixo "sm:" para vencer o
          "sm:max-w-sm" da base do DialogContent — sem ele o modal renderiza em
          384px, cortando a lista de 33 consoles em vez de usar a largura pedida. */}
      <DialogContent className="max-h-[85vh] sm:max-w-lg overflow-y-auto rounded-lg border border-line bg-fill p-5 ring-0">
        <DialogTitle className="mb-1 text-lg font-semibold text-ink">{t("acceptedFolderNames")}</DialogTitle>
        <p className="mb-4 text-sm text-muted">
          {t("folderNamesGuideText")}
        </p>
        <ul className="flex flex-col gap-2">
          {sorted.map((c) => {
            // Dedup: em vários consoles o id e a sigla coincidem (ex.: n64,
            // gba) — mostrar o mesmo valor duas vezes só confundiria.
            const names = [...new Set([c.name, c.short_name, c.console_id])];
            return (
              <li key={c.console_id} className="rounded-lg border border-line bg-fill px-3 py-2">
                <p className="text-xs text-muted">{c.name}</p>
                <p className="select-all font-mono text-sm text-ink">{names.join(" · ")}</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" autoFocus onClick={onClose}>
            {t("close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tela 04 do wireframe, redesenhada no M9 (docs/sprint-m-plano.md,
 * 2026-08-07): antes, um cartão grande por console dos 33 do catálogo,
 * paginado de 6 em 6 — quem tinha 3 consoles configurados via até a página 2
 * pra achar o terceiro. Agora são duas seções: "Consoles configurados" (uma
 * linha por console **com pasta apontada**, derivada de `GET
 * /library/folders`) e "Adicionar console" (`Select` do shadcn + escolher
 * pasta, decidido pelo Douglas em 2026-08-07 — J3 já tinha instalado o
 * componente). `BulkFolderPicker` continua sendo o único assistente
 * ("uma pasta com uma subpasta por console") — a reorganização não
 * construiu um segundo, só reposicionou o que havia ao redor dele.
 *
 * Nenhum link de obtenção de ROM em lugar nenhum desta tela: só caminho já
 * existente no disco do usuário, contagem de jogos achados, e título
 * derivado do nome do arquivo (sem scraper aqui, mesma decisão de
 * 2026-08-02).
 */
export function LibraryScreen({
  consoleCatalog,
  report,
  onBack,
  onOpenGames,
}: {
  /** `GET /consoles` — nome/sigla por console, independente de scan. É a
   * fonte de nomes desta tela; `report` só entra para o badge de
   * compatibilidade no modal de detalhe. */
  consoleCatalog: ConsoleEntry[];
  /** Ausente sem consentimento/scan — a tela continua funcionando (apontar
   * pasta, revarrer, ver jogos), só o badge de nível some do modal. */
  report?: Report;
  onBack: () => void;
  onOpenGames: (consoleId: string, name: string, shortName: string) => void;
}) {
  const t = useT(dict);
  const [folders, setFolders] = useState<LibraryFolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showNameGuide, setShowNameGuide] = useState(false);
  // Ausente = ainda não contado para aquele console (GET /library/games
  // por console não devolve total, só a lista — critério do M9 exige a
  // contagem na própria linha, então cada console configurado dispara sua
  // própria busca, em paralelo).
  const [gamesByConsole, setGamesByConsole] = useState<Record<string, LibraryGame[]>>({});
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [modalConsoleId, setModalConsoleId] = useState<string | null>(null);

  useEffect(() => {
    api
      .getLibraryFolders()
      .then((res) => setFolders(res.folders))
      .catch((err) => setError(err instanceof ApiError ? err.message : t("couldNotListFolders")));
  }, [reloadKey, t]);

  // Auto-rescan (2026-09-06): quem abre a tela de pastas está justamente
  // olhando pra contagem de jogos por console — revarrer sozinho ao entrar
  // evita a contagem ficar visivelmente desatualizada até alguém lembrar de
  // apertar "Revarrer" linha por linha (ver src/lib/autoRescan.ts).
  useEffect(() => {
    rescanAllFoldersIfStale().then(() => {
      setReloadKey((k) => k + 1);
      // Limpa a contagem já buscada — sem isto, o efeito abaixo (que só
      // busca contagem de console ainda ausente de `gamesByConsole`) não
      // repetiria a busca pra quem já estava configurado antes do rescan, e
      // um jogo novo copiado pra uma pasta existente não apareceria na
      // contagem mesmo depois de revarrer o disco de verdade.
      setGamesByConsole({});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // consoleCatalog (GET /consoles) já cobre os 33 consoles do catálogo,
  // independente de consentimento/scan — diferente de report.verdicts, que
  // só existe depois de um scan bem-sucedido.
  const allConsoles = useMemo<ConsoleInfo[]>(() => {
    const list = consoleCatalog.map((c) => ({
      console_id: c.console_id,
      name: c.name,
      short_name: c.short_name,
    }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [consoleCatalog]);

  const configuredIds = useMemo(() => {
    const ids = new Set((folders ?? []).map((f) => f.console_id));
    return Array.from(ids);
  }, [folders]);

  function fetchGamesFor(consoleId: string) {
    api
      .getLibraryGames(consoleId)
      .then((res) => setGamesByConsole((prev) => ({ ...prev, [consoleId]: res.games })))
      .catch(() => {
        // Contagem é dado auxiliar, não crítico — falha aqui não merece
        // travar a tela nem repetir o modal de erro; a linha só continua
        // mostrando "contando jogos…" indefinidamente, e "Ver jogos" segue
        // funcionando (busca a lista de novo lá).
      });
  }

  // Busca a contagem de cada console recém-configurado — não refaz a busca
  // de quem já tinha (evita um fetch por render a cada folders.length igual).
  useEffect(() => {
    for (const id of configuredIds) {
      if (!(id in gamesByConsole)) fetchGamesFor(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuredIds]);

  async function handleRescan(folderId: number, consoleId: string) {
    setRowBusy((prev) => ({ ...prev, [consoleId]: true }));
    setError(null);
    try {
      await api.rescanLibraryFolder(folderId);
      fetchGamesFor(consoleId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("couldNotScanFolder"));
    } finally {
      setRowBusy((prev) => ({ ...prev, [consoleId]: false }));
    }
  }

  async function handleRemove(folderId: number, consoleId: string) {
    setRowBusy((prev) => ({ ...prev, [consoleId]: true }));
    setError(null);
    try {
      await api.removeLibraryFolder(folderId);
      setReloadKey((k) => k + 1);
      setGamesByConsole((prev) => {
        const next = { ...prev };
        delete next[consoleId];
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("couldNotRemoveFolder"));
      setRowBusy((prev) => ({ ...prev, [consoleId]: false }));
    }
  }

  const configuredConsoles = configuredIds
    .map((id) => allConsoles.find((c) => c.console_id === id))
    .filter((c): c is ConsoleInfo => c !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  const availableConsoles = allConsoles.filter((c) => !configuredIds.includes(c.console_id));

  return (
    // N3 (docs/roadmap.md, Sprint N): era `max-w-5xl` isolado.
    <ScreenContainer variant="listing">
      {/* 2026-09-10 (achado do critico-design): esta tela montava o próprio
          `<h1>` + `BackButton` avulso à mão, e por isso ficou de fora quando
          o `ScreenHeader` passou a desenhar o título em `font-pixel` — era a
          única tela do app com um título em Inter. Mesmo conteúdo (voltar,
          título, resumo, ação de ajuda), agora pela anatomia única de
          cabeçalho. */}
      <ScreenHeader
        back={{ label: t("back"), onClick: onBack }}
        title={t("library")}
        subtitle={
          folders ? (
            <span className="font-mono text-xs tracking-wide">
              {t("screenSummary", { configured: configuredIds.length, total: allConsoles.length })}
            </span>
          ) : undefined
        }
        actions={
          <Button type="button" variant="chrome" onClick={() => setShowNameGuide(true)}>
            {t("seeFolderNamesAccepted")}
          </Button>
        }
      />

      <BulkFolderPicker onDone={() => setReloadKey((k) => k + 1)} />

      {showNameGuide && <FolderNameGuideModal consoles={allConsoles} onClose={() => setShowNameGuide(false)} />}

      {/* Falha ao listar as pastas é erro de tela inteira (nada renderiza
          sem essa lista) — vira modal, não parágrafo vermelho solto (mesmo
          achado do Douglas em GamesScreen/AllGamesScreen, 2026-08-07).
          Falha de revarrer/remover por linha continua inline, dentro da
          própria seção. */}
      {error && <ErrorModal title={t("couldNotListFolders")} message={error} onClose={() => setError(null)} />}

      {/* N11 (docs/roadmap.md, Sprint N): antes, `folders === null` não
          renderizava nada — a tela ficava em branco entre abrir e a resposta
          de GET /library/folders chegar. Skeleton na forma de linha (o
          `ConfiguredConsoleRow` real, abaixo, também é uma linha, não um
          card de grade). */}
      {folders === null && (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">{t("loadingFolders")}</span>
          {Array.from({ length: 3 }, (_, i) => (
            /* `h-24`, não `h-16` (2026-09-07): a linha real cresceu ao ganhar
               os botões de 36px na sub-linha de pasta — um skeleton mais
               baixo que o conteúdo que substitui devolve o salto de layout
               que ele existe para evitar. */
            <CardSkeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {folders && (
        <div className="flex flex-col gap-6">
          {/* N2 (docs/roadmap.md, Sprint N): era `text-sm font-semibold` — a
              única tela com essa segunda convenção de título de seção.
              2026-09-06 (critico-design + auditoria de a11y): título de seção
              vira `SectionHeading` (`text-lg` Inter), recuperando o degrau
              intermediário da hierarquia — pixel font a 11px ficava menor que
              o corpo e comunicava "título" só pelo estilo. Mesma decisão da
              N17 na sidebar, agora estendida aos `<h2>`. */}
          <div>
            {/* O número ao lado do título vem em `text-muted` dentro do
                próprio `<h2>`: faz parte do rótulo lido ("Consoles
                configurados 4"), então não deveria ser um elemento separado
                que o leitor de tela anuncia solto depois. */}
            <SectionHeading className="mb-2">
              {t("configuredConsoles")}{" "}
              {configuredConsoles.length > 0 && (
                <span className="font-mono text-xs text-muted">{configuredConsoles.length}</span>
              )}
            </SectionHeading>
            {configuredConsoles.length === 0 ? (
              // Sem botão de ação aqui — a linha "Adicionar console" (a ação
              // que resolve este vazio) fica sempre visível logo abaixo.
              <EmptyState variant="inline" title={t("noConsolesFolderYet")} />
            ) : (
              /* Uma superfície emoldurada com as linhas de console dentro,
                 `grid-cols-1` sempre (redesenho retrô 2026-09-09, achado 2 do
                 critico-layout: tabela de gerência não quer 2 colunas). Cada
                 `ConfiguredConsoleRow` traz o próprio `border-t`; a moldura
                 externa é o único contorno. */
              <div className="overflow-hidden rounded-lg border border-line">
                {configuredConsoles.map((consoleInfo) => (
                  <ConfiguredConsoleRow
                    key={consoleInfo.console_id}
                    consoleInfo={consoleInfo}
                    folders={folders.filter((f) => f.console_id === consoleInfo.console_id)}
                    games={gamesByConsole[consoleInfo.console_id]}
                    busy={rowBusy[consoleInfo.console_id] ?? false}
                    onRescan={(folderId) => handleRescan(folderId, consoleInfo.console_id)}
                    onRemove={(folderId) => handleRemove(folderId, consoleInfo.console_id)}
                    onOpenGames={() => onOpenGames(consoleInfo.console_id, consoleInfo.name, consoleInfo.short_name)}
                    onSelectConsole={() => setModalConsoleId(consoleInfo.console_id)}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionHeading className="mb-2">{t("addConsole")}</SectionHeading>
            {/* Linha de ação sem moldura, dentro de uma superfície discreta —
                não é "resultado" como as linhas de console acima. */}
            <div className="rounded-lg border border-dashed border-line">
              <AddConsoleSection availableConsoles={availableConsoles} onAdded={() => setReloadKey((k) => k + 1)} />
            </div>
          </div>
        </div>
      )}

      {modalConsoleId && (
        <ConsoleInfoModal
          verdict={report?.verdicts.find((v) => v.console_id === modalConsoleId)}
          fallbackName={allConsoles.find((c) => c.console_id === modalConsoleId)?.name ?? modalConsoleId}
          onClose={() => setModalConsoleId(null)}
        />
      )}
    </ScreenContainer>
  );
}
