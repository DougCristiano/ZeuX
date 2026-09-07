# Pendências

Trabalho **planejado, mas ainda não implementado** — confirmado por leitura
do código em 2026-09-07, não por suposição. Backlog honesto: se alguma coisa
aqui já tiver sido feita quando você ler isto, o documento está desatualizado
— confira contra o código antes de confiar.

Formato por item: o que é, por quê, critério de aceite (quando já foi
desenhado), do que depende.

---

## RetroAchievements — nada implementado ainda

**Status confirmado:** zero linha de código (`grep -rli retroachievements
internal/ src/` não acha nada).

**Origem:** especificação externa trazida pelo Douglas em 2026-08-26. Fica
**pós-v1.0** por prioridade — não é o primeiro item da fila.

**Duas coisas precisam ser confirmadas antes de qualquer estimativa virar
compromisso** (nenhuma foi verificada):

1. **O ZeuX não desbloqueia conquista nenhuma.** Quem faz isso é o emulador
   (RetroArch e alguns standalone têm suporte próprio a RetroAchievements).
   O escopo aqui é **exibir**, e possivelmente **configurar as credenciais
   dentro do emulador** pela tela do ZeuX (a rota de config de emulador já
   existe, ver `api.md`). Se alguém desenhar isto como "o ZeuX rastreia o
   jogo e concede a conquista", o item está errado.
2. **O hash do RetroAchievements não é um MD5 do arquivo.** Eles usam um
   cálculo próprio por sistema (cabeçalho descartado, trilha de CD
   específica, etc.). Antes de assumir que a busca de capas (IGDB) resolve
   isso de graça, alguém precisa ler a documentação/implementação de
   referência deles. Pode ser que sejam dois hashes diferentes convivendo.

### P1 — Conectar a conta do RetroAchievements

Sem credencial não há nada para mostrar. Mesmo princípio das capas via IGDB:
conta **do usuário**, nunca uma chave do ZeuX compartilhada — uma credencial
de teste compartilhada já se mostrou custar caro antes (ver `decisoes.md`).

**Critério de aceite:**
- [ ] Tela em Configurações aceita usuário + chave de API, guardada
      localmente com o mesmo cuidado da credencial do IGDB (nunca no
      repositório, nunca embutida no binário).
- [ ] Credencial inválida devolve erro nomeado e em português, distinguindo
      "credencial recusada" de "o serviço não respondeu".
- [ ] Sem conta conectada, nada na interface muda — nenhuma seção vazia
      ocupando espaço.
- [ ] Teste roda sem rede, contra servidor de mentira: conectou / recusou /
      caiu.

**Depende de:** nada · **Bloqueia:** P2, P3

### P2 — Resolver o jogo pelo hash e trazer as conquistas

**Critério de aceite:**
- [ ] Dado um jogo da biblioteca, calcula o identificador que o
      RetroAchievements espera **para aquele console** e consulta conquistas
      + o que já foi desbloqueado.
- [ ] Jogo não reconhecido devolve **desconhecido**, nunca as conquistas de
      um jogo parecido — mesma regra do parecer parcial.
- [ ] Resultado cacheado localmente (tabela nova, migração em
      `internal/store/migrations/`); abrir a mesma tela duas vezes não
      dispara duas requisições.
- [ ] Consulta é sob demanda (abrir o jogo), nunca varredura silenciosa da
      biblioteca inteira.
- [ ] Código comenta **qual** algoritmo de hash foi implementado e contra
      qual documentação foi conferido. Console não coberto devolve
      desconhecido, nunca chuta.
- [ ] Testes sem rede: reconhecido / não reconhecido / resposta malformada /
      serviço fora.

**Depende de:** P1 · **Bloqueia:** P3

### P3 — Badges na tela do jogo

**Critério de aceite:**
- [ ] Tela de detalhe do jogo ganha seção com conquistas: ícone, título,
      descrição, desbloqueada ou não, contador (`12/40`).
- [ ] Imagens de badge vêm de arquivo local já baixado, nunca URL de
      terceiro direto no WebView — mesma regra da capa de jogo.
- [ ] Alcançável só com Tab/Enter e pelo controle, sem depender de hover.
- [ ] Texto não julga o jogador: "12 de 40 conquistas", nunca "você só
      conseguiu 12".
- [ ] Sem rede, mostra o que já está em cache; sem cache, a seção some — a
      tela de jogo nunca quebra por causa disto.

**Depende de:** P2 · **Bloqueia:** nada

---

## Rodapé de prompts do controle na tela

`useGamepadNavigation` já traduz D-pad/A/B em navegação, mas **não expõe se
há controle conectado** — o hook detecta o pad dentro do laço de poll e não
devolve nada nem escuta `gamepadconnected`. Resultado: o usuário não tem
como saber que o controle funciona ali, porque nenhum prompt aparece.

**Critério de aceite:**
- [ ] `useGamepadNavigation()` devolve se há controle conectado, atualizado
      quando um é ligado ou desligado.
- [ ] Com controle conectado, um rodapé fino mostra os prompts (Ⓐ Jogar · Ⓑ
      Voltar); sem controle, nada aparece e o layout não reserva espaço.
- [ ] Os prompts refletem o que o hook faz de verdade — inclusive a
      limitação de que B procura um botão cujo texto começa com "Voltar"; se
      a tela não tiver, B não volta. Prompt que promete o que não acontece é
      pior que prompt nenhum.
- [ ] Teclado e mouse continuam sem nenhuma mudança visual.

**Depende de:** nada · **Bloqueia:** nada

---

## Manifesto de cores do RetroArch: decisão de escopo em aberto

Não é uma feature faltando — é uma escolha de arquitetura ainda não tomada.
Detalhe completo em `decisoes.md` ("RetroArch: cores baixados sob demanda").
Resumo: o manifesto de hash fica obsoleto sozinho porque a URL de origem é
`latest` (o buildbot reconstrói periodicamente). Duas saídas possíveis,
nenhuma escolhida ainda:

- Aceitar que isso volta a acontecer e regenerar manualmente quando alguém
  reportar (caminho atual, sem trabalho extra).
- Buildar contra uma versão pinada/datada do core em vez de "latest"
  (elimina o problema, muda a URL do manifesto e o gerador).

---

## O que fica fora deste documento

- Trabalho já feito, mesmo que recente — isso vive só no código e no
  histórico de commits, não aqui.
- Ideia sem especificação nenhuma ainda (não é pendência, é ainda-não-ideia).
