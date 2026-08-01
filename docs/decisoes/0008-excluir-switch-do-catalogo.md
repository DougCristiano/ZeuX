# 0008 — Excluir o Nintendo Switch do catálogo

**Status:** Aceito

## Contexto

O Nintendo Switch é, de longe, o console mais procurado em qualquer front-end de
emulação moderno. Incluí-lo seria a decisão óbvia por demanda.

Só que os dois emuladores de Switch relevantes — **Yuzu** e **Ryujinx** — foram
descontinuados após ação judicial da Nintendo. Não há projeto ativo, distribuição
oficial nem canal de atualização confiável.

Incluir o Switch no catálogo significaria:

- Emitir um parecer ("sua máquina roda Switch em qualidade X") sobre um emulador
  que o ZeuX não pode localizar de forma legítima nem indicar onde obter.
- Construir um adapter cuja instalação 1-click apontaria necessariamente para
  distribuições não oficiais.
- Vincular o ZeuX ao ponto exato de atrito jurídico do ecossistema de emulação,
  bem no momento em que o projeto pretende ter camada social e presença pública.

Isso conversa diretamente com a postura legal já adotada em outras frentes: o
ZeuX **nunca facilita compartilhamento de ROMs**. O `rom_path` aponta para um
arquivo que já está no disco do usuário, e o app nunca o copia nem o transfere.
O que a camada social vai compartilhar são save states, texture packs, perfis de
controle e lobby de netplay — nunca o jogo.

## Decisão

O Nintendo Switch **fica fora do catálogo**, deliberadamente. Não há entrada
`switch` em `consoles.json`, nem adapter para Yuzu ou Ryujinx.

O catálogo cobre 13 consoles: NES, SNES, Mega Drive, GBA, PS1, N64, PSP,
Dreamcast, PS2, GameCube, Wii, Wii U, PS3.

A decisão é sobre **projetos descontinuados por ação judicial**, não sobre
emulação de consoles recentes em geral. Se um emulador de Switch legalmente
sólido e ativamente mantido surgir, esta decisão pode ser revista com um ADR
novo.

## Consequências

**Positivas**

- O ZeuX não distribui, não localiza e não recomenda software descontinuado por
  litígio.
- Postura coerente: se o app se recusa a mediar ROMs, recusar também um emulador
  juridicamente contestado é o mesmo princípio.
- Nenhuma promessa de suporte que o app não possa sustentar com atualizações.

**Negativas / custos aceitos**

- **A ausência será notada.** O Switch é o console mais pedido, e usuários vão
  perguntar. É preciso ter uma resposta pronta, honesta e curta — a UI deve
  explicar a ausência quando o assunto surgir, em vez de deixar o vazio falar.
- Desvantagem competitiva perante front-ends que incluem Switch.
- A lista de "consoles suportados" fica visivelmente incompleta para quem só
  olha o topo da linha do tempo.

## Nota de aplicação

Esta decisão **não** significa filtrar consoles arbitrariamente. Consoles ausentes
do catálogo hoje por outros motivos — Saturn, 3DS, DS, Game Boy / Game Boy Color,
Master System, Xbox original — estão de fora apenas porque ainda não foram
adicionados, e são candidatos normais de roadmap. Só o Switch está de fora **por
decisão**.
