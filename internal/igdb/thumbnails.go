// Fonte de capa alternativa ao IGDB — decisão do Douglas (2026-09-06):
// amigos sem conta pessoal do IGDB/Twitch dependiam da credencial de teste
// embutida (defaultCredentials, em credentials.go), compartilhada por todo
// mundo que não conecta a própria conta e sujeita ao mesmo limite de cota
// da Twitch/IGDB para todos ao mesmo tempo — com o app se espalhando, isso
// vira "a busca simplesmente não funciona" pra quem chega depois.
//
// libretro-thumbnails (https://github.com/libretro-thumbnails) é o
// repositório de capas mantido pelo próprio projeto Libretro/RetroArch,
// público e sem chave nem login: a URL da imagem é previsível a partir do
// nome do console e do nome de arquivo da ROM, sempre que esse nome já
// segue a convenção No-Intro/TOSEC ("Super Mario Bros. (World)") — é assim
// que a maior parte das ROMs em circulação já vem nomeada, então não exige
// nada novo do usuário.
//
// Decisão de arquitetura (Douglas, 2026-09-06): fica dentro deste pacote em
// vez de um pacote novo — as duas fontes resolvem o mesmo problema (capa de
// jogo) e compartilham infraestrutura (checkHost/httpClient/downloadImage,
// client.go); só o provedor muda. ScrapeManager.processGame (scrape.go)
// tenta esta fonte primeiro (sem custo de cota, sem conta) e só cai para o
// IGDB se ela não achar a capa — reduz a dependência da cota compartilhada
// para quem tem uma coleção nomeada nesse padrão, sem tirar o IGDB do
// caminho (cobre os consoles que faltam aqui e os arquivos com nome fora do
// padrão).
//
// Todos os nomes de pasta em libretroSystemFolders foram confirmados ao
// vivo em 2026-09-08 contra a listagem raiz de thumbnails.libretro.com e o
// `Named_Boxarts/` de cada um (ver o comentário do mapa) — versões
// anteriores deste comentário avisavam que a maioria não tinha sido
// verificada (rede indisponível no ambiente de dev da época); com rede
// disponível nesta sessão, a auditoria fechou os 32 que fazem sentido.
// Um nome errado não quebraria nada mesmo assim (o console correspondente
// simplesmente nunca acharia capa por aqui e cairia pro IGDB, exatamente
// como um console fora do mapa) — mas a garantia agora é mais forte que
// "não deveria quebrar".
package igdb

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
)

// var, não const, pelo mesmo motivo de twitchTokenURL/igdbAPIBase/
// igdbImageBase em client.go: os testes deste pacote substituem por um
// httptest.NewServer, nunca fazendo requisição de rede real.
var libretroThumbnailsBase = "https://thumbnails.libretro.com"

// Sempre "Named_Boxarts" — é a categoria de capa (existem também
// "Named_Snaps" e "Named_Titles" no mesmo repositório, screenshot de
// jogo e tela de título; não é isso que a biblioteca do ZeuX mostra).
const libretroThumbnailCategory = "Named_Boxarts"

