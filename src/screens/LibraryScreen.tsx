import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Folder, FolderPlus, RefreshCw, Trash2 } from "lucide-react";
import { api, ApiError } from "../api";
import { consoleAccentColor } from "../lib/consoleColor";
import type { BulkMatchedFolder, ConsoleEntry, LibraryFolder, LibraryGame, Report } from "../api/types";
import { rescanAllFoldersIfStale } from "../lib/autoRescan";
import {
  BackButton,
  Button,
  Callout,
  Card,
  CardSkeleton,
  CHROME_TINT_DANGER,
  CHROME_TINT_INFO,
  ConfirmModal,
  ConsoleIcon,
  ConsoleInfoModal,
  EmptyState,
  ErrorModal,
  InlineError,
  ScreenContainer,
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
            <p className="text-sm text-muted">{t("noConsolesMatched")}</p>
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
  const t = useT(dict);
  // A5 (achado do critico-design, 2026-08-18): "Remover" apagava a pasta
  // apontada sem confirmação nenhuma, com o mesmo peso visual de
  // "Revarrer" (que é reversível/barato) — a única ação destrutiva do app
  // que tinha escapado da regra do N13. `folderId`, não booleano: mais de
  // uma pasta pode existir por console (comentário do componente, acima).
  const [confirmingRemove, setConfirmingRemove] = useState<number | null>(null);
  const confirmingFolder = folders.find((f) => f.id === confirmingRemove);
  // 2026-09-07 (redesenho): a linha era 100% cinza — 33 consoles possíveis,
  // todos idênticos exceto pelo texto, e o `ConsoleIcon` era o único ponto de
  // cor. Mesma borda esquerda de 3px na cor de identidade que
  // `ConsoleVerdictCard` e `EmulatorCard` já usam (M10/N12): o olho encontra
  // "a linha do PS2" pela cor antes de ler o nome. Decorativa, nunca estado
  // (regra do consoleColor.ts, e a guideline de não codificar status só em cor).
  const accent = consoleAccentColor(consoleInfo.console_id);

  return (
    <Card
      filled
      dense
      // O halo no hover usa a cor do próprio console, via custom property —
      // uma classe Tailwind arbitrária não consegue ler um valor dinâmico,
      // então a variável entra pelo `style` e a classe a consome. Mesmo
      // vocabulário de halo do `Button variant="chrome"`, só que na cor da
      // linha em vez do roxo fixo.
      style={{ borderLeftColor: accent, borderLeftWidth: 3, "--console-accent": accent } as CSSProperties}
      className="flex flex-col gap-2 transition duration-150 hover:shadow-[0_0_20px_-10px_var(--console-accent)]"
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
      {/* 2026-09-07, segunda rodada (achado do Douglas: "centralize o ícone"
          não resolveu de verdade porque o card continuava sendo uma fita
          horizontal larga — "tem muito espaço vazio entre o nome e os
          botões de ação", "seria melhor mudar pra card vertical mais alto
          que horizontal"). Trocado de fita de linha única (icon | texto |
          botão, esticada pela largura toda do container) para bloco
          centralizado: ícone, nome e contagem empilhados, "Ver jogos" logo
          abaixo — nada de `flex-1` esticando o texto até empurrar o botão
          pra beira direita de um container que pode chegar a 2000px. A
          lista de pastas vira uma seção à parte, com borda superior,
          alinhada à esquerda (caminho de arquivo lê melhor alinhado, não
          centralizado). O grid do container-pai (`flex flex-col` →
          `grid lg:grid-cols-2`) mudou junto, mais abaixo. */}
      <div className="flex flex-col items-center gap-2 text-center">
        <ConsoleIcon consoleId={consoleInfo.console_id} label={consoleInfo.short_name} onClick={onSelectConsole} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{consoleInfo.name}</p>
          {/* A contagem é o dado que a pessoa vem conferir nesta tela — saiu
              de `text-xs text-muted` (o mesmo cinza do caminho da pasta,
              mais abaixo) para monoespaçada em ciano, a cor que a paleta
              reserva para "aqui o sistema informa" (src/index.css). Não é
              badge nem chip: é texto estático, e a guideline
              `compact-label-semantics` pede que só o que é acionável
              pareça acionável. */}
          {/* Sem `aria-live`: a contagem chega para todos os consoles
              configurados quase ao mesmo tempo (um fetch por console, em
              paralelo) — uma região viva por linha viraria uma rajada de
              anúncios. O `role="status"` do skeleton da tela já cobre
              "está carregando". */}
          <p className={`font-mono text-xs tracking-wide ${games ? "text-accent-secondary" : "text-muted"}`}>
            {games ? t("gamesCount", { count: games.length }) : t("countingGames")}
          </p>
        </div>
        {/* Sempre visível, mesmo com 0 jogos (2026-08-04) — é em GamesScreen
            que fica "Abrir pasta do BIOS"; configurar o BIOS não deveria
            depender de já ter um jogo achado primeiro (critério do M9).
            `chrome` em vez de `secondary` (2026-09-07): navegar para outra
            tela é chrome de navegação, o papel que a variante encarna. */}
        <Button type="button" variant="chrome" onClick={onOpenGames}>
          {t("seeGames")} {games ? `(${games.length})` : ""}
        </Button>
      </div>

      {/* O caminho da pasta é o dado técnico da linha: monoespaçada (é um
          caminho de arquivo, alinha ponto a ponto e lê como terminal) com
          ícone de pasta na frente, para o olho separar sub-linha de linha
          principal sem precisar do recuo sozinho. `border-line`: separa
          visualmente o bloco de identidade (centralizado, acima) da lista
          de pastas (alinhada à esquerda, abaixo) — sem isso os dois blocos
          de alinhamento diferente colidiam sem transição. */}
      <ul aria-label={t("folderPathsLabel")} className="flex flex-col gap-2 border-t border-line pt-3">
        {folders.map((folder) => (
          <li key={folder.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex min-w-0 items-center gap-2 text-muted" title={folder.path}>
              <Folder size={13} aria-hidden="true" className="shrink-0" />
              <span className="truncate font-mono text-xs">{folder.path}</span>
            </span>
            <span className="flex shrink-0 gap-2">
              {/* 2026-09-07 (achado do Douglas: "tão com a mesma cor
                  inicial... quero uma cor diferente de base, não só no
                  hover"): Revarrer e Remover eram os dois `chrome` neutro em
                  repouso, distinguíveis só pelo rótulo — o sinal de cor só
                  aparecia depois do clique/hover, tarde demais pra ajudar a
                  escanear a linha. Revarrer ganha o ciano (regra da paleta em
                  src/index.css: "ciano é aqui o sistema informa" — revarrer é
                  o sistema resincronizando, não uma decisão do usuário sobre
                  o conteúdo). O `!` é necessário, não enfeite: `chrome` já
                  define borda/fundo/sombra em repouso e no hover, o
                  `className` desta chamada só concatena (o `Button` não usa
                  tailwind-merge), e quem vence duas utilities conflitantes é
                  a ordem no CSS gerado, não a ordem na string — mesma
                  armadilha que O1/N4 já documentaram em ui.tsx. */}
              <Button
                type="button"
                variant="chrome"
                disabled={busy}
                onClick={() => onRescan(folder.id)}
                className={CHROME_TINT_INFO}
              >
                <RefreshCw size={12} aria-hidden="true" className={busy ? "animate-spin" : ""} />
                {t("rescan")}
              </Button>
              {/* Destrutivo: agora vermelho já em repouso, não só no
                  hover/foco — o A5 já tinha dado a confirmação a este botão
                  (modal), faltava o sinal ANTES do clique. A cor não é o
                  único sinal (o rótulo diz "Remover" e o modal confirma),
                  então não viola 1.4.1. */}
              <Button
                type="button"
                variant="chrome"
                disabled={busy}
                onClick={() => setConfirmingRemove(folder.id)}
                className={CHROME_TINT_DANGER}
              >
                <Trash2 size={12} aria-hidden="true" />
                {t("remove")}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
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
    return <p className="text-sm text-muted">{t("allConsolesConfigured")}</p>;
  }

  return (
    /* Borda tracejada, não sólida (2026-09-07): é o vocabulário que o app já
       reserva para "slot a preencher" (o `ghost` de ui.tsx, o `Callout`
       neutro, o `EmptyState`) — distingue de relance a área de *adicionar* das
       linhas de console já configuradas, que são conteúdo sólido. Sem
       `filled`: um painel de ação não deveria pesar tanto quanto o resultado. */
    <Card className="flex flex-col gap-3 border-dashed border-line-strong">
      <p className="flex items-center gap-2 font-mono text-xs tracking-wider text-muted uppercase">
        <FolderPlus size={13} aria-hidden="true" />
        {t("availableCount", { count: availableConsoles.length })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {/* O2 (docs/roadmap.md, Sprint O): largura fixa cortava nomes longos de
            console ("Nintendo Entertainment System") mesmo sobrando espaço ao lado —
            `max-w-xs` (via ZSelect, N4) encolhe e tem teto ao mesmo tempo. */}
        <ZSelect ariaLabel={t("chooseConsole")} value={consoleId} onValueChange={setConsoleId} placeholder={t("chooseConsole")} className="max-w-xs">
          {availableConsoles.map((c) => (
            <SelectItem key={c.console_id} value={c.console_id}>
              {c.name}
            </SelectItem>
          ))}
        </ZSelect>
        {/* `chrome`, não `primary`: "apontar/abrir pasta" é exatamente o papel
            que a variante nomeia em ui.tsx, e o único primário da tela já é o
            atalho do topo (que resolve vários consoles de uma vez). Dois
            botões roxos disputando na mesma tela contradiriam a guideline
            `primary-action` — um CTA primário por tela. */}
        <Button type="button" variant="chrome" disabled={busy || !consoleId} onClick={handlePick}>
          <FolderPlus size={13} aria-hidden="true" />
          {busy ? t("pointing") : t("chooseFolderButton")}
        </Button>
      </div>
      {error && <InlineError>{error}</InlineError>}
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
      {/* B9 (achado do critico-design, 2026-08-18): "Voltar" ficava à
          direita do h1 aqui/Emuladores/Jogos, e sozinho à esquerda acima do
          título em GameDetailScreen — duas convenções para o mesmo botão.
          Padronizado na posição de GameDetailScreen: mais legível numa app
          com sidebar (o olho lê "voltar" antes do título da tela nova).
          Rótulo corrigido em 2026-08-04: onBack volta pra Biblioteca
          (all-games), não pro Parecer/Especificações — ficou desatualizado
          desde a reestruturação da sidebar (Sprint 1). */}
      <BackButton label={t("back")} onClick={onBack} />
      {/* 2026-09-07 (redesenho): o título vinha sozinho e "Ver nomes de pasta
          aceitos" flutuava num `-mt-2 justify-end` logo abaixo do cartão do
          atalho — grudado no cartão errado (é ajuda sobre a tela inteira, não
          sobre aquele resultado) e num `quiet` que quase não se lê como
          botão. Vira a ação de cabeçalho da tela, na mesma linha do `h1`
          (padrão de `ScreenHeader`), em `chrome`.
          A linha de resumo responde "quantos dos 33 já estão apontados?" sem
          contar linha por linha. Descritiva, nunca avaliativa. */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t("library")}</h1>
          {folders && (
            <p className="mt-1 font-mono text-xs tracking-wide text-muted">
              {t("screenSummary", { configured: configuredIds.length, total: allConsoles.length })}
            </p>
          )}
        </div>
        <Button type="button" variant="chrome" onClick={() => setShowNameGuide(true)}>
          {t("seeFolderNamesAccepted")}
        </Button>
      </div>

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
              // N11 (docs/roadmap.md, Sprint N): sem botão de ação aqui — a
              // seção "Adicionar console" (a ação que resolve este vazio) já
              // fica sempre visível logo abaixo, um botão duplicado só
              // repetiria o que a tela já mostra.
              <EmptyState message={t("noConsolesFolderYet")} />
            ) : (
              /* `grid lg:grid-cols-2` (era `flex flex-col`, uma fita por
                 console com a largura toda do container — 2026-09-07,
                 achado do Douglas). O card virou vertical/centralizado
                 (`ConfiguredConsoleRow` acima); numa coluna só, ele ficaria
                 tão largo quanto a fita antiga só que mais alto — o
                 problema de espaço vazio simplesmente desceria pro card
                 novo. Duas colunas em janela larga usa a largura que sobra
                 em vez de esticar cada card sozinho; `lg`, não `xl`,
                 descontando sidebar (64px) + scrollbar da regra de
                 responsividade do CLAUDE.md. `items-start`: cards vizinhos
                 têm alturas diferentes (número de pastas varia por
                 console) — sem isso o grid esticaria todo card pra altura
                 do mais alto da fileira. */
              <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
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
            <AddConsoleSection availableConsoles={availableConsoles} onAdded={() => setReloadKey((k) => k + 1)} />
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
