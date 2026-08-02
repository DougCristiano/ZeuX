# 0002 — Adiar o banco de dados

**Status:** Substituído por [0011](0011-sqlite-local-para-biblioteca.md)

## Contexto

O PRD prevê bastante coisa que exige persistência: biblioteca de jogos local,
metadados vindos de scraper, perfis sociais, conquistas, tempo de jogo,
histórico, compatibilidade estilo ProtonDB. O plano de longo prazo é SQLite
local + MySQL na nuvem.

Escolher o esquema, a biblioteca de acesso, a estratégia de migração e a
sincronização local↔nuvem é um bloco grande de trabalho — e um bloco que produz
zero valor visível até que exista uma tela mostrando os dados.

A prioridade definida pelo dono do produto foi explícita: **layout,
funcionalidade de emuladores e facilidade de configuração antes de
infraestrutura de dados**. O diferencial do ZeuX é autoconfiguração, não
armazenamento.

## Decisão

Não introduzir banco de dados nenhum até que a Fase 2 (UI + lançamento de
emuladores) esteja de pé e prove o que precisa ser guardado.

Onde persistência é inevitável hoje, usar o meio mais simples que resolve:

- **Consentimento** → `consent.json` em `os.UserConfigDir()/ZeuX/`, gravado
  atomicamente. Não pode ser volátil: perder o consentimento a cada reinício
  faria o app perguntar de novo toda vez.
- **Catálogo de consoles** → embutido no binário com `//go:embed`. É dado de
  leitura, versionado por `schema_version`, e embutir garante que o app funcione
  offline no primeiro uso.
- **Último scan de hardware** → memória (`Server.lastScan`). É retrato de um
  momento e barato de refazer.
- **Sessões e tempo de jogo** → memória (`Launcher.sessions`).

## Consequências

**Positivas**

- Nenhuma dependência externa de runtime. `go build` e o binário roda.
- O esquema será desenhado a partir de requisitos reais, observados, em vez de
  antecipados. Esquema errado migrado depois custa mais caro que esquema
  escrito tarde.
- Menos superfície para manter enquanto a arquitetura ainda se move.

**Negativas / custos aceitos**

- **Tempo de jogo e histórico de sessões somem quando o daemon fecha.** É a
  consequência mais visível e precisa ser comunicada ao usuário enquanto durar.
  O PRD promete "tempo total de jogo" no perfil — essa promessa está
  parcialmente descoberta hoje.
- Não há biblioteca de jogos: o usuário precisa informar o `rom_path` a cada
  lançamento.
- Metadados e capas não têm onde ser cacheados, então o scraper não pode ser
  construído antes do banco.
- Quando o banco entrar, `Launcher` e `Server` precisarão de uma camada de
  repositório. Hoje eles guardam estado diretamente em slices e ponteiros
  protegidos por mutex; isso vai precisar ser extraído.

## Gatilho para revisão

Reabrir esta decisão quando a primeira das condições ocorrer:

1. A UI da Fase 2 estiver funcional e mostrando dados que precisam sobreviver a
   um reinício.
2. O scraper de metadados entrar no escopo (não faz sentido sem cache).
3. Qualquer funcionalidade social sair do papel (exige identidade persistida).
