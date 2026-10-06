````
Você vai fazer um levantamento técnico em três emuladores instalados neste
Windows, para o projeto ZeuX (um launcher de emuladores). Objetivo: descobrir,
com o programa rodando de verdade — não pela documentação —, como tirar um
PRINT DE TELA usando só o CONTROLE (um botão ou uma combinação de botões), e
como o emulador grava esse atalho no arquivo de configuração. Fale comigo em
português.

EMULADORES
- DuckStation (PS1): %AppData%\ZeuX\emulators\ps1\emuladores\duckstation\
  config: settings.ini (na mesma pasta, modo portátil)
- PCSX2 (PS2): %AppData%\ZeuX\emulators\ps2\emuladores\pcsx2\
  config: inis\PCSX2.ini (se ainda não migrou: Documentos\PCSX2\inis\PCSX2.ini)
- RetroArch: onde estiver instalado (procure retroarch.exe); config: retroarch.cfg

REGRAS
- Não instale nem atualize nada.
- Antes de mexer em cada arquivo de config, copie para <arquivo>.bak-cowork.
- Mude as opções SEMPRE pela interface do emulador, com o emulador fechando
  normalmente depois (eles gravam a config ao fechar). Depois compare o
  arquivo com a cópia e anote exatamente o que mudou.
- Use um controle Xbox (ou o que estiver conectado) — diga qual é.
- Nunca copie, mova ou envie jogos (ROM/ISO). Só abra um que já esteja no disco.
- Se precisar que eu aperte botões no controle, pare e me peça.
- Não invente: o que não conseguir confirmar, marque "não confirmado".

PARA CADA EMULADOR
1. Atalho de print que já vem de fábrica (teclado e/ou controle): qual é, e
   onde aparece no arquivo de config (seção, chave, valor).
2. Pela interface, ligue o print a uma COMBINAÇÃO DE BOTÕES do controle que
   não atrapalhe o jogo. Sugestão: Select/Back + R3 (clique do analógico
   direito). Se o emulador não aceitar combinação, use um botão só e diga.
   Anote o texto EXATO que o emulador grava no arquivo para essa combinação
   (ex.: no DuckStation algo como "Screenshot = SDL-0/Back & SDL-0/RightStick";
   no RetroArch, chaves input_..._btn e input_enable_hotkey_btn).
3. Confirme que teclado e controle podem ficar ligados juntos no mesmo atalho,
   e como isso fica no arquivo.
4. Abra um jogo, aperte a combinação no controle 2 vezes (uma em janela, outra
   em tela cheia) e me diga:
   - se o print saiu nas duas vezes (em tela cheia às vezes sai preto);
   - a pasta exata onde o arquivo foi parar;
   - o nome exato do arquivo (formato, data/hora, título ou código do jogo);
   - formato da imagem (png/jpg) e resolução.
5. Pastas: há uma opção de pasta de prints? Qual seção/chave? Há opção de
   separar prints por jogo (PCSX2: "OrganizeScreenshotsByGame")? Qual o
   padrão?
6. RetroArch especificamente: qual é o "botão de hotkey" (enable_hotkey) e se
   ele precisa ficar apertado junto; e o que vale screenshot_directory por
   padrão (se for "default", onde o print foi parar de fato).
7. No fim, devolva cada opção mudada ao valor original pela interface.

RELATÓRIO
Grave em %UserProfile%\Desktop\zeux-pesquisa\PRINTS.md, um bloco por emulador:

  ## <Emulador> <versão>
  - Controle usado: <modelo> — handler/dispositivo como aparece no arquivo: <texto>
  - Atalho de fábrica: <tecla/botão> — arquivo: <seção> / <chave> = <valor>
  - Combinação no controle configurada: <botões>
    Texto gravado: <seção> / <chave> = <valor exato, linha por linha>
  - Teclado + controle juntos: <sim/não, e como fica no arquivo>
  - Print em janela: <ok/falhou>  | em tela cheia: <ok/preto/falhou>
  - Pasta dos prints: <caminho completo>  (config: <seção>/<chave>, padrão <valor>)
  - Nome do arquivo: <exemplo real>  | formato: <png/jpg> <resolução>
  - Prints por jogo: <opção, chave, padrão>
  - Não confirmado: <lista e motivo>
````
