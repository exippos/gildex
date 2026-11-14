package api

import (
	"encoding/json"
	"net/http"
	"strings"

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
