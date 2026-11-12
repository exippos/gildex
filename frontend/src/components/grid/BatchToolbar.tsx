// Floating batch toolbar (D24) — appears whenever the selection is non-empty.
// Opaque chip, flat, no blur (not fixed chrome).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store'
import type { Status } from '../../types'
import { TagPicker } from './TagPicker'
import './batch-toolbar.css'

type Popover = 'tag' | 'rate' | 'status' | null

const STATUSES: ReadonlyArray<{ id: Status; label: string }> = [
  { id: 'draft', label: 'draft' },
  { id: 'wip', label: 'wip' },
  { id: 'final', label: 'final' },
]

export function BatchToolbar() {
  const selection = useStore((s) => s.selection)
  const items = useStore((s) => s.items)
  const batchSet = useStore((s) => s.batchSet)
  const batchRemove = useStore((s) => s.batchRemove)
  const clearSelection = useStore((s) => s.clearSelection)
  const openCollectionPicker = useStore((s) => s.openCollectionPicker)

  const [popover, setPopover] = useState<Popover>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!popover) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setPopover(null)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPopover(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [popover])

  const allFavorite = useMemo(() => {
    if (selection.length === 0) return false
    const selected = new Set(selection)
    const selItems = items.filter((item) => selected.has(item.id))
    return selItems.length > 0 && selItems.every((item) => item.favorite)
  }, [selection, items])

  if (selection.length === 0) return null

  const count = selection.length

  const setFavorite = () => {
    void batchSet({ favorite: !allFavorite })
  }

  const setRating = (rating: number) => {
    setPopover(null)
    void batchSet({ rating })
  }

  const setStatus = (status: Status) => {
    setPopover(null)
    void batchSet({ status })
  }

  const remove = () => {
    const ok = window.confirm(
      `Remove ${count} ${count === 1 ? 'item' : 'items'} from the catalog?\n\nFiles stay on disk; they can be imported again.`,
    )
    if (ok) void batchRemove()
  }

  return (
    <div className="batch-toolbar" ref={rootRef} role="toolbar" aria-label="Batch actions">
      <span className="batch-count">
        <span className="batch-count-tick" aria-hidden="true" />
        {count} selected
      </span>

      <span className="batch-divider" aria-hidden="true" />

      <button
        type="button"
        className={`batch-button${popover === 'tag' ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={popover === 'tag'}
        onClick={() => setPopover((p) => (p === 'tag' ? null : 'tag'))}
      >
        Tag
      </button>

      <button
        type="button"
        className="batch-button"
        onClick={() => openCollectionPicker([...selection])}
      >
        Add to collection
      </button>

      <button type="button" className="batch-button" onClick={setFavorite}>
        {allFavorite ? 'Unfavorite' : 'Favorite'}
      </button>

      <button
        type="button"
        className={`batch-button${popover === 'rate' ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={popover === 'rate'}
        onClick={() => setPopover((p) => (p === 'rate' ? null : 'rate'))}
      >
        Rate
      </button>

      <button
        type="button"
        className={`batch-button${popover === 'status' ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={popover === 'status'}
        onClick={() => setPopover((p) => (p === 'status' ? null : 'status'))}
      >
        Status
      </button>

      <span className="batch-divider" aria-hidden="true" />

      <button type="button" className="batch-button is-danger" onClick={remove}>
        Remove
      </button>

      <button type="button" className="batch-button batch-clear" onClick={clearSelection}>
        Clear
      </button>

      {popover === 'tag' && <TagPicker onClose={() => setPopover(null)} />}

      {popover === 'rate' && (
        <div className="batch-popover batch-rate" role="menu" aria-label="Set rating">
          <span className="batch-popover-label">rating</span>
          <div className="batch-rate-row">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                className="batch-rate-dot"
                aria-label={`${rating} of 5`}
                onClick={() => setRating(rating)}
              >
                {rating}
              </button>
            ))}
          </div>
          <button type="button" className="batch-popover-link" onClick={() => setRating(0)}>
            clear rating
          </button>
        </div>
      )}

      {popover === 'status' && (
        <div className="batch-popover batch-status" role="menu" aria-label="Set status">
          <span className="batch-popover-label">status</span>
          {STATUSES.map((status) => (
            <button
              key={status.id}
              type="button"
              className="batch-status-option"
              data-status={status.id}
              onClick={() => setStatus(status.id)}
            >
              <span className={`cell-status status-${status.id}`} aria-hidden="true" />
              {status.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
