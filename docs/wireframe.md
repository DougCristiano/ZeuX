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

## As 7 telas

| # | Tela | O que ela prova |
|---|---|---|
| 01 | Consentimento | Nada é lido da máquina antes daqui. "Agora não" leva a um app utilizável. |
| 02 | Leitura do hardware | O que não pôde ser lido aparece como estado normal, não como erro escondido. |
| 03 | Parecer por console | A tela que justifica o produto: números sem julgamento, gargalo nomeado, `parcial` visível. |
| 04 | Biblioteca vazia | Nenhum caminho de obtenção de ROM — nem link, nem "saiba mais". |
| 05 | Biblioteca com jogos | `Unapplied` aparece como aviso; capas vêm de metadados, nunca do jogo. |
| 06 | Emuladores | Distingue gerenciado (ZeuX instalou) de manual (usuário já tinha); cadastro manual sem trava. |
| 07 | Instalar com ressalva | "Instalar mesmo assim" é a ação primária — informar, não bloquear. |

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
| `Unapplied` exibido — o que não foi aplicado, o usuário sabe | 05 |
| Gerenciado × instalação do usuário nunca se confundem | 06 |
| Informar, não bloquear | 07 |
| Foco como estado de primeira classe; nenhuma ação só em hover ou só em clique direito ([ADR 0009](decisoes/0009-desktop-agora-controle-depois.md)) | todas — visível no contorno de foco em 01, 04 e 05 |

## O que ainda é decisão em aberto (fica para o B7)

- Como a lista de 33 consoles escala na tela 03 além de cartão empilhado.
- Se a tela 02 (leitura) sobrevive como etapa própria ou vira um estado dentro
  da tela 03, dependendo de quão rápido o scan realmente é.
- Onde o painel de detalhe do jogo (tela 05) fica — fixo embaixo, lateral, ou
  sobreposto.
