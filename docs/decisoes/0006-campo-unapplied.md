# 0006 — Campo `Unapplied` em vez de inventar flags

**Status:** Aceito

## Contexto

O ZeuX promete autoconfiguração: o usuário escolhe um jogo e o app já monta o
emulador no patamar que a máquina alcança. O preset do catálogo descreve tela
cheia, escala interna, backend gráfico e encerramento junto com o jogo.

O problema é que os emuladores divergem radicalmente no que aceitam por linha de
comando:

- **Dolphin** aceita tudo — `-C` sobrescreve qualquer chave do INI.
- **DuckStation, PCSX2, PPSSPP, RPCS3, Cemu** aceitam pouco mais que tela cheia
  e modo batch; resolução e backend vivem na configuração interna.
- **Flycast** standalone praticamente não aceita nada além do caminho do jogo;
  quase tudo está no `emu.cfg`.
- **RetroArch** aceita `-f`, mas resolução interna depende do core e é ajustada
  nas opções do core.

Três caminhos eram possíveis:

1. **Inventar/adivinhar flags** para as opções faltantes. Inaceitável: uma flag
   inexistente faz o emulador **recusar a abrir**, e o usuário não tem como
   saber por quê.
2. **Escrever nos arquivos de configuração do emulador.** Poderoso, mas invasivo:
   sobrescreveria ajustes que o usuário fez à mão, e cada emulador tem formato e
   localização próprios. Fora de escopo por ora.
3. **Aplicar o que dá, e declarar o que não deu.**

## Decisão

Opção 3. `Command` carrega, junto do `argv`, uma lista de pendências:

```go
type Command struct {
    Argv      []string `json:"argv"`
    Unapplied []string `json:"unapplied,omitempty"`
}
```

Cada entrada de `Unapplied` é uma frase em português, dirigida ao usuário, que
diz **onde** o ajuste precisa ser feito:

> "A resolução interna precisa ser ajustada dentro do DuckStation."

O `Unapplied` é repetido em `Session.Unapplied`, para que a interface possa
avisar assim que o jogo abre.

## Consequências

**Positivas**

- Nenhum lançamento falha por flag inventada.
- O usuário sabe exatamente o que o ZeuX conseguiu configurar e o que ficou por
  conta dele — em vez de achar que o app aplicou e não funcionou.
- A lista é dado estruturado: a interface pode transformar cada pendência num
  aviso acionável.
- O teste `TestUnsupportedOptionsAreReportedNotInvented` trava a regra: nenhum
  argumento pode conter `InternalResolution` nem `vulkan` nos adapters que não
  suportam essas opções.

**Negativas / custos aceitos**

- **A autoconfiguração é parcial na maioria dos emuladores.** Só no Dolphin ela
  se aplica por inteiro. Isso é uma limitação real da promessa central do
  produto, e deve ser comunicada com clareza na UI, não escondida.
- Manter uma frase por opção por adapter é repetitivo, e há espaço para as
  frases divergirem em tom.
- **Nada garante que toda opção seja tratada.** Uma opção que o adapter
  simplesmente ignora — sem aplicar nem declarar — passa despercebida. Isso já
  acontece em três casos: RetroArch com `exit_on_close`, Flycast com `renderer`
  e `exit_on_close`, Cemu com `exit_on_close`. Ver
  [adapters.md](../adapters.md#as-lacunas-) e o item de correção no
  [roadmap](../roadmap.md).

## Evolução prevista

Quando escrever nos arquivos de configuração dos emuladores entrar no escopo, a
lista de `Unapplied` encolhe — mas o campo continua necessário, porque sempre
haverá ajuste que só o usuário pode fazer. O caminho é reduzir a lista, não
eliminá-la.
