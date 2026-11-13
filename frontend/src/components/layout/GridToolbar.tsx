// Gallery view controls — grid size/sort, item count and panel toggles. They
// live in the header's hover-reveal strip so the gallery keeps its full height.
import { useStore } from '../../store'
import type { ItemSort } from '../../types'
import './grid-toolbar.css'

const SORTS: ReadonlyArray<{ id: ItemSort; label: string }> = [
  { id: 'time', label: 'Time' },
  { id: 'filename', label: 'Filename' },
  { id: 'size', label: 'Size' },
  { id: 'session', label: 'Session' },
]

export function GridToolbar({
  railOpen,
  previewOpen,
  gridControls,
  onToggleRail,
  onTogglePreview,
}: {
  railOpen: boolean
  previewOpen: boolean
  /** Size/sort only apply to the gallery grid, not the timeline canvas. */
  gridControls: boolean
  onToggleRail: () => void
  onTogglePreview: () => void
}) {
  const sort = useStore((s) => s.sort)
  const setSort = useStore((s) => s.setSort)
  const sortDir = useStore((s) => s.sortDir)
  const setSortDir = useStore((s) => s.setSortDir)
  const cellSize = useStore((s) => s.cellSize)
  const setCellSize = useStore((s) => s.setCellSize)
  const itemsTotal = useStore((s) => s.itemsTotal)
  const items = useStore((s) => s.items)
  const loading = useStore((s) => s.loadingItems)

  const shown = !loading && items.length < itemsTotal

  return (
    <div className="grid-toolbar">
      {gridControls && (
        <>
          <label className="size-control" title="Grid item size">
            <span className="control-label">size</span>
            <input
              type="range"
              min={80}
              max={320}
              step={8}
              value={cellSize}
              onChange={(event) => setCellSize(Number(event.target.value))}
              aria-label="Grid item size"
            />
          </label>

          <label className="sort-control" title="Sort by">
            <span className="control-label">sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ItemSort)}
              aria-label="Sort by"
            >
              {SORTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="sort-dir"
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            title={sortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}
            aria-label="Toggle sort direction"
            aria-pressed={sortDir === 'asc'}
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </>
      )}

      <span className="toolbar-spacer" />

      <div className="toolbar-count" aria-live="polite">
        {loading ? 'loading' : `${itemsTotal} ${itemsTotal === 1 ? 'item' : 'items'}`}
        {shown ? ` · ${items.length} shown` : ''}
      </div>

      <div className="toolbar-toggles">
        {gridControls && (
          <button
            type="button"
            className={railOpen ? 'is-active' : ''}
            aria-pressed={railOpen}
            onClick={onToggleRail}
          >
            rail
          </button>
        )}
        <button
          type="button"
          className={previewOpen ? 'is-active' : ''}
          aria-pressed={previewOpen}
          onClick={onTogglePreview}
        >
          preview
        </button>
      </div>
    </div>
  )
}
