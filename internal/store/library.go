package store

import (
	"os"
	"path/filepath"
	"sync"

	"gildex/internal/model"
)

// Library holds the single configured root and its open store. The root and
// database are only opened once a root has been chosen.
type Library struct {
	mu         sync.RWMutex
	root       string
	store      *Store
	dbOverride string
}

// NewLibrary creates an unconfigured library. dbOverride, when non-empty,
// replaces the default `<root>/catalog.db` database location.
func NewLibrary(dbOverride string) *Library {
	return &Library{dbOverride: dbOverride}
}

// Root returns the configured root, or "" when unset.
func (l *Library) Root() string {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.root
}

// Store returns the open store, or nil when no root has been configured.
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

// SetRoot opens (creating if needed) the catalog and thumbnails directories
// for root, replacing any previously configured library.
func (l *Library) SetRoot(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return err
	}
	thumbDir := filepath.Join(abs, "thumbnails")
	if err := os.MkdirAll(thumbDir, 0o755); err != nil {
		return err
	}

	dbPath := filepath.Join(abs, "catalog.db")
	if l.dbOverride != "" {
		dbPath = l.dbOverride
		if !filepath.IsAbs(dbPath) {
			if absDB, err := filepath.Abs(dbPath); err == nil {
				dbPath = absDB
			}
		}
	}

	st, err := Open(dbPath, abs)
	if err != nil {
		return err
	}

	l.mu.Lock()
	old := l.store
	l.root = abs
	l.store = st
	l.mu.Unlock()

	if old != nil {
		_ = old.Close()
	}
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
	status := model.LibraryStatus{Root: root, RootSet: root != ""}
	if st == nil {
		return status, nil
	}
	counts, err := st.Counts()
	if err != nil {
		return status, err
	}
	status.ItemCount = counts.Items
	status.SessionCount = counts.Sessions
	status.TagCount = counts.Tags
	status.CollectionCount = counts.Collections
	return status, nil
}
