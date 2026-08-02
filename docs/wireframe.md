# Wireframe de estrutura

Item **B-wire** do [plano da Sprint B](sprint-b-plano.md). O arquivo vivia só
numa sessão de IA e nunca tinha sido versionado — isto materializa o que já
tinha sido decidido, sem reabrir o desenho.

**Abrir:** [`wireframe.html`](wireframe.html) — HTML autocontido, sem
dependência externa. Abre em qualquer navegador, direto do arquivo. Navegue
pelas abas ou por `←`/`→`; o botão "Anotações" alterna entre ver as regras de
produto anotadas e ver só a estrutura limpa.

Propositalmente **sem cor, ícone ou tipografia escolhida** — isso é decisão do
item B7 (layout visual), não deste. O que este arquivo fixa é a ordem das
telas, o que aparece em cada uma, e onde uma regra de produto encosta no
layout a ponto de não poder ser perdida no redesenho.

---

## As 9 telas

| # | Tela | O que ela prova |
|---|---|---|
| 01 | Consentimento | Nada é lido da máquina antes daqui. "Agora não" leva a um app utilizável. |
| 02 | Leitura do hardware | O que não pôde ser lido aparece como estado normal, não como erro escondido. |
| 03 | Parecer por console | A tela que justifica o produto: números sem julgamento, gargalo nomeado, `parcial` visível. |
| 04 | Biblioteca vazia | Nenhum caminho de obtenção de ROM — nem link, nem "saiba mais". Um cartão por console, não um botão único. |
| — | BIOS necessário | Jogo listado mas desabilitado nomeia exatamente a peça que falta — nunca "indisponível" sem dizer por quê. |
| 05 | Biblioteca com jogos | `Unapplied` aparece como aviso; sem scraper no MVP — capa é placeholder por console, título vem do nome do arquivo. |
| — | Instalar ao jogar | "Jogar" resolve a instalação do emulador inline, sem sair da biblioteca — a tela de Emuladores vira atalho, não passo obrigatório. |
| 06 | Emuladores | Distingue gerenciado (ZeuX instalou) de manual (usuário já tinha); cadastro manual sem trava. |
| 07 | Instalar com ressalva | "Instalar mesmo assim" é a ação primária — informar, não bloquear. |

As duas telas sem número (BIOS necessário, Instalar ao jogar) vieram da
rodada de mapeamento de fluxo de 2026-08-02 (fluxo completo "do zero ao
primeiro jogo", discutido antes deste wireframe ser atualizado). Não herdam
número porque encaixam entre as telas 04–07 originais do B7 sem renumerar o
que já estava versionado.

## Onde cada regra de produto não-negociável encosta

Retirado das anotações âmbar do próprio arquivo — a referência rápida é aqui,
o texto completo (e o porquê) está anotado na tela correspondente:

| Regra | Tela(s) |
|---|---|
| Consentimento verificado no servidor; `policy_text` vem da API | 01 |
| Consentimento versionado (`PolicyVersion`) | 01 |
| Dado não lido é declarado, nunca fingido | 02 |
| Texto descritivo, nunca julgador | 03 |
| Nomear o componente que barra (`bottlenecks`) | 03 |
| `precision: "parcial"` visível, nunca escondido | 03 |
| Nunca facilitar obtenção de ROM | 04, 05 |
| Nunca facilitar obtenção de BIOS/firmware (mesmo risco legal das ROMs) | BIOS necessário |
| Nomear o componente que falta (também vale fora do parecer) | 03, BIOS necessário |
| `Unapplied` exibido — o que não foi aplicado, o usuário sabe | 05 |
| Gerenciado × instalação do usuário nunca se confundem | 06 |
| Informar, não bloquear | 07, Instalar ao jogar |
| Foco como estado de primeira classe; nenhuma ação só em hover ou só em clique direito ([ADR 0009](decisoes/0009-desktop-agora-controle-depois.md)) | todas — visível no contorno de foco em 01, 04 e 05 |

## Decisões do B7 (fechadas em 2026-08-01)

- **Escala de 33 consoles (tela 03):** `otimo`/`bom`/`limitado` empilhados e
  sempre visíveis; `improvavel` atrás de um `<details>` nativo colapsado por
  padrão — nunca escondido de verdade. Ver detalhe e critério de aceite em
  [`sprint-b-plano.md`](sprint-b-plano.md), item B7.
- **Tela 02 (leitura) não sobrevive como etapa própria** — vira estado de
  carregamento dentro do fluxo da tela 03. O scan é rápido demais para
  justificar uma parada de navegação própria.

## Decisões da rodada de biblioteca (fechadas em 2026-08-02)

Vieram do mapeamento de fluxo "do zero ao primeiro jogo", antes de tocar
neste arquivo:

- **Adicionar jogo é por pasta, não por arquivo avulso.** Tela 04 virou um
  cartão por console, cada um com seu próprio "apontar pasta" — não um botão
  genérico que exigiria adivinhar de qual console é cada arquivo achado.
- **Pré-instalar emulador continua existindo, mas deixou de ser obrigatório.**
  A tela 06 (Emuladores) é atalho; a tela nova "Instalar ao jogar" cobre quem
  pulou direto para a biblioteca — clicar em "Jogar" sem o emulador instalado
  dispara o mesmo fluxo 1-click, inline.
- **Sem scraper de metadados no MVP.** Tela 05: capa é placeholder por
  console (não por jogo), título vem do nome do arquivo. Metadado real
  (IGDB/ScreenScraper) fica para depois do MVP provado — ver `roadmap.md`,
  Sprint D.
- **BIOS entra no MVP.** Console que exige BIOS e não tem o arquivo
  configurado lista os jogos desabilitados, com aviso nomeando exatamente a
  peça que falta — mesma regra do parecer (tela 03), e mesma regra legal das
  ROMs: o ZeuX só aponta para um arquivo que já existe no disco, nunca sugere
  fonte.
- **A pasta de jogos guarda referência ao caminho da ROM, nunca uma cópia**
  — resolve a pendência aberta em [ADR 0010](decisoes/0010-estrutura-de-diretorios-por-console.md).

## O que ainda é decisão em aberto

- Onde o painel de detalhe do jogo (tela 05) fica — fixo embaixo, lateral, ou
  sobreposto. Pertence à Sprint D (biblioteca), fora do escopo da Sprint B.
- Banco de dados: sem ele, não há onde persistir o que a varredura de pasta
  encontrou. Precisa reabrir [ADR 0002](decisoes/0002-adiar-banco-de-dados.md)
  antes de qualquer implementação de back-end da biblioteca.
- Catálogo de qual BIOS cada console exige (nome de arquivo esperado,
  tamanho/hash para validar) — ainda não existe em lugar nenhum do código.
