package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/doufl/zeux/internal/emulator"
)

// Rotas do DuckStation (2026-10-05): opções do settings.ini pela tela do
// console PS1 e saves de um jogo. Só valem para a instalação gerenciada em
// modo portátil — ver emulator/duckstation_settings.go.

func (s *Server) duckStationInstall(r *http.Request) (emulator.Installation, bool) {
	adapter, ok := s.emulators.ByID("duckstation")
	if !ok {
		return emulator.Installation{}, false
	}
	return adapter.Locate(r.Context())
}

// handleDuckStationSettings devolve as opções com o valor atual do arquivo.
// `available: false` (com `message`) quando não há instalação do ZeuX — a
// tela mostra a frase em vez dos controles.
func (s *Server) handleDuckStationSettings(w http.ResponseWriter, r *http.Request) {
	install, ok := s.duckStationInstall(r)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"available": false, "message": "O DuckStation não está instalado."})
		return
	}
	settings, err := emulator.ReadDuckStationSettings(install)
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
		"running":   s.launcher.AdapterRunning(r.Context(), "duckstation"),
		"settings":  settings,
	})
}

// handleSetDuckStationSettings grava `{"values": {"Main.StartFullscreen": "true", ...}}`.
// 409 com o DuckStation aberto: ele regrava o settings.ini ao fechar e
// apagaria a mudança.
func (s *Server) handleSetDuckStationSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Values map[string]string `json:"values"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Values) == 0 {
		s.writeError(w, http.StatusBadRequest, "invalid_body", `O corpo deve ser {"values": {"Seção.Chave": "valor"}}.`)
		return
	}
	if s.launcher.AdapterRunning(r.Context(), "duckstation") {
		s.writeError(w, http.StatusConflict, "emulator_running",
			"Feche o DuckStation antes de mudar as opções — ele grava a configuração dele ao fechar e desfaria a mudança.")
		return
	}
	install, ok := s.duckStationInstall(r)
	if !ok {
		s.writeError(w, http.StatusBadRequest, "emulator_not_installed", "O DuckStation não está instalado.")
		return
	}
	if err := emulator.WriteDuckStationSettings(install, body.Values); err != nil {
		s.writeError(w, http.StatusBadRequest, "emulator_settings_invalid", err.Error())
		return
	}
	settings, err := emulator.ReadDuckStationSettings(install)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "emulator_settings_read_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"available": true, "running": false, "settings": settings})
}

// handleGameSaves lista cartões e states de um jogo de PS1 no DuckStation.
// O serial (nome dos states) vem do estado de retomada que o ZeuX ligou ao
// jogo — sem uma sessão encerrada pelo ZeuX, os states ficam de fora.
func (s *Server) handleGameSaves(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_id", "O identificador do jogo deve ser numérico.")
		return
	}
	game, ok, err := s.library.GameByID(r.Context(), id)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_read_failed", err.Error())
		return
	}
	if !ok {
		s.writeError(w, http.StatusNotFound, "not_found", fmt.Sprintf("Nenhum jogo com o id %d.", id))
		return
	}
	install, installed := s.duckStationInstall(r)
	if game.ConsoleID != "ps1" || !installed {
		writeJSON(w, http.StatusOK, map[string]any{"known": false})
		return
	}
	serial := ""
	if states, err := s.launcher.ResumeStates(r.Context()); err == nil {
		if st, ok := states[game.Path]; ok && st.AdapterID == "duckstation" {
			serial = emulator.DuckStationSerialFromResumeState(st.StatePath)
		}
	}
	saves, ok := emulator.FindDuckStationGameSaves(install, game.Path, serial)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"known": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"known": true, "duckstation": saves})
}
