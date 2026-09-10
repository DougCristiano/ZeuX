import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { api, ApiError, setAppVersionCacheKey, type Report } from "./api";
import { Sidebar, type NavID } from "./components/Sidebar";
import { SplashScreen, hasSeenSplash } from "./components/SplashScreen";
import { TourOverlay, hasSeenTour } from "./components/TourOverlay";
import { GamepadHints } from "./components/GamepadHints";
import { AmbientGlow, Toast } from "./components/ui";
import { useGamepad } from "./hooks/useGamepad";
import { useGamepadNavigation } from "./hooks/useGamepadNavigation";
import { useToast } from "./hooks/useToast";
import { useT } from "./i18n/i18n";
import type { ConsoleEntry, LibraryGame } from "./api/types";
import { dict } from "./App.i18n";
import {
  AllGamesScreen,
  loadInitialAllGamesView,
  persistAllGamesView,
  type AllGamesViewState,
} from "./screens/AllGamesScreen";
import { ConsentScreen } from "./screens/ConsentScreen";
import { ConfigureControllerScreen } from "./screens/ConfigureControllerScreen";
import { ConsoleDetailScreen } from "./screens/ConsoleDetailScreen";
import { ConsolesScreen } from "./screens/ConsolesScreen";
import { ControllerTestScreen } from "./screens/ControllerTestScreen";
import { DeclinedScreen } from "./screens/DeclinedScreen";
import { EmulatorsScreen } from "./screens/EmulatorsScreen";
import { GameDetailScreen } from "./screens/GameDetailScreen";
import { GamesScreen } from "./screens/GamesScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ErrorScreen, LoadingScreen } from "./screens/StatusScreen";
import { VerdictScreen } from "./screens/VerdictScreen";

// Item B8 (docs/sprint-b-plano.md): a jornada real de consentimento → scan →
// parecer. A regra central é a do consentimento verificado no servidor — esta
// tela não decide nada sozinha, só mostra o que GET /consent diz. Nenhum
// estado é guardado entre aberturas do app: cada abertura confia de novo na
// resposta do servidor, que já embute a checagem de PolicyVersion
// (ConsentStatus.granted é Record.IsValid(), não Record.Granted).
type Phase =
  | "checking-port"
  | "port-conflict"
  | "connecting"
  | "daemon-unreachable"
  | "consent"
  | "declined"
  | "scanning"
  | "scan-error"
  // "home" é a tela inicial desde 2026-09-10 (A1, docs/pendencias.md — pedido
  // do Douglas: "quero mais destaque pro console" + "faltam motivos pra usar
  // num PC zerado"). Sempre a entrada, com ou sem histórico — sem nenhum jogo
  // jogado e nenhuma pasta configurada, ela vira o onboarding (HomeScreen
  // decide isso sozinha). "Todos os jogos" continua existindo, alcançado a
  // partir daqui ("Ver todos os jogos"), não mais o destino direto da
  // sidebar.
  | "home"
  // O parecer de compatibilidade continua existindo, alcançável a partir da
  // home.
  | "all-games"
  | "verdict"
  | "consoles"
  | "console-detail"
  | "emulators"
  | "library"
  | "games"
  | "game-detail"
  | "history"
  | "settings"
  | "controller-test"
  | "configure-controller";

