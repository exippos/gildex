package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"gildex/internal/model"
	"gildex/internal/store"
)

func (a *API) handleItems(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	q, err := parseItemQuery(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	page, err := st.QueryItems(q)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func parseItemQuery(r *http.Request) (store.ItemQuery, error) {
	v := r.URL.Query()
	q := store.ItemQuery{
		SessionID:    v.Get("sessionId"),
		CollectionID: v.Get("collectionId"),
		Folder:       v.Get("folder"),
		Q:            v.Get("q"),
		Kind:         v.Get("kind"),
		Status:       v.Get("status"),
		Limit:        200,
		Sort:         v.Get("sort"),
		Dir:          v.Get("dir"),
	}
	if q.Sort == "" {
		q.Sort = "time"
	}
	if q.Dir == "" {
		q.Dir = "desc"
	}
	if q.Dir != "asc" && q.Dir != "desc" {
		return q, errInvalid("invalid dir")
	}
	if q.Status != "" && !validStatus(q.Status) {
		return q, errInvalid("invalid status")
	}
	if raw := v.Get("tags"); raw != "" {
		for _, tag := range strings.Split(raw, ",") {
			if tag = strings.TrimSpace(tag); tag != "" {
				q.Tags = append(q.Tags, tag)
			}
		}
	}
	if raw := v.Get("rating"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 || n > 5 {
			return q, errInvalid("invalid rating")
		}
		q.Rating = &n
	}
	if raw := v.Get("untagged"); raw != "" {
		b, err := strconv.ParseBool(raw)
		if err != nil {
			return q, errInvalid("invalid untagged")
		}
		q.Untagged = b
	}
	if raw := v.Get("favorite"); raw != "" {
		b, err := strconv.ParseBool(raw)
		if err != nil {
			return q, errInvalid("invalid favorite")
		}
		q.Favorite = &b
	}
	if raw := v.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			return q, errInvalid("invalid limit")
		}
		q.Limit = n
	}
	if raw := v.Get("offset"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			return q, errInvalid("invalid offset")
		}
		q.Offset = n
	}
	return q, nil
}

type requestError string

func (e requestError) Error() string { return string(e) }

func errInvalid(msg string) error { return requestError(msg) }

func (a *API) handleGetItem(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	item, err := st.GetItem(r.PathValue("id"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) handlePatchItem(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}

	var raw map[string]json.RawMessage
	if !decodeJSON(w, r, &raw) {
		return
	}
	if raw == nil {
		raw = map[string]json.RawMessage{}
	}

	var patch store.ItemPatch
	var err error
	if v, ok := raw["favorite"]; ok {
		var b bool
		if err := json.Unmarshal(v, &b); err != nil {
			writeError(w, http.StatusBadRequest, "invalid favorite")
			return
		}
		patch.Favorite = &b
	}
	if v, ok := raw["rating"]; ok {
		var n int
		if err := json.Unmarshal(v, &n); err != nil || n < 0 || n > 5 {
			writeError(w, http.StatusBadRequest, "invalid rating")
			return
		}
		patch.Rating = &n
	}
	if v, ok := raw["status"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err != nil || !validStatus(s) {
			writeError(w, http.StatusBadRequest, "invalid status")
			return
		}
		patch.Status = &s
	}
	if patch.Prompt, err = rawNullableString(raw, "prompt"); err != nil {
		writeError(w, http.StatusBadRequest, "invalid prompt")
		return
	}
	if patch.NegativePrompt, err = rawNullableString(raw, "negativePrompt"); err != nil {
		writeError(w, http.StatusBadRequest, "invalid negativePrompt")
		return
	}
	if patch.ModelName, err = rawNullableString(raw, "modelName"); err != nil {
		writeError(w, http.StatusBadRequest, "invalid modelName")
		return
	}
	if patch.Seed, err = rawNullableInt(raw, "seed"); err != nil {
		writeError(w, http.StatusBadRequest, "invalid seed")
		return
	}
	if patch.Steps, err = rawNullableInt(raw, "steps"); err != nil {
		writeError(w, http.StatusBadRequest, "invalid steps")
		return
	}
	if patch.Sampler, err = rawNullableString(raw, "sampler"); err != nil {
		writeError(w, http.StatusBadRequest, "invalid sampler")
		return
	}
	if patch.CFGScale, err = rawNullableFloat(raw, "cfgScale"); err != nil {
		writeError(w, http.StatusBadRequest, "invalid cfgScale")
		return
	}
	if patch.GeneratedAt, err = rawNullableInt(raw, "generatedAt"); err != nil {
		writeError(w, http.StatusBadRequest, "invalid generatedAt")
		return
	}

	item, err := st.UpdateItem(r.PathValue("id"), patch)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

type batchRequest struct {
	IDs                    []string        `json:"ids"`
	AddTags                []string        `json:"addTags"`
	RemoveTags             []string        `json:"removeTags"`
	AddToCollectionID      string          `json:"addToCollectionId"`
	RemoveFromCollectionID string          `json:"removeFromCollectionId"`
	Favorite               *bool           `json:"favorite"`
	Rating                 *int            `json:"rating"`
	Status                 *string         `json:"status"`
	SetSessionID           json.RawMessage `json:"setSessionId"`
	RemoveFromCatalog      bool            `json:"removeFromCatalog"`
}

func (a *API) handleBatch(w http.ResponseWriter, r *http.Request) {
	st := a.requireStore(w)
	if st == nil {
		return
	}
	var body batchRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.Rating != nil && (*body.Rating < 0 || *body.Rating > 5) {
		writeError(w, http.StatusBadRequest, "invalid rating")
		return
	}
	if body.Status != nil && !validStatus(*body.Status) {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}

	patch := store.BatchPatch{
		IDs:                    body.IDs,
		AddTags:                body.AddTags,
		RemoveTags:             body.RemoveTags,
		AddToCollectionID:      body.AddToCollectionID,
		RemoveFromCollectionID: body.RemoveFromCollectionID,
		Favorite:               body.Favorite,
		Rating:                 body.Rating,
		Status:                 body.Status,
		RemoveFromCatalog:      body.RemoveFromCatalog,
	}
	if len(body.SetSessionID) > 0 {
		patch.SessionSet = true
		if !bytes.Equal(bytes.TrimSpace(body.SetSessionID), []byte("null")) {
			var id string
			if err := json.Unmarshal(body.SetSessionID, &id); err != nil {
				writeError(w, http.StatusBadRequest, "invalid setSessionId")
				return
			}
			patch.SessionID = &id
		}
	}
	if err := st.Batch(patch); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func validStatus(s string) bool {
	switch model.Status(s) {
	case model.StatusDraft, model.StatusFinal, model.StatusWIP:
		return true
	default:
		return false
	}
}
