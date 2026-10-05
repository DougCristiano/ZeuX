import { useState } from "react";

/**
 * Itens por página escolhidos pela pessoa, lembrados por tela (2026-10-05).
 * Preferência de tela, então `localStorage` — mesmo padrão de ordenação e
 * modo de exibição da biblioteca. Toda leitura/escrita em try/catch: sem
 * armazenamento disponível, a tela segue no padrão.
 */
export function usePageSize(key: string, fallback: number, allowed: readonly number[]): [number, (size: number) => void] {
  const storageKey = `zeux.pageSize.${key}`;
  const [size, setSize] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(storageKey));
      return allowed.includes(stored) ? stored : fallback;
    } catch {
      return fallback;
    }
  });
  function update(next: number) {
    setSize(next);
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {
      // Sem armazenamento: vale só nesta sessão.
    }
  }
  return [size, update];
}
