import type { Dict } from "../i18n/i18n";

export const dict = {
  seeAll: { "pt-BR": "Ver os {{count}}", en: "See all {{count}}" },
  emptyTitle: { "pt-BR": "Esta prateleira ainda está vazia.", en: "This shelf is still empty." },
  // Legal (CLAUDE.md, princípio 6): a frase diz de onde os jogos vêm — do
  // disco do próprio usuário — e nunca sugere origem nem transferência.
  emptyMessage: {
    "pt-BR":
      "Aponte a pasta onde os jogos deste console já estão no seu disco e eles aparecem aqui. O ZeuX só lê o que está na sua máquina — nada é baixado, copiado ou enviado.",
    en: "Point to the folder where this console's games already sit on your disk and they show up here. ZeuX only reads what is on your machine — nothing is downloaded, copied or sent.",
  },
  chooseFolder: { "pt-BR": "Escolher pasta", en: "Choose a folder" },
} satisfies Dict;
