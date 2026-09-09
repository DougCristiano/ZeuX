/**
 * A ponte entre "posição física do controle" e o nome que cada adapter dá
 * àquela posição.
 *
 * Existe porque `GET /emulators/{id}/bindings` devolve o vocabulário do
 * PRÓPRIO emulador — o PCSX2 fala `Cross`/`Triangle`/`L2`
 * (internal/emulator/pcsx2_config.go, `pcsx2PadActions`), o RetroArch fala
 * `b`/`x`/`l2` (internal/emulator/retroarch_config.go, `retroArchPadActions`)
 * — e nenhuma das duas listas é de "ações de jogo": as duas descrevem as
 * MESMAS 16 posições do controle padrão, só com nomes diferentes. Sem esta
 * tabela, quem quisesse mapear o controle uma vez só teria que abrir um
 * painel por emulador e apertar os mesmos 16 botões de novo.
 *
 * | posição física  | pcsx2      | retroarch |
 * |-----------------|------------|-----------|
 * | faceBottom      | Cross      | b         |
 * | faceRight       | Circle     | a         |
 * | faceLeft        | Square     | y         |
 * | faceTop         | Triangle   | x         |
 * | dpadUp          | Up         | up        |
 * | dpadDown        | Down       | down      |
 * | dpadLeft        | Left       | left      |
 * | dpadRight       | Right      | right     |
 * | select          | Select     | select    |
 * | start           | Start      | start     |
 * | shoulderLeft    | L1         | l         |
 * | shoulderRight   | R1         | r         |
 * | triggerLeft     | L2         | l2        |
 * | triggerRight    | R2         | r2        |
 * | stickLeftClick  | L3         | l3        |
 * | stickRightClick | R3         | r3        |
 *
 * **Ressalva que precisa continuar visível:** o backend do PCSX2
 * (`WriteBindings`) hoje nunca grava um bind de botão físico — todo `Button`
 * volta como mensagem em `unapplied` pedindo para configurar dentro do
 * próprio PCSX2, porque o formato de escrita nunca foi validado contra o
 * binário real. Isso é deliberado, não bug: quem consome esta tabela deve
 * chamar a API igual para todos os adapters e MOSTRAR o `unapplied` que
 * vier, nunca tratar o PCSX2 como caso especial nem afirmar que gravou.
 *
 * A ORDEM importa duas vezes: é a sequência em que o fluxo guiado pede os
 * botões (faces, ombros, gatilhos, centro, analógicos, direcional), e é
 * exatamente a ordem dos índices 0-15 do mapeamento "standard" da Gamepad API
 * já documentada em `ControllerTestScreen.tsx` (`BTN`). Reordenar aqui muda a
 * experiência da tela; não muda o índice cru gravado como `button`, que vem
 * do controle e não desta lista.
 */

export interface ControllerBindingTarget {
  /** Identidade da posição física — também sufixo da chave de texto
   *  (`target_faceBottom` etc.) na tela de configuração. */
  id: string;
  /** Chave em `CONTROLLER_SPOTS` (lib/controllerRegions.ts). Os cliques de
   *  analógico não têm spot próprio: a foto só tem a região do analógico
   *  inteiro, e destacá-la é o suficiente para dizer "aperte aqui". */
  spotId: string;
  /** Nome da ação por adapter. Um adapter ausente aqui simplesmente não
   *  recebe escrita para esta posição — é assim que um adapter futuro entra
   *  sem quebrar nada. */
  actionsByAdapter: Record<string, string>;
}

export const CONTROLLER_BINDING_TARGETS: ControllerBindingTarget[] = [
  { id: "faceBottom", spotId: "faceBottom", actionsByAdapter: { pcsx2: "Cross", retroarch: "b" } },
  { id: "faceRight", spotId: "faceRight", actionsByAdapter: { pcsx2: "Circle", retroarch: "a" } },
  { id: "faceLeft", spotId: "faceLeft", actionsByAdapter: { pcsx2: "Square", retroarch: "y" } },
  { id: "faceTop", spotId: "faceTop", actionsByAdapter: { pcsx2: "Triangle", retroarch: "x" } },
  { id: "shoulderLeft", spotId: "shoulderLeft", actionsByAdapter: { pcsx2: "L1", retroarch: "l" } },
  { id: "shoulderRight", spotId: "shoulderRight", actionsByAdapter: { pcsx2: "R1", retroarch: "r" } },
  { id: "triggerLeft", spotId: "triggerLeft", actionsByAdapter: { pcsx2: "L2", retroarch: "l2" } },
  { id: "triggerRight", spotId: "triggerRight", actionsByAdapter: { pcsx2: "R2", retroarch: "r2" } },
  { id: "select", spotId: "select", actionsByAdapter: { pcsx2: "Select", retroarch: "select" } },
  { id: "start", spotId: "start", actionsByAdapter: { pcsx2: "Start", retroarch: "start" } },
  { id: "stickLeftClick", spotId: "leftStick", actionsByAdapter: { pcsx2: "L3", retroarch: "l3" } },
  { id: "stickRightClick", spotId: "rightStick", actionsByAdapter: { pcsx2: "R3", retroarch: "r3" } },
  { id: "dpadUp", spotId: "dpadUp", actionsByAdapter: { pcsx2: "Up", retroarch: "up" } },
  { id: "dpadDown", spotId: "dpadDown", actionsByAdapter: { pcsx2: "Down", retroarch: "down" } },
  { id: "dpadLeft", spotId: "dpadLeft", actionsByAdapter: { pcsx2: "Left", retroarch: "left" } },
  { id: "dpadRight", spotId: "dpadRight", actionsByAdapter: { pcsx2: "Right", retroarch: "right" } },
];
