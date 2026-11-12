// Directories-only tree for the Folders surface (D6: folders are a path-tree
// browse view). Renders inside a distinct container, nested folders under the
// library root, with hairline guide lines, folder glyphs, and top-level folders
// expanded by default. The active folder's ancestors auto-reveal.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store'
import type { FolderNode } from '../../types'
import './folder-tree.css'

interface NodeProps {
  node: FolderNode
  expanded: Set<string>
  activeFolder: string | null
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}

// All path prefixes, including the path itself ("a/b/c" -> ["a", "a/b", "a/b/c"]).
function ancestorPaths(path: string): string[] {
  const parts = path.split('/')
  const out: string[] = []
  for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join('/'))
  return out
}

function FolderIcon({ open, root }: { open?: boolean; root?: boolean }) {
  return (
    <svg
      className={`folder-icon${root ? ' is-root' : ''}`}
      viewBox="0 0 16 16"
      width="13"
      height="13"
      aria-hidden="true"
      focusable="false"
    >
      {root ? (
        <path
          d="M1.5 4.25a1 1 0 0 1 1-1h3.1l1.4 1.4h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.4z"
          fill="currentColor"
        />
      ) : (
        <>
          <path
            d="M1.5 4.25a1 1 0 0 1 1-1h3.1l1.4 1.4h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.4z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {open && <path d="M1.5 7.4h13" stroke="currentColor" strokeWidth="1.1" />}
        </>
      )}
    </svg>
  )
}

function TreeNode({ node, expanded, activeFolder, onToggle, onSelect }: NodeProps) {
  const isOpen = expanded.has(node.path)
  const hasChildren = node.children.length > 0
  const isActive = activeFolder === node.path

  return (
    <div className="folder-node">
      <div className="folder-row">
        {hasChildren ? (
          <button
            type="button"
            className={`folder-chevron${isOpen ? ' is-open' : ''}`}
            aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
            aria-expanded={isOpen}
            onClick={() => onToggle(node.path)}
          >
            ›
          </button>
        ) : (
          <span className="folder-chevron is-empty" aria-hidden="true" />
        )}
        <FolderIcon open={isOpen && hasChildren} />
        <button
          type="button"
          className={`folder-name${isActive ? ' is-active' : ''}`}
          onClick={() => onSelect(node.path)}
          title={node.path}
        >
          {node.name}
        </button>
        <span className="folder-count">{node.itemCount}</span>
      </div>

      {isOpen && hasChildren && (
        <div className="folder-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              expanded={expanded}
              activeFolder={activeFolder}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FolderTree() {
  const folders = useStore((s) => s.folders)
  const activeFolder = useStore((s) => s.activeFolder)
  const setActiveFolder = useStore((s) => s.setActiveFolder)
  const setPreviewItemId = useStore((s) => s.setPreviewItemId)
  const rootPath = useStore((s) => s.library?.root)
  const totalItems = useStore((s) => s.library?.itemCount ?? 0)

  const rootName = useMemo(() => {
    if (!rootPath) return 'library'
    const parts = rootPath.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean)
    return parts[parts.length - 1] || 'library'
  }, [rootPath])

  // Expansion is local UI state; the active folder lives in the store.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const initialized = useRef(false)

  // Expand the top level once on first load so nested folders are visible.
  useEffect(() => {
    if (!initialized.current && folders.length > 0) {
      initialized.current = true
      setExpanded(new Set(folders.map((f) => f.path)))
    }
  }, [folders])

  // Reveal the active folder's ancestors (and itself) when the selection changes.
  useEffect(() => {
    if (!activeFolder) return
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const p of ancestorPaths(activeFolder)) next.add(p)
      return next
    })
  }, [activeFolder])

  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const select = (path: string | null) => {
    setActiveFolder(path)
    setPreviewItemId(null)
  }

  return (
    <div className="folder-tree-container">
      <div className="folder-tree">
        <div className="folder-row folder-root-row">
          <span className="folder-chevron is-empty" aria-hidden="true" />
          <FolderIcon root />
          <button
            type="button"
            className={`folder-name folder-root-name${activeFolder === null ? ' is-active' : ''}`}
            onClick={() => select(null)}
            title={rootPath ?? 'library root'}
          >
            {rootName}
          </button>
          <span className="folder-count">{totalItems}</span>
        </div>

        {folders.length > 0 && (
          <div className="folder-children">
            {folders.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                expanded={expanded}
                activeFolder={activeFolder}
                onToggle={toggle}
                onSelect={select}
              />
            ))}
          </div>
        )}

        {folders.length === 0 && <div className="folder-hint">no folders yet</div>}
      </div>
    </div>
  )
}
