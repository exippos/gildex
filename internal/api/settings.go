package api

import "net/http"

func (a *API) handleSettings(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	s, err := st.Settings()
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s)
}

func (a *API) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var body struct {
		SessionGapMinutes *int    `json:"sessionGapMinutes"`
		BlurNsfw          *bool   `json:"blurNsfw"`
		NsfwTag           *string `json:"nsfwTag"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	s, err := st.UpdateSettings(body.SessionGapMinutes, body.BlurNsfw, body.NsfwTag)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s)
}

func (a *API) handleReclusterSessions(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	if err := st.ReclusterSessions(); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
