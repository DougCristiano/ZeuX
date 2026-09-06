package verdict

import (
	"strings"
	"testing"

	"github.com/doufl/zeux/internal/hardware"
)

func infoComTela(width, height int) hardware.HardwareInfo {
	return hardware.HardwareInfo{
		Displays: []hardware.DisplayInfo{{Width: width, Height: height, Primary: true, Source: "teste"}},
	}
}

// A regra do Q3 (docs/roadmap.md, Sprint Q): numa tela menor que a de
// referência do catálogo, a resolução interna cai junto. Renderizar 4x para
// exibir em 768 linhas gasta GPU e não aparece em lugar nenhum.
func TestScaleForDisplayReduzEmTelaMenor(t *testing.T) {
	scale, note, adjusted := scaleForDisplay(4, infoComTela(1366, 768))

	if !adjusted {
		t.Fatal("esperava ajuste numa tela de 768 linhas")
	}
	// 4 × 768 / 1080 = 2,84 → 3 (arredonda para cima: o excesso é invisível, a
	// falta aparece).
	if scale != 3 {
		t.Errorf("escala = %d, esperava 3", scale)
	}
	if !strings.Contains(note, "1366×768") {
		t.Errorf("a nota não diz qual é a tela: %q", note)
	}
}

// Só reduz, nunca aumenta: o patamar do catálogo foi escolhido pelo que o
// hardware aguenta, não pelo que a tela mostra. Subir a escala num 4K
// entregaria à GPU um trabalho que o patamar não orçou.
func TestScaleForDisplayNaoAumentaEmTelaMaior(t *testing.T) {
	for _, tela := range []struct{ w, h int }{{2560, 1440}, {3840, 2160}, {1920, 1080}} {
		if _, _, adjusted := scaleForDisplay(3, infoComTela(tela.w, tela.h)); adjusted {
			t.Errorf("%d×%d: houve ajuste, e nenhuma tela igual ou maior que a referência deveria gerar um",
				tela.w, tela.h)
		}
	}
}

// Sem monitor detectado, o preset do catálogo vale como está — dado que não
// pôde ser lido não vira palpite (princípio 4 do CLAUDE.md).
func TestScaleForDisplaySemMonitorNaoAjusta(t *testing.T) {
	if _, _, adjusted := scaleForDisplay(4, hardware.HardwareInfo{}); adjusted {
		t.Error("ajustou a escala sem ter lido monitor nenhum")
	}
}

// Resolução nativa do console (escala 0 ou 1) não tem o que reduzir — reduzir
// abaixo de 1 não significa nada.
func TestScaleForDisplayNaoMexeEmResolucaoNativa(t *testing.T) {
	for _, tierScale := range []int{0, 1} {
		if _, _, adjusted := scaleForDisplay(tierScale, infoComTela(1280, 720)); adjusted {
			t.Errorf("escala %d do catálogo foi ajustada, e não deveria", tierScale)
		}
	}
}

// A escala nunca cai a zero: 1x é o piso, e 0 significaria "nativa" num campo
// que o emulador lê como multiplicador.
func TestScaleForDisplayNuncaCaiAbaixoDeUm(t *testing.T) {
	scale, _, adjusted := scaleForDisplay(2, infoComTela(320, 200))
	if adjusted && scale < 1 {
		t.Errorf("escala = %d, nunca deveria ficar abaixo de 1", scale)
	}
}

// A nota é descritiva, nunca julgadora (princípio 2 do CLAUDE.md): diz os
// números e o que foi feito, sem qualificar a tela do usuário.
func TestNotaDeTelaNaoJulgaOHardware(t *testing.T) {
	_, note, _ := scaleForDisplay(4, infoComTela(1366, 768))

	proibidas := []string{"fraca", "fraco", "ruim", "limitada", "limitado", "insuficiente", "pequena", "antiga"}
	lower := strings.ToLower(note)
	for _, palavra := range proibidas {
		if strings.Contains(lower, palavra) {
			t.Errorf("a nota julga a tela do usuário (%q): %q", palavra, note)
		}
	}
}

// PrimaryDisplay escolhe o monitor marcado como principal, não o primeiro da
// lista — num notebook ligado a um monitor externo, a ordem não significa nada.
func TestPrimaryDisplayPrefereOPrincipal(t *testing.T) {
	info := hardware.HardwareInfo{Displays: []hardware.DisplayInfo{
		{Name: "eDP-1", Width: 1920, Height: 1080},
		{Name: "DP-1", Width: 1366, Height: 768, Primary: true},
	}}

	display, ok := info.PrimaryDisplay()
	if !ok || display.Name != "DP-1" {
		t.Errorf("PrimaryDisplay = %+v, esperava a marcada como principal (DP-1)", display)
	}
}

// Sem nenhum marcado como principal (comum fora do Windows), vale a de maior
// área — o palpite menos ruim entre os disponíveis.
func TestPrimaryDisplaySemPrincipalPegaAMaior(t *testing.T) {
	info := hardware.HardwareInfo{Displays: []hardware.DisplayInfo{
		{Name: "HDMI-1", Width: 1280, Height: 720},
		{Name: "DP-1", Width: 2560, Height: 1440},
	}}

	display, ok := info.PrimaryDisplay()
	if !ok || display.Name != "DP-1" {
		t.Errorf("PrimaryDisplay = %+v, esperava a de maior área (DP-1)", display)
	}
}

// Monitor sem medida não conta: entraria como 0×0 e envenenaria a decisão de
// resolução interna.
func TestPrimaryDisplayIgnoraMonitorSemMedida(t *testing.T) {
	info := hardware.HardwareInfo{Displays: []hardware.DisplayInfo{
		{Name: "vazio", Width: 0, Height: 0, Primary: true},
		{Name: "DP-1", Width: 1920, Height: 1080},
	}}

	display, ok := info.PrimaryDisplay()
	if !ok || display.Name != "DP-1" {
		t.Errorf("PrimaryDisplay = %+v, esperava DP-1", display)
	}
}
