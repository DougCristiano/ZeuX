import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { SessionWithStats } from "../api/types";

// B5 (docs/pendencias.md, "Indicador 'um jogo está rodando agora' no
// shell"): um único poll de `GET /sessions`, vivo no shell inteiro, serve as
// duas necessidades que dependem da mesma resposta — a faixa "jogo rodando
// agora" e a detecção de morte rápida por 0xC0000135. Um hook por
// necessidade duplicaria a mesma chamada de rede em paralelo.
const POLL_INTERVAL_MS = 4_000;

// Mesmo trecho que `describeExitCode` (internal/emulator/session.go) grava
// em `exit_error` quando o processo morre com 0xC0000135. Comparado por
// substring, não por igualdade da frase inteira: a frase completa muda se o
// Go reescrever a redação em volta, e o que importa para decidir se mostra o
// botão é só que ela cita o Visual C++ Redistributable.
const VCREDIST_MARKER = "Visual C++ Redistributable";

// Janela para considerar um lançamento "recém-morto". `started_at` vem do
// servidor (fuso do relógio da máquina, igual `ended_at`); folga generosa
// sobre o intervalo de poll acima para não perder o aviso por atraso de
// rede, mas curta o bastante para nunca reabrir a oferta para uma sessão
// antiga só porque o app foi reaberto dias depois com o mesmo `exit_error`
// ainda no histórico.
const RECENT_LAUNCH_WINDOW_MS = 20_000;

/**
 * Acompanha `GET /sessions` em segundo plano, para o shell do app (não uma
 * tela específica) saber duas coisas sem que cada tela de biblioteca precise
 * perguntar por conta própria:
 *
 * - `runningSession`: a sessão com `is_running: true`, se houver, para a
 *   faixa "um jogo está rodando agora".
 * - `vcredistSession`: uma sessão que acabou de morrer com o texto do
 *   Visual C++ Redistributable em `exit_error` — para oferecer o instalador
 *   uma vez só, não em cada tela de onde o jogo poderia ter sido aberto.
 *
 * `dismissVcredist` marca a sessão como já tratada (fechou o modal, ou
 * clicou em instalar) para o próximo poll não reabrir o mesmo aviso — sem
 * isto, `vcredistSession` voltaria assim que o timer seguinte rodasse,
 * porque `exit_error` continua na sessão para sempre.
 */
export function useSessionWatcher() {
  const [runningSession, setRunningSession] = useState<SessionWithStats | null>(null);
  const [vcredistSession, setVcredistSession] = useState<SessionWithStats | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const res = await api.getSessions();
        if (cancelled) return;

        setRunningSession(res.sessions.find((s) => s.is_running) ?? null);

        const candidate =
          res.sessions.find((s) => {
            if (s.is_running) return false;
            if (!s.exit_error?.includes(VCREDIST_MARKER)) return false;
            if (dismissedRef.current.has(s.id)) return false;
            const startedAt = Date.parse(s.started_at);
            if (Number.isNaN(startedAt)) return false;
            return Date.now() - startedAt < RECENT_LAUNCH_WINDOW_MS;
          }) ?? null;
        setVcredistSession(candidate);
      } catch {
        // Poll silencioso, de propósito: uma rede instável não pode empilhar
        // um erro visível a cada 4s por cima de qualquer tela aberta — a
        // faixa e o modal simplesmente não aparecem neste ciclo, e o
        // próximo tenta de novo.
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  function dismissVcredist(id: string) {
    dismissedRef.current.add(id);
    setVcredistSession((prev) => (prev?.id === id ? null : prev));
  }

  return { runningSession, vcredistSession, dismissVcredist };
}
