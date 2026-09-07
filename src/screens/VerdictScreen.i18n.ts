import type { Dict } from "../i18n/i18n";

export const dict = {
  specifications: { "pt-BR": "Especificações", en: "Specifications" },
  // Achado do critico-design (2026-09-06): a tela não tinha ScreenHeader —
  // o <h1> "Especificações" morava dentro da coluna esquerda, e a coluna
  // abria com um parágrafo de ressalva antes de qualquer título. `thisMachine`
  // é o novo SectionHeading da coluna, "Especificações" sobe pro cabeçalho
  // de tela cheia.
  thisMachine: { "pt-BR": "Esta máquina", en: "This machine" },
  estimateLabel: { "pt-BR": "estimativa", en: "estimate" },
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
  thresholdsNotCalibrated: {
    "pt-BR": "Os patamares abaixo são uma estimativa: os requisitos do catálogo ainda não foram medidos em hardware real.",
    en: "The thresholds below are an estimate: the catalog requirements have not yet been measured on real hardware.",
  },
  partialPrecision: {
    "pt-BR": "Nem tudo pôde ser lido desta máquina — o parecer abaixo é uma estimativa.",
    en: "Not everything could be read from this machine — the verdict below is an estimate.",
  },
  searchConsole: { "pt-BR": "Buscar console", en: "Search console" },
  searchConsolePlaceholder: {
    "pt-BR": "Buscar console…",
    en: "Search console…",
  },
  filterAll: { "pt-BR": "TODOS", en: "ALL" },
  noConsolesFound: {
    "pt-BR": "Nenhum console encontrado para \"{{search}}\".",
    en: "No consoles found for \"{{search}}\".",
  },
  loadingHardware: { "pt-BR": "Lendo hardware…", en: "Loading hardware…" },
  errorLoadingHardware: {
    "pt-BR": "Não foi possível ler o hardware.",
    en: "Could not load hardware information.",
  },
  hz: { "pt-BR": "Hz", en: "Hz" },
} satisfies Dict;
