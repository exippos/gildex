package store

import (
	"database/sql"
	"errors"
	"strings"

	"gildex/internal/model"
)

// Collections lists collections with counts and cover thumbnails.
func (s *Store) Collections() ([]model.Collection, error) {
	rows, err := s.db.Query(`
		SELECT c.id, c.name, c.description,
			(SELECT COUNT(*) FROM collection_item ci WHERE ci.collection_id = c.id),
			COALESCE((SELECT i.thumbnail_path
				FROM collection_item ci JOIN items i ON i.id = ci.item_id
				WHERE ci.collection_id = c.id AND i.thumbnail_path <> ''
				ORDER BY ci.position ASC LIMIT 1), '')
		FROM collections c
		ORDER BY c.name COLLATE NOCASE ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []model.Collection{}
	for rows.Next() {
		var c model.Collection
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.ItemCount, &c.ThumbnailPath); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetCollection returns one collection.
func (s *Store) GetCollection(id string) (*model.Collection, error) {
	var c model.Collection
	err := s.db.QueryRow(`
		SELECT c.id, c.name, c.description,
			(SELECT COUNT(*) FROM collection_item ci WHERE ci.collection_id = c.id),
			COALESCE((SELECT i.thumbnail_path
				FROM collection_item ci JOIN items i ON i.id = ci.item_id
				WHERE ci.collection_id = c.id AND i.thumbnail_path <> ''
				ORDER BY ci.position ASC LIMIT 1), '')
		FROM collections c WHERE c.id = ?`, id).
		Scan(&c.ID, &c.Name, &c.Description, &c.ItemCount, &c.ThumbnailPath)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// CreateCollection adds an empty collection.
func (s *Store) CreateCollection(name, description string) (*model.Collection, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("collection name is required")
	}
	id := NewID()
	if _, err := s.db.Exec(`INSERT INTO collections (id, name, description) VALUES (?, ?, ?)`,
		id, name, strings.TrimSpace(description)); err != nil {
		return nil, err
	}
	return s.GetCollection(id)
}

// CollectionPatch is a partial collection update. Order, when non-nil,
// rewrites the full ordered membership (D21).
type CollectionPatch struct {
	Name        *string
	Description *string
	Order       *[]string
}

// UpdateCollection updates name/description and/or the full item order.
func (s *Store) UpdateCollection(id string, p CollectionPatch) (*model.Collection, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var sets []string
	var args []any
	if p.Name != nil {
		name := strings.TrimSpace(*p.Name)
		if name == "" {
			return nil, errors.New("collection name is required")
		}
		sets = append(sets, "name = ?")
		args = append(args, name)
	}
	if p.Description != nil {
		sets = append(sets, "description = ?")
		args = append(args, strings.TrimSpace(*p.Description))
	}
	if len(sets) > 0 {
		args = append(args, id)
		res, err := tx.Exec(`UPDATE collections SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, ErrNotFound
		}
	} else {
		var one int
		if err := tx.QueryRow(`SELECT 1 FROM collections WHERE id = ?`, id).Scan(&one); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, ErrNotFound
			}
			return nil, err
		}
	}

	if p.Order != nil {
		if _, err := tx.Exec(`DELETE FROM collection_item WHERE collection_id = ?`, id); err != nil {
			return nil, err
		}
		for i, itemID := range *p.Order {
			if itemID == "" {
				continue
			}
			if _, err := tx.Exec(`INSERT OR IGNORE INTO collection_item (collection_id, item_id, position) VALUES (?, ?, ?)`,
				id, itemID, i); err != nil {
				return nil, err
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetCollection(id)
}

// DeleteCollection removes a collection (never its items).
func (s *Store) DeleteCollection(id string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM collection_item WHERE collection_id = ?`, id); err != nil {
		return err
	}
	res, err := tx.Exec(`DELETE FROM collections WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}

// AddCollectionItems appends items at the end of the collection.
func (s *Store) AddCollectionItems(collectionID string, itemIDs []string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := addCollectionItemsTx(tx, collectionID, itemIDs); err != nil {
		return err
	}
	return tx.Commit()
}

func addCollectionItemsTx(tx *sql.Tx, collectionID string, itemIDs []string) error {
	var one int
	if err := tx.QueryRow(`SELECT 1 FROM collections WHERE id = ?`, collectionID).Scan(&one); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	var maxPos int
	if err := tx.QueryRow(`SELECT COALESCE(MAX(position), -1) FROM collection_item WHERE collection_id = ?`, collectionID).Scan(&maxPos); err != nil {
		return err
	}
	for _, itemID := range itemIDs {
		var exists int
		if err := tx.QueryRow(`SELECT 1 FROM items WHERE id = ?`, itemID).Scan(&exists); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return err
		}
		res, err := tx.Exec(`INSERT OR IGNORE INTO collection_item (collection_id, item_id, position) VALUES (?, ?, ?)`,
			collectionID, itemID, maxPos+1)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			maxPos++
		}
	}
	return nil
}

// RemoveCollectionItem removes one item from a collection.
func (s *Store) RemoveCollectionItem(collectionID, itemID string) error {
	if _, err := s.db.Exec(`DELETE FROM collection_item WHERE collection_id = ? AND item_id = ?`, collectionID, itemID); err != nil {
		return err
	}
	return nil
}
