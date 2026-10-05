package emulator

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Modo portátil do PCSX2 (2026-10-05, pedido do Douglas: tudo de cada
// emulador dentro da pasta do ZeuX, nada em Documentos).
//
// Lido no código-fonte (pcsx2/Pcsx2Config.cpp, EmuFolders::
// ShouldUsePortableMode/SetDataDirectory): se existir "portable.ini" ou
// "portable.txt" na pasta do executável, a pasta de dados passa a ser essa
// (portable.txt pode conter um caminho relativo; vazio = a própria pasta).
// "inis" fica sempre dentro da pasta de dados. A nota de 2026-09-11 que dizia
// "o PCSX2 ignora modo portátil" foi um teste sem esse arquivo.
//
// No Linux o PCSX2 é AppImage e o "executável" que ele enxerga está dentro do
// squashfs montado — o marcador ao lado do .AppImage não é lido. Por isso o
// modo portátil é só no Windows.

// PCSX2PortableMarker é o arquivo que liga o modo portátil.
const PCSX2PortableMarker = "portable.ini"

// pcsx2ManagedDir é a pasta da instalação gerenciada (o .exe fica direto
// nela — ver findBinary).
func pcsx2ManagedDir() (string, bool) {
	root, err := ManagedRoot()
	if err != nil {
		return "", false
	}
	return ManagedEmulatorDir(root, "pcsx2", []string{"ps2"}), true
}

// pcsx2PortableDir devolve a pasta de dados da instalação gerenciada quando
// ela está em modo portátil.
func pcsx2PortableDir() (string, bool) {
	dir, ok := pcsx2ManagedDir()
	if !ok {
		return "", false
	}
	if _, err := os.Stat(filepath.Join(dir, PCSX2PortableMarker)); err == nil {
		return dir, true
	}
	// portable.txt vazio também liga (o próprio PCSX2 aceita os dois).
	if data, err := os.ReadFile(filepath.Join(dir, "portable.txt")); err == nil && strings.TrimSpace(string(data)) == "" {
		return dir, true
	}
	return "", false
}

// pcsx2LegacyDataDir é a pasta de dados fora do modo portátil
// (Documentos\PCSX2 no Windows) — ver pcsx2DataDir.
func pcsx2LegacyDataDir() (string, error) {
	switch runtime.GOOS {
	case "linux":
		dir, err := os.UserConfigDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(dir, "PCSX2"), nil
	case "windows":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, "Documents", "PCSX2"), nil
	default:
		return "", fmt.Errorf("caminho de configuração do PCSX2 não confirmado neste sistema operacional")
	}
}

// pcsx2MigratedItems são as pastas de dados que a migração leva de
// Documentos\PCSX2 para a pasta do emulador (levantamento do Douglas,
// 2026-10-05). Logs ficam de fora: são recriados a cada execução.
var pcsx2MigratedItems = []string{
	"inis", "memcards", "sstates", "bios", "cache", "cheats", "covers",
	"gamesettings", "inputprofiles", "patches", "textures", "snaps", "videos",
}

// PCSX2MigrationItem é uma pasta da migração, com o que existe dos dois lados.
type PCSX2MigrationItem struct {
	Name        string `json:"name"`
	Files       int    `json:"files"`
	Bytes       int64  `json:"bytes"`
	TargetFiles int    `json:"target_files"`
	TargetBytes int64  `json:"target_bytes"`
}

// PCSX2PortableStatus diz se o modo portátil está ligado e o que ainda mora
// em Documentos.
type PCSX2PortableStatus struct {
	Supported bool                 `json:"supported"`
	Managed   bool                 `json:"managed"`
	Portable  bool                 `json:"portable"`
	TargetDir string               `json:"target_dir,omitempty"`
	LegacyDir string               `json:"legacy_dir,omitempty"`
	Legacy    bool                 `json:"legacy_exists"`
	Items     []PCSX2MigrationItem `json:"items"`
}

func dirStats(dir string) (files int, bytes int64) {
	_ = filepath.WalkDir(dir, func(_ string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || isMacJunk(d.Name()) {
			return nil
		}
		if info, err := d.Info(); err == nil {
			files++
			bytes += info.Size()
		}
		return nil
	})
	return files, bytes
}

