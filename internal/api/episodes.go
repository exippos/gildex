package api

import (
	"encoding/json"
	"net/http"

	"gildex/internal/store"
)

// handleEpisodes lists the episodes of one session or collection.
func (a *API) handleEpisodes(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	episodes, err := st.Episodes(r.URL.Query().Get("ownerType"), r.URL.Query().Get("ownerId"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, episodes)
}

// handleCreateEpisode creates a manual episode and assigns its items.
func (a *API) handleCreateEpisode(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var body struct {
		OwnerType string   `json:"ownerType"`
		OwnerID   string   `json:"ownerId"`
		Label     string   `json:"label"`
		ItemIDs   []string `json:"itemIds"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	episode, err := st.CreateEpisode(body.OwnerType, body.OwnerID, body.Label, body.ItemIDs)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, episode)
}

// handleUpdateEpisode renames an episode and/or sets its cover image.
func (a *API) handleUpdateEpisode(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var raw map[string]json.RawMessage
	if !decodeJSON(w, r, &raw) {
		return
	}
	var patch store.EpisodePatch
	if v, ok := raw["label"]; ok {
		var label string
		if err := json.Unmarshal(v, &label); err != nil {
			writeError(w, http.StatusBadRequest, "invalid label")
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
	if patch.Label == nil && !patch.CoverItemID.Set {
		writeError(w, http.StatusBadRequest, "nothing to update")
		return
	}
	episode, err := st.UpdateEpisode(r.PathValue("id"), patch)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, episode)
}

// handleDeleteEpisode removes an episode; its items stay in the library.
func (a *API) handleDeleteEpisode(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	if err := st.DeleteEpisode(r.PathValue("id")); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleClearAutoEpisodes removes every automatic episode, keeping manual ones.
func (a *API) handleClearAutoEpisodes(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	removed, err := st.ClearAutoEpisodes()
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"removed": removed})
}

// handleAssignEpisodeItems moves items into an episode.
func (a *API) handleAssignEpisodeItems(w http.ResponseWriter, r *http.Request) {
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
	episode, err := st.AssignEpisodeItems(r.PathValue("id"), body.ItemIDs)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, episode)
}

// handleRemoveEpisodeItem detaches one item from an episode.
func (a *API) handleRemoveEpisodeItem(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	episode, err := st.RemoveEpisodeItem(r.PathValue("id"), r.PathValue("itemId"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, episode)
}

// handleClusterEpisodes rebuilds auto episodes for one group, or for every
// session when no owner is given.
func (a *API) handleClusterEpisodes(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var body struct {
		OwnerType string `json:"ownerType"`
		OwnerID   string `json:"ownerId"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	var (
		created int
		err     error
	)
	if body.OwnerType == "" {
		created, err = st.AutoClusterSessions()
	} else {
		created, err = st.AutoClusterEpisodes(body.OwnerType, body.OwnerID)
	}
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"created": created})
}
