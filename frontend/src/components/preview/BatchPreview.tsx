// Batch preview (right panel) — appears when two or more items are selected.
// Persistent batch surface: tag without the menu closing, plus triage and
// destructive actions. Mirrors the floating BatchToolbar but stays open.
import { useMemo } from 'react'
import { thumbUrl } from '../../api'
import { resolveItems, useStore } from '../../store'
import type { Status } from '../../types'
import { STATUSES } from '../grid/statuses'
import { TagEditor } from './TagEditor'
import './batch-preview.css'

const MAX_THUMBS = 12

export function BatchPreview() {
  const selection = useStore((s) => s.selection)
  const items = useStore((s) => s.items)
  const groupItems = useStore((s) => s.groupItems)
  const tags = useStore((s) => s.tags)
  const batchTag = useStore((s) => s.batchTag)
  const batchSet = useStore((s) => s.batchSet)
  const batchRemove = useStore((s) => s.batchRemove)
  const clearSelection = useStore((s) => s.clearSelection)
  const openCollectionPicker = useStore((s) => s.openCollectionPicker)
  const setPreviewItemId = useStore((s) => s.setPreviewItemId)

  // Expanded session/collection tiles render from the group caches, so a
  // selection may hold ids that are absent from the main `items` page.
  const selectedItems = useMemo(
    () => resolveItems(items, groupItems, selection),
    [items, groupItems, selection],
  )

  const count = selection.length
  const total = selectedItems.length

  const onCount = (tagName: string) => {
    let on = 0
    for (const item of selectedItems) {
      if (item.tags.includes(tagName)) on++
    }
    return on
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
        <TagEditor
          tags={tags}
          stateFor={(name) => ({ on: onCount(name), total })}
          onAdd={(name) => void batchTag([name], [], { keep: true })}
          onRemove={(name) => void batchTag([], [name], { keep: true })}
          showCounts
        />
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
