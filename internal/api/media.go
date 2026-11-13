package api

import (
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"gildex/internal/model"
)

func (a *API) handleThumb(w http.ResponseWriter, r *http.Request) {
	root := a.lib.Root()
	if root == "" {
		writeError(w, http.StatusConflict, "library root not set")
		return
	}
	name := r.PathValue("file")
	if name == "" || name == "." || name == ".." || filepath.Base(name) != name {
		writeError(w, http.StatusBadRequest, "invalid thumbnail name")
		return
	}
	path := filepath.Join(root, "thumbnails", name)
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		writeError(w, http.StatusNotFound, "thumbnail not found")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, path)
}

func (a *API) handleMedia(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	item, err := st.GetItem(r.PathValue("id"))
	if err != nil {
		writeStoreError(w, err)
		return
	}

	root := a.lib.Root()
	abs := filepath.Join(root, filepath.FromSlash(item.RelativePath))
	if !withinRoot(root, abs) {
		writeError(w, http.StatusBadRequest, "invalid media path")
		return
	}

	f, err := os.Open(abs)
	if err != nil {
		writeError(w, http.StatusNotFound, "media file not found on disk")
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		writeError(w, http.StatusNotFound, "media file not found on disk")
		return
	}

	w.Header().Set("Content-Type", mediaContentType(item))
	w.Header().Set("Content-Disposition", `inline; filename="`+sanitizeFilename(filepath.Base(abs))+`"`)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

func withinRoot(root, abs string) bool {
	rel, err := filepath.Rel(root, abs)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func mediaContentType(item *model.Item) string {
	switch strings.ToLower(item.Format) {
	case "png":
		return "image/png"
	case "jpg", "jpeg":
		return "image/jpeg"
	case "webp":
		return "image/webp"
	case "gif":
		return "image/gif"
	case "bmp":
		return "image/bmp"
	case "mp4":
		return "video/mp4"
	case "webm":
		return "video/webm"
	case "mov":
		return "video/quicktime"
	case "mkv":
		return "video/x-matroska"
	case "wav":
		return "audio/wav"
	case "mp3":
		return "audio/mpeg"
	case "flac":
		return "audio/flac"
	case "ogg":
		return "audio/ogg"
	case "m4a":
		return "audio/mp4"
	}
	if ct := mime.TypeByExtension("." + item.Format); ct != "" {
		return ct
	}
	return "application/octet-stream"
}

func sanitizeFilename(name string) string {
	return strings.NewReplacer(`"`, "", `\`, "", "\n", "", "\r", "").Replace(name)
}
