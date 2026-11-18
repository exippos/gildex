package store

import (
	"database/sql"
	"errors"
	"fmt"
	"math/bits"
	"sort"
	"strings"
	"time"

	"gildex/internal/model"
)

// episodeCols selects one episode row plus its member count and a cover
// thumbnail (the first member that has one).
const episodeCols = `e.id, e.owner_type, e.owner_id, e.label, e.auto,
	(SELECT COUNT(*) FROM episode_item ei WHERE ei.episode_id = e.id),
	COALESCE(
		(SELECT i.thumbnail_path
			FROM episode_item ei JOIN items i ON i.id = ei.item_id
			WHERE ei.episode_id = e.id AND i.thumbnail_path <> ''
			ORDER BY ei.position ASC LIMIT 1),
		'')`

// Episodes lists the episodes of one session or collection in display order,
// each with its ordered member ids.
func (s *Store) Episodes(ownerType, ownerID string) ([]model.Episode, error) {
	if !validEpisodeOwner(ownerType) {
		return nil, invalid("owner type must be session or collection")
	}
	if ownerID == "" {
		return nil, invalid("owner id is required")
	}

	rows, err := s.db.Query(`SELECT `+episodeCols+`
		FROM episodes e
		WHERE e.owner_type = ? AND e.owner_id = ?
		ORDER BY e.position ASC, e.created_at ASC`, ownerType, ownerID)
	if err != nil {
		return nil, err
	}
	out := []model.Episode{}
	for rows.Next() {
		var (
			e    model.Episode
			ot   string
			auto int
		)
		if err := rows.Scan(&e.ID, &ot, &e.OwnerID, &e.Label, &auto, &e.ItemCount, &e.ThumbnailPath); err != nil {
			rows.Close()
			return nil, err
		}
		e.OwnerType = model.OwnerType(ot)
		e.Auto = auto != 0
		e.ItemIDs = []string{}
		out = append(out, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return out, nil
	}

	byID := make(map[string]int, len(out))
	ids := make([]string, len(out))
	for i := range out {
		byID[out[i].ID] = i
		ids[i] = out[i].ID
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	mrows, err := s.db.Query(`
		SELECT episode_id, item_id FROM episode_item
		WHERE episode_id IN (`+placeholders+`)
		ORDER BY episode_id ASC, position ASC`, args...)
	if err != nil {
		return nil, err
	}
	defer mrows.Close()
	for mrows.Next() {
		var episodeID, itemID string
		if err := mrows.Scan(&episodeID, &itemID); err != nil {
			return nil, err
		}
		if i, ok := byID[episodeID]; ok {
			out[i].ItemIDs = append(out[i].ItemIDs, itemID)
		}
	}
	return out, mrows.Err()
}

// GetEpisode returns one episode with its ordered member ids.
func (s *Store) GetEpisode(id string) (*model.Episode, error) {
	var (
		e    model.Episode
		ot   string
		auto int
	)
	err := s.db.QueryRow(`SELECT `+episodeCols+` FROM episodes e WHERE e.id = ?`, id).
		Scan(&e.ID, &ot, &e.OwnerID, &e.Label, &auto, &e.ItemCount, &e.ThumbnailPath)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	e.OwnerType = model.OwnerType(ot)
	e.Auto = auto != 0
	e.ItemIDs = []string{}

	rows, err := s.db.Query(`SELECT item_id FROM episode_item WHERE episode_id = ? ORDER BY position ASC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var itemID string
		if err := rows.Scan(&itemID); err != nil {
			return nil, err
		}
		e.ItemIDs = append(e.ItemIDs, itemID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &e, nil
}

// CreateEpisode inserts a user-authored episode and assigns itemIDs to it.
func (s *Store) CreateEpisode(ownerType, ownerID, label string, itemIDs []string) (*model.Episode, error) {
	if !validEpisodeOwner(ownerType) {
		return nil, invalid("owner type must be session or collection")
	}
	label = strings.TrimSpace(label)
	if label == "" {
		return nil, invalid("label is required")
	}
	ok, err := s.ownerExists(ownerType, ownerID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrNotFound
	}
	if err := s.ensureItemsInOwner(ownerType, ownerID, itemIDs); err != nil {
		return nil, err
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	id := NewID()
	position, err := nextEpisodePosition(tx, ownerType, ownerID)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`INSERT INTO episodes (id, owner_type, owner_id, label, position, auto, created_at)
		VALUES (?, ?, ?, ?, ?, 0, ?)`,
		id, ownerType, ownerID, label, position, time.Now().UnixMilli()); err != nil {
		return nil, err
	}
	if err := assignEpisodeItemsTx(tx, id, ownerType, ownerID, itemIDs); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetEpisode(id)
}

// UpdateEpisode renames an episode. A rename is a manual touch, so the episode
// stops being auto-managed.
func (s *Store) UpdateEpisode(id, label string) (*model.Episode, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		return nil, invalid("label is required")
	}
	res, err := s.db.Exec(`UPDATE episodes SET label = ?, auto = 0 WHERE id = ?`, label, id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return s.GetEpisode(id)
}

// DeleteEpisode removes an episode and its membership rows. Items are never
// deleted.
func (s *Store) DeleteEpisode(id string) error {
	res, err := s.db.Exec(`DELETE FROM episodes WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ClearAutoEpisodes deletes every automatic episode in the catalog, keeping
// user-authored episodes and all items. It returns how many were removed.
func (s *Store) ClearAutoEpisodes() (int, error) {
	res, err := s.db.Exec(`DELETE FROM episodes WHERE auto = 1`)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// AssignEpisodeItems adds items to an episode, moving them out of any other
// episode of the same owner. Assignment is a manual touch.
func (s *Store) AssignEpisodeItems(id string, itemIDs []string) (*model.Episode, error) {
	if len(itemIDs) == 0 {
		return nil, invalid("itemIds is required")
	}
	e, err := s.GetEpisode(id)
	if err != nil {
		return nil, err
	}
	if err := s.ensureItemsInOwner(string(e.OwnerType), e.OwnerID, itemIDs); err != nil {
		return nil, err
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if err := assignEpisodeItemsTx(tx, id, string(e.OwnerType), e.OwnerID, itemIDs); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`UPDATE episodes SET auto = 0 WHERE id = ?`, id); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetEpisode(id)
}

// RemoveEpisodeItem detaches one item from an episode. Removal is a manual
// touch, so the episode stops being auto-managed.
func (s *Store) RemoveEpisodeItem(episodeID, itemID string) (*model.Episode, error) {
	res, err := s.db.Exec(`DELETE FROM episode_item WHERE episode_id = ? AND item_id = ?`, episodeID, itemID)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	if _, err := s.db.Exec(`UPDATE episodes SET auto = 0 WHERE id = ?`, episodeID); err != nil {
		return nil, err
	}
	return s.GetEpisode(episodeID)
}

// AutoClusterEpisodes rebuilds the auto episodes of one session or collection
// from near-duplicate pHashes. Items already in manual episodes are left alone,
// and singletons stay unassigned. It returns the number of episodes created.
func (s *Store) AutoClusterEpisodes(ownerType, ownerID string) (int, error) {
	if !validEpisodeOwner(ownerType) {
		return 0, invalid("owner type must be session or collection")
	}
	ok, err := s.ownerExists(ownerType, ownerID)
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, ErrNotFound
	}
	return s.autoCluster(ownerType, ownerID, s.phashThreshold())
}

// AutoClusterSessions rebuilds auto episodes for every session. Used by the
// import pipeline when the opt-in auto-cluster setting is on.
func (s *Store) AutoClusterSessions() (int, error) {
	threshold := s.phashThreshold()
	rows, err := s.db.Query(`SELECT id FROM sessions`)
	if err != nil {
		return 0, err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	total := 0
	for _, id := range ids {
		n, err := s.autoCluster(groupOwnerSession, id, threshold)
		if err != nil {
			return total, err
		}
		total += n
	}
	return total, nil
}

// autoClusterCandidate is one item considered for automatic grouping.
type autoClusterCandidate struct {
	id    string
	phash int64
}

// autoCluster implements the union-find pass for a single owner. The database
// work happens in one transaction after all reads, since the store serializes
// on a single connection.
func (s *Store) autoCluster(ownerType, ownerID string, threshold int) (int, error) {
	// Items a user has grouped by hand must never be rebuilt.
	rows, err := s.db.Query(`
		SELECT ei.item_id FROM episode_item ei
		JOIN episodes e ON e.id = ei.episode_id
		WHERE e.owner_type = ? AND e.owner_id = ? AND e.auto = 0`, ownerType, ownerID)
	if err != nil {
		return 0, err
	}
	manual := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		manual[id] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	var candidates []autoClusterCandidate
	var q string
	if ownerType == groupOwnerSession {
		q = fmt.Sprintf(`SELECT id, phash FROM items
			WHERE session_id = ? AND phash <> 0
			ORDER BY timestamp ASC, id ASC LIMIT %d`, autoClusterLimit)
	} else {
		q = fmt.Sprintf(`SELECT i.id, i.phash FROM items i
			JOIN collection_item ci ON ci.item_id = i.id
			WHERE ci.collection_id = ? AND i.phash <> 0
			ORDER BY ci.position ASC, i.id ASC LIMIT %d`, autoClusterLimit)
	}
	rows, err = s.db.Query(q, ownerID)
	if err != nil {
		return 0, err
	}
	for rows.Next() {
		var c autoClusterCandidate
		if err := rows.Scan(&c.id, &c.phash); err != nil {
			rows.Close()
			return 0, err
		}
		if manual[c.id] {
			continue
		}
		candidates = append(candidates, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	groups := clusterByPHash(candidates, threshold)

	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	// A rebuild only replaces auto episodes; manual ones keep their rows.
	if _, err := tx.Exec(`DELETE FROM episodes WHERE owner_type = ? AND owner_id = ? AND auto = 1`,
		ownerType, ownerID); err != nil {
		return 0, err
	}

	position, err := nextEpisodePosition(tx, ownerType, ownerID)
	if err != nil {
		return 0, err
	}
	var nextNumber int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM episodes WHERE owner_type = ? AND owner_id = ?`,
		ownerType, ownerID).Scan(&nextNumber); err != nil {
		return 0, err
	}
	nextNumber++

	created := 0
	now := time.Now().UnixMilli()
	for _, group := range groups {
		id := NewID()
		label := fmt.Sprintf("Episode %d", nextNumber)
		nextNumber++
		if _, err := tx.Exec(`INSERT INTO episodes (id, owner_type, owner_id, label, position, auto, created_at)
			VALUES (?, ?, ?, ?, ?, 1, ?)`,
			id, ownerType, ownerID, label, position, now); err != nil {
			return 0, err
		}
		position++
		for i, idx := range group {
			if _, err := tx.Exec(`INSERT OR IGNORE INTO episode_item (episode_id, item_id, position)
				VALUES (?, ?, ?)`, id, candidates[idx].id, i); err != nil {
				return 0, err
			}
		}
		created++
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return created, nil
}

// autoClusterLimit caps the O(n²) pair scan after a large import.
const autoClusterLimit = 5000

// clusterByPHash groups candidates whose Hamming distance is within threshold.
// Only components of two or more items are returned; the groups keep their
// earliest member first so episode order follows library order.
func clusterByPHash(candidates []autoClusterCandidate, threshold int) [][]int {
	n := len(candidates)
	if n < 2 {
		return nil
	}
	parent := make([]int, n)
	for i := range parent {
		parent[i] = i
	}
	var find func(int) int
	find = func(x int) int {
		for parent[x] != x {
			parent[x] = parent[parent[x]]
			x = parent[x]
		}
		return x
	}
	union := func(a, b int) {
		ra, rb := find(a), find(b)
		if ra != rb {
			parent[rb] = ra
		}
	}

	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			if bits.OnesCount64(uint64(candidates[i].phash^candidates[j].phash)) <= threshold {
				union(i, j)
			}
		}
	}

	byRoot := map[int][]int{}
	for i := 0; i < n; i++ {
		root := find(i)
		byRoot[root] = append(byRoot[root], i)
	}
	groups := make([][]int, 0, len(byRoot))
	for _, members := range byRoot {
		if len(members) < 2 {
			continue
		}
		groups = append(groups, members)
	}
	// byRoot iteration is unordered; sort groups by their first member so the
	// generated episode positions follow the owner's item order.
	sort.Slice(groups, func(i, j int) bool { return groups[i][0] < groups[j][0] })
	return groups
}

// assignEpisodeItemsTx moves itemIDs into episodeID, removing them from any
// other episode of the same owner and appending them in the given order.
func assignEpisodeItemsTx(tx *sql.Tx, episodeID, ownerType, ownerID string, itemIDs []string) error {
	if len(itemIDs) == 0 {
		return nil
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(itemIDs)), ",")
	args := make([]any, 0, len(itemIDs)+3)
	for _, id := range itemIDs {
		args = append(args, id)
	}
	args = append(args, ownerType, ownerID, episodeID)
	if _, err := tx.Exec(`DELETE FROM episode_item
		WHERE item_id IN (`+placeholders+`)
			AND episode_id IN (
				SELECT id FROM episodes
				WHERE owner_type = ? AND owner_id = ? AND id <> ?)`, args...); err != nil {
		return err
	}

	var maxPos int
	if err := tx.QueryRow(`SELECT COALESCE(MAX(position), -1) FROM episode_item WHERE episode_id = ?`,
		episodeID).Scan(&maxPos); err != nil {
		return err
	}
	for _, itemID := range itemIDs {
		res, err := tx.Exec(`INSERT OR IGNORE INTO episode_item (episode_id, item_id, position)
			VALUES (?, ?, ?)`, episodeID, itemID, maxPos+1)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			maxPos++
		}
	}
	return nil
}

// ensureItemsInOwner rejects item ids that are not part of the owner. Sessions
// own items through items.session_id; collections through collection_item.
func (s *Store) ensureItemsInOwner(ownerType, ownerID string, itemIDs []string) error {
	for _, itemID := range itemIDs {
		var one int
		var err error
		if ownerType == groupOwnerSession {
			err = s.db.QueryRow(`SELECT 1 FROM items WHERE id = ? AND session_id = ?`,
				itemID, ownerID).Scan(&one)
		} else {
			err = s.db.QueryRow(`SELECT 1 FROM collection_item WHERE collection_id = ? AND item_id = ?`,
				ownerID, itemID).Scan(&one)
		}
		if errors.Is(err, sql.ErrNoRows) {
			return invalid("item " + itemID + " is not part of this group")
		}
		if err != nil {
			return err
		}
	}
	return nil
}

// nextEpisodePosition returns the position after the owner's last episode.
func nextEpisodePosition(tx *sql.Tx, ownerType, ownerID string) (int, error) {
	var pos int
	err := tx.QueryRow(`SELECT COALESCE(MAX(position), -1) + 1 FROM episodes
		WHERE owner_type = ? AND owner_id = ?`, ownerType, ownerID).Scan(&pos)
	return pos, err
}

// validEpisodeOwner reports whether ownerType may own episodes. Episodes nest
// inside groups (sessions and collections) only.
func validEpisodeOwner(ownerType string) bool {
	return ownerType == groupOwnerSession || ownerType == groupOwnerCollection
}

// ownerExists reports whether the session or collection exists.
func (s *Store) ownerExists(ownerType, ownerID string) (bool, error) {
	if ownerID == "" {
		return false, invalid("owner id is required")
	}
	table := "sessions"
	if ownerType == groupOwnerCollection {
		table = "collections"
	}
	var one int
	err := s.db.QueryRow(`SELECT 1 FROM `+table+` WHERE id = ?`, ownerID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// phashThreshold reads the near-duplicate distance from settings, falling back
// to the default when the read fails.
func (s *Store) phashThreshold() int {
	settings, err := s.Settings()
	if err != nil {
		return DefaultPhashThreshold
	}
	return settings.PhashThreshold
}
