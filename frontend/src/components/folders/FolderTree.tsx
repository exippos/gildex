// Directories-only tree for the Folders surface (D6: folders are a path-tree
// browse view). Renders inside a distinct container, nested folders under the
// library root, with hairline guide lines, folder glyphs, and top-level folders
// expanded by default. The active folder's ancestors auto-reveal.
//
// Top level mixes media sources (source-relative paths, `sourceId` set) with
// library-local inbox folders (`sourceId === null`). Paths are only unique per
// source, so expansion/active state is keyed by `(sourceId, path)` composites.
import { useEffect, useMemo, useRef, useState } from 'react'
import { INBOX_SOURCE, useStore } from '../../store'
import type { FolderNode } from '../../types'
import './folder-tree.css'

interface NodeProps {
  node: FolderNode
  topLevel: boolean
  expanded: Set<string>
  activeKey: string
  onToggle: (key: string) => void
  onSelect: (node: FolderNode, topLevel: boolean) => void
}

// All path prefixes, including the path itself ("a/b/c" -> ["a", "a/b", "a/b/c"]).
function ancestorPaths(path: string): string[] {
  const parts = path.split('/')
  const out: string[] = []
  for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join('/'))
  return out
}

// Composite identity used for expansion state. Unsourced (inbox) nodes use the
// inbox sentinel so their keys never collide with a source's relative paths.
function nodeKey(node: FolderNode): string {
  return `${node.sourceId ?? INBOX_SOURCE}::${node.path}`
}

// The (sourceId, folder) pair a node selects. A top-level inbox node stands for
// the whole inbox (`sourceId IS NULL`), so it selects an empty folder path.
function selectionTarget(
  node: FolderNode,
  topLevel: boolean,
): { sourceId: string | null; folder: string } {
  if (node.sourceId !== null) return { sourceId: node.sourceId, folder: node.path }
  return { sourceId: INBOX_SOURCE, folder: topLevel ? '' : node.path }
}

// Composite key for "is this node currently selected?" comparisons.
function selectKey(node: FolderNode, topLevel: boolean): string {
  const target = selectionTarget(node, topLevel)
  return `${target.sourceId ?? INBOX_SOURCE}::${target.folder}`
}

function FolderIcon({
  open,
  root,
  source,
}: {
  open?: boolean
  root?: boolean
  source?: boolean
}) {
  return (
    <svg
      className={`folder-icon${root ? ' is-root' : ''}${source ? ' is-source' : ''}`}
      viewBox="0 0 16 16"
      width="13"
      height="13"
      aria-hidden="true"
      focusable="false"
    >
      {root || source ? (
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

function TreeNode({
  node,
  topLevel,
  expanded,
  activeKey,
  onToggle,
  onSelect,
}: NodeProps) {
  const key = nodeKey(node)
  const isOpen = expanded.has(key)
  const hasChildren = node.children.length > 0
  const isActive = activeKey === selectKey(node, topLevel)
  const isSource = topLevel && node.sourceId !== null

  return (
    <div className="folder-node">
      <div className={`folder-row${isSource ? ' folder-source-row' : ''}`}>
        {hasChildren ? (
          <button
            type="button"
            className={`folder-chevron${isOpen ? ' is-open' : ''}`}
            aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
            aria-expanded={isOpen}
            onClick={() => onToggle(key)}
          >
            ›
          </button>
        ) : (
          <span className="folder-chevron is-empty" aria-hidden="true" />
        )}
        <FolderIcon open={isOpen && hasChildren} source={isSource} />
        {isSource && <span className="folder-source-tag">source</span>}
        <button
          type="button"
          className={`folder-name${isActive ? ' is-active' : ''}`}
          onClick={() => onSelect(node, topLevel)}
          title={node.path || node.name}
        >
          {node.name}
        </button>
        <span className="folder-count">{node.itemCount}</span>
      </div>

      {isOpen && hasChildren && (
        <div className="folder-children">
          {node.children.map((child) => (
            <TreeNode
              key={nodeKey(child)}
              node={child}
              topLevel={false}
              expanded={expanded}
              activeKey={activeKey}
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
  const activeSourceId = useStore((s) => s.activeSourceId)
  const selectFolder = useStore((s) => s.selectFolder)
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

  const activeKey = `${activeSourceId ?? INBOX_SOURCE}::${activeFolder ?? ''}`
  const isRootActive = activeSourceId === null && activeFolder === null

  // Expand the top level once on first load so nested folders are visible.
  useEffect(() => {
    if (!initialized.current && folders.length > 0) {
      initialized.current = true
      setExpanded(new Set(folders.map((f) => nodeKey(f))))
    }
  }, [folders])

  // Reveal the active folder's ancestors (and itself) when the selection changes.
  useEffect(() => {
    if (activeFolder === null) return
    setExpanded((prev) => {
      const next = new Set(prev)
      const sourceKey = activeSourceId ?? INBOX_SOURCE

      if (activeFolder === '') {
        // A top-level selection: reveal the selected source, or every top-level
        // inbox node (its selection collapses to an empty path).
        if (activeSourceId === INBOX_SOURCE) {
          for (const f of folders) if (f.sourceId === null) next.add(nodeKey(f))
        } else if (activeSourceId !== null) {
          next.add(`${sourceKey}::`)
        }
        return next
      }

      // The source node itself has an empty path, which ancestorPaths never
      // yields, so expand it explicitly for any of its subfolders.
      if (activeSourceId !== null && activeSourceId !== INBOX_SOURCE) {
        next.add(`${sourceKey}::`)
      }
      for (const p of ancestorPaths(activeFolder)) next.add(`${sourceKey}::${p}`)
      return next
    })
  }, [activeFolder, activeSourceId, folders])

  const toggle = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const select = (node: FolderNode | null, topLevel = false) => {
    if (node === null) {
      selectFolder(null, null)
    } else {
      const target = selectionTarget(node, topLevel)
      selectFolder(target.sourceId, target.folder)
    }
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
            className={`folder-name folder-root-name${isRootActive ? ' is-active' : ''}`}
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
                key={nodeKey(node)}
                node={node}
                topLevel
                expanded={expanded}
                activeKey={activeKey}
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
