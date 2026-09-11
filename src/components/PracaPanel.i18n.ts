import type { Dict } from "../i18n/i18n";

export const dict = {
  label: { "pt-BR": "A Praça", en: "The Square" },
  title: { "pt-BR": "A Praça", en: "The Square" },
  status: { "pt-BR": "Ainda não está no ar", en: "Not live yet" },
  intro: {
    "pt-BR":
      "A camada social do ZeuX ainda não existe: não há ninguém aqui, nem servidor para onde mandar nada. Quando existir, é aqui que o que a galera compartilha vai aparecer.",
    en: "ZeuX's social layer does not exist yet: nobody is here, and there is no server to send anything to. When it exists, this is where what people share will show up.",
  },
  previewLabel: { "pt-BR": "Prévia do formato — sem gente de verdade ainda", en: "Format preview — no real people yet" },
  kindSave: { "pt-BR": "SAVE STATE", en: "SAVE STATE" },
  kindSaveDesc: {
    "pt-BR": "Alguém compartilha o ponto salvo logo antes de um chefe difícil.",
    en: "Someone shares a save right before a hard boss.",
  },
  kindTexture: { "pt-BR": "TEXTURE PACK", en: "TEXTURE PACK" },
  kindTextureDesc: {
    "pt-BR": "Texturas em alta resolução publicadas para um jogo do seu acervo.",
    en: "High-resolution textures published for a game in your library.",
  },
  kindController: { "pt-BR": "PERFIL DE CONTROLE", en: "CONTROLLER PROFILE" },
  kindControllerDesc: {
    "pt-BR": "Um mapeamento pronto para o mesmo modelo de controle que você cadastrou.",
    en: "A ready mapping for the same controller model you registered.",
  },
  kindNetplay: { "pt-BR": "NETPLAY", en: "NETPLAY" },
  kindNetplayDesc: {
    "pt-BR": "Um lobby aberto com vagas, para jogar junto.",
    en: "An open lobby with free slots, to play together.",
  },
  legal: {
    "pt-BR": "Na Praça circulam saves, texturas e perfis de controle. Os jogos ficam no seu disco e nunca saem dele.",
    en: "The Square carries saves, textures and controller profiles. Games stay on your disk and never leave it.",
  },
} satisfies Dict;
