package emulator

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Saves de um jogo, para a tela do jogo (2026-10-05): cartão de memória,
// save states por slot, estado de "continuar", e backup/restauração.

// GameDiscID é o serial (e, no PCSX2, o CRC) do disco de um jogo, como o
// emulador o viu.
type GameDiscID struct {
	ROMPath   string
	AdapterID string
	Serial    string
	CRC       string
}

// DiscIDRepository guarda o serial por jogo. Capacidade opcional do
// SessionRepository, como ResumeRepository.
type DiscIDRepository interface {
	RecordDiscID(ctx context.Context, id GameDiscID) error
	DiscIDs(ctx context.Context) (map[string]GameDiscID, error)
}

// SaveFileInfo é um arquivo de save no disco.
type SaveFileInfo struct {
	Path       string    `json:"path"`
	Name       string    `json:"name"`
	SizeBytes  int64     `json:"size_bytes"`
	ModifiedAt time.Time `json:"modified_at"`
	// Slot do save state; -1 = estado de "continuar" (resume). Ausente em
	// cartão de memória.
	Slot *int `json:"slot,omitempty"`
	// Backup = cópia do state anterior que o emulador guarda sozinho.
	Backup bool `json:"backup,omitempty"`
}

// GameSaves é o que existe no disco para um jogo.
type GameSaves struct {
	AdapterID string `json:"adapter_id"`
	// MemoryCards são os cartões do jogo — ou o cartão compartilhado.
	MemoryCards []SaveFileInfo `json:"memory_cards"`
	// MemoryCardShared: o cartão é o mesmo para todos os jogos (PCSX2).
	MemoryCardShared bool `json:"memory_card_shared,omitempty"`
	// MemoryCardsApproximate: o nome do cartão foi adivinhado (DuckStation
	// com tipo de cartão que não é por nome de arquivo).
	MemoryCardsApproximate bool           `json:"memory_cards_approximate,omitempty"`
	SaveStates             []SaveFileInfo `json:"save_states"`
	// Serial do disco; vazio = ainda desconhecido (o jogo nunca foi fechado
	// pelo ZeuX), e então os states ficam de fora.
	Serial    string `json:"serial,omitempty"`
	CardsDir  string `json:"cards_dir,omitempty"`
	StatesDir string `json:"states_dir,omitempty"`
}

func fileInfo(path string) (SaveFileInfo, bool) {
	st, err := os.Stat(path)
	if err != nil || st.IsDir() {
		return SaveFileInfo{}, false
	}
	return SaveFileInfo{Path: path, Name: filepath.Base(path), SizeBytes: st.Size(), ModifiedAt: st.ModTime()}, true
}

// FindGameSaves localiza os saves de um jogo no emulador dado.
func FindGameSaves(adapterID string, install Installation, romPath string, id GameDiscID) (GameSaves, bool) {
	switch adapterID {
	case "pcsx2":
		return findPCSX2GameSaves(romPath, id)
	case "duckstation":
		ds, ok := FindDuckStationGameSaves(install, romPath, id.Serial)
		if !ok {
			return GameSaves{}, false
		}
		cards, states, _, _ := duckStationDataDirs(install)
		out := GameSaves{AdapterID: adapterID, MemoryCards: []SaveFileInfo{}, SaveStates: []SaveFileInfo{},
			MemoryCardsApproximate: ds.MemoryCardsApproximate, Serial: ds.Serial, CardsDir: cards, StatesDir: states}
		for _, p := range ds.MemoryCards {
			if fi, ok := fileInfo(p); ok {
				out.MemoryCards = append(out.MemoryCards, fi)
			}
		}
		for _, p := range ds.SaveStates {
			if fi, ok := fileInfo(p); ok {
				name := strings.TrimSuffix(strings.ToLower(fi.Name), ".sav")
				if i := strings.LastIndex(name, "_"); i >= 0 {
					if name[i+1:] == "resume" {
						fi.Slot = intPtr(-1)
					} else if n, err := strconv.Atoi(name[i+1:]); err == nil {
						fi.Slot = intPtr(n)
					}
				}
				out.SaveStates = append(out.SaveStates, fi)
			}
		}
		sortStates(out.SaveStates)
		return out, true
	default:
		return GameSaves{}, false
	}
}

