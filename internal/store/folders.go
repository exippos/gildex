package store

import (
	"path"
	"sort"
	"strings"

	"gildex/internal/model"
)

type folderBuilder struct {
	name     string
	path     string
	count    int
	children map[string]*folderBuilder
}

// Folders builds the directory-only browse tree. Media sources are top-level
// nodes (source-relative paths); library-local items (the inbox) appear under
// their natural path (e.g. `_inbox/…`) with no source id.
func (s *Store) Folders() ([]model.FolderNode, error) {
	out := []model.FolderNode{}

	sources, err := s.Sources()
	if err != nil {
		return nil, err
	}
	for i := range sources {
		src := &sources[i]
		node, err := s.folderNodeForSource(src)
		if err != nil {
			return nil, err
		}
		out = append(out, *node)
	}

	inbox, err := s.folderNodeForInbox()
	if err != nil {
		return nil, err
	}
	out = append(out, inbox...)
	return out, nil
}

func (s *Store) folderNodeForSource(src *model.Source) (*model.FolderNode, error) {
	rows, err := s.db.Query(`SELECT relative_path FROM items WHERE source_id = ?`, src.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	root := &folderBuilder{children: map[string]*folderBuilder{}}
	total := 0
	for rows.Next() {
		var rel string
		if err := rows.Scan(&rel); err != nil {
			return nil, err
		}
		total++
		addFolderDirs(root, rel)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	id := src.ID
	return &model.FolderNode{
		Name:      src.Name,
		Path:      "",
		SourceID:  &id,
		ItemCount: total,
		Children:  buildFolderNodes(root, &id),
	}, nil
}

func (s *Store) folderNodeForInbox() ([]model.FolderNode, error) {
	rows, err := s.db.Query(`SELECT relative_path FROM items WHERE source_id IS NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	root := &folderBuilder{children: map[string]*folderBuilder{}}
	total := 0
	for rows.Next() {
		var rel string
		if err := rows.Scan(&rel); err != nil {
			return nil, err
		}
		total++
		addFolderDirs(root, rel)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if total == 0 {
		return nil, nil
	}

	// Unsourced items live under their natural path (typically `_inbox/…`); the
	// top-level nodes are returned directly, source id nil.
	return buildFolderNodes(root, nil), nil
}

// addFolderDirs increments every ancestor directory of rel's parent path so
// counts are recursive.
func addFolderDirs(root *folderBuilder, rel string) {
	node := root
	dir := path.Dir(strings.ReplaceAll(rel, `\`, "/"))
	if dir == "." || dir == "/" {
		return
	}
	parts := strings.Split(dir, "/")
	for i := range parts {
		if parts[i] == "" {
			continue
		}
		key := strings.Join(parts[:i+1], "/")
		child, ok := node.children[key]
		if !ok {
			child = &folderBuilder{
				name:     parts[i],
				path:     key,
				children: map[string]*folderBuilder{},
			}
			node.children[key] = child
		}
		child.count++
		node = child
	}
}

func buildFolderNodes(parent *folderBuilder, sourceID *string) []model.FolderNode {
	children := make([]*folderBuilder, 0, len(parent.children))
	for _, child := range parent.children {
		children = append(children, child)
	}
	sort.Slice(children, func(i, j int) bool {
		return strings.ToLower(children[i].name) < strings.ToLower(children[j].name)
	})

	out := make([]model.FolderNode, 0, len(children))
	for _, child := range children {
		out = append(out, model.FolderNode{
			Name:      child.name,
			Path:      child.path,
			SourceID:  sourceID,
			ItemCount: child.count,
			Children:  buildFolderNodes(child, sourceID),
		})
	}
	return out
}
