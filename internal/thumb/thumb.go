// Package thumb generates the small JPEG previews served by the API.
package thumb

import (
	"image"
	"image/jpeg"
	"os"

	"golang.org/x/image/draw"
)

// Generate resizes img so its longest side is at most 512px (never upscaling)
// and writes a JPEG to dst.
func Generate(img image.Image, dst string) error {
	return GenerateAt(img, dst, 512)
}

// GenerateAt is like Generate but caps the longest side at maxSide pixels.
func GenerateAt(img image.Image, dst string, maxSide int) error {
	if img == nil {
		return nil
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return nil
	}

	nw, nh := w, h
	if longest := maxInt(w, h); maxSide > 0 && longest > maxSide {
		scale := float64(maxSide) / float64(longest)
		nw = maxInt(1, int(float64(w)*scale+0.5))
		nh = maxInt(1, int(float64(h)*scale+0.5))
	}

	resized := image.NewRGBA(image.Rect(0, 0, nw, nh))
	draw.CatmullRom.Scale(resized, resized.Bounds(), img, b, draw.Src, nil)

	f, err := os.Create(dst)
	if err != nil {
		return err
	}
	if err := jpeg.Encode(f, resized, &jpeg.Options{Quality: 85}); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
