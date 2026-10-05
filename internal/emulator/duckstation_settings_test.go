package emulator

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func mustContain(t *testing.T, got string, wants ...string) {
	t.Helper()
	for _, w := range wants {
		if !strings.Contains(got, w) {
			t.Errorf("faltou %q em:\n%s", w, got)
		}
	}
}

// Os cinco formatos de settings.ini que o DuckStation produz (ou que a
// pessoa pode ter) — a mesclagem precisa acrescentar o que falta, manter o
// resto byte a byte e nunca depender da ordem das seções.
func TestMergeDuckStationDefaultsHandlesEveryFileShape(t *testing.T) {
	cases := map[string]string{
		// só o que difere do padrão — como o DuckStation às vezes grava
		"esparso": "[Main]\nSetupWizardIncomplete = false\n",
		// arquivo completo, com seções que o ZeuX não conhece
		"completo": "[Main]\nSetupWizardIncomplete = false\nNoDesktopFile = true\nStartFullscreen = false\n\n[GPU]\nRenderer = Automatic\nResolutionScale = 1\n\n[Audio]\nBackend = Cubeb\n",
		// depois de "restaurar padrões": seções em ordem alfabética
		"alfabetico": "[AutoUpdater]\nCheckAtStartup = true\n\n[Audio]\nBackend = SDL\n\n[Hotkeys]\nOpenPauseMenu = Keyboard/F12\n\n[Main]\nSetupWizardIncomplete = false\n",
		// seção existe, chave não
		"chave-inexistente": "[Hotkeys]\nScreenshot = Keyboard/F10\n",
		// nenhuma das seções do ZeuX
		"secao-inexistente": "[GPU]\nRenderer = Automatic\n",
	}
	for name, in := range cases {
		t.Run(name, func(t *testing.T) {
			got := string(MergeDuckStationDefaults([]byte(in), false))
			mustContain(t, got,
				"CheckAtStartup = false", "SetupWizardIncomplete = false",
				"SDL = true", "SaveSelectedSaveState = Keyboard/F2",
				"Cross = SDL-0/A", "Cross = Keyboard/K", "Type = AnalogController")
			// Toda linha original que não é chave forçada sobrevive.
			for _, line := range strings.Split(in, "\n") {
				if line == "" || strings.HasPrefix(line, "CheckAtStartup") {
					continue
				}
				if !strings.Contains(got, line) {
					t.Errorf("linha original perdida: %q\n%s", line, got)
				}
			}
			if strings.Contains(got, "CheckAtStartup = true") {
				t.Errorf("auto-update do DuckStation continuou ligado:\n%s", got)
			}
		})
	}
	// Valor que a pessoa escolheu num atalho continua o dela.
	got := string(MergeDuckStationDefaults([]byte(cases["alfabetico"]), false))
	if !strings.Contains(got, "OpenPauseMenu = Keyboard/F12") || strings.Contains(got, "OpenPauseMenu = Keyboard/Escape") {
		t.Errorf("atalho escolhido pela pessoa foi trocado:\n%s", got)
	}
}

// Trava o bug observado: [Pad1] só com o tipo, sem botões, ganha o
// mapeamento; [Pad1] já mapeado pela pessoa não é tocado.
func TestMergeDuckStationDefaultsPadOnlyWhenEmpty(t *testing.T) {
	empty := string(MergeDuckStationDefaults([]byte("[Pad1]\nType = AnalogController\n"), false))
	mustContain(t, empty, "Up = SDL-0/DPadUp", "Up = Keyboard/UpArrow")

	mapped := "[Pad1]\nType = DigitalController\nCross = SDL-0/A\n"
	got := string(MergeDuckStationDefaults([]byte(mapped), false))
	if strings.Contains(got, "Keyboard/K") || !strings.Contains(got, "Type = DigitalController") {
		t.Errorf("mapeamento da pessoa foi alterado:\n%s", got)
	}
}

// Trava que o cartão por nome de ROM só entra em instalação nova — trocar o
// tipo de quem já joga faria os cartões existentes "sumirem".
func TestMergeDuckStationDefaultsCardTypeOnlyWhenFresh(t *testing.T) {
	if got := string(MergeDuckStationDefaults(nil, true)); !strings.Contains(got, "Card1Type = PerGameFileTitle") {
		t.Errorf("instalação nova sem PerGameFileTitle:\n%s", got)
	}
	if got := string(MergeDuckStationDefaults([]byte("[Main]\nSetupWizardIncomplete = false\n"), false)); strings.Contains(got, "Card1Type") {
		t.Errorf("tipo de cartão gravado numa instalação existente:\n%s", got)
	}
}

