# RetroAchievements — planejado, nada implementado

**Status: nenhuma linha de código existe para isto ainda.** Confirmado por
busca no repo (`grep -rli retroachievements internal/ src/`) em 2026-09-07 —
zero resultado. Este documento é o único conteúdo preservado da limpeza de
`docs/` feita nessa mesma data (o resto — `arquitetura.md`, `api.md`,
`adapters.md`, `roadmap.md`, ADRs, etc. — foi apagado por decisão do Douglas,
para reescrever a documentação do zero a partir do código real). Mantido
porque é a única especificação de um trabalho **ainda por fazer**, não uma
descrição do que já existe.

---

## Contexto

**Criada em 2026-08-26**, origem: especificação externa trazida pelo Douglas
("Retro-Steam Frontend"). Um roadmap anterior tinha uma linha "Integração
RetroAchievements" dentro da sprint social (v2.0) — essa linha virou ponteiro
para cá, porque colocá-la junto da camada social dava a entender que ela
depende do backend na nuvem do ZeuX, e **não depende**: a conta é do usuário,
no serviço deles, e o ZeuX só lê. Isso muda o custo e a posição no roadmap.

**Fica pós-v1.0**, por prioridade: conquista é valor direto ao usuário, mas
não é o primeiro item da fila quando este documento foi escrito.

**Duas coisas precisam ser confirmadas antes de qualquer estimativa virar
compromisso** (nenhuma foi verificada):

1. **O ZeuX não desbloqueia conquista nenhuma.** Quem faz isso é o emulador
   (RetroArch e alguns standalone têm suporte próprio a RetroAchievements). O
   escopo aqui é **exibir**, e possivelmente **configurar as credenciais
   dentro do emulador** pela tela do ZeuX. Se alguém desenhar isto como "o
   ZeuX rastreia o jogo e concede a conquista", o item está errado.
2. **O hash do RetroAchievements não é um MD5 do arquivo.** Eles usam um
   cálculo próprio por sistema (cabeçalho descartado, trilha de CD
   específica, etc.). Antes de assumir que a busca de capas (IGDB) resolve
   este problema de graça, alguém precisa ler a documentação/implementação de
   referência deles. Pode ser que sejam dois hashes diferentes convivendo.

## P1 — Conectar a conta do RetroAchievements

Sem credencial não há nada para mostrar. Mesmo princípio das capas via IGDB:
conta **do usuário**, nunca uma chave do ZeuX compartilhada por todo mundo —
uma credencial de teste compartilhada já se mostrou custar caro antes
(suspensão por uso agregado).

**Critério de aceite:**
- [ ] Uma tela em Configurações aceita usuário + chave de API do
      RetroAchievements, guardada localmente com o mesmo cuidado da
      credencial do IGDB (nunca no repositório, nunca embutida no binário).
- [ ] Credencial inválida devolve erro **nomeado e em português**,
      distinguindo "credencial recusada" de "o serviço não respondeu" — o
      usuário precisa saber se conserta digitando de novo ou se é só esperar.
- [ ] **Sem conta conectada, nada na interface muda.** Nenhuma seção vazia,
      nenhum "conecte sua conta" ocupando espaço na tela de jogo.
- [ ] Um teste roda sem rede, contra servidor de mentira: conectou / recusou
      / caiu.

**Depende de:** nada · **Bloqueia:** P2, P3

## P2 — Resolver o jogo pelo hash e trazer as conquistas

**Critério de aceite:**
- [ ] Dado um jogo da biblioteca, o backend calcula o identificador que o
      RetroAchievements espera **para aquele console** e consulta a lista de
      conquistas + o que o usuário já desbloqueou.
- [ ] Jogo que o serviço não reconhece devolve **desconhecido**, e a tela não
      mostra nada — nunca as conquistas de um jogo parecido. Mesma regra do
      parecer parcial de hardware.
- [ ] O resultado é cacheado localmente (tabela nova, migração em
      `internal/store/migrations/`), e abrir a mesma tela duas vezes **não
      faz duas requisições**.
- [ ] A consulta é sob demanda (abrir o jogo), nunca uma varredura silenciosa
      mandando a biblioteca inteira para um terceiro.
- [ ] Está escrito no código, com comentário, **qual** algoritmo de hash foi
      implementado e contra qual documentação ele foi conferido. Se só uma
      parte dos consoles foi coberta, os demais devolvem desconhecido em vez
      de chutar.
- [ ] Testes sem rede: reconhecido / não reconhecido / resposta malformada /
      serviço fora.

**Depende de:** P1 · **Bloqueia:** P3

## P3 — Badges na tela do jogo

**Critério de aceite:**
- [ ] A tela de detalhe do jogo ganha uma seção com as conquistas: ícone,
      título, descrição e se está desbloqueada, mais um contador (`12/40`).
- [ ] As imagens de badge vêm de **arquivo local já baixado**, nunca URL de
      terceiro renderizada direto pelo WebView — mesma regra que já vale para
      capa de jogo, pelo mesmo motivo (offline e uma requisição por render).
- [ ] Alcançável só com Tab/Enter e pelo controle, sem depender de hover —
      mesma disciplina de navegação por controle que o resto do app segue.
- [ ] O texto **não julga o jogador**: "12 de 40 conquistas", nunca "você só
      conseguiu 12". Mesma disciplina do texto sobre hardware.
- [ ] Sem rede, a seção mostra o que já está em cache; sem cache, ela não
      aparece — a tela de jogo nunca quebra por causa disto.

**Depende de:** P2 · **Bloqueia:** nada