func intPtr(n int) *int { return &n }

func sortStates(states []SaveFileInfo) {
	sort.SliceStable(states, func(i, j int) bool {
		si, sj := -2, -2
		if states[i].Slot != nil {
			si = *states[i].Slot
		}
		if states[j].Slot != nil {
			sj = *states[j].Slot
		}
		if si != sj {
			return si < sj
		}
		return !states[i].Backup && states[j].Backup
	})
}

// pcsx2Dirs resolve as pastas de cartão e de states e os nomes dos cartões,
// a partir do PCSX2.ini ([Folders] MemoryCards/Savestates relativos à pasta
// de dados; [MemoryCards] Slot1_Filename/Slot2_Filename) — padrões
// observados: memcards, sstates, Mcd001.ps2, Mcd002.ps2.
func pcsx2Dirs() (data, cards, states string, cardFiles []string, ok bool) {
	data, err := pcsx2DataDir()
	if err != nil {
		return "", "", "", nil, false
	}
	cards, states = filepath.Join(data, "memcards"), filepath.Join(data, "sstates")
	cardFiles = []string{"Mcd001.ps2", "Mcd002.ps2"}
	if path, err := pcsx2ConfigPath(); err == nil {
		if raw, err := os.ReadFile(path); err == nil {
			ini := parseINI(raw)
			resolve := func(v string) string {
				v = strings.TrimSpace(v)
				if filepath.IsAbs(v) {
					return v
				}
				return filepath.Join(data, v)
			}
			if v, has := ini.get("Folders", "MemoryCards"); has && strings.TrimSpace(v) != "" {
				cards = resolve(v)
			}
			if v, has := ini.get("Folders", "Savestates"); has && strings.TrimSpace(v) != "" {
				states = resolve(v)
			}
			for i, key := range []string{"Slot1_Filename", "Slot2_Filename"} {
				if v, has := ini.get("MemoryCards", key); has && strings.TrimSpace(v) != "" {
					cardFiles[i] = strings.TrimSpace(v)
				}
			}
		}
	}
	return data, cards, states, cardFiles, true
}

// pcsx2StateName reconhece "<serial> (<CRC>).NN.p2s", ".NN.p2s.backup" e
// ".resume.p2s" (VMManager::GetSaveStateFileName, código-fonte; nomes
// observados no Windows).
var pcsx2StateName = regexp.MustCompile(`^(.+) \(([0-9A-Fa-f]{8})\)\.(resume|\d{2})\.p2s(\.backup)?$`)

func findPCSX2GameSaves(romPath string, id GameDiscID) (GameSaves, bool) {
	_, cardsDir, statesDir, cardFiles, ok := pcsx2Dirs()
	if !ok {
		return GameSaves{}, false
	}
	out := GameSaves{AdapterID: "pcsx2", MemoryCards: []SaveFileInfo{}, SaveStates: []SaveFileInfo{},
		MemoryCardShared: true, Serial: id.Serial, CardsDir: cardsDir, StatesDir: statesDir}
	for _, name := range cardFiles {
		if fi, ok := fileInfo(filepath.Join(cardsDir, name)); ok {
			out.MemoryCards = append(out.MemoryCards, fi)
		}
	}
	if id.Serial == "" {
		return out, true
	}
	entries, err := os.ReadDir(statesDir)
	if err != nil {
		return out, true
	}
	for _, e := range entries {
		m := pcsx2StateName.FindStringSubmatch(e.Name())
		if m == nil || !strings.EqualFold(m[1], id.Serial) || (id.CRC != "" && !strings.EqualFold(m[2], id.CRC)) {
			continue
		}
		fi, ok := fileInfo(filepath.Join(statesDir, e.Name()))
		if !ok {
			continue
		}
		if m[3] == "resume" {
			fi.Slot = intPtr(-1)
		} else {
			n, _ := strconv.Atoi(m[3])
			fi.Slot = intPtr(n)
		}
		fi.Backup = m[4] != ""
		out.SaveStates = append(out.SaveStates, fi)
	}
	sortStates(out.SaveStates)
	return out, true
}

