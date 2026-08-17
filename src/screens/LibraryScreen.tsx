import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, ApiError } from "../api";
import type { BulkMatchedFolder, LibraryFolder, LibraryGame, Report } from "../api/types";
import { Button, Callout, Card, ConsoleIcon, ConsoleInfoModal, ErrorModal } from "../components/ui";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

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
      setError(err instanceof ApiError ? err.message : "Não foi possível varrer esta pasta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card filled className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">Selecionar pasta para todos os jogos</p>
          <p className="text-sm text-muted">
            Escolha uma pasta com uma subpasta por console (ex.: "PS1", "SNES") — o ZeuX aponta cada uma para o
            console certo de uma vez.
          </p>
        </div>
        <Button type="button" variant="primary" disabled={busy} onClick={handlePick}>
          {busy ? "Varrendo…" : "Escolher pasta"}
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {result && (
        <div className="flex flex-col gap-2">
          {result.matched.length > 0 ? (
            <p className="text-sm text-ink">
              {result.matched.length} console(s) reconhecido(s):{" "}
              {result.matched.map((m) => `${m.name} (${m.games_found})`).join(", ")}.
            </p>
          ) : (
            <p className="text-sm text-muted">Nenhuma subpasta bateu com um console do catálogo.</p>
          )}

          {result.unmatched.length > 0 && (
            <Callout label="Subpastas não reconhecidas">
              {result.unmatched.join(", ")} — nomeie a subpasta com o nome ou a sigla do console (ex. "PS1",
              "Mega Drive") e escolha a pasta de novo.
            </Callout>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * M9 (docs/sprint-m-plano.md, 2026-08-07): substitui o cartão grande por
 * console — uma linha por console **que já tem pasta apontada**. `games`
 * ausente (`undefined`) enquanto a contagem carrega; nunca um palpite de
 * quantidade. Um console pode ter mais de uma pasta apontada (a API sempre
 * permitiu); a lista de caminhos fica como sub-linha discreta abaixo da
 * linha principal, não um cartão por pasta — mantém a densidade que o
 * critério pede mesmo quando alguém aponta 2-3 pastas pro mesmo console.
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
  return (
    <div className="flex flex-col gap-1.5 rounded border border-line bg-fill p-3">
      <div className="flex items-center gap-3">
        <ConsoleIcon consoleId={consoleInfo.console_id} label={consoleInfo.short_name} onClick={onSelectConsole} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{consoleInfo.name}</p>
          <p className="text-xs text-muted">{games ? `${games.length} jogo(s)` : "contando jogos…"}</p>
        </div>
        {/* Sempre visível, mesmo com 0 jogos (2026-08-04) — é em GamesScreen
            que fica "Abrir pasta do BIOS"; configurar o BIOS não deveria
            depender de já ter um jogo achado primeiro (critério do M9). */}
        <Button type="button" variant="secondary" onClick={onOpenGames}>
          Ver jogos {games ? `(${games.length})` : ""}
        </Button>
      </div>

      <ul className="flex flex-col gap-1 pl-12">
        {folders.map((folder) => (
          <li key={folder.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-muted" title={folder.path}>
              {folder.path}
            </span>
            <span className="flex shrink-0 gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => onRescan(folder.id)}>
                Revarrer
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => onRemove(folder.id)}>
                Remover
              </Button>
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
      setError(err instanceof ApiError ? err.message : "Não foi possível apontar esta pasta.");
    } finally {
      setBusy(false);
    }
  }

  if (availableConsoles.length === 0) {
    return <p className="text-sm text-muted">Todos os consoles do catálogo já têm pasta apontada.</p>;
  }

  return (
    <Card filled className="flex flex-col gap-3">
      <p className="font-semibold text-ink">Adicionar console</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={consoleId} onValueChange={setConsoleId}>
          {/* O2 (docs/roadmap.md, Sprint O): largura fixa cortava nomes longos de
              console ("Nintendo Entertainment System") mesmo sobrando espaço ao lado —
              mesmo padrão de EmulatorsScreen.tsx (w-full max-w-xs) para encolher e ter
              teto ao mesmo tempo. */}
          <SelectTrigger aria-label="Escolher console" className="w-full max-w-xs">
            <SelectValue placeholder="Escolher console" />
          </SelectTrigger>
          <SelectContent>
            {availableConsoles.map((c) => (
              <SelectItem key={c.console_id} value={c.console_id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="primary" disabled={busy || !consoleId} onClick={handlePick}>
          {busy ? "Apontando…" : "Escolher pasta"}
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </Card>
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
function FolderNameGuideModal({ report, onClose }: { report: Report; onClose: () => void }) {
  const consoles = [...report.verdicts].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* O1 (docs/roadmap.md, Sprint O): precisa do prefixo "sm:" para vencer o
          "sm:max-w-sm" da base do DialogContent — sem ele o modal renderiza em
          384px, cortando a lista de 33 consoles em vez de usar a largura pedida. */}
      <DialogContent className="max-h-[85vh] sm:max-w-lg overflow-y-auto rounded border border-line bg-fill p-5 ring-0">
        <DialogTitle className="mb-1 text-lg font-semibold text-ink">Nomes de pasta aceitos</DialogTitle>
        <p className="mb-4 text-sm text-muted">
          Em "Selecionar pasta para todos os jogos", cada subpasta é reconhecida pelo nome — copie um dos valores
          abaixo (id, nome completo ou sigla) para nomear a subpasta daquele console. Maiúscula/minúscula, espaço e
          hífen não importam.
        </p>
        <ul className="flex flex-col gap-2">
          {consoles.map((c) => {
            // Dedup: em vários consoles o id e a sigla coincidem (ex.: n64,
            // gba) — mostrar o mesmo valor duas vezes só confundiria.
            const names = [...new Set([c.name, c.short_name, c.console_id])];
            return (
              <li key={c.console_id} className="rounded border border-line bg-fill px-3 py-2">
                <p className="text-xs text-muted">{c.name}</p>
                <p className="select-all font-mono text-sm text-ink">{names.join(" · ")}</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" autoFocus onClick={onClose}>
            Fechar
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
  report,
  onBack,
  onOpenGames,
}: {
  report: Report;
  onBack: () => void;
  onOpenGames: (consoleId: string, name: string, shortName: string) => void;
}) {
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
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível listar as pastas."));
  }, [reloadKey]);

  // report.verdicts já cobre os 33 consoles do catálogo (Evaluate nunca
  // filtra nenhum, mesmo "improvavel").
  const allConsoles = useMemo<ConsoleInfo[]>(() => {
    const list = report.verdicts.map((v) => ({
      console_id: v.console_id,
      name: v.name,
      short_name: v.short_name,
    }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [report]);

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
      setError(err instanceof ApiError ? err.message : "Não foi possível revarrer esta pasta.");
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
      setError(err instanceof ApiError ? err.message : "Não foi possível remover esta pasta.");
      setRowBusy((prev) => ({ ...prev, [consoleId]: false }));
    }
  }

  const configuredConsoles = configuredIds
    .map((id) => allConsoles.find((c) => c.console_id === id))
    .filter((c): c is ConsoleInfo => c !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  const availableConsoles = allConsoles.filter((c) => !configuredIds.includes(c.console_id));

  return (
    <div className="mx-auto max-w-5xl px-6 pt-16 pb-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Biblioteca</h1>
        {/* Rótulo corrigido em 2026-08-04: onBack volta pra Biblioteca
            (all-games), não pro Parecer/Especificações — ficou desatualizado
            desde a reestruturação da sidebar (Sprint 1). */}
        <Button variant="secondary" onClick={onBack}>
          Voltar
        </Button>
      </div>

      <BulkFolderPicker onDone={() => setReloadKey((k) => k + 1)} />

      <div className="mb-4 -mt-2 flex justify-end">
        <Button type="button" variant="ghost" onClick={() => setShowNameGuide(true)}>
          Ver nomes de pasta aceitos
        </Button>
      </div>
      {showNameGuide && <FolderNameGuideModal report={report} onClose={() => setShowNameGuide(false)} />}

      {/* Falha ao listar as pastas é erro de tela inteira (nada renderiza
          sem essa lista) — vira modal, não parágrafo vermelho solto (mesmo
          achado do Douglas em GamesScreen/AllGamesScreen, 2026-08-07).
          Falha de revarrer/remover por linha continua inline, dentro da
          própria seção. */}
      {error && <ErrorModal title="Não foi possível listar as pastas" message={error} onClose={() => setError(null)} />}

      {folders && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">Consoles configurados</h2>
            {configuredConsoles.length === 0 ? (
              <p className="text-sm text-muted">Nenhum console com pasta apontada ainda.</p>
            ) : (
              <div className="flex flex-col gap-2">
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
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">Adicionar console</h2>
            <AddConsoleSection availableConsoles={availableConsoles} onAdded={() => setReloadKey((k) => k + 1)} />
          </div>
        </div>
      )}

      {modalConsoleId && (
        <ConsoleInfoModal
          verdict={report.verdicts.find((v) => v.console_id === modalConsoleId)}
          fallbackName={modalConsoleId}
          onClose={() => setModalConsoleId(null)}
        />
      )}
    </div>
  );
}
