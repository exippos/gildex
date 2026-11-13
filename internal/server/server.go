// Package server wires the API and the static frontend into one handler.
package server

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"gildex/internal/api"
	"gildex/internal/store"
)

// NewHandler returns the complete HTTP handler: /api routes plus the built
// frontend (with SPA fallback) from distDir.
func NewHandler(lib *store.Library, distDir string) http.Handler {
	mux := http.NewServeMux()
	api.New(lib).Register(mux)

	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_, _ = io.WriteString(w, `{"error":"not found"}`+"\n")
	})
	mux.Handle("/", spaHandler{dist: distDir})
	return mux
}

type spaHandler struct {
	dist string
}

func (h spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api") {
		http.NotFound(w, r)
		return
	}

	indexPath := filepath.Join(h.dist, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		if r.URL.Path == "/" {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = io.WriteString(w, "GILDEX API is running.\n\nThe frontend bundle was not found; build it with `npm run build` in frontend/.\n")
			return
		}
		http.NotFound(w, r)
		return
	}

	clean := filepath.Clean("/" + r.URL.Path)
	filePath := filepath.Join(h.dist, filepath.FromSlash(strings.TrimPrefix(clean, "/")))
	if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
		http.ServeFile(w, r, filePath)
		return
	}
	http.ServeFile(w, r, indexPath)
}
