package store

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"gildex/internal/model"
)

const sessionGapMS int64 = 7200000 // 2 hours

// Sessions lists clusters ordered newest first.
func (s *Store) Sessions() ([]model.Session, error) {
	rows, err := s.db.Query(`
		SELECT s.id, s.label, s.starts_at, s.ends_at, s.cover_item_id,
			(SELECT COUNT(*) FROM items i WHERE i.session_id = s.id),
			COALESCE(
				(SELECT i.thumbnail_path FROM items i
					WHERE i.id = s.cover_item_id AND i.session_id = s.id AND i.thumbnail_path <> ''),
				(SELECT i.thumbnail_path FROM items i
					WHERE i.session_id = s.id AND i.thumbnail_path <> ''
					ORDER BY i.timestamp DESC LIMIT 1),
				'')
		FROM sessions s
		ORDER BY s.starts_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []model.Session{}
	for rows.Next() {
		var (
			sess  model.Session
			cover sql.NullString
		)
		if err := rows.Scan(&sess.ID, &sess.Label, &sess.StartsAt, &sess.EndsAt, &cover, &sess.ItemCount, &sess.ThumbnailPath); err != nil {
			return nil, err
		}
		sess.CoverItemID = nullString(cover)
		out = append(out, sess)
	}
	return out, rows.Err()
}

// GetSession returns one session.
func (s *Store) GetSession(id string) (*model.Session, error) {
	var (
		sess  model.Session
		cover sql.NullString
	)
	err := s.db.QueryRow(`
		SELECT s.id, s.label, s.starts_at, s.ends_at, s.cover_item_id,
			(SELECT COUNT(*) FROM items i WHERE i.session_id = s.id),
			COALESCE(
				(SELECT i.thumbnail_path FROM items i
					WHERE i.id = s.cover_item_id AND i.session_id = s.id AND i.thumbnail_path <> ''),
				(SELECT i.thumbnail_path FROM items i
					WHERE i.session_id = s.id AND i.thumbnail_path <> ''
					ORDER BY i.timestamp DESC LIMIT 1),
				'')
		FROM sessions s WHERE s.id = ?`, id).
		Scan(&sess.ID, &sess.Label, &sess.StartsAt, &sess.EndsAt, &cover, &sess.ItemCount, &sess.ThumbnailPath)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	sess.CoverItemID = nullString(cover)
	return &sess, nil
}

// SessionPatch is a partial session update. CoverItemID.Set with a nil Value
// clears the user-picked label image.
type SessionPatch struct {
	Label       *string
	CoverItemID NullableString
}

// UpdateSession updates a session label and/or its label image.
func (s *Store) UpdateSession(id string, p SessionPatch) (*model.Session, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var sets []string
	var args []any
	if p.Label != nil {
		label := strings.TrimSpace(*p.Label)
		if label == "" {
			return nil, invalid("label is required")
		}
		sets = append(sets, "label = ?")
		args = append(args, label)
	}
	if p.CoverItemID.Set {
		if p.CoverItemID.Value == nil {
			sets = append(sets, "cover_item_id = NULL")
		} else {
			var member int
			if err := tx.QueryRow(`SELECT COUNT(*) FROM items WHERE id = ? AND session_id = ?`,
				*p.CoverItemID.Value, id).Scan(&member); err != nil {
				return nil, err
			}
			if member == 0 {
				return nil, invalid("cover item is not in this session")
			}
			sets = append(sets, "cover_item_id = ?")
			args = append(args, *p.CoverItemID.Value)
		}
	}

	if len(sets) == 0 {
		var one int
		if err := tx.QueryRow(`SELECT 1 FROM sessions WHERE id = ?`, id).Scan(&one); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, ErrNotFound
			}
			return nil, err
		}
	} else {
		args = append(args, id)
		res, err := tx.Exec(`UPDATE sessions SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, ErrNotFound
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetSession(id)
}

type oldSession struct {
	id       string
	label    string
	startsAt int64
	endsAt   int64
	cover    sql.NullString
	used     bool
}

// ReclusterSessions rebuilds time-gap sessions from scratch. Labels of
// existing sessions are preserved for the new cluster with the greatest time
// overlap, so a re-import does not reset user renames.
func (s *Store) ReclusterSessions() error {
	type itemTime struct {
		id string
		ts int64
	}
	rows, err := s.db.Query(`SELECT id, timestamp FROM items ORDER BY timestamp ASC, id ASC`)
	if err != nil {
		return err
	}
	var times []itemTime
	for rows.Next() {
		var t itemTime
		if err := rows.Scan(&t.id, &t.ts); err != nil {
			rows.Close()
			return err
		}
		times = append(times, t)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	oldRows, err := s.db.Query(`SELECT id, label, starts_at, ends_at, cover_item_id FROM sessions`)
	if err != nil {
		return err
	}
	var olds []oldSession
	for oldRows.Next() {
		var o oldSession
		if err := oldRows.Scan(&o.id, &o.label, &o.startsAt, &o.endsAt, &o.cover); err != nil {
			oldRows.Close()
			return err
		}
		olds = append(olds, o)
	}
	oldRows.Close()
	if err := oldRows.Err(); err != nil {
		return err
	}

	clusters := [][]itemTime{}
	for _, t := range times {
		if len(clusters) == 0 {
			clusters = append(clusters, []itemTime{t})
			continue
		}
		current := clusters[len(clusters)-1]
		if t.ts-current[len(current)-1].ts > sessionGapMS {
			clusters = append(clusters, []itemTime{t})
		} else {
			clusters[len(clusters)-1] = append(current, t)
		}
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`UPDATE items SET session_id = NULL`); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM sessions`); err != nil {
		return err
	}

	stmt, err := tx.Prepare(`UPDATE items SET session_id = ? WHERE id = ?`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, cluster := range clusters {
		start := cluster[0].ts
		end := cluster[len(cluster)-1].ts

		sessionID := ""
		label := ""
		var cover any
		bestOverlap := int64(0)
		bestIdx := -1
		for i := range olds {
			if olds[i].used {
				continue
			}
			score := overlap(start, end, olds[i].startsAt, olds[i].endsAt)
			if score == 0 {
				// A one-item session has zero duration, so overlap is 0 even
				// when it is the same point in time. Treat containment as a
				// weak match to keep its (possibly renamed) label.
				if (olds[i].startsAt <= start && end <= olds[i].endsAt) ||
					(start <= olds[i].startsAt && olds[i].endsAt <= end) {
					score = 1
				}
			}
			if score > bestOverlap {
				bestOverlap = score
				bestIdx = i
			}
		}
		if bestIdx >= 0 {
			sessionID = olds[bestIdx].id
			label = olds[bestIdx].label
			if olds[bestIdx].cover.Valid {
				cover = olds[bestIdx].cover.String
			}
			olds[bestIdx].used = true
		} else {
			sessionID = NewID()
			label = "Session · " + time.UnixMilli(start).Local().Format("2006-01-02")
		}

		if _, err := tx.Exec(`INSERT INTO sessions (id, label, starts_at, ends_at, cover_item_id) VALUES (?, ?, ?, ?, ?)`,
			sessionID, label, start, end, cover); err != nil {
			return err
		}
		for _, t := range cluster {
			if _, err := stmt.Exec(sessionID, t.id); err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func overlap(aStart, aEnd, bStart, bEnd int64) int64 {
	start := maxInt64(aStart, bStart)
	end := minInt64(aEnd, bEnd)
	if end <= start {
		return 0
	}
	return end - start
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func minInt64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}
