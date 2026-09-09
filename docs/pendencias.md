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

## Onboarding para quem abre o app sem nenhuma ROM ainda

**Origem:** achado do Douglas em 2026-09-07, depois do redesenho visual —
"o app fica muito cru para esse público que vai entrar e não ver nada".

**O problema:** hoje o percurso de zero é consentimento → scan → tela "Todos
os jogos" **vazia**, com um `EmptyState` e um botão "Escolher pasta com
jogos" (ver `docs/visao-do-produto.md`, história "Do zero ao primeiro
jogo"). Isso cobre a ação mínima, mas não apresenta o app: quem nunca usou
emulador não sabe o que esperar depois de apontar a pasta, o que é um
"parecer de compatibilidade", ou que o ZeuX resolve emulador/preset sozinho.
A primeira impressão de quem não tem ROM nenhuma ainda é uma tela quase em
branco, sem contexto.

**Feito em parte (2026-09-09):** o `EmptyState` de "Todos os jogos" virou a
versão com passos numerados (opção "só uma versão mais rica do `EmptyState`
atual", abaixo) — aponte a pasta · o ZeuX lê o hardware e diz o que cada
console alcança · clique no jogo. Ver `decisoes.md`. O que **continua em
aberto**: o modo tutorial/wizard dedicado e as perguntas de quando exibir /
onde entra na máquina de estados de `App.tsx` / console de exemplo.

**Ideia levantada, não desenhada ainda:** um modo tutorial/passo-a-passo
logo após a instalação (ou logo após o consentimento, antes do scan) que
explique o que o app faz, sem story vazio. Nada disto foi decidido:

- Quando exibir: só na primeira execução (mesmo padrão do splash,
  `localStorage`), ou sempre que a biblioteca estiver vazia (repete se a
  pessoa remover todas as pastas depois)?
- Conteúdo: um carrossel/wizard curto explicando consentimento → scan →
  apontar pasta → parecer → jogar? Ou só uma versão mais rica do
  `EmptyState` atual, com passos numerados em vez de um botão solto?
- Onde entra na máquina de estados de `App.tsx` (mesmo cuidado do splash:
  não pode atrasar quem já tem pasta apontada, e não pode ser uma `Phase`
  que soma tempo ao boot de quem só quer abrir o jogo de sempre).
- Vale mostrar um console de exemplo (sem jogo de verdade — nunca ROM) só
  pra ilustrar como fica um card "pronto pra jogar" vs. "falta componente
  X"? Isso pode ler como dado falso se não ficar claro que é ilustrativo —
  cuidado editorial, não só técnico.

**Depende de:** nada · **Bloqueia:** nada. Não teve critério de aceite
desenhado ainda — é ideia registrada, não especificação pronta para
implementar.

## Redesenho visual — telas restantes

**Concluído em 2026-09-09** (ver `decisoes.md`, "Redesenho arcade/CRT
estendido às telas do início e a Configurações"). O redesenho de 2026-09-07
cobriu 7 telas; esta rodada terminou o restante:

- ~~`ConsentScreen.tsx`, `DeclinedScreen.tsx`, `StatusScreen.tsx`~~ — kicker
  monoespaçado em ciano, linhas de CRT decorativas, "Agora não"/"Continuar
  sem autorizar"/"Ver emuladores" descidos para `chrome`, erro de conexão
  agora no `InlineError` do app.
- ~~`VerdictScreen.tsx`~~ — subtítulo no cabeçalho e `SectionHeading`
  ("Componentes") antes da grade de specs; texto de hardware continua
  descritivo e o aviso `parcial` intacto.
- ~~`SettingsScreen.tsx`~~ — passada completa: todo `secondary` de chrome de
  app virou `chrome`, subtítulos `text-primary` viraram kicker monoespaçado,
  "Desconectar" ganhou `CHROME_TINT_DANGER`.
- ~~`ControllerTestScreen.tsx`~~ — já estava no vocabulário novo (refeita em
  2026-09-08 com foto real + realce ciano); só o botão "Parar teste" solto em
  `secondary` virou `chrome`.

**Limpeza feita junto:** `LibraryScreen.tsx` passou a importar
`CHROME_TINT_INFO`/`CHROME_TINT_DANGER` de `ui.tsx` no lugar das duas strings
de tingimento inline (sem mudança visual).

**Depende de:** nada · **Bloqueia:** nada

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

## Multi-disco: agrupar "(Disc 1)"/"(Disc 2)" e lançar como playlist

**Origem:** pedido do Douglas em 2026-09-09, junto do título editável. O
título editável foi entregue nessa rodada; o multi-disco foi separado por
esbarrar na regra de `BuildCommand` pura (ver `decisoes.md`, "Multi-disco:
adiado").

**O problema:** jogos de PS1/PS2 divididos em vários discos entram como
entradas independentes na biblioteca — "Final Fantasy VII (Disc 1)",
"(Disc 2)", "(Disc 3)" viram três cards, e trocar de disco no meio do jogo
não tem caminho.

**Escopo mínimo desenhado (não implementado):**

1. **Detecção na varredura** (`internal/library/scan.go`): agrupar arquivos
   do mesmo diretório cujo nome só difere pelo trecho `(Disc N)` / `(Disco N)`
   (aparar essa etiqueta e comparar o resto, do mesmo jeito que
   `TitleFromFilename` já apara `(USA)` etc.). Um grupo com 2+ discos vira
   um jogo só; disco único continua entrada normal.
2. **Modelo:** um jogo multi-disco precisa guardar os N caminhos ordenados.
   Opções em aberto: linha "pai" + coluna `disc_paths` (JSON) na `library_games`,
   ou tabela nova `library_game_discs` (migração em `internal/store/migrations/`).
   Nenhuma escolhida — a segunda é mais limpa mas mais peso; decidir com o
   "orçamento de simplicidade" (arquitetura-do-codigo.md §6) na mão.
3. **Lançamento — a parte que travou:** RetroArch/DuckStation aceitam um
   `.m3u` com um caminho por linha. `BuildCommand` **não pode** gerar esse
   arquivo (regra: função pura, não toca o FS além da exceção do RetroArch;
   ver `decisoes.md`). Duas saídas a avaliar:
   - Gerar o `.m3u` numa área gerenciada do ZeuX (`emulator.ManagedRoot()`,
     nunca a pasta de ROM do usuário — regra 6) numa camada **antes** de
     `BuildCommand` (no `Launcher`, que já toca o FS), passando o caminho do
     `.m3u` como se fosse o `rom_path`.
   - Confirmar se algum dos dois emuladores aceita múltiplos caminhos de
     disco direto por linha de comando (sem `.m3u`) — se sim, nada é escrito
     em disco. **Não verificado.**
4. **Fallback aceitável se (3) ficar grande:** só detecção + agrupamento
   visual — um card "God of War (2 discos)" que ao abrir pergunta qual
   disco lançar (lançamento de disco único, que já funciona). A playlist
   automática fica como continuação desta pendência.

**Critério de aceite (quando for implementado):**
- [ ] Três arquivos `(Disc 1..3)` na mesma pasta viram um card só.
- [ ] Revarredura não duplica nem desagrupa.
- [ ] Nenhum arquivo é escrito na pasta de ROM do usuário em hipótese
      nenhuma (regra 6 + `BuildCommand` pura).
- [ ] Testes em `internal/library` (agrupamento) e, se a playlist for feita,
      em `internal/emulator`/`internal/api` (o `.m3u` sai na área gerenciada,
      com um caminho por linha, na ordem certa).

**Depende de:** nada · **Bloqueia:** nada

## O que fica fora deste documento

- Trabalho já feito, mesmo que recente — isso vive só no código e no
  histórico de commits, não aqui.
- Ideia sem especificação nenhuma ainda (não é pendência, é ainda-não-ideia).
