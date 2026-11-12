package api

import (
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"gildex/internal/importpkg"
)

// handleImportUpload accepts a multipart upload of media files, writes each into
// the library inbox (<root>/_inbox, preserving each part's relative filename),
// then starts the normal import pipeline on the written files.
func (a *API) handleImportUpload(w http.ResponseWriter, r *http.Request) {
	inbox := a.lib.InboxDir()
	if inbox == "" {
		writeError(w, http.StatusConflict, "library root not set")
		return
	}

	reader, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart body: "+err.Error())
		return
	}

	var written []string
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid multipart body: "+err.Error())
			return
		}

		rel, ok := cleanRelPath(part.FileName())
		if !ok || rel == "" {
			continue
		}

		dst := filepath.Join(inbox, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		f, err := os.Create(dst)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if _, err := io.Copy(f, part); err != nil {
			_ = f.Close()
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := f.Close(); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		written = append(written, dst)
	}

	if len(written) == 0 {
		writeError(w, http.StatusBadRequest, "no files received")
		return
	}

	if err := importpkg.Start(a.lib, written); err != nil {
		switch {
		case errors.Is(err, importpkg.ErrRunning):
			writeError(w, http.StatusConflict, err.Error())
		case errors.Is(err, importpkg.ErrNoRoot):
			writeError(w, http.StatusConflict, err.Error())
		default:
			handleStatusError(w, err)
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"started": true, "count": len(written)})
}

// cleanRelPath normalizes a client-supplied relative path (forward slashes),
// dropping "." and empty segments and rejecting any ".." traversal. It returns
// the cleaned slash-separated path and whether it was safe.
func cleanRelPath(rel string) (string, bool) {
	parts := strings.Split(filepath.ToSlash(rel), "/")
	clean := make([]string, 0, len(parts))
	for _, p := range parts {
		switch p {
		case "", ".":
			continue
		case "..":
			return "", false
		default:
			clean = append(clean, p)
		}
	}
	if len(clean) == 0 {
		return "", false
	}
	return strings.Join(clean, "/"), true
}
