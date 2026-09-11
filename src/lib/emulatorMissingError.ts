// B2 (docs/pendencias.md): os três códigos que a API usa para "o binário do
// emulador não está onde o ZeuX olhou" (docs/api.md, tabela de códigos de
// erro). Centralizado aqui porque quatro telas de lançamento
// (Home/AllGames/Games/GameDetail) precisam da mesma checagem pra decidir se
// oferecem a ação extra do `ErrorModal` — três `===` espalhados por telas
// diferentes divergiriam na primeira vez que a API ganhasse um quarto código.
export function isEmulatorMissingErrorCode(code: string | null | undefined): boolean {
  return code === "binary_not_found" || code === "not_installed" || code === "emulator_unavailable";
}
