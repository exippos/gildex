package api

import (
	"net/http"

	"gildex/internal/reveal"
)

// handleRevealItem opens the OS file manager at an item's file, selecting it
// where the platform supports it. The path is resolved from the item id only,
// never taken from the request, so callers cannot reveal arbitrary paths.
func (a *API) handleRevealItem(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	item, err := st.GetItem(r.PathValue("id"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	abs, err := st.ResolveItemPath(item)
	if err != nil {
		writeError(w, http.StatusConflict, "cannot resolve the item's path")
		return
	}
	if err := reveal.Reveal(abs); err != nil {
		writeError(w, http.StatusInternalServerError, "cannot open the file manager: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
