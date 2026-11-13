// Virtualized item grid. Renders only the rows in (and just around) the
// viewport, absolutely positioned over a tall canvas, so thousands of items
// scroll smoothly. In the sessions-all view each session renders as a collapsed
// card that expands in place to reveal its items.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store'
import { thumbUrl } from '../../api'
import type { Item, Session } from '../../types'
import { GridCell } from './GridCell'
import { formatRange } from '../format'
import './grid.css'

const PAD_X = 16
const PAD_Y = 12
const GUTTER = 8
const CARD_H = 60
const OVERSCAN_ROWS = 2

interface ItemRow {
  key: string
  type: 'items'
  items: Item[]
  y: number
  h: number
}

interface SessionGroup {
  key: string
  label: string
  range: string
  count: number
  thumb: string
  kind: Item['kind']
  items: Item[]
}

interface CardRow {
  key: string
  type: 'card'
  group: SessionGroup
  y: number
  h: number
}

type Row = CardRow | ItemRow

function groupSessions(items: Item[], sessions: Session[]): SessionGroup[] {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const out: SessionGroup[] = []
  let i = 0
  while (i < items.length) {
    const sessionId = items[i].sessionId
    let j = i
    while (j < items.length && items[j].sessionId === sessionId) j += 1

    const group = items.slice(i, j)
    const session = sessionId ? byId.get(sessionId) : undefined
    const times = group.map((it) => it.timestamp)
    const poster = group[0]
    out.push({
      key: `${sessionId ?? 'unsorted'}-${i}`,
      label: session?.label ?? (sessionId ?? 'Unsorted'),
      range: formatRange(Math.min(...times), Math.max(...times)),
      count: group.length,
      thumb: session?.thumbnailPath || poster.thumbnailPath,
      kind: poster.kind,
      items: group,
    })
    i = j
  }
  return out
}

