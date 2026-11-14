package store

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gildex/internal/model"
)

// ErrNoSource is returned when a source id is not found.
var ErrNoSource = errors.New("source not found")

// Sources returns every configured source, ordered by name.
func (s *Store) Sources() ([]model.Source, error) {
	rows, err := s.db.Query(`SELECT id, name, path, mode, added_at, last_scan_at FROM sources ORDER BY name COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []model.Source{}
	for rows.Next() {
		src, err := scanSource(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *src)
	}
	return out, rows.Err()
}

// GetSource returns one source by id, or nil when absent.
func (s *Store) GetSource(id string) (*model.Source, error) {
	row := s.db.QueryRow(`SELECT id, name, path, mode, added_at, last_scan_at FROM sources WHERE id = ?`, id)
	src, err := scanSource(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return src, nil
}

// AddSource registers a new media source. When name is empty it defaults to the
// folder's base name. The path must exist and be a directory.
func (s *Store) AddSource(name, path string, mode model.SourceMode) (*model.Source, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(abs)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, invalid("source path is not a directory")
	}
	if name == "" {
		name = filepath.Base(abs)
	}
	if mode == "" {
		mode = model.SourceOnce
	}
	src := &model.Source{
		ID:      NewID(),
		Name:    name,
		Path:    abs,
		Mode:    mode,
		AddedAt: time.Now().UnixMilli(),
	}
	if _, err := s.db.Exec(
		`INSERT INTO sources (id, name, path, mode, added_at, last_scan_at) VALUES (?, ?, ?, ?, ?, NULL)`,
		src.ID, src.Name, src.Path, string(src.Mode), src.AddedAt,
	); err != nil {
		return nil, err
	}
	return src, nil
}

// UpdateSource renames a source and/or toggles its scan mode. Fields left nil
// are unchanged.
func (s *Store) UpdateSource(id string, name *string, mode *model.SourceMode) (*model.Source, error) {
	cur, err := s.GetSource(id)
	if err != nil {
		return nil, err
	}
	if cur == nil {
		return nil, ErrNoSource
	}
	if name != nil && strings.TrimSpace(*name) != "" {
		cur.Name = strings.TrimSpace(*name)
	}
	if mode != nil {
		cur.Mode = *mode
	}
	if _, err := s.db.Exec(`UPDATE sources SET name = ?, mode = ? WHERE id = ?`, cur.Name, string(cur.Mode), id); err != nil {
		return nil, err
	}
	return cur, nil
}

// DeleteSource removes a source and marks every item that came from it as
// missing (records, tags, and notes are kept; nothing on disk is deleted — D4).
func (s *Store) DeleteSource(id string) error {
	cur, err := s.GetSource(id)
	if err != nil {
		return err
	}
	if cur == nil {
		return ErrNoSource
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE items SET state = 'missing' WHERE source_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM sources WHERE id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

// TouchSource records the completion time of a scan.
func (s *Store) TouchSource(id string) error {
	_, err := s.db.Exec(`UPDATE sources SET last_scan_at = ? WHERE id = ?`, time.Now().UnixMilli(), id)
	return err
}

// SourceCount returns the number of configured sources.
func (s *Store) SourceCount() (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM sources`).Scan(&n)
	return n, err
}

// ResolveItemPath returns the absolute on-disk path for an item: source
// relative when the item belongs to a source, library relative otherwise.
func (s *Store) ResolveItemPath(it *model.Item) (string, error) {
	rel := filepath.FromSlash(it.RelativePath)
	if it.SourceID != nil && *it.SourceID != "" {
		src, err := s.GetSource(*it.SourceID)
		if err != nil {
			return "", err
		}
		if src == nil {
			return "", ErrNoSource
		}
		return filepath.Join(src.Path, rel), nil
	}
	return filepath.Join(s.root, rel), nil
}

func scanSource(sc interface{ Scan(dest ...any) error }) (*model.Source, error) {
	var (
		src        model.Source
		mode       string
		lastScanAt sql.NullInt64
	)
	if err := sc.Scan(&src.ID, &src.Name, &src.Path, &mode, &src.AddedAt, &lastScanAt); err != nil {
		return nil, err
	}
	src.Mode = model.SourceMode(mode)
	if lastScanAt.Valid {
		v := lastScanAt.Int64
		src.LastScanAt = &v
	}
	return &src, nil
}
