// Package importpkg implements the asynchronous import pipeline.
package importpkg

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"io/fs"
	"log"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/webp"

	"gildex/internal/metadata"
	"gildex/internal/model"
	"gildex/internal/phash"
	"gildex/internal/store"
	"gildex/internal/thumb"
)

// ErrRunning is returned when an import job is already in flight.
var ErrRunning = errors.New("import already running")

// ErrNoRoot is returned when no library root has been configured.
var ErrNoRoot = errors.New("library root not set")

type jobState struct {
	mu         sync.Mutex
	running    bool
	total      int
	done       int
	stage      string
	err        string
	duplicates []model.Duplicate
}

var job jobState

// Status returns a snapshot of the import job.
func Status() model.ImportStatus {
	job.mu.Lock()
	defer job.mu.Unlock()
	dups := make([]model.Duplicate, len(job.duplicates))
	copy(dups, job.duplicates)
	return model.ImportStatus{
		Running:    job.running,
		Total:      job.total,
		Done:       job.done,
		Stage:      job.stage,
		Error:      job.err,
		Duplicates: dups,
	}
}

// Start begins an import job. Only one job may run at a time.
func Start(lib *store.Library, paths []string) error {
	st := lib.Store()
	if st == nil {
		return ErrNoRoot
	}
	root := lib.Root()
	thumbDir := lib.ThumbDir()

	job.mu.Lock()
	if job.running {
		job.mu.Unlock()
		return ErrRunning
	}
	job.running = true
	job.total = 0
	job.done = 0
	job.stage = "discover"
	job.err = ""
	job.duplicates = nil
	job.mu.Unlock()

	go run(st, root, thumbDir, paths)
	return nil
}

func run(st *store.Store, root, thumbDir string, paths []string) {
	defer func() {
		job.mu.Lock()
		job.running = false
		job.mu.Unlock()
	}()

	files, err := discover(root, thumbDir, paths)
	if err != nil {
		setError(err)
		return
	}
	job.mu.Lock()
	job.total = len(files)
	job.mu.Unlock()

	for _, f := range files {
		if err := processFile(st, thumbDir, f); err != nil {
			log.Printf("gildex: import %s: %v", f.rel, err)
		}
		job.mu.Lock()
		job.done++
		job.mu.Unlock()
	}

	setStage("cluster")
	if err := st.ReclusterSessions(); err != nil {
		setError(err)
		return
	}
	setStage("index")
}

func setStage(stage string) {
	job.mu.Lock()
	job.stage = stage
	job.mu.Unlock()
}

func setError(err error) {
	job.mu.Lock()
	job.err = err.Error()
	job.stage = "error"
	job.mu.Unlock()
}

// addDuplicate records a file whose content hash is already cataloged.
func addDuplicate(d model.Duplicate) {
	job.mu.Lock()
	job.duplicates = append(job.duplicates, d)
	job.mu.Unlock()
}

type fileEntry struct {
	abs string
	rel string
}

func discover(root, thumbDir string, inputs []string) ([]fileEntry, error) {
	seen := map[string]bool{}
	var out []fileEntry

	addFile := func(abs, rel string) {
		if seen[abs] {
			return
		}
		seen[abs] = true
		out = append(out, fileEntry{abs: abs, rel: filepath.ToSlash(rel)})
	}

	for _, input := range inputs {
		input = strings.TrimSpace(input)
		if input == "" {
			continue
		}

		start := input
		if !filepath.IsAbs(start) {
			candidate := filepath.Join(root, start)
			if _, err := os.Stat(candidate); err == nil {
				start = candidate
			} else if abs, err := filepath.Abs(start); err == nil {
				start = abs
			}
		}
		start = filepath.Clean(start)

		info, err := os.Stat(start)
		if err != nil {
			return nil, fmt.Errorf("cannot access %s: %w", input, err)
		}
		if !info.IsDir() {
			if rel, ok := relWithin(root, start); ok {
				if kind, _ := classify(start); kind != "" {
					addFile(start, rel)
				}
			}
			continue
		}

		err = filepath.WalkDir(start, func(p string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return nil // skip unreadable entries
			}
			if d.IsDir() {
				if thumbDir != "" && p == thumbDir {
					return filepath.SkipDir
				}
				if p != start {
					name := d.Name()
					if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") {
						return filepath.SkipDir
					}
				}
				return nil
			}

			name := d.Name()
			if strings.HasPrefix(name, ".") {
				return nil
			}
			switch name {
			case "catalog.db", "catalog.db-wal", "catalog.db-shm":
				return nil
			}
			if kind, _ := classify(p); kind == "" {
				return nil
			}
			rel, ok := relWithin(root, p)
			if !ok {
				return nil
			}
			abs, err := filepath.Abs(p)
			if err != nil {
				return nil
			}
			addFile(abs, rel)
			return nil
		})
		if err != nil {
			return nil, err
		}
	}

	sort.Slice(out, func(i, j int) bool { return out[i].rel < out[j].rel })
	return out, nil
}

