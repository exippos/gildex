package store

import (
	"database/sql"
	"errors"
	"time"

	"gildex/internal/model"
)

// Notes lists notes for one owner.
func (s *Store) Notes(ownerType, ownerID string) ([]model.Note, error) {
	rows, err := s.db.Query(`SELECT id, owner_type, owner_id, body, type_label, created_at, updated_at
		FROM notes WHERE owner_type = ? AND owner_id = ?
		ORDER BY created_at ASC`, ownerType, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []model.Note{}
	for rows.Next() {
		var n model.Note
		var ot string
		if err := rows.Scan(&n.ID, &ot, &n.OwnerID, &n.Body, &n.TypeLabel, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, err
		}
		n.OwnerType = model.OwnerType(ot)
		out = append(out, n)
	}
	return out, rows.Err()
}

// GetNote returns one note.
func (s *Store) GetNote(id string) (*model.Note, error) {
	var n model.Note
	var ot string
	err := s.db.QueryRow(`SELECT id, owner_type, owner_id, body, type_label, created_at, updated_at
		FROM notes WHERE id = ?`, id).
		Scan(&n.ID, &ot, &n.OwnerID, &n.Body, &n.TypeLabel, &n.CreatedAt, &n.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	n.OwnerType = model.OwnerType(ot)
	return &n, nil
}

// CreateNote inserts a note.
func (s *Store) CreateNote(ownerType model.OwnerType, ownerID, body, typeLabel string) (*model.Note, error) {
	now := time.Now().UnixMilli()
	n := &model.Note{
		ID:        NewID(),
		OwnerType: ownerType,
		OwnerID:   ownerID,
		Body:      body,
		TypeLabel: typeLabel,
		CreatedAt: now,
		UpdatedAt: now,
	}
	_, err := s.db.Exec(`INSERT INTO notes (id, owner_type, owner_id, body, type_label, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		n.ID, string(n.OwnerType), n.OwnerID, n.Body, n.TypeLabel, n.CreatedAt, n.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return n, nil
}

// UpdateNoteBody replaces a note's markdown body.
func (s *Store) UpdateNoteBody(id, body string) (*model.Note, error) {
	res, err := s.db.Exec(`UPDATE notes SET body = ?, updated_at = ? WHERE id = ?`, body, time.Now().UnixMilli(), id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return s.GetNote(id)
}

// DeleteNote removes a note.
func (s *Store) DeleteNote(id string) error {
	res, err := s.db.Exec(`DELETE FROM notes WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
