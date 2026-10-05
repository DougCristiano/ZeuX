package api

import (
	"testing"

	"github.com/doufl/zeux/internal/verdict"
)

// Trava a regra de que nomes de pasta realistas — com fabricante, ruído de
// coleção ou apelido corrente — casam com o console certo, e que um nome sem
// relação não casa com nada. Foi o que deixou "nenhuma pasta apontada" para
// quem apontou a pasta certa (2026-10-05).
func TestConsoleMatcherAcceptsRealisticFolderNames(t *testing.T) {
	consoles := []verdict.Console{
		{ID: "ps3", Name: "PlayStation 3", ShortName: "PS3"},
		{ID: "n64", Name: "Nintendo 64", ShortName: "N64"},
		{ID: "megadrive", Name: "Mega Drive / Genesis", ShortName: "Mega Drive"},
		{ID: "snes", Name: "Super Nintendo", ShortName: "SNES"},
		{ID: "ps1", Name: "PlayStation 1", ShortName: "PS1"},
	}
	m := newConsoleMatcher(consoles)

	cases := map[string]string{
		"PS3":                  "ps3",
		"Sony - PlayStation 3": "ps3",
		"PS3 Games":            "ps3",
		"Nintendo 64":          "n64",
		"Genesis":              "megadrive",
		"Roms SNES":            "snes",
		"PSX":                  "ps1",
	}
	for folder, want := range cases {
		got, ok := m.match(folder)
		if !ok || got.ID != want {
			t.Errorf("match(%q) = %q (ok=%v), esperado %q", folder, got.ID, ok, want)
		}
	}
	if got, ok := m.match("Fotos de Família"); ok {
		t.Errorf("match(\"Fotos de Família\") = %q, esperado nenhum console", got.ID)
	}
}
