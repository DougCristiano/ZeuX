import type { Dict } from "../i18n/i18n";

// Trilho guiado de instalação manual (2026-09-09). Emuladores de fonte
// "manual" (RetroArch, Dolphin) não são distribuídos por releases que o ZeuX
// consiga resolver por API — o usuário baixa, extrai e coloca no lugar. Este
// texto guia esse percurso em passos numerados, sem tirar a pessoa da tela.
export const dict = {
  heading: { "pt-BR": "Instalação manual", en: "Manual install" },
  intro: {
    "pt-BR":
      "O ZeuX não instala o {{name}} sozinho. Siga os passos abaixo — leva um minuto e você não precisa sair desta tela.",
    en: "ZeuX can't install {{name}} on its own. Follow the steps below — it takes a minute and you don't have to leave this screen.",
  },
  step1Title: { "pt-BR": "1. Baixe o {{name}}", en: "1. Download {{name}}" },
  step1Body: {
    "pt-BR": "Abra o site oficial e baixe a versão para o seu sistema.",
    en: "Open the official site and download the build for your system.",
  },
  openSite: { "pt-BR": "Abrir o site oficial", en: "Open the official site" },
  step2Title: {
    "pt-BR": "2. Coloque os arquivos na pasta do ZeuX",
    en: "2. Put the files in the ZeuX folder",
  },
  step2Body: {
    "pt-BR":
      "Extraia (ou instale) o {{name}} nesta pasta. É onde o ZeuX procura primeiro — colar aqui sempre funciona.",
    en: "Extract (or install) {{name}} into this folder. It's where ZeuX looks first — putting it here always works.",
  },
  openFolder: { "pt-BR": "Abrir a pasta de destino", en: "Open the destination folder" },
  step3Title: { "pt-BR": "3. Confirme", en: "3. Confirm" },
  step3Body: {
    "pt-BR": "Quando terminar, clique aqui para o ZeuX procurar o {{name}} de novo.",
    en: "When you're done, click here for ZeuX to look for {{name}} again.",
  },
  recheck: { "pt-BR": "Verificar de novo", en: "Check again" },
  rechecking: { "pt-BR": "Verificando…", en: "Checking…" },
  found: {
    "pt-BR": "Encontrado. O {{name}} já está pronto para uso.",
    en: "Found it. {{name}} is ready to use.",
  },
  notFound: {
    "pt-BR":
      "Ainda não encontrei o {{name}} nessa pasta. Confira se a extração colocou o executável direto ali (ou numa subpasta) e tente de novo.",
    en: "Still can't find {{name}} in that folder. Check that the executable landed there (or in a subfolder) and try again.",
  },
  errorOpeningFolder: {
    "pt-BR": "Não foi possível abrir a pasta: {{error}}",
    en: "Could not open the folder: {{error}}",
  },
} satisfies Dict;
