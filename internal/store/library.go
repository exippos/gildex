package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"gildex/internal/model"
)

// manifestFileName is the marker file that identifies a directory as a GILDEX
// library bundle (D43). It also records identity and schema version.
const manifestFileName = "library.gildex.json"

// librarySchemaVersion is bumped when the on-disk bundle layout changes.
const librarySchemaVersion = 1

// AppVersion is recorded in new manifests; informational only.
const AppVersion = "0.1.0"

type manifest struct {
	Name          string `json:"name"`
	ID            string `json:"id"`
	SchemaVersion int    `json:"schemaVersion"`
	CreatedAt     int64  `json:"createdAt"`
	AppVersion    string `json:"appVersion"`
}

// Library holds the single configured library bundle and its open store. The
// library is a directory (a `.gildex` bundle) containing the catalog database
// and derived caches; media lives in external sources, referenced in place.
type Library struct {
	mu         sync.RWMutex
	root       string
	id         string
	name       string
	last       string
	store      *Store
	dbOverride string
	statePath  string

	schemaVersion int
}

// NewLibrary creates an unconfigured library. dbOverride, when non-empty,
// replaces the default `<root>/catalog.db` database location. The previously
// opened library (if any) is loaded from app state so it can be reopened on
// the next launch.
func NewLibrary(dbOverride string) *Library {
	sp := statePath()
	l := &Library{dbOverride: dbOverride, statePath: sp}
	if s, err := loadAppState(sp); err == nil {
		l.last = s.LastLibrary
	}
	return l
}

// Root returns the configured library bundle path, or "" when unset.
func (l *Library) Root() string {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.root
}

// ID returns the library identity, or "" when unset.
func (l *Library) ID() string {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.id
}

// Name returns the library name, or "" when unset.
func (l *Library) Name() string {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.name
}

// LastLibrary returns the path of the most recently opened/created library,
// or "" when none has been recorded. It may equal the currently open library.
func (l *Library) LastLibrary() string {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.last
}

// SchemaVersion returns the open library's manifest schema version, or 0.
func (l *Library) SchemaVersion() int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.schemaVersion
}

// persistLast writes the last-opened library path to the app state file. It is
// best-effort: a failure to persist must not fail opening a library.
func (l *Library) persistLast(path string) {
	if l.statePath == "" {
		return
	}
	_ = saveAppState(l.statePath, appState{LastLibrary: path})
}

// Store returns the open store, or nil when no library has been opened.
func (l *Library) Store() *Store {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.store
}

// ThumbDir returns `<root>/thumbnails`, or "" when unset.
func (l *Library) ThumbDir() string {
	root := l.Root()
	if root == "" {
		return ""
	}
	return filepath.Join(root, "thumbnails")
}

// InboxDir returns `<root>/_inbox`, or "" when unset.
func (l *Library) InboxDir() string {
	root := l.Root()
	if root == "" {
		return ""
	}
	return filepath.Join(root, "_inbox")
}

// AttachmentsDir returns `<root>/attachments`, or "" when unset.
func (l *Library) AttachmentsDir() string {
	root := l.Root()
	if root == "" {
		return ""
	}
	return filepath.Join(root, "attachments")
}

// CreateLibrary creates a new library bundle at `<parentDir>/<name>.gildex`,
// writes its manifest and system directories, and opens it.
func (l *Library) CreateLibrary(name, parentDir string) error {
	parent, err := filepath.Abs(parentDir)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return err
	}

	name = sanitizeLibraryName(name)
	bundle := filepath.Join(parent, name+".gildex")
	if _, err := os.Stat(bundle); err == nil {
		return &ValidationError{Message: "a library already exists at " + bundle}
	}
	if err := os.MkdirAll(bundle, 0o755); err != nil {
		return err
	}
	if err := ensureBundleDirs(bundle); err != nil {
		return err
	}

	m := manifest{
		Name:          name,
		ID:            NewID(),
		SchemaVersion: librarySchemaVersion,
		CreatedAt:     time.Now().UnixMilli(),
		AppVersion:    AppVersion,
	}
	if err := writeManifest(bundle, m); err != nil {
		return err
	}
	return l.open(bundle, m)
}