// isMacJunk: lixo de zip feito no Mac (__MACOSX, .DS_Store, "._arquivo").
func isMacJunk(name string) bool {
	return name == "__MACOSX" || name == ".DS_Store" || strings.HasPrefix(name, "._")
}

// PCSX2Portable descreve o estado atual — sem tocar em nada.
func PCSX2Portable() PCSX2PortableStatus {
	st := PCSX2PortableStatus{Supported: runtime.GOOS == "windows", Items: []PCSX2MigrationItem{}}
	target, ok := pcsx2ManagedDir()
	if ok {
		if _, err := os.Stat(target); err == nil {
			st.Managed = true
			st.TargetDir = target
		}
	}
	_, st.Portable = pcsx2PortableDir()
	if legacy, err := pcsx2LegacyDataDir(); err == nil {
		st.LegacyDir = legacy
		if info, err := os.Stat(legacy); err == nil && info.IsDir() {
			st.Legacy = true
			for _, name := range pcsx2MigratedItems {
				src := filepath.Join(legacy, name)
				if _, err := os.Stat(src); err != nil {
					continue
				}
				item := PCSX2MigrationItem{Name: name}
				item.Files, item.Bytes = dirStats(src)
				if st.TargetDir != "" {
					item.TargetFiles, item.TargetBytes = dirStats(filepath.Join(st.TargetDir, name))
				}
				st.Items = append(st.Items, item)
			}
		}
	}
	return st
}

// ErrPCSX2NotManaged: só a instalação feita pelo ZeuX vira portátil.
var ErrPCSX2NotManaged = errors.New("o modo portátil do PCSX2 só vale para a instalação feita pelo ZeuX")

// EnablePCSX2Portable liga o modo portátil numa instalação sem dados em
// Documentos (instalação nova). Com dados lá, quem liga é a migração — ligar
// antes faria o PCSX2 "esquecer" BIOS, cartões e states.
func EnablePCSX2Portable() error {
	if runtime.GOOS != "windows" {
		return nil
	}
	dir, ok := pcsx2ManagedDir()
	if !ok {
		return ErrPCSX2NotManaged
	}
	if _, err := os.Stat(dir); err != nil {
		return ErrPCSX2NotManaged
	}
	return os.WriteFile(filepath.Join(dir, PCSX2PortableMarker), nil, 0o644)
}

// PCSX2HasLegacyData diz se Documentos\PCSX2 tem configuração de verdade.
func PCSX2HasLegacyData() bool {
	legacy, err := pcsx2LegacyDataDir()
	if err != nil {
		return false
	}
	_, err = os.Stat(filepath.Join(legacy, "inis", "PCSX2.ini"))
	return err == nil
}

// MigratePCSX2ToPortable copia Documentos\PCSX2 para a pasta do emulador,
// confere quantidade e tamanho de cada pasta, e só então liga o modo
// portátil. Nunca apaga nada da origem (isso é RemovePCSX2LegacyData, com
// confirmação separada) e nunca sobrescreve arquivo que já exista no
// destino. Quem chama garante o PCSX2 fechado.
func MigratePCSX2ToPortable() (PCSX2PortableStatus, error) {
	if runtime.GOOS != "windows" {
		return PCSX2PortableStatus{}, fmt.Errorf("o modo portátil do PCSX2 só é usado no Windows")
	}
	target, ok := pcsx2ManagedDir()
	if !ok {
		return PCSX2PortableStatus{}, ErrPCSX2NotManaged
	}
	if _, err := os.Stat(target); err != nil {
		return PCSX2PortableStatus{}, ErrPCSX2NotManaged
	}
	legacy, err := pcsx2LegacyDataDir()
	if err != nil {
		return PCSX2PortableStatus{}, err
	}
	if err := migratePCSX2Dirs(legacy, target); err != nil {
		return PCSX2PortableStatus{}, err
	}
	if err := os.WriteFile(filepath.Join(target, PCSX2PortableMarker), nil, 0o644); err != nil {
		return PCSX2PortableStatus{}, fmt.Errorf("ligando o modo portátil: %w", err)
	}
	return PCSX2Portable(), nil
}

