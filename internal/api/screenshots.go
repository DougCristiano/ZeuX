package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/doufl/zeux/internal/emulator"
	"github.com/doufl/zeux/internal/library"
)

// Galeria de prints por jogo (2026-10-06). Os arquivos chegam pela coleta
// do fim de sessão (emulator/screenshots.go); aqui só se lista, apaga, serve
// e escolhe um como banner.

// screenshotURLFor monta a URL servida por handleScreenshotFile. Cada trecho
// é escapado: nome de ROM tem espaço, parêntese e às vezes "#", que cortaria
// a URL no meio.
func screenshotURLFor(game library.Game, name string) string {
	parts := strings.Split(filepath.ToSlash(emulator.GameScreenshotsSubdir(game.ConsoleID, game.Path)), "/")
	parts = append(parts, name)
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	return "/api/v1/screenshots/" + strings.Join(parts, "/")
}

// bannerURLFor devolve a URL do banner só se o arquivo ainda existe — um
// print apagado por fora do ZeuX não pode deixar a tela com imagem quebrada.
func bannerURLFor(game library.Game) string {
	if game.BannerName == "" {
		return ""
	}
	root, err := emulator.ScreenshotsRoot()
	if err != nil {
		return ""
	}
	if _, err := os.Stat(filepath.Join(root, emulator.GameScreenshotsSubdir(game.ConsoleID, game.Path), game.BannerName)); err != nil {
		return ""
	}
	return screenshotURLFor(game, game.BannerName)
}

type screenshotView struct {
	emulator.Screenshot
	URL string `json:"url"`
}

func (s *Server) screenshotGame(w http.ResponseWriter, r *http.Request) (library.Game, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_id", "O identificador do jogo deve ser numérico.")
		return library.Game{}, false
	}
	game, ok, err := s.library.GameByID(r.Context(), id)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_read_failed", err.Error())
		return library.Game{}, false
	}
	if !ok {
		s.writeError(w, http.StatusNotFound, "not_found", fmt.Sprintf("Nenhum jogo com o id %d.", id))
		return library.Game{}, false
	}
	return game, true
}

// handleGameScreenshots lista a galeria de um jogo e a pasta dela no disco
// (para o botão "abrir pasta").
func (s *Server) handleGameScreenshots(w http.ResponseWriter, r *http.Request) {
	game, ok := s.screenshotGame(w, r)
	if !ok {
		return
	}
	shots := emulator.ListGameScreenshots(game.ConsoleID, game.Path)
	views := make([]screenshotView, 0, len(shots))
	for _, sh := range shots {
		views = append(views, screenshotView{Screenshot: sh, URL: screenshotURLFor(game, sh.Name)})
	}
	dir := ""
	if root, err := emulator.ScreenshotsRoot(); err == nil {
		dir = filepath.Join(root, emulator.GameScreenshotsSubdir(game.ConsoleID, game.Path))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"screenshots": views,
		"folder":      dir,
		"banner_name": game.BannerName,
	})
}

