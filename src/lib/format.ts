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