// pcsx2LogIDs tira o último "Serial:" e "CRC:" do emulog.txt
// (VMManager.cpp: "  Serial: {}" e "  CRC: {:08X}" ao dar boot).
func pcsx2LogIDs(logPath string) (serial, crc string) {
	f, err := os.Open(logPath)
	if err != nil {
		return "", ""
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if v, ok := strings.CutPrefix(line, "Serial:"); ok && strings.TrimSpace(v) != "" {
			serial = strings.TrimSpace(v)
		}
		if v, ok := strings.CutPrefix(line, "CRC:"); ok && strings.TrimSpace(v) != "" {
			crc = strings.ToUpper(strings.TrimSpace(v))
		}
	}
	return serial, crc
}

// recordDiscID roda ao fim de uma sessão do PCSX2: se o log foi escrito
// durante ela, guarda serial e CRC para este jogo.
func (l *Launcher) recordDiscID(session Session) {
	repo, ok := l.sessions.(DiscIDRepository)
	if !ok || session.AdapterID != "pcsx2" {
		return
	}
	data, err := pcsx2DataDir()
	if err != nil {
		return
	}
	logPath := filepath.Join(data, "logs", "emulog.txt")
	info, err := os.Stat(logPath)
	if err != nil || info.ModTime().Before(session.StartedAt.Add(-2*time.Second)) {
		return
	}
	serial, crc := pcsx2LogIDs(logPath)
	if serial == "" {
		return
	}
	if err := repo.RecordDiscID(context.Background(), GameDiscID{
		ROMPath: session.ROMPath, AdapterID: "pcsx2", Serial: serial, CRC: crc,
	}); err != nil {
		l.logger.Warn("não foi possível guardar o serial do jogo", "sessao", session.ID, "erro", err)
	}
}

// DiscIDFor devolve o serial conhecido de um jogo: o guardado pela sessão
// ou, na falta dele, o tirado do nome do estado de retomada.
func (l *Launcher) DiscIDFor(ctx context.Context, romPath string) GameDiscID {
	if repo, ok := l.sessions.(DiscIDRepository); ok {
		if ids, err := repo.DiscIDs(ctx); err == nil {
			if id, ok := ids[romPath]; ok {
				return id
			}
		}
	}
	if states, err := l.ResumeStates(ctx); err == nil {
		if st, ok := states[romPath]; ok {
			name := filepath.Base(st.StatePath)
			switch st.AdapterID {
			case "duckstation":
				return GameDiscID{ROMPath: romPath, AdapterID: st.AdapterID, Serial: DuckStationSerialFromResumeState(st.StatePath)}
			case "pcsx2":
				if m := pcsx2StateName.FindStringSubmatch(name); m != nil {
					return GameDiscID{ROMPath: romPath, AdapterID: st.AdapterID, Serial: m[1], CRC: strings.ToUpper(m[2])}
				}
			}
		}
	}
	return GameDiscID{ROMPath: romPath}
}

// --- Backup e restauração ---

// SaveBackup é um backup feito pelo ZeuX dos saves de um jogo.
type SaveBackup struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	Files     int       `json:"files"`
	// HasMemoryCard: o backup inclui o cartão (que no PCSX2 é compartilhado
	// entre todos os jogos).
	HasMemoryCard bool `json:"has_memory_card"`
}

type backupManifestEntry struct {
	Original   string `json:"original"`
	Stored     string `json:"stored"`
	MemoryCard bool   `json:"memory_card"`
}