function App() {
  // Navegação por controle (Sprint L): D-pad/analógico
  // move o foco pro vizinho mais próximo NA DIREÇÃO PRESSIONADA — busca
  // espacial por posição de tela (findNextFocus, useGamepadNavigation.ts),
  // não ordem do DOM/Tab. Correção de comentário (2026-09-06): a versão
  // anterior ("D-pad ≈ Tab") descrevia mal a própria implementação e já
  // levou uma revisão externa a diagnosticar errado que descer uma linha
  // custaria `columns` pressões — o ADR 0014 é explícito de que o objetivo
  // era justamente evitar isso ("grids 2D não navegam bem com um
  // próximo/anterior linear"). A ressalva real do ADR continua de pé: é
  // heurística, nunca testada com controle físico (nenhuma sessão de IA tem
  // hardware para isso). Botão A ≈ clique, B ≈ Esc. Um lugar só, não por
  // tela — o hook opera sobre document.activeElement, não precisa saber a
  // phase atual.
  // `connected` alimenta o rodapé de prompts (`GamepadHints`), que só aparece
  // com um controle plugado — sem controle, nada é renderizado e o layout não
  // reserva espaço (pendência "Rodapé de prompts do controle").
  const { connected: gamepadNavConnected } = useGamepadNavigation();

  const t = useT(dict);

  // Toast de conectado/desconectado (pedido do Douglas, 2026-09-07,
  // referência: o toggle da Steam quando um controle é plugado). `useGamepad`
  // já existia (Q4) e só reage a `gamepadconnected`/`gamepaddisconnected` —
  // aqui só falta comparar com o estado anterior pra saber qual toast mostrar.
  // Um lugar só, no shell do app, não por tela — igual `useGamepadNavigation`
  // acima: o controle pode ser plugado em qualquer fase, não só dentro do
  // app pós-onboarding.
  const gamepad = useGamepad();
  const { toastMessage: gamepadToast, showToast: showGamepadToast } = useToast();
  const wasGamepadConnected = useRef(false);
  useEffect(() => {
    if (gamepad.connected && !wasGamepadConnected.current) {
      showGamepadToast(t("gamepadConnected", { name: gamepad.name ?? "" }));
    } else if (!gamepad.connected && wasGamepadConnected.current) {
      showGamepadToast(t("gamepadDisconnected"));
    }
    wasGamepadConnected.current = gamepad.connected;
    // Um controle já plugado antes de abrir o ZeuX também dispara o toast de
    // "conectado" no primeiro render (wasGamepadConnected começa false) — de
    // propósito: é a mesma informação que a Steam mostra ao abrir com o
    // controle já ligado, não um bug de disparo duplicado.
  }, [gamepad.connected, gamepad.name, showGamepadToast, t]);

  const [phase, setPhase] = useState<Phase>("checking-port");

  // Abertura com a logo (pedido do Douglas, 2026-09-07) — ver
  // src/components/SplashScreen.tsx para a decisão de "só na primeira vez".
  //
  // **Não é uma `Phase`, de propósito.** Uma fase nova entraria no `switch`
  // abaixo e pararia a máquina: as fases existentes encadeiam trabalho real
  // (checar a porta → conectar no zeuxd → consentimento → scan), e enfileirar
  // a abertura antes delas somaria 2,3s ao tempo até o app estar utilizável.
  // Como estado à parte, a abertura só *cobre* a tela enquanto a máquina roda
  // por baixo — quando ela sai, o app já está onde estaria sem ela.
  const [splashVisible, setSplashVisible] = useState(() => !hasSeenSplash());

  // Tour de primeira execução (O1, docs/pendencias.md). Sobreposição, não uma
  // `Phase` — mesma razão do splash (ver src/components/TourOverlay.tsx). O
  // tour aparece **depois do scan**, na primeira tela do app: antes do
  // consentimento, quatro telas vendendo o produto virariam pressão para
  // consentir. Quem recusou também vê, a partir de `DeclinedScreen` — é quem
  // tem menos contexto sobre o que o app faz.
  const [tourVisible, setTourVisible] = useState(false);
  useEffect(() => {
    if ((phase === "home" || phase === "declined") && !hasSeenTour()) {
      setTourVisible(true);
    }
  }, [phase]);
  function closeTour() {
    setTourVisible(false);
    // A11y 2.4.3: a sobreposição some por baixo de quem usa leitor de tela;
    // devolve o foco para o `<main>` do shell quando ele existe (as fases de
    // onboarding não o montam — daí o `?.`).
    requestAnimationFrame(() => mainRef.current?.focus());
  }

  // A11y 2.4.2 (auditoria de acessibilidade, 2026-09-06): `index.html` traz um
  // `<title>ZeuX</title>` estático que nunca muda de fase. Numa janela desktop
  // o título aparece na barra da janela e no Alt+Tab — quem usa leitor de tela
  // para se orientar recebia sempre "ZeuX". Este efeito reflete a fase atual.
  useEffect(() => {
    document.title = PHASE_TITLES[phase] ? `ZeuX — ${PHASE_TITLES[phase]}` : "ZeuX";
  }, [phase]);
  const [policy, setPolicy] = useState<{ text: string; version: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  // GET /consoles (2026-09-08): catálogo de nome/sigla/ano por console,
  // independente de consentimento/scan — diferente de `report.verdicts`,
  // que só existe depois de um scan bem-sucedido. Carregado uma vez, cedo,
  // para que quem recusou consentimento (ou ainda não passou pelo scan)
  // tenha nome de console de verdade na Biblioteca, não `console_id` cru.
  const [consoles, setConsoles] = useState<ConsoleEntry[]>([]);
  useEffect(() => {
    api
      .getConsoles()
      .then((res) => setConsoles(res.consoles))
      .catch(() => {
        // Falha aqui não é crítica: as telas caem de volta em console_id
        // cru como último recurso, e o parecer (quando existe) continua
        // sendo a fonte preferida de nome mesmo com este catálogo vazio.
      });
  }, []);
  // Achado real, 2026-09-08 (relato do Douglas: a logo do N64 continuava
  // com a marca antiga da iQue mesmo depois de fechar e reabrir o app,
  // já com o servidor comprovadamente servindo os bytes corrigidos) — ver
  // o comentário completo em `src/api/client.ts`, `setAppVersionCacheKey`.
  // Buscado o mais cedo possível (antes de qualquer tela pintar um
  // `<img>` de console) para que a primeira renderização já saia com a
  // URL certa, nunca dependendo de um reload manual depois.
  useEffect(() => {
    getVersion()
      .then(setAppVersionCacheKey)
      .catch(() => {
        // Sem versão, as imagens de console caem para o comportamento de
        // antes (sem `av=`) — nunca pior do que já era, só sem a proteção
        // extra contra cache entre versões.
      });
  }, []);
  // Emuladores (B10) não depende de consentimento — pode ser alcançado tanto
  // do parecer quanto da tela de recusa (docs/sprint-b-plano.md, B8: "recusar
  // não pode ser beco sem saída"). Guarda de onde veio para "Voltar" certo.
  const [cameFromDeclined, setCameFromDeclined] = useState(false);
  const [selectedConsole, setSelectedConsole] = useState<{ id: string; name: string; shortName: string } | null>(
    null,
  );
  // De onde "games" foi aberto, para o botão "Voltar" de GamesScreen saber
  // pra onde ir — "all-games" é a origem mais comum agora (2026-08-04), mas
  // a tela por console (LibraryScreen) continua existindo.
  const [gamesOrigin, setGamesOrigin] = useState<"all-games" | "library" | "console-detail">("all-games");
  // "library" (fase de gerenciar pastas) agora é alcançada tanto da home
  // quanto de "Todos os jogos" (2026-09-10, A1) — "Voltar" precisa saber pra
  // qual das duas devolver, mesmo padrão de `gamesOrigin`.
  const [libraryOrigin, setLibraryOrigin] = useState<"home" | "all-games">("home");
  // Jogo aberto em "game-detail" (Sprint 3, 2026-08-04). M5
  // (docs/sprint-m-plano.md, 2026-08-07): até aqui só vinha de
  // AllGamesScreen; agora GamesScreen também abre detalhe (mesmo GameTile,
  // ver M5) — "Voltar" precisa saber pra qual fase retornar, senão sempre
  // devolveria pra "all-games" mesmo vindo de dentro de um console.
  const [gameDetailOrigin, setGameDetailOrigin] = useState<"home" | "all-games" | "games" | "history">("home");
  const [selectedGame, setSelectedGame] = useState<{
    game: LibraryGame;
    consoleName: string;
    shortName: string;
    year?: number;
  } | null>(null);

  // M4 (docs/sprint-m-plano.md, decidido pelo Douglas em 2026-08-07): página,
  // busca e filtro de plataforma de AllGamesScreen sobem para cá — a tela em
  // si não guarda mais esse estado, só o consome. Sem isto, abrir um jogo e
  // voltar resetava tudo (a tela desmontava no switch de `phase` abaixo).
  // `loadInitialAllGamesView` (lazy initializer, roda uma vez só) traz
  // `sort`/`viewMode` do `localStorage` — os únicos dois campos do M3 que
  // precisam sobreviver a reabrir o app, não só a ir ao detalhe e voltar.
  const [allGamesView, setAllGamesView] = useState<AllGamesViewState>(loadInitialAllGamesView);
  function handleAllGamesViewChange(patch: Partial<AllGamesViewState>) {
    persistAllGamesView(patch);
    setAllGamesView((prev) => ({ ...prev, ...patch }));
  }
  // Posição de rolagem de "Todos os jogos" — a opção (a) do M4 não preserva
  // isto de graça (ao contrário de manter a tela sempre montada), por isso o
  // `ref` + guarda manual: `<main>` (abaixo) sobrevive à troca de `phase`
  // (mesmo nó do DOM, só o filho `{screen}` muda), mas o conteúdo mais curto
  // do detalhe encolhe `scrollHeight` e o navegador zera `scrollTop`
  // sozinho — perdendo a posição quando a grade volta a ser mais alta.
  //
  // **A restauração em si não mora aqui** — mora dentro de `AllGamesScreen`
  // (achado testando ao vivo com Playwright, 2026-08-07): um efeito neste
  // componente pai, disparado só por `phase`, roda **antes** de
  // `AllGamesScreen` buscar os jogos (a chamada é assíncrona) — nesse
  // instante a grade ainda não tem altura nenhuma pra rolar, o navegador
  // zera `scrollTop` de volta sozinho, e nada dispara de novo depois que os
  // jogos chegam. `AllGamesScreen` recebe `initialScrollTop` e só aplica
  // depois que `games` deixa de ser `null`.
  const mainRef = useRef<HTMLElement>(null);
  const [allGamesScrollTop, setAllGamesScrollTop] = useState(0);

  // 1. Antes de tudo, o achado do B5: a porta pode estar ocupada por algo que
  // não é o zeuxd. Consultado sob demanda (não por evento) — ver
  // src-tauri/src/lib.rs para o porquê.
  // N6 (docs/roadmap.md, Sprint N): extraída de dentro do `useEffect` para
  // função nomeada — antes só rodava uma vez, no mount (deps `[]`), e a tela
  // de "porta em conflito" não tinha nenhum botão de ação, a única tela do
  // app sem saída (fechar e reabrir era o único caminho). Agora
  // `checkPortConflict` também é o `onRetry` do `ErrorScreen`.
  function checkPortConflict() {
    invoke<boolean>("zeuxd_port_conflict")
      .then((conflict) => setPhase(conflict ? "port-conflict" : "connecting"))
      .catch(() => setPhase("connecting"));
  }
  useEffect(checkPortConflict, []);

  // 2. Com a porta liberada, busca o consentimento. O sidecar é iniciado em
  // paralelo com a janela (B5) e pode levar um instante a mais para aceitar
  // conexões — por isso as novas tentativas, em vez de falhar na primeira.
  // Orçamento ~20 s (40 × 500 ms): na primeira abertura o zeuxd ainda pode
  // estar abrindo o SQLite ou o AV do Windows varrendo o binário; 10 × 300 ms
  // (~3 s) era curto demais e produzia "O zeuxd não respondeu" com o daemon
  // ainda subindo (issue #6).
  useEffect(() => {
    if (phase !== "connecting") return;

    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 40;
    const retryDelayMs = 500;

    async function tryLoad() {
      try {
        const status = await api.getConsent();
        if (cancelled) return;
        setPolicy({ text: status.policy_text, version: status.policy_version });
        if (status.granted) {
          await runScan();
        } else {
          setPhase("consent");
        }
      } catch (err) {
        attempt += 1;
        if (attempt >= maxAttempts) {
          if (!cancelled) {
            setErrorMessage(err instanceof ApiError ? err.message : t("daemonUnreachable"));
            setPhase("daemon-unreachable");
          }
          return;
        }
        setTimeout(tryLoad, retryDelayMs);
      }
    }

    tryLoad();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function runScan() {
    setPhase("scanning");
    try {
      // scanHardware() e getVerdicts() são duas chamadas porque são duas
      // rotas na API (docs/api.md) — o scan grava em memória no servidor, o
      // parecer é computado a partir dele.
      await api.scanHardware();
      const nextReport = await api.getVerdicts();
      setReport(nextReport);
      setPhase("home");
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : t("scanError"));
      setPhase("scan-error");
    }
  }

  async function handleAccept() {
    setBusy(true);
    try {
      await api.setConsent(true);
    } catch (err) {
      setBusy(false);
      setErrorMessage(err instanceof ApiError ? err.message : t("consentError"));
      setPhase("daemon-unreachable");
      return;
    }
    setBusy(false);
    await runScan();
  }

  async function handleDecline() {
    setBusy(true);
    try {
      await api.setConsent(false);
      setPhase("declined");
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : t("consentError"));
      setPhase("daemon-unreachable");
    } finally {
      setBusy(false);
    }
  }

  // Q5 (docs/roadmap.md, Sprint Q): abrir o detalhe de um console a partir de
  // uma tela de jogos, quando o emulador precisa ser instalado por fora.
  // O parecer é a fonte preferida de nome (cobre os 33 consoles quando
  // existe); sem consentimento/scan, cai no catálogo de `GET /consoles`
  // (2026-09-08) — os dois cobrem o mesmo conjunto de consoles, só o
  // parecer também carrega o veredito de compatibilidade.
  function abrirConsolePorID(consoleId: string) {
    const verdict = report?.verdicts.find((v) => v.console_id === consoleId);
    const entry = consoles.find((c) => c.console_id === consoleId);
    const name = verdict?.name ?? entry?.name;
    const shortName = verdict?.short_name ?? entry?.short_name;
    if (!name || !shortName) return;
    setSelectedConsole({ id: consoleId, name, shortName });
    setPhase("console-detail");
  }

  function navigateSidebar(id: NavID) {
    // "library" é o nome de NavID (item da sidebar), não da Phase — a home
    // (2026-09-10, decisão do Douglas) é quem esse item abre agora;
    // "all-games" virou sub-visão, alcançada de dentro da home.
    if (id === "library") setPhase("home");
    if (id === "verdict") setPhase("verdict");
    if (id === "consoles") {
      setCameFromDeclined(false);
      setPhase("consoles");
    }
    if (id === "history") setPhase("history");
    if (id === "settings") setPhase("settings");
  }

  // Depois de todos os hooks (nenhum deles depende da abertura) e antes do
  // `switch`: a máquina de fases continua avançando nos efeitos acima
  // enquanto isto está na tela.
  if (splashVisible) {
    return (
      <>
        <SplashScreen
          onDone={() => {
            setSplashVisible(false);
            // A11y 2.4.3: a tela inteira troca por baixo de quem usa leitor
            // de tela, sem nada indicando para onde ir. `mainRef` só existe
            // no shell com sidebar (as fases de onboarding não o montam), daí
            // o `?.` e o rAF — o nó só existe depois deste render.
            requestAnimationFrame(() => mainRef.current?.focus());
          }}
        />
        {/* O toast de controle conectado/desconectado precisa estar aqui
            também, não só no shell abaixo: um controle já plugado antes de
            abrir o ZeuX dispara o toast no primeiro render (ver o efeito no
            topo deste arquivo) — que é justamente o render coberto pela
            abertura. Sem esta linha, o toast nasceria e expiraria escondido
            atrás dela, exatamente na primeira execução, que é a única em que
            a abertura aparece. */}
        {gamepadToast && <Toast message={gamepadToast} />}
      </>
    );
  }

  let screen: ReactNode;

  switch (phase) {
    case "checking-port":
    case "connecting":
      screen = <LoadingScreen message={t("loadingConsent")} />;
      break;

    case "port-conflict":
      // N6 (docs/roadmap.md, Sprint N): era um <p> sem nenhum botão — a
      // única tela do app sem saída, fechar e reabrir era o único jeito de
      // tentar de novo. `onRetry` reconsulta a porta sem reiniciar o app;
      // se o outro processo já tiver liberado a 7777, a tela avança sozinha
      // (checkPortConflict troca a phase para "connecting").
      screen = (
        <ErrorScreen
          message={t("portConflict")}
          onRetry={checkPortConflict}
        />
      );
      break;

    case "daemon-unreachable":
      screen = <ErrorScreen message={errorMessage} onRetry={() => setPhase("connecting")} />;
      break;

    case "consent":
      // policy só é null momentaneamente antes do primeiro carregamento —
      // nesse ponto phase ainda não é "consent".
      screen = (
        <ConsentScreen
          policyText={policy!.text}
          policyVersion={policy!.version}
          busy={busy}
          onAccept={handleAccept}
          onDecline={handleDecline}
        />
      );
      break;

    case "declined":
      screen = (
        <DeclinedScreen
          onReconsider={() => setPhase("consent")}
          onViewEmulators={() => {
            setCameFromDeclined(true);
            setPhase("emulators");
          }}
          // 2026-09-08: quem recusa pode usar o app inteiro do mesmo jeito
          // que quem aceitou — só sem parecer de hardware (`report` fica
          // `null`; as telas de biblioteca já toleram isso, ver
          // AllGamesScreen/LibraryScreen/GamesScreen/GameDetailScreen).
          onContinueWithoutConsent={() => setPhase("home")}
        />
      );
      break;

    case "scanning":
      screen = <LoadingScreen message={t("scanningHardware")} />;
      break;

    case "scan-error":
      screen = <ErrorScreen message={errorMessage} onRetry={runScan} />;
      break;

    case "home":
      screen = (
        <HomeScreen
          report={report ?? undefined}
          consoleCatalog={consoles}
          onOpenLibrary={() => {
            setLibraryOrigin("home");
            setPhase("library");
          }}
          onOpenConsole={abrirConsolePorID}
          onOpenAllGames={() => setPhase("all-games")}
          onOpenGame={(game, consoleName, shortName) => {
            const year =
              report?.verdicts.find((v) => v.console_id === game.console_id)?.year ??
              consoles.find((c) => c.console_id === game.console_id)?.year;
            setGameDetailOrigin("home");
            setSelectedGame({ game, consoleName, shortName, year });
            setPhase("game-detail");
          }}
        />
      );
      break;

    case "all-games":
      screen = (
        <AllGamesScreen
          report={report ?? undefined}
          consoleCatalog={consoles}
          onOpenLibrary={() => {
            setLibraryOrigin("all-games");
            setPhase("library");
          }}
          onOpenConsole={abrirConsolePorID}
          view={allGamesView}
          onViewChange={handleAllGamesViewChange}
          scrollElementRef={mainRef}
          initialScrollTop={allGamesScrollTop}
          onOpenGame={(game, consoleName, shortName) => {
            const year =
              report?.verdicts.find((v) => v.console_id === game.console_id)?.year ??
              consoles.find((c) => c.console_id === game.console_id)?.year;
            // M4: guarda a rolagem antes de trocar de fase — é a última
            // chance de ler `mainRef.current.scrollTop` com a grade ainda
            // na tela.
            setAllGamesScrollTop(mainRef.current?.scrollTop ?? 0);
            setGameDetailOrigin("all-games");
            setSelectedGame({ game, consoleName, shortName, year });
            setPhase("game-detail");
          }}
        />
      );
      break;

    case "game-detail":
      screen = (
        <GameDetailScreen
          game={selectedGame!.game}
          consoleName={selectedGame!.consoleName}
          shortName={selectedGame!.shortName}
          year={selectedGame!.year}
          report={report ?? undefined}
          onBack={() => setPhase(gameDetailOrigin)}
          onOpenConsole={() => abrirConsolePorID(selectedGame!.game.console_id)}
        />
      );
      break;

    case "verdict":
      screen = <VerdictScreen report={report ?? undefined} onAuthorize={() => setPhase("consent")} />;
      break;

    case "consoles":
      screen = (
        <ConsolesScreen
          report={report ?? undefined}
          onOpenEmulators={() => {
            setCameFromDeclined(false);
            setPhase("emulators");
          }}
          // P2: "Ver console" abre o detalhe, não os jogos. Sempre presente
          // — diferente de `GamesScreen`, o detalhe não exige parecer (só
          // esconde o bloco "Nesta máquina" quando não há).
          onOpenConsole={(id, name, shortName) => {
            setSelectedConsole({ id, name, shortName });
            setPhase("console-detail");
          }}
        />
      );
      break;

    case "console-detail":
      screen = (
        <ConsoleDetailScreen
          consoleId={selectedConsole!.id}
          report={report ?? undefined}
          onBack={() => setPhase("consoles")}
          // 2026-09-08: "Ver jogos" não depende mais de parecer carregado —
          // `GamesScreen` já lança sem preset autoconfigurado quando
          // `report` está ausente (ver `internal/api/server.go`, `toInput`).
          onOpenGames={() => {
            setGamesOrigin("console-detail");
            setPhase("games");
          }}
        />
      );
      break;

    case "emulators":
      screen = (
        <EmulatorsScreen
          report={report ?? undefined}
          // Sem consentimento, volta pra DeclinedScreen (nunca beco sem
          // saída, B8). Com consentimento, esta tela virou sub-visão de
          // Consoles em 2026-08-28 — a sidebar leva pra "Consoles", mas o
          // caminho de volta explícito é o que confirma a hierarquia.
          onBack={cameFromDeclined ? () => setPhase("declined") : () => setPhase("consoles")}
        />
      );
      break;

    case "library":
      screen = (
        <LibraryScreen
          consoleCatalog={consoles}
          report={report ?? undefined}
          onBack={() => setPhase(libraryOrigin)}
          onOpenGames={(id, name, shortName) => {
            setSelectedConsole({ id, name, shortName });
            setGamesOrigin("library");
            setPhase("games");
          }}
        />
      );
      break;

    case "games":
      screen = (
        <GamesScreen
          consoleId={selectedConsole!.id}
          consoleName={selectedConsole!.name}
          shortName={selectedConsole!.shortName}
          onOpenConsole={() => setPhase("console-detail")}
          report={report ?? undefined}
          onBack={() => setPhase(gamesOrigin)}
          onOpenGame={(game, consoleName, shortName) => {
            const year =
              report?.verdicts.find((v) => v.console_id === game.console_id)?.year ??
              consoles.find((c) => c.console_id === game.console_id)?.year;
            // M5: "Voltar" do detalhe precisa devolver pra cá, não pra
            // "all-games" — diferente de AllGamesScreen, esta tela não tem
            // rolagem própria pra salvar (grade curta, sem paginação).
            setGameDetailOrigin("games");
            setSelectedGame({ game, consoleName, shortName, year });
            setPhase("game-detail");
          }}
        />
      );
      break;

    case "history":
      screen = (
        <HistoryScreen
          report={report ?? undefined}
          consoleCatalog={consoles}
          onOpenLibrary={() => setPhase("all-games")}
          onOpenGame={(game, consoleName, shortName) => {
            const year =
              report?.verdicts.find((v) => v.console_id === game.console_id)?.year ??
              consoles.find((c) => c.console_id === game.console_id)?.year;
            setGameDetailOrigin("history");
            setSelectedGame({ game, consoleName, shortName, year });
            setPhase("game-detail");
          }}
        />
      );
      break;

    case "settings":
      screen = (
        <SettingsScreen
          onOpenControllerTest={() => setPhase("controller-test")}
          onOpenConfigureController={() => setPhase("configure-controller")}
          onReplayTour={() => setTourVisible(true)}
        />
      );
      break;

    case "controller-test":
      screen = <ControllerTestScreen onBack={() => setPhase("settings")} />;
      break;

    case "configure-controller":
      screen = <ConfigureControllerScreen onBack={() => setPhase("settings")} />;
      break;
  }

  // Sidebar (2026-08-04, Sprint 1): shell fixo para as fases pós-onboarding.
  // Até 2026-09-08 exigia `report` (parecer de hardware) — o que também
  // travava quem recusou consentimento fora do shell inteiro, sidebar
  // incluída (achado do Douglas: "quem não dá consentimento tem que poder
  // fazer tudo que uma pessoa que deu consentimento pode fazer"). As telas
  // dentro do shell já toleram `report` ausente (badge de compatibilidade
  // some, nome de console vem de `consoles`/`GET /consoles`) — o shell não
  // precisa mais dele para aparecer.
  //
  // "emulators" alcançado a partir de DeclinedScreen continua tela cheia,
  // sem sidebar (mesmo estado de antes) — é a confirmação imediata pós-
  // recusa, não a navegação normal; alcançado pela sidebar de verdade
  // (cameFromDeclined=false, ver navigateSidebar) ganha o shell normalmente.
  if (SIDEBAR_PHASES.includes(phase) && !(phase === "emulators" && cameFromDeclined)) {
    const active: NavID =
      phase === "verdict"
        ? "verdict"
        : phase === "history"
        ? "history"
        : // "emulators" acende "Consoles": é sub-visão dela desde 2026-08-28,
          // não um destino de sidebar próprio.
          phase === "consoles" || phase === "console-detail" || phase === "emulators"
          ? "consoles"
          : // "controller-test"/"configure-controller" são sub-visão de
            // Configurações, mesmo padrão de "emulators" acima — alcançadas
            // de dentro da tela, não item próprio da sidebar.
            phase === "settings" || phase === "controller-test" || phase === "configure-controller"
            ? "settings"
            : "library";
    return (
      // Achado do critico-design (2026-09-06): o glow de identidade (ADR
      // 0013) só existia nas 3 telas de onboarding — a única vez que o
      // usuário via clima neon era antes do app "de verdade" começar.
      // `relative` + `AmbientGlow` aqui é o mesmo componente, opacidade mais
      // baixa (a versão de 14% do onboarding competiria com grade densa de
      // jogos/consoles). Fixo no shell, não por tela: sobrevive à troca de
      // fase sem precisar repetir em cada uma das nove telas pós-onboarding.
      <div className="relative flex h-screen overflow-hidden">
        <AmbientGlow opacity={9} />
        {/* 2026-09-10 (achado do critico-design): a grade de pixels
            (`.zeux-pixel-grid`, index.css) existia em só 3 componentes
            isolados — o chassi que o usuário olha o tempo inteiro (este
            `<main>`) não carregava textura nenhuma, o que contradizia a
            decisão de 2026-09-09 na prática. `fixed`, não dentro do `<main>`
            rolável: é a tela do tubo, não conteúdo — não deveria rolar junto
            com a grade de jogos por baixo dela. */}
        <div aria-hidden="true" className="zeux-pixel-grid pointer-events-none fixed inset-0" />
        <Sidebar active={active} onNav={navigateSidebar} />
        {/* `tabIndex={-1}`: não entra na ordem de Tab, mas pode receber foco
            por script — é o alvo para onde a abertura devolve o foco ao sair
            (ver `SplashScreen.onDone`, acima). */}
        <main ref={mainRef} tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
          {screen}
        </main>
        {gamepadToast && <Toast message={gamepadToast} />}
        <GamepadHints connected={gamepadNavConnected} />
        {tourVisible && <TourOverlay onClose={closeTour} />}
      </div>
    );
  }

  return (
    <>
      {screen}
      {gamepadToast && <Toast message={gamepadToast} />}
      <GamepadHints connected={gamepadNavConnected} />
      {tourVisible && <TourOverlay onClose={closeTour} />}
    </>
  );
}

// A11y 2.4.2: título de janela por fase, em pt-BR. Fases sem entrada (as de
// transição — checando porta, conectando) caem no "ZeuX" puro.
const PHASE_TITLES: Partial<Record<Phase, string>> = {
  "port-conflict": "Porta em conflito",
  "daemon-unreachable": "Sem conexão com o serviço",
  consent: "Consentimento",
  declined: "Consentimento recusado",
  scanning: "Lendo o computador",
  "scan-error": "Erro na leitura do computador",
  home: "Biblioteca",
  "all-games": "Todos os jogos",
  "game-detail": "Detalhe do jogo",
  history: "Histórico",
  verdict: "Especificações",
  consoles: "Consoles",
  "console-detail": "Detalhe do console",
  emulators: "Emuladores",
  library: "Pastas de jogos",
  games: "Jogos do console",
  settings: "Configurações",
  "controller-test": "Testar controle",
  "configure-controller": "Configurar controle",
};

const SIDEBAR_PHASES: Phase[] = [
  "home",
  "all-games",
  "verdict",
  "consoles",
  "console-detail",
  "emulators",
  "library",
  "games",
  "game-detail",
  "history",
  "settings",
  "controller-test",
  "configure-controller",
];

export default App;