// OpenLibrary opens an existing library bundle (or adopts a legacy root that
// has a catalog.db but no manifest).
func (l *Library) OpenLibrary(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	info, err := os.Stat(abs)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return &ValidationError{Message: "library path is not a directory"}
	}

	m, err := readManifest(abs)
	if err != nil {
		// Adopt a legacy prototype root: a directory with catalog.db but no
		// manifest becomes a library in place.
		if _, statErr := os.Stat(filepath.Join(abs, "catalog.db")); statErr != nil {
			return &ValidationError{Message: "not a GILDEX library (missing " + manifestFileName + ")"}
		}
		m = manifest{
			Name:          filepath.Base(abs),
			ID:            NewID(),
			SchemaVersion: librarySchemaVersion,
			CreatedAt:     time.Now().UnixMilli(),
			AppVersion:    AppVersion,
		}
		if err := writeManifest(abs, m); err != nil {
			return err
		}
	} else if m.SchemaVersion > librarySchemaVersion {
		return &ValidationError{Message: "library was created by a newer GILDEX version"}
	}

	if err := ensureBundleDirs(abs); err != nil {
		return err
	}
	return l.open(abs, m)
}

// open sets the fields and opens (creating if needed) the store for a bundle.
func (l *Library) open(bundle string, m manifest) error {
	dbPath := filepath.Join(bundle, "catalog.db")
	if l.dbOverride != "" {
		dbPath = l.dbOverride
		if !filepath.IsAbs(dbPath) {
			if absDB, err := filepath.Abs(dbPath); err == nil {
				dbPath = absDB
			}
		}
	}
	st, err := Open(dbPath, bundle)
	if err != nil {
		return err
	}

	l.mu.Lock()
	old := l.store
	l.root = bundle
	l.id = m.ID
	l.name = m.Name
	l.last = bundle
	l.store = st
	l.schemaVersion = m.SchemaVersion
	l.mu.Unlock()

	if old != nil {
		_ = old.Close()
	}
	l.persistLast(bundle)
	return nil
}

// Close closes the open store, if any.
func (l *Library) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.store == nil {
		return nil
	}
	err := l.store.Close()
	l.store = nil
	return err
}

// Status reports the library state for GET /api/status.
func (l *Library) Status() (model.LibraryStatus, error) {
	root := l.Root()
	st := l.Store()
	status := model.LibraryStatus{
		ID:            l.ID(),
		Name:          l.Name(),
		Root:          root,
		RootSet:       root != "",
		LastLibrary:   l.LastLibrary(),
		AppVersion:    AppVersion,
		SchemaVersion: l.SchemaVersion(),
		Platform:      runtime.GOOS,
	}
	if st == nil {
		return status, nil
	}
	counts, err := st.Counts()
	if err != nil {
		return status, err
	}
	sources, err := st.SourceCount()
	if err != nil {
		return status, err
	}
	status.ItemCount = counts.Items
	status.SessionCount = counts.Sessions
	status.TagCount = counts.Tags
	status.CollectionCount = counts.Collections
	status.SourceCount = sources
	return status, nil
}

func sanitizeLibraryName(name string) string {
	name = strings.TrimSpace(strings.ReplaceAll(name, string(filepath.Separator), " "))
	name = strings.TrimSpace(name)
	if name == "" {
		return "Library"
	}
	return name
}

func ensureBundleDirs(bundle string) error {
	for _, sub := range []string{"thumbnails", "attachments", "_inbox"} {
		if err := os.MkdirAll(filepath.Join(bundle, sub), 0o755); err != nil {
			return err
		}
	}
	return nil
}

func manifestPath(bundle string) string {
	return filepath.Join(bundle, manifestFileName)
}

func writeManifest(bundle string, m manifest) error {
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(manifestPath(bundle), append(data, '\n'), 0o644)
}

func readManifest(bundle string) (manifest, error) {
	var m manifest
	data, err := os.ReadFile(manifestPath(bundle))
	if err != nil {
		return m, err
	}
	if err := json.Unmarshal(data, &m); err != nil {
		return m, err
	}
	return m, nil
}
