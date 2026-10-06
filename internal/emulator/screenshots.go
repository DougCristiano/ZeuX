package emulator

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Prints dos jogos (2026-10-06, pedido do Douglas): o print é tirado pelo
// atalho do próprio emulador; ao fim da sessão o ZeuX MOVE (decisão dele)
// os arquivos de imagem criados durante ela para a galeria do jogo. A sessão
// é o que liga print e jogo — o mesmo método do estado de "continuar".
//
// A galeria fica em <AppData>\ZeuX\screenshots\<console>\<nome do arquivo da
// ROM>\ — fora de emulators\<console>\jogos\<id>\ de propósito: aquela pasta
// é apagada quando a pasta de jogos é removida, e o id do jogo muda quando
// ela é apontada de novo. O nome da ROM é estável.
//
// Pastas de origem, lidas no código-fonte de cada emulador (não observadas
// com o binário rodando — ver docs/decisoes.md):
//   - DuckStation: <dados>\screenshots, ou [Folders] Screenshots
//     (core/settings.cpp, EmuFolders::LoadConfig).
//   - PCSX2: <dados>\snaps, ou [Folders] Snapshots, com subpasta por jogo
//     quando "OrganizeScreenshotsByGame" está ligado (GSRenderer.cpp) — por
//     isso desce um nível.
//   - RetroArch: screenshot_directory do retroarch.cfg. O padrão grava ao
//     lado do jogo, na pasta de ROMs do usuário, onde o ZeuX não mexe; por
//     isso, quando a chave está vazia, o ZeuX aponta para uma pasta de
//     entrada dele (ensureRetroArchScreenshotDir).

var imageExts = map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".bmp": true, ".webp": true}

// ScreenshotsRoot é a raiz das galerias.
func ScreenshotsRoot() (string, error) {
	dir, err := AppDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "screenshots"), nil
}

// GameScreenshotsSubdir é o caminho da galeria de um jogo relativo à raiz:
// <console>/<nome do arquivo da ROM, sem extensão, sanitizado>.
func GameScreenshotsSubdir(consoleID, romPath string) string {
	base := filepath.Base(romPath)
	if i := strings.LastIndex(base, "."); i > 0 {
		base = base[:i]
	}
	return filepath.Join(sanitizeDirName(consoleID), sanitizeDirName(base))
}

// sanitizeDirName troca o que o Windows não aceita em nome de pasta.
func sanitizeDirName(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r < 32 || strings.ContainsRune(`<>:"/\|?*`, r) {
			b.WriteRune('_')
			continue
		}
		b.WriteRune(r)
	}
	out := strings.TrimRight(strings.TrimSpace(b.String()), ".")
	if out == "" {
		return "_"
	}
	return out
}

// screenshotSourceDirs devolve de onde recolher os prints de um emulador e
// se é preciso descer um nível (subpasta por jogo).
func screenshotSourceDirs(adapterID string, install Installation) (dirs []string, nested bool) {
	switch adapterID {
	case "duckstation":
		settings, ok := duckStationSettingsPath(install)
		if !ok {
			return nil, false
		}
		root := filepath.Dir(settings)
		dir := filepath.Join(root, "screenshots")
		if data, err := os.ReadFile(settings); err == nil {
			if v, has := parseINI(data).get("Folders", "Screenshots"); has && strings.TrimSpace(v) != "" {
				dir = resolveUnder(root, v)
			}
		}
		return []string{dir}, false
	case "pcsx2":
		data, err := pcsx2DataDir()
		if err != nil {
			return nil, false
		}
		dir := filepath.Join(data, "snaps")
		if path, err := pcsx2ConfigPath(); err == nil {
			if raw, err := os.ReadFile(path); err == nil {
				if v, has := parseINI(raw).get("Folders", "Snapshots"); has && strings.TrimSpace(v) != "" {
					dir = resolveUnder(data, v)
				}
			}
		}
		return []string{dir}, true
	case "retroarch":
		path, err := retroArchConfigPath(install)
		if err != nil {
			return nil, false
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, false
		}
		v, _ := parseRetroArchCfg(raw).get("screenshot_directory")
		v = strings.TrimSpace(v)
		if v == "" || v == "default" {
			return nil, false
		}
		return []string{v}, false
	}
	return nil, false
}

func resolveUnder(root, v string) string {
	v = strings.TrimSpace(v)
	if filepath.IsAbs(v) {
		return v
	}
	return filepath.Join(root, v)
}

// RetroArchScreenshotInbox é a pasta de entrada que o ZeuX dá ao RetroArch.
func RetroArchScreenshotInbox() (string, error) {
	root, err := ScreenshotsRoot()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, "_entrada", "retroarch"), nil
}

