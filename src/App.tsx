import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api, ApiError, type Report } from "./api";
import { Button } from "./components/ui";
import { ThemePicker } from "./components/ThemePicker";
import { ConsentScreen } from "./screens/ConsentScreen";
import { DeclinedScreen } from "./screens/DeclinedScreen";
import { EmulatorsScreen } from "./screens/EmulatorsScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
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
  | "verdict"
  | "emulators"
  | "library";

function App() {
  const [phase, setPhase] = useState<Phase>("checking-port");
  const [policy, setPolicy] = useState<{ text: string; version: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  // Emuladores (B10) não depende de consentimento — pode ser alcançado tanto
  // do parecer quanto da tela de recusa (docs/sprint-b-plano.md, B8: "recusar
  // não pode ser beco sem saída"). Guarda de onde veio para "Voltar" certo.
  const [cameFromDeclined, setCameFromDeclined] = useState(false);

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
  useEffect(() => {
    if (phase !== "connecting") return;

    let cancelled = false;
    let attempt = 0;

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
        if (attempt >= 10) {
          if (!cancelled) {
            setErrorMessage(err instanceof ApiError ? err.message : "O zeuxd não respondeu.");
            setPhase("daemon-unreachable");
          }
          return;
        }
        setTimeout(tryLoad, 300);
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
      setPhase("verdict");
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

    case "verdict":
      screen = (
        <main className="min-h-screen bg-paper">
          <div className="mx-auto flex max-w-3xl justify-end gap-2 px-6 pt-16">
            <Button variant="secondary" onClick={() => setPhase("library")}>
              Ver biblioteca
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setCameFromDeclined(false);
                setPhase("emulators");
              }}
            >
              Ver emuladores
            </Button>
          </div>
          <VerdictScreen report={report!} />
        </main>
      );
      break;

    case "emulators":
      screen = <EmulatorsScreen onBack={() => setPhase(cameFromDeclined ? "declined" : "verdict")} />;
      break;

    case "library":
      screen = <LibraryScreen report={report!} onBack={() => setPhase("verdict")} />;
      break;
  }

  return (
    <>
      <ThemePicker />
      {screen}
    </>
  );
}

export default App;
