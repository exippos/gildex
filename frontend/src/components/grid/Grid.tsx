// Virtualized item grid. Renders only the rows in (and just around) the
// viewport, absolutely positioned over a tall canvas, so thousands of items
// scroll smoothly. In group views (sessions / collections with nothing
// selected) each group is a stacked tile; expanding one spills its items into
// the shared grid flow instead of giving them a block of their own.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { collectionItemsKey, useStore } from '../../store'
import { thumbUrl } from '../../api'
import type { Collection, Item, Session } from '../../types'
import { GridCell } from './GridCell'
import { formatRange } from '../format'
import { readDraggedItemIds } from '../groups/drag'
import './grid.css'

const PAD_X = 16
const PAD_Y = 12
const GUTTER = 8
const BAND_PAD = 4
const OVERSCAN_ROWS = 2
const COMPACT_BELOW = 120
// Item cells sit a touch smaller than the group tiles that anchor them.
const ITEM_SCALE = 0.86

type GroupSource = 'session' | 'collection'

interface Group {
  key: string
  source: GroupSource
  id: string
  label: string
  range: string
  /** Items matching the current query (or the catalog count before the first fetch). */
  count: number
  /** Full catalog count, when it differs from the filtered count. */
  total: number
  thumb: string
  fallback: Item['kind'] | null
  items: Item[]
}

type Slot =
  | { kind: 'tile'; key: string; group: Group; open: boolean }
  | { kind: 'cell'; key: string; group: Group | null; item: Item }

interface GridRow {
  key: string
  y: number
  slots: Slot[]
}

interface GroupOutline {
  key: string
  path: string
}

function itemRange(items: Item[]): string {
  if (!items.length) return ''
  let lo = items[0].timestamp
  let hi = lo
  for (const item of items) {
    if (item.timestamp < lo) lo = item.timestamp
    if (item.timestamp > hi) hi = item.timestamp
  }
  return formatRange(lo, hi)
}

function makeGroup(
  source: GroupSource,
  id: string,
  label: string,
  items: Item[],
  thumb: string,
  total?: number,
): Group {
  return {
    key: `${source}:${id || 'unsorted'}`,
    source,
    id,
    label,
    range: itemRange(items),
    count: items.length,
    total: total ?? items.length,
    thumb: thumb || items[0]?.thumbnailPath || '',
    fallback: items[0]?.kind ?? null,
    items,
  }
}

/** Groups items by session in catalog order, keeping unmatched runs visible. */
function sessionGroups(items: Item[], sessions: Session[]): Group[] {
  const bySession = new Map<string, Item[]>()
  const loose: Item[] = []
  for (const item of items) {
    if (!item.sessionId) {
      loose.push(item)
      continue
    }
    const bucket = bySession.get(item.sessionId)
    if (bucket) bucket.push(item)
    else bySession.set(item.sessionId, [item])
  }

  const groups: Group[] = []
  for (const session of sessions) {
    const groupItems = bySession.get(session.id)
    if (!groupItems?.length) continue
    bySession.delete(session.id)
    groups.push(
      makeGroup(
        'session',
        session.id,
        session.label,
        groupItems,
        session.thumbnailPath,
        session.itemCount,
      ),
    )
  }
  // Items whose session is missing from the catalog list still get a tile.
  for (const [id, groupItems] of bySession) {
    groups.push(makeGroup('session', id, id, groupItems, ''))
  }
  if (loose.length) groups.push(makeGroup('session', '', 'Unsorted', loose, ''))
  return groups
}

function collectionGroup(collection: Collection, cached: Item[] | undefined): Group {
  const items = cached ?? []
  const group = makeGroup(
    'collection',
    collection.id,
    collection.name,
    items,
    collection.thumbnailPath,
    collection.itemCount,
  )
  // Before the first fetch there are no items to count, so trust the catalog.
  if (!cached) group.count = collection.itemCount
  return group
}

/**
 * Traces the rectilinear silhouette of an expanded group (tile + items) so it
 * can be drawn as one continuous panel with a single outline, however the group
 * wraps across rows.
 */
