// Always-visible gallery item controls floating over the grid: zoom (cell size)
// and sort. They live in the main view so they stay in reach without costing
// the gallery any vertical height.
import { useStore } from '../../store'
import type { ItemSort } from '../../types'
import './gallery-view-controls.css'

const SORTS: ReadonlyArray<{ id: ItemSort; label: string }> = [
  { id: 'time', label: 'Time' },
  { id: 'filename', label: 'Filename' },
  { id: 'size', label: 'Size' },
  { id: 'session', label: 'Session' },
]

export function GalleryViewControls() {
  const cellSize = useStore((s) => s.cellSize)
  const setCellSize = useStore((s) => s.setCellSize)
  const sort = useStore((s) => s.sort)
  const setSort = useStore((s) => s.setSort)
  const sortDir = useStore((s) => s.sortDir)
  const setSortDir = useStore((s) => s.setSortDir)

  return (
    <div className="gallery-view-controls" role="group" aria-label="Gallery item view">
      <label className="gallery-control" title="Zoom grid items">
        <span className="gallery-control-label">zoom</span>
        <input
          type="range"
          min={80}
          max={320}
          step={8}
          value={cellSize}
          onChange={(event) => setCellSize(Number(event.target.value))}
          aria-label="Zoom grid items"
        />
      </label>

      <span className="gallery-control-sep" aria-hidden="true" />

      <label className="gallery-control" title="Sort by">
        <span className="gallery-control-label">sort</span>
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
        className="gallery-sort-dir"
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
