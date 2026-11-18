// Package api implements the JSON HTTP contract under /api.
package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"

	"gildex/internal/importpkg"
	"gildex/internal/store"
)

// API serves the GILDEX catalog endpoints.
type API struct {
	lib *store.Library
}

// New creates an API bound to lib.
func New(lib *store.Library) *API { return &API{lib: lib} }

// Register wires every API route onto mux.
func (a *API) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/status", a.handleStatus)
	mux.HandleFunc("GET /api/settings", a.handleSettings)
	mux.HandleFunc("PATCH /api/settings", a.handleUpdateSettings)
	mux.HandleFunc("POST /api/library", a.handleCreateLibrary)
	mux.HandleFunc("POST /api/library/open", a.handleOpenLibrary)

	mux.HandleFunc("GET /api/sources", a.handleSources)
	mux.HandleFunc("POST /api/sources", a.handleAddSource)
	mux.HandleFunc("PATCH /api/sources/{id}", a.handleUpdateSource)
	mux.HandleFunc("DELETE /api/sources/{id}", a.handleDeleteSource)
	mux.HandleFunc("POST /api/sources/{id}/scan", a.handleScanSource)

	mux.HandleFunc("GET /api/fs/list", a.handleFSList)
	mux.HandleFunc("GET /api/fs/roots", a.handleFSRoots)

	mux.HandleFunc("POST /api/import", a.handleImport)
	mux.HandleFunc("POST /api/import/upload", a.handleImportUpload)
	mux.HandleFunc("GET /api/import/status", a.handleImportStatus)

	mux.HandleFunc("GET /api/items", a.handleItems)
	mux.HandleFunc("PATCH /api/items/batch", a.handleBatch)
	mux.HandleFunc("GET /api/items/{id}", a.handleGetItem)
	mux.HandleFunc("PATCH /api/items/{id}", a.handlePatchItem)

	mux.HandleFunc("GET /api/sessions", a.handleSessions)
	mux.HandleFunc("POST /api/sessions/recluster", a.handleReclusterSessions)
	mux.HandleFunc("PATCH /api/sessions/{id}", a.handleUpdateSession)

	mux.HandleFunc("GET /api/tags", a.handleTags)
	mux.HandleFunc("POST /api/tags", a.handleCreateTag)
	mux.HandleFunc("GET /api/tags/export", a.handleExportTags)
	mux.HandleFunc("POST /api/tags/import", a.handleImportTags)
	mux.HandleFunc("DELETE /api/tags/{id}", a.handleDeleteTag)

	mux.HandleFunc("GET /api/collections", a.handleCollections)
	mux.HandleFunc("POST /api/collections", a.handleCreateCollection)
	mux.HandleFunc("PATCH /api/collections/{id}", a.handleUpdateCollection)
	mux.HandleFunc("DELETE /api/collections/{id}", a.handleDeleteCollection)
	mux.HandleFunc("POST /api/collections/{id}/items", a.handleAddCollectionItems)
	mux.HandleFunc("DELETE /api/collections/{id}/items/{itemId}", a.handleRemoveCollectionItem)

	mux.HandleFunc("GET /api/folders", a.handleFolders)

	mux.HandleFunc("GET /api/notes", a.handleNotes)
	mux.HandleFunc("POST /api/notes", a.handleCreateNote)
	mux.HandleFunc("PATCH /api/notes/{id}", a.handleUpdateNote)
	mux.HandleFunc("DELETE /api/notes/{id}", a.handleDeleteNote)

	mux.HandleFunc("GET /api/episodes", a.handleEpisodes)
	mux.HandleFunc("POST /api/episodes", a.handleCreateEpisode)
	mux.HandleFunc("POST /api/episodes/cluster", a.handleClusterEpisodes)
	mux.HandleFunc("PATCH /api/episodes/{id}", a.handleUpdateEpisode)
	mux.HandleFunc("DELETE /api/episodes/{id}", a.handleDeleteEpisode)
	mux.HandleFunc("POST /api/episodes/{id}/items", a.handleAssignEpisodeItems)
	mux.HandleFunc("DELETE /api/episodes/{id}/items/{itemId}", a.handleRemoveEpisodeItem)

	mux.HandleFunc("GET /api/thumb/{file}", a.handleThumb)
	mux.HandleFunc("GET /api/media/{id}", a.handleMedia)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeStoreError(w http.ResponseWriter, err error) {
	var ve store.ValidationError
	if errors.As(err, &ve) {
		writeError(w, http.StatusBadRequest, ve.Message)
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	writeError(w, http.StatusInternalServerError, err.Error())
}

func (a *API) requireStore(w http.ResponseWriter) *store.Store {
	st := a.lib.Store()
	if st == nil {
		writeError(w, http.StatusConflict, "library root not set")
		return nil
	}
	return st
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<20))
	if err := dec.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return false
	}
	return true
}

func handleStatusError(w http.ResponseWriter, err error) {
	writeError(w, http.StatusInternalServerError, err.Error())
}

func (a *API) handleStatus(w http.ResponseWriter, r *http.Request) {
	status, err := a.lib.Status()
	if err != nil {
		handleStatusError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (a *API) handleImport(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Paths []string `json:"paths"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	clean := make([]string, 0, len(body.Paths))
	for _, p := range body.Paths {
		if p != "" {
			clean = append(clean, p)
		}
	}
	if len(clean) == 0 {
		writeError(w, http.StatusBadRequest, "paths is required")
		return
	}
	err := importpkg.Start(a.lib, clean)
	switch {
	case errors.Is(err, importpkg.ErrRunning), errors.Is(err, importpkg.ErrSwitching):
		writeError(w, http.StatusConflict, err.Error())
		return
	case errors.Is(err, importpkg.ErrNoRoot):
		writeError(w, http.StatusConflict, err.Error())
		return
	case err != nil:
		handleStatusError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"started": true})
}

func (a *API) handleImportStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, importpkg.Status())
}

// nullable string/int/float helpers for PATCH bodies.

func rawNullableString(raw map[string]json.RawMessage, key string) (store.NullableString, error) {
	r, ok := raw[key]
	if !ok {
		return store.NullableString{}, nil
	}
	if bytes.Equal(bytes.TrimSpace(r), []byte("null")) {
		return store.NullableString{Set: true}, nil
	}
	var s string
	if err := json.Unmarshal(r, &s); err != nil {
		return store.NullableString{}, err
	}
	return store.NullableString{Set: true, Value: &s}, nil
}

func rawNullableInt(raw map[string]json.RawMessage, key string) (store.NullableInt64, error) {
	r, ok := raw[key]
	if !ok {
		return store.NullableInt64{}, nil
	}
	if bytes.Equal(bytes.TrimSpace(r), []byte("null")) {
		return store.NullableInt64{Set: true}, nil
	}
	var n int64
	if err := json.Unmarshal(r, &n); err != nil {
		return store.NullableInt64{}, err
	}
	return store.NullableInt64{Set: true, Value: &n}, nil
}

func rawNullableFloat(raw map[string]json.RawMessage, key string) (store.NullableFloat64, error) {
	r, ok := raw[key]
	if !ok {
		return store.NullableFloat64{}, nil
	}
	if bytes.Equal(bytes.TrimSpace(r), []byte("null")) {
		return store.NullableFloat64{Set: true}, nil
	}
	var f float64
	if err := json.Unmarshal(r, &f); err != nil {
		return store.NullableFloat64{}, err
	}
	return store.NullableFloat64{Set: true, Value: &f}, nil
}
