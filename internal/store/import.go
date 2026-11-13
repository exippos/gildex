package store

import (
	"database/sql"
	"errors"
	"sort"
	"strings"

	"gildex/internal/model"
)

// ImportItem is the fully analyzed representation of one imported file.
type ImportItem struct {
	ContentHash    string
	RelativePath   string
	Kind           model.Kind
	Format         string
	FileSize       int64
	Timestamp      int64
	Width          int
	Height         int
	Duration       *float64
	Prompt         *string
	NegativePrompt *string
	ModelName      *string
	Seed           *int64
	Steps          *int64
	Sampler        *string
	CFGScale       *float64
	GeneratedAt    *int64
	ThumbnailPath  string
	PHash          int64
	Extra          map[string]string
	RawMetadata    []byte
}

// Existing describes an already-cataloged content hash.
type Existing struct {
	ID           string
	RelativePath string
	ManualFields map[string]bool
}

// FindByHash looks up an item by content hash.
func (s *Store) FindByHash(hash string) (*Existing, error) {
	var e Existing
	var manual string
	err := s.db.QueryRow(`SELECT id, relative_path, manual_fields FROM items WHERE content_hash = ?`, hash).
		Scan(&e.ID, &e.RelativePath, &manual)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	e.ManualFields = splitManual(manual)
	return &e, nil
}

// UpdateItemPath records a moved file and marks the item present again.
func (s *Store) UpdateItemPath(id, relativePath string) error {
	_, err := s.db.Exec(`UPDATE items SET relative_path = ?, state = 'present' WHERE id = ?`, relativePath, id)
	return err
}

// TombstoneExists reports whether a content hash was removed from the catalog.
func (s *Store) TombstoneExists(hash string) (bool, error) {
	var one int
	err := s.db.QueryRow(`SELECT 1 FROM tombstones WHERE content_hash = ?`, hash).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// UpsertImport inserts a new item or refreshes an existing one. Fields listed
// in manual_fields are preserved on update (D41).
func (s *Store) UpsertImport(it ImportItem) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var id, manual string
	err = tx.QueryRow(`SELECT id, manual_fields FROM items WHERE content_hash = ?`, it.ContentHash).Scan(&id, &manual)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		id = NewID()
		_, err = tx.Exec(`INSERT INTO items (
			id, content_hash, relative_path, kind, format, file_size, timestamp, width, height,
			duration, favorite, rating, status, state, session_id, prompt, negative_prompt,
			model_name, seed, steps, sampler, cfg_scale, generated_at, thumbnail_path, phash, manual_fields
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'draft', 'present', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
			id, it.ContentHash, it.RelativePath, string(it.Kind), it.Format, it.FileSize,
			it.Timestamp, it.Width, it.Height, floatArg(it.Duration),
			strArg(it.Prompt), strArg(it.NegativePrompt), strArg(it.ModelName),
			intArg(it.Seed), intArg(it.Steps), strArg(it.Sampler), floatArg(it.CFGScale),
			intArg(it.GeneratedAt), it.ThumbnailPath, it.PHash,
		)
		if err != nil {
			return err
		}
	case err != nil:
		return err
	default:
		manualSet := splitManual(manual)
		sets := []string{
			"relative_path = ?", "kind = ?", "format = ?", "file_size = ?",
			"timestamp = ?", "width = ?", "height = ?", "duration = ?",
			"thumbnail_path = ?", "phash = ?", "state = 'present'",
		}
		args := []any{
			it.RelativePath, string(it.Kind), it.Format, it.FileSize,
			it.Timestamp, it.Width, it.Height, floatArg(it.Duration),
			it.ThumbnailPath, it.PHash,
		}
		addOpt := func(field, col string, value any) {
			if manualSet[field] {
				return
			}
			sets = append(sets, col+" = ?")
			args = append(args, value)
		}
		addOpt("prompt", "prompt", strArg(it.Prompt))
		addOpt("negative_prompt", "negative_prompt", strArg(it.NegativePrompt))
		addOpt("model_name", "model_name", strArg(it.ModelName))
		addOpt("seed", "seed", intArg(it.Seed))
		addOpt("steps", "steps", intArg(it.Steps))
		addOpt("sampler", "sampler", strArg(it.Sampler))
		addOpt("cfg_scale", "cfg_scale", floatArg(it.CFGScale))
		addOpt("generated_at", "generated_at", intArg(it.GeneratedAt))

		args = append(args, id)
		if _, err := tx.Exec(`UPDATE items SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(`DELETE FROM metadata_kv WHERE item_id = ?`, id); err != nil {
		return err
	}
	keys := make([]string, 0, len(it.Extra))
	for k := range it.Extra {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if _, err := tx.Exec(`INSERT INTO metadata_kv (item_id, key, value) VALUES (?, ?, ?)`, id, k, it.Extra[k]); err != nil {
			return err
		}
	}

	if len(it.RawMetadata) > 0 {
		if _, err := tx.Exec(`INSERT INTO raw_metadata (item_id, blob) VALUES (?, ?)
			ON CONFLICT(item_id) DO UPDATE SET blob = excluded.blob`, id, it.RawMetadata); err != nil {
			return err
		}
	} else {
		if _, err := tx.Exec(`DELETE FROM raw_metadata WHERE item_id = ?`, id); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// Counts holds the four catalog totals for the status endpoint.
type Counts struct {
	Items       int
	Sessions    int
	Tags        int
	Collections int
}

// Counts returns the catalog totals.
func (s *Store) Counts() (Counts, error) {
	var c Counts
	err := s.db.QueryRow(`SELECT
		(SELECT COUNT(*) FROM items),
		(SELECT COUNT(*) FROM sessions),
		(SELECT COUNT(*) FROM tags),
		(SELECT COUNT(*) FROM collections)`).
		Scan(&c.Items, &c.Sessions, &c.Tags, &c.Collections)
	return c, err
}
