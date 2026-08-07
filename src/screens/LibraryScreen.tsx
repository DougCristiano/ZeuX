import { useEffect, useMemo, useState, type FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, ApiError } from "../api";
import type { BulkMatchedFolder, LibraryFolder, LibraryGame, Report } from "../api/types";
import { Badge, Button, Callout, Card, Pagination } from "../components/ui";

type ConsoleInfo = { console_id: string; name: string; short_name: string };

const inputClass =
  "w-full rounded border border-line bg-transparent px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const PAGE_SIZE = 6;

/**
 * "Selecionar pasta para todos os jogos" (2026-08-05, a pedido do Douglas):
 * uma pasta-raiz organizada com uma subpasta por console — o ZeuX casa cada
 * subpasta pelo nome (POST /library/folders/bulk), nunca por extensão de
 * arquivo solto (essa rota foi descartada de propósito em 2026-08-02, ver o
 * docstring de LibraryScreen abaixo). Fica no topo da tela, fora dos cartões
 * por console, porque não pertence a nenhum console em particular.
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

function ConsoleLibraryCard({
  console: consoleInfo,
  folders,
  onFoldersChanged,
  onOpenGames,
}: {
  console: ConsoleInfo;
  folders: LibraryFolder[];
  onFoldersChanged: () => void;
  onOpenGames: () => void;
}) {
  const [path, setPath] = useState("");
  const [games, setGames] = useState<LibraryGame[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadGames() {
    try {
      const res = await api.getLibraryGames(consoleInfo.console_id);
      setGames(res.games);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível listar os jogos.");
    }
  }

  useEffect(() => {
    if (folders.length > 0) loadGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders.length]);

  async function handleAddFolder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!path.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.addLibraryFolder(consoleInfo.console_id, path.trim());
      setPath("");
      onFoldersChanged();
      await loadGames();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível apontar esta pasta.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePickFolder() {
    // open(null) no diálogo cancelado — não sobrescreve o que a pessoa já
    // tinha digitado à mão nesse caso.
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") setPath(picked);
  }

  async function handleRescan(folderId: number) {
    setBusy(true);
    setError(null);
    try {
      await api.rescanLibraryFolder(folderId);
      await loadGames();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível revarrer esta pasta.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveFolder(folderId: number) {
    setBusy(true);
    setError(null);
    try {
      await api.removeLibraryFolder(folderId);
      onFoldersChanged();
      setGames(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível remover esta pasta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">{consoleInfo.name}</h2>
        <Badge>{consoleInfo.short_name}</Badge>
      </div>

      {folders.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma pasta apontada para este console.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {folders.map((folder) => (
            <li key={folder.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-ink" title={folder.path}>
                {folder.path}
              </span>
              <span className="flex shrink-0 gap-2">
                <Button type="button" variant="ghost" disabled={busy} onClick={() => handleRescan(folder.id)}>
                  Revarrer
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => handleRemoveFolder(folder.id)}>
                  Remover
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* O diálogo nativo (@tauri-apps/plugin-dialog) só escolhe o caminho;
          quem aponta a pasta pro backend continua sendo handleAddFolder, sem
          mudança de formato. O campo de texto fica editável mesmo depois de
          escolher — cola ou ajuste manual continuam funcionando. O usuário
          aponta um caminho que já existe na própria máquina; nunca um link
          ou sugestão de onde conseguir arquivos. */}
      <form className="flex gap-2" onSubmit={handleAddFolder}>
        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="Caminho da pasta com os jogos deste console"
          className={inputClass}
          disabled={busy}
        />
        <Button type="button" variant="secondary" disabled={busy} onClick={handlePickFolder}>
          Escolher pasta
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          Apontar pasta
        </Button>
      </form>

      {error && <p className="text-sm text-danger">{error}</p>}

      {games && games.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-line pt-2">
          {games.slice(0, 3).map((game) => (
            <li key={game.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-ink">{game.title}</span>
              {game.missing && <Badge>ausente</Badge>}
            </li>
          ))}
        </ul>
      )}

      {/* Sempre visível, mesmo com 0 jogos (2026-08-04) — antes, sem nenhum
          jogo achado, não havia como chegar em GamesScreen, e é lá que fica
          o botão "Abrir pasta do BIOS". Configurar o BIOS não deveria
          depender de já ter um jogo baixado primeiro. */}
      <Button type="button" variant="secondary" onClick={onOpenGames}>
        Ver jogos {games ? `(${games.length})` : ""}
      </Button>
    </Card>
  );
}

/**
 * Tela 04 do wireframe: um cartão por console, cada um com seu próprio
 * "apontar pasta" — nunca um botão genérico por arquivo avulso (decisão de
 * 2026-08-02, docs/wireframe.md, evita adivinhar o console de uma extensão
 * ambígua como .bin/.iso/.zip). O `BulkFolderPicker` acima da lista (2026-08-05)
 * não contradiz isso: ele casa por NOME DE SUBPASTA, não por extensão — ainda
 * determinístico, só evita repetir "escolher pasta" 33 vezes quando as ROMs já
 * estão organizadas por console em disco. Nenhum link de obtenção de ROM em
 * lugar nenhum desta tela: só caminho já existente no disco do usuário,
 * contagem de jogos achados, e título derivado do nome do arquivo (sem
 * scraper, mesma decisão).
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
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api
      .getLibraryFolders()
      .then((res) => setFolders(res.folders))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível listar as pastas."));
  }, [reloadKey]);

  // report.verdicts já cobre os 33 consoles do catálogo (Evaluate nunca
  // filtra nenhum, mesmo "improvavel"); reordenado por nome porque aqui a
  // ordem é de índice de biblioteca, não de patamar de compatibilidade.
  const consoles = useMemo<ConsoleInfo[]>(() => {
    const list = report.verdicts.map((v) => ({
      console_id: v.console_id,
      name: v.name,
      short_name: v.short_name,
    }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [report]);

  const filteredConsoles = filter.trim()
    ? consoles.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : consoles;
  const totalPages = Math.max(1, Math.ceil(filteredConsoles.length / PAGE_SIZE));
  const pageConsoles = filteredConsoles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleFilter(value: string) {
    setFilter(value);
    setPage(1);
  }

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

      <label htmlFor="library-console-filter" className="sr-only">
        Filtrar por nome do console
      </label>
      <input
        id="library-console-filter"
        type="text"
        name="library-console-filter"
        autoComplete="off"
        value={filter}
        onChange={(e) => handleFilter(e.target.value)}
        placeholder="Filtrar por nome do console"
        className={`mb-4 ${inputClass}`}
      />

      {error && <p className="text-base text-danger">{error}</p>}

      {folders && (
        <div className="flex flex-col gap-4">
          {pageConsoles.map((consoleInfo) => (
            <ConsoleLibraryCard
              key={consoleInfo.console_id}
              console={consoleInfo}
              folders={folders.filter((f) => f.console_id === consoleInfo.console_id)}
              onFoldersChanged={() => setReloadKey((k) => k + 1)}
              onOpenGames={() => onOpenGames(consoleInfo.console_id, consoleInfo.name, consoleInfo.short_name)}
            />
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
