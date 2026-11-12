// Package phash computes a 64-bit difference hash (dHash) for images.
package phash

import (
	"image"

	"golang.org/x/image/draw"
)

// Compute returns the 64-bit horizontal difference hash of img. The same bit
// layout is returned for the same image, so values can be compared with
// Hamming distance later (near-dup grouping is out of scope for P0).
func Compute(img image.Image) int64 {
	if img == nil {
		return 0
	}
	small := image.NewGray(image.Rect(0, 0, 9, 8))
	draw.CatmullRom.Scale(small, small.Bounds(), img, img.Bounds(), draw.Src, nil)

	var bits uint64
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			if small.GrayAt(x, y).Y > small.GrayAt(x+1, y).Y {
				bits |= 1 << uint(y*8+x)
			}
		}
	}
	return int64(bits)
}
