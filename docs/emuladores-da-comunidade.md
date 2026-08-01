# Emuladores da comunidade

Duas formas de o ZeuX ir além da lista de fábrica. A primeira já funciona; a
segunda está desenhada, não implementada.

## 1. Cadastro manual — implementado

Qualquer pessoa pode apontar um executável arbitrário, com quaisquer
argumentos, para qualquer sistema — inclusive consoles que o catálogo do ZeuX
nem conhece.

### Como funciona

As definições vivem em `custom_emulators.json`, no diretório de configuração do
usuário (`%APPDATA%\ZeuX` no Windows, `~/.config/ZeuX` no Linux,
`~/Library/Application Support/ZeuX` no macOS). O arquivo é editável à mão — a
rota `GET /api/v1/custom-emulators` devolve o caminho dele justamente para
quem prefere o editor de texto à interface.

```json
[
  {
    "id": "meu-emu-msx",
    "name": "Meu Emulador de MSX",
    "consoles": ["msx"],
    "binary_path": "D:\\Emuladores\\openMSX\\openmsx.exe",
    "args": ["-machine", "Philips_NMS_8250", "{rom}"],
    "notes": "Build de 2026-07; a versão do site trava no Metal Gear"
  }
]
```

### Placeholders

| Placeholder | Vira |
|---|---|
| `{rom}` | Caminho do jogo. **Obrigatório** |
| `{scale}` | Multiplicador de resolução interna do preset |
| `{renderer}` | Backend gráfico do preset (`vulkan`, `opengl`, `d3d12`, `software`) |

Qualquer outro texto passa literalmente. A ordem dos argumentos é exatamente a
que você escrever.

### O que é validado, e o que não é

Só quatro coisas são exigidas, todas porque sem elas a definição não teria como
executar: `id`, `name`, `binary_path`, ao menos um console, e `{rom}` em algum
lugar dos argumentos.

O que **não** é verificado, de propósito:

- **O console não precisa existir no catálogo.** Cadastre `msx`, `amiga`,
  `zx-spectrum` ou o que quiser.
- **O emulador não precisa ser conhecido.** Nenhuma lista de permitidos.
- **O binário não precisa parecer um executável.** O caminho que você informou
  é o caminho que será usado, sem heurística de permissão ou extensão.
- **Os argumentos não são inspecionados.** Se o emulador aceita, o ZeuX manda.

### Substituindo um emulador de fábrica

Uma definição com o mesmo `id` de um adapter embutido tem precedência sobre
ele. É como usar um fork, um build de desenvolvimento ou uma versão antiga no
lugar do que o ZeuX traz:

```json
{
  "id": "dolphin",
  "name": "Dolphin (build de dev)",
  "consoles": ["gamecube", "wii"],
  "binary_path": "D:\\Builds\\dolphin-dev\\Dolphin.exe",
  "args": ["-b", "-e", "{rom}"]
}
```

Apagar a definição faz o embutido voltar sozinho.

### Rotas

| Método | Rota |
|---|---|
| GET | `/api/v1/custom-emulators` |
| POST | `/api/v1/custom-emulators` |
| DELETE | `/api/v1/custom-emulators/{id}` |

As rotas ficam num prefixo próprio, e não sob `/emulators/`, porque `custom`
colidiria com o `{id}` de `/emulators/{id}/install`: o roteador do Go recusa
registrar padrões em que `/emulators/custom/install` casaria com os dois.

Uma definição inválida não derruba as outras: ela é ignorada, o motivo vai para
o log, e o resto continua funcionando. Quem editou o JSON à mão e errou numa
entrada não perde as demais.

## 2. Sugestões da comunidade — desenhado, não implementado

O cadastro manual resolve o problema de **uma** pessoa. O que ele não faz é
transformar esse esforço em benefício coletivo: quem descobriu os argumentos
certos para um emulador obscuro não tem como poupar esse trabalho de quem vier
depois.

### Fluxo proposto

1. A pessoa cadastra o emulador manualmente e o usa até ficar satisfeita.
2. A interface oferece **"sugerir este emulador para a comunidade"**, enviando
   a definição (sem o `binary_path`, que é específico da máquina dela) para a
   API de nuvem.
3. Sugestões acumulam confirmações de outros usuários que reproduziram o mesmo
   resultado.
4. Ao passar de um limiar, a definição entra no dicionário de emuladores
   distribuído por nuvem — o mesmo canal que atualizará o `consoles.json`.
5. O ZeuX passa a sugerir o emulador nativamente, com crédito a quem propôs.

### Por que isso encaixa no que já existe

A infraestrutura necessária é a mesma do sistema de compatibilidade estilo
ProtonDB previsto no PRD: envio de contribuição, confirmação por pares,
reputação, moderação. Construir os dois separadamente seria duplicar trabalho —
as sugestões de emulador são, na prática, mais um tipo de contribuição no mesmo
canal.

### Pontos a decidir antes de implementar

- **Moderação.** Uma definição da comunidade executa um binário na máquina de
  quem a instala. O `binary_path` nunca deve vir da nuvem; só o nome do
  emulador, os argumentos e o link oficial de download. Aceitar caminho de
  binário vindo de fora seria um vetor de execução arbitrária.
- **Verificação de origem.** O download precisa apontar para o repositório
  oficial do emulador, com soma de verificação — não para um espelho qualquer
  sugerido por um usuário.
- **Limiar de confirmações.** Quantas pessoas precisam confirmar antes de a
  sugestão virar padrão, e o que fazer quando duas sugestões conflitam para o
  mesmo emulador.
- **Escopo legal.** Vale a mesma regra do resto do projeto: sugerir e
  configurar emuladores é legítimo; distribuir ou apontar para ROMs, não.

### Dependências

Depende da API de nuvem, que depende da decisão de banco de dados — hoje
adiada de propósito. Ver [ADR 0002](decisoes/0002-adiar-banco-de-dados.md).
