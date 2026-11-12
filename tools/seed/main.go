// Command seed generates a folder of synthetic AI-generated images with
// A1111/ComfyUI-style PNG text metadata, staggered into time-burst "sessions",
// so the GILDEX prototype can be demoed without a real generation stash.
//
// Usage:
//
//	go run ./tools/seed -out ./seed-out -count 120 -sessions 4
//
// Then point the prototype at ./seed-out and import it.
package main

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"flag"
	"fmt"
	"hash/crc32"
	"image"
	"image/color"
	"log"
	"math/rand"
	"os"
	"path/filepath"
	"time"
)

var (
	out      = flag.String("out", "./seed-out", "output directory")
	count    = flag.Int("count", 120, "total images to generate")
	sessions = flag.Int("sessions", 4, "number of time-burst sessions")
	seed     = flag.Int64("seed", 42, "random seed")
)

var models = []string{
	"sd_xl_base_1.0", "dreamshaper_8", "flux.1_dev", "sd_v1.5", "realvisxlV40",
	"ponyDiffusionV6XL", "juggernautXL_v9",
}
var samplers = []string{"DPM++ 2M Karras", "Euler a", "DPM++ SDE Karras", "UniPC", "DDIM"}
var prompts = []string{
	"a lone lighthouse on a stormy cliff, dramatic clouds, cinematic lighting",
	"portrait of an old fisherman, weathered face, golden hour",
	"abandoned greenhouse overgrown with vines, volumetric light, concept art",
	"a tiny robot tending a rooftop garden, soft morning light, 35mm",
	"distant city skyline at dusk, neon reflections on wet pavement",
	"still life of copper teapot and dried flowers, warm interior",
	"fantasy castle floating above a waterfall, matte painting",
	"macro photograph of a butterfly wing, iridescent detail",
}
var negs = []string{
	"blurry, low quality, watermark, text, extra fingers",
	"deformed, ugly, oversaturated, jpeg artifacts",
	"bad anatomy, cropped, duplicate",
}

func main() {
	flag.Parse()
	if err := os.MkdirAll(*out, 0o755); err != nil {
		log.Fatal(err)
	}
	rng := rand.New(rand.NewSource(*seed))

	base := time.Now().Add(-30 * 24 * time.Hour) // start ~30 days ago
	per := *count / *sessions
	n := 0
	for s := 0; s < *sessions; s++ {
		// each burst starts 3h after the previous ends; items within a burst
		// are 30-90s apart so the 2h time-gap clusterer keeps each burst whole.
		burstStart := base.Add(time.Duration(s) * 3 * time.Hour)
		for i := 0; i < per && n < *count; i++ {
			ts := burstStart.Add(time.Duration(i*(30+rng.Intn(60))) * time.Second)
			genImage(rng, *out, n, ts)
			n++
		}
	}
	fmt.Printf("wrote %d images to %s\n", n, *out)
}

func genImage(rng *rand.Rand, dir string, idx int, ts time.Time) {
	// a handful of non-gen files to exercise graceful degradation
	plain := rng.Intn(10) == 0
	comfy := !plain && rng.Intn(5) == 0

	w := 256 + rng.Intn(3)*256
	h := 256 + rng.Intn(3)*256
	img := render(rng, idx, w, h)

	var meta string
	switch {
	case plain:
		meta = ""
	case comfy:
		meta = comfyMeta(rng, idx, w, h)
	default:
		meta = a1111Meta(rng, idx, w, h)
	}

	name := fmt.Sprintf("gen_%04d.png", idx)
	path := filepath.Join(dir, name)
	data := encodePNG(img, meta)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		log.Fatal(err)
	}
	// mtime as the organization anchor (D12 birth-time fallback)
	_ = os.Chtimes(path, ts, ts)
}

func render(rng *rand.Rand, idx, w, h int) image.Image {
	c0 := color.RGBA{uint8(20 + rng.Intn(120)), uint8(20 + rng.Intn(120)), uint8(30 + rng.Intn(120)), 255}
	c1 := color.RGBA{uint8(20 + rng.Intn(120)), uint8(30 + rng.Intn(120)), uint8(20 + rng.Intn(120)), 255}
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		t := float64(y) / float64(h)
		for x := 0; x < w; x++ {
			u := float64(x) / float64(w)
			img.SetRGBA(x, y, lerp(c0, c1, (t+u)/2))
		}
	}
	// a few shapes for visual variety
	for k := 0; k < 4+rng.Intn(5); k++ {
		col := color.RGBA{uint8(rng.Intn(255)), uint8(rng.Intn(255)), uint8(rng.Intn(255)), 255}
		rx, ry := rng.Intn(w), rng.Intn(h)
		rad := 20 + rng.Intn(80)
		for y := ry - rad; y < ry+rad; y++ {
			for x := rx - rad; x < rx+rad; x++ {
				if x < 0 || y < 0 || x >= w || y >= h {
					continue
				}
				if (x-rx)*(x-rx)+(y-ry)*(y-ry) < rad*rad {
					img.SetRGBA(x, y, col)
				}
			}
		}
	}
	return img
}

