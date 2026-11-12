// The browse frame: header + resizable left rail + opaque grid (search bar and
// toolbar) + resizable preview + footer. Owns only local frame state (panel
// widths, visibility).
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import { Header } from './Header'
import { LeftRail } from './LeftRail'
import { SearchBar } from '../search/SearchBar'
import { GridToolbar } from './GridToolbar'
import { Grid } from '../grid/Grid'
import { TimelineCanvas } from '../timeline/TimelineCanvas'
import { BatchToolbar } from '../grid/BatchToolbar'
import { RightPreview } from '../preview/RightPreview'
import { EmptyState } from '../EmptyState'
import { Ingest } from '../ingest/Ingest'
import './layout.css'

const RAIL_MIN = 160
const PREVIEW_MIN = 220

function clamp(value: number, min: number, max?: number): number {
  if (max === undefined) return Math.max(min, value)
  return Math.min(max, Math.max(min, value))
}

// A draggable "gilt seam" handle. direction=+1 grows when dragged right (rail's
// right edge); direction=-1 shrinks when dragged right (preview's left edge).
function ResizeHandle({
  direction,
  width,
  min,
  max,
  onResize,
  label,
}: {
  direction: 1 | -1
  width: number
  min: number
  max?: number
  onResize: (w: number) => void
  label: string
}) {
  const drag = useRef<{ startX: number; startW: number } | null>(null)

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(width)}
      onPointerDown={(event) => {
        event.preventDefault()
        drag.current = { startX: event.clientX, startW: width }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const d = drag.current
        if (!d) return
        onResize(clamp(d.startW + direction * (event.clientX - d.startX), min, max))
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
    >
      <span className="resize-rule" aria-hidden="true" />
      <span className="resize-tick" aria-hidden="true" />
    </div>
  )
}

export function Layout() {
  const [railWidth, setRailWidth] = useState(220)
  const [previewWidth, setPreviewWidth] = useState(300)
  const [railOpen, setRailOpen] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(true)

  const previewItemId = useStore((s) => s.previewItemId)
  const selection = useStore((s) => s.selection)
  const itemsTotal = useStore((s) => s.itemsTotal)
  const items = useStore((s) => s.items)
  const loading = useStore((s) => s.loadingItems)
  const cellSize = useStore((s) => s.cellSize)
  const workspace = useStore((s) => s.workspace)

  // Selecting anything should reveal the quick preview even if it was closed.
  useEffect(() => {
    if (previewItemId || selection.length > 0) setPreviewOpen(true)
  }, [previewItemId, selection])

  // Panel toggles: p = preview, [ = rail. Ignored while typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      if (event.key === 'p') {
        event.preventDefault()
        setPreviewOpen((open) => !open)
      } else if (event.key === '[') {
        event.preventDefault()
        setRailOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const shown = !loading && items.length < itemsTotal
  const showRail = workspace === 'gallery'
  const showPreview = workspace !== 'ingest'

  return (
    <div className="app-frame">
      <Header />

      <div className="frame-body">
        {workspace === 'ingest' ? (
          <Ingest />
        ) : (
          <>
            {showRail && railOpen && (
              <>
                <LeftRail style={{ width: railWidth, flexBasis: railWidth }} />
                <ResizeHandle
                  direction={1}
                  width={railWidth}
                  min={RAIL_MIN}
                  onResize={setRailWidth}
                  label="Resize navigation rail"
                />
              </>
            )}

            <main className="grid-column">
              <SearchBar />
              {workspace === 'gallery' && <GridToolbar />}
              <div className="grid-area">
                {workspace === 'timeline' ? <TimelineCanvas /> : <Grid cellSize={cellSize} />}
                {workspace === 'gallery' && <EmptyState />}
              </div>
              {workspace === 'gallery' && <BatchToolbar />}
            </main>

            {showPreview && previewOpen && (
              <>
                <ResizeHandle
                  direction={-1}
                  width={previewWidth}
                  min={PREVIEW_MIN}
                  onResize={setPreviewWidth}
                  label="Resize preview panel"
                />
                <RightPreview style={{ width: previewWidth, flexBasis: previewWidth }} />
              </>
            )}
          </>
        )}
      </div>

      <footer className="app-footer chrome">
        <div className="footer-count" aria-live="polite">
          {loading ? 'loading' : `${itemsTotal} ${itemsTotal === 1 ? 'item' : 'items'}`}
          {shown ? ` · ${items.length} shown` : ''}
        </div>

        <div className="footer-toggles">
          {showRail && (
            <button
              type="button"
              className={railOpen ? 'is-active' : ''}
              aria-pressed={railOpen}
              onClick={() => setRailOpen((open) => !open)}
            >
              rail
            </button>
          )}
          {showPreview && (
            <button
              type="button"
              className={previewOpen ? 'is-active' : ''}
              aria-pressed={previewOpen}
              onClick={() => setPreviewOpen((open) => !open)}
            >
              preview
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
