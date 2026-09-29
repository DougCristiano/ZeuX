import type { Dict } from "../i18n/i18n";

// Faixa de progresso dos primeiros passos nas telas aonde a lista leva
// (FirstStepsBanner). Os títulos dos passos são os mesmos da lista
// (FirstStepsChecklist.i18n.ts) — repetidos aqui por serem frases curtas, e
// para esta faixa não depender do dicionário de outro componente.
export const dict = {
  kicker: { "pt-BR": "Primeiros passos · {{done}} de {{total}}", en: "Getting started · {{done}} of {{total}}" },
  folder: { "pt-BR": "Aponte a pasta dos seus jogos", en: "Point to your games folder" },
  emulator: { "pt-BR": "Deixe um console pronto", en: "Get one console ready" },
  play: { "pt-BR": "Abra seu primeiro jogo", en: "Open your first game" },
  hereFolder: {
    "pt-BR": "Escolha abaixo a pasta onde seus jogos já estão. Quando terminar, a faixa avisa o próximo passo.",
    en: "Pick below the folder where your games already are. When you're done, this bar shows the next step.",
  },
  hereEmulator: {
    "pt-BR": "Resolva abaixo o que falta para este console. Quando ele ficar pronto, a faixa avisa o próximo passo.",
    en: "Fix below what this console still needs. Once it's ready, this bar shows the next step.",
  },
  done: { "pt-BR": "Feito: {{step}}.", en: "Done: {{step}}." },
  next: { "pt-BR": "Próximo passo: {{step}}.", en: "Next step: {{step}}." },
  continue: { "pt-BR": "Continuar primeiros passos", en: "Continue getting started" },
  seeAll: { "pt-BR": "Ver todos os passos", en: "See all steps" },
} satisfies Dict;
