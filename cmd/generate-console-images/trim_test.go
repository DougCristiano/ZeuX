package main

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func writePNG(t *testing.T, img image.Image) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "logo.png")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatal(err)
	}
	return path
}

func readSize(t *testing.T, path string) image.Point {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	cfg, err := png.DecodeConfig(f)
	if err != nil {
		t.Fatal(err)
	}
	return image.Pt(cfg.Width, cfg.Height)
}

// Trava o motivo do corte: logo numa faixa fina de um quadrado transparente
// (caso do PS2 no IGDB) tem que sair só com a faixa mais um respiro, senão o
// card mostra a logo minúscula no meio de moldura vazia.
func TestTrimMarginCropsTransparentFrame(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 160, 160))
	for y := 60; y < 100; y++ {
		for x := 10; x < 150; x++ {
			img.Set(x, y, color.NRGBA{0, 0, 0, 255})
		}
	}
	path := writePNG(t, img)

	changed, err := trimMargin(path)
	if err != nil || !changed {
		t.Fatalf("trimMargin = %v, %v; queria corte", changed, err)
	}
	// 140×40 de conteúdo + 2px de respiro (4% de 40 = 1, piso de 2) de cada lado.
	if got := readSize(t, path); got != image.Pt(144, 44) {
		t.Fatalf("tamanho depois do corte = %v, queria (144,44)", got)
	}
}

// Trava que logo com fundo chapado (branco, caso do Mega Drive) também perde a
// moldura, e que a cor de fundo vem do canto, não é suposta transparente.
func TestTrimMarginCropsSolidBackground(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 200, 200))
	for y := 0; y < 200; y++ {
		for x := 0; x < 200; x++ {
			img.Set(x, y, color.NRGBA{255, 255, 255, 255})
		}
	}
	for y := 50; y < 150; y++ {
		for x := 50; x < 150; x++ {
			img.Set(x, y, color.NRGBA{200, 0, 0, 255})
		}
	}
	path := writePNG(t, img)

	if changed, err := trimMargin(path); err != nil || !changed {
		t.Fatalf("trimMargin = %v, %v; queria corte", changed, err)
	}
	if got := readSize(t, path); got != image.Pt(108, 108) {
		t.Fatalf("tamanho depois do corte = %v, queria (108,108)", got)
	}
}

// Trava que logo que já encosta nas bordas não é regravada: rodar o
// -trim-only duas vezes não pode mudar nada na segunda.
func TestTrimMarginLeavesFullBleedLogoAlone(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 40, 20))
	for y := 0; y < 20; y++ {
		for x := 0; x < 40; x++ {
			img.Set(x, y, color.NRGBA{0, 0, 0, 255})
		}
	}
	img.Set(0, 0, color.NRGBA{0, 0, 0, 0})
	path := writePNG(t, img)

	if changed, err := trimMargin(path); err != nil || changed {
		t.Fatalf("trimMargin = %v, %v; queria nada a cortar", changed, err)
	}
}
