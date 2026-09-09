/**
 * Interruptor global da navegação por controle (`useGamepadNavigation`).
 *
 * Existe por causa de um bug real relatado pelo Douglas: em
 * `ControllerTestScreen.tsx` a pessoa aperta os botões justamente para ver se
 * funcionam, mas o `useGamepadNavigation` — montado uma vez em `App.tsx` e
 * rodando em paralelo, sem saber que a tela de teste existe — lia o mesmo
 * botão B como "voltar" e fechava a tela no meio do teste. A tela de teste
 * precisa capturar TODOS os botões, inclusive o de voltar, sem que o app
 * reaja a eles ao mesmo tempo.
 *
 * Por que variável de módulo e não estado React: quem suspende
 * (`ControllerTestScreen`) e quem obedece (`useGamepadNavigation`, montado em
 * `App.tsx`) não têm um ancestral comum prático — passar isso por prop ou
 * contexto atravessaria várias telas que não têm nada a ver com o assunto só
 * para carregar um booleano. O estado é de processo, não de árvore de
 * componentes: existe no máximo um loop de navegação por controle no app.
 *
 * Quem suspende é responsável por retomar, inclusive na desmontagem — se a
 * pessoa sair da tela de teste pelo mouse/teclado, sem o `resume` a navegação
 * por controle ficaria morta no resto do app até o próximo reinício.
 */

let suspended = false;

export function suspendGamepadNavigation() {
  suspended = true;
}

export function resumeGamepadNavigation() {
  suspended = false;
}

export function isGamepadNavigationSuspended(): boolean {
  return suspended;
}
