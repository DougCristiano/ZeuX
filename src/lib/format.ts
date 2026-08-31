// Formatação de tempo jogado usada pelos dois desenhos de célula da
// biblioteca (grade em GameCover/AllGamesScreen, linha em GameListRow — M3,
// docs/sprint-m-plano.md). Deliberadamente separado do `formatPlaytime`
// próprio de GameDetailScreen: ali o texto é mais compacto ("12 min", sem o
// sufixo "jogados") porque já mora ao lado de um rótulo "Tempo jogado"; aqui
// o texto precisa se explicar sozinho, solto na célula.
export function formatPlaytime(seconds: number): string {
  if (seconds <= 0) return "nunca jogado";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min jogados`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h${remainder}min jogados` : `${hours}h jogados`;
}

// M8 (docs/sprint-m-plano.md): extraído de GamesScreen para ser reaproveitado
// também por AllGamesScreen — as duas mostram progresso do mesmo InstallJob.
// `total_bytes` pode vir 0 (tamanho desconhecido) — nesse caso o percentual
// não existe, `ProgressBar` sabe desenhar a barra indeterminada para `null`.
export function percentOf(job: { downloaded_bytes: number; total_bytes: number }): number | null {
  if (job.total_bytes <= 0) return null;
  return Math.min(100, Math.round((job.downloaded_bytes / job.total_bytes) * 100));
}

/**
 * Sufixo de fase para um download de core em andamento (ADR 0015, R3).
 *
 * "baixando" é a fase esperada e já está dita pelo verbo da frase ("Baixando
 * o core X…") — repetir vira "Baixando o core mesen… baixando", que foi o que
 * apareceu na tela ao rodar o app de verdade em 2026-08-27. As outras fases
 * ("verificando", "extraindo", "finalizando") informam algo que o verbo não
 * diz, e essas aparecem.
 */
export function faseExtraDeDownload(phase: string): string {
  return phase === "baixando" ? "" : ` ${phase}`;
}
