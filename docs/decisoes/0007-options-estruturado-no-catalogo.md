# 0007 — `options` estruturado no catálogo, ao lado do texto

**Status:** Aceito (elevou o `schema_version` do catálogo de 1 para 2)

## Contexto

O catálogo `internal/verdict/data/consoles.json` descreve, para cada console,
patamares de qualidade com o emulador e a configuração recomendada. Na primeira
versão do esquema, essa configuração existia apenas como prosa:

```json
{
  "level": "otimo",
  "emulator": "DuckStation",
  "preset": "Resolução interna 8x (4K), correção de perspectiva de texturas"
}
```

Bonito de ler e **absolutamente inaplicável**. Nenhum código consegue derivar
`internal_scale: 8` de uma frase em português sem interpretar texto livre — o
tipo de coisa que quebra na primeira vez que alguém reescreve a frase.

O resultado seria um app que *diz* qual configuração usar e deixa o usuário
configurá-la à mão. Exatamente a complexidade que o ZeuX existe para eliminar.

## Decisão

Cada tier carrega **as duas formas**, lado a lado:

```json
{
  "level": "otimo",
  "emulator": "DuckStation",
  "adapter_id": "duckstation",
  "preset": "Resolução interna 8x (4K), correção de perspectiva de texturas",
  "options": {
    "fullscreen": true,
    "internal_scale": 8,
    "renderer": "vulkan",
    "exit_on_close": true
  },
  "requires": { "logical_cores": 4, "clock_mhz": 3000, "ram_gib": 8, "vram_gib": 2 }
}
```

`preset` é o que o usuário lê. `options` é o que o emulador obedece. **Os dois
precisam contar a mesma história.**

O campo `options` desserializa direto em `emulator.Options` — a mesma struct que
o `BuildCommand` consome. Isso cria uma dependência de `verdict` sobre
`emulator`, deliberada e unidirecional.

Também foram separados `emulator` (nome de exibição, que pode incluir o core:
`"RetroArch (core Mesen)"`) e `adapter_id` (a chave que o registry entende).
O nome mostrado ao usuário não serve como chave.

## Consequências

**Positivas**

- **A autoconfiguração passa a existir de fato.** `Server.toInput` copia
  `Options` do veredito quando a requisição não manda nenhuma; quem não escolhe
  nada recebe o preset adequado ao hardware.
- A API devolve `options` no veredito, então a interface pode exibir os valores
  ou lançar com eles sem reinterpretar texto.
- Testes de integração podem cobrar coerência: `TestEveryTierHasApplicableOptions`
  exige `fullscreen` e `exit_on_close` em todo tier;
  `TestBetterTiersDoNotDowngradeSettings` impede que um patamar melhor use
  escala menor que um pior.
- `TestEveryTierPointsToAKnownAdapter` garante que nenhum tier sugira um
  emulador que o ZeuX não sabe lançar — sugerir seria uma promessa que o app não
  cumpre na hora de abrir o jogo.

**Negativas / custos aceitos**

- **Texto e `options` podem divergir sem nada detectar.** Um `preset` dizendo
  "Resolução interna 4x" ao lado de `"internal_scale": 2` passaria em todos os
  testes. É uma inconsistência que só revisão humana pega.
- O catálogo ficou verboso: 13 consoles × 2–3 tiers, cada um com preset,
  options e requires.
- `verdict` passou a depender de `emulator`. Aceitável enquanto a dependência
  for unidirecional; se algum dia `emulator` precisar de `verdict`, há um
  problema de desenho a resolver antes.
- Nem toda `option` é aplicável em todo emulador — daí o
  [ADR 0006](0006-campo-unapplied.md). O catálogo descreve a **intenção**; o
  adapter decide o que consegue cumprir.

## Nota sobre os `requires`

Os limiares de hardware em `requires` (núcleos, clock, RAM, VRAM) são
**estimativas escritas a partir de conhecimento geral, não de medição**. Nenhum
foi calibrado contra desempenho real. Isso não é parte desta decisão, mas é uma
propriedade do mesmo arquivo e está registrado no [roadmap](../roadmap.md).
