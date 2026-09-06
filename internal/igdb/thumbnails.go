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
// AVISO DE HONESTIDADE (mesma regra do CLAUDE.md para flags de adapter
// nunca validadas contra binário real): os nomes de pasta em
// libretroSystemFolders não foram confirmados contra o repositório real
// nesta sessão — o ambiente de desenvolvimento não tem acesso de rede a
// thumbnails.libretro.com para testar ao vivo. Um nome errado não quebra
// nada (o console correspondente simplesmente nunca acha capa por aqui e
// cai pro IGDB, exatamente como um console fora do mapa) — mas também não
// economiza cota pra ele até alguém confirmar a string certa em
// https://github.com/libretro-thumbnails. Douglas, confira a lista abaixo
// antes de contar com ela.
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
// De propósito só cobre consoles de geração 5 ou anterior mais o PS1: é a
// faixa onde o libretro-thumbnails historicamente tem cobertura ampla e
// consistente. "arcade" fica de fora mesmo tendo pasta lá (MAME/FBNeo) —
// romset de arcade usa código curto (ex.: "sf2"), não título por extenso,
// incompatível com a convenção de nome que esta busca assume.
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
	"neogeo":       "SNK - Neo Geo",
	"ngpc":         "SNK - Neo Geo Pocket Color",
	"wonderswan":   "Bandai - WonderSwan",
	"3do":          "The 3DO Company - 3DO",
	"pcengine":     "NEC - PC Engine - TurboGrafx 16",
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
