// A single grid cell: the only saturated, opaque object on the wall.
// No card chrome, no borders, no shadows. Thumbnail + D22 badges +
// museum-corner selection tick.
import type { CSSProperties } from 'react'
import { useStore } from '../../store'
import { thumbUrl } from '../../api'
import type { Item } from '../../types'
import './grid-cell.css'

interface GridCellProps {
  item: Item
  selected: boolean
  style: CSSProperties
}

/** Deterministic bar heights for the D42 audio placeholder. */
function spectroBars(id: string, count = 22): number[] {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h = (h ^ id.charCodeAt(i)) >>> 0
    h = Math.imul(h, 16777619) >>> 0
  }
  const bars: number[] = []
  for (let i = 0; i < count; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0
    bars.push(18 + (h % 74))
  }
  return bars
}

function PlayGlyph() {
  return (
    <svg className="cell-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5 19 12 8 18.5Z" fill="currentColor" />
    </svg>
  )
}

function MissingGlyph() {
  return (
    <svg className="cell-glyph is-danger" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h14v14H5Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m6 18 12-12" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function Placeholder({ item }: { item: Item }) {
  if (item.state === 'missing') {
    return (
      <span className="cell-placeholder is-missing">
        <MissingGlyph />
        <span className="cell-danger-tick" aria-hidden="true" />
      </span>
    )
  }
  if (item.kind === 'video') {
    return (
      <span className="cell-placeholder">
        <PlayGlyph />
      </span>
    )
  }
  if (item.kind === 'audio') {
    const bars = spectroBars(item.id)
    return (
      <span className="cell-placeholder is-audio">
        <span className="spectro" aria-hidden="true">
          {bars.map((height, i) => (
            <span key={i} className="spectro-bar" style={{ height: `${height}%` }} />
          ))}
        </span>
      </span>
    )
  }
  return (
    <span className="cell-placeholder">
      <span className="cell-placeholder-frame" aria-hidden="true" />
    </span>
  )
}

function RatingDots({ rating }: { rating: number }) {
  return (
    <span className="cell-rating" aria-label={`${rating} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`rating-dot${n <= rating ? ' is-on' : ''}`} />
      ))}
    </span>
  )
}

export function GridCell({ item, selected, style }: GridCellProps) {
  const setSelected = useStore((s) => s.setSelected)
  const selectRange = useStore((s) => s.selectRange)
  const setPreviewItemId = useStore((s) => s.setPreviewItemId)
  const openInspector = useStore((s) => s.openInspector)

  const thumb = thumbUrl(item.thumbnailPath)
  const canShowThumb = Boolean(thumb) && item.state !== 'missing'

  return (
    <button
      type="button"
      className={`grid-cell${selected ? ' is-selected' : ''}`}
      style={style}
      aria-pressed={selected}
      aria-label={`${item.kind} ${item.relativePath}`}
      title={item.relativePath}
      onClick={(event) => {
        setPreviewItemId(item.id)
        if (event.shiftKey) {
          selectRange(item.id)
        } else {
          setSelected(item.id, event.ctrlKey || event.metaKey || event.altKey)
        }
      }}
      onDoubleClick={() => {
        void openInspector('item', item.id)
      }}
    >
      {canShowThumb && thumb ? (
        <img className="cell-thumb" src={thumb} alt="" loading="lazy" draggable={false} />
      ) : (
        <Placeholder item={item} />
      )}

      <span className="cell-hover" aria-hidden="true" />

      {item.favorite && <span className="cell-fav" aria-hidden="true" title="favorite" />}

      <span className="cell-meta">
        <span
          className={`cell-status status-${item.status}`}
          aria-hidden="true"
          title={item.status}
        />
        {item.rating > 0 && <RatingDots rating={item.rating} />}
      </span>

      {selected && <span className="cell-tick" aria-hidden="true" />}
    </button>
  )
}
