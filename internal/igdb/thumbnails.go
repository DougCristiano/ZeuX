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
// Para coleções nomeadas à mão (sem a etiqueta de região, "God of War I" em
// vez de "God of War", "&" no lugar de "_"), FetchLibretroThumbnail tenta um
// leque de variações do nome — ver libretroNameCandidates — antes de desistir
// e deixar o IGDB assumir. É o que impede o IGDB de virar, na prática, a
// fonte primária (relato do Douglas, 2026-09-09).
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
	"strings"
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

// libretroRegionTags são as etiquetas de região/idioma mais comuns da
// convenção No-Intro, em ordem aproximada de frequência. O libretro-thumbnails
// indexa a capa pelo nome de arquivo No-Intro *com* a etiqueta ("Super Mario
// World (USA).png"), mas uma ROM organizada à mão quase nunca a carrega
// ("Super Mario World"). libretroNameCandidates anexa cada uma destas ao
// título nu para cobrir esse caso — a causa mais comum de a capa "não ser
// achada" e o lote cair pro IGDB (relato do Douglas, 2026-09-09).
var libretroRegionTags = []string{
	"(USA)",
	"(World)",
	"(USA, Europe)",
	"(Europe)",
	"(Japan, USA)",
	"(Japan)",
}

// libretroSanitizeReplacer espelha a regra de nomeação do repositório
// libretro-thumbnails: estes caracteres do título viram "_" no nome do
// arquivo publicado (ex.: "Sonic & Knuckles" -> "Sonic _ Knuckles.png").
// Sem aplicar a mesma troca antes de montar a URL, todo jogo com um desses
// caracteres no nome erraria o caminho.
var libretroSanitizeReplacer = strings.NewReplacer(
	"&", "_", "*", "_", "/", "_", ":", "_", "`", "_",
	"<", "_", ">", "_", "?", "_", `\`, "_", "|", "_", `"`, "_",
)

// libretroNameCandidates devolve, em ordem de tentativa, os nomes de arquivo a
// experimentar em libretro-thumbnails para romName (nome do arquivo da ROM sem
// extensão). A primeira entrada é sempre o nome exato — o comportamento
// antigo; as seguintes são variações que cobrem coleções nomeadas fora da
// convenção No-Intro estrita.
func libretroNameCandidates(romName string) []string {
	romName = strings.TrimSpace(romName)

	// Formas "base" do título, cada uma depois combinada com as etiquetas de
	// região. Ordem importa: a primeira base é a mais provável.
	bases := []string{romName}

	// Um numeral romano "I" solto no fim ("God of War I") costuma ser adição
	// de quem organizou a coleção — o primeiro título de uma série no No-Intro
	// (e no libretro-thumbnails) não leva o "I" ("God of War"). "II"/"III"/…
	// são reais e não são tocados.
	if strings.HasSuffix(romName, " I") && !strings.HasSuffix(romName, " II") {
		bases = append(bases, strings.TrimSuffix(romName, " I"))
	}

	// Nome que já traz uma etiqueta entre parênteses: tenta também sem ela.
	// Cobre etiqueta à moda antiga ("(U)", "(E)") que não bate com a do
	// repositório, e a etiqueta é então re-anexada da lista canônica abaixo.
	if stripped := stripTrailingParenTags(romName); stripped != "" && stripped != romName {
		bases = append(bases, stripped)
	}

	seen := make(map[string]bool)
	var out []string
	add := func(name string) {
		name = libretroSanitizeReplacer.Replace(strings.TrimSpace(name))
		if name == "" || seen[name] {
			return
		}
		seen[name] = true
		out = append(out, name)
	}

	for _, base := range bases {
		add(base) // nome exato desta base primeiro
		if hasTrailingParenTag(base) {
			continue // já tem etiqueta própria; não empilha região por cima
		}
		for _, tag := range libretroRegionTags {
			add(base + " " + tag)
		}
	}
	return out
}

func hasTrailingParenTag(name string) bool {
	return strings.HasSuffix(strings.TrimSpace(name), ")")
}

// stripTrailingParenTags remove uma ou mais etiquetas "(...)" grudadas no fim
// do nome ("Jogo (USA) (Rev 1)" -> "Jogo"). Não mexe em parênteses no meio do
// título ("Tom Clancy's ... (2002)" no meio ficaria, mas No-Intro não nomeia
// assim — etiqueta é sempre sufixo).
func stripTrailingParenTags(name string) string {
	name = strings.TrimSpace(name)
	for strings.HasSuffix(name, ")") {
		open := strings.LastIndex(name, "(")
		if open < 0 {
			break
		}
		name = strings.TrimSpace(name[:open])
	}
	return name
}

// FetchLibretroThumbnail tenta baixar a capa de romName (nome de arquivo da
// ROM sem extensão, mas COM as etiquetas de região/revisão que
// library.TitleFromFilename remove pra exibição — ex. "Super Mario Bros.
// (World)", não "Super Mario Bros") para consoleID, gravando em destPath.
// Tenta, em ordem, o nome exato e depois as variações de libretroNameCandidates
// (etiqueta de região anexada, "&" -> "_", etc.) — para na primeira que existir.
//
// Devolve (false, nil) sempre que a busca não é possível ou não achou nada
// — console fora de libretroSystemFolders, ou nenhuma variação existe lá
// (404 em todas). Nenhum dos dois é erro: cabe a quem chama (scrape.go)
// seguir para o IGDB em qualquer um dos casos. Só uma falha de rede de
// verdade, ou resposta grande demais, vira erro — e, mesmo assim, só depois
// de todas as variações falharem, para não abortar por um soluço de rede numa
// única tentativa.
func FetchLibretroThumbnail(ctx context.Context, consoleID, romName, destPath string) (bool, error) {
	folder, ok := libretroSystemFolders[consoleID]
	if !ok {
		return false, nil
	}

	var firstErr error
	for _, name := range libretroNameCandidates(romName) {
		reqURL := fmt.Sprintf("%s/%s/%s/%s.png",
			libretroThumbnailsBase,
			url.PathEscape(folder),
			libretroThumbnailCategory,
			url.PathEscape(name),
		)

		status, err := downloadImage(ctx, reqURL, destPath)
		if err != nil {
			// Guarda a primeira falha de rede e segue: outra variação ainda
			// pode funcionar. Só propaga se nenhuma funcionar.
			if firstErr == nil {
				firstErr = fmt.Errorf("baixando capa do libretro-thumbnails: %w", err)
			}
			continue
		}
		if status == http.StatusOK {
			return true, nil
		}
	}

	if firstErr != nil {
		return false, firstErr
	}
	return false, nil
}
