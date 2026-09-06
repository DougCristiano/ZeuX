//go:build linux

package hardware

import (
	"os"
	"path/filepath"
	"testing"
)

// Saída real de `xrandr --query` (recortada), com o caso que importa: o modo
// ativo é o marcado com "*", não o primeiro da lista nem o de maior número.
const xrandrReal = `Screen 0: minimum 320 x 200, current 3840 x 1080, maximum 16384 x 16384
eDP-1 connected primary 1920x1080+0+0 (normal left inverted right x axis y axis) 344mm x 194mm
   1920x1080     60.05*+  59.93    48.00
   1680x1050     59.95    59.88
   1280x720      60.00    59.99
HDMI-1 connected 1920x1080+1920+0 (normal left inverted right x axis y axis) 527mm x 296mm
   2560x1440     59.95
   1920x1080     60.00*+  50.00    59.94
   1280x720      60.00    50.00
DP-2 disconnected (normal left inverted right x axis y axis)
`

// Trava a leitura do modo ATIVO, que é o ponto do parser: o HDMI-1 acima
// suporta 2560x1440, mas está rodando em 1920x1080 — usar o maior modo
// suportado daria uma resolução que não é a que está na tela.
func TestParseXrandrLeOModoAtivoNaoOMaiorSuportado(t *testing.T) {
	displays := parseXrandr(xrandrReal)

	if len(displays) != 2 {
		t.Fatalf("esperava 2 monitores conectados, veio %d: %+v", len(displays), displays)
	}

	if displays[0].Name != "eDP-1" || displays[0].Width != 1920 || displays[0].Height != 1080 {
		t.Errorf("primeiro monitor = %+v", displays[0])
	}
	if !displays[0].Primary {
		t.Error("eDP-1 está marcado como primary no xrandr e não foi reconhecido")
	}
	// 60.05 arredonda para 60, não trunca para 60 por acaso — o teste vale
	// para a regra, não para o número.
	if displays[0].RefreshHz != 60 {
		t.Errorf("taxa = %d Hz, esperava 60", displays[0].RefreshHz)
	}

	if displays[1].Name != "HDMI-1" || displays[1].Height != 1080 {
		t.Errorf("segundo monitor = %+v — deveria ser o modo ativo (1080), não o maior suportado (1440)", displays[1])
	}
	if displays[1].Primary {
		t.Error("HDMI-1 não é primary e foi marcado como se fosse")
	}
}

// Saída desconectada não vira monitor: uma porta HDMI vazia não deveria
// influenciar a resolução interna do jogo.
func TestParseXrandrIgnoraSaidaDesconectada(t *testing.T) {
	for _, d := range parseXrandr(xrandrReal) {
		if d.Name == "DP-2" {
			t.Error("DP-2 está desconectado e entrou na lista")
		}
	}
}

// Monitor conectado mas sem modo ativo (tela apagada) é descartado quando o
// próximo cabeçalho chega — entraria como 0×0 e envenenaria PrimaryDisplay.
func TestParseXrandrDescartaConectadoSemModoAtivo(t *testing.T) {
	saida := `eDP-1 connected primary 1920x1080+0+0
   1920x1080     60.05    59.93
HDMI-1 connected 1920x1080+1920+0
   1920x1080     60.00*+
`
	displays := parseXrandr(saida)
	if len(displays) != 1 || displays[0].Name != "HDMI-1" {
		t.Errorf("esperava só o HDMI-1 (o único com modo ativo), veio %+v", displays)
	}
}

// O caminho de reserva, que funciona sem servidor gráfico (Wayland puro, ou
// xrandr não instalado): a primeira linha de `modes` é o modo em uso.
func TestDisplaysFromDRMLeAPrimeiraLinha(t *testing.T) {
	root := t.TempDir()
	criarSaidaDRM(t, root, "card0-DP-1", "2560x1440\n1920x1080\n1280x720\n")
	criarSaidaDRM(t, root, "card0-HDMI-A-1", "") // porta sem nada ligado

	displays := displaysFromDRM(root)

	if len(displays) != 1 {
		t.Fatalf("esperava 1 monitor (a saída vazia não conta), veio %d: %+v", len(displays), displays)
	}
	if displays[0].Width != 2560 || displays[0].Height != 1440 {
		t.Errorf("resolução = %dx%d, esperava 2560x1440", displays[0].Width, displays[0].Height)
	}
	// O prefixo da placa é detalhe do sysfs; o que o usuário reconhece é a saída.
	if displays[0].Name != "DP-1" {
		t.Errorf("nome = %q, esperava \"DP-1\"", displays[0].Name)
	}
	// O sysfs não expõe a taxa aqui, e inventar 60 seria palpite disfarçado de
	// leitura (princípio 4 do CLAUDE.md).
	if displays[0].RefreshHz != 0 {
		t.Errorf("taxa = %d, esperava 0 (não reportada) — o sysfs não informa isso", displays[0].RefreshHz)
	}
	if displays[0].Source != "drm" {
		t.Errorf("source = %q, esperava \"drm\"", displays[0].Source)
	}
}

func criarSaidaDRM(t *testing.T, root, saida, modes string) {
	t.Helper()
	dir := filepath.Join(root, saida)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "modes"), []byte(modes), 0o644); err != nil {
		t.Fatal(err)
	}
}
