package reveal

import (
	"path/filepath"
	"testing"
)

func TestRevealMissingPath(t *testing.T) {
	if err := Reveal(filepath.Join(t.TempDir(), "nope.png")); err == nil {
		t.Fatal("expected an error for a missing path")
	}
}

func TestRevealRejectsDirectory(t *testing.T) {
	if err := Reveal(t.TempDir()); err == nil {
		t.Fatal("expected an error for a directory")
	}
}
