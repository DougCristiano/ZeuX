import { useCallback, useEffect, useRef, useState } from "react";

/**
 * N9 (docs/roadmap.md, Sprint N): controla o texto e o timer de um `<Toast>`
 * (src/components/ui.tsx). `showToast` reinicia o timer a cada chamada —
 * dois cliques rápidos na mesma ação não fazem o toast sumir no meio do
 * segundo. 3s é o mesmo tempo que o resto do app já usa para feedback
 * transitório (ver `ProgressBar`/instalação).
 */
export function useToast(durationMs = 3000) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(text);
      timer.current = setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs],
  );

  // Limpa o timer se o componente desmontar com o toast ainda visível (ex.:
  // navegar para outra tela logo depois de salvar).
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { toastMessage: message, showToast };
}
