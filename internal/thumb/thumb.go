// Package thumb generates the small JPEG previews served by the API.
package thumb

import (
	"image"
	"image/jpeg"
	"os"
	"path/filepath"

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
	draw.ApproxBiLinear.Scale(resized, resized.Bounds(), img, b, draw.Src, nil)

	// Write atomically via a temp file so a concurrent write of the same
	// thumbnail (duplicate content) or a crash never leaves a partial JPEG.
	tmp, err := os.CreateTemp(filepath.Dir(dst), ".thumb-*.jpg")
	if err != nil {
		return err
	}
	if err := jpeg.Encode(tmp, resized, &jpeg.Options{Quality: 85}); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmp.Name())
		return err
	}
	if err := os.Rename(tmp.Name(), dst); err != nil {
		os.Remove(tmp.Name())
		return err
	}
	return nil
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
