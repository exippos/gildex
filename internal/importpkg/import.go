// Package importpkg implements the asynchronous import pipeline.
package importpkg

import (
	"context"
	"crypto/sha256"
	"database/sql"
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
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/webp"

	"gildex/internal/metadata"
	"gildex/internal/model"
	"gildex/internal/phash"
	"gildex/internal/store"
	"gildex/internal/thumb"
	"gildex/internal/video"
)

// videoFrames is how many hover-play frames to prerender per video (D18).
const videoFrames = 8

// ErrRunning is returned when an import job is already in flight.
var ErrRunning = errors.New("import already running")

// ErrNoRoot is returned when no library root has been configured.
var ErrNoRoot = errors.New("library root not set")

// ErrSwitching is returned while a library switch is waiting for the running
// import to stop. Watchers treat it like ErrRunning.
var ErrSwitching = errors.New("library switch in progress")

// stageStat accumulates wall time spent in one pipeline stage.
type stageStat struct {
	count int
	dur   time.Duration
}

type jobState struct {
	mu         sync.Mutex
	running    bool
	switching  bool
	cancel     context.CancelFunc
	done       chan struct{}
	total      int
	doneCount  int
	stage      string
	err        string
	duplicates []model.Duplicate
	startedAt  time.Time
	stages     map[string]stageStat
}

var job jobState

// addStage records one file's time in a named stage.
func (j *jobState) addStage(name string, d time.Duration) {
	j.mu.Lock()
	if j.stages == nil {
		j.stages = map[string]stageStat{}
	}
	s := j.stages[name]
	s.count++
	s.dur += d
	j.stages[name] = s
	j.mu.Unlock()
}

// Status returns a snapshot of the import job.
func Status() model.ImportStatus {
	job.mu.Lock()
	defer job.mu.Unlock()
	dups := make([]model.Duplicate, len(job.duplicates))
	copy(dups, job.duplicates)
	var rate float64
	if !job.startedAt.IsZero() {
		if elapsed := time.Since(job.startedAt).Seconds(); elapsed > 0 && job.doneCount > 0 {
			rate = float64(job.doneCount) / elapsed
		}
	}
	return model.ImportStatus{
		Running:     job.running,
		Total:       job.total,
		Done:        job.doneCount,
		Stage:       job.stage,
		Error:       job.err,
		ItemsPerSec: rate,
		Duplicates:  dups,
	}
}

// Start begins an import of specific paths (e.g. files uploaded into the
// inbox). Items are library-local: source id nil, paths relative to the root.
func Start(lib *store.Library, paths []string) error {
	st := lib.Store()
	if st == nil {
		return ErrNoRoot
	}
	return start(lib, nil, lib.Root(), paths)
}

// ScanSource imports every media file under one source's folder. Items are
// tagged with the source id and their paths are source-relative.
func ScanSource(lib *store.Library, sourceID string) error {
	st := lib.Store()
	if st == nil {
		return ErrNoRoot
	}
	src, err := st.GetSource(sourceID)
	if err != nil {
		return err
	}
	if src == nil {
		return store.ErrNoSource
	}
	return start(lib, &sourceID, src.Path, []string{src.Path})
}

