import type { Dict } from "../i18n/i18n";

export const dict = {
  title: {
    "pt-BR": "Testar controle",
    en: "Test controller",
  },
  subtitle: {
    "pt-BR": "Aperte qualquer botão ou mova um analógico — o desenho reage ao vivo, do jeito que o controle está reportando agora.",
    en: "Press any button or move a stick — the diagram reacts live, exactly as the controller is reporting right now.",
  },
  back: {
    "pt-BR": "Voltar",
    en: "Back",
  },
  connectedAs: {
    "pt-BR": "Controle: {{name}}",
    en: "Controller: {{name}}",
  },
  noController: {
    "pt-BR": "Nenhum controle conectado. Plugue um e aperte qualquer botão.",
    en: "No controller connected. Plug one in and press any button.",
  },
  dpad: {
    "pt-BR": "Direcional",
    en: "D-pad",
  },
  leftStick: {
    "pt-BR": "Analógico esquerdo",
    en: "Left stick",
  },
  rightStick: {
    "pt-BR": "Analógico direito",
    en: "Right stick",
  },
  shoulders: {
    "pt-BR": "Ombro (L1/R1)",
    en: "Shoulder (L1/R1)",
  },
  triggers: {
    "pt-BR": "Gatilho (L2/R2)",
    en: "Trigger (L2/R2)",
  },
  faceButtons: {
    "pt-BR": "Botões de face",
    en: "Face buttons",
  },
  // A foto é de um controle de marca real, com logo e A/B/X/Y visíveis —
  // decisão explícita do Douglas em 2026-09-08, que substituiu o desenho
  // neutro anterior (docs/decisoes.md, "Foto de controle real no lugar do SVG
  // desenhado à mão"). Este texto existe porque a foto mostra UM controle e a
  // tela lê QUALQUER um: sem a ressalva, quem usa um controle de outro
  // formato acha que a tela está lendo errado.
  photoNote: {
    "pt-BR": "A foto é só referência de posição: o realce segue o índice padrão da Gamepad API, o mesmo em qualquer controle no mapeamento \"standard\", mesmo que o seu tenha outro formato ou outros rótulos nos botões.",
    en: "The photo is a position reference only: the highlight follows the standard Gamepad API index, the same on any controller in \"standard\" mapping, even if yours has a different shape or different button labels.",
  },
  // Achado real, 2026-09-08 (relato do Douglas): num controle Xbox real,
  // esta tela acendia o botão errado. Causa: o navegador só garante que os
  // índices 0-16 seguem A/B/X/Y-gatilhos-direcional quando `pad.mapping ===
  // "standard"` — fora disso (comum em Linux/WebKitGTK com certos drivers
  // Bluetooth/adaptador) a ordem é a crua do driver, e o desenho assumindo
  // "standard" sempre acende o marcador errado. Regra 4 do CLAUDE.md: dado
  // não confirmado é declarado desconhecido — daí avisar em vez de fingir
  // que o realce está certo.
  nonStandardMappingLabel: {
    "pt-BR": "Atenção",
    en: "Warning",
  },
  nonStandardMapping: {
    "pt-BR": "Este controle não está reportando no layout padrão do navegador (mapeamento: \"{{mapping}}\") — o realce abaixo pode acender o botão errado. Isto não é um problema de configuração dentro do ZeuX: é o próprio sistema/driver que está entregando os botões fora de ordem para o navegador.",
    en: "This controller isn't reporting in the browser's standard layout (mapping: \"{{mapping}}\") — the highlight below may light up the wrong button. This isn't a ZeuX configuration issue: it's the OS/driver itself handing buttons to the browser out of order.",
  },
  startTest: {
    "pt-BR": "Iniciar teste",
    en: "Start test",
  },
  stopTest: {
    "pt-BR": "Parar teste",
    en: "Stop test",
  },
  idleHint: {
    "pt-BR": "Ao iniciar, o app para de reagir aos botões do controle (inclusive o de voltar) até você clicar em \"Parar teste\".",
    en: "Once started, the app stops reacting to controller buttons (including the back button) until you click \"Stop test\".",
  },
  testingActiveHint: {
    "pt-BR": "Navegação por botões suspensa. Use 'Parar teste' ou o mouse/teclado para sair.",
    en: "Button navigation is suspended. Use 'Stop test' or mouse/keyboard to exit.",
  },
  // Rótulo do bloco que reporta a situação do controle. Era "—" literal, que
  // não diz nada a quem lê a tela nem a um leitor de tela.
  controllerStatusLabel: {
    "pt-BR": "Situação",
    en: "Status",
  },
} satisfies Dict;
