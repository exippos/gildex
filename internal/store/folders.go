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

// Folders builds the directory-only browse tree from item relative paths.
// Each node's count is the number of items directly or recursively under it.
func (s *Store) Folders() ([]model.FolderNode, error) {
	rows, err := s.db.Query(`SELECT relative_path FROM items`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	root := &folderBuilder{children: map[string]*folderBuilder{}}
	add := func(dir string) *folderBuilder {
		node := root
		parts := strings.Split(dir, "/")
		for i, part := range parts {
			if part == "" || part == "." {
				continue
			}
			key := strings.Join(parts[:i+1], "/")
			child, ok := node.children[key]
			if !ok {
				child = &folderBuilder{
					name:     part,
					path:     key,
					children: map[string]*folderBuilder{},
				}
				node.children[key] = child
			}
			node = child
		}
		return node
	}

	for rows.Next() {
		var rel string
		if err := rows.Scan(&rel); err != nil {
			return nil, err
		}
		rel = strings.ReplaceAll(rel, `\`, "/")
		dir := path.Dir(rel)
		if dir == "." || dir == "/" {
			continue
		}
		// Increment every ancestor so counts are recursive.
		parts := strings.Split(dir, "/")
		for i := range parts {
			if parts[i] == "" {
				continue
			}
			add(strings.Join(parts[:i+1], "/")).count++
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return buildFolderNodes(root), nil
}

func buildFolderNodes(parent *folderBuilder) []model.FolderNode {
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
			ItemCount: child.count,
			Children:  buildFolderNodes(child),
		})
	}
	return out
}
