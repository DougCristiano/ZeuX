import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api, ApiError, type Report } from "./api";
import { ConsentScreen } from "./screens/ConsentScreen";
import { DeclinedScreen } from "./screens/DeclinedScreen";
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
  | "verdict";

function App() {
  const [phase, setPhase] = useState<Phase>("checking-port");
  const [policy, setPolicy] = useState<{ text: string; version: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [report, setReport] = useState<Report | null>(null);

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

  switch (phase) {
    case "checking-port":
    case "connecting":
      return <LoadingScreen message="lendo o consentimento…" />;

    case "port-conflict":
      return (
        <main className="flex min-h-screen items-center justify-center bg-paper px-6">
          <p className="max-w-sm text-base text-danger">
            A porta 7777 já está sendo usada por outro programa, não pelo ZeuX. Feche o que estiver usando
            essa porta e abra o ZeuX de novo.
          </p>
        </main>
      );

    case "daemon-unreachable":
      return <ErrorScreen message={errorMessage} onRetry={() => setPhase("connecting")} />;

    case "consent":
      // policy só é null momentaneamente antes do primeiro carregamento —
      // nesse ponto phase ainda não é "consent".
      return (
        <ConsentScreen
          policyText={policy!.text}
          policyVersion={policy!.version}
          busy={busy}
          onAccept={handleAccept}
          onDecline={handleDecline}
        />
      );

    case "declined":
      return <DeclinedScreen onReconsider={() => setPhase("consent")} />;

    case "scanning":
      return <LoadingScreen message="lendo este computador…" />;

    case "scan-error":
      return <ErrorScreen message={errorMessage} onRetry={runScan} />;

    case "verdict":
      return (
        <main className="min-h-screen bg-paper">
          <VerdictScreen report={report!} />
        </main>
      );
  }
}

export default App;