// migratePCSX2Dirs é o miolo testável da migração (origem e destino
// explícitos).
func migratePCSX2Dirs(legacy, target string) error {
	for _, name := range pcsx2MigratedItems {
		src := filepath.Join(legacy, name)
		if _, err := os.Stat(src); err != nil {
			continue
		}
		dst := filepath.Join(target, name)
		if err := copyTreeNoOverwrite(src, dst); err != nil {
			return fmt.Errorf("copiando %s: %w", name, err)
		}
		// Confere arquivo a arquivo antes de ligar qualquer coisa.
		if missing := missingInTarget(src, dst); missing != "" {
			return fmt.Errorf("a cópia de %s não confere (falta %s no destino) — o modo portátil não foi ligado", name, missing)
		}
	}
	return rewritePCSX2AbsoluteFolders(filepath.Join(target, "inis", "PCSX2.ini"), legacy)
}

// missingInTarget devolve o primeiro arquivo da origem (relativo) que não
// existe no destino, ou "" quando tudo está lá. Compara presença, não
// tamanho: depois da migração o PCSX2 e a reescrita de [Folders] mudam o
// PCSX2.ini, e isso não é perda.
func missingInTarget(src, dst string) string {
	missing := ""
	_ = filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil || missing != "" {
			return nil
		}
		if isMacJunk(d.Name()) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(src, path)
		if _, err := os.Stat(filepath.Join(dst, rel)); err != nil {
			missing = rel
		}
		return nil
	})
	return missing
}

// copyTreeNoOverwrite copia src para dst sem sobrescrever o que já existe no
// destino e sem levar lixo de zip do Mac.
func copyTreeNoOverwrite(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if isMacJunk(d.Name()) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		out := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(out, 0o755)
		}
		if _, err := os.Stat(out); err == nil {
			return nil
		}
		return copyFileContents(path, out)
	})
}

func copyFileContents(from, to string) error {
	in, err := os.Open(from)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(to)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// rewritePCSX2AbsoluteFolders troca, em [Folders], caminhos absolutos que
// apontavam para dentro de Documentos\PCSX2 pelo relativo equivalente — os
// relativos ("memcards", "bios\\...") continuam valendo, porque o PCSX2 os
// resolve a partir da pasta de dados. Sem isto, apagar a pasta antiga
// quebraria o BIOS de quem tinha caminho absoluto.
func rewritePCSX2AbsoluteFolders(iniPath, legacy string) error {
	data, err := os.ReadFile(iniPath)
	if err != nil {
		return nil
	}
	ini := parseINI(data)
	prefix := strings.ToLower(filepath.Clean(legacy)) + string(filepath.Separator)
	changed := false
	for _, line := range ini.lines {
		if line.section != "Folders" || line.key == "" {
			continue
		}
		v, _ := ini.get("Folders", line.key)
		if strings.HasPrefix(strings.ToLower(filepath.Clean(v)), prefix) {
			ini.set("Folders", line.key, filepath.Clean(v)[len(prefix):])
			changed = true
		}
	}
	if !changed {
		return nil
	}
	return os.WriteFile(iniPath, ini.bytes(), 0o644)
}

// RemovePCSX2LegacyData apaga Documentos\PCSX2 depois da migração — só se o
// modo portátil está ligado e cada pasta migrada confere no destino.
func RemovePCSX2LegacyData() error {
	st := PCSX2Portable()
	if !st.Portable {
		return fmt.Errorf("o modo portátil do PCSX2 ainda não está ligado — migre antes de apagar a pasta antiga")
	}
	for _, name := range pcsx2MigratedItems {
		src := filepath.Join(st.LegacyDir, name)
		if _, err := os.Stat(src); err != nil {
			continue
		}
		if missing := missingInTarget(src, filepath.Join(st.TargetDir, name)); missing != "" {
			return fmt.Errorf("%s ainda não está na pasta do emulador — nada foi apagado", filepath.Join(name, missing))
		}
	}
	if !st.Legacy {
		return nil
	}
	return os.RemoveAll(st.LegacyDir)
}