// start begins a job. Only one job may run at a time.
func start(lib *store.Library, sourceID *string, base string, paths []string) error {
	thumbDir := lib.ThumbDir()

	job.mu.Lock()
	if job.switching {
		job.mu.Unlock()
		return ErrSwitching
	}
	if job.running {
		job.mu.Unlock()
		return ErrRunning
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	job.running = true
	job.cancel = cancel
	job.done = done
	job.total = 0
	job.doneCount = 0
	job.stage = "discover"
	job.err = ""
	job.duplicates = nil
	job.startedAt = time.Now()
	job.stages = map[string]stageStat{}
	job.mu.Unlock()

	go run(ctx, done, lib.Store(), base, thumbDir, sourceID, paths)
	return nil
}

// Stop blocks new import jobs and cancels the running one. Call Resume once
// the catalog is safe to import into again (e.g. after a library switch).
func Stop() {
	job.mu.Lock()
	job.switching = true
	cancel := job.cancel
	job.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

// Resume lets new import jobs start again.
func Resume() {
	job.mu.Lock()
	job.switching = false
	job.mu.Unlock()
}

// Wait blocks until the running job (if any) finishes or ctx is done.
func Wait(ctx context.Context) error {
	job.mu.Lock()
	done := job.done
	job.mu.Unlock()
	if done == nil {
		return nil
	}
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func run(ctx context.Context, done chan struct{}, st *store.Store, root, thumbDir string, sourceID *string, paths []string) {
	start := time.Now()
	defer func() {
		job.mu.Lock()
		job.running = false
		job.cancel = nil
		job.done = nil
		total := job.total
		finished := job.doneCount
		job.mu.Unlock()
		if ctx.Err() != nil {
			log.Printf("gildex: import cancelled after %d/%d files", finished, total)
		} else {
			logSummary(total, start)
		}
		close(done)
	}()

	t0 := time.Now()
	files, err := discover(root, thumbDir, paths)
	job.addStage("discover", time.Since(t0))
	if err != nil {
		setError(err)
		return
	}
	job.mu.Lock()
	job.total = len(files)
	job.mu.Unlock()
	if ctx.Err() != nil {
		setCancelled()
		return
	}

	setStage("process")
	if workers := workerCount(); workers <= 1 {
		for _, f := range files {
			if ctx.Err() != nil {
				setCancelled()
				return
			}
			processOne(ctx, st, thumbDir, sourceID, f)
		}
	} else if !processParallel(ctx, st, thumbDir, sourceID, files, workers) {
		setCancelled()
		return
	}
	if ctx.Err() != nil {
		setCancelled()
		return
	}

	setStage("cluster")
	t0 = time.Now()
	if err := st.ReclusterSessions(); err != nil {
		job.addStage("cluster", time.Since(t0))
		setError(err)
		return
	}
	job.addStage("cluster", time.Since(t0))
	if settings, err := st.Settings(); err == nil && settings.AutoClusterEpisodes {
		setStage("episodes")
		t0 = time.Now()
		if _, err := st.AutoClusterSessions(); err != nil {
			log.Printf("gildex: auto-cluster episodes: %v", err)
		}
		job.addStage("episodes", time.Since(t0))
	}
	setStage("index")
	if sourceID != nil {
		if err := st.TouchSource(*sourceID); err != nil {
			log.Printf("gildex: touch source %s: %v", *sourceID, err)
		}
	}
}

// workerCount returns the number of concurrent file-processing workers.
// It defaults to half the available cores (min 2) so a scan leaves headroom
// for the UI/browser instead of saturating the machine (D14 "yield to
// generation"); GILDEX_WORKERS overrides it for a one-off bulk import.
func workerCount() int {
	if v := strings.TrimSpace(os.Getenv("GILDEX_WORKERS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	n := runtime.NumCPU() / 2
	if n < 2 {
		n = 2
	}
	return n
}

// processOne handles a single file and advances the job counter.
func processOne(ctx context.Context, st *store.Store, thumbDir string, sourceID *string, f fileEntry) {
	if ctx.Err() != nil {
		return
	}
	if err := processFile(st, thumbDir, sourceID, f); err != nil && !importStopped(ctx, err) {
		log.Printf("gildex: import %s: %v", f.rel, err)
	}
	job.mu.Lock()
	job.doneCount++
	job.mu.Unlock()
}

// importStopped reports whether an error is the expected result of cancelling
// the job (or of shutting the catalog down mid-file), so shutdown does not log
// one "database is closed" line per remaining file.
func importStopped(ctx context.Context, err error) bool {
	if ctx.Err() != nil {
		return true
	}
	return errors.Is(err, sql.ErrConnDone) || strings.Contains(err.Error(), "database is closed")
}

// processParallel fans files out to a fixed pool of workers. Per-file DB access
// is serialized by the store's single connection, so this is safe; duplicate
// content is handled by UpsertImport's upsert semantics. It reports false when
// the context was cancelled before every file was handled.
func processParallel(ctx context.Context, st *store.Store, thumbDir string, sourceID *string, files []fileEntry, workers int) bool {
	var wg sync.WaitGroup
	ch := make(chan fileEntry)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case f, ok := <-ch:
					if !ok {
						return
					}
					processOne(ctx, st, thumbDir, sourceID, f)
				}
			}
		}()
	}
feed:
	for _, f := range files {
		select {
		case <-ctx.Done():
			break feed
		case ch <- f:
		}
	}
	close(ch)
	wg.Wait()
	return ctx.Err() == nil
}

// logSummary reports a one-line per-stage breakdown of a finished job.
func logSummary(total int, start time.Time) {
	job.mu.Lock()
	stages := make(map[string]stageStat, len(job.stages))
	for name, s := range job.stages {
		stages[name] = s
	}
	job.mu.Unlock()

	elapsed := time.Since(start)
	rate := 0.0
	if secs := elapsed.Seconds(); secs > 0 {
		rate = float64(total) / secs
	}

	names := make([]string, 0, len(stages))
	for name := range stages {
		names = append(names, name)
	}
	sort.Strings(names)
	parts := make([]string, 0, len(names))
	for _, name := range names {
		s := stages[name]
		parts = append(parts, fmt.Sprintf("%s=%s×%d", name, s.dur.Round(time.Millisecond), s.count))
	}

	log.Printf("gildex: import done: %d files in %s (%.1f files/s) — %s",
		total, elapsed.Round(time.Millisecond), rate, strings.Join(parts, " "))
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

func setCancelled() {
	job.mu.Lock()
	job.err = "import cancelled"
	job.stage = "cancelled"
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

func sameSource(a, b *string) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
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

func processFile(st *store.Store, thumbDir string, sourceID *string, f fileEntry) error {
	t0 := time.Now()
	hash, size, err := hashFile(f.abs)
	job.addStage("hash", time.Since(t0))
	if err != nil {
		return err
	}

	t0 = time.Now()
	tombstoned, err := st.TombstoneExists(hash)
	if err != nil {
		return err
	}
	if tombstoned {
		job.addStage("dedup", time.Since(t0))
		return nil
	}

	existing, err := st.FindByHash(hash)
	job.addStage("dedup", time.Since(t0))
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
		// Move detection is within a source only (D1); the same file seen from a
		// different source is a duplicate, not a move.
		if existing.RelativePath != f.rel && sameSource(existing.SourceID, sourceID) {
			return st.UpdateItemPath(existing.ID, f.rel, filepath.ToSlash(f.abs))
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
		OriginPath:   filepath.ToSlash(f.abs),
		SourceID:     sourceID,
		Kind:         kind,
		Format:       format,
		FileSize:     size,
		Timestamp:    info.ModTime().UnixMilli(),
		Extra:        map[string]string{},
	}

	if kind == model.KindImage {
		t0 = time.Now()
		img := decodeImage(f.abs)
		job.addStage("decode", time.Since(t0))
		if img != nil {
			b := img.Bounds()
			item.Width = b.Dx()
			item.Height = b.Dy()

			t0 = time.Now()
			item.PHash = phash.Compute(img)
			job.addStage("phash", time.Since(t0))

			thumbName := hash + ".jpg"
			t0 = time.Now()
			err := thumb.Generate(img, filepath.Join(thumbDir, thumbName))
			job.addStage("thumb", time.Since(t0))
			if err != nil {
				log.Printf("gildex: thumbnail %s: %v", f.rel, err)
			} else {
				item.ThumbnailPath = thumbName
			}
		}
	} else if kind == model.KindVideo {
		// Poster thumbnail + hover-play frame strip + duration, via ffmpeg on
		// PATH (D18, D33). Degrades silently to the placeholder when ffmpeg is
		// absent or the extraction fails — the item still imports.
		t0 = time.Now()
		res, err := video.Extract(f.abs, thumbDir, hash, videoFrames)
		job.addStage("video", time.Since(t0))
		if err != nil {
			log.Printf("gildex: video extract %s: %v", f.rel, err)
		}
		item.ThumbnailPath = res.ThumbnailPath
		item.FrameCount = res.FrameCount
		item.Width = res.Width
		item.Height = res.Height
		item.Duration = res.Duration
		if res.PHash != 0 {
			item.PHash = res.PHash
		}
	} else {
		// Audio: placeholder duration until audio thumbnailing lands (D42).
		zero := 0.0
		item.Duration = &zero
	}

	if format == "png" {
		t0 = time.Now()
		res, err := metadata.ParseFile(f.abs)
		job.addStage("metadata", time.Since(t0))
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

	t0 = time.Now()
	err = st.UpsertImport(item)
	job.addStage("db", time.Since(t0))
	return err
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
