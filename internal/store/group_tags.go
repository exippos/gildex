package store

import (
	"database/sql"
	"strings"

	"gildex/internal/model"
)

// group_tag owner types. Group tags reuse the shared tag vocabulary but are
// assigned to the session/collection itself rather than its items (D45).
const (
	groupOwnerSession    = "session"
	groupOwnerCollection = "collection"
)

// loadGroupTagsByOwner returns assigned tag names keyed by owner id. Used by
// the list queries so one round trip covers every group of a type.
func (s *Store) loadGroupTagsByOwner(ownerType string) (map[string][]string, error) {
	rows, err := s.db.Query(`
		SELECT gt.owner_id, t.name
		FROM group_tag gt
		JOIN tags t ON t.id = gt.tag_id
		WHERE gt.owner_type = ?
		ORDER BY t.name COLLATE NOCASE ASC`, ownerType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string][]string{}
	for rows.Next() {
		var ownerID, name string
		if err := rows.Scan(&ownerID, &name); err != nil {
			return nil, err
		}
		out[ownerID] = append(out[ownerID], name)
	}
	return out, rows.Err()
}

// loadGroupTags returns the tag names assigned to one group.
func (s *Store) loadGroupTags(ownerType, ownerID string) ([]string, error) {
	rows, err := s.db.Query(`
		SELECT t.name
		FROM group_tag gt
		JOIN tags t ON t.id = gt.tag_id
		WHERE gt.owner_type = ? AND gt.owner_id = ?
		ORDER BY t.name COLLATE NOCASE ASC`, ownerType, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

// addGroupTagsTx ensures the vocabulary entries and assigns them to a group.
func addGroupTagsTx(tx *sql.Tx, ownerType, ownerID string, names []string) error {
	for _, raw := range names {
		name := strings.TrimSpace(raw)
		if name == "" {
			continue
		}
		tagID, err := ensureTagTx(tx, name)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT OR IGNORE INTO group_tag (owner_type, owner_id, tag_id)
			VALUES (?, ?, ?)`, ownerType, ownerID, tagID); err != nil {
			return err
		}
	}
	return nil
}

// removeGroupTagsTx unassigns tag names from a group, keeping the vocabulary.
func removeGroupTagsTx(tx *sql.Tx, ownerType, ownerID string, names []string) error {
	for _, raw := range names {
		name := strings.TrimSpace(raw)
		if name == "" {
			continue
		}
		if _, err := tx.Exec(`DELETE FROM group_tag
			WHERE owner_type = ? AND owner_id = ?
				AND tag_id IN (SELECT id FROM tags WHERE name = ? COLLATE NOCASE)`,
			ownerType, ownerID, name); err != nil {
			return err
		}
	}
	return nil
}

// validGroupStatus mirrors the item status vocabulary for group triage.
func validGroupStatus(status string) bool {
	switch model.Status(status) {
	case model.StatusIdea, model.StatusDraft, model.StatusWIP, model.StatusFinal:
		return true
	}
	return false
}
