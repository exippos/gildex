// Package store owns the SQLite schema and every catalog query.
package store

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	_ "modernc.org/sqlite"

	"gildex/internal/model"
)

// ErrNotFound is returned when a requested row does not exist.
var ErrNotFound = errors.New("not found")

// Store wraps the SQLite database and its root path.
type Store struct {
	db   *sql.DB
	root string
}

const schema = `
CREATE TABLE IF NOT EXISTS items (
  id              TEXT PRIMARY KEY,
  content_hash    TEXT NOT NULL UNIQUE,
  relative_path   TEXT NOT NULL,
  kind            TEXT NOT NULL,
  format          TEXT NOT NULL,
  file_size       INTEGER NOT NULL DEFAULT 0,
  timestamp       INTEGER NOT NULL DEFAULT 0,
  width           INTEGER NOT NULL DEFAULT 0,
  height          INTEGER NOT NULL DEFAULT 0,
  duration        REAL,
  favorite        INTEGER NOT NULL DEFAULT 0,
  rating          INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft',
  state           TEXT NOT NULL DEFAULT 'present',
  session_id      TEXT,
  prompt          TEXT,
  negative_prompt TEXT,
  model_name      TEXT,
  seed            INTEGER,
  steps           INTEGER,
  sampler         TEXT,
  cfg_scale       REAL,
  generated_at    INTEGER,
  thumbnail_path  TEXT NOT NULL DEFAULT '',
  phash           INTEGER NOT NULL DEFAULT 0,
  manual_fields   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
  id        TEXT PRIMARY KEY,
  label     TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE IF NOT EXISTS item_tag (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS collection_item (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, item_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id   TEXT NOT NULL,
  body       TEXT NOT NULL,
  type_label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tombstones (
  content_hash TEXT PRIMARY KEY,
  removed_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS metadata_kv (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (item_id, key)
);

CREATE TABLE IF NOT EXISTS raw_metadata (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  blob    BLOB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_timestamp ON items(timestamp);
CREATE INDEX IF NOT EXISTS idx_items_session ON items(session_id);
CREATE INDEX IF NOT EXISTS idx_items_path ON items(relative_path);
CREATE INDEX IF NOT EXISTS idx_item_tag_tag ON item_tag(tag_id);
CREATE INDEX IF NOT EXISTS idx_collection_item_item ON collection_item(item_id);
CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes(owner_type, owner_id);
`

// Open opens (and migrates) the SQLite database at dbPath.
func Open(dbPath, root string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}
	dsn := "file:" + dbPath + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// A single connection keeps writes serialized and avoids SQLITE_BUSY in
	// the pure-Go driver; the workload is local and small.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db, root: root}, nil
}

// Close closes the underlying database.
func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

// Root returns the library root this store was opened for.
func (s *Store) Root() string { return s.root }

// NewID returns a random RFC-4122 v4 UUID string.
func NewID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(fmt.Sprintf("crypto/rand: %v", err))
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

const itemCols = `i.id, i.content_hash, i.relative_path, i.kind, i.format, i.file_size,
	i.timestamp, i.width, i.height, i.duration, i.favorite, i.rating, i.status, i.state,
	i.session_id, i.prompt, i.negative_prompt, i.model_name, i.seed, i.steps, i.sampler,
	i.cfg_scale, i.generated_at, i.thumbnail_path`

func scanItem(sc interface{ Scan(dest ...any) error }) (*model.Item, error) {
	var (
		it                       model.Item
		kind, format, status     string
		state                    string
		favorite                 int
		duration                 sql.NullFloat64
		sessionID                sql.NullString
		prompt, negative, modelN sql.NullString
		seed, steps, generatedAt sql.NullInt64
		sampler                  sql.NullString
		cfg                      sql.NullFloat64
	)
	err := sc.Scan(
		&it.ID, &it.ContentHash, &it.RelativePath, &kind, &format, &it.FileSize,
		&it.Timestamp, &it.Width, &it.Height, &duration, &favorite, &it.Rating, &status, &state,
		&sessionID, &prompt, &negative, &modelN, &seed, &steps, &sampler,
		&cfg, &generatedAt, &it.ThumbnailPath,
	)
	if err != nil {
		return nil, err
	}
	it.Kind = model.Kind(kind)
	it.Format = format
	it.Status = model.Status(status)
	it.State = model.State(state)
	it.Favorite = favorite != 0
	it.Duration = nullFloat(duration)
	it.SessionID = nullString(sessionID)
	it.Prompt = nullString(prompt)
	it.NegativePrompt = nullString(negative)
	it.ModelName = nullString(modelN)
	it.Seed = nullInt(seed)
	it.Steps = nullInt(steps)
	it.Sampler = nullString(sampler)
	it.CFGScale = nullFloat(cfg)
	it.GeneratedAt = nullInt(generatedAt)
	it.Extra = map[string]string{}
	return &it, nil
}

func (s *Store) loadExtras(ids []string) (map[string]map[string]string, error) {
	out := make(map[string]map[string]string, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	rows, err := s.db.Query(`SELECT item_id, key, value FROM metadata_kv WHERE item_id IN (`+placeholders+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, k, v string
		if err := rows.Scan(&id, &k, &v); err != nil {
			return nil, err
		}
		if out[id] == nil {
			out[id] = map[string]string{}
		}
		out[id][k] = v
	}
	return out, rows.Err()
}

func nullString(v sql.NullString) *string {
	if !v.Valid {
		return nil
	}
	s := v.String
	return &s
}

func nullInt(v sql.NullInt64) *int64 {
	if !v.Valid {
		return nil
	}
	n := v.Int64
	return &n
}

func nullFloat(v sql.NullFloat64) *float64 {
	if !v.Valid {
		return nil
	}
	f := v.Float64
	return &f
}

func strArg(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func intArg(p *int64) any {
	if p == nil {
		return nil
	}
	return *p
}

func floatArg(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}

func splitManual(s string) map[string]bool {
	out := map[string]bool{}
	for _, f := range strings.Split(s, ",") {
		if f = strings.TrimSpace(f); f != "" {
			out[f] = true
		}
	}
	return out
}

func joinManual(m map[string]bool) string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return strings.Join(keys, ",")
}

// escapeLike escapes LIKE wildcards for use with `ESCAPE '\'`.
func escapeLike(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, "%", `\%`)
	s = strings.ReplaceAll(s, "_", `\_`)
	return s
}
