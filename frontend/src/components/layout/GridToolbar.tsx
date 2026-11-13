// Grid toolbar — the surface switcher plus grid size/sort controls, sitting
// directly under the search bar in the center column.
import { useStore } from '../../store'
import type { ItemSort, Surface } from '../../types'
import './grid-toolbar.css'

const TABS: ReadonlyArray<{ id: Surface; label: string }> = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'collections', label: 'Collections' },
  { id: 'folders', label: 'Folders' },
  { id: 'tags', label: 'Tags' },
]

const SORTS: ReadonlyArray<{ id: ItemSort; label: string }> = [
  { id: 'time', label: 'Time' },
  { id: 'filename', label: 'Filename' },
  { id: 'size', label: 'Size' },
  { id: 'session', label: 'Session' },
]

export function GridToolbar() {
  const surface = useStore((s) => s.surface)
  const setSurface = useStore((s) => s.setSurface)
  const loadItems = useStore((s) => s.loadItems)
  const setPreviewItemId = useStore((s) => s.setPreviewItemId)
  const sort = useStore((s) => s.sort)
  const setSort = useStore((s) => s.setSort)
  const sortDir = useStore((s) => s.sortDir)
  const setSortDir = useStore((s) => s.setSortDir)
  const cellSize = useStore((s) => s.cellSize)
  const setCellSize = useStore((s) => s.setCellSize)

  const choose = (next: Surface) => {
    setSurface(next)
    setPreviewItemId(null)
    void loadItems()
  }

  return (
    <div className="grid-toolbar">
      <nav className="surface-tabs" aria-label="Surfaces">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`surface-tab${tab.id === surface ? ' is-active' : ''}`}
            aria-current={tab.id === surface ? 'page' : undefined}
            onClick={() => choose(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="toolbar-spacer" />

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
    </div>
  )
}