func relWithin(root, abs string) (string, bool) {
	rel, err := filepath.Rel(root, abs)
	if err != nil {
		return "", false
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false
	}
	return rel, true
}

func classify(file string) (model.Kind, string) {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(file), "."))
	switch ext {
	case "png":
		return model.KindImage, "png"
	case "jpg", "jpeg":
		return model.KindImage, "jpeg"
	case "webp":
		return model.KindImage, "webp"
	case "gif":
		return model.KindImage, "gif"
	case "bmp":
		return model.KindImage, "bmp"
	case "mp4":
		return model.KindVideo, "mp4"
	case "webm":
		return model.KindVideo, "webm"
	case "mov":
		return model.KindVideo, "mov"
	case "mkv":
		return model.KindVideo, "mkv"
	case "wav":
		return model.KindAudio, "wav"
	case "mp3":
		return model.KindAudio, "mp3"
	case "flac":
		return model.KindAudio, "flac"
	case "ogg":
		return model.KindAudio, "ogg"
	case "m4a":
		return model.KindAudio, "m4a"
	default:
		return "", ""
	}
}

func hashFile(path string) (string, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(h.Sum(nil)), n, nil
}

func processFile(st *store.Store, thumbDir string, f fileEntry) error {
	setStage("hash")
	hash, size, err := hashFile(f.abs)
	if err != nil {
		return err
	}

	setStage("index")
	tombstoned, err := st.TombstoneExists(hash)
	if err != nil {
		return err
	}
	if tombstoned {
		return nil
	}

	existing, err := st.FindByHash(hash)
	if err != nil {
		return err
	}
	if existing != nil {
		kind, _ := classify(f.abs)
		var thumbName string
		if kind == model.KindImage {
			thumbName = hash + ".jpg"
		}
		addDuplicate(model.Duplicate{ID: existing.ID, Name: path.Base(f.rel), Kind: kind, Thumb: thumbName})
		if existing.RelativePath != f.rel {
			return st.UpdateItemPath(existing.ID, f.rel)
		}
	}

	kind, format := classify(f.abs)
	if kind == "" {
		return nil
	}
	info, err := os.Stat(f.abs)
	if err != nil {
		return err
	}
	if size <= 0 {
		size = info.Size()
	}

	item := store.ImportItem{
		ContentHash:  hash,
		RelativePath: f.rel,
		Kind:         kind,
		Format:       format,
		FileSize:     size,
		Timestamp:    info.ModTime().UnixMilli(),
		Extra:        map[string]string{},
	}

	if kind == model.KindImage {
		setStage("extract")
		if img := decodeImage(f.abs); img != nil {
			b := img.Bounds()
			item.Width = b.Dx()
			item.Height = b.Dy()
			item.PHash = phash.Compute(img)

			thumbName := hash + ".jpg"
			if err := thumb.Generate(img, filepath.Join(thumbDir, thumbName)); err != nil {
				log.Printf("gildex: thumbnail %s: %v", f.rel, err)
			} else {
				item.ThumbnailPath = thumbName
			}
		}
	} else {
		zero := 0.0
		item.Duration = &zero
	}

	if format == "png" {
		setStage("parse")
		res, err := metadata.ParseFile(f.abs)
		if err == nil {
			item.Prompt = res.Prompt
			item.NegativePrompt = res.NegativePrompt
			item.ModelName = res.ModelName
			item.Seed = res.Seed
			item.Steps = res.Steps
			item.Sampler = res.Sampler
			item.CFGScale = res.CFGScale
			item.GeneratedAt = res.GeneratedAt
			item.RawMetadata = res.Raw
			if res.Extra != nil {
				item.Extra = res.Extra
			}
			if item.Width == 0 && res.Width > 0 {
				item.Width = res.Width
			}
			if item.Height == 0 && res.Height > 0 {
				item.Height = res.Height
			}
		}
	}

	setStage("timestamp")
	setStage("index")
	return st.UpsertImport(item)
}

func decodeImage(path string) image.Image {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	if err != nil {
		return nil
	}
	return img
}
