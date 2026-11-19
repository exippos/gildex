package store

import (
	"path/filepath"
	"testing"

	"gildex/internal/model"
)

// seedItem inserts a minimal item row so collection-order tests need not run
// the whole import pipeline.
func seedItem(t *testing.T, s *Store, id, hash string, ts int64) {
	t.Helper()
	if _, err := s.db.Exec(
		`INSERT INTO items (id, content_hash, relative_path, kind, format, timestamp) VALUES (?, ?, ?, 'image', 'png', ?)`,
		id, hash, "media/"+id+".png", ts,
	); err != nil {
		t.Fatalf("seed item %s: %v", id, err)
	}
}

func itemIDs(pageItems []model.Item) []string {
	ids := make([]string, len(pageItems))
	for i, it := range pageItems {
		ids[i] = it.ID
	}
	return ids
}

func TestCollectionCustomOrder(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "catalog.db"), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	for _, id := range []string{"a", "b", "c"} {
		seedItem(t, s, id, "hash-"+id, 100)
	}
	col, err := s.CreateCollection("picks", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.AddCollectionItems(col.ID, []string{"a", "b", "c"}); err != nil {
		t.Fatal(err)
	}

	// Manual order: c, a, b (and confirm direction is ignored for custom).
	order := []string{"c", "a", "b"}
	if _, err := s.UpdateCollection(col.ID, CollectionPatch{Order: &order}); err != nil {
		t.Fatal(err)
	}

	for _, dir := range []string{"asc", "desc"} {
		page, err := s.QueryItems(ItemQuery{CollectionID: col.ID, Sort: "custom", Dir: dir, Limit: 100})
		if err != nil {
			t.Fatalf("query custom dir=%s: %v", dir, err)
		}
		got := itemIDs(page.Items)
		want := []string{"c", "a", "b"}
		if len(got) != len(want) {
			t.Fatalf("dir=%s: got %v want %v", dir, got, want)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Fatalf("dir=%s: got %v want %v", dir, got, want)
			}
		}
	}
}

func TestCollectionReorderPreservesUnlistedMembers(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "catalog.db"), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	for _, id := range []string{"a", "b", "c", "d"} {
		seedItem(t, s, id, "hash-"+id, 100)
	}
	col, err := s.CreateCollection("picks", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.AddCollectionItems(col.ID, []string{"a", "b", "c", "d"}); err != nil {
		t.Fatal(err)
	}

	// Reorder only a subset (as a paged client might): move d before b. The
	// unmentioned members (a, c) must survive in their existing relative order.
	order := []string{"d", "b"}
	if _, err := s.UpdateCollection(col.ID, CollectionPatch{Order: &order}); err != nil {
		t.Fatal(err)
	}

	page, err := s.QueryItems(ItemQuery{CollectionID: col.ID, Sort: "custom", Dir: "asc", Limit: 100})
	if err != nil {
		t.Fatal(err)
	}
	got := itemIDs(page.Items)
	want := []string{"d", "b", "a", "c"}
	if len(got) != len(want) {
		t.Fatalf("got %v want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v want %v", got, want)
		}
	}
}
