import type { Dict } from "../i18n/i18n";

export const dict = {
  specifications: { "pt-BR": "Especificações", en: "Specifications" },
  system: { "pt-BR": "Sistema", en: "System" },
  processor: { "pt-BR": "Processador", en: "Processor" },
  memory: { "pt-BR": "Memória", en: "Memory" },
  gpuCard: { "pt-BR": "Placa de vídeo", en: "Video Card" },
  display: { "pt-BR": "Tela", en: "Display" },
  platform: { "pt-BR": "Plataforma", en: "Platform" },
  version: { "pt-BR": "Versão", en: "Version" },
  architecture: { "pt-BR": "Arquitetura", en: "Architecture" },
  model: { "pt-BR": "Modelo", en: "Model" },
  vendor: { "pt-BR": "Fabricante", en: "Vendor" },
  physicalCores: { "pt-BR": "Núcleos físicos", en: "Physical cores" },
  logicalCores: { "pt-BR": "Núcleos lógicos", en: "Logical cores" },
  baseClock: { "pt-BR": "Clock-base", en: "Base clock" },
  total: { "pt-BR": "Total", en: "Total" },
  available: { "pt-BR": "Disponível", en: "Available" },
  vram: { "pt-BR": "Memória de vídeo", en: "Video memory" },
  type: { "pt-BR": "Tipo", en: "Type" },
  driver: { "pt-BR": "Driver", en: "Driver" },
  readingSource: { "pt-BR": "Fonte da leitura", en: "Source" },
  resolution: { "pt-BR": "Resolução", en: "Resolution" },
  refreshRate: { "pt-BR": "Taxa", en: "Rate" },
  output: { "pt-BR": "Saída", en: "Output" },
  primary: { "pt-BR": "Principal", en: "Primary" },
  unknown: { "pt-BR": "desconhecido", en: "unknown" },
  integrated: { "pt-BR": "integrada", en: "integrated" },
  dedicated: { "pt-BR": "dedicada", en: "dedicated" },
  yes: { "pt-BR": "sim", en: "yes" },
  gpuNotIdentified: {
    "pt-BR": "Nenhuma placa de vídeo foi identificada nesta leitura.",
    en: "No video card was identified in this scan.",
  },
  displayNotIdentified: {
    "pt-BR": "Nenhum monitor foi identificado nesta leitura.",
    en: "No display was identified in this scan.",
  },
  hardwareWarnings: {
    "pt-BR": "Avisos da leitura de hardware",
    en: "Hardware scan warnings",
  },
  partialPrecision: {
    "pt-BR": "Nem tudo pôde ser lido desta máquina — o parecer abaixo é uma estimativa.",
    en: "Not everything could be read from this machine — the verdict below is an estimate.",
  },
  loadingHardware: { "pt-BR": "Lendo hardware…", en: "Loading hardware…" },
  errorLoadingHardware: {
    "pt-BR": "Não foi possível ler o hardware.",
    en: "Could not load hardware information.",
  },
  hz: { "pt-BR": "Hz", en: "Hz" },
  // Achado real, 2026-09-08 (relato do Douglas): quem recusa o consentimento
  // podia acessar esta tela através da navegação normal e via um `report!`
  // forçado — nunca deveria ter chegado aqui sem consentimento. Em vez de
  // travar, mostra por que o parecer não existe e como resolver (regra 4 do
  // CLAUDE.md: dado que não pôde ser lido é declarado desconhecido, nunca
  // escondido).
  noReadingHeading: {
    "pt-BR": "Sem leitura de hardware",
    en: "No hardware reading",
  },
  noReadingDescription: {
    "pt-BR": "Você optou por não autorizar a leitura deste computador. Sem essa leitura, o ZeuX não tem como calcular especificações nem o parecer de compatibilidade por console.",
    en: "You chose not to authorize reading this computer. Without this reading, ZeuX cannot compute specifications or the per-console compatibility verdict.",
  },
  authorizeNow: { "pt-BR": "Autorizar agora", en: "Authorize now" },
} satisfies Dict;
