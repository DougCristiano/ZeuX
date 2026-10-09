package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/doufl/zeux/internal/library"
	"net/http"
	"strconv"

	"github.com/doufl/zeux/internal/emulator"
)

// Opções de emulador (DuckStation e PCSX2) e saves de um jogo (2026-10-05). Só valem para a instalação gerenciada em
// modo portátil — ver emulator/duckstation_settings.go.

func (s *Server) duckStationInstall(r *http.Request) (emulator.Installation, bool) {
	return s.emulatorInstall(r, "duckstation")
}

func (s *Server) emulatorInstall(r *http.Request, adapterID string) (emulator.Installation, bool) {
	adapter, ok := s.emulators.ByID(adapterID)
	if !ok {
		return emulator.Installation{}, false
	}
	return adapter.Locate(r.Context())
}

// handleEmulatorSettings devolve as opções de um emulador com o valor atual
// do arquivo. `available: false` (com `message`) quando não há o que editar
// — a tela mostra a frase em vez dos controles.
func (s *Server) handleEmulatorSettings(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !emulator.SupportsSettings(id) {
		writeJSON(w, http.StatusOK, map[string]any{"available": false, "message": emulator.ErrSettingsUnsupported.Error()})
		return
	}
	install, ok := s.emulatorInstall(r, id)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"available": false, "message": "Este emulador não está instalado."})
		return
	}
	settings, err := emulator.ReadEmulatorSettings(id, install)
	if errors.Is(err, emulator.ErrDuckStationNotManaged) {
		writeJSON(w, http.StatusOK, map[string]any{"available": false, "message": err.Error()})
		return
	}
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "emulator_settings_read_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"available": true,
		"running":   s.launcher.AdapterRunning(r.Context(), id),
		"settings":  settings,
	})
}

