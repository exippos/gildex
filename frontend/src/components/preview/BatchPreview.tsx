// Batch preview (right panel) — appears when two or more items are selected.
// Persistent batch surface: tag without the menu closing, plus triage and
// destructive actions. Mirrors the floating BatchToolbar but stays open.
import { useMemo, useState } from 'react'
import { thumbUrl } from '../../api'
import { useStore } from '../../store'
import type { Status } from '../../types'
import { STATUSES } from '../grid/statuses'
import './batch-preview.css'

const MAX_THUMBS = 12

type Cover = 'none' | 'some' | 'all'

export function BatchPreview() {
  const selection = useStore((s) => s.selection)
  const items = useStore((s) => s.items)
  const tags = useStore((s) => s.tags)
  const batchTag = useStore((s) => s.batchTag)
  const batchSet = useStore((s) => s.batchSet)
  const batchRemove = useStore((s) => s.batchRemove)
  const clearSelection = useStore((s) => s.clearSelection)
  const openCollectionPicker = useStore((s) => s.openCollectionPicker)
  const setPreviewItemId = useStore((s) => s.setPreviewItemId)

  const [tagFilter, setTagFilter] = useState('')
  const [newTagName, setNewTagName] = useState('')

  const selectedSet = useMemo(() => new Set(selection), [selection])
  const selectedItems = useMemo(
    () => items.filter((item) => selectedSet.has(item.id)),
    [items, selectedSet],
  )

  const count = selection.length
  const total = selectedItems.length

  const visibleTags = useMemo(() => {
    const needle = tagFilter.trim().toLowerCase()
    if (!needle) return tags
    return tags.filter((tag) => tag.name.toLowerCase().includes(needle))
  }, [tags, tagFilter])

  const coverage = (tagName: string): { on: number; cover: Cover } => {
    if (total === 0) return { on: 0, cover: 'none' }
    let on = 0
    for (const item of selectedItems) {
      if (item.tags.includes(tagName)) on++
    }
    const cover: Cover = on === 0 ? 'none' : on === total ? 'all' : 'some'
    return { on, cover }
  }

  const allFavorite =
    total > 0 && selectedItems.every((item) => item.favorite)
  const uniformRating =
    total > 0 && selectedItems.every((item) => item.rating === selectedItems[0].rating)
      ? selectedItems[0].rating
      : -1
  const uniformStatus =
    total > 0 && selectedItems.every((item) => item.status === selectedItems[0].status)
      ? selectedItems[0].status
      : null

  const thumbs = selectedItems.slice(0, MAX_THUMBS)
  const overflow = Math.max(0, count - MAX_THUMBS)

  const addTag = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    void batchTag([trimmed], [], { keep: true })
  }

  const removeTag = (name: string) => {
    void batchTag([], [name], { keep: true })
  }

  const createAndAdd = () => {
    const name = newTagName.trim()
    if (!name) return
    setNewTagName('')
    addTag(name)
  }

  const setRating = (rating: number) => {
    void batchSet({ rating: uniformRating === rating ? 0 : rating }, { keep: true })
  }

  const setStatus = (status: Status) => {
    void batchSet({ status }, { keep: true })
  }

  const remove = () => {
    const ok = window.confirm(
      `Remove ${count} ${count === 1 ? 'item' : 'items'} from the catalog?\n\nFiles stay on disk; they can be imported again.`,
    )
    if (ok) void batchRemove()
  }

  return (
    <>
      <div className="preview-section preview-lead">
        <h2 className="preview-title display">{count} selected</h2>
        <div className="preview-sub">batch operations</div>
      </div>

      <div className="preview-section">
        <div className="preview-section-label display">selection</div>
        <div className="preview-strip">
          {thumbs.map((item) => {
            const thumb = thumbUrl(item.thumbnailPath)
            if (!thumb) return null
            return (
              <button
                key={item.id}
                type="button"
                className="preview-thumb"
                title={item.relativePath}
                onClick={() => setPreviewItemId(item.id)}
              >
                <img src={thumb} alt="" loading="lazy" />
              </button>
            )
          })}
          {overflow > 0 && (
            <span className="batch-overflow" title={`${overflow} more selected`}>
              +{overflow}
            </span>
          )}
          {thumbs.length === 0 && (
            <span className="preview-empty-line">no selected thumbnails</span>
          )}
        </div>
      </div>

      <div className="preview-section">
        <div className="preview-section-label display">tags</div>

        <input
          className="batch-tag-filter"
          type="search"
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
          placeholder="filter tags"
          aria-label="Filter tags"
        />

        <div className="batch-tag-list">
          {visibleTags.map((tag) => {
            const { on, cover } = coverage(tag.name)
            return (
              <div className="batch-tag-row" key={tag.id}>
                <span
                  className={`batch-tag-cover${cover === 'all' ? ' is-all' : cover === 'some' ? ' is-some' : ''}`}
                  aria-hidden="true"
                />
                <span className="batch-tag-name" title={tag.name}>
                  {tag.name}
                </span>
                <span className="batch-tag-count">
                  {on}/{total}
                </span>
                <button
                  type="button"
                  className="batch-tag-add"
                  title={`Add “${tag.name}” to all`}
                  aria-label={`Add tag ${tag.name} to all`}
                  disabled={cover === 'all'}
                  onClick={() => addTag(tag.name)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="batch-tag-remove"
                  title={`Remove “${tag.name}” from all`}
                  aria-label={`Remove tag ${tag.name} from all`}
                  disabled={cover === 'none'}
                  onClick={() => removeTag(tag.name)}
                >
                  −
                </button>
              </div>
            )
          })}
          {visibleTags.length === 0 && (
            <div className="batch-tag-empty">no tags match</div>
          )}
        </div>

        <div className="batch-tag-create">
          <input
            type="text"
            value={newTagName}
            onChange={(event) => setNewTagName(event.target.value)}
            placeholder="add or create tag"
            aria-label="New tag name"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                createAndAdd()
              }
            }}
          />
          <button type="button" onClick={createAndAdd} disabled={!newTagName.trim()}>
            add
          </button>
        </div>
      </div>

      <div className="preview-section">
        <div className="preview-section-label display">triage</div>

        <button
          type="button"
          className={`preview-fav${allFavorite ? ' is-on' : ''}`}
          aria-pressed={allFavorite}
          onClick={() => void batchSet({ favorite: !allFavorite }, { keep: true })}
        >
          <span className="preview-fav-mark" aria-hidden="true" />
          {allFavorite ? 'unfavorite' : 'favorite'}
        </button>

        <div className="preview-rating" role="group" aria-label="Rating">
          <span className="preview-control-label">rating</span>
          <div className="preview-rating-dots">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                className={`preview-rating-dot${rating <= uniformRating ? ' is-on' : ''}`}
                aria-label={`${rating} of 5`}
                aria-pressed={rating === uniformRating}
                onClick={() => setRating(rating)}
              />
            ))}
          </div>
        </div>

        <div className="preview-status" role="group" aria-label="Status">
          <span className="preview-control-label">status</span>
          <div className="preview-status-row">
            {STATUSES.map((status) => (
              <button
                key={status.id}
                type="button"
                className={`preview-status-button${uniformStatus === status.id ? ' is-active' : ''}`}
                data-status={status.id}
                aria-pressed={uniformStatus === status.id}
                onClick={() => setStatus(status.id)}
              >
                {status.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="preview-section preview-actions batch-actions">
        <button
          type="button"
          className="preview-edit-group"
          onClick={() => openCollectionPicker([...selection])}
        >
          Add to collection
        </button>
        <button type="button" className="batch-remove" onClick={remove}>
          Remove
        </button>
        <button type="button" className="batch-clear" onClick={clearSelection}>
          Clear selection
        </button>
      </div>
    </>
  )
}
