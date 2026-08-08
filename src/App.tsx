import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api, ApiError, type Report } from "./api";
import { Sidebar, type NavID } from "./components/Sidebar";
import { useGamepadNavigation } from "./hooks/useGamepadNavigation";
import type { LibraryGame } from "./api/types";
import {
  AllGamesScreen,
  loadInitialAllGamesView,
  persistAllGamesView,
  type AllGamesViewState,
} from "./screens/AllGamesScreen";
import { ConsentScreen } from "./screens/ConsentScreen";
import { DeclinedScreen } from "./screens/DeclinedScreen";
import { EmulatorsScreen } from "./screens/EmulatorsScreen";
import { GameDetailScreen } from "./screens/GameDetailScreen";
import { GamesScreen } from "./screens/GamesScreen";
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
  // "all-games" é a tela inicial depois do parecer pronto (2026-08-04, a
  // pedido do Douglas — "clicar direto e começar a jogar"), não "verdict".
  // O parecer de compatibilidade continua existindo, alcançável a partir
  // daqui.
  | "all-games"
  | "verdict"
  | "emulators"
  | "library"
  | "games"
  | "game-detail"
  | "settings";

function App() {
  // Sprint L / ADR 0014 (docs/roadmap.md, docs/decisoes/): D-pad/analógico ≈
  // Tab, A ≈ clique, B ≈ Esc. Um lugar só, não por tela — o hook opera sobre
  // document.activeElement, não precisa saber a phase atual.
  useGamepadNavigation();

  const [phase, setPhase] = useState<Phase>("checking-port");
  const [policy, setPolicy] = useState<{ text: string; version: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [report, setReport] = useState<Report | null>(null);
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
  const [gamesOrigin, setGamesOrigin] = useState<"all-games" | "library">("all-games");
  // Jogo aberto em "game-detail" (Sprint 3, 2026-08-04). M5
  // (docs/sprint-m-plano.md, 2026-08-07): até aqui só vinha de
  // AllGamesScreen; agora GamesScreen também abre detalhe (mesmo GameTile,
  // ver M5) — "Voltar" precisa saber pra qual fase retornar, senão sempre
  // devolveria pra "all-games" mesmo vindo de dentro de um console.
  const [gameDetailOrigin, setGameDetailOrigin] = useState<"all-games" | "games">("all-games");
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
  useEffect(() => {
    invoke<boolean>("zeuxd_port_conflict")
      .then((conflict) => setPhase(conflict ? "port-conflict" : "connecting"))
      .catch(() => setPhase("connecting"));
  }, []);

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
            setErrorMessage(err instanceof ApiError ? err.message : "O zeuxd não respondeu.");
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
      setPhase("all-games");
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : "Não foi possível ler este computador.");
      setPhase("scan-error");
    }
  }

  async function handleAccept() {
    setBusy(true);
    try {
      await api.setConsent(true);
    } catch (err) {
      setBusy(false);
      setErrorMessage(err instanceof ApiError ? err.message : "Não foi possível registrar o consentimento.");
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
      setErrorMessage(err instanceof ApiError ? err.message : "Não foi possível registrar o consentimento.");
      setPhase("daemon-unreachable");
    } finally {
      setBusy(false);
    }
  }

  function navigateSidebar(id: NavID) {
    if (id === "library") setPhase("all-games");
    if (id === "verdict") setPhase("verdict");
    if (id === "emulators") {
      setCameFromDeclined(false);
      setPhase("emulators");
    }
    if (id === "settings") setPhase("settings");
  }

  let screen: ReactNode;

  switch (phase) {
    case "checking-port":
    case "connecting":
      screen = <LoadingScreen message="lendo o consentimento…" />;
      break;

    case "port-conflict":
      screen = (
        <main className="flex min-h-screen items-center justify-center bg-paper px-6">
          <p className="max-w-sm text-base text-danger">
            A porta 7777 já está sendo usada por outro programa, não pelo ZeuX. Feche o que estiver usando
            essa porta e abra o ZeuX de novo.
          </p>
        </main>
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
        />
      );
      break;

    case "scanning":
      screen = <LoadingScreen message="lendo este computador…" />;
      break;

    case "scan-error":
      screen = <ErrorScreen message={errorMessage} onRetry={runScan} />;
      break;

    case "all-games":
      screen = (
        <AllGamesScreen
          report={report!}
          onOpenLibrary={() => setPhase("library")}
          view={allGamesView}
          onViewChange={handleAllGamesViewChange}
          scrollElementRef={mainRef}
          initialScrollTop={allGamesScrollTop}
          onOpenGame={(game, consoleName, shortName) => {
            const year = report!.verdicts.find((v) => v.console_id === game.console_id)?.year;
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
          report={report!}
          onBack={() => setPhase(gameDetailOrigin)}
        />
      );
      break;

    case "verdict":
      screen = <VerdictScreen report={report!} />;
      break;

    case "emulators":
      screen = (
        <EmulatorsScreen report={report ?? undefined} onBack={cameFromDeclined ? () => setPhase("declined") : undefined} />
      );
      break;

    case "library":
      screen = (
        <LibraryScreen
          report={report!}
          onBack={() => setPhase("all-games")}
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
          report={report!}
          onBack={() => setPhase(gamesOrigin)}
          onOpenGame={(game, consoleName, shortName) => {
            const year = report!.verdicts.find((v) => v.console_id === game.console_id)?.year;
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

    case "settings":
      screen = <SettingsScreen />;
      break;
  }

  // Sidebar (2026-08-04, Sprint 1): shell fixo para as fases pós-onboarding
  // que já têm um parecer carregado. "emulators" alcançado a partir de
  // DeclinedScreen (sem consentimento, sem report ainda) continua tela
  // cheia, sem sidebar — ver EmulatorsScreen.onBack.
  if (report && SIDEBAR_PHASES.includes(phase)) {
    const active: NavID =
      phase === "verdict" ? "verdict" : phase === "emulators" ? "emulators" : phase === "settings" ? "settings" : "library";
    return (
      <div className="flex h-screen">
        <Sidebar active={active} onNav={navigateSidebar} />
        <main ref={mainRef} className="flex-1 overflow-y-auto">
          {screen}
        </main>
      </div>
    );
  }

  return screen;
}

const SIDEBAR_PHASES: Phase[] = [
  "all-games",
  "verdict",
  "emulators",
  "library",
  "games",
  "game-detail",
  "settings",
];

export default App;
