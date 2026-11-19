// Package watch periodically re-scans media sources configured with
// mode="watch" so their folder contents stay in sync (D43). Polling is the
// prototype implementation ("regularly recheck and sync"); an fsnotify-based
// watcher is the v1 hardening.
package watch

import (
	"context"
	"errors"
	"log"
	"time"

	"gildex/internal/importpkg"
	"gildex/internal/model"
	"gildex/internal/store"
)

// Manager polls watched sources on a fixed interval.
type Manager struct {
	lib      *store.Library
	interval time.Duration
}

// New returns a Manager. A non-positive interval defaults to one minute.
func New(lib *store.Library, interval time.Duration) *Manager {
	if interval <= 0 {
		interval = time.Minute
	}
	return &Manager{lib: lib, interval: interval}
}

// Run polls until ctx is cancelled. Each scan runs to completion before the
// interval timer restarts, so a slow scan over a large library can never be
// followed immediately by another full scan.
func (m *Manager) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(m.interval):
		}
		m.tick()
		if err := importpkg.Wait(ctx); err != nil {
			return
		}
	}
}

func (m *Manager) tick() {
	st := m.lib.Store()
	if st == nil {
		return
	}
	sources, err := st.Sources()
	if err != nil {
		log.Printf("gildex: watch: %v", err)
		return
	}
	for _, src := range sources {
		if src.Mode != model.SourceWatch {
			continue
		}
		// ScanSource is async and idempotent; a running job (ErrRunning) just
		// means we skip this tick and let the in-flight scan finish.
		err := importpkg.ScanSource(m.lib, src.ID)
		if err != nil && !errors.Is(err, importpkg.ErrRunning) &&
			!errors.Is(err, importpkg.ErrSwitching) &&
			!errors.Is(err, importpkg.ErrNoRoot) && !errors.Is(err, store.ErrNoSource) {
			log.Printf("gildex: watch %s: %v", src.Name, err)
		}
	}
}
