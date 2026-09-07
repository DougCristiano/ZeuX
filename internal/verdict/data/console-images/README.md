# Imagens dos consoles

Logo oficial de cada plataforma (IGDB, campo `platform_logo`), um arquivo
`<console_id>.png` por console do catálogo — gerado por
`cmd/generate-console-images`, nunca pelo `zeuxd` em runtime.

**Vazio até alguém rodar o gerador.** Decisão do Douglas em 2026-09-07 (ver
`docs/decisoes.md`, "Identidade visual por console"): reverte a decisão
anterior de nunca usar marca de fabricante — risco de marca aceito e
conhecido, não ignorado. `ConsoleIcon` (sigla estilizada) continua como
reserva sempre que o console não tiver imagem aqui — sem IGDB configurado ao
rodar o gerador, plataforma sem `platform_logo` no IGDB, ou falha de rede
pontual.

Este `README.md` existe só para o diretório não ficar vazio antes da
primeira geração — `//go:embed data/console-images/*` (`images.go`) recusa
compilar se o padrão não casar arquivo nenhum. Ele não é servido pela API.

Rodar o gerador:

```powershell
mise exec -- go run ./cmd/generate-console-images -client-id SEU_CLIENT_ID -client-secret SEU_CLIENT_SECRET
```
