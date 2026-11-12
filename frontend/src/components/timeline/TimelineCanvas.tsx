// Horizontal broken-axis timeline for the Timeline surface.
//
// - Items are quantized into 1-hour buckets, one node per bucket, ascending.
// - Large empty stretches (gaps > COLLAPSE_MS) collapse into compact break
//   markers, so bursts of activity pack tightly instead of floating in space.
// - Wheel zooms (centered on the cursor); drag pans; buttons zoom/fit.
// - Adaptive density: when an hour is wide enough, each bucket renders as a fanned
//   stack of its newest thumbnails; when hours get tight, buckets fall back to an
//   hourly histogram anchored to the bottom of the viewport.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { thumbUrl } from '../../api'
import { useStore } from '../../store'
import type { Item } from '../../types'
import { formatDate, formatTime } from '../format'
import './timeline-canvas.css'

const MIN_PX_PER_MS = 1e-7 // ≈ 8.6 px per day
const MAX_PX_PER_MS = 1 // 1 px per ms

const HOUR_MS = 3_600_000
const COLLAPSE_MS = 2 * HOUR_MS // gaps wider than this collapse into a break
const BREAK_W = 44 // fixed px width of a collapsed gap marker
const PAD = 12 // left/right padding px

const MAX_LAYERS = 4 // images per fanned stack
const LAYER_OFFSET = 3 // diagonal px between stacked images
const LABEL_MIN_HOUR_PX = 48 // don't render stack labels until an hour is this wide
const MAX_STACK = 240 // cap so a stack never grows absurdly large
const STACK_GAP = 12 // breathing room between a stack and the next bucket

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** Compact duration label for a collapsed gap, e.g. "5 hr", "3 days", "2 wk". */
function formatGap(ms: number): string {
  const minute = 60_000
  if (ms < minute) return '<1 min'
  if (ms < 60 * minute) return `${Math.round(ms / minute)} min`
  const day = 24 * 60 * minute
  if (ms < day) return `${Math.round(ms / (60 * minute))} hr`
  const week = 7 * day
  if (ms < week) {
    const days = Math.round(ms / day)
    return `${days} ${days === 1 ? 'day' : 'days'}`
  }
  if (ms < 30 * day) return `${Math.round(ms / week)} wk`
  if (ms < 365 * day) return `${Math.round(ms / (30 * day))} mo`
  return `${Math.round(ms / (365 * day))} yr`
}

interface HourBucket {
  startMs: number
  items: Item[] // ascending by timestamp
}

interface BreakNode {
  type: 'break'
  x: number // content px
  ms: number // skipped duration
}

interface BucketNode {
  type: 'bucket'
  x: number // content px
  bucket: HourBucket
  newDay: boolean // starts a new calendar day vs the previous bucket
  size: number // layer-image size in px (grows with zoom to fill the next gap)
}

type LayoutNode = BreakNode | BucketNode

interface Layout {
  nodes: LayoutNode[]
  numBreaks: number
  linearMs: number // total NON-collapsed time span (ms)
  totalW: number
}

interface Camera {
  scale: number // px per ms of linear time
  scrollX: number // horizontal scroll in content px
}

function totalWidth(scale: number, numBreaks: number, linearMs: number): number {
  return 2 * PAD + numBreaks * BREAK_W + linearMs * scale
}

/**
 * Walk buckets left-to-right, assigning each a content x. Gaps wider than
 * COLLAPSE_MS become fixed-width break nodes; everything else keeps its linear
 * width at the current scale.
 */
function buildLayout(buckets: HourBucket[], scale: number, sizes: number[]): Layout {
  const nodes: LayoutNode[] = []
  let x = PAD
  let prevEnd: number | null = null
  let prevDay = ''
  let numBreaks = 0
  let linearMs = 0

  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i]
    const date = new Date(bucket.startMs)
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    const newDay = dayKey !== prevDay
    prevDay = dayKey

    if (prevEnd !== null) {
      const gap = bucket.startMs - prevEnd
      if (gap > COLLAPSE_MS) {
        nodes.push({ type: 'break', x, ms: gap })
        x += BREAK_W
        numBreaks += 1
      } else {
        x += gap * scale
        linearMs += gap
      }
    }

    nodes.push({ type: 'bucket', x, bucket, newDay, size: sizes[i] })
    x += HOUR_MS * scale
    linearMs += HOUR_MS
    prevEnd = bucket.startMs + HOUR_MS
  }

  return { nodes, numBreaks, linearMs, totalW: x + PAD }
}

/** Solve the broken-axis width equation for the scale that fits the viewport. */
function fitScale(width: number, numBreaks: number, linearMs: number): number {
  const available = width - 2 * PAD - numBreaks * BREAK_W
  if (linearMs <= 0 || available <= 0) return MIN_PX_PER_MS
  return clamp(available / linearMs, MIN_PX_PER_MS, MAX_PX_PER_MS)
}

