import type { Dict } from "../i18n/i18n";

// Tour de primeira execução (O1, docs/pendencias.md). Quatro telas de
// apresentação, uma por pilar do produto (docs/visao-do-produto.md), exibidas
// depois do scan e antes da primeira tela do app. Toda legenda vem daqui —
// as ilustrações são arte esquemática sem texto embutido, de propósito
// (print real envelhece a cada redesenho e dobraria por idioma).
export const dict = {
  // Lido só por leitor de tela: anuncia o que é a sobreposição.
  srHeading: {
    "pt-BR": "Apresentação do ZeuX",
    en: "ZeuX walkthrough",
  },
  stepLabel: {
    "pt-BR": "{{current}} de {{total}}",
    en: "{{current}} of {{total}}",
  },
  skip: { "pt-BR": "Pular", en: "Skip" },
  back: { "pt-BR": "Voltar", en: "Back" },
  next: { "pt-BR": "Próximo", en: "Next" },
  done: { "pt-BR": "Começar", en: "Get started" },

  s1Kicker: { "pt-BR": "Autoconfiguração", en: "Auto-setup" },
  s1Title: {
    "pt-BR": "O ZeuX configura o emulador por você",
    en: "ZeuX sets up the emulator for you",
  },
  s1Body: {
    "pt-BR":
      "Você aponta o jogo. O ZeuX lê o hardware desta máquina, escolhe o emulador e ajusta o preset — sem você abrir menu de emulador nenhum.",
    en:
      "You point to the game. ZeuX reads this machine's hardware, picks the emulator and tunes the preset — without you opening a single emulator menu.",
  },

  s2Kicker: { "pt-BR": "Parecer honesto", en: "Honest verdict" },
  s2Title: {
    "pt-BR": "Ele diz o que esta máquina alcança",
    en: "It tells you what this machine can reach",
  },
  s2Body: {
    "pt-BR":
      "Nada de nota vaga. O ZeuX mostra os números e nomeia o componente que segura um patamar melhor. A decisão de seguir mesmo assim continua sua.",
    en:
      "No vague score. ZeuX shows the numbers and names the component holding back a better tier. Choosing to go ahead anyway is still up to you.",
  },

  s3Kicker: { "pt-BR": "Sua biblioteca", en: "Your library" },
  s3Title: {
    "pt-BR": "As ROMs são suas e ficam onde estão",
    en: "Your ROMs are yours and stay put",
  },
  s3Body: {
    "pt-BR":
      "Você aponta as pastas que já tem no disco. O ZeuX só lê o conteúdo para montar a biblioteca — não move, não copia e não baixa nada.",
    en:
      "You point to the folders already on your disk. ZeuX only reads them to build the library — it doesn't move, copy or download anything.",
  },

  s4Kicker: { "pt-BR": "Camada social", en: "Social layer" },
  s4Title: {
    "pt-BR": "Compartilhe o que ajuda a jogar",
    en: "Share what helps you play",
  },
  s4Body: {
    "pt-BR":
      "Save states, texture packs, perfis de controle e lobby de netplay circulam entre jogadores. O jogo em si — a ROM — nunca: o ZeuX não distribui nem transfere ROM.",
    en:
      "Save states, texture packs, controller profiles and netplay lobbies move between players. The game itself — the ROM — never does: ZeuX doesn't distribute or transfer ROMs.",
  },
} satisfies Dict;
