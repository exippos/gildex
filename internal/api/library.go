package api

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gildex/internal/importpkg"
	"gildex/internal/model"
	"gildex/internal/store"
)

func (a *API) handleCreateLibrary(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name      string `json:"name"`
		Directory string `json:"directory"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if strings.TrimSpace(body.Directory) == "" {
		writeError(w, http.StatusBadRequest, "directory is required")
		return
	}
	if err := a.lib.CreateLibrary(body.Name, body.Directory); err != nil {
		writeStoreError(w, err)
		return
	}
	writeLibraryStatus(w, a)
}

func (a *API) handleOpenLibrary(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.Path) == "" {
		writeError(w, http.StatusBadRequest, "path is required")
		return
	}
	if err := a.lib.OpenLibrary(body.Path); err != nil {
		writeStoreError(w, err)
		return
	}
	writeLibraryStatus(w, a)
}

func writeLibraryStatus(w http.ResponseWriter, a *API) {
	status, err := a.lib.Status()
	if err != nil {
		handleStatusError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (a *API) handleSources(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	sources, err := st.Sources()
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, sources)
}

func (a *API) handleAddSource(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var body struct {
		Path string           `json:"path"`
		Name string           `json:"name"`
		Mode model.SourceMode `json:"mode"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.Path) == "" {
		writeError(w, http.StatusBadRequest, "path is required")
		return
	}
	src, err := st.AddSource(body.Name, body.Path, body.Mode)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, src)
}

func (a *API) handleUpdateSource(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var body struct {
		Name *string           `json:"name"`
		Mode *model.SourceMode `json:"mode"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	src, err := st.UpdateSource(r.PathValue("id"), body.Name, body.Mode)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, src)
}

func (a *API) handleDeleteSource(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	if err := st.DeleteSource(r.PathValue("id")); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) handleScanSource(w http.ResponseWriter, r *http.Request) {
	if a.lib.Store() == nil {
		writeError(w, http.StatusConflict, "library root not set")
		return
	}
	err := importpkg.ScanSource(a.lib, r.PathValue("id"))
	switch {
	case errors.Is(err, importpkg.ErrRunning):
		writeError(w, http.StatusConflict, err.Error())
		return
	case errors.Is(err, importpkg.ErrNoRoot):
		writeError(w, http.StatusConflict, err.Error())
		return
	case errors.Is(err, store.ErrNoSource):
		writeError(w, http.StatusNotFound, "source not found")
		return
	case err != nil:
		handleStatusError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"started": true})
}

// --- Filesystem browser (powers the in-app folder picker) ---

type fsEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
}

func (a *API) handleFSRoots(w http.ResponseWriter, r *http.Request) {
	home, _ := os.UserHomeDir()
	roots := []fsEntry{{Name: "/", Path: string(filepath.Separator), IsDir: true}}
	if home != "" {
		roots = append(roots, fsEntry{Name: home, Path: home, IsDir: true})
	}
	writeJSON(w, http.StatusOK, map[string]any{"home": home, "roots": roots})
}

// handleFSList lists the directories inside a path (directories first). It is a
// read-only browser for the local user's own filesystem; the service binds to
// localhost only (D5).
func (a *API) handleFSList(w http.ResponseWriter, r *http.Request) {
	p := strings.TrimSpace(r.URL.Query().Get("path"))
	if p == "" {
		home, _ := os.UserHomeDir()
		p = home
	}
	if p == "" {
		p = string(filepath.Separator)
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	entries, err := os.ReadDir(abs)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	dirs := make([]fsEntry, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		dirs = append(dirs, fsEntry{Name: name, Path: filepath.Join(abs, name), IsDir: true})
	}
	sort.Slice(dirs, func(i, j int) bool {
		return strings.ToLower(dirs[i].Name) < strings.ToLower(dirs[j].Name)
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"path":    abs,
		"parent":  filepath.Dir(abs),
		"entries": dirs,
	})
}
