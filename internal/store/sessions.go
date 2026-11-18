package store

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"gildex/internal/model"
)

// Sessions lists clusters ordered newest first.
func (s *Store) Sessions() ([]model.Session, error) {
	rows, err := s.db.Query(`
		SELECT s.id, s.label, s.starts_at, s.ends_at, s.cover_item_id,
			s.favorite, s.rating, s.status,
			(SELECT COUNT(*) FROM items i WHERE i.session_id = s.id),
			(SELECT COUNT(*) FROM items i WHERE i.session_id = s.id AND i.kind = 'video'),
			(SELECT COUNT(*) FROM items i WHERE i.session_id = s.id AND i.kind = 'audio'),
			COALESCE(
				(SELECT i.thumbnail_path FROM items i
					WHERE i.id = s.cover_item_id AND i.session_id = s.id AND i.thumbnail_path <> ''),
				(SELECT i.thumbnail_path FROM items i
					WHERE i.session_id = s.id AND i.thumbnail_path <> ''
					ORDER BY i.timestamp DESC LIMIT 1),
				''),
			COALESCE(
				(SELECT i.id FROM items i
					WHERE i.id = s.cover_item_id AND i.session_id = s.id AND i.thumbnail_path <> ''),
				(SELECT i.id FROM items i
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
	var thumbIDs []string
	var thumbIdx []int
	for rows.Next() {
		var (
			sess     model.Session
			cover    sql.NullString
			thumbID  sql.NullString
			favorite int
			status   string
		)
		if err := rows.Scan(&sess.ID, &sess.Label, &sess.StartsAt, &sess.EndsAt, &cover,
			&favorite, &sess.Rating, &status,
			&sess.ItemCount, &sess.VideoCount, &sess.AudioCount, &sess.ThumbnailPath,
			&thumbID); err != nil {
			return nil, err
		}
		sess.CoverItemID = nullString(cover)
		sess.Favorite = favorite != 0
		sess.Status = model.Status(status)
		sess.Tags = []string{}
		out = append(out, sess)
		if thumbID.Valid && thumbID.String != "" {
			thumbIDs = append(thumbIDs, thumbID.String)
			thumbIdx = append(thumbIdx, len(out)-1)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Close before the tag query: the store runs on a single connection.
	rows.Close()

	tags, err := s.loadGroupTagsByOwner(groupOwnerSession)
	if err != nil {
		return nil, err
	}
	nsfwTag := s.groupNsfwTag()
	for i := range out {
		if names, ok := tags[out[i].ID]; ok {
			out[i].Tags = names
		}
		// The session's own tags mark it NSFW, as does its cover item.
		if hasTagFold(out[i].Tags, nsfwTag) {
			out[i].Nsfw = true
		}
	}

	nsfwSet, err := s.nsfwThumbSet(thumbIDs, nsfwTag)
	if err != nil {
		return nil, err
	}
	for i, idx := range thumbIdx {
		if nsfwSet[thumbIDs[i]] {
			out[idx].Nsfw = true
		}
	}
	return out, nil
}

// GetSession returns one session.
func (s *Store) GetSession(id string) (*model.Session, error) {
	var (
		sess     model.Session
		cover    sql.NullString
		thumbID  sql.NullString
		favorite int
		status   string
	)
	err := s.db.QueryRow(`
		SELECT s.id, s.label, s.starts_at, s.ends_at, s.cover_item_id,
			s.favorite, s.rating, s.status,
			(SELECT COUNT(*) FROM items i WHERE i.session_id = s.id),
			(SELECT COUNT(*) FROM items i WHERE i.session_id = s.id AND i.kind = 'video'),
			(SELECT COUNT(*) FROM items i WHERE i.session_id = s.id AND i.kind = 'audio'),
			COALESCE(
				(SELECT i.thumbnail_path FROM items i
					WHERE i.id = s.cover_item_id AND i.session_id = s.id AND i.thumbnail_path <> ''),
				(SELECT i.thumbnail_path FROM items i
					WHERE i.session_id = s.id AND i.thumbnail_path <> ''
					ORDER BY i.timestamp DESC LIMIT 1),
				''),
			COALESCE(
				(SELECT i.id FROM items i
					WHERE i.id = s.cover_item_id AND i.session_id = s.id AND i.thumbnail_path <> ''),
				(SELECT i.id FROM items i
					WHERE i.session_id = s.id AND i.thumbnail_path <> ''
					ORDER BY i.timestamp DESC LIMIT 1),
				'')
		FROM sessions s WHERE s.id = ?`, id).
		Scan(&sess.ID, &sess.Label, &sess.StartsAt, &sess.EndsAt, &cover,
			&favorite, &sess.Rating, &status,
			&sess.ItemCount, &sess.VideoCount, &sess.AudioCount, &sess.ThumbnailPath,
			&thumbID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	sess.CoverItemID = nullString(cover)
	sess.Favorite = favorite != 0
	sess.Status = model.Status(status)
	tags, err := s.loadGroupTags(groupOwnerSession, id)
	if err != nil {
		return nil, err
	}
	sess.Tags = tags
	thumbIDStr := ""
	if thumbID.Valid {
		thumbIDStr = thumbID.String
	}
	nsfwTag := s.groupNsfwTag()
	nsfwSet, err := s.nsfwThumbSet([]string{thumbIDStr}, nsfwTag)
	if err != nil {
		return nil, err
	}
	// The session's own tags mark it NSFW, as does its cover item.
	sess.Nsfw = hasTagFold(sess.Tags, nsfwTag) || nsfwSet[thumbIDStr]
	return &sess, nil
}

// SessionPatch is a partial session update. CoverItemID.Set with a nil Value
// clears the user-picked label image. AddTags/RemoveTags edit group tags.
type SessionPatch struct {
	Label       *string
	CoverItemID NullableString
	Favorite    *bool
	Rating      *int
	Status      *string
	AddTags     []string
	RemoveTags  []string
}

// UpdateSession updates a session's label, label image, triage and group tags.
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
	if p.Favorite != nil {
		sets = append(sets, "favorite = ?")
		args = append(args, boolInt(*p.Favorite))
	}
	if p.Rating != nil {
		if *p.Rating < 0 || *p.Rating > 5 {
			return nil, invalid("rating must be 0..5")
		}
		sets = append(sets, "rating = ?")
		args = append(args, *p.Rating)
	}
	if p.Status != nil {
		if !validGroupStatus(*p.Status) {
			return nil, invalid("invalid status")
		}
		sets = append(sets, "status = ?")
		args = append(args, *p.Status)
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
	if err := addGroupTagsTx(tx, groupOwnerSession, id, p.AddTags); err != nil {
		return nil, err
	}
	if err := removeGroupTagsTx(tx, groupOwnerSession, id, p.RemoveTags); err != nil {
		return nil, err
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
	favorite int
	rating   int
	status   string
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

	oldRows, err := s.db.Query(`SELECT id, label, starts_at, ends_at, cover_item_id, favorite, rating, status FROM sessions`)
	if err != nil {
		return err
	}
	var olds []oldSession
	for oldRows.Next() {
		var o oldSession
		if err := oldRows.Scan(&o.id, &o.label, &o.startsAt, &o.endsAt, &o.cover, &o.favorite, &o.rating, &o.status); err != nil {
			oldRows.Close()
			return err
		}
		olds = append(olds, o)
	}
	oldRows.Close()
	if err := oldRows.Err(); err != nil {
		return err
	}

	gapMS := s.SessionGapMS()
	clusters := [][]itemTime{}
	for _, t := range times {
		if len(clusters) == 0 {
			clusters = append(clusters, []itemTime{t})
			continue
		}
		current := clusters[len(clusters)-1]
		if t.ts-current[len(current)-1].ts > gapMS {
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
		favorite := 0
		rating := 0
		status := string(model.StatusDraft)
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
			favorite = olds[bestIdx].favorite
			rating = olds[bestIdx].rating
			status = olds[bestIdx].status
			olds[bestIdx].used = true
		} else {
			sessionID = NewID()
			label = "Session · " + time.UnixMilli(start).Local().Format("2006-01-02")
		}

		if _, err := tx.Exec(`INSERT INTO sessions (id, label, starts_at, ends_at, cover_item_id, favorite, rating, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			sessionID, label, start, end, cover, favorite, rating, status); err != nil {
			return err
		}
		for _, t := range cluster {
			if _, err := stmt.Exec(sessionID, t.id); err != nil {
				return err
			}
		}
	}

	// Sessions that vanished in the recluster leave their group tags behind;
	// reused ids keep theirs.
	if _, err := tx.Exec(`DELETE FROM group_tag
		WHERE owner_type = ? AND owner_id NOT IN (SELECT id FROM sessions)`,
		groupOwnerSession); err != nil {
		return err
	}

	// Same for nested episodes: drop the ones whose session vanished, then
	// prune members that moved out of a reused session and any episode left
	// empty.
	if _, err := tx.Exec(`DELETE FROM episodes
		WHERE owner_type = ? AND owner_id NOT IN (SELECT id FROM sessions)`,
		groupOwnerSession); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM episode_item
		WHERE episode_id IN (SELECT id FROM episodes WHERE owner_type = ?)
			AND NOT EXISTS (
				SELECT 1 FROM episodes e
				JOIN items i ON i.session_id = e.owner_id
				WHERE e.id = episode_item.episode_id AND i.id = episode_item.item_id)`,
		groupOwnerSession); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM episodes
		WHERE owner_type = ? AND id NOT IN (SELECT DISTINCT episode_id FROM episode_item)`,
		groupOwnerSession); err != nil {
		return err
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
