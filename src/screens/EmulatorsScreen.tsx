import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { api, ApiError } from "../api";
import type {
  ConsoleVerdict,
  CustomDefinition,
  EmulatorEntry,
  EmulatorSource,
  Report,
  RetroArchCoreStatus,
} from "../api/types";
import { useT } from "../i18n/i18n";
import { dict } from "./EmulatorsScreen.i18n";
import { Cpu, FolderOpen, Gamepad2, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CHROME_TINT_DANGER,
  CHROME_TINT_INFO,
  ConfirmModal,
  ConsoleIcon,
  ConsoleInfoModal,
  ConsoleMoreBadge,
  CardSkeleton,
  EmptyState,
  ErrorModal,
  FILTER_CHIP_BASE,
  FILTER_CHIP_OFF,
  FILTER_CHIP_ON,
  FOCUS_RING,
  InlineError,
  InlineWarning,
  inputClass,
  Pagination,
  ProgressBar,
  ScreenContainer,
  ScreenHeader,
  SectionHeading,
  ZSelect,
} from "../components/ui";
import { SelectItem } from "../components/ui/select";
import { ManualEmulatorForm } from "../components/ManualEmulatorForm";
import { EmulatorConfigPanel } from "../components/EmulatorConfigPanel";
import { EmulatorBindingsPanel } from "../components/EmulatorBindingsPanel";
import { ManualInstallGuide } from "../components/ManualInstallGuide";
import { useCoreInstall } from "../hooks/useCoreInstall";
import { useEmulatorInstall } from "../hooks/useEmulatorInstall";
import { consoleAccentColor } from "../lib/consoleColor";
import { percentOf } from "../lib/format";

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

// A régua de chips (`FILTER_CHIP_*`) mora em `components/ui` desde 2026-09-09
// — as três telas que a usavam declaravam a mesma string localmente. Ver o
// doc comment lá.

/**
 * Filtro de situação (2026-09-07). A tela é de gerenciamento: as duas
 * perguntas reais são "o que já está instalado?" e "o que ainda dá pra
 * instalar?", e antes disso a única forma de responder era ler os 14 cards um
 * a um procurando a presença de um badge. `""` é "todos" — mesma convenção do
 * filtro de console ao lado.
 */
type StatusFilter = "" | "installed" | "available";

/**
 * Barra de chrome do card: altura de 28px em vez dos 36px do `chrome` padrão.
 * Um card de grade cabe 3 numa fileira (~290px de largura) e chega a ter
 * cinco destes botões; na altura cheia eles ocupariam três linhas e
 * empurrariam a ação de instalar/remover para fora do campo de visão. O piso
 * de 24px da WCAG 2.2 AA (`web-target-size`) continua respeitado com folga.
 */
const CARD_CHROME = "h-7! px-2! whitespace-nowrap";

