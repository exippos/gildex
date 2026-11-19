package store

import (
	"path/filepath"
	"testing"
)

// TestItemUnchanged covers the fast path a watch scan uses to skip files whose
// size and mtime already match the catalog.
func TestItemUnchanged(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "catalog.db"), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	src := "src-1"
	if _, err := s.db.Exec(`INSERT INTO items
		(id, content_hash, relative_path, kind, format, file_size, timestamp, state, source_id)
		VALUES ('a', 'h-a', 'media/a.png', 'image', 'png', 100, 1000, 'present', ?)`, src); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`INSERT INTO items
		(id, content_hash, relative_path, kind, format, file_size, timestamp, state)
		VALUES ('b', 'h-b', 'media/b.png', 'image', 'png', 200, 2000, 'missing')`); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name   string
		source *string
		path   string
		size   int64
		mtime  int64
		want   bool
	}{
		{"same source match", &src, "media/a.png", 100, 1000, true},
		{"size changed", &src, "media/a.png", 101, 1000, false},
		{"mtime changed", &src, "media/a.png", 100, 1001, false},
		{"path changed", &src, "media/x.png", 100, 1000, false},
		{"wrong source", nil, "media/a.png", 100, 1000, false},
		{"missing state", nil, "media/b.png", 200, 2000, false},
	}
	for _, c := range cases {
		got, err := s.ItemUnchanged(c.source, c.path, c.size, c.mtime)
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if got != c.want {
			t.Fatalf("%s: got %v want %v", c.name, got, c.want)
		}
	}

	// A nil source matches a library-local item (source_id IS NULL).
	if _, err := s.db.Exec(`INSERT INTO items
		(id, content_hash, relative_path, kind, format, file_size, timestamp, state)
		VALUES ('c', 'h-c', 'media/c.png', 'image', 'png', 300, 3000, 'present')`); err != nil {
		t.Fatal(err)
	}
	got, err := s.ItemUnchanged(nil, "media/c.png", 300, 3000)
	if err != nil {
		t.Fatal(err)
	}
	if !got {
		t.Fatal("nil source should match a library-local item")
	}
}
