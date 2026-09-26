package main

import (
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
)

// trimMargin corta a moldura vazia em volta da logo e regrava o arquivo no
// lugar. Existe porque várias logos do IGDB vêm num quadrado de 160×160 com a
// marca ocupando uma faixa fina no meio (PS2: 3,6% dos pixels) — com
// `object-contain` a interface tem que mostrar a moldura inteira, e a logo
// sai minúscula no card. O fundo é a cor do canto superior esquerdo:
// transparente na maioria, branco ou preto nas que vêm "chapadas".
//
// Devolve false quando não há o que cortar (a logo já encosta nas bordas).
func trimMargin(path string) (bool, error) {
	f, err := os.Open(path)
	if err != nil {
		return false, err
	}
	src, err := png.Decode(f)
	f.Close()
	if err != nil {
		return false, fmt.Errorf("lendo %s: %w", path, err)
	}

	bounds := src.Bounds()
	content, ok := contentBounds(src)
	if !ok {
		return false, nil
	}

	// Um respiro de ~4% do lado menor: sem ele, o traço da logo encosta na
	// borda da etiqueta e parece cortado mesmo não estando.
	pad := max(2, min(content.Dx(), content.Dy())*4/100)
	crop := image.Rect(content.Min.X-pad, content.Min.Y-pad, content.Max.X+pad, content.Max.Y+pad).Intersect(bounds)
	if crop == bounds {
		return false, nil
	}

	dst := image.NewNRGBA(image.Rect(0, 0, crop.Dx(), crop.Dy()))
	draw.Draw(dst, dst.Bounds(), src, crop.Min, draw.Src)

	out, err := os.Create(path)
	if err != nil {
		return false, err
	}
	if err := png.Encode(out, dst); err != nil {
		out.Close()
		return false, fmt.Errorf("gravando %s: %w", path, err)
	}
	return true, out.Close()
}

// contentBounds devolve o retângulo que contém todo pixel diferente do fundo.
// Tolerância em vez de igualdade exata porque a compressão das logos do IGDB
// deixa um halo de pixels quase-fundo em volta do traço; sem ela, esse ruído
// impediria qualquer corte.
func contentBounds(img image.Image) (image.Rectangle, bool) {
	b := img.Bounds()
	bg := toNRGBA(img, b.Min.X, b.Min.Y)
	bgTransparent := bg.A < 20

	found := false
	var r image.Rectangle
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := toNRGBA(img, x, y)
			var differs bool
			if bgTransparent {
				differs = c.A > 20
			} else {
				differs = absDiff(c.R, bg.R)+absDiff(c.G, bg.G)+absDiff(c.B, bg.B) > 120 || c.A < 20
			}
			if !differs {
				continue
			}
			p := image.Rect(x, y, x+1, y+1)
			if !found {
				r, found = p, true
			} else {
				r = r.Union(p)
			}
		}
	}
	return r, found
}

func toNRGBA(img image.Image, x, y int) (c struct{ R, G, B, A uint8 }) {
	r, g, b, a := img.At(x, y).RGBA()
	if a == 0 {
		return c
	}
	// RGBA() devolve pré-multiplicado; desfaz para comparar cor de verdade.
	c.R = uint8(r * 0xffff / a >> 8)
	c.G = uint8(g * 0xffff / a >> 8)
	c.B = uint8(b * 0xffff / a >> 8)
	c.A = uint8(a >> 8)
	return c
}

func absDiff(a, b uint8) int {
	if a > b {
		return int(a - b)
	}
	return int(b - a)
}
