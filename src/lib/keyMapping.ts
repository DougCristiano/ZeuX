// Traduz a tecla capturada pelo navegador (KeyboardEvent) para o vocabulário
// de teclado que cada emulador grava no próprio arquivo — H3/H4,
// docs/roadmap.md. InputBinding.Key é opaco por design (nunca um layout
// genérico do ZeuX, ver src/api/types.ts); é aqui que a tradução acontece,
// uma vez por adapter, antes de mandar para a API.
//
// **O que foi confirmado contra arquivo real desta sessão** (ver
// internal/emulator/pcsx2_config.go / retroarch_config.go): um subconjunto
// pequeno de teclas — as que apareciam de fato vinculadas no PCSX2.ini e no
// retroarch.cfg reais desta máquina. O resto da tabela segue a mesma
// convenção observada (nomes de tecla do Qt para o PCSX2, identificadores
// simples em minúsculas para o RetroArch — ambos padrões estáveis e
// documentados), mas **não foi testado tecla por tecla contra o binário
// real**. Uma tecla que não tem entrada aqui devolve `null` — a tela trata
// isso como "esta tecla não pode ser mapeada", nunca grava um palpite.

const PCSX2_SPECIAL: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Enter: "Return",
  Backspace: "Backspace",
  Escape: "Escape",
  " ": "Space",
  Tab: "Tab",
  Shift: "Shift",
  Control: "Ctrl",
  Alt: "Alt",
};

function pcsx2KeyName(event: { key: string }): string | null {
  if (PCSX2_SPECIAL[event.key]) return PCSX2_SPECIAL[event.key];
  if (/^F\d{1,2}$/.test(event.key)) return event.key; // F1..F12, mesmo nome no Qt
  if (/^[0-9]$/.test(event.key)) return event.key; // dígito solto, confirmado no arquivo real (L2 = Keyboard/1)
  if (/^[a-zA-Z]$/.test(event.key)) return event.key.toUpperCase(); // letra solta, confirmada (Cross = Keyboard/K)
  return null;
}

const RETROARCH_SPECIAL: Record<string, string> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "enter",
  Backspace: "backspace",
  Escape: "escape",
  " ": "space",
  Tab: "tab",
  ",": "comma",
  ".": "period",
  ";": "semicolon",
  "'": "quote",
  "-": "minus",
  "=": "equals",
  "[": "leftbracket",
  "]": "rightbracket",
  "\\": "backslash",
  Shift: "left shift",
  Control: "left ctrl",
  Alt: "left alt",
  CapsLock: "capslock",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  Insert: "insert",
  Delete: "delete",
};

function retroArchKeyName(event: { key: string }): string | null {
  const lower = event.key.toLowerCase();
  if (RETROARCH_SPECIAL[event.key]) return RETROARCH_SPECIAL[event.key];
  if (/^f\d{1,2}$/.test(lower)) return lower; // f1..f19, confirmado (input_menu_toggle = "f1")
  if (/^[0-9]$/.test(lower)) return lower; // dígito solto
  if (/^[a-z]$/.test(lower)) return lower; // letra solta, confirmada (input_player1_a = "x")
  return null;
}

/** Ids dos dois adapters pilotados pelo H1/H3/H4 — os únicos com tradução
 * de tecla implementada. Qualquer outro id (nunca deveria chegar aqui, pois
 * a tela só aparece quando `bindable: true`) devolve null. */
export function translateKeyForAdapter(adapterId: string, event: { key: string }): string | null {
  switch (adapterId) {
    case "pcsx2":
      return pcsx2KeyName(event);
    case "retroarch":
      return retroArchKeyName(event);
    default:
      return null;
  }
}
