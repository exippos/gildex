// Header utility strip — item count and panel toggles. The gallery's item
// controls (zoom/sort) live in the grid itself, so this stays out of the way.
import { useStore } from '../../store'
import './grid-toolbar.css'

export function GridToolbar({
  showRail,
  railOpen,
  previewOpen,
  onToggleRail,
  onTogglePreview,
}: {
  /** The rail only exists in the gallery workspace. */
  showRail: boolean
  railOpen: boolean
  previewOpen: boolean
  onToggleRail: () => void
  onTogglePreview: () => void
}) {
  const itemsTotal = useStore((s) => s.itemsTotal)
  const items = useStore((s) => s.items)
  const loading = useStore((s) => s.loadingItems)

  const shown = !loading && items.length < itemsTotal

  return (
    <div className="grid-toolbar">
      <div className="toolbar-count" aria-live="polite">
        {loading ? 'loading' : `${itemsTotal} ${itemsTotal === 1 ? 'item' : 'items'}`}
        {shown ? ` · ${items.length} shown` : ''}
      </div>

      <span className="toolbar-spacer" />

      <div className="toolbar-toggles">
        {showRail && (
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