func lerp(a, b color.RGBA, t float64) color.RGBA {
	f := func(x, y uint8) uint8 { return uint8(float64(x)*(1-t) + float64(y)*t) }
	return color.RGBA{f(a.R, b.R), f(a.G, b.G), f(a.B, b.B), 255}
}

func a1111Meta(rng *rand.Rand, idx, w, h int) string {
	p := prompts[rng.Intn(len(prompts))] + ", " + prompts[rng.Intn(len(prompts))]
	neg := negs[rng.Intn(len(negs))]
	steps := 20 + rng.Intn(4)*5
	cfg := float64(5+rng.Intn(5)) + float64(rng.Intn(10))/10
	samp := samplers[rng.Intn(len(samplers))]
	model := models[rng.Intn(len(models))]
	hash := fmt.Sprintf("%08x", rng.Uint32())
	seed := rng.Int63()
	return fmt.Sprintf("%s\nNegative prompt: %s\nSteps: %d, Sampler: %s, CFG scale: %.1f, Seed: %d, Size: %dx%d, Model hash: %s, Model: %s, Clip skip: 2, Version: v1.9.0",
		p, neg, steps, samp, cfg, seed, w, h, hash, model)
}

func comfyMeta(rng *rand.Rand, idx, w, h int) string {
	pos := prompts[rng.Intn(len(prompts))]
	neg := negs[rng.Intn(len(negs))]
	model := models[rng.Intn(len(models))]
	return fmt.Sprintf(`{"3":{"class_type":"KSampler","inputs":{"seed":%d,"steps":28,"cfg":6.5}},"4":{"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"%s"}},"6":{"class_type":"CLIPTextEncode","inputs":{"text":"%s"}},"7":{"class_type":"CLIPTextEncode","inputs":{"text":"%s"}},"8":{"class_type":"EmptyLatentImage","inputs":{"width":%d,"height":%d}}}`,
		rng.Int63(), model, pos, neg, w, h)
}

// encodePNG writes an 8-bit RGBA PNG with a single optional tEXt "parameters"
// chunk (empty meta = no text chunk), using zlib-compressed scanlines.
func encodePNG(img image.Image, parameters string) []byte {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()

	var raw bytes.Buffer
	for y := 0; y < h; y++ {
		raw.WriteByte(0) // filter: none
		for x := 0; x < w; x++ {
			r, g, bl, a := img.At(b.Min.X+x, b.Min.Y+y).RGBA()
			raw.WriteByte(byte(r >> 8))
			raw.WriteByte(byte(g >> 8))
			raw.WriteByte(byte(bl >> 8))
			raw.WriteByte(byte(a >> 8))
		}
	}

	var idat bytes.Buffer
	zw := zlib.NewWriter(&idat)
	_, _ = zw.Write(raw.Bytes())
	_ = zw.Close()

	var out bytes.Buffer
	out.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})

	var ihdr bytes.Buffer
	_ = binary.Write(&ihdr, binary.BigEndian, uint32(w))
	_ = binary.Write(&ihdr, binary.BigEndian, uint32(h))
	ihdr.Write([]byte{8, 6, 0, 0, 0}) // bitdepth 8, color type RGBA, compression/filter/interlace 0
	writeChunk(&out, "IHDR", ihdr.Bytes())

	if parameters != "" {
		text := []byte("parameters\x00" + parameters)
		writeChunk(&out, "tEXt", text)
	}
	writeChunk(&out, "IDAT", idat.Bytes())
	writeChunk(&out, "IEND", nil)

	return out.Bytes()
}

func writeChunk(w *bytes.Buffer, typ string, data []byte) {
	_ = binary.Write(w, binary.BigEndian, uint32(len(data)))
	w.WriteString(typ)
	w.Write(data)
	crc := crc32.NewIEEE()
	crc.Write([]byte(typ))
	crc.Write(data)
	_ = binary.Write(w, binary.BigEndian, crc.Sum32())
}
