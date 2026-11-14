package store

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"gildex/internal/model"
)

// ItemQuery is the parsed filter set for GET /api/items.
type ItemQuery struct {
	SessionID    string
	CollectionID string
	Folder       string
	Tags         []string
	Untagged     bool
	Q            string
	Kind         string
	Rating       *int
	Status       string
	Favorite     *bool
	Limit        int
	Offset       int
	Sort         string
	Dir          string
}

// NullableString distinguishes "absent" from an explicit JSON null.
type NullableString struct {
	Set   bool
	Value *string
}

// NullableInt64 distinguishes "absent" from an explicit JSON null.
type NullableInt64 struct {
	Set   bool
	Value *int64
}

// NullableFloat64 distinguishes "absent" from an explicit JSON null.
type NullableFloat64 struct {
	Set   bool
	Value *float64
}

// ItemPatch is a partial item update. Explicit null clears nullable fields.
type ItemPatch struct {
	Favorite       *bool
	Rating         *int
	Status         *string
	Prompt         NullableString
	NegativePrompt NullableString
	ModelName      NullableString
	Seed           NullableInt64
	Steps          NullableInt64
	Sampler        NullableString
	CFGScale       NullableFloat64
	GeneratedAt    NullableInt64
}

// QueryItems returns one page of items plus the total number of matching rows.
func (s *Store) QueryItems(q ItemQuery) (model.ItemPage, error) {
	page := model.ItemPage{Items: []model.Item{}}

	var where []string
	var args []any
	if q.SessionID != "" {
		where = append(where, "i.session_id = ?")
		args = append(args, q.SessionID)
	}
	if q.CollectionID != "" {
		where = append(where, "i.id IN (SELECT ci.item_id FROM collection_item ci WHERE ci.collection_id = ?)")
		args = append(args, q.CollectionID)
	}
	if folder := strings.Trim(strings.ReplaceAll(q.Folder, `\`, "/"), "/"); folder != "" && folder != "." {
		where = append(where, `i.relative_path LIKE ? ESCAPE '\'`)
		args = append(args, escapeLike(folder)+"/%")
	}
	for _, tag := range q.Tags {
		if tag = strings.TrimSpace(tag); tag == "" {
			continue
		}
		where = append(where, `EXISTS (SELECT 1 FROM item_tag it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id AND t.name = ? COLLATE NOCASE)`)
		args = append(args, tag)
	}
	if q.Untagged {
		where = append(where, `NOT EXISTS (SELECT 1 FROM item_tag it WHERE it.item_id = i.id)`)
	}
	if q.Q != "" {
		like := "%" + escapeLike(q.Q) + "%"
		where = append(where, `(i.prompt LIKE ? ESCAPE '\' OR i.negative_prompt LIKE ? ESCAPE '\' OR i.relative_path LIKE ? ESCAPE '\'`+
			` OR i.session_id IN (SELECT s.id FROM sessions s WHERE s.label LIKE ? ESCAPE '\')`+
			` OR i.id IN (SELECT ci.item_id FROM collection_item ci JOIN collections c ON c.id = ci.collection_id WHERE c.name LIKE ? ESCAPE '\'))`)
		args = append(args, like, like, like, like, like)
	}
	if q.Kind != "" {
		where = append(where, "i.kind = ?")
		args = append(args, q.Kind)
	}
	if q.Rating != nil {
		where = append(where, "i.rating = ?")
		args = append(args, *q.Rating)
	}
	if q.Status != "" {
		where = append(where, "i.status = ?")
		args = append(args, q.Status)
	}
	if q.Favorite != nil {
		want := 0
		if *q.Favorite {
			want = 1
		}
		where = append(where, "i.favorite = ?")
		args = append(args, want)
	}

	clause := ""
	if len(where) > 0 {
		clause = " WHERE " + strings.Join(where, " AND ")
	}

	if err := s.db.QueryRow(`SELECT COUNT(*) FROM items i`+clause, args...).Scan(&page.Total); err != nil {
		return page, err
	}

	limit := q.Limit
	if limit <= 0 {
		limit = 200
	}
	if limit > 10000 {
		limit = 10000
	}
	offset := q.Offset
	if offset < 0 {
		offset = 0
	}

	dir := "DESC"
	if q.Dir == "asc" {
		dir = "ASC"
	}
	field := "i.timestamp"
	switch q.Sort {
	case "name":
		field = "i.relative_path"
	case "size":
		field = "i.file_size"
	case "session":
		field = "(SELECT s.starts_at FROM sessions s WHERE s.id = i.session_id)"
	}
	order := " ORDER BY " + field + " " + dir + ", i.id " + dir
	query := `SELECT ` + itemCols + ` FROM items i` + clause + order + ` LIMIT ? OFFSET ?`
	rowArgs := append(append([]any{}, args...), limit, offset)

	rows, err := s.db.Query(query, rowArgs...)
	if err != nil {
		return page, err
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		it, err := scanItem(rows)
		if err != nil {
			return page, err
		}
		page.Items = append(page.Items, *it)
		ids = append(ids, it.ID)
	}
	if err := rows.Err(); err != nil {
		return page, err
	}

	extras, err := s.loadExtras(ids)
	if err != nil {
		return page, err
	}
	for i := range page.Items {
		if extra, ok := extras[page.Items[i].ID]; ok {
			page.Items[i].Extra = extra
		}
	}
	return page, nil
}

// GetItem returns one item by id.
func (s *Store) GetItem(id string) (*model.Item, error) {
	row := s.db.QueryRow(`SELECT `+itemCols+` FROM items i WHERE i.id = ?`, id)
	it, err := scanItem(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	extras, err := s.loadExtras([]string{id})
	if err != nil {
		return nil, err
	}
	if extra, ok := extras[id]; ok {
		it.Extra = extra
	}
	return it, nil
}

// UpdateItem applies a user edit and records the canonical generation fields
// it touched as manual, so re-imports never overwrite them (D41).
func (s *Store) UpdateItem(id string, p ItemPatch) (*model.Item, error) {
	var manual string
	if err := s.db.QueryRow(`SELECT manual_fields FROM items WHERE id = ?`, id).Scan(&manual); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	manualSet := splitManual(manual)

	var sets []string
	var args []any
	add := func(col string, v any) {
		sets = append(sets, col+" = ?")
		args = append(args, v)
	}
	addManual := func(field, col string, v any) {
		add(col, v)
		manualSet[field] = true
	}

	if p.Favorite != nil {
		add("favorite", boolInt(*p.Favorite))
	}
	if p.Rating != nil {
		add("rating", *p.Rating)
	}
	if p.Status != nil {
		add("status", *p.Status)
	}
	if p.Prompt.Set {
		addManual("prompt", "prompt", strArg(p.Prompt.Value))
	}
	if p.NegativePrompt.Set {
		addManual("negative_prompt", "negative_prompt", strArg(p.NegativePrompt.Value))
	}
	if p.ModelName.Set {
		addManual("model_name", "model_name", strArg(p.ModelName.Value))
	}
	if p.Seed.Set {
		addManual("seed", "seed", intArg(p.Seed.Value))
	}
	if p.Steps.Set {
		addManual("steps", "steps", intArg(p.Steps.Value))
	}
	if p.Sampler.Set {
		addManual("sampler", "sampler", strArg(p.Sampler.Value))
	}
	if p.CFGScale.Set {
		addManual("cfg_scale", "cfg_scale", floatArg(p.CFGScale.Value))
	}
	if p.GeneratedAt.Set {
		addManual("generated_at", "generated_at", intArg(p.GeneratedAt.Value))
	}
	if len(sets) == 0 {
		return s.GetItem(id)
	}
	add("manual_fields", joinManual(manualSet))
	args = append(args, id)
	if _, err := s.db.Exec(`UPDATE items SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...); err != nil {
		return nil, err
	}
	return s.GetItem(id)
}

// BatchPatch is the payload of PATCH /api/items/batch.
type BatchPatch struct {
	IDs                    []string
	AddTags                []string
	RemoveTags             []string
	AddToCollectionID      string
	RemoveFromCollectionID string
	Favorite               *bool
	Rating                 *int
	Status                 *string
	SessionSet             bool
	SessionID              *string
	RemoveFromCatalog      bool
}

// Batch applies a multi-item update.
func (s *Store) Batch(p BatchPatch) error {
	if len(p.IDs) == 0 {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if p.RemoveFromCatalog {
		if err := s.removeFromCatalogTx(tx, p.IDs); err != nil {
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		// Keep the session timeline in sync with the surviving items.
		return s.ReclusterSessions()
	}

	for _, name := range p.AddTags {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		tagID, err := ensureTagTx(tx, name)
		if err != nil {
			return err
		}
		for _, id := range p.IDs {
			if _, err := tx.Exec(`INSERT OR IGNORE INTO item_tag (item_id, tag_id) VALUES (?, ?)`, id, tagID); err != nil {
				return err
			}
		}
	}
	for _, name := range p.RemoveTags {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		for _, id := range p.IDs {
			if _, err := tx.Exec(`DELETE FROM item_tag WHERE item_id = ? AND tag_id IN (SELECT id FROM tags WHERE name = ? COLLATE NOCASE)`, id, name); err != nil {
				return err
			}
		}
	}

	var sets []string
	var args []any
	if p.Favorite != nil {
		sets = append(sets, "favorite = ?")
		args = append(args, boolInt(*p.Favorite))
	}
	if p.Rating != nil {
		sets = append(sets, "rating = ?")
		args = append(args, *p.Rating)
	}
	if p.Status != nil {
		sets = append(sets, "status = ?")
		args = append(args, *p.Status)
	}
	if p.SessionSet {
		var session any
		if p.SessionID != nil && *p.SessionID != "" {
			var exists int
			err := tx.QueryRow(`SELECT 1 FROM sessions WHERE id = ?`, *p.SessionID).Scan(&exists)
			if err == nil {
				session = *p.SessionID
			}
		}
		sets = append(sets, "session_id = ?")
		args = append(args, session)
	}
	if len(sets) > 0 {
		placeholders := strings.TrimSuffix(strings.Repeat("?,", len(p.IDs)), ",")
		idArgs := make([]any, len(p.IDs))
		for i, id := range p.IDs {
			idArgs[i] = id
		}
		if _, err := tx.Exec(`UPDATE items SET `+strings.Join(sets, ", ")+` WHERE id IN (`+placeholders+`)`, append(args, idArgs...)...); err != nil {
			return err
		}
	}

	if p.AddToCollectionID != "" {
		if err := addCollectionItemsTx(tx, p.AddToCollectionID, p.IDs); err != nil {
			return err
		}
	}
	if p.RemoveFromCollectionID != "" {
		for _, id := range p.IDs {
			if _, err := tx.Exec(`DELETE FROM collection_item WHERE collection_id = ? AND item_id = ?`, p.RemoveFromCollectionID, id); err != nil {
				return err
			}
			if _, err := tx.Exec(`UPDATE collections SET cover_item_id = NULL WHERE id = ? AND cover_item_id = ?`,
				p.RemoveFromCollectionID, id); err != nil {
				return err
			}
		}
	}
	if p.SessionSet {
		// Reassigning items can strand a session's label image on an item that
		// is no longer part of it.
		if _, err := tx.Exec(`UPDATE sessions SET cover_item_id = NULL
			WHERE cover_item_id IS NOT NULL
				AND cover_item_id NOT IN (SELECT id FROM items WHERE session_id = sessions.id)`); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) removeFromCatalogTx(tx *sql.Tx, ids []string) error {
	now := time.Now().UnixMilli()
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	idArgs := make([]any, len(ids))
	for i, id := range ids {
		idArgs[i] = id
	}
	rows, err := tx.Query(`SELECT content_hash FROM items WHERE id IN (`+placeholders+`)`, idArgs...)
	if err != nil {
		return err
	}
	var hashes []string
	for rows.Next() {
		var h string
		if err := rows.Scan(&h); err != nil {
			rows.Close()
			return err
		}
		hashes = append(hashes, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, h := range hashes {
		if _, err := tx.Exec(`INSERT INTO tombstones (content_hash, removed_at) VALUES (?, ?)
			ON CONFLICT(content_hash) DO UPDATE SET removed_at = excluded.removed_at`, h, now); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`DELETE FROM collection_item WHERE item_id IN (`+placeholders+`)`, idArgs...); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM item_tag WHERE item_id IN (`+placeholders+`)`, idArgs...); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM metadata_kv WHERE item_id IN (`+placeholders+`)`, idArgs...); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM raw_metadata WHERE item_id IN (`+placeholders+`)`, idArgs...); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM notes WHERE owner_type = 'item' AND owner_id IN (`+placeholders+`)`, idArgs...); err != nil {
		return err
	}
	_, err = tx.Exec(`DELETE FROM items WHERE id IN (`+placeholders+`)`, idArgs...)
	return err
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
