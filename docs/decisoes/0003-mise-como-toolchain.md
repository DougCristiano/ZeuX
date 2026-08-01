# 0003 — `mise` como gerenciador de toolchain

**Status:** Aceito

## Contexto

O projeto usa duas linguagens com versões que precisam ser as mesmas em qualquer
máquina: Go (daemon) e Node (front-end da Fase 2). Rust entra depois.

A escolha natural seria o **asdf**, padrão de fato para isso. Mas o asdf não roda
nativamente no Windows — depende de shims em shell POSIX, exigindo WSL ou Git
Bash. O desenvolvimento principal do ZeuX acontece no Windows 11, e o app é
multiplataforma: uma ferramenta que só funciona bem em dois dos três SOs alvo é
uma ferramenta errada.

Alternativas consideradas e por que não:

- **Instalação manual do Go e do Node** — funciona, mas nada garante que outra
  máquina (ou o CI, quando existir) use a mesma versão.
- **Toolchain automática do Go** (`go` obedecendo a diretiva `go 1.26.5` do
  `go.mod`) — resolve o Go, não resolve o Node nem o Rust.
- **Docker/devcontainer** — pesado para um app desktop que precisa ler o
  hardware real da máquina e executar processos gráficos locais. Contraproducente
  para este projeto especificamente.

## Decisão

Usar o **[mise](https://mise.jdx.dev)**, que é um binário único em Rust, roda
nativamente no Windows, Linux e macOS, e é compatível com o ecossistema de
plugins do asdf.

Toda invocação de ferramenta passa por `mise exec --`:

```bash
mise exec -- go test ./...
mise exec -- go run ./cmd/zeuxd
```

`mise.toml` fica versionado na raiz. `.mise.local.toml` está no `.gitignore`,
para overrides locais que não devem vazar para o repositório.

## Consequências

**Positivas**

- Uma única ferramenta cobre Go, Node e, futuramente, Rust, nos três SOs.
- `mise install` reproduz o ambiente inteiro numa máquina nova.
- Não exige WSL nem Git Bash no Windows.

**Negativas / custos aceitos**

- Toda documentação e todo script precisam carregar o prefixo `mise exec --`,
  o que é verboso.
- No Windows, o `mise` instalado via WinGet não fica no `PATH` por padrão — daí
  o prefixo longo que aparece nos comandos deste repositório:
  ```powershell
  $env:PATH = "C:\Users\doufl\AppData\Local\Microsoft\WinGet\Packages\jdx.mise_Microsoft.Winget.Source_8wekyb3d8bbwe\mise\bin;$env:PATH"
  ```
- Uma dependência a mais para quem for contribuir.

## Pendência conhecida

**O `mise.toml` atual não fixa versões.** O conteúdo é:

```toml
[tools]
go = "latest"
node = "lts"
```

`latest` e `lts` são aliases móveis: hoje resolvem para Go 1.26.5 e Node 24.18.1,
mas resolverão para outra coisa em qualquer máquina configurada depois de um
release novo. Isso derrota parcialmente o propósito da decisão — reprodutibilidade.

O `go.mod` declara `go 1.26.5`, o que dá um piso para o Go, mas nada equivalente
existe para o Node.

Fixar as versões exatas está no [roadmap](../roadmap.md) e deve ser feito antes
de a Fase 2 começar, porque é quando o Node passa a importar de verdade.