// libretroSystemFolders mapeia console_id (catálogo do ZeuX,
// internal/verdict/data/consoles.json) para o nome de pasta correspondente
// no libretro-thumbnails. Console ausente daqui cai direto pro IGDB — sem
// erro, sem tentativa.
//
// Auditoria completa em 2026-09-08 (achado investigando por que a busca de
// capa não funcionava com a credencial compartilhada suspensa no Twitch):
// com acesso de rede de verdade a thumbnails.libretro.com nesta sessão,
// conferimos os 33 consoles do catálogo contra a listagem raiz do
// repositório e o `Named_Boxarts/` de cada pasta candidata. Resultado: 32
// dos 33 têm pasta real e populada — a suposição antiga de que só geração 5
// ou anterior tinha cobertura "ampla e consistente" nunca foi medida,
// era só uma hipótese conservadora. Cobertura desigual entre eles (de
// ~9 imagens em "Sony - PlayStation Vita" a mais de 7000 em "Nintendo -
// Nintendo DS") não é motivo para excluir — uma pasta rala só significa
// mais misses individuais, nunca erro: uma imagem que não existe cai pro
// IGDB exatamente como um console fora do mapa.
//
// "arcade" é o único de fora, por um motivo diferente do que o comentário
// antigo dizia: o `FBNeo - Arcade Games/Named_Boxarts/` de fato existe e
// usa título por extenso ("Street Fighter II - The World Warrior..."), não
// o código curto que a hipótese antiga citava — mas romName aqui vem do
// nome do arquivo da ROM no disco do usuário, e um romset MAME/FBNeo
// sempre nomeia esse arquivo pelo código curto interno do jogo (ex.:
// "sf2.zip"), nunca pelo título. Sem uma tabela código→título (que o
// ZeuX não tem, e MAME/FBNeo não expõem de forma simples), o nome que
// chega aqui nunca bate com o nome do arquivo lá — não é falta de
// cobertura, é incompatibilidade da chave de busca.
var libretroSystemFolders = map[string]string{
	"atari2600":    "Atari - 2600",
	"nes":          "Nintendo - Nintendo Entertainment System",
	"snes":         "Nintendo - Super Nintendo Entertainment System",
	"n64":          "Nintendo - Nintendo 64",
	"gb":           "Nintendo - Game Boy",
	"gbc":          "Nintendo - Game Boy Color",
	"gba":          "Nintendo - Game Boy Advance",
	"virtualboy":   "Nintendo - Virtual Boy",
	"mastersystem": "Sega - Master System - Mark III",
	"megadrive":    "Sega - Mega Drive - Genesis",
	"gamegear":     "Sega - Game Gear",
	"segacd":       "Sega - Mega-CD - Sega CD",
	"sega32x":      "Sega - 32X",
	"saturn":       "Sega - Saturn",
	"dreamcast":    "Sega - Dreamcast",
	"ps1":          "Sony - PlayStation",
	"ps2":          "Sony - PlayStation 2",
	"ps3":          "Sony - PlayStation 3",
	"psp":          "Sony - PlayStation Portable",
	"vita":         "Sony - PlayStation Vita",
	"neogeo":       "SNK - Neo Geo",
	"ngpc":         "SNK - Neo Geo Pocket Color",
	"wonderswan":   "Bandai - WonderSwan",
	"3do":          "The 3DO Company - 3DO",
	"pcengine":     "NEC - PC Engine - TurboGrafx 16",
	"gamecube":     "Nintendo - GameCube",
	"wii":          "Nintendo - Wii",
	"wiiu":         "Nintendo - Wii U",
	"nds":          "Nintendo - Nintendo DS",
	"3ds":          "Nintendo - Nintendo 3DS",
	"xbox":         "Microsoft - Xbox",
	"xbox360":      "Microsoft - Xbox 360",
}

// FetchLibretroThumbnail tenta baixar a capa de romName (nome de arquivo da
// ROM sem extensão, mas COM as etiquetas de região/revisão que
// library.TitleFromFilename remove pra exibição — ex. "Super Mario Bros.
// (World)", não "Super Mario Bros") para consoleID, gravando em destPath.
//
// Devolve (false, nil) sempre que a busca não é possível ou não achou nada
// — console fora de libretroSystemFolders, ou a imagem não existe lá (404).
// Nenhum dos dois é erro: cabe a quem chama (scrape.go) seguir para o IGDB
// em qualquer um dos casos. Só uma falha de rede de verdade, ou resposta
// grande demais, vira erro.
func FetchLibretroThumbnail(ctx context.Context, consoleID, romName, destPath string) (bool, error) {
	folder, ok := libretroSystemFolders[consoleID]
	if !ok {
		return false, nil
	}

	reqURL := fmt.Sprintf("%s/%s/%s/%s.png",
		libretroThumbnailsBase,
		url.PathEscape(folder),
		libretroThumbnailCategory,
		url.PathEscape(romName),
	)

	status, err := downloadImage(ctx, reqURL, destPath)
	if err != nil {
		return false, fmt.Errorf("baixando capa do libretro-thumbnails: %w", err)
	}
	if status != http.StatusOK {
		return false, nil
	}
	return true, nil
}