// ensureRetroArchScreenshotDir aponta screenshot_directory do RetroArch para
// a pasta de entrada do ZeuX quando a chave está vazia ou "default" — sem
// isso o print cairia na pasta de ROMs do usuário. Um caminho que a pessoa
// já escolheu é respeitado (e recolhido de lá).
func ensureRetroArchScreenshotDir(install Installation) error {
	path, err := retroArchConfigPath(install)
	if err != nil {
		return nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	cfg := parseRetroArchCfg(raw)
	if v, _ := cfg.get("screenshot_directory"); strings.TrimSpace(v) != "" && strings.TrimSpace(v) != "default" {
		return nil
	}
	inbox, err := RetroArchScreenshotInbox()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(inbox, 0o755); err != nil {
		return err
	}
	cfg.set("screenshot_directory", inbox)
	if err := backupBeforeFirstWrite(path); err != nil {
		return err
	}
	return os.WriteFile(path, cfg.bytes(), 0o644)
}

// newScreenshotsSince lista as imagens criadas a partir de `since`.
func newScreenshotsSince(dirs []string, nested bool, since time.Time) []string {
	var out []string
	visit := func(dir string, depth int, self func(string, int)) {
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, e := range entries {
			p := filepath.Join(dir, e.Name())
			if e.IsDir() {
				if depth < 1 {
					self(p, depth+1)
				}
				continue
			}
			if !imageExts[strings.ToLower(filepath.Ext(e.Name()))] {
				continue
			}
			if info, err := e.Info(); err == nil && !info.ModTime().Before(since.Add(-2*time.Second)) {
				out = append(out, p)
			}
		}
	}
	var walk func(string, int)
	walk = func(dir string, depth int) {
		if !nested {
			depth = 1
		}
		visit(dir, depth, walk)
	}
	for _, d := range dirs {
		walk(d, 0)
	}
	return out
}

// moveFile move entre pastas; se o rename falhar (outro volume), copia e
// apaga a origem só depois de a cópia terminar.
func moveFile(from, to string) error {
	if err := os.Rename(from, to); err == nil {
		return nil
	}
	in, err := os.Open(from)
	if err != nil {
		return err
	}
	out, err := os.Create(to)
	if err != nil {
		in.Close()
		return err
	}
	_, copyErr := io.Copy(out, in)
	in.Close()
	if err := out.Close(); copyErr == nil {
		copyErr = err
	}
	if copyErr != nil {
		os.Remove(to)
		return copyErr
	}
	return os.Remove(from)
}

// uniquePath evita sobrescrever um print com o mesmo nome.
func uniquePath(dir, name string) string {
	p := filepath.Join(dir, name)
	if _, err := os.Stat(p); os.IsNotExist(err) {
		return p
	}
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	for i := 2; ; i++ {
		p = filepath.Join(dir, fmt.Sprintf("%s (%d)%s", stem, i, ext))
		if _, err := os.Stat(p); os.IsNotExist(err) {
			return p
		}
	}
}

// collectScreenshots roda ao fim de uma sessão: move para a galeria do jogo
// os prints que o emulador gravou durante ela. Devolve quantos moveu.
func (l *Launcher) collectScreenshots(session Session, install Installation) int {
	dirs, nested := screenshotSourceDirs(session.AdapterID, install)
	if len(dirs) == 0 {
		return 0
	}
	files := newScreenshotsSince(dirs, nested, session.StartedAt)
	if len(files) == 0 {
		return 0
	}
	root, err := ScreenshotsRoot()
	if err != nil {
		return 0
	}
	dest := filepath.Join(root, GameScreenshotsSubdir(session.ConsoleID, session.ROMPath))
	if err := os.MkdirAll(dest, 0o755); err != nil {
		l.logger.Warn("não foi possível criar a galeria do jogo", "erro", err)
		return 0
	}
	moved := 0
	for _, f := range files {
		if err := moveFile(f, uniquePath(dest, filepath.Base(f))); err != nil {
			l.logger.Warn("não foi possível mover o print para a galeria", "arquivo", f, "erro", err)
			continue
		}
		moved++
	}
	if moved > 0 {
		l.logger.Info("prints movidos para a galeria", "sessao", session.ID, "quantidade", moved)
	}
	return moved
}

// Screenshot é um print na galeria de um jogo.
type Screenshot struct {
	Name      string    `json:"name"`
	SizeBytes int64     `json:"size_bytes"`
	TakenAt   time.Time `json:"taken_at"`
}

// ListGameScreenshots lista a galeria de um jogo, do mais novo ao mais velho.
func ListGameScreenshots(consoleID, romPath string) []Screenshot {
	root, err := ScreenshotsRoot()
	if err != nil {
		return []Screenshot{}
	}
	return listScreenshotsIn(filepath.Join(root, GameScreenshotsSubdir(consoleID, romPath)))
}

func listScreenshotsIn(dir string) []Screenshot {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return []Screenshot{}
	}
	out := []Screenshot{}
	for _, e := range entries {
		if e.IsDir() || !imageExts[strings.ToLower(filepath.Ext(e.Name()))] {
			continue
		}
		if info, err := e.Info(); err == nil {
			out = append(out, Screenshot{Name: e.Name(), SizeBytes: info.Size(), TakenAt: info.ModTime()})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].TakenAt.After(out[j].TakenAt) })
	return out
}

// ValidScreenshotName recusa nome com caminho — a API recebe o nome de fora.
func ValidScreenshotName(name string) bool {
	return name != "" && name == filepath.Base(name) && !strings.ContainsAny(name, `/\`) &&
		name != "." && name != ".." && imageExts[strings.ToLower(filepath.Ext(name))]
}

// DeleteGameScreenshot apaga um print da galeria.
func DeleteGameScreenshot(consoleID, romPath, name string) error {
	if !ValidScreenshotName(name) {
		return fmt.Errorf("nome de print inválido")
	}
	root, err := ScreenshotsRoot()
	if err != nil {
		return err
	}
	return os.Remove(filepath.Join(root, GameScreenshotsSubdir(consoleID, romPath), name))
}