/**
 * Zoom about a cursor position, keeping the same fractional content position
 * under the cursor as the axis stretches/shrinks.
 */
function zoomCamera(
  camera: Camera,
  factor: number,
  cursorX: number,
  width: number,
  numBreaks: number,
  linearMs: number,
): Camera {
  const scale = clamp(camera.scale * factor, MIN_PX_PER_MS, MAX_PX_PER_MS)
  const oldTotal = totalWidth(camera.scale, numBreaks, linearMs)
  const nextTotal = totalWidth(scale, numBreaks, linearMs)
  const contentX = camera.scrollX + cursorX
  const ratio = oldTotal > 0 ? nextTotal / oldTotal : 1
  const scrollX = clamp(
    contentX * ratio - cursorX,
    0,
    Math.max(0, nextTotal - width),
  )
  return { scale, scrollX }
}

export function TimelineCanvas() {
  const items = useStore((s) => s.items)
  const previewItemId = useStore((s) => s.previewItemId)
  const setPreviewItemId = useStore((s) => s.setPreviewItemId)
  const openInspector = useStore((s) => s.openInspector)
  const cellSize = useStore((s) => s.cellSize)

  const minStack = clamp(Math.round(cellSize * 0.35), 28, 64)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ x: number; scrollX: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [camera, setCamera] = useState<Camera>({ scale: MIN_PX_PER_MS, scrollX: 0 })

  // Measure the viewport (and re-flow the camera on resize).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => {
      setWidth(el.clientWidth)
      setHeight(el.clientHeight)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Sorted by time ascending; the timeline is inherently time-ordered.
  const sorted = useMemo(() => [...items].sort((a, b) => a.timestamp - b.timestamp), [items])
  const minTs = sorted.length ? sorted[0].timestamp : 0
  const maxTs = sorted.length ? sorted[sorted.length - 1].timestamp : 0

  // ---- quantize into 1-hour buckets ----
  const buckets = useMemo(() => {
    const out: HourBucket[] = []
    for (const item of sorted) {
      const startMs = Math.floor(item.timestamp / HOUR_MS) * HOUR_MS
      const last = out[out.length - 1]
      if (last && last.startMs === startMs) last.items.push(item)
      else out.push({ startMs, items: [item] })
    }
    return out
  }, [sorted])

  // ---- broken-axis layout (content px + affine width stats) ----
  const sizes = useMemo(
    () =>
      buckets.map((bucket, i) => {
        const next = buckets[i + 1]
        if (!next) return minStack
        const startDiff = next.startMs - bucket.startMs
        // Don't grow into a collapsed break; otherwise fill the gap to the next bucket.
        if (startDiff - HOUR_MS > COLLAPSE_MS) return minStack
        return clamp(startDiff * camera.scale - STACK_GAP, minStack, MAX_STACK)
      }),
    [buckets, camera.scale, minStack],
  )
  const layout = useMemo(
    () => buildLayout(buckets, camera.scale, sizes),
    [buckets, camera.scale, sizes],
  )
  const { numBreaks, linearMs, totalW } = layout

  // Auto-fit once when the data set changes.
  const domainKey = `${minTs}-${maxTs}-${items.length}`
  const fittedDomain = useRef('')
  useEffect(() => {
    if (width <= 0 || items.length === 0) return
    if (fittedDomain.current === domainKey) return
    fittedDomain.current = domainKey
    setCamera({ scale: fitScale(width, numBreaks, linearMs), scrollX: 0 })
  }, [domainKey, width, numBreaks, linearMs, items.length])

  // Keep the scroll offset legal when the viewport or layout shrinks.
  useEffect(() => {
    setCamera((c) => {
      const maxScroll = Math.max(0, totalWidth(c.scale, numBreaks, linearMs) - width)
      return c.scrollX > maxScroll ? { ...c, scrollX: maxScroll } : c
    })
  }, [width, numBreaks, linearMs])

  const fit = () => {
    if (width <= 0 || items.length === 0) return
    setCamera({ scale: fitScale(width, numBreaks, linearMs), scrollX: 0 })
  }
  const zoomBy = (factor: number) => {
    setCamera((c) => zoomCamera(c, factor, width / 2, width, numBreaks, linearMs))
  }

  // Wheel zoom, centered on the cursor (non-passive so we can preventDefault).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const cursorX = event.clientX - rect.left
      const factor = Math.exp(-event.deltaY * 0.0016)
      setCamera((c) => zoomCamera(c, factor, cursorX, width, numBreaks, linearMs))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [width, numBreaks, linearMs])

  // ---- density: fanned stacks when hours have room, else histogram ----
  const hourPx = HOUR_MS * camera.scale
  const stacking = hourPx >= minStack + 6
  const showStackLabels = hourPx >= LABEL_MIN_HOUR_PX

  // Only lay out (and render) nodes near the viewport.
  const visibleNodes = useMemo(() => {
    if (width <= 0) return []
    const pad = minStack + 64
    return layout.nodes.filter((node) => {
      const nodeW = node.type === 'break' ? BREAK_W : hourPx
      const screenX = node.x - camera.scrollX
      return screenX + nodeW >= -pad && screenX <= width + pad
    })
  }, [layout.nodes, camera.scrollX, width, minStack, hourPx])

  const maxCount = useMemo(
    () => buckets.reduce((m, b) => Math.max(m, b.items.length), 0),
    [buckets],
  )

  return (
    <div className="timeline">
      <div
        ref={viewportRef}
        className={`timeline-viewport${dragging ? ' is-dragging' : ''}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          dragRef.current = { x: event.clientX, scrollX: camera.scrollX }
          setDragging(true)
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const d = dragRef.current
          if (!d) return
          const maxScroll = Math.max(0, totalW - width)
          const scrollX = clamp(d.scrollX - (event.clientX - d.x), 0, maxScroll)
          setCamera((c) => ({ ...c, scrollX }))
        }}
        onPointerUp={() => {
          dragRef.current = null
          setDragging(false)
        }}
        onPointerCancel={() => {
          dragRef.current = null
          setDragging(false)
        }}
      >
        {visibleNodes.map((node) => {
          const screenX = node.x - camera.scrollX

          if (node.type === 'break') {
            return (
              <div
                key={`break-${node.x}`}
                className="timeline-break"
                style={{ left: screenX, width: BREAK_W }}
                aria-hidden="true"
              >
                <span className="timeline-break-rule" />
                <span className="timeline-break-label">{formatGap(node.ms)}</span>
              </div>
            )
          }

          const bucket = node.bucket

          if (!stacking) {
            const barH = Math.max(
              2,
              (bucket.items.length / maxCount) * Math.max(12, height - 24),
            )
            return (
              <div
                key={bucket.startMs}
                className="timeline-histogram"
                style={{
                  left: screenX,
                  width: Math.max(2, Math.min(6, hourPx - 1)),
                  height: barH,
                  bottom: 8,
                }}
                title={`${bucket.items.length} ${bucket.items.length === 1 ? 'item' : 'items'}`}
              />
            )
          }

          // Up to 4 layers, newest first: older images peek out bottom-right.
          const layers = bucket.items.slice(-MAX_LAYERS).reverse()
          const size = node.size + (layers.length - 1) * LAYER_OFFSET
          const top = Math.max(0, (height - size) / 2)
          const newest = layers[0]
          const active =
            previewItemId !== null && bucket.items.some((item) => item.id === previewItemId)
          return (
            <Fragment key={bucket.startMs}>
              <button
                type="button"
                className={`timeline-stack${active ? ' is-active' : ''}`}
                style={{ left: screenX, top, width: size, height: size }}
                title={newest.relativePath}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setPreviewItemId(newest.id)}
                onDoubleClick={() => void openInspector('item', newest.id)}
              >
                {layers.map((item, i) => {
                  const src = thumbUrl(item.thumbnailPath)
                  const layerStyle = {
                    left: i * LAYER_OFFSET,
                    top: i * LAYER_OFFSET,
                    width: node.size,
                    height: node.size,
                    zIndex: layers.length - i,
                  }
                  return src ? (
                    <img
                      key={item.id}
                      className={`timeline-stack-img${i === 0 ? ' is-top' : ''}`}
                      style={layerStyle}
                      src={src}
                      alt=""
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
                    <span
                      key={item.id}
                      className="timeline-stack-img timeline-stack-ph"
                      style={layerStyle}
                    >
                      {item.kind[0]}
                    </span>
                  )
                })}
                {bucket.items.length > 1 && (
                  <span className="timeline-stack-count">{bucket.items.length}</span>
                )}
              </button>
              {showStackLabels && (
                <span
                  className="timeline-stack-label"
                  style={{ left: screenX + size / 2, top: top + size + 4 }}
                >
                  {node.newDay ? formatDate(bucket.startMs) : formatTime(bucket.startMs)}
                </span>
              )}
            </Fragment>
          )
        })}

        {items.length === 0 && <div className="timeline-empty display">no items in this view</div>}
      </div>

      <div className="timeline-controls" role="group" aria-label="Timeline zoom">
        <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => zoomBy(1.4)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={fit} aria-label="Fit timeline">
          fit
        </button>
      </div>
    </div>
  )
}