// handleAddGameScreenshots copia para a galeria imagens que a pessoa tirou
// por conta própria (2026-10-06, pedido do Douglas). Copia, não move: ao
// contrário dos prints do emulador, que caem numa pasta de trabalho dele,
// estes são arquivos da pessoa, em qualquer lugar do disco — sumir com eles
// da pasta original seria surpresa. Cada arquivo é validado como imagem pelos
// bytes (copyValidatedImage, o mesmo da troca de capa); um que falha não
// impede os outros e volta em `errors`.
func (s *Server) handleAddGameScreenshots(w http.ResponseWriter, r *http.Request) {
	game, ok := s.screenshotGame(w, r)
	if !ok {
		return
	}
	var body struct {
		SourcePaths []string `json:"source_paths"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.SourcePaths) == 0 {
		s.writeError(w, http.StatusBadRequest, "invalid_body", `O corpo deve ser um JSON com {"source_paths": ["..."]}.`)
		return
	}
	dir, err := emulator.GameScreenshotsDir(game.ConsoleID, game.Path)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "screenshots_root_unavailable", "Não foi possível localizar a pasta de prints do ZeuX.")
		return
	}
	type addError struct {
		Path    string `json:"path"`
		Message string `json:"message"`
	}
	added := []screenshotView{}
	failed := []addError{}
	for _, src := range body.SourcePaths {
		name := filepath.Base(src)
		if !emulator.IsScreenshotFile(name) {
			failed = append(failed, addError{src, "Formato não aceito na galeria: use PNG, JPG, BMP ou WebP."})
			continue
		}
		dest := emulator.UniqueScreenshotPath(dir, name)
		if err := copyValidatedImageMax(src, dest, maxScreenshotBytes); err != nil {
			msg := err.Error()
			switch {
			case errors.Is(err, fs.ErrNotExist):
				msg = fmt.Sprintf("O arquivo %q não existe.", src)
			case errors.Is(err, errInvalidImage):
				msg = errInvalidImage.Error()
			case errors.Is(err, errImageTooLarge):
				msg = "A imagem passa de 64 MB, o limite da galeria."
			}
			failed = append(failed, addError{src, msg})
			continue
		}
		// A data da cópia, não a do original: o print entra no topo da
		// galeria, onde a pessoa acabou de colocá-lo.
		now := time.Now()
		_ = os.Chtimes(dest, now, now)
		info, err := os.Stat(dest)
		if err != nil {
			continue
		}
		added = append(added, screenshotView{
			Screenshot: emulator.Screenshot{Name: filepath.Base(dest), SizeBytes: info.Size(), TakenAt: info.ModTime()},
			URL:        screenshotURLFor(game, filepath.Base(dest)),
		})
	}
	if len(added) == 0 {
		msg := "Nenhuma imagem foi adicionada."
		if len(failed) > 0 {
			msg = failed[0].Message
		}
		s.writeError(w, http.StatusBadRequest, "invalid_image", msg)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"added": added, "errors": failed})
}

// handleDeleteGameScreenshot apaga um print. Se era o banner, o banner é
// limpo junto — senão a tela continuaria pedindo um arquivo que não existe.
func (s *Server) handleDeleteGameScreenshot(w http.ResponseWriter, r *http.Request) {
	game, ok := s.screenshotGame(w, r)
	if !ok {
		return
	}
	name := r.PathValue("name")
	if !emulator.ValidScreenshotName(name) {
		s.writeError(w, http.StatusBadRequest, "invalid_screenshot", "Nome de print inválido.")
		return
	}
	if err := emulator.DeleteGameScreenshot(game.ConsoleID, game.Path, name); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			s.writeError(w, http.StatusNotFound, "not_found", "Este print não está mais na galeria.")
			return
		}
		s.writeError(w, http.StatusInternalServerError, "screenshot_delete_failed", fmt.Sprintf("Não foi possível apagar o print: %v", err))
		return
	}
	if game.BannerName == name {
		if err := s.library.SetBanner(r.Context(), game.ID, ""); err != nil {
			s.logger.Warn("não foi possível limpar o banner do jogo", "jogo", game.ID, "erro", err)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleSetGameBanner escolhe (ou limpa, com nome vazio) o print de banner.
func (s *Server) handleSetGameBanner(w http.ResponseWriter, r *http.Request) {
	game, ok := s.screenshotGame(w, r)
	if !ok {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_body", "O corpo deve ser um JSON com o campo \"name\".")
		return
	}
	if body.Name != "" {
		if !emulator.ValidScreenshotName(body.Name) {
			s.writeError(w, http.StatusBadRequest, "invalid_screenshot", "Nome de print inválido.")
			return
		}
		found := false
		for _, sh := range emulator.ListGameScreenshots(game.ConsoleID, game.Path) {
			if sh.Name == body.Name {
				found = true
				break
			}
		}
		if !found {
			s.writeError(w, http.StatusNotFound, "not_found", "Este print não está na galeria do jogo.")
			return
		}
	}
	if err := s.library.SetBanner(r.Context(), game.ID, body.Name); err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_write_failed", err.Error())
		return
	}
	game.BannerName = body.Name
	writeJSON(w, http.StatusOK, map[string]any{"banner_url": bannerURLFor(game)})
}

// recentScreenshot é um print da faixa "últimos prints" da tela inicial.
type recentScreenshot struct {
	screenshotView
	GameID    int64  `json:"game_id"`
	GameTitle string `json:"game_title"`
	ConsoleID string `json:"console_id"`
}

// handleRecentScreenshots devolve os prints mais novos de toda a biblioteca.
// A galeria é chaveada por console + nome da ROM, não pelo id do jogo; a
// junção com a biblioteca é feita aqui. Galeria de jogo que saiu da
// biblioteca fica de fora (não há tela para onde levar o clique).
func (s *Server) handleRecentScreenshots(w http.ResponseWriter, r *http.Request) {
	limit := 12
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 60 {
		limit = v
	}
	games, err := s.library.ListAllGames(r.Context(), "", false, false, false)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_read_failed", err.Error())
		return
	}
	bySubdir := make(map[string]library.Game, len(games))
	for _, g := range games {
		bySubdir[emulator.GameScreenshotsSubdir(g.ConsoleID, g.Path)] = g
	}
	root, err := emulator.ScreenshotsRoot()
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"screenshots": []recentScreenshot{}})
		return
	}
	type found struct {
		game library.Game
		shot emulator.Screenshot
	}
	var all []found
	consoles, _ := os.ReadDir(root)
	for _, c := range consoles {
		if !c.IsDir() || strings.HasPrefix(c.Name(), "_") {
			continue
		}
		gameDirs, _ := os.ReadDir(filepath.Join(root, c.Name()))
		for _, gd := range gameDirs {
			if !gd.IsDir() {
				continue
			}
			game, ok := bySubdir[filepath.Join(c.Name(), gd.Name())]
			if !ok {
				continue
			}
			for _, sh := range emulator.ListGameScreenshots(game.ConsoleID, game.Path) {
				all = append(all, found{game, sh})
			}
		}
	}
	sort.Slice(all, func(i, j int) bool { return all[i].shot.TakenAt.After(all[j].shot.TakenAt) })
	if len(all) > limit {
		all = all[:limit]
	}
	out := make([]recentScreenshot, 0, len(all))
	for _, f := range all {
		out = append(out, recentScreenshot{
			screenshotView: screenshotView{Screenshot: f.shot, URL: screenshotURLFor(f.game, f.shot.Name)},
			GameID:         f.game.ID,
			GameTitle:      f.game.Title,
			ConsoleID:      f.game.ConsoleID,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"screenshots": out})
}

// handleScreenshotFile serve as imagens da galeria. Cache curto: um print
// não muda depois de gravado, mas o nome pode ser reaproveitado se a pessoa
// apagar e tirar outro igual.
func (s *Server) handleScreenshotFile(w http.ResponseWriter, r *http.Request) {
	root, err := emulator.ScreenshotsRoot()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "screenshots_root_unavailable",
			"Não foi possível localizar a pasta de prints do ZeuX.")
		return
	}
	w.Header().Set("Cache-Control", "max-age="+strconv.Itoa(int(time.Hour/time.Second)))
	http.StripPrefix("/api/v1/screenshots/", http.FileServer(http.Dir(root))).ServeHTTP(w, r)
}
