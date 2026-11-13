// The browse frame: header + resizable left rail + opaque grid + resizable
// preview. Owns only local frame state (panel widths, visibility).
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import { Header } from './Header'
import { LeftRail } from './LeftRail'
import { Grid } from '../grid/Grid'
import { GalleryViewControls } from '../grid/GalleryViewControls'
import { TimelineCanvas } from '../timeline/TimelineCanvas'
import { BatchToolbar } from '../grid/BatchToolbar'
import { RightPreview } from '../preview/RightPreview'
import { EmptyState } from '../EmptyState'
import { Ingest } from '../ingest/Ingest'
import { Atmosphere } from '../atmosphere/Atmosphere'
import './layout.css'

const RAIL_MIN = 160
const PREVIEW_MIN = 220

function clamp(value: number, min: number, max?: number): number {
  if (max === undefined) return Math.max(min, value)
  return Math.min(max, Math.max(min, value))
}

// A draggable "gilt seam" handle. direction=+1 grows when dragged right (rail's
// right edge); direction=-1 shrinks when dragged right (preview's left edge).
// Clicking the seam (without dragging) collapses the panel it belongs to.
function ResizeHandle({
  direction,
  width,
  min,
  max,
  onResize,
  onCollapse,
  label,
}: {
  direction: 1 | -1
  width: number
  min: number
  max?: number
  onResize: (w: number) => void
  onCollapse: () => void
  label: string
}) {
  // `moved` separates a real drag from a click, so releasing after a resize
  // never collapses the panel.
  const drag = useRef<{ startX: number; startW: number; moved: boolean } | null>(null)

  return (
    <div
      className={`resize-handle${direction === 1 ? ' resize-handle--rail' : ' resize-handle--preview'}`}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(width)}
      title="Click to collapse · drag to resize"
      onPointerDown={(event) => {
        event.preventDefault()
        drag.current = { startX: event.clientX, startW: width, moved: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const d = drag.current
        if (!d) return
        if (Math.abs(event.clientX - d.startX) > 3) d.moved = true
        if (d.moved) {
          onResize(clamp(d.startW + direction * (event.clientX - d.startX), min, max))
        }
      }}
      onPointerUp={() => {
        const d = drag.current
        drag.current = null
        if (d && !d.moved) onCollapse()
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onCollapse()
      }}
    >
      <span className="resize-rule" aria-hidden="true" />
      <span className="resize-tick" aria-hidden="true" />
      <span className="resize-chevron" aria-hidden="true" />
    </div>
  )
}

// A collapsed panel leaves a thin seam you can click to bring it back.
function PanelGrip({
  side,
  label,
  onOpen,
}: {
  side: 'left' | 'right'
  label: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className={`panel-grip panel-grip--${side}`}
      aria-label={label}
      title={label}
      onClick={onOpen}
    >
      <span className="panel-grip-chevron" aria-hidden="true" />
    </button>
  )
}

export function Layout() {
  const [railWidth, setRailWidth] = useState(220)
  const [previewWidth, setPreviewWidth] = useState(300)
  const [railOpen, setRailOpen] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(true)

  const previewItemId = useStore((s) => s.previewItemId)
  const selection = useStore((s) => s.selection)
  const cellSize = useStore((s) => s.cellSize)
  const workspace = useStore((s) => s.workspace)
  const effects = useStore((s) => s.effects)

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
            {showRail &&
              (railOpen ? (
                <>
                  <LeftRail style={{ width: railWidth, flexBasis: railWidth }} />
                  <ResizeHandle
                    direction={1}
                    width={railWidth}
                    min={RAIL_MIN}
                    onResize={setRailWidth}
                    onCollapse={() => setRailOpen(false)}
                    label="Navigation rail seam"
                  />
                </>
              ) : (
                <PanelGrip
                  side="left"
                  label="Open navigation rail"
                  onOpen={() => setRailOpen(true)}
                />
              ))}

            <main className="grid-column">
              {workspace === 'gallery' && (
                <div className="grid-view-bar">
                  <GalleryViewControls />
                </div>
              )}
              <div className="grid-area">
                {workspace === 'gallery' && effects === 'full' && <Atmosphere />}
                {workspace === 'timeline' ? <TimelineCanvas /> : <Grid cellSize={cellSize} />}
                {workspace === 'gallery' && <EmptyState />}
              </div>
              {workspace === 'gallery' && <BatchToolbar />}
            </main>

            {showPreview &&
              (previewOpen ? (
                <>
                  <ResizeHandle
                    direction={-1}
                    width={previewWidth}
                    min={PREVIEW_MIN}
                    onResize={setPreviewWidth}
                    onCollapse={() => setPreviewOpen(false)}
                    label="Preview seam"
                  />
                  <RightPreview style={{ width: previewWidth, flexBasis: previewWidth }} />
                </>
              ) : (
                <PanelGrip
                  side="right"
                  label="Open quick preview"
                  onOpen={() => setPreviewOpen(true)}
                />
              ))}
          </>
        )}
      </div>
    </div>
  )
}
