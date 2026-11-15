// Shared tag editor for the right preview panel. Used by both the single-item
// and batch views: lists the vocabulary with a coverage state per tag and
// add/remove controls that never close the surface.
import { useMemo, useState } from 'react'
import type { Tag } from '../../types'
import './tag-editor.css'

export interface TagEditorState {
  /** How many of the target item(s) carry this tag. */
  on: number
  /** How many item(s) the editor is editing. */
  total: number
}

export function TagEditor({
  tags,
  stateFor,
  onAdd,
  onRemove,
  showCounts = false,
  createLabel = 'add or create tag',
}: {
  tags: Tag[]
  stateFor: (name: string) => TagEditorState
  onAdd: (name: string) => void
  onRemove: (name: string) => void
  showCounts?: boolean
  createLabel?: string
}) {
  const [filter, setFilter] = useState('')
  const [name, setName] = useState('')

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return tags
    return tags.filter((tag) => tag.name.toLowerCase().includes(needle))
  }, [tags, filter])

  const create = () => {
    const next = name.trim()
    if (!next) return
    setName('')
    onAdd(next)
  }

  return (
    <>
      <input
        className="tag-editor-filter"
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="filter tags"
        aria-label="Filter tags"
      />

      <div className="tag-editor-list">
        {visible.map((tag) => {
          const { on, total } = stateFor(tag.name)
          const cover = on === 0 ? 'none' : on >= total ? 'all' : 'some'
          return (
            <div className="tag-editor-row" key={tag.id}>
              <span
                className={`tag-editor-cover${cover === 'all' ? ' is-all' : cover === 'some' ? ' is-some' : ''}`}
                aria-hidden="true"
              />
              <span className="tag-editor-name" title={tag.name}>
                {tag.name}
              </span>
              {showCounts && (
                <span className="tag-editor-count">
                  {on}/{total}
                </span>
              )}
              <button
                type="button"
                className="tag-editor-add"
                title={`Add “${tag.name}”`}
                aria-label={`Add tag ${tag.name}`}
                disabled={cover === 'all'}
                onClick={() => onAdd(tag.name)}
              >
                +
              </button>
              <button
                type="button"
                className="tag-editor-remove"
                title={`Remove “${tag.name}”`}
                aria-label={`Remove tag ${tag.name}`}
                disabled={cover === 'none'}
                onClick={() => onRemove(tag.name)}
              >
                −
              </button>
            </div>
          )
        })}
        {visible.length === 0 && <div className="tag-editor-empty">no tags match</div>}
      </div>

      <div className="tag-editor-create">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={createLabel}
          aria-label="New tag name"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              create()
            }
          }}
        />
        <button type="button" onClick={create} disabled={!name.trim()}>
          add
        </button>
      </div>
    </>
  )
}
