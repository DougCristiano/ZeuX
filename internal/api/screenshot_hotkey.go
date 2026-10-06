package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/doufl/zeux/internal/emulator"
)

// Tecla de print por emulador (2026-10-06) — ver emulator/screenshot_hotkey.go.

func (s *Server) handleScreenshotHotkey(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !emulator.SupportsScreenshotHotkey(id) {
		writeJSON(w, http.StatusOK, map[string]any{"available": false,
			"message": "O ZeuX ainda não sabe ajustar o atalho de print deste emulador."})
		return
	}
	install, ok := s.emulatorInstall(r, id)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"available": false, "message": "Este emulador não está instalado."})
		return
	}
	st, err := emulator.ReadScreenshotHotkey(id, install)
	if errors.Is(err, emulator.ErrDuckStationNotManaged) || errors.Is(err, emulator.ErrScreenshotHotkeyUnavailable) {
		writeJSON(w, http.StatusOK, map[string]any{"available": false, "message": err.Error()})
		return
	}
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "screenshot_hotkey_read_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"available": true,
		"running":   s.launcher.AdapterRunning(r.Context(), id),
		"hotkey":    st,
	})
}

// handleSetScreenshotHotkey grava `{"keyboard": "F10", "controller": []}`.
// 409 com o emulador aberto pelo ZeuX: ele regrava a configuração ao fechar.
func (s *Server) handleSetScreenshotHotkey(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body emulator.ScreenshotHotkey
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_body", `O corpo deve ser {"keyboard": "F10", "controller": ["back", "r3"]}.`)
		return
	}
	if s.launcher.AdapterRunning(r.Context(), id) {
		s.writeError(w, http.StatusConflict, "emulator_running",
			"Feche o emulador antes de mudar o atalho — ele grava a configuração dele ao fechar e desfaria a mudança.")
		return
	}
	install, ok := s.emulatorInstall(r, id)
	if !ok {
		s.writeError(w, http.StatusBadRequest, "emulator_not_installed", "Este emulador não está instalado.")
		return
	}
	if err := emulator.WriteScreenshotHotkey(id, install, body); err != nil {
		var invalid emulator.ErrScreenshotHotkey
		if errors.As(err, &invalid) || errors.Is(err, emulator.ErrScreenshotHotkeyUnavailable) || errors.Is(err, emulator.ErrDuckStationNotManaged) {
			s.writeError(w, http.StatusBadRequest, "screenshot_hotkey_invalid", err.Error())
			return
		}
		s.writeError(w, http.StatusInternalServerError, "screenshot_hotkey_write_failed", err.Error())
		return
	}
	st, err := emulator.ReadScreenshotHotkey(id, install)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "screenshot_hotkey_read_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"available": true, "running": false, "hotkey": st})
}
