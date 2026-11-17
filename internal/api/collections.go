package api

import (
	"encoding/json"
	"net/http"

	"gildex/internal/store"
)

func (a *API) handleCollections(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	collections, err := st.Collections()
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, collections)
}

func (a *API) handleCreateCollection(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	collection, err := st.CreateCollection(body.Name, body.Description)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, collection)
}

func (a *API) handleUpdateCollection(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var raw map[string]json.RawMessage
	if !decodeJSON(w, r, &raw) {
		return
	}
	var patch store.CollectionPatch
	if v, ok := raw["name"]; ok {
		var name string
		if err := json.Unmarshal(v, &name); err != nil {
			writeError(w, http.StatusBadRequest, "invalid name")
			return
		}
		patch.Name = &name
	}
	if v, ok := raw["description"]; ok {
		var description string
		if err := json.Unmarshal(v, &description); err != nil {
			writeError(w, http.StatusBadRequest, "invalid description")
			return
		}
		patch.Description = &description
	}
	if v, ok := raw["order"]; ok {
		var order []string
		if err := json.Unmarshal(v, &order); err != nil {
			writeError(w, http.StatusBadRequest, "invalid order")
			return
		}
		patch.Order = &order
	}
	cover, err := rawNullableString(raw, "coverItemId")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid coverItemId")
		return
	}
	patch.CoverItemID = cover
	triage, err := parseGroupTriage(raw)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	patch.Favorite = triage.Favorite
	patch.Rating = triage.Rating
	patch.Status = triage.Status
	patch.AddTags = triage.AddTags
	patch.RemoveTags = triage.RemoveTags
	collection, err := st.UpdateCollection(r.PathValue("id"), patch)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, collection)
}

func (a *API) handleDeleteCollection(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	if err := st.DeleteCollection(r.PathValue("id")); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) handleAddCollectionItems(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var body struct {
		ItemIDs []string `json:"itemIds"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if err := st.AddCollectionItems(r.PathValue("id"), body.ItemIDs); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) handleRemoveCollectionItem(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	if err := st.RemoveCollectionItem(r.PathValue("id"), r.PathValue("itemId")); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
