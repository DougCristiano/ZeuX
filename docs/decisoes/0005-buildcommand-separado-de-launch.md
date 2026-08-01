# 0005 — Separar `BuildCommand` de `Launch`

**Status:** Aceito

## Contexto

Cada emulador tem sua própria gramática de linha de comando. Traduzir um preset
do ZeuX (tela cheia, escala interna 4x, backend Vulkan, encerrar junto com o
jogo) nos argumentos certos de 8 emuladores diferentes é uma lógica cheia de
detalhes onde errar é fácil e caro: um argumento fora de ordem faz o emulador
tratar a ROM como opção; uma flag inexistente faz ele recusar a abrir.

O desenho ingênuo seria uma única função `Run(adapter, request)` que monta e
executa. Só que **nenhum emulador está instalado na máquina de
desenvolvimento**. Com esse desenho, a única forma de verificar a tradução seria
instalar 8 emuladores e abrir jogos de verdade a cada mudança.

## Decisão

Partir a responsabilidade em dois:

```go
// Função PURA. Não toca o sistema de arquivos, não executa nada.
BuildCommand(install Installation, req Request) (Command, error)

// O que de fato toca o sistema.
Launcher.Launch(ctx, input) (*Session, error)
```

`BuildCommand` faz parte da interface `Adapter` e é implementada por cada
emulador. `Launch` vive no `Launcher`, é única, e chama `BuildCommand` como uma
de suas etapas.

## Consequências

**Positivas**

- `adapter_test.go` verifica os 8 adapters **sem nenhum emulador instalado**:
  ordem dos argumentos, posição da ROM, separador do PCSX2, pares `-C` do
  Dolphin, ausência de flags inventadas.
- A rota `POST /api/v1/games/preview` saiu praticamente de graça — é
  `BuildCommand` sem o `Launch`. Ela permite à interface mostrar exatamente o
  que será rodado, e diagnosticar configuração sem abrir jogo nenhum.
- A validação de ROM (`validateROM`) fica no `Launch`, onde faz sentido: o
  preview não precisa que o arquivo exista.
- Um adapter novo é apenas uma função de tradução; nada de execução de processo
  para escrever ou revisar.

**Negativas / custos aceitos**

- **Os testes provam a tradução, não a correção.** Que o ZeuX gere
  `-batch -fullscreen /roms/jogo.chd` não prova que o DuckStation aceita esses
  argumentos. Essa validação continua pendente para todos os 8 adapters e é o
  item de maior risco do projeto hoje — ver
  [roadmap.md](../roadmap.md#sprint-a--validação-dos-adapters-bloqueia-tudo).
- Duas etapas separadas podem divergir em produção: entre o `preview` e o
  `launch`, o binário pode ter sido movido ou o core desinstalado. O usuário
  veria um comando e outro rodaria. Aceitável — a janela é curta e o `launch`
  recalcula tudo.
- **A pureza é quebrada no RetroArch.** `retroArchAdapter.BuildCommand` lê o
  disco para localizar o arquivo do core, porque sem o caminho do core não há
  comando possível. É uma exceção consciente, documentada, e vale conhecer ao
  escrever testes.