// handleSetEmulatorSettings grava `{"values": {"Seção.Chave": "valor"}}`.
// 409 com o emulador aberto: ele regrava a própria configuração ao fechar e
// apagaria a mudança.
func (s *Server) handleSetEmulatorSettings(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		Values map[string]string `json:"values"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Values) == 0 {
		s.writeError(w, http.StatusBadRequest, "invalid_body", `O corpo deve ser {"values": {"Seção.Chave": "valor"}}.`)
		return
	}
	if s.launcher.AdapterRunning(r.Context(), id) {
		s.writeError(w, http.StatusConflict, "emulator_running",
			"Feche o emulador antes de mudar as opções — ele grava a configuração dele ao fechar e desfaria a mudança.")
		return
	}
	install, ok := s.emulatorInstall(r, id)
	if !ok {
		s.writeError(w, http.StatusBadRequest, "emulator_not_installed", "Este emulador não está instalado.")
		return
	}
	if err := emulator.WriteEmulatorSettings(id, install, body.Values); err != nil {
		s.writeError(w, http.StatusBadRequest, "emulator_settings_invalid", err.Error())
		return
	}
	settings, err := emulator.ReadEmulatorSettings(id, install)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "emulator_settings_read_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"available": true, "running": false, "settings": settings})
}

// saveAdapterFor diz qual emulador guarda os saves de um console (só os
// dois com o local verificado).
func saveAdapterFor(consoleID string) string {
	switch consoleID {
	case "ps1":
		return "duckstation"
	case "ps2":
		return "pcsx2"
	case "gamecube", "wii":
		// Dolphin: os estados vêm do GameID do jogo (dolphin_saves.go). A
		// listagem não mostra cartão nem NAND do Wii ainda.
		return "dolphin"
	}
	return ""
}

// retroArchRunsConsole diz se o RetroArch cobre o console (tem algum core para
// ele no catálogo). Consulta o registro de adapters, não o catálogo de cores,
// para não depender de a instalação estar pronta.
func (s *Server) retroArchRunsConsole(consoleID string) bool {
	for _, a := range s.emulators.ForConsole(consoleID) {
		if a.ID() == "retroarch" {
			return true
		}
	}
	return false
}

// gameSavesContext resolve jogo, emulador, instalação e saves de um pedido.
func (s *Server) gameSavesContext(w http.ResponseWriter, r *http.Request) (library.Game, string, emulator.GameSaves, bool, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_id", "O identificador do jogo deve ser numérico.")
		return library.Game{}, "", emulator.GameSaves{}, false, false
	}
	game, ok, err := s.library.GameByID(r.Context(), id)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_read_failed", err.Error())
		return library.Game{}, "", emulator.GameSaves{}, false, false
	}
	if !ok {
		s.writeError(w, http.StatusNotFound, "not_found", fmt.Sprintf("Nenhum jogo com o id %d.", id))
		return library.Game{}, "", emulator.GameSaves{}, false, false
	}
	adapterID := saveAdapterFor(game.ConsoleID)
	if adapterID == "" && s.retroArchRunsConsole(game.ConsoleID) {
		// Sem emulador dedicado de saves, o RetroArch é o que mais provavelmente
		// abriu o jogo: é o único adapter que cobre a maioria dos consoles.
		// Não há como saber, pela biblioteca, qual emulador foi usado de fato —
		// a tela deve tratar o resultado como "saves do RetroArch", não como
		// certeza sobre o último lançamento.
		adapterID = "retroarch"
	}
	if adapterID == "" {
		return game, "", emulator.GameSaves{}, false, true
	}
	install, installed := s.emulatorInstall(r, adapterID)
	if !installed {
		return game, adapterID, emulator.GameSaves{}, false, true
	}
	saves, known := emulator.FindGameSaves(adapterID, install, game.Path, s.launcher.DiscIDFor(r.Context(), game.Path))
	return game, adapterID, saves, known, true
}

// handleGameSaves lista cartões e states de um jogo (PS1 no DuckStation
// gerenciado, PS2 no PCSX2). `known: false` fora disso.
func (s *Server) handleGameSaves(w http.ResponseWriter, r *http.Request) {
	game, _, saves, known, ok := s.gameSavesContext(w, r)
	if !ok {
		return
	}
	if !known {
		writeJSON(w, http.StatusOK, map[string]any{"known": false})
		return
	}
	backups := []emulator.SaveBackup{}
	if dir, err := emulator.GameSaveBackupDir(game.ConsoleID, game.ID); err == nil {
		backups = emulator.ListGameSaveBackups(dir)
	}
	writeJSON(w, http.StatusOK, map[string]any{"known": true, "saves": saves, "backups": backups})
}

// handleBackupGameSaves copia os saves do jogo para a pasta de backups do ZeuX.
func (s *Server) handleBackupGameSaves(w http.ResponseWriter, r *http.Request) {
	game, _, saves, known, ok := s.gameSavesContext(w, r)
	if !ok {
		return
	}
	if !known {
		s.writeError(w, http.StatusBadRequest, "saves_unknown", "O ZeuX ainda não sabe onde ficam os saves deste jogo.")
		return
	}
	dir, err := emulator.GameSaveBackupDir(game.ConsoleID, game.ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "backup_failed", err.Error())
		return
	}
	b, err := emulator.BackupGameSaves(dir, saves)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "backup_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, b)
}

// handleRestoreGameSaves volta um backup. Antes, guarda o estado atual num
// backup novo — restaurar nunca perde o que existia. Recusa com o emulador
// aberto (ele reescreveria cartão e states ao fechar).
func (s *Server) handleRestoreGameSaves(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Backup            string `json:"backup"`
		IncludeMemoryCard bool   `json:"include_memory_card"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Backup == "" {
		s.writeError(w, http.StatusBadRequest, "invalid_body", `O corpo deve ser {"backup": "<id>", "include_memory_card": false}.`)
		return
	}
	game, adapterID, saves, known, ok := s.gameSavesContext(w, r)
	if !ok {
		return
	}
	if !known {
		s.writeError(w, http.StatusBadRequest, "saves_unknown", "O ZeuX ainda não sabe onde ficam os saves deste jogo.")
		return
	}
	if s.launcher.AdapterRunning(r.Context(), adapterID) {
		s.writeError(w, http.StatusConflict, "emulator_running", "Feche o emulador antes de restaurar um backup.")
		return
	}
	dir, err := emulator.GameSaveBackupDir(game.ConsoleID, game.ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "restore_failed", err.Error())
		return
	}
	var safety *emulator.SaveBackup
	if len(saves.MemoryCards)+len(saves.SaveStates) > 0 {
		b, err := emulator.BackupGameSaves(dir, saves)
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, "restore_failed", "Não foi possível guardar o estado atual antes de restaurar: "+err.Error())
			return
		}
		safety = &b
	}
	n, err := emulator.RestoreGameSaves(dir, body.Backup, body.IncludeMemoryCard)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "restore_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"restored": n, "safety_backup": safety})
}

// --- Modo portátil do PCSX2 ---

func (s *Server) handlePCSX2Portable(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, emulator.PCSX2Portable())
}

// handleMigratePCSX2 copia Documentos\PCSX2 para a pasta do emulador e liga
// o modo portátil. Não apaga nada da origem.
func (s *Server) handleMigratePCSX2(w http.ResponseWriter, r *http.Request) {
	if s.launcher.AdapterRunning(r.Context(), "pcsx2") {
		s.writeError(w, http.StatusConflict, "emulator_running", "Feche o PCSX2 antes de migrar.")
		return
	}
	st, err := emulator.MigratePCSX2ToPortable()
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "migration_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, st)
}

// handleRemovePCSX2Legacy apaga Documentos\PCSX2 — só depois da migração
// conferida, e só quando a interface pediu (confirmação do usuário).
func (s *Server) handleRemovePCSX2Legacy(w http.ResponseWriter, r *http.Request) {
	if s.launcher.AdapterRunning(r.Context(), "pcsx2") {
		s.writeError(w, http.StatusConflict, "emulator_running", "Feche o PCSX2 antes de apagar a pasta antiga.")
		return
	}
	if err := emulator.RemovePCSX2LegacyData(); err != nil {
		s.writeError(w, http.StatusBadRequest, "cleanup_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, emulator.PCSX2Portable())
}
