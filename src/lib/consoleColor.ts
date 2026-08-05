/**
 * Cor de identidade por console (2026-08-05, a pedido do Douglas). Decorativa
 * de propósito — não comunica estado nenhum (isso continua sendo texto/badge,
 * nunca cor) — mas determinística: o mesmo console_id sempre resolve pra
 * mesma cor, em toda tela, pra "padronizar de quem é o jogo" — reconhecer o
 * console pela cor sem precisar ler a sigla.
 *
 * Paleta curta e fixa (não uma cor por console, cadastrada à mão) — um hash
 * simples do id escolhe o índice, então os 33 consoles do catálogo (e
 * qualquer um adicionado depois) já saem cobertos sem manutenção.
 */
const PALETTE = [
  "#9D4EFF", // roxo (--accent)
  "#00E5FF", // ciano (--accent-secondary)
  "#FF6B1A", // laranja (--amber)
  "#00D68F", // verde
  "#FF4D6D", // rosa/vermelho
  "#FFD60A", // amarelo
  "#4D96FF", // azul
  "#C77DFF", // lilás
  "#06D6A0", // teal
  "#FF9F1C", // âmbar claro
] as const;

export function consoleAccentColor(consoleId: string): string {
  let hash = 0;
  for (let i = 0; i < consoleId.length; i++) {
    hash = (hash * 31 + consoleId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