// Trava que mesclar duas vezes dá o mesmo arquivo — o lançamento roda a
// mesclagem toda vez e não pode ficar regravando nem duplicando linhas.
func TestMergeDuckStationDefaultsIsIdempotent(t *testing.T) {
	once := MergeDuckStationDefaults([]byte("[Main]\nSetupWizardIncomplete = false\n"), false)
	twice := MergeDuckStationDefaults(once, false)
	if string(once) != string(twice) {
		t.Errorf("segunda mesclagem mudou o arquivo:\n%s\n---\n%s", once, twice)
	}
}

func managedDuckStation(t *testing.T) (Installation, string) {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "portable.txt"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	return Installation{BinaryPath: filepath.Join(dir, "duckstation-qt-x64-ReleaseLTCG.exe"), Managed: true}, dir
}

// Trava a validação: só opções do catálogo e só valores permitidos; um
// valor ruim recusa a gravação inteira, sem gravar pela metade.
func TestWriteDuckStationSettingsValidates(t *testing.T) {
	install, dir := managedDuckStation(t)
	path := filepath.Join(dir, "settings.ini")
	if err := os.WriteFile(path, []byte("[Main]\nSetupWizardIncomplete = false\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []map[string]string{
		{"Main.StartFullscreen": "sim"},
		{"Audio.Backend": "WASAPI"},
		{"Audio.OutputVolume": "150"},
		{"GPU.Renderer": "Vulkan"},
		{"Main.StartFullscreen": "true", "Audio.Backend": "XAudio2"},
	} {
		if err := WriteEmulatorSettings("duckstation", install, bad); err == nil {
			t.Errorf("aceitou %v", bad)
		}
	}
	if data, _ := os.ReadFile(path); strings.Contains(string(data), "StartFullscreen") {
		t.Fatalf("gravou pela metade:\n%s", data)
	}

	if err := WriteEmulatorSettings("duckstation", install, map[string]string{"Main.StartFullscreen": "true", "Audio.StretchMode": "Resample"}); err != nil {
		t.Fatal(err)
	}
	settings, err := ReadEmulatorSettings("duckstation", install)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, s := range settings {
		got[s.ID] = s.Value
	}
	if got["Main.StartFullscreen"] != "true" || got["Audio.StretchMode"] != "Resample" || got["Audio.Backend"] != "" {
		t.Errorf("leitura depois da gravação: %v", got)
	}
}

// Trava que instalação feita fora do ZeuX não é editada.
func TestDuckStationSettingsRequireManagedInstall(t *testing.T) {
	if _, err := ReadEmulatorSettings("duckstation", Installation{BinaryPath: "/opt/ds/duckstation"}); err != ErrDuckStationNotManaged {
		t.Fatalf("got %v", err)
	}
}

// Trava que o cartão é achado pelo nome da ROM (PerGameFileTitle), e os
// states pelo serial vindo do estado de retomada.
func TestFindDuckStationGameSaves(t *testing.T) {
	install, dir := managedDuckStation(t)
	os.WriteFile(filepath.Join(dir, "settings.ini"), []byte("[MemoryCards]\nCard1Type = PerGameFileTitle\n"), 0o644)
	os.MkdirAll(filepath.Join(dir, "memcards"), 0o755)
	os.MkdirAll(filepath.Join(dir, "savestates"), 0o755)
	for _, f := range []string{"memcards/Crash Bandicoot (USA)_1.mcd", "memcards/Outro Jogo_1.mcd",
		"savestates/SCUS-94900_1.sav", "savestates/SCUS-94900_resume.sav", "savestates/SLUS-00001_1.sav"} {
		os.WriteFile(filepath.Join(dir, filepath.FromSlash(f)), []byte("x"), 0o644)
	}

	serial := DuckStationSerialFromResumeState(filepath.Join(dir, "savestates", "SCUS-94900_resume.sav"))
	if serial != "SCUS-94900" {
		t.Fatalf("serial = %q", serial)
	}
	saves, ok := FindDuckStationGameSaves(install, "/roms/ps1/Crash Bandicoot (USA).cue", serial)
	if !ok {
		t.Fatal("não localizou")
	}
	if len(saves.MemoryCards) != 1 || filepath.Base(saves.MemoryCards[0]) != "Crash Bandicoot (USA)_1.mcd" || saves.MemoryCardsApproximate {
		t.Errorf("cartões = %v (aprox=%v)", saves.MemoryCards, saves.MemoryCardsApproximate)
	}
	if len(saves.SaveStates) != 2 {
		t.Errorf("states = %v, esperado os 2 do SCUS-94900", saves.SaveStates)
	}
}

// Trava o espelho de Path::SanitizeFileName nos caracteres comuns.
func TestDuckStationSanitizeFileName(t *testing.T) {
	if got := duckStationSanitizeFileName("Jogo*Nome"); got != "Jogo_Nome" {
		t.Errorf("got %q", got)
	}
	if got := duckStationFileTitle("/x/Final Fantasy VII (Disc 1).cue"); got != "Final Fantasy VII (Disc 1)" {
		t.Errorf("got %q", got)
	}
}
