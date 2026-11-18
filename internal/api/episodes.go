package api

import (
	"net/http"
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

// handleUpdateEpisode renames an episode.
func (a *API) handleUpdateEpisode(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var body struct {
		Label string `json:"label"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	episode, err := st.UpdateEpisode(r.PathValue("id"), body.Label)
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
