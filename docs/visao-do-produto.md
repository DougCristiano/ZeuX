# O que é o ZeuX

Este documento é a lei do produto: não fala de código, fala de
funcionalidade e propósito. Quando uma feature nova for proposta, é este
documento que decide se ela cabe no espírito do projeto — não o inverso.

Tom deliberadamente seco: cada princípio aqui é uma regra que decide um
empate, não um discurso de venda.

---

## O problema

Emulação funciona — o software já existe, é maduro, é gratuito. O que trava
quem tenta emular hoje não é falta de emulador: é a distância entre "eu
tenho um PC e uma pasta de jogos" e "o jogo abre configurado direito". Cada
emulador tem sua própria linguagem de configuração, seus próprios termos
técnicos (resolução interna, upscaling, backend gráfico), e nenhum deles diz
honestamente se a máquina da pessoa aguenta o que ela está tentando rodar.

O ZeuX não é mais um emulador. É a camada que **decide em nome do usuário**
o que a máquina dele alcança, e monta a configuração certa sozinha —
falando a verdade sobre o hardware em vez de deixar a pessoa descobrir por
tentativa e erro.

## Para quem é

Quem tem uma máquina (qualquer uma — não presume PC de jogo) e uma pasta de
jogos já no disco, e quer que a distância entre "abrir o app" e "jogar" seja
a menor possível, sem precisar aprender vocabulário de emulador para
chegar lá.

## Os princípios inegociáveis

Estes vêm do dono do produto e valem mais que qualquer preferência técnica.
Quem propuser uma feature que contraria algum destes precisa justificar por
que a exceção vale a pena — a resposta-padrão é que não vale.

### 1. Consentimento antes do scan, verificado no servidor

O scan de hardware só acontece depois de um "sim" explícito, e essa checagem
vive no servidor — não só na tela. Uma permissão que só a interface protege
não é permissão. O texto do consentimento é versionado: se o uso do dado
mudar de escopo, a versão sobe e o "sim" anterior deixa de valer.

### 2. Texto sobre hardware é descritivo, nunca julgador

Nunca dizer que o PC de alguém é fraco, ruim, limitado ou insuficiente. Dizer
os números e o que a máquina alcança. Quem decide se está satisfeito é o
usuário.

- ❌ "Seu PC é fraco para PS2."
- ✅ "Este patamar pede 6 GB de memória de vídeo; a placa X tem 2.0 GB."

### 3. Nomear o componente que barra

Quando um patamar melhor não é atingido, dizer **qual componente** impede —
nunca uma nota opaca tipo "mediano". O caso que motivou isso: uma máquina
com CPU forte e GPU integrada. Uma nota única diria "mediano" e não ajudaria
em nada; nomear a GPU diz exatamente o que fazer a respeito.

### 4. Dado que não pôde ser lido é declarado desconhecido

Um requisito não verificável não conta como atendido nem como não atendido.
O parecer sai marcado como parcial. Nunca fingir certeza para deixar a
resposta mais bonita.

### 5. Informar, nunca bloquear

Não instalar (nem impedir) um emulador porque o hardware não comporta.
Mostrar o parecer, explicar o gargalo, deixar a pessoa seguir por conta e
risco. O ZeuX aconselha; quem decide é sempre o usuário.

### 6. Nunca facilitar compartilhamento de ROM

O ZeuX aponta para um arquivo que já está no disco do usuário. Nunca copia,
distribui, sugere fonte ou facilita transferência de ROM — nem por link, nem
por função utilitária "entre máquinas". O que a camada social compartilha é
save state, texture pack, perfil de controle e lobby de netplay. **Nunca o
jogo.**

---

## Histórias de uso

Cada história é um percurso completo, do início ao fim, sem pular passo —
verificado contra o comportamento real do app, não uma idealização.

### Do zero ao primeiro jogo

Alguém baixa o instalador do ZeuX, abre o app pela primeira vez. Nenhuma
configuração pedida ainda — a primeira tela é o texto de consentimento: por
que o ZeuX quer ler o hardware da máquina (comparar com outros jogadores), e
que a leitura só acontece depois de um "sim" explícito. A pessoa aceita.

O app faz o scan (CPU, RAM, GPU) e cai direto na tela "Todos os jogos" —
vazia, porque nenhuma pasta de ROM foi apontada ainda. Não tem qual jogo
abrir; tem, sim, um caminho óbvio pra ir até "Biblioteca".

Na Biblioteca, a pessoa aponta a pasta onde guarda os jogos de um console
(ex.: a pasta de ROMs de SNES). O ZeuX varre ali na hora, acha os arquivos,
mostra quantos jogos entraram. Não pergunta nome de BIOS, não pergunta qual
emulador usar — só a pasta.

Volta pra "Todos os jogos": agora os jogos aparecem em grade, com capa (se o
ZeuX já tiver uma buscada) ou placeholder. Um deles já mostra o selo de
"pronto para jogar" — outro mostra um aviso menor: "sem preset — GPU",
porque aquele console pede uma placa dedicada e a máquina só tem gráficos
integrados. A pessoa não é informada que a máquina é "fraca" — só que aquele
patamar específico pede um componente que falta (princípios 2 e 3).

Clica no jogo pronto. O ZeuX resolve sozinho: qual emulador atende aquele
console, qual preset a máquina alcança, monta a linha de comando (fullscreen,
sem prompt de "sair para o menu" no meio do jogo) e abre o emulador — sem o
usuário ter tocado em nenhum arquivo `.ini`, sem saber o nome de nenhuma
flag de linha de comando.

Do zero até o jogo abrindo: consentimento → scan → apontar uma pasta →
clicar num jogo. Nada mais foi pedido.

### Jogando só de controle

Alguém conecta um controle Xbox/PlayStation na máquina (padrão "standard"
da Gamepad API) antes de abrir o app — mouse e teclado ficam de lado. Na
grade de "Todos os jogos", o D-pad move o foco entre os tiles pelo vizinho
mais próximo na direção pressionada (não pela ordem do código-fonte — numa
grade, "próximo" é posição na tela). Botão A confirma, abre o jogo. Botão B
tenta voltar — mas só funciona se a tela atual tiver um botão de "Voltar"
reconhecível; nem toda tela tem.

Assim que um controle é plugado, um rodapé fino aparece na base da tela com
os prompts do que os botões fazem — **Ⓐ Selecionar** sempre, e **Ⓑ Voltar**
só nas telas que têm um botão de voltar de verdade (o prompt some quando não
têm, em vez de prometer o que não aconteceria). Sem controle, o rodapé não
existe e o layout não muda em nada para quem usa mouse e teclado.

### Onde parei, quanto joguei

O ZeuX acompanha cada partida do começo ao fim da janela do emulador. A tela
de Histórico junta isso em duas respostas: os últimos jogos abertos (cada um
leva ao detalhe, para retomar de onde parou) e o tempo de jogo — total e por
console. O texto é sempre descritivo: "3 h 20 min em PlayStation 2", nunca
"você só jogou 3 h" (princípio 2). Sem nenhuma partida ainda, a tela diz que
o histórico aparece depois do primeiro jogo aberto — não um painel vazio.

---

## Ainda por definir

Espaço reservado para decisões de produto que ainda não foram tomadas.
Preencher aqui conforme forem decididas — não adivinhar de antemão o que
vai entrar.

*(vazio por enquanto)*

Trabalho já especificado mas não construído fica em `pendencias.md`, não
aqui — este documento é sobre o que o produto **é**, não sobre o backlog.
