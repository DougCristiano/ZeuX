// Extraído de client.ts pra evitar import circular: o modo demo
// (demoMock.ts) precisa lançar o mesmo ApiError que o cliente real usa, e
// demoMock é importado por client.ts — colocar a classe em client.ts
// criaria um ciclo entre os dois módulos.

/**
 * Erro de API com o `code` estável do servidor. `message` já vem em
 * português, pronta para ser exibida ao usuário exatamente como veio — regra
 * de produto: a UI nunca reescreve a mensagem do servidor. `code` é só para a
 * UI ramificar (ex.: mostrar um botão diferente para `hardware_insufficient`).
 */
export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}
