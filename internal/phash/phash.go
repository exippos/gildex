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

	// Two-step downscale: a fast bilinear pass to a small intermediate avoids
	// the cubic cost of resampling a full-resolution source straight to 9×8.
	src := img
	if b := img.Bounds(); b.Dx() > 64 || b.Dy() > 64 {
		scale := 64.0 / float64(maxInt(b.Dx(), b.Dy()))
		nw := maxInt(1, int(float64(b.Dx())*scale))
		nh := maxInt(1, int(float64(b.Dy())*scale))
		mid := image.NewGray(image.Rect(0, 0, nw, nh))
		draw.ApproxBiLinear.Scale(mid, mid.Bounds(), img, b, draw.Src, nil)
		src = mid
	}

	small := image.NewGray(image.Rect(0, 0, 9, 8))
	draw.ApproxBiLinear.Scale(small, small.Bounds(), src, src.Bounds(), draw.Src, nil)

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

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
