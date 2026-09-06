import { api } from "../api";

/**
 * Auto-rescan de pastas configuradas (2026-09-06, decisão do Douglas: opção
 * "revarrer em pontos de entrada previsíveis", não watcher de filesystem —
 * sem processo de fundo, sem dependência nova, resolve o caso comum de
 * "copiei um jogo novo e abri o ZeuX" sem exigir o clique manual em
 * "Revarrer").
 *
 * `MIN_INTERVAL_MS` evita revarrer a mesma árvore em sequência quando o
 * usuário troca de tela rápido (Todos os jogos → console → detalhe →
 * voltar) — cada uma dessas telas chama `rescanAllFoldersIfStale`, mas só a
 * primeira dentro da janela realmente bate no disco. O relógio vive só
 * nesta aba (variável de módulo, não localStorage) — reiniciar o app perde
 * o cooldown, o que é aceitável: na pior hipótese revarre uma vez a mais
 * logo depois de abrir.
 */
const MIN_INTERVAL_MS = 30_000;

let lastRunAt = 0;
let inFlight: Promise<void> | null = null;

export function rescanAllFoldersIfStale(): Promise<void> {
  if (inFlight) return inFlight;
  if (Date.now() - lastRunAt < MIN_INTERVAL_MS) return Promise.resolve();

  lastRunAt = Date.now();
  inFlight = api
    .getLibraryFolders()
    .then((res) =>
      Promise.all(
        // Best-effort: uma pasta que falhar ao revarrer (ex.: HD externo
        // desconectado) não pode travar as outras nem virar erro visível —
        // isto roda em silêncio atrás da tela normal de jogos, que já tem
        // seu próprio tratamento de erro para a listagem em si.
        res.folders.map((folder) => api.rescanLibraryFolder(folder.id).catch(() => null)),
      ),
    )
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
