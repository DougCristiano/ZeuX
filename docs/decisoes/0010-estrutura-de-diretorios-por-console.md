# 0010 — Estrutura de diretórios gerenciados por console

**Status:** Aceito (parcial — só a parte de emuladores está implementada)

## Contexto

`emulator.ManagedRoot()` organizava as instalações 1-click de forma achatada:
`<UserConfigDir>/ZeuX/emulators/<adapter_id>/`, um diretório por emulador,
sem nenhuma relação visível com o console que ele atende.

O Douglas apontou que isso não é intuitivo para quem for abrir a pasta
manualmente: encontrar "onde está o PS2" exige saber que o adapter se chama
`pcsx2`, não `ps2`. A proposta foi organizar por console — uma pasta por
console, com os emuladores dela dentro, e (quando a biblioteca existir)
jogos, saves e capas também dentro da mesma pasta.

O complicador: alguns emuladores atendem mais de um console. RetroArch
sozinho cobre 24 sistemas (`internal/emulator/retroarch.go`,
`defaultCoreByConsole`); Dolphin cobre GameCube e Wii. Uma pasta por console
com o emulador "dentro" duplicaria o RetroArch 24 vezes — dezenas de vezes
o tamanho do binário, e uma atualização precisaria sincronizar 24 cópias.

## Decisão

**Estrutura de emuladores (implementada em 2026-08-02):**

```
<ManagedRoot>/
  <console_id>/emuladores/<adapter_id>/   # emulador de console único
  compartilhados/<adapter_id>/            # emulador de mais de um console
```

Um adapter cai em um lado ou outro conforme `len(adapter.Consoles())`:
exatamente 1 console vai para dentro da pasta desse console; 0 ou mais de 1
vai para `compartilhados/` (`emulator.ManagedEmulatorDir`). Hoje só RetroArch
e Dolphin caem em `compartilhados/` — os outros 11 adapters embutidos
atendem um console cada.

`console_id` é o mesmo identificador do catálogo (`ps1`, `ps2`, `n64`...),
não um nome de exibição — estabilidade importa mais que fricção
(ver `defaultCoreByConsole` e `consoles.json` para a mesma convenção).

**Estrutura de jogos (documentada, não implementada):** a intenção de
produto é que cada pasta de console também tenha uma subpasta `jogos/`, com
save states, capas e informações do jogo. Isso depende da Sprint D (banco de
dados + varredura de biblioteca + scraper de metadados), que ainda não foi
desenhada — implementar a parte de jogos agora seria desenhar às cegas.

**Pendência explícita, não resolvida por este ADR:** o Douglas pediu que o
arquivo do jogo (a ROM) também fique guardado dentro dessa estrutura. Isso
contraria a regra não-negociável já registrada no `CLAUDE.md` ("o ZeuX nunca
copia, distribui, sugere fonte ou facilita transferência de ROMs") — regra
que existe por risco legal (a maioria das ROMs é material protegido por
direito autoral; um app que copia esse arquivo para dentro da própria
estrutura gerenciada passa a "manusear" o conteúdo, não só apontar para ele).
Fica registrado aqui como decisão em aberto, não decidida por este documento
— precisa ser resolvida explicitamente antes da Sprint D avançar na parte de
jogos.

## Consequências

**Positivas**

- Abrir a pasta gerenciada e achar "onde está o PS1" não exige saber o nome
  interno do adapter.
- Nenhuma duplicação de binário para RetroArch/Dolphin.
- A regra é dirigida por dado (`len(consoles)`), não por uma lista
  hardcoded de exceções — um adapter novo com mais de um console cai em
  `compartilhados/` automaticamente, sem precisar lembrar de adicioná-lo a
  lugar nenhum.

**Negativas / custos aceitos**

- Dois emuladores (RetroArch, Dolphin) não ficam "dentro" de nenhum console
  específico — quem for procurar o RetroArch pela pasta do NES não vai achar
  o binário lá, só (quando a Sprint D existir) os jogos/saves daquele
  console. Custo aceito: a alternativa (duplicar) é pior.
- `findBinary` e `ManagedEmulatorDir` (`internal/emulator/discovery.go`) e
  `promote`/`Uninstall` (`internal/install/manager.go`) agora precisam saber
  quantos consoles um adapter atende antes de resolver o caminho — mais uma
  consulta ao registro de adapters (`emulator.NewRegistry().ByID`), que era
  desnecessária na estrutura achatada.
- A pendência do parágrafo anterior (guardar a ROM em si) segue sem decisão.

## Gatilho para revisão

Reabrir a parte de jogos quando a Sprint D for desenhada (banco de dados,
varredura de biblioteca, scraper) — e resolver explicitamente, antes disso,
se o arquivo do jogo entra ou não na estrutura gerenciada.
