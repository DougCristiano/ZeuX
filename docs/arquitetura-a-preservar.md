# Arquitetura a preservar

Este documento lista o que no ZeuX **não deve ser desfeito sem uma boa razão** —
as decisões que estão sustentando peso. Não é uma descrição de como o código é
hoje (isso está em [`arquitetura.md`](arquitetura.md)); é o contrato do que
precisa continuar verdadeiro amanhã.

Cada item traz **o que quebra se for desfeito**. Uma invariante sem consequência
declarada é só preferência de gosto, e não merece estar aqui.

Verificado contra o código em 2026-08-01.

---

## O objetivo que decide os empates: simples e leve

Quando duas soluções resolvem o mesmo problema, ganha a menor. Uma camada de
abstração a mais, um cache a mais, uma interface "para o futuro" — tudo isso é
peso, e peso é regressão. O ZeuX tem hoje ~7.000 linhas de Go e roda em um
processo só, sem banco. Isso é uma qualidade a defender, não um estágio a
superar.

**Não introduza abstração para um segundo caso que ainda não existe.** Espere o
segundo caso aparecer.

---

## 1. A direção das dependências

Verificado — o grafo é acíclico e raso:

```
                    cmd/zeuxd
                        │
                       api
        ┌───────┬───────┼────────┬─────────┐
     consent  hardware  verdict  install  emulator
                        │  │      │
                        │  └──────┼──> emulator
                        └─────────┴──> hardware
```

`emulator`, `hardware` e `consent` **não importam nada interno**. São folhas, e
devem continuar sendo.

**Regra:** `verdict` depende de `emulator`, **nunca** o contrário. O catálogo
carrega `emulator.Options` direto, e é isso que permite o parecer devolver um
preset já aplicável em vez de texto que a interface precisaria reinterpretar.

**O que quebra:** se `emulator` passar a precisar de `verdict`, vira ciclo — e o
ciclo é o sintoma, não a doença. A doença seria o adapter ter começado a decidir
política de produto, que é trabalho do `verdict`.

---

## 2. `BuildCommand` é pura

Não executa processo, não lê nem escreve disco, não consulta rede. Recebe
`Request`, devolve `Command`. A única exceção é o RetroArch, que precisa
localizar o arquivo do core — e ela é excepcional de propósito, documentada no
próprio adapter.

**O que quebra:** é o que torna os 14 adapters testáveis com **nada instalado**.
`internal/emulator/adapter_test.go` roda em qualquer máquina, em milissegundos,
sem baixar 200 MB de emulador. Assim que `BuildCommand` tocar o mundo, essa
suíte inteira vira teste de integração lento e frágil, e a cobertura cai na
prática mesmo que o número não caia.

---

## 3. Adicionar um emulador é escrever uma função

`standaloneAdapter` é uma struct com um campo `buildArgs func(Request) (opts,
romPart, unapplied []string)`. Um emulador novo é uma `newXyz()` e uma linha na
lista de `NewRegistry()`. Nenhum arquivo existente muda de forma.

**O que quebra:** o dia em que adicionar emulador exigir mexer no núcleo, o
catálogo para de crescer. Foi de 8 para 13 emuladores sem tocar em `registry.go`
além da lista — é esse custo marginal quase zero que precisa ser mantido.

A separação `opts` / `romPart` existe por um motivo concreto: os argumentos
extras do usuário entram **entre** os dois. Anexar no fim colocaria o extra
depois do separador `--` do PCSX2, onde viraria posicional em vez de flag.

---

## 4. O que não foi aplicado é declarado

Se o preset pede algo que o emulador não aceita por linha de comando, isso vai
para `Command.Unapplied` em português, pronto para exibir. Nunca é engolido.

**O que quebra:** o produto inteiro é uma promessa de honestidade sobre a
máquina do usuário. Um preset que diz ter aplicado resolução 4× e não aplicou é
a mesma categoria de mentira que dizer que o PC roda algo que ele não roda.
Ver [ADR 0006](decisoes/0006-campo-unapplied.md).

Corolário: **nunca invente flag**. Se a documentação ou o `--help` real não
descreve, ela não existe. Uma flag inexistente não degrada — o emulador recusa
abrir.

---

## 5. O jogo sobrevive à resposta HTTP

`session.go` inicia o processo do emulador com `context.Background()`, nunca com
o contexto da requisição.

**O que quebra:** amarrado ao contexto HTTP, o emulador morre segundos depois de
abrir, quando a resposta é enviada. É o tipo de bug que parece intermitente e
custa um dia para diagnosticar.

O mesmo vale para o instalador: `Manager.run` usa contexto próprio, porque o
download leva minutos e a requisição volta na hora.

---

## 6. Regra de produto é verificada no servidor