export function Grid({ cellSize }: { cellSize: number }) {
  const items = useStore((s) => s.items)
  const surface = useStore((s) => s.surface)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const activeCollectionId = useStore((s) => s.activeCollectionId)
  const activeFolder = useStore((s) => s.activeFolder)
  const search = useStore((s) => s.search)
  const activeTagFilters = useStore((s) => s.activeTagFilters)
  const sessions = useStore((s) => s.sessions)
  const selection = useStore((s) => s.selection)
  const loading = useStore((s) => s.loadingItems)
  const clearSelection = useStore((s) => s.clearSelection)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)

  const [width, setWidth] = useState(0)
  const [viewportH, setViewportH] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      setWidth(el.clientWidth)
      setViewportH(el.clientHeight)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Reset scroll when the query changes underneath the grid.
  const queryKey = `${surface}|${activeSessionId}|${activeCollectionId}|${activeFolder}|${search}|${activeTagFilters.join(',')}`
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = 0
    setScrollTop(0)
  }, [queryKey, cellSize])

  // Collapse all session cards when the query changes.
  useEffect(() => {
    setExpanded(new Set())
  }, [queryKey])

  // Escape or losing focus clears the selection (wired here, once).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearSelection()
    }
    const onBlur = () => clearSelection()
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [clearSelection])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const handleScroll = () => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const el = scrollRef.current
      if (el) setScrollTop(el.scrollTop)
    })
  }

  const cols = Math.max(
    1,
    Math.floor((Math.max(width, 1) - PAD_X * 2 + GUTTER) / (cellSize + GUTTER)),
  )
  const cellW =
    width > 0
      ? Math.max(40, (width - PAD_X * 2 - GUTTER * (cols - 1)) / cols)
      : cellSize
  const rowStep = cellW + GUTTER
  const grouped = surface === 'sessions' && activeSessionId === null

  const groups = useMemo(
    () => (grouped ? groupSessions(items, sessions) : []),
    [grouped, items, sessions],
  )

  const layout = useMemo(() => {
    const rows: Row[] = []
    let y = PAD_Y
    if (grouped) {
      for (const group of groups) {
        rows.push({ key: `card-${group.key}`, type: 'card', group, y, h: CARD_H })
        y += CARD_H
        if (expanded.has(group.key)) {
          for (let k = 0; k < group.items.length; k += cols) {
            rows.push({
              key: `r-${group.key}-${k}`,
              type: 'items',
              items: group.items.slice(k, k + cols),
              y,
              h: cellW,
            })
            y += rowStep
          }
        }
      }
    } else {
      for (let i = 0; i < items.length; i += cols) {
        rows.push({
          key: `r-${i}`,
          type: 'items',
          items: items.slice(i, i + cols),
          y,
          h: cellW,
        })
        y += rowStep
      }
    }
    const height = Math.max(y - (rows.length ? GUTTER : 0) + PAD_Y, viewportH)
    return { rows, height }
  }, [grouped, groups, items, cols, cellW, rowStep, expanded, viewportH])

  const visible = useMemo(() => {
    if (width <= 0 || viewportH <= 0) return [] as Row[]
    const overscan = rowStep * OVERSCAN_ROWS
    const top = scrollTop - overscan
    const bottom = scrollTop + viewportH + overscan
    return layout.rows.filter((row) => row.y + row.h >= top && row.y <= bottom)
  }, [layout, scrollTop, viewportH, rowStep, width])

  const selectedSet = useMemo(() => new Set(selection), [selection])

  const toggleSession = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="grid-root">
      {loading && (
        <div className="grid-loading" aria-live="polite">
          <span className="grid-loading-tick" aria-hidden="true" />
          loading
        </div>
      )}

      <div
        className="grid-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        onMouseDown={(event) => {
          const target = event.target as HTMLElement
          if (!target.closest('.grid-cell')) clearSelection()
        }}
      >
        <div className="grid-canvas" style={{ height: layout.height }}>
          {width > 0 &&
            visible.map((row) => {
              if (row.type === 'card') {
                const group = row.group
                const isExpanded = expanded.has(group.key)
                return (
                  <button
                    key={row.key}
                    type="button"
                    className={`session-card${isExpanded ? ' is-expanded' : ''}`}
                    style={{ top: row.y, left: PAD_X, right: PAD_X, height: row.h }}
                    aria-expanded={isExpanded}
                    onClick={() => toggleSession(group.key)}
                  >
                    <span className="session-card-thumb" aria-hidden="true">
                      {group.thumb ? (
                        <img
                          src={thumbUrl(group.thumb)!}
                          alt=""
                          loading="lazy"
                          draggable={false}
                        />
                      ) : group.kind === 'video' ? (
                        <svg viewBox="0 0 24 24">
                          <path d="M8 5.5 19 12 8 18.5Z" fill="currentColor" />
                        </svg>
                      ) : group.kind === 'audio' ? (
                        <span className="session-card-audio">
                          <span />
                          <span />
                          <span />
                          <span />
                        </span>
                      ) : (
                        <span className="session-card-frame" />
                      )}
                    </span>
                    <span className="session-card-body">
                      <span className="session-card-label display">{group.label}</span>
                      <span className="session-card-meta">
                        {group.range && <span>{group.range}</span>}
                        <span>
                          {group.count} {group.count === 1 ? 'item' : 'items'}
                        </span>
                      </span>
                    </span>
                    <span className="session-card-chevron" aria-hidden="true" />
                  </button>
                )
              }
              return row.items.map((item, index) => (
                <GridCell
                  key={item.id}
                  item={item}
                  selected={selectedSet.has(item.id)}
                  style={{
                    top: row.y,
                    left: PAD_X + index * (cellW + GUTTER),
                    width: cellW,
                    height: row.h,
                  }}
                />
              ))
            })}

          {!loading && items.length === 0 && (
            <div className="grid-empty">
              <span className="display">no items in this view</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
