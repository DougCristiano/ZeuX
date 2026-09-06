# ZeuX

Front-end de emulação multiplataforma com foco em eliminar a complexidade de
configuração: o app lê o hardware da máquina e diz, de forma descritiva e
honesta, o que aquele computador alcança em cada console.

## Estado atual

O daemon local em Go detecta o hardware, emite o parecer por console e lança
jogos nos emuladores instalados, aplicando automaticamente o preset adequado à
máquina. São 33 consoles no catálogo e 14 emuladores conhecidos, além dos que o
usuário cadastrar manualmente.

A instalação 1-click baixa os emuladores das fontes oficiais, verifica a
integridade e instala em `%APPDATA%\ZeuX\emulators`. Os cores do RetroArch
são baixados **sob demanda**, na hora de abrir um jogo, com SHA256 conferido
contra um manifesto embutido ([ADR 0015](docs/decisoes/0015-baixar-retroarch-e-cores-sob-demanda.md)).

Existe interface gráfica (Tauri + React, 10 telas), busca de capas pelo IGDB
com a conta do próprio usuário, e SQLite local para biblioteca, sessões e
tempo de jogo ([ADR 0011](docs/decisoes/0011-sqlite-local-para-biblioteca.md)).

⚠️ **A maioria das linhas de comando ainda não foi validada com jogos reais.**
Foram abertos até a tela de título: PS1 (DuckStation), PS2 (PCSX2), N64 (RMG) e
três consoles pelo RetroArch. Os demais adapters foram escritos a partir da
documentação de cada projeto — os testes cobrem a tradução de opções em
argumentos, não a aceitação delas pelo emulador. Ver
[docs/roadmap.md](docs/roadmap.md).

Para conferir se algum projeto mudou o nome dos pacotes publicados:

```bash
ZEUX_LIVE=1 go test ./internal/install -run TestResolveLive -v
```

## Ambiente

As versões de Go e Node são fixadas pelo [mise](https://mise.jdx.dev) em
`mise.toml`. Com o mise instalado:

```bash
mise install
```

## Rodando o daemon

```bash
mise exec -- go run ./cmd/zeuxd
```

O servidor escuta em `127.0.0.1:7777`. Use `--debug` para log de requisições e
`--addr` para trocar a porta.

## API

Todas as rotas ficam sob `/api/v1`.

| Método | Rota | Função |
|---|---|---|
| GET | `/health` | Verifica se o daemon está no ar |
| GET | `/consent` | Consulta o consentimento e devolve o texto da política |
| POST | `/consent` | Registra ou revoga o consentimento |
| POST | `/hardware/scan` | Executa o scan (exige consentimento) |
| GET | `/hardware` | Devolve o último scan |
| GET | `/consoles/verdicts` | Parecer por console |
| GET | `/emulators` | Quais emuladores estão instalados |
| GET | `/emulator-sources` | Fontes oficiais de download |
| POST | `/emulators/{id}/install` | Instalação 1-click |
| DELETE | `/emulators/{id}/install` | Remove a instalação gerenciada |
| GET | `/installs`, `/installs/{id}` | Progresso das instalações |
| GET/POST | `/custom-emulators` | Emuladores cadastrados pelo usuário |
| DELETE | `/custom-emulators/{id}` | Remove um cadastro |
| POST | `/games/preview` | Monta o comando sem executar |
| POST | `/games/launch` | Abre o jogo |
| GET | `/sessions` | Histórico e tempo de jogo |

Referência completa em [docs/api.md](docs/api.md).

O scan é bloqueado no servidor enquanto não houver consentimento explícito — a
verificação não depende da interface.

```bash
curl -X POST http://127.0.0.1:7777/api/v1/consent -d '{"granted":true}'
```

## Testes

```bash
mise exec -- go test ./...
```

## Estrutura

```
cmd/zeuxd/           entrypoint do daemon
internal/hardware/   detecção de CPU, GPU e memória (um arquivo de GPU por SO)
internal/verdict/    catálogo de consoles e motor de parecer
internal/consent/    registro do consentimento do usuário
internal/emulator/   adapters de emulador, descoberta e sessões de jogo
internal/api/        rotas HTTP
docs/                arquitetura, API, adapters, ADRs e roadmap
```

## Princípios do parecer

- O scan só roda após consentimento explícito, e o usuário pode revogá-lo.
- O texto descreve o hardware pelos números reais, sem julgar o computador.
- Quando um patamar melhor não é alcançado, o componente que barra é nomeado —
  em vez de uma nota única que não diz o que fazer a respeito.
- Informação que não pôde ser lida é declarada como tal, e o parecer sai
  marcado como parcial em vez de fingir certeza.