O consentimento é checado em `handleScan`, não na interface. O bloqueio por
hardware insuficiente vive em `hardwareBlocks`, no servidor, com `?force=true`
como escape explícito.

**O que quebra:** uma permissão que só a tela protege não é permissão. A API é
local e qualquer coisa consegue chamá-la — inclusive um `curl`, que é como este
projeto inteiro foi construído e testado.

---

## 7. Escrita em disco é atômica

`CustomStore.Save` grava em `.tmp` e faz `rename`. `Manager.promote` move a
instalação anterior para `.anterior` antes de colocar a nova, e só apaga depois
que deu certo.

**O que quebra:** uma queda de energia no meio de uma escrita direta deixa o
usuário sem os emuladores personalizados que ele configurou à mão, ou com uma
instalação pela metade no lugar de uma que funcionava.

---

## 8. Pacote que vem da internet é hostil até prova em contrário

Em `internal/install/`:

- `allowedHosts` é lista fixa; HTTPS obrigatório, revalidado a cada redirecionamento.
- `safeJoin` recusa qualquer entrada que escape do destino (zip slip).
- `maxExtractedBytes` limita a bomba de descompressão.
- O SHA-256 é sempre calculado; quando o projeto publica a soma, é conferida.

**O que quebra:** o ZeuX baixa binário da internet e executa. Sem isso, um
pacote adulterado escreve fora da pasta de instalação. As proteções têm teste de
regressão em `extract_test.go` — mantenha-os passando.

---

## 9. Dado de catálogo fica fora do código

`consoles.json` e `sources.json` são JSON embutido com `schema_version`. Emulador
novo, console novo ou padrão de asset que mudou são edições de dado, não de
lógica.

**O que quebra:** é o que vai permitir atualizar o catálogo pela nuvem sem
lançar versão nova do app. Se limiares e nomes de arquivo voltarem para dentro
do Go, essa porta fecha.

---

## 10. Erro é frase em português; `code` é para máquina

Erro de API tem `code` estável em inglês `snake_case` e `message` em português
já exibível. Falha de lançamento é **400, não 500** — é quase sempre algo que o
usuário resolve.

**O que quebra:** a interface passa a ter que traduzir e reinterpretar mensagem,
e a mensagem que o usuário lê deixa de ser a que o servidor escreveu.

---

## Orçamento de complexidade

O alvo é **O(n) ou melhor**. Onde isso não for possível, o comentário precisa
dizer por quê.

Regras práticas que evitam quase todos os casos:

| Padrão | Custo | Faça |
|---|---|---|
| `resultado += texto` em laço | O(n²) em bytes | `strings.Builder` |
| Mesmo diretório lido uma vez por item | O(itens × arquivos) | Leia uma vez, indexe, consulte |
| Varredura linear com `n` que cresce com o uso | O(n) por consulta | `map` |
| Recalcular o todo para responder sobre a parte | desperdício | Consulta direta |
| Laço aninhado sobre coleções que crescem juntas | O(n²) | Repense |

Varredura linear sobre **`n` fixo e pequeno** (14 adapters, 33 consoles) é
aceitável e frequentemente mais simples que um mapa — não troque clareza por
micro-otimização onde o `n` não cresce. O critério é: *este `n` cresce com o uso
do app?* Se sim, precisa ser sublinear ou indexado. Se não, deixe simples.

**Meça antes de otimizar e depois de otimizar.** Um benchmark temporário
(`zz_auditoria_temp_*_test.go`, apagado depois) custa dois minutos e substitui
uma discussão inteira.

---

## O que está fora, e deve continuar fora

- **Banco de dados**, ORM, camada de persistência — inclusive "só um SQLite
  rapidinho". Ver [ADR 0002](decisoes/0002-adiar-banco-de-dados.md).
- **Nintendo Switch** no catálogo; adapters para Yuzu ou Ryujinx. Ver
  [ADR 0008](decisoes/0008-excluir-switch-do-catalogo.md).
- **Qualquer coisa que facilite obter ou compartilhar ROM.** O `rom_path` aponta
  para um arquivo que já está no disco do usuário. A camada social compartilha
  save states, texture packs, perfis de controle e lobby de netplay — nunca o
  jogo. Isso precisa ser estrutural, não regra de termos de uso.
- **Texto que julgue o hardware do usuário.** Números e o que a máquina alcança;
  a decisão de estar satisfeito é dele.
- **Dependência nova** sem decisão explícita. Ferramenta rodada via
  `go run pacote@versão` não entra no `go.mod` e é o caminho preferido.

---

## Como verificar que tudo isto continua verdadeiro

Peça a auditoria: o agente `auditoria` (em `.claude/agents/auditoria.md`) roda
`deadcode`, `staticcheck`, build cruzado e a leitura de complexidade, e relata
o que verificou e o que não conseguiu verificar.
