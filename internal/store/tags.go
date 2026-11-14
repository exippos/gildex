package store

import (
	"database/sql"
	"errors"
	"strings"

	"gildex/internal/model"
)

// Tags lists all tags with their item counts.
func (s *Store) Tags() ([]model.Tag, error) {
	rows, err := s.db.Query(`
		SELECT t.id, t.name, COUNT(it.item_id)
		FROM tags t
		LEFT JOIN item_tag it ON it.tag_id = t.id
		GROUP BY t.id, t.name
		ORDER BY t.name COLLATE NOCASE ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []model.Tag{}
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.Name, &tag.ItemCount); err != nil {
			return nil, err
		}
		out = append(out, tag)
	}
	return out, rows.Err()
}

// UntaggedCount counts catalog items that carry no tag at all.
func (s *Store) UntaggedCount() (int, error) {
	var n int
	err := s.db.QueryRow(`
		SELECT COUNT(*) FROM items i
		WHERE NOT EXISTS (SELECT 1 FROM item_tag it WHERE it.item_id = i.id)`).Scan(&n)
	return n, err
}

// CreateTag returns the tag with name, creating it if needed.
func (s *Store) CreateTag(name string) (*model.Tag, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("tag name is required")
	}
	id, err := ensureTag(s.db, name)
	if err != nil {
		return nil, err
	}
	return s.GetTag(id)
}

// GetTag returns a tag plus its usage count.
func (s *Store) GetTag(id string) (*model.Tag, error) {
	var tag model.Tag
	err := s.db.QueryRow(`
		SELECT t.id, t.name, (SELECT COUNT(*) FROM item_tag it WHERE it.tag_id = t.id)
		FROM tags t WHERE t.id = ?`, id).
		Scan(&tag.ID, &tag.Name, &tag.ItemCount)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &tag, nil
}

// DeleteTag removes a tag and unassigns it from items.
func (s *Store) DeleteTag(id string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM item_tag WHERE tag_id = ?`, id); err != nil {
		return err
	}
	res, err := tx.Exec(`DELETE FROM tags WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}

// querier is satisfied by both *sql.DB and *sql.Tx.
type querier interface {
	Exec(query string, args ...any) (sql.Result, error)
	QueryRow(query string, args ...any) *sql.Row
}

func ensureTag(q querier, name string) (string, error) {
	if _, err := q.Exec(`INSERT INTO tags (id, name) VALUES (?, ?) ON CONFLICT(name) DO NOTHING`, NewID(), name); err != nil {
		return "", err
	}
	var id string
	if err := q.QueryRow(`SELECT id FROM tags WHERE name = ? COLLATE NOCASE`, name).Scan(&id); err != nil {
		return "", err
	}
	return id, nil
}

func ensureTagTx(tx *sql.Tx, name string) (string, error) {
	return ensureTag(tx, name)
}
