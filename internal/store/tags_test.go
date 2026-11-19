package store

import (
	"errors"
	"path/filepath"
	"testing"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "catalog.db"), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestRenameTag(t *testing.T) {
	s := openTestStore(t)

	tag, err := s.CreateTag("artist:old")
	if err != nil {
		t.Fatal(err)
	}
	renamed, err := s.RenameTag(tag.ID, "artist:new")
	if err != nil {
		t.Fatal(err)
	}
	if renamed.Name != "artist:new" {
		t.Fatalf("name = %q, want artist:new", renamed.Name)
	}
	// Families are derived from the name.
	if renamed.Family != "artist" {
		t.Fatalf("family = %q, want artist", renamed.Family)
	}
	got, err := s.GetTag(tag.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "artist:new" {
		t.Fatalf("persisted name = %q, want artist:new", got.Name)
	}

	// Renaming to its own name is a no-op that succeeds.
	if _, err := s.RenameTag(tag.ID, "artist:new"); err != nil {
		t.Fatalf("rename to same name: %v", err)
	}

	// A clash with another tag is rejected case-insensitively.
	if _, err := s.CreateTag("rating:safe"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.RenameTag(tag.ID, "RATING:SAFE"); err == nil {
		t.Fatal("expected a duplicate-name error")
	}

	if _, err := s.RenameTag("does-not-exist", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown id: want ErrNotFound, got %v", err)
	}
}

func TestTagChangesKeepNsfwSetting(t *testing.T) {
	s := openTestStore(t)

	tag, err := s.CreateTag("nsfw")
	if err != nil {
		t.Fatal(err)
	}
	name := "nsfw"
	if _, err := s.UpdateSettings(nil, nil, &name, nil, nil); err != nil {
		t.Fatal(err)
	}

	if _, err := s.RenameTag(tag.ID, "adult"); err != nil {
		t.Fatal(err)
	}
	settings, err := s.Settings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.NsfwTag != "adult" {
		t.Fatalf("nsfwTag after rename = %q, want adult", settings.NsfwTag)
	}

	if err := s.DeleteTag(tag.ID); err != nil {
		t.Fatal(err)
	}
	settings, err = s.Settings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.NsfwTag != "" {
		t.Fatalf("nsfwTag after delete = %q, want empty", settings.NsfwTag)
	}
}

func TestDeleteTagUnassigns(t *testing.T) {
	s := openTestStore(t)

	tag, err := s.CreateTag("temp")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`INSERT INTO items
		(id, content_hash, relative_path, kind, format)
		VALUES ('i1', 'h1', 'a.png', 'image', 'png')`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`INSERT INTO item_tag (item_id, tag_id) VALUES ('i1', ?)`, tag.ID); err != nil {
		t.Fatal(err)
	}

	if err := s.DeleteTag(tag.ID); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM item_tag WHERE tag_id = ?`, tag.ID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("item_tag rows left = %d, want 0", n)
	}
	if _, err := s.GetTag(tag.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted tag: want ErrNotFound, got %v", err)
	}
}
