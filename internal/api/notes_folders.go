package api

import (
	"net/http"
	"strings"

	"gildex/internal/model"
)

func (a *API) handleNotes(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	v := r.URL.Query()
	ownerType := v.Get("ownerType")
	ownerID := v.Get("ownerId")
	if ownerType == "" || ownerID == "" {
		writeError(w, http.StatusBadRequest, "ownerType and ownerId are required")
		return
	}
	notes, err := st.Notes(ownerType, ownerID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, notes)
}

func (a *API) handleCreateNote(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var body struct {
		OwnerType string `json:"ownerType"`
		OwnerID   string `json:"ownerId"`
		Body      string `json:"body"`
		TypeLabel string `json:"typeLabel"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if !validOwnerType(body.OwnerType) {
		writeError(w, http.StatusBadRequest, "invalid ownerType")
		return
	}
	if strings.TrimSpace(body.OwnerID) == "" {
		writeError(w, http.StatusBadRequest, "ownerId is required")
		return
	}
	note, err := st.CreateNote(model.OwnerType(body.OwnerType), body.OwnerID, body.Body, body.TypeLabel)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, note)
}

func (a *API) handleUpdateNote(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var body struct {
		Body *string `json:"body"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.Body == nil {
		writeError(w, http.StatusBadRequest, "body is required")
		return
	}
	note, err := st.UpdateNoteBody(r.PathValue("id"), *body.Body)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, note)
}

func (a *API) handleDeleteNote(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	if err := st.DeleteNote(r.PathValue("id")); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) handleFolders(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	folders, err := st.Folders()
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, folders)
}

func validOwnerType(s string) bool {
	switch model.OwnerType(s) {
	case model.OwnerItem, model.OwnerSession, model.OwnerCollection:
		return true
	default:
		return false
	}
}
