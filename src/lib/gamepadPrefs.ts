/**
 * Preferência do controle **para navegar o próprio ZeuX** (2026-09-29, teste
 * com um usuário novo: ele queria "configurar o controle para o ZeuX", e a
 * única tela de configuração falava de emuladores — sem nenhum instalado,
 * dizia que não havia o que configurar, embora o controle já navegasse o app).
 *
 * A única escolha é qual botão de face confirma. No mapeamento "standard" da
 * Gamepad API o índice 0 é o botão de BAIXO e o 1 o da DIREITA; um controle
 * Nintendo (e o costume japonês no PlayStation) confirma com o da direita.
 * Remapear botão por botão não entra aqui: a navegação usa só direcional,
 * confirmar e voltar.
 *
 * Mora no `localStorage`, como o idioma e os efeitos visuais: é preferência
 * desta máquina, não dado que o servidor precise ver. A leitura é cacheada no
 * módulo porque `useGamepadNavigation` consulta a cada quadro.
 */
export type ConfirmButton = "bottom" | "right";

const STORAGE_KEY = "zeux.gamepad.confirm";
const listeners = new Set<() => void>();

function read(): ConfirmButton {
  try {
    return localStorage.getItem(STORAGE_KEY) === "right" ? "right" : "bottom";
  } catch {
    return "bottom";
  }
}

let current: ConfirmButton = read();

export function getConfirmButton(): ConfirmButton {
  return current;
}

export function setConfirmButton(value: ConfirmButton) {
  current = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Sem persistência vale até fechar o app — a navegação continua
    // funcionando com a escolha em memória.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeConfirmButton(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Índices da Gamepad API ("standard" mapping) de confirmar e voltar. */
export function confirmBackIndices(): { confirm: number; back: number } {
  return current === "right" ? { confirm: 1, back: 0 } : { confirm: 0, back: 1 };
}