// Achado em 2026-08-04: um core podia estar ausente por um bug silencioso
// (log de aviso, nunca erro) e nada avisava até o usuário tentar lançar um
// jogo e receber "core não encontrado" na cara — só o RetroArch carrega
// cores plugáveis, então isto só aparece na linha dele.
//
// R3 (2026-08-27): cada core faltando ganha um botão "Instalar" que dispara
// POST /retroarch/cores/{core}/install e acompanha o job por polling —
// mesmo padrão de pollJob() acima, só que por core. "cancelado" (fase nova
// do R3) volta ao estado ocioso sem erro: desistir não é falha.
//
// **Uma coluna, com altura limitada.** Esta lista mora dentro do card do
// RetroArch, que é uma célula de uma grade de 3 cards — medido com
// Playwright em 2026-08-27, o `<ul>` tem **326 px**, não a largura da tela.
// Duas tentativas erradas antes desta, as duas medidas no navegador:
//
//  1. Lista de uma coluna com o `Button` padrão (`px-4 py-2 text-base`):
//     cabia na largura, mas 25 × ~40 px empilhavam ~1000 px de parede dentro
//     do card — o mesmo custo de densidade que o M1
//     (docs/sprint-m-plano.md) já tinha diagnosticado ao tirar o botão de
//     baixo de cada tile de jogo.
//  2. Grade de 3 colunas "para ganhar densidade": 326 / 3 = 98 px por
//     item, onde o badge "faltando" (74 px) mais o botão (76 px) já não
//     cabem — o nome do core era espremido a **zero pixel** e os elementos
//     transbordavam por cima do vizinho. Densidade que some com a
//     informação principal não é densidade, é defeito.
//
// O que sobra é uma coluna (o que cabe em 326 px) com o botão compacto
// (`px-2 py-1 text-xs`, item de 34 px) e a lista rolando dentro de uma
// altura máxima. `max-h` + scroll interno é altura, não largura: nada aqui
// deixa de acompanhar a janela, só se recusa a empurrar o resto do card
// para fora da tela. O cabeçalho (resumo e "baixar os que faltam") fica
// fora do scroll, sempre visível.
function RetroArchCoresList() {
  const t = useT(dict);
  const [cores, setCores] = useState<RetroArchCoreStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Fila do "baixar os que faltam": quantos ainda restam e qual está na vez.
  // `null` quando ninguém pediu a fila — o caminho de um core por clique
  // continua independente dela.
  const [bulk, setBulk] = useState<{ remaining: number; total: number; current: string } | null>(null);
  // Ref, não estado: `downloadAllMissing` roda num laço `await` e leria um
  // estado congelado no fechamento. O clique em "Parar" precisa ser visto
  // pela iteração seguinte do laço, não pela próxima renderização.
  const bulkStopped = useRef(false);

  function loadCores() {
    api
      .getRetroArchCores()
      .then((res) => setCores(res.cores))
      .catch((err) => setError(err instanceof ApiError ? err.message : t("failedToListCores")));
  }

  // P2 (docs/roadmap.md, Sprint P): o polling, o "cancelado não é falha" e a
  // readoção de jobs em andamento saíram daqui para `useCoreInstall`, para o
  // detalhe do console poder baixar um core sozinho sem uma segunda cópia
  // dessa máquina. Comportamento idêntico ao de antes — só mudou de casa.
  // O badge "faltando" → "ok" continua sendo a confirmação de sucesso, agora
  // via `onCoreReady`.
  const { stateFor, setCoreState, installCore, cancelCore, waitForCore, adoptRunningJobs } = useCoreInstall({
    onCoreReady: loadCores,
  });

  useEffect(() => {
    loadCores();
    // "Ver cores" é um toggle: fechar desmonta este componente e perde o
    // estado de download. Readotar o que já está em andamento evita mostrar
    // "Instalar" para um core que o daemon já está baixando.
    adoptRunningJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Baixa os cores que faltam, um de cada vez. Sequencial de propósito: o
  // servidor aceitaria 25 downloads simultâneos (cada core tem seu próprio
  // job), mas isso saturaria a rede de quem está usando o app e daria uma
  // barra de progresso por core que ninguém consegue acompanhar.
  async function downloadAllMissing(names: string[]) {
    bulkStopped.current = false;
    let remaining = names.length;
    for (const name of names) {
      if (bulkStopped.current) break;
      setBulk({ remaining, total: names.length, current: name });
      setCoreState(name, { kind: "starting" });
      try {
        const job = await api.installRetroArchCore(name);
        if (job.phase !== "concluido") {
          setCoreState(name, { kind: "installing", job });
          await waitForCore(name, job.id);
        } else {
          setCoreState(name, { kind: "idle" });
        }
      } catch (err) {
        // Um core que falha não derruba a fila — o erro fica na linha dele e
        // os outros continuam. Interromper tudo por causa de um obrigaria o
        // usuário a recomeçar do zero.
        setCoreState(name, {
          kind: "error",
          message: err instanceof ApiError ? err.message : t("failedToInitiateCoreDownload"),
        });
      }
      remaining -= 1;
    }
    setBulk(null);
    loadCores();
  }


  if (error) return <InlineError>{error}</InlineError>;
  if (!cores) return <p className="text-sm text-muted">{t("loadingCores")}</p>;

  const missing = cores.filter((c) => !c.installed);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {t("coresInstalledStatus", { installed: cores.length - missing.length, total: cores.length })}
          {/* Descritivo, nunca "faltam X" com tom de cobrança: o modelo sob
              demanda (ADR 0015) baixa sozinho ao jogar, então um core ausente
              não é pendência do usuário — é o comportamento normal. */}
          {missing.length > 0 && t("missingCoresNote")}
        </p>

        {/* Baixar tudo de uma vez não é o caminho principal (o ADR 0015
            existe justamente para NÃO empurrar 25 cores em quem vai usar
            três), mas é o que serve a quem quer deixar a máquina pronta
            antes de ficar sem rede — viagem, notebook, internet ruim. Por
            isso é uma ação secundária ao lado do resumo, não um botão
            primário chamando atenção. Só aparece quando há mais de um
            faltando: para um só, o botão da linha já resolve. */}
        {missing.length > 1 && !bulk && (
          // `chrome` compacto (2026-09-07): era o único `secondary` de canto
          // arredondado dentro de um card que passou a ser todo `chrome` —
          // lia como um botão de outro app. Continua subordinado de
          // propósito (ADR 0015: o caminho normal é o core baixar sozinho ao
          // jogar), agora no acabamento do resto da tela.
          <Button
            variant="chrome"
            className={`shrink-0 ${CARD_CHROME}`}
            onClick={() => downloadAllMissing(missing.map((c) => c.name))}
          >
            {t("downloadAllMissing", { missing: missing.length })}
          </Button>
        )}

        {bulk && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Achado do critico-design (2026-09-06): existia um segundo
                `<span>` idêntico logo acima deste, sem `aria-live` — sobra de
                quando o A11y 4.1.3 (abaixo) trocou o span original por um
                anunciado, sem apagar o que ficou pra trás. Resultado real:
                "Baixando 3 de 25 · mame Baixando 3 de 25 · mame" lado a lado.
                A11y 4.1.3: progresso da fila que avança sozinho — anunciado
                por `aria-live` para quem usa leitor de tela. */}
            <span className="text-xs text-muted tabular-nums" aria-live="polite">
              {t("downloadingBulk", { current: bulk.total - bulk.remaining + 1, total: bulk.total, name: bulk.current })}
            </span>
            {/* "Parar" encerra a fila, mas não cancela o core que já está
                baixando — esse tem o "Cancelar" da própria linha. Separar os
                dois evita a ambiguidade de um botão só que faz duas coisas
                diferentes conforme o momento. */}
            <Button
              variant="quiet"
              // A11y 2.5.8: `py-1` (não `py-0.5`) + `min-h-[24px]` do Button
              // base — o `py-0.5` deixava o alvo em ~20px de altura.
              className="px-1.5 py-1 text-xs"
              onClick={() => {
                bulkStopped.current = true;
              }}
            >
              {t("stopAfterThis")}
            </Button>
          </div>
        )}
      </div>
      {/* Sem breakpoint de coluna de propósito: o que limita aqui não é a
          janela, é a célula da grade de cards em que esta lista mora (326 px
          na janela padrão). Um `sm:`/`lg:` mediria a janela inteira e
          prometeria um espaço que este card nunca tem. */}
      {/* A11y 2.5.8: `gap-1.5` entre linhas (era `pr-1` sem gap) e `py-1` na
          `<li>` (era `py-0.5`) — os botões "Instalar"/"Cancelar" de cada core
          ficavam colados verticalmente numa lista de 25, difíceis de acertar. */}
      <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1 text-sm">
        {cores.map((core) => {
          const state = stateFor(core.name);
          const percent = state.kind === "installing" || state.kind === "canceling" ? percentOf(state.job) : null;
          return (
            <li key={core.name} className="flex flex-col gap-0.5 py-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <Badge variant={core.installed ? "solid" : undefined}>{core.installed ? t("coreStatusOk") : t("coreStatusMissing")}</Badge>
                <span className="truncate text-ink" title={core.path ?? core.filename}>
                  {core.name}
                </span>
                {!core.installed && state.kind === "idle" && !bulk && (
                  // Compacto de propósito — ver o comentário do componente
                  // sobre densidade. `shrink-0`: o nome do core trunca antes
                  // do botão encolher, porque um botão cortado não clica.
                  // `ml-auto`: a mesma ação repetida em 25 linhas precisa
                  // cair sempre na mesma coluna — colada ao nome, ela ficava
                  // numa posição diferente por linha (o nome varia de
                  // "mame" a "mupen64plus-next") e o olho tinha que caçar o
                  // botão em zigue-zague.
                  // Some enquanto a fila do "baixar os que faltam" roda: dois
                  // caminhos para o mesmo core só geram o erro "já existe um
                  // download em andamento".
                  <Button
                    variant="chrome"
                    className={`ml-auto shrink-0 ${CARD_CHROME}`}
                    onClick={() => installCore(core.name)}
                  >
                    {t("coreInstall")}
                  </Button>
                )}
                {!core.installed && state.kind === "starting" && (
                  <span className="ml-auto shrink-0 text-xs text-muted">{t("coreInitiating")}</span>
                )}
              </div>

              {/* Segunda linha só enquanto o download acontece — a primeira
                  já está ocupada por badge + nome, e espremer barra,
                  percentual e "Cancelar" ao lado deles repetiria o erro que
                  a grade de 3 colunas cometeu. */}
              {!core.installed && (state.kind === "installing" || state.kind === "canceling") && (
                <div className="flex items-center gap-1.5">
                  <ProgressBar
                    className="flex-1"
                    percent={percent}
                    // 25 barras anônimas numa grade não dizem nada a quem usa
                    // leitor de tela — cada uma precisa se identificar.
                    label={`Baixando o core ${core.name}`}
                  />
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {percent === null ? state.job.phase : `${percent}%`}
                  </span>
                  <Button
                    variant="quiet"
                    // A11y 2.5.8: `py-1` + `min-h-[24px]` do Button base.
                    className="shrink-0 px-1.5 py-1 text-xs"
                    disabled={state.kind === "canceling"}
                    onClick={() => cancelCore(core.name, state.job)}
                  >
                    {state.kind === "canceling" ? t("coreCanceling") : t("coreCancelButton")}
                  </Button>
                </div>
              )}

              {!core.installed && state.kind === "error" && <InlineError>{state.message}</InlineError>}
              {state.kind === "warned" && <InlineWarning>{state.message}</InlineWarning>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Header com nome e a linha de situação — extraído do EmulatorCard monolítico
// (K6, docs/roadmap.md) para o card parar de crescer como um arquivo só.
// Puramente apresentacional, sem estado próprio.
//
// Redesenho de 2026-09-07 (modo Operate: escaneabilidade antes de
// espetáculo), três mudanças:
//
//  1. **"não instalado" ganhou rótulo.** Antes, "instalado" era um badge e
//     "não instalado" era a AUSÊNCIA dele — e ausência não é sinal: numa
//     grade de 14 cards, quem procurava o que ainda dá pra instalar tinha que
//     verificar, card a card, se faltava alguma coisa. Agora os dois estados
//     ocupam o mesmo lugar, com o mesmo formato.
//  2. **O selo é sempre o mesmo ("instalado"), e a origem virou legenda.**
//     "instalado pelo ZeuX" e "já estava na máquina" são o MESMO estado com
//     duas procedências; como dois badges de texto diferente, forçavam ler a
//     frase inteira pra concluir a mesma coisa. O ciano (Badge `solid`) é
//     estado passivo do sistema, nunca ação — regra da paleta em index.css.
//  3. **"BIOS ausente" subiu para cá** (Badge `warn`, âmbar). O aviso já
//     existia, mas só dentro do card, abaixo dos ícones de console: a
//     condição que mais impede um jogo de abrir era a menos visível da tela.
//     O `Callout` com a frase completa continua embaixo — o badge é o índice,
//     não o substituto.
//
// O ponto de identidade de 8px (2026-08-05) saiu: a borda esquerda de 3px na
// mesma `consoleAccentColor` (N12) chegou depois dele e diz a mesma coisa com
// mais força; dois sinais idênticos no mesmo card só competiam pelo olho.
function EmulatorCardHeader({ entry }: { entry: EmulatorEntry }) {
  const t = useT(dict);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base leading-tight font-semibold text-ink">{entry.name}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Badge variant={entry.installed ? "solid" : "default"}>
          {entry.installed ? t("statusInstalled") : t("statusNotInstalled")}
        </Badge>
        {entry.bios_dir_empty && <Badge variant="warn">{t("biosAbsent")}</Badge>}
        {entry.installed && (
          <span className="font-mono text-xs tracking-wide text-muted">
            {entry.installation?.managed ? t("managedByZeuX") : t("alreadyOnMachine")}
            {/* Só presente em instalação gerenciada (Sprint A) — o ZeuX não
                executa o binário de uma instalação alheia para descobrir a
                versão dela. */}
            {entry.installation?.version ? ` · ${entry.installation.version}` : ""}
          </span>
        )}
      </div>
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
 * Barra de chrome do card: tudo que ABRE alguma coisa (o próprio emulador, um
 * painel, uma pasta, a lista de cores), numa faixa só.
 *
 * Redesenho de 2026-09-07. Antes, esses controles estavam espalhados por três
 * componentes irmãos e chegavam ao card em três acabamentos diferentes na
 * mesma coluna vertical: `secondary` de 40px e canto arredondado
 * (Configurações, Mapear controles), `chrome` de 36px e canto reto (Abrir
 * pasta do BIOS), `quiet` sem borda nenhuma (Ver cores) e um `primary` roxo
 * (Abrir configurações do emulador). Cinco pesos visuais para cinco ações do
 * mesmo papel — o olho não tinha como agrupá-las, e o roxo, reservado a "aqui
 * você age sobre o conteúdo", estava gasto num botão que só abre uma janela
 * de outro programa.
 *
 * Agora é um papel, um acabamento: `chrome` compacto, ícone + rótulo. O roxo
 * volta a existir no card só onde há ação sobre conteúdo (Instalar), e num
 * emulador já instalado a única cor em repouso é o vermelho de Remover — que
 * é a verdade da tela: o que havia para instalar já está instalado.
 *
 * H2/H3/H4 (docs/roadmap.md): configuração e mapeamento persistidos só quando
 * entry.configurable/bindable vêm true — hoje só PCSX2 e RetroArch (H1
 * piloto). Emulador ainda não coberto degrada visivelmente (H5): a frase de
 * "ainda é configurado por fora" continua aparecendo, em vez de o card
 * simplesmente não ter botão nenhum.
 *
 * showConfig/showBindings/showCores/biosError são estado genuinamente local a
 * este bloco — nenhum deles precisa subir para o card.
 */
function EmulatorCardChrome({ entry }: { entry: EmulatorEntry }) {
  const t = useT(dict);
  const [showConfig, setShowConfig] = useState(false);
  const [showBindings, setShowBindings] = useState(false);
  const [showCores, setShowCores] = useState(false);
  const [biosError, setBiosError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  // Botão "Configurar" (2026-08-04): abre o emulador sozinho, sem jogo — o
  // ZeuX ainda não grava/aplica configuração nenhuma por ele (backlog
  // separado). Renomeado para "Abrir configurações do emulador" no H2, e
  // mantido mesmo nos adapters que já têm painel próprio: informar, não
  // bloquear — o ZeuX nunca vira o único caminho.
  async function openStandalone() {
    setOpening(true);
    setOpenError(null);
    try {
      await api.openEmulator(entry.adapter_id);
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : t("failedToOpenEmulator"));
    } finally {
      setOpening(false);
    }
  }

  // "Abrir pasta do BIOS" (2026-08-05): existia só dentro da tela de jogos de
  // um console (GamesScreen.tsx) — mas aí é preciso navegar Biblioteca →
  // console → jogos pra achar. GET /emulators já traz bios_dir/bios_dir_empty
  // por emulador (EmulatorEntry). Só aparece quando alguém já verificou de
  // verdade onde ESTE emulador lê o BIOS/firmware (BiosDir,
  // internal/emulator/bios_dir.go) — nunca um palpite por convenção.
  async function openBiosFolder() {
    setBiosError(null);
    try {
      await openPath(entry.bios_dir!);
    } catch (err) {
      setBiosError(t("failedToOpenBiosFolder", { error: err instanceof Error ? err.message : String(err) }));
    }
  }

  const isRetroArch = entry.adapter_id === "retroarch";
  // "Abrir pasta do BIOS" e "Ver cores" nunca dependeram de o emulador estar
  // instalado (apontar o BIOS antes de instalar é um caminho válido) — a
  // barra existe se qualquer um dos três casos existir.
  if (!entry.installed && !entry.bios_dir && !isRetroArch) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* O aviso vem ANTES da barra, não depois: a frase explica por que o
          botão "Abrir pasta do BIOS" logo abaixo é o próximo passo. Texto
          descritivo, nunca cobrança — a pasta estar vazia é um fato sobre o
          disco, não uma falha do usuário. */}
      {entry.bios_dir_empty && <Callout label={t("biosAbsent")}>{t("biosEmptyWarning")}</Callout>}

      <div className="flex flex-wrap gap-1.5">
        {entry.installed && (
          <Button
            type="button"
            variant="chrome"
            className={CARD_CHROME}
            disabled={opening}
            onClick={openStandalone}
            title={t("openEmulatorSettingsTooltip")}
          >
            <Settings2 size={12} aria-hidden="true" />
            {opening ? t("opening") : t("openEmulatorSettings")}
          </Button>
        )}
        {entry.installed && entry.configurable && (
          <Button
            type="button"
            variant="chrome"
            className={CARD_CHROME}
            aria-expanded={showConfig}
            onClick={() => setShowConfig((v) => !v)}
          >
            <SlidersHorizontal size={12} aria-hidden="true" />
            {showConfig ? t("hideConfigurations") : t("configurations")}
          </Button>
        )}
        {entry.installed && entry.bindable && (
          <Button
            type="button"
            variant="chrome"
            className={CARD_CHROME}
            aria-expanded={showBindings}
            onClick={() => setShowBindings((v) => !v)}
          >
            <Gamepad2 size={12} aria-hidden="true" />
            {showBindings ? t("hideBindings") : t("mapControls")}
          </Button>
        )}
        {entry.bios_dir && (
          <Button type="button" variant="chrome" className={CARD_CHROME} onClick={openBiosFolder}>
            <FolderOpen size={12} aria-hidden="true" />
            {t("openBiosFolder")}
          </Button>
        )}
        {isRetroArch && (
          // Ciano em repouso (regra da paleta, src/index.css: "aqui o sistema
          // informa"): a lista de cores não é uma decisão do usuário sobre o
          // conteúdo, é o ZeuX abrindo o inventário do que já baixou. Mesmo
          // papel que "Revarrer" tem na Biblioteca.
          <Button
            type="button"
            variant="chrome"
            className={`${CARD_CHROME} ${CHROME_TINT_INFO}`}
            aria-expanded={showCores}
            onClick={() => setShowCores((v) => !v)}
          >
            <Cpu size={12} aria-hidden="true" />
            {showCores ? t("hideCores") : t("seeCores")}
          </Button>
        )}
      </div>

      {biosError && <InlineError>{biosError}</InlineError>}
      {openError && <InlineError>{openError}</InlineError>}

      {entry.installed && !entry.configurable && !entry.bindable && (
        <p className="text-xs text-muted">{t("configurationAndControls", { emulatorName: entry.name })}</p>
      )}

      {showConfig && entry.installed && entry.configurable && (
        <EmulatorConfigPanel adapterId={entry.adapter_id} adapterName={entry.name} />
      )}
      {showBindings && entry.installed && entry.bindable && (
        <EmulatorBindingsPanel adapterId={entry.adapter_id} adapterName={entry.name} />
      )}
      {showCores && isRetroArch && (
        <div className="rounded-lg border border-line bg-fill p-3">
          <p className="mb-2 font-mono text-xs tracking-wide text-muted uppercase">{t("coresSectionLabel")}</p>
          <RetroArchCoresList />
        </div>
      )}
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
  const t = useT(dict);
  // P2 (docs/roadmap.md, Sprint P): a máquina de instalar/remover saiu daqui
  // para `useEmulatorInstall`, compartilhada com o detalhe do console.
  // Comportamento idêntico — só mudou de casa.
  const { state, setState, install, remove } = useEmulatorInstall({ adapterId: entry.adapter_id, onChanged });
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
      setDeleteError(err instanceof ApiError ? err.message : t("failedToDeleteEmulator"));
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  // "Abrir configurações do emulador" saiu daqui no redesenho de 2026-09-07 —
  // é chrome (abre a janela de outro programa), e mora em `EmulatorCardChrome`
  // junto das outras ações do mesmo papel. Comportamento idêntico.

  // Até o ADR 0015 (R4), o RetroArch era um caso especial aqui: vinha
  // empacotado no instalador do ZeuX (ADR 0012), e removê-lo quebraria os 24
  // consoles que dependem dele sem forma simples de reinstalar. Isso deixou
  // de valer — o RetroArch voltou a ser instalação manual, e
  // internal/install/manager.go (Uninstall) não tem mais esse guard. "Managed"
  // continua sendo a única condição real: só faz sentido remover o que o
  // ZeuX colocou na pasta gerenciada.
  const canRemove = entry.installed && entry.installation?.managed;

  // A faixa de ações tem um filete no topo — um filete sozinho, sem botão
  // nenhum embaixo, viraria uma régua decorativa no pé do card. Dois casos
  // reais chegam sem ação: o emulador que já estava na máquina (não gerenciado,
  // logo não removível) e o card enquanto a instalação corre (a barra de
  // progresso acima é o estado, não há o que clicar).
  const installBusy = state.kind === "installing" || state.kind === "done" || state.kind === "confirm-hardware";
  const hasContentAction = customDef
    ? true
    : entry.installed
      ? Boolean(canRemove)
      : // Instalação manual não tem botão nesta faixa — o trilho guiado
        // (ManualInstallGuide) traz as ações acima dela.
        source?.kind !== "manual" && !installBusy;

  return (
    <>
      {/* N13 (docs/roadmap.md, Sprint N): era painel inline tracejado — toca
          disco/rede (baixa e instala o emulador), então vira `ConfirmModal`,
          mesma regra já aplicada em AllGamesScreen/GamesScreen. "Cancelar"
          só volta ao estado normal, o card não some nem desabilita. */}
      {state.kind === "confirm-hardware" && (
        <ConfirmModal
          title={t("weakHardware")}
          message={state.message}
          onClose={() => setState({ kind: "idle" })}
          actions={
            <>
              <Button variant="secondary" onClick={() => setState({ kind: "idle" })}>
                {t("cancel")}
              </Button>
              <Button variant="primary" autoFocus onClick={() => install(true)}>
                {t("installAnyway")}
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
              <ProgressBar percent={percentOf(state.job)} />
            </div>
          )}
        </div>
      )}

      {state.kind === "error" && <InlineError>{state.message}</InlineError>}
      {state.kind === "remove-error" && <InlineError>{state.message}</InlineError>}

      {/* Fontes "manual" (RetroArch, Dolphin) não distribuem por releases que o
          ZeuX consiga resolver por API. Trilho guiado compartilhado com a tela
          de Consoles (ManualInstallGuide): passos numerados, abrir o site
          oficial, abrir a pasta de destino, "Verificar de novo". */}
      {!entry.installed && source?.kind === "manual" && (
        <ManualInstallGuide
          emulatorId={entry.adapter_id}
          emulatorName={entry.name}
          homepage={source.homepage}
          reason={source.reason}
          onVerified={onChanged}
        />
      )}

      {/* Emulador personalizado (I1) cujo caminho não foi encontrado —
          continua na lista (nunca some sozinho), com Editar/Excluir
          disponíveis para o usuário corrigir o caminho ou desistir. */}
      {customDef && !entry.installed && (
        <InlineError>O executável não foi encontrado em "{customDef.binary_path}".</InlineError>
      )}

      {deleteError && <InlineError>{deleteError}</InlineError>}

      {/* Faixa de ações sobre o CONTEÚDO, separada por um filete do resto do
          card (2026-09-07). Numa grade de até cinco colunas, cada card
          terminava com uma fileira de botões numa altura diferente, misturada
          com barra de progresso e mensagens; o filete dá à grade uma linha de
          base comum onde o olho sabe que "instalar/remover" mora. Aqui é o
          único lugar do card onde cor em repouso significa ação: roxo para
          instalar, vermelho para o que desfaz. */}
      <div
        className={`flex flex-wrap items-center gap-2 ${hasContentAction ? "border-t border-line pt-3" : ""}`}
      >
        {customDef ? (
          // Emulador personalizado (I1): nunca passa por install/uninstall
          // genérico (não tem fonte de download) — Editar/Excluir são as
          // únicas ações, disponíveis mesmo se o binário sumiu do caminho.
          <>
            {/* N15 (docs/roadmap.md, Sprint N): primária só quando este
                emulador personalizado NÃO está instalado — nesse caso,
                "Editar" (corrigir o caminho que não existe mais) é a ação
                óbvia seguinte, e é o único roxo do card. Instalado, ele desce
                para `chrome`: editar um cadastro que já funciona é
                manutenção, e um card nunca tem duas primárias. */}
            <Button
              variant={entry.installed ? "chrome" : "primary"}
              onClick={() => onEditCustom(customDef)}
            >
              {t("edit")}
            </Button>
            {confirmingDelete ? (
              // N13 (docs/roadmap.md, Sprint N): irreversível (apaga o
              // cadastro personalizado) — era painel inline, virou modal.
              <ConfirmModal
                title={t("deleteCustomEmulator")}
                message={t("deleteCustomEmulatorMessage", { name: customDef.name })}
                onClose={() => setConfirmingDelete(false)}
                actions={
                  <>
                    <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
                      {t("cancel")}
                    </Button>
                    <Button variant="danger" autoFocus disabled={deleting} onClick={deleteCustom}>
                      {t("deleteAnyway")}
                    </Button>
                  </>
                }
              />
            ) : (
              // Vermelho já em repouso, não só no hover (mesma decisão de
              // "Remover" na Biblioteca, 2026-09-07): o sinal do destrutivo
              // precisa chegar ANTES do clique. A cor não é o único sinal — o
              // rótulo diz "Excluir" e o ConfirmModal acima confirma —, então
              // não viola 1.4.1.
              <Button
                type="button"
                variant="chrome"
                className={CHROME_TINT_DANGER}
                disabled={deleting}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 size={12} aria-hidden="true" />
                {t("deleteButton")}
              </Button>
            )}
          </>
        ) : entry.installed ? (
          canRemove &&
          (state.kind === "confirm-remove" ? (
            // N13 (docs/roadmap.md, Sprint N): irreversível (desinstala,
            // toca disco) — era painel inline, virou modal.
            <ConfirmModal
              title={t("removeEmulator")}
              message={t("removeEmulatorMessage", { emulatorName: entry.name })}
              onClose={() => setState({ kind: "idle" })}
              actions={
                <>
                  <Button variant="secondary" onClick={() => setState({ kind: "idle" })}>
                    {t("cancel")}
                  </Button>
                  <Button variant="danger" autoFocus onClick={remove}>
                    {t("removeAnyway")}
                  </Button>
                </>
              }
            />
          ) : (
            // Ver o comentário de "Excluir" acima: destrutivo é vermelho em
            // repouso. `chrome` e não `danger` (preenchido) de propósito —
            // `danger` cheio é o peso do "Remover mesmo assim" do modal, o
            // clique que de fato desinstala; este aqui só abre a pergunta.
            <Button
              type="button"
              variant="chrome"
              className={CHROME_TINT_DANGER}
              disabled={state.kind === "removing"}
              onClick={() => setState({ kind: "confirm-remove" })}
            >
              <Trash2 size={12} aria-hidden="true" />
              {state.kind === "remove-error" ? t("retryRemove") : t("remove")}
            </Button>
          ))
        ) : source?.kind === "manual" ? (
          // ManualInstallGuide (acima) já traz "abrir o site oficial" como
          // passo 1 — repetir o botão aqui seria a mesma ação duas vezes.
          null
        ) : state.kind === "installing" || state.kind === "done" || state.kind === "confirm-hardware" ? null : (
          <Button variant="primary" disabled={state.kind === "starting"} onClick={() => install(false)}>
            {state.kind === "error" ? t("retryInstall") : t("install")}
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
  // Só um console = a cor dele vira a identidade do card inteiro (12 dos 13
  // adapters embutidos além do RetroArch atendem exatamente 1). Mais de um
  // (RetroArch) não tem uma identidade só — fica neutro; decorar 20+ consoles
  // com uma cor escolhida ao acaso seria uma mentira visual.
  //
  // 2026-09-07: o card multi-console ficava SEM borda esquerda nenhuma, e a
  // grade tinha duas silhuetas diferentes (uma com filete de 3px, outra sem) —
  // o que lia como "este card é de outro tipo", não como "este não tem uma cor
  // só". Agora todo card tem o mesmo filete; o que varia é a cor dele.
  const identityColor = entry.consoles.length === 1 ? consoleAccentColor(entry.consoles[0]) : undefined;
  const cardStyle: CSSProperties = {
    borderLeftColor: identityColor ?? "var(--line-strong)",
    borderLeftWidth: 3,
  };

  return (
    <Card className="flex flex-col gap-3" style={cardStyle}>
      <EmulatorCardHeader entry={entry} />
      <EmulatorCardConsoles entry={entry} verdictById={verdictById} onSelectConsole={onSelectConsole} />
      <EmulatorCardChrome entry={entry} />

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
  const t = useT(dict);
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [modalConsoleId, setModalConsoleId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const verdictById = useMemo(() => new Map(report?.verdicts.map((v) => [v.console_id, v]) ?? []), [report]);
  const customById = useMemo(() => new Map(customs.map((c) => [c.id, c])), [customs]);

  useEffect(() => {
    api
      .getEmulators()
      .then((res) => setEmulators(res.emulators))
      .catch((err) => setError(err instanceof ApiError ? err.message : t("failedToListEmulators")));
  }, [reloadKey, t]);

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
    if (statusFilter === "installed" && !e.installed) return false;
    if (statusFilter === "available" && e.installed) return false;
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

  function handleStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  // Contagens do resumo e dos chips: sempre sobre a lista INTEIRA, nunca sobre
  // o resultado filtrado — um chip que muda de número conforme o próprio chip
  // ativo não é um índice do catálogo, é um espelho da última escolha.
  const installedCount = (emulators ?? []).filter((e) => e.installed).length;
  const statusItems: { id: StatusFilter; label: string; count: number }[] = [
    { id: "", label: t("statusFilterAll"), count: emulators?.length ?? 0 },
    { id: "installed", label: t("statusFilterInstalled"), count: installedCount },
    { id: "available", label: t("statusFilterAvailable"), count: (emulators?.length ?? 0) - installedCount },
  ];

  return (
    // N3 (docs/roadmap.md, Sprint N): teto centralizado em `ScreenContainer`
    // (src/components/ui.tsx) — mesmo teto escalonado que o O5 validou.
    <ScreenContainer variant="listing">
      {/* B9 (achado do critico-design, 2026-08-18): mesma posição que
          GameDetailScreen — "Voltar" sozinho, à esquerda, acima do título
          (era ao lado do h1, à direita). */}
      <ScreenHeader back={onBack ? { label: t("back"), onClick: onBack } : undefined} title={t("emulatorsTitle")} />

      {/* Resumo do catálogo (2026-09-07). A tela é de gerenciamento e a
          primeira pergunta de quem chega é "quanto disso já está pronto?" —
          antes, a resposta exigia contar cards. Ciano porque é o sistema
          informando um fato sobre a máquina, não uma ação (regra da paleta,
          src/index.css). Sem `aria-live`: o número chega junto com a lista, no
          mesmo render — quem carrega é o `role="status"` do skeleton abaixo. */}
      {emulators && emulators.length > 0 && (
        <p className="mb-4 font-mono text-xs tracking-wide text-accent-secondary">
          {t("emulatorCountLabel", { count: emulators.length })} ·{" "}
          {t("installedSummary", { installed: installedCount, total: emulators.length })}
        </p>
      )}

      {/* B2b (docs/pendencias.md): a porta de cadastro manual sai do rodapé e
          vira uma afordância visível sem rolar. O backend já aceita emulador
          de console fora do catálogo (internal/emulator/custom.go) — só
          faltava dizer isso em algum lugar. O mesmo bloco hospeda o formulário
          (novo ou em edição, vindo do card de um custom). */}
      <div className="mb-5 rounded-lg border border-dashed border-line-strong bg-fill/40 p-4">
        {formMode === "closed" ? (
          <>
            <p className="font-mono text-xs tracking-[0.2em] text-accent-secondary uppercase">
              {t("manualEntryKicker")}
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">{t("manualEntryTitle")}</p>
            <p className="mt-1 max-w-2xl text-sm text-muted">{t("manualEntryBody")}</p>
            <Button
              type="button"
              variant="chrome"
              className="mt-3 w-fit"
              {...{ "data-gamepad-start": "" }}
              onClick={() => setFormMode("new")}
            >
              {t("addEmulatorManuallyButton")}
            </Button>
          </>
        ) : (
          <>
            <SectionHeading className="mb-2">{t("addEmulatorSectionTitle")}</SectionHeading>
            <ManualEmulatorForm
              existing={formMode === "new" ? undefined : formMode}
              existingIds={customs
                .map((c) => c.id)
                .filter((id) => formMode === "new" || id !== (formMode as CustomDefinition).id)}
              placeholders={placeholders}
              onSaved={() => {
                setFormMode("closed");
                setReloadKey((k) => k + 1);
              }}
              onCancel={() => setFormMode("closed")}
            />
          </>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {emulators && emulators.length > PAGE_SIZE && (
          <>
            <label htmlFor="emulators-search" className="sr-only">
              {t("searchEmulatorLabel")}
            </label>
            <input
              id="emulators-search"
              type="text"
              name="emulators-search"
              autoComplete="off"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={t("searchEmulatorPlaceholder")}
              className={`${inputClass} max-w-xs`}
            />
          </>
        )}

        {consoleOptions.length > 0 && (
          <ZSelect
            ariaLabel={t("filterByConsoleLabel")}
            value={consoleFilter || ALL_CONSOLES}
            onValueChange={(v) => handleConsoleFilter(v === ALL_CONSOLES ? "" : v)}
            className="max-w-xs"
          >
            <SelectItem value={ALL_CONSOLES}>{t("allConsoles")}</SelectItem>
            {consoleOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </ZSelect>
        )}

        {/* Filtro de situação (2026-09-07). Mesmos chips de 36px de
            `ConsolesScreen`, na mesma régua do input e do select — a tela
            tinha dois controles de filtro e nenhum atendia à pergunta que mais
            se faz aqui ("o que ainda posso instalar?").
            A11y 4.1.2: `aria-pressed` expõe o estado ativo, que o
            `border-accent` só comunica a quem vê. */}
        {emulators && emulators.length > 0 && (
          <div role="group" aria-label={t("filterByStatusLabel")} className="flex flex-wrap gap-2">
            {statusItems.map((item) => (
              <button
                key={item.id || "all"}
                type="button"
                onClick={() => handleStatusFilter(item.id)}
                aria-pressed={statusFilter === item.id}
                className={`${FILTER_CHIP_BASE} ${FOCUS_RING} ${
                  statusFilter === item.id ? FILTER_CHIP_ON : FILTER_CHIP_OFF
                }`}
              >
                {item.label.toUpperCase()}
                {/* Contagem em coluna própria, tabular: colada ao rótulo em
                    caixa alta, o número lia como parte do nome do filtro. */}
                <span className="tabular-nums opacity-70">{item.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Falha ao listar os emuladores é erro de tela inteira (nada renderiza
          sem essa lista) — vira modal, não parágrafo vermelho solto no topo
          (mesmo achado do Douglas em GamesScreen/AllGamesScreen,
          2026-08-07). Os erros por card (instalar/remover/abrir pasta de
          BIOS, em EmulatorCardActions/EmulatorCardChrome acima) continuam
          inline, de propósito: aparecem dentro do próprio card cuja ação
          falhou, ao lado do botão que a disparou — diferente do erro que
          motivou a troca, que ficava longe da célula que o causou. */}
      {error && <ErrorModal title={t("failedToListEmulators")} message={error} onClose={() => setError(null)} />}

      {/* N11 (docs/roadmap.md, Sprint N): antes, `emulators === null` só
          deixava o cabeçalho visível, nada de grade nem sinal de
          carregamento. Skeleton na mesma grade dos cards reais (linha
          abaixo). */}
      {emulators === null && (
        <div role="status" aria-live="polite">
          <span className="sr-only">{t("loadingEmulators")}</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[2400px]:grid-cols-5">
            {Array.from({ length: PAGE_SIZE }, (_, i) => (
              <CardSkeleton key={i} className="h-40" />
            ))}
          </div>
        </div>
      )}

      {/* Com o filtro de situação (2026-09-07), a lista pode esvaziar sem
          nenhum termo digitado — a frase antiga saía como `Nenhum emulador
          encontrado para ""`, culpando uma busca que não existia. */}
      {emulators && filtered.length === 0 && (
        <EmptyState
          title={t("noEmulatorsTitle")}
          message={search.trim() ? t("noEmulatorsFound", { search }) : t("noEmulatorsForFilters")}
        />
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
              ganhar mais uma coluna.

              `items-start` (achado testando com o Douglas, 2026-09-06): sem
              isso, o Grid CSS estica cada card pra altura da fileira mais
              alta (comportamento padrão do `align-items: stretch`) — o
              RetroArch (configurações + mapeamento + "ver cores") define uma
              fileira alta, e DuckStation/PCSX2 (só um botão "Instalar")
              esticavam junto, com a borda acompanhando mas o conteúdo colado
              no topo — metade do card vazia por dentro. Com `items-start`,
              cada card fica só do tamanho do próprio conteúdo. */}
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[2400px]:grid-cols-5">
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

      {modalConsoleId && (
        <ConsoleInfoModal
          verdict={verdictById.get(modalConsoleId)}
          fallbackName={modalConsoleId}
          onClose={() => setModalConsoleId(null)}
        />
      )}
    </ScreenContainer>
  );
}