// GameSaveBackupDir é onde ficam os backups de um jogo:
// <AppData>\ZeuX\backups\<console>\<id do jogo>\.
func GameSaveBackupDir(consoleID string, gameID int64) (string, error) {
	dir, err := AppDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "backups", consoleID, strconv.FormatInt(gameID, 10)), nil
}

// BackupGameSaves copia cartões e states do jogo para uma pasta nova com
// carimbo de hora, com um manifest.json dizendo de onde veio cada arquivo.
func BackupGameSaves(baseDir string, saves GameSaves) (SaveBackup, error) {
	stamp := time.Now().UTC()
	id := stamp.Format("20060102-150405")
	dir := filepath.Join(baseDir, id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return SaveBackup{}, fmt.Errorf("criando a pasta do backup: %w", err)
	}
	var manifest []backupManifestEntry
	add := func(files []SaveFileInfo, card bool) error {
		for i, f := range files {
			stored := fmt.Sprintf("%02d-%s", len(manifest)+i, f.Name)
			if err := copyFileContents(f.Path, filepath.Join(dir, stored)); err != nil {
				return fmt.Errorf("copiando %s: %w", f.Name, err)
			}
			manifest = append(manifest, backupManifestEntry{Original: f.Path, Stored: stored, MemoryCard: card})
		}
		return nil
	}
	if err := add(saves.MemoryCards, true); err != nil {
		return SaveBackup{}, err
	}
	if err := add(saves.SaveStates, false); err != nil {
		return SaveBackup{}, err
	}
	if len(manifest) == 0 {
		os.RemoveAll(dir)
		return SaveBackup{}, fmt.Errorf("não há save deste jogo para guardar")
	}
	raw, _ := json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), raw, 0o644); err != nil {
		return SaveBackup{}, err
	}
	return SaveBackup{ID: id, CreatedAt: stamp, Files: len(manifest), HasMemoryCard: len(saves.MemoryCards) > 0}, nil
}

func readManifest(dir string) ([]backupManifestEntry, error) {
	raw, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		return nil, err
	}
	var m []backupManifestEntry
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, err
	}
	return m, nil
}

// ListGameSaveBackups lista os backups de um jogo, do mais novo ao mais velho.
func ListGameSaveBackups(baseDir string) []SaveBackup {
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return []SaveBackup{}
	}
	out := []SaveBackup{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		m, err := readManifest(filepath.Join(baseDir, e.Name()))
		if err != nil {
			continue
		}
		created, _ := time.Parse("20060102-150405", e.Name())
		b := SaveBackup{ID: e.Name(), CreatedAt: created, Files: len(m)}
		for _, f := range m {
			b.HasMemoryCard = b.HasMemoryCard || f.MemoryCard
		}
		out = append(out, b)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID > out[j].ID })
	return out
}

// RestoreGameSaves copia um backup de volta para os lugares de origem.
// `includeMemoryCard` é separado de propósito: no PCSX2 o cartão é de todos
// os jogos, e restaurá-lo volta o save de TODOS. Quem chama faz antes um
// backup do estado atual e garante o emulador fechado.
func RestoreGameSaves(baseDir, backupID string, includeMemoryCard bool) (int, error) {
	if strings.ContainsAny(backupID, `/\`) || backupID == "" || backupID == "." || backupID == ".." {
		return 0, fmt.Errorf("backup inválido")
	}
	dir := filepath.Join(baseDir, backupID)
	m, err := readManifest(dir)
	if err != nil {
		return 0, fmt.Errorf("este backup não existe mais")
	}
	n := 0
	for _, f := range m {
		if f.MemoryCard && !includeMemoryCard {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(f.Original), 0o755); err != nil {
			return n, err
		}
		if err := copyFileOver(filepath.Join(dir, f.Stored), f.Original); err != nil {
			return n, fmt.Errorf("restaurando %s: %w", filepath.Base(f.Original), err)
		}
		n++
	}
	return n, nil
}

func copyFileOver(from, to string) error {
	tmp := to + ".zeux-restaurando"
	if err := copyFileContents(from, tmp); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, to)
}
