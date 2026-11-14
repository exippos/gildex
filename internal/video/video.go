// Package video extracts poster thumbnails, hover-play frame strips, and
// duration metadata from video files by shelling out to ffmpeg and ffprobe on
// the system PATH.
//
// Extraction is deliberately best-effort. When the tools are missing or a step
// fails, the zero values of Result mean "not available" and callers can keep
// importing the file with a placeholder.
package video

import (
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"gildex/internal/phash"
	"gildex/internal/thumb"
)

// defaultFrames is used when Extract is asked for a non-positive frame count.
const defaultFrames = 8

// Result holds everything extracted from one video file. Zero values mean
// "not available", so callers can proceed without a thumbnail.
type Result struct {
	ThumbnailPath string   // "<hash>.jpg" written under thumbDir; "" if none
	FrameCount    int      // number of hover-play frames written; 0 if none
	Width         int      // pixel width of the poster frame
	Height        int      // pixel height of the poster frame
	Duration      *float64 // seconds; nil if unknown
	PHash         int64    // perceptual hash of the poster frame; 0 if unavailable
}

// Available reports whether ffmpeg is on PATH.
func Available() bool {
	_, err := exec.LookPath("ffmpeg")
	return err == nil
}

// Extract builds a poster thumbnail (512px) and up to frames hover-play frames
// (320px) for the video at file, writing JPEGs into thumbDir keyed by hash.
// Frame files are named "<hash>-f01.jpg" … "<hash>-fNN.jpg".
//
// If ffmpeg is missing it returns a zero Result with nil error. If ffmpeg runs
// but a step fails it returns whatever succeeded plus the first error; it never
// panics and never leaves temp files behind.
func Extract(file, thumbDir, hash string, frames int) (Result, error) {
	var res Result
	if !Available() {
		return res, nil
	}
	if frames <= 0 {
		frames = defaultFrames
	}

	tmp, err := os.MkdirTemp("", "gildex-video-")
	if err != nil {
		return res, fmt.Errorf("video temp dir: %w", err)
	}
	defer os.RemoveAll(tmp)

	var firstErr error
	record := func(err error) {
		if err != nil && firstErr == nil {
			firstErr = err
		}
	}

	// Duration is optional: ffprobe may be absent or the format may not carry
	// a duration, and neither should fail the whole extraction.
	res.Duration = probeDuration(file)

	// Poster frame: seek just past frame 0 so the thumbnail is not black.
	poster := filepath.Join(tmp, "poster.png")
	if err := runFFmpeg("-y", "-ss", "0.1", "-i", file, "-frames:v", "1", "-f", "image2", poster); err != nil {
		record(fmt.Errorf("poster frame: %w", err))
	} else if img, err := decodeFile(poster); err != nil {
		record(fmt.Errorf("decode poster: %w", err))
	} else {
		b := img.Bounds()
		res.Width = b.Dx()
		res.Height = b.Dy()
		res.PHash = phash.Compute(img)

		name := hash + ".jpg"
		if err := thumb.GenerateAt(img, filepath.Join(thumbDir, name), 512); err != nil {
			record(fmt.Errorf("write poster thumbnail: %w", err))
		} else {
			res.ThumbnailPath = name
		}
	}

	// Hover-play strip: sample roughly one frame per slot across the clip when
	// the duration is known, otherwise fall back to one frame per second.
	filter := "fps=1"
	if res.Duration != nil && *res.Duration > 0 {
		filter = fmt.Sprintf("fps=%d/%s", frames, strconv.FormatFloat(*res.Duration, 'f', -1, 64))
	}
	pattern := filepath.Join(tmp, "f%02d.png")
	if err := runFFmpeg("-y", "-i", file, "-vf", filter, "-frames:v", strconv.Itoa(frames), pattern); err != nil {
		record(fmt.Errorf("sample frames: %w", err))
	} else {
		names, err := frameFiles(tmp)
		if err != nil {
			record(fmt.Errorf("list frames: %w", err))
		} else {
			written := 0
			for _, name := range names {
				img, err := decodeFile(name)
				if err != nil {
					// A single unreadable frame must not discard the rest.
					continue
				}
				dst := filepath.Join(thumbDir, fmt.Sprintf("%s-f%02d.jpg", hash, written+1))
				if err := thumb.GenerateAt(img, dst, 320); err != nil {
					record(fmt.Errorf("write frame thumbnail: %w", err))
					continue
				}
				written++
			}
			res.FrameCount = written
		}
	}

	return res, firstErr
}

// probeDuration returns the clip duration from ffprobe, or nil when ffprobe is
// unavailable, fails, or reports no parseable duration.
func probeDuration(file string) *float64 {
	if _, err := exec.LookPath("ffprobe"); err != nil {
		return nil
	}
	var probe struct {
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}
	out, err := exec.Command("ffprobe", "-v", "error", "-print_format", "json", "-show_format", file).Output()
	if err != nil {
		return nil
	}
	if err := json.Unmarshal(out, &probe); err != nil {
		return nil
	}
	secs, err := strconv.ParseFloat(probe.Format.Duration, 64)
	if err != nil {
		return nil
	}
	return &secs
}

// runFFmpeg runs ffmpeg with args. On failure it returns an error carrying the
// tail of ffmpeg's stderr, so extraction problems are debuggable.
func runFFmpeg(args ...string) error {
	cmd := exec.Command("ffmpeg", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg %s: %w: %s", args[0], err, tail(string(out), 400))
	}
	return nil
}

// tail returns the last n runes of s.
func tail(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return strings.TrimSpace(s)
	}
	return strings.TrimSpace(string(r[len(r)-n:]))
}

// decodeFile decodes the image stored at path.
func decodeFile(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	return img, err
}

// frameFiles returns the PNGs ffmpeg wrote into dir, sorted by name.
func frameFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".png") {
			continue
		}
		if entry.Name() == "poster.png" {
			continue
		}
		names = append(names, filepath.Join(dir, entry.Name()))
	}
	sort.Strings(names)
	return names, nil
}
