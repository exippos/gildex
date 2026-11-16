package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"gildex/internal/model"
	"gildex/internal/store"
)

func (a *API) handleSessions(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	sessions, err := st.Sessions()
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, sessions)
}

func (a *API) handleUpdateSession(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var raw map[string]json.RawMessage
	if !decodeJSON(w, r, &raw) {
		return
	}
	var patch store.SessionPatch
	if v, ok := raw["label"]; ok {
		var label string
		if err := json.Unmarshal(v, &label); err != nil || strings.TrimSpace(label) == "" {
			writeError(w, http.StatusBadRequest, "label is required")
			return
		}
		patch.Label = &label
	}
	cover, err := rawNullableString(raw, "coverItemId")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid coverItemId")
		return
	}
	patch.CoverItemID = cover
	session, err := st.UpdateSession(r.PathValue("id"), patch)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (a *API) handleTags(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	tags, err := st.Tags()
	if err != nil {
		writeStoreError(w, err)
		return
	}
	untagged, err := st.UntaggedCount()
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, model.TagList{Tags: tags, Untagged: untagged})
}

func (a *API) handleCreateTag(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	tag, err := st.CreateTag(body.Name)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, tag)
}

func (a *API) handleDeleteTag(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	if err := st.DeleteTag(r.PathValue("id")); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

const tagExportFormat = "gildex.tags"

func (a *API) handleExportTags(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	tags, err := st.Tags()
	if err != nil {
		writeStoreError(w, err)
		return
	}
	entries := make([]model.TagExportEntry, len(tags))
	for i, tag := range tags {
		entries[i] = model.TagExportEntry{
			Name:      tag.Name,
			Family:    tag.Family,
			ItemCount: tag.ItemCount,
		}
	}
	w.Header().Set("Content-Disposition", `attachment; filename="gildex-tags.json"`)
	writeJSON(w, http.StatusOK, model.TagExport{
		Format:     tagExportFormat,
		Version:    1,
		ExportedAt: time.Now().UnixMilli(),
		Tags:       entries,
	})
}

func (a *API) handleImportTags(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var body struct {
		Names []string `json:"names"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if len(body.Names) == 0 {
		writeError(w, http.StatusBadRequest, "no tag names")
		return
	}
	if len(body.Names) > 20000 {
		writeError(w, http.StatusBadRequest, "too many tag names (max 20000)")
		return
	}
	summary, err := st.ImportTags(body.Names)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, summary)
}