function groupOutline(
  key: string,
  startSlot: number,
  endSlot: number,
  cols: number,
  cellW: number,
  rowStep: number,
): GroupOutline {
  const firstRow = Math.floor(startSlot / cols)
  const lastRow = Math.floor(endSlot / cols)
  const segments: Array<{ a: number; b: number }> = []
  for (let row = firstRow; row <= lastRow; row++) {
    const rowStart = row * cols
    segments.push({
      a: Math.max(startSlot, rowStart) - rowStart,
      b: Math.min(endSlot, rowStart + cols - 1) - rowStart,
    })
  }

  const x0 = (a: number) => PAD_X + a * rowStep - BAND_PAD
  const x1 = (b: number) => PAD_X + b * rowStep + cellW + BAND_PAD
  const y0 = (r: number) => PAD_Y + r * rowStep - BAND_PAD
  const y1 = (r: number) => y0(r) + cellW + BAND_PAD * 2

  const points: Array<[number, number]> = []
  points.push([x0(segments[0].a), y0(firstRow)])
  points.push([x1(segments[0].b), y0(firstRow)])
  for (let i = 0; i < segments.length; i++) {
    points.push([x1(segments[i].b), y1(firstRow + i)])
    if (i + 1 < segments.length) points.push([x1(segments[i + 1].b), y1(firstRow + i)])
  }
  points.push([x0(segments[segments.length - 1].a), y1(lastRow)])
  for (let i = segments.length - 1; i >= 0; i--) {
    points.push([x0(segments[i].a), y0(firstRow + i)])
    if (i > 0) points.push([x0(segments[i - 1].a), y0(firstRow + i)])
  }

  const path = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`)
    .join('')
  return { key, path: `${path}Z` }
}

function TileFallback({ kind }: { kind: Item['kind'] | null }) {
  if (kind === 'video') {
    return (
      <svg className="tile-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5.5 19 12 8 18.5Z" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'audio') {
    return (
      <span className="tile-audio" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
    )
  }
  return <span className="tile-frame" aria-hidden="true" />
}

function GroupTile({
  group,
  open,
  loading,
  compact,
  tight,
  style,
  onToggle,
  onDropItems,
}: {
  group: Group
  open: boolean
  loading: boolean
  compact: boolean
  tight: boolean
  style: CSSProperties
  onToggle: () => void
  onDropItems?: (itemIds: string[]) => void
}) {
  const [dropActive, setDropActive] = useState(false)
  const canDrop = Boolean(onDropItems) && Boolean(group.id)
  const poster = group.thumb ? thumbUrl(group.thumb) : null
  const posterStyle = poster
    ? ({ '--tile-art': `url("${poster}")` } as CSSProperties)
    : undefined
  const peeked = group.items
    .filter((item) => item.thumbnailPath)
    .slice(0, 2)
    .map((item) => thumbUrl(item.thumbnailPath)!)
  // Without cached items (a collection before its first expand) repeat the
  // poster so the deck still reads as a stack.
  const deck = peeked.length > 0 ? peeked : poster ? [poster, poster] : []
  const countLabel =
    group.count === group.total
      ? `${group.count} ${group.total === 1 ? 'item' : 'items'}`
      : `${group.count} of ${group.total} items`

  return (
    <button
      type="button"
      className={`group-tile${open ? ' is-open' : ''}${compact ? ' is-compact' : ''}${tight ? ' is-tight' : ''}${dropActive ? ' is-drop-target' : ''}`}
      style={style}
      aria-expanded={open}
      aria-busy={loading || undefined}
      aria-label={`${group.label}, ${group.count} ${group.count === 1 ? 'item' : 'items'}`}
      onClick={onToggle}
      onDragOver={
        canDrop
          ? (event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setDropActive(true)
            }
          : undefined
      }
      onDragLeave={canDrop ? () => setDropActive(false) : undefined}
      onDrop={
        canDrop
          ? (event) => {
              event.preventDefault()
              setDropActive(false)
              const ids = readDraggedItemIds(event.dataTransfer)
              if (ids.length) onDropItems?.(ids)
            }
          : undefined
      }
    >
      {deck.length > 0 && (
        <span className="group-tile-deck" aria-hidden="true">
          {deck.map((src, index) => (
            <img key={`${src}-${index}`} src={src} alt="" loading="lazy" draggable={false} />
          ))}
        </span>
      )}

      <span className="group-tile-poster" style={posterStyle}>
        {poster ? (
          <>
            <img src={poster} alt="" loading="lazy" draggable={false} />
            <span className="group-tile-relief is-light" aria-hidden="true" />
            <span className="group-tile-relief is-shadow" aria-hidden="true" />
          </>
        ) : (
          <TileFallback kind={group.fallback} />
        )}
        <span className="group-tile-scrim" aria-hidden="true" />
        <span className="group-tile-text">
          <span className="group-tile-label display">{group.label}</span>
          <span className="group-tile-meta">
            <span>{countLabel}</span>
            {group.range && <span className="group-tile-range">{group.range}</span>}
          </span>
        </span>
        {loading ? (
          <span className="group-tile-loading" aria-hidden="true" />
        ) : (
          <span className="group-tile-chevron" aria-hidden="true" />
        )}
      </span>
    </button>
  )
}

export function Grid({ cellSize }: { cellSize: number }) {
  const items = useStore((s) => s.items)
  const surface = useStore((s) => s.surface)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const activeCollectionId = useStore((s) => s.activeCollectionId)
  const activeFolder = useStore((s) => s.activeFolder)
  const search = useStore((s) => s.search)
  const sort = useStore((s) => s.sort)
  const sortDir = useStore((s) => s.sortDir)
  const activeTagFilters = useStore((s) => s.activeTagFilters)
  const sessions = useStore((s) => s.sessions)
  const collections = useStore((s) => s.collections)
  const collectionItems = useStore((s) => s.collectionItems)
  const collectionLoading = useStore((s) => s.collectionLoading)
  const loadCollectionItems = useStore((s) => s.loadCollectionItems)
  const selection = useStore((s) => s.selection)
  const loading = useStore((s) => s.loadingItems)
  const clearSelection = useStore((s) => s.clearSelection)
  const addToGroup = useStore((s) => s.addToGroup)

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
  const queryKey = `${surface}|${activeSessionId}|${activeCollectionId}|${activeFolder}|${search}|${activeTagFilters.join(',')}|${sort}|${sortDir}`
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = 0
    setScrollTop(0)
  }, [queryKey, cellSize])

  // Collapse all groups when the query changes.
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

  const cacheKey = (id: string) =>
    collectionItemsKey(id, search, activeTagFilters, sort, sortDir)

  const cols = Math.max(
    1,
    Math.floor((Math.max(width, 1) - PAD_X * 2 + GUTTER) / (cellSize + GUTTER)),
  )
  const cellW =
    width > 0
      ? Math.max(40, (width - PAD_X * 2 - GUTTER * (cols - 1)) / cols)
      : cellSize
  const rowStep = cellW + GUTTER
  const compact = cellW < COMPACT_BELOW
  const tight = cellW < 210

  // Sessions group by their catalog entries; collections only when nothing is
  // selected and no text/tag filter is active, because collection membership is
  // not part of the item payload. Filtered views stay flat rather than showing
  // per-collection counts the query cannot vouch for.
  const collectionTiles =
    surface === 'collections' &&
    activeCollectionId === null &&
    !search.trim() &&
    activeTagFilters.length === 0
  const groupMode: GroupSource | null =
    surface === 'sessions'
      ? activeSessionId === null
        ? 'session'
        : null
      : collectionTiles
        ? 'collection'
        : null

  // An edit can drop a collection's cached page (the group editor or a drop
  // target invalidates it). Refetch any expanded tile that lost its page so
  // the open group keeps showing its items.
  useEffect(() => {
    if (groupMode !== 'collection') return
    for (const key of expanded) {
      if (!key.startsWith('collection:')) continue
      const id = key.slice('collection:'.length)
      const keyed = collectionItemsKey(id, search, activeTagFilters, sort, sortDir)
      if (!collectionItems[keyed] && !collectionLoading[keyed]) {
        void loadCollectionItems(id)
      }
    }
  }, [
    groupMode,
    expanded,
    collectionItems,
    collectionLoading,
    search,
    activeTagFilters,
    sort,
    sortDir,
    loadCollectionItems,
  ])

  const itemSize = groupMode ? Math.round(cellW * ITEM_SCALE) : cellW
  const itemInset = (cellW - itemSize) / 2

  const groups = useMemo(() => {
    if (groupMode === 'session') return sessionGroups(items, sessions)
    if (groupMode === 'collection') {
      const out: Group[] = []
      for (const collection of collections) {
        const cached = collectionItems[cacheKey(collection.id)]
        if (collection.itemCount === 0 && !cached?.length) continue
        out.push(collectionGroup(collection, cached))
      }
      return out
    }
    return []
  }, [groupMode, items, sessions, collections, collectionItems, search, activeTagFilters, sort, sortDir])

  const layout = useMemo(() => {
    const slots: Slot[] = []
    const outlines: GroupOutline[] = []
    if (groupMode) {
      for (const group of groups) {
        const open = expanded.has(group.key)
        const start = slots.length
        slots.push({ kind: 'tile', key: `tile:${group.key}`, group, open })
        if (open) {
          for (const item of group.items) {
            slots.push({
              kind: 'cell',
              key: `cell:${group.key}:${item.id}`,
              group,
              item,
            })
          }
          outlines.push(
            groupOutline(group.key, start, slots.length - 1, cols, cellW, rowStep),
          )
        }
      }
    } else {
      for (const item of items) {
        slots.push({ kind: 'cell', key: `cell:${item.id}`, group: null, item })
      }
    }

    const rows: GridRow[] = []
    for (let i = 0; i < slots.length; i += cols) {
      rows.push({
        key: `row-${i}`,
        y: PAD_Y + rows.length * rowStep,
        slots: slots.slice(i, i + cols),
      })
    }

    const height = Math.max(
      rows.length ? PAD_Y + rows.length * rowStep - GUTTER + PAD_Y : PAD_Y * 2,
      viewportH,
    )
    return { rows, outlines, height, empty: slots.length === 0 }
  }, [groupMode, groups, items, cols, cellW, rowStep, expanded, viewportH])

  const visible = useMemo(() => {
    if (width <= 0 || viewportH <= 0) return [] as GridRow[]
    const overscan = rowStep * OVERSCAN_ROWS
    const top = scrollTop - overscan
    const bottom = scrollTop + viewportH + overscan
    return layout.rows.filter((row) => row.y + cellW >= top && row.y <= bottom)
  }, [layout, scrollTop, viewportH, rowStep, cellW, width])

  const selectedSet = useMemo(() => new Set(selection), [selection])

  const toggleGroup = (group: Group) => {
    const open = expanded.has(group.key)
    if (!open && group.source === 'collection' && !collectionItems[cacheKey(group.id)]) {
      void loadCollectionItems(group.id)
    }
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(group.key)) next.delete(group.key)
      else next.add(group.key)
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
          {layout.outlines.length > 0 && (
            <svg
              className="group-layer"
              width="100%"
              height={layout.height}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="group-tint-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
                  <stop offset="1" stopColor="currentColor" stopOpacity="0.18" />
                </linearGradient>
              </defs>
              {layout.outlines.map((outline) => (
                <g key={outline.key}>
                  <path className="group-outline-fill" d={outline.path} />
                  <path className="group-outline-tint" d={outline.path} />
                  <path className="group-outline-edge" d={outline.path} />
                </g>
              ))}
            </svg>
          )}

          {width > 0 &&
            visible.map((row) =>
              row.slots.map((slot, index) => {
                const style: CSSProperties =
                  slot.kind === 'tile'
                    ? {
                        top: row.y,
                        left: PAD_X + index * rowStep,
                        width: cellW,
                        height: cellW,
                      }
                    : {
                        top: row.y + itemInset,
                        left: PAD_X + index * rowStep + itemInset,
                        width: itemSize,
                        height: itemSize,
                      }
                if (slot.kind === 'tile') {
                  const group = slot.group
                  const cached = collectionItems[cacheKey(group.id)]
                  return (
                    <GroupTile
                      key={slot.key}
                      group={group}
                      open={slot.open}
                      loading={
                        slot.open &&
                        group.source === 'collection' &&
                        !cached &&
                        Boolean(collectionLoading[cacheKey(group.id)])
                      }
                      compact={compact}
                      tight={tight}
                      style={style}
                      onToggle={() => toggleGroup(group)}
                      onDropItems={(ids) => {
                        void addToGroup(group.source, group.id, ids).catch(() => {
                          /* the rail reports drop errors; keep the tile quiet */
                        })
                      }}
                    />
                  )
                }
                return (
                  <GridCell
                    key={slot.key}
                    item={slot.item}
                    selected={selectedSet.has(slot.item.id)}
                    style={style}
                  />
                )
              }),
            )}

          {!loading && layout.empty && (
            <div className="grid-empty">
              <span className="display">no items in this view</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
