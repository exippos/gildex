// Virtualized item grid. Renders only the rows in (and just around) the
// viewport, absolutely positioned over a tall canvas, so thousands of items
// scroll smoothly. In group views (sessions / collections with nothing
// selected) each group is a stacked tile; expanding one spills its items into
// the shared grid flow instead of giving them a block of their own.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { episodeKey, groupItemsKey, resolveItems, useStore, isNsfwBlurred, type GroupClickMode } from '../../store'
import { thumbUrl } from '../../api'
import type {
  Collection,
  Episode,
  GroupType,
  Item,
  ItemSort,
  Session,
  SortDir,
  Status,
  Surface,
} from '../../types'
import { ContextMenu, type MenuEntry } from '../common/ContextMenu'
import { GridCell } from './GridCell'
import { formatRange } from '../format'
import { isTypingTarget } from '../keys'
import { readDraggedItemIds } from '../groups/drag'
import { STATUSES, STATUS_ORDER } from './statuses'
import './grid.css'

const PAD_X = 16
const PAD_Y = 12
const GUTTER = 8
const BAND_PAD = 4
const OVERSCAN_ROWS = 2
const COMPACT_BELOW = 120
// Item cells sit a touch smaller than the group tiles that anchor them.
const ITEM_SCALE = 0.86
// Single-click group preview waits out the double-click window. Opening the
// preview panel reflows the grid, and doing that between the two clicks of a
// double-click would move the tile out from under the pointer.
const TILE_CLICK_DELAY = 200
let pendingTileClick: number | null = null

function cancelPendingTileClick() {
  if (pendingTileClick !== null) {
    window.clearTimeout(pendingTileClick)
    pendingTileClick = null
  }
}

function scheduleTileClick(action: () => void) {
  cancelPendingTileClick()
  pendingTileClick = window.setTimeout(() => {
    pendingTileClick = null
    action()
  }, TILE_CLICK_DELAY)
}
// Group expand/collapse entrance/exit timing (ms).
const ENTER_MS = 160
const EXIT_MS = 120
const STAGGER_MS = 16
const MAX_STAGGER = 12
const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

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
  /** User-picked label image, if any. */
  coverId: string | null
  items: Item[]
  videoCount: number
  audioCount: number
  /** Group-owned triage (D45), shown on the tile and edited in the preview. */
  favorite: boolean
  rating: number
  status: Status
  /** Cover thumbnail item carries the configured NSFW tag (backend-computed). */
  nsfw: boolean
}

type Slot =
  | { kind: 'tile'; key: string; group: Group; open: boolean }
  | {
      kind: 'episode'
      key: string
      ownerType: GroupType
      ownerId: string
      episode: Episode
      count: number
      open: boolean
    }
  | {
      kind: 'section'
      key: string
      ownerType: GroupType
      ownerId: string
      label: string
      count: number
    }
  | { kind: 'spacer'; key: string }
  | { kind: 'cell'; key: string; group: Group | null; item: Item; order: number }

type MenuTarget =
  | { kind: 'cell'; x: number; y: number; item: Item; group: Group | null }
  | { kind: 'tile'; x: number; y: number; group: Group; open: boolean }
  | {
      kind: 'episode'
      x: number
      y: number
      ownerType: GroupType
      ownerId: string
      episodeId: string
    }

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

/** Orders group tiles by their own triage for the triage sort keys. Other
 *  sorts keep the catalog order the groups were built in. */
function sortGroups(groups: Group[], sort: ItemSort, sortDir: SortDir): Group[] {
  if (sort !== 'rating' && sort !== 'status' && sort !== 'favorite') return groups
  const sign = sortDir === 'asc' ? 1 : -1
  const rank = (group: Group) => {
    if (sort === 'rating') return group.rating
    if (sort === 'status') return STATUS_ORDER[group.status]
    return group.favorite ? 1 : 0
  }
  return [...groups].sort((a, b) => (rank(a) - rank(b)) * sign)
}

function makeGroup(
  source: GroupSource,
  id: string,
  label: string,
  items: Item[],
  thumb: string,
  total?: number,
  coverId: string | null = null,
  nsfw = false,
): Group {
  let videoCount = 0
  let audioCount = 0
  for (const item of items) {
    if (item.kind === 'video') videoCount++
    else if (item.kind === 'audio') audioCount++
  }
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
    coverId,
    items,
    videoCount,
    audioCount,
    favorite: false,
    rating: 0,
    status: 'draft',
    nsfw,
  }
}

/** Groups items by session in catalog order, keeping unmatched runs visible.
 *  Used for filtered session views, where only sessions with matching items
 *  should appear; the unfiltered view uses `catalogSessionGroups` instead. */
function sessionGroups(
  items: Item[],
  sessions: Session[],
  cachedFor: (id: string) => Item[] | undefined,
): Group[] {
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
    const groupItems = cachedFor(session.id) ?? bySession.get(session.id)
    if (!groupItems?.length) continue
    bySession.delete(session.id)
    const group = makeGroup(
      'session',
      session.id,
      session.label,
      groupItems,
      session.thumbnailPath,
      session.itemCount,
      session.coverItemId,
      session.nsfw,
    )
    // Catalog counts are authoritative over the (possibly truncated) page.
    group.videoCount = session.videoCount
    group.audioCount = session.audioCount
    group.favorite = session.favorite
    group.rating = session.rating
    group.status = session.status
    groups.push(group)
  }
  // Items whose session is missing from the catalog list still get a tile.
  for (const [id, groupItems] of bySession) {
    groups.push(makeGroup('session', id, id, groupItems, ''))
  }
  if (loose.length) groups.push(makeGroup('session', '', 'Unsorted', loose, ''))
  return groups
}

/**
 * Builds one tile per catalog session. The main `items` page is capped, so
 * sessions whose items fall outside it would otherwise vanish; their contents
 * are loaded lazily on expand and the catalog counts keep the tile honest.
 */
function catalogSessionGroups(
  sessions: Session[],
  pageItems: Item[],
  cachedFor: (id: string) => Item[] | undefined,
): Group[] {
  const pageBySession = new Map<string, Item[]>()
  for (const item of pageItems) {
    if (!item.sessionId) continue
    const bucket = pageBySession.get(item.sessionId)
    if (bucket) bucket.push(item)
    else pageBySession.set(item.sessionId, [item])
  }

  const groups: Group[] = []
  for (const session of sessions) {
    const cached = cachedFor(session.id)
    if (session.itemCount === 0 && !cached?.length) continue
    // Show whatever the main page already holds until the full page loads.
    const items = cached ?? pageBySession.get(session.id) ?? []
    const group = makeGroup(
      'session',
      session.id,
      session.label,
      items,
      session.thumbnailPath,
      session.itemCount,
      session.coverItemId,
      session.nsfw,
    )
    // Catalog values are authoritative before the first fetch.
    if (!cached) group.count = session.itemCount
    group.range = formatRange(session.startsAt, session.endsAt)
    group.videoCount = session.videoCount
    group.audioCount = session.audioCount
    group.favorite = session.favorite
    group.rating = session.rating
    group.status = session.status
    groups.push(group)
  }
  // Items with no session (e.g. removed from a group by hand) keep their tile.
  const loose = pageItems.filter((item) => !item.sessionId)
  if (loose.length) groups.push(makeGroup('session', '', 'Unsorted', loose, ''))
  return groups
}

/** Appends one expanded group's slots, split into episode sections. Episode
 *  cards expand and collapse in place like group tiles; everything else
 *  follows in catalog order under an "Unassigned" header (only when the group
 *  actually has episodes). */
function pushSectionedSlots(
  slots: Slot[],
  group: Group | null,
  items: Item[],
  ownerType: GroupType,
  ownerId: string,
  eps: Episode[],
  expandedEpisodes: Set<string>,
  breakRow: () => void,
  orderStart = 0,
): number {
  const byId = new Map(items.map((item) => [item.id, item]))
  const assigned = new Set<string>()
  let order = orderStart
  let shown = 0
  for (const ep of eps) {
    const members = ep.itemIds
      .map((id) => byId.get(id))
      .filter((item): item is Item => Boolean(item))
    if (!members.length) continue
    shown++
    const key = `episode:${ownerType}:${ownerId}:${ep.id}`
    const open = expandedEpisodes.has(key)
    slots.push({
      kind: 'episode',
      key,
      ownerType,
      ownerId,
      episode: ep,
      count: members.length,
      open,
    })
    for (const item of members) {
      assigned.add(item.id)
      if (!open) continue
      slots.push({
        kind: 'cell',
        key: group ? `cell:${group.key}:${item.id}` : `cell:${item.id}`,
        group,
        item,
        order: order++,
      })
    }
    // An open episode is a section of its own: the next episode or the
    // unassigned block starts on a fresh row, like the next group does.
    if (open) breakRow()
  }
  const rest = items.filter((item) => !assigned.has(item.id))
  if (shown > 0 && rest.length) {
    slots.push({
      kind: 'section',
      key: `section:${ownerType}:${ownerId}`,
      ownerType,
      ownerId,
      label: 'Unassigned',
      count: rest.length,
    })
  }
  for (const item of rest) {
    slots.push({
      kind: 'cell',
      key: group ? `cell:${group.key}:${item.id}` : `cell:${item.id}`,
      group,
      item,
      order: order++,
    })
  }
  return order
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
    collection.coverItemId,
    collection.nsfw,
  )
  group.favorite = collection.favorite
  group.rating = collection.rating
  group.status = collection.status
  // Before the first fetch there are no items to count, so trust the catalog.
  if (!cached) {
    group.count = collection.itemCount
    group.videoCount = collection.videoCount
    group.audioCount = collection.audioCount
  }
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

/** A section header for one episode or for the unassigned remainder. It is a
 *  normal cell-sized slot, so the uniform row math needs no special case. */
function EpisodeCard({
  label,
  meta,
  thumb,
  unassigned = false,
  open = true,
  style,
  tabIndex,
  slotRef,
  onToggle,
  onMenu,
}: {
  label: string
  meta: string
  thumb?: string | null
  unassigned?: boolean
  open?: boolean
  style: CSSProperties
  tabIndex?: number
  slotRef?: (el: HTMLButtonElement | null) => void
  onToggle: () => void
  onMenu?: (x: number, y: number) => void
}) {
  const src = thumb ? thumbUrl(thumb) : null
  const className = `episode-card${unassigned ? ' is-unassigned' : open ? ' is-open' : ''}`
  return (
    <button
      type="button"
      className={className}
      style={style}
      tabIndex={tabIndex}
      ref={slotRef}
      aria-expanded={unassigned ? undefined : open}
      aria-haspopup={onMenu ? 'menu' : undefined}
      onClick={onToggle}
      onContextMenu={
        onMenu
          ? (event) => {
              event.preventDefault()
              onMenu(event.clientX, event.clientY)
            }
          : undefined
      }
      onKeyDown={
        onMenu
          ? (event) => {
              if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) {
                return
              }
              event.preventDefault()
              const rect = event.currentTarget.getBoundingClientRect()
              onMenu(rect.left + Math.min(rect.width / 2, 120), rect.top + 18)
            }
          : undefined
      }
      title={
        unassigned
          ? 'Manage episodes'
          : open
            ? `${label} · click to collapse`
            : `${label} · click to expand`
      }
    >
      <span className="episode-card-deck" aria-hidden="true" />
      <span className="episode-card-inner">
        {!unassigned && (
          <>
            <span className="episode-card-art">
              {src ? (
                <img src={src} alt="" loading="lazy" />
              ) : (
                <span className="episode-card-glyph" aria-hidden="true">
                  ▤
                </span>
              )}
            </span>
            <span className="episode-card-scrim" aria-hidden="true" />
            <span className="episode-card-stack" aria-hidden="true" />
          </>
        )}
        <span className="episode-card-text">
          <span className="episode-card-label">{label}</span>
          <span className="episode-card-meta">{meta}</span>
        </span>
        {!unassigned && <span className="episode-card-chevron" aria-hidden="true" />}
      </span>
    </button>
  )
}

function GroupTile({
  group,
  open,
  loading,
  compact,
  tight,
  style,
  clickMode,
  tabIndex,
  slotRef,
  onToggle,
  onPreview,
  onDropItems,
  onMenu,
}: {
  group: Group
  open: boolean
  loading: boolean
  compact: boolean
  tight: boolean
  style: CSSProperties
  clickMode: GroupClickMode
  tabIndex?: number
  slotRef?: (el: HTMLButtonElement | null) => void
  onToggle: () => void
  /** Single-click group preview; omitted for pseudo groups (Unsorted). */
  onPreview?: () => void
  onDropItems?: (itemIds: string[]) => void
  onMenu?: (x: number, y: number) => void
}) {
  const [dropActive, setDropActive] = useState(false)
  const canDrop = Boolean(onDropItems) && Boolean(group.id)
  const librarySettings = useStore((s) => s.librarySettings)
  // In preview mode a single click opens the right-panel preview and a
  // double-click toggles expansion. Groups without an id have nothing to
  // preview, so they keep the one-click expand behaviour.
  const previews = clickMode === 'preview' && Boolean(onPreview)
  const poster = group.thumb ? thumbUrl(group.thumb) : null
  const posterNsfw =
    (librarySettings.blurNsfw && group.nsfw) ||
    group.items.some(
      (item) =>
        item.thumbnailPath !== '' &&
        item.thumbnailPath === group.thumb &&
        isNsfwBlurred(item, librarySettings),
    )
  const posterStyle = poster
    ? ({ '--tile-art': `url("${poster}")` } as CSSProperties)
    : undefined
  const peeked = group.items
    .filter((item) => item.thumbnailPath)
    .slice(0, 2)
    .map((item) => ({
      src: thumbUrl(item.thumbnailPath)!,
      nsfw: isNsfwBlurred(item, librarySettings),
    }))
  // Without cached items (a collection before its first expand) repeat the
  // poster so the deck still reads as a stack.
  const deck =
    peeked.length > 0
      ? peeked
      : poster
        ? [
            { src: poster, nsfw: posterNsfw },
            { src: poster, nsfw: posterNsfw },
          ]
        : []
  const countLabel =
    group.count === group.total
      ? `${group.count} ${group.total === 1 ? 'item' : 'items'}`
      : `${group.count} of ${group.total} items`

  return (
    <button
      type="button"
      ref={slotRef}
      className={`group-tile${open ? ' is-open' : ''}${compact ? ' is-compact' : ''}${tight ? ' is-tight' : ''}${dropActive ? ' is-drop-target' : ''}`}
      style={style}
      tabIndex={tabIndex}
      aria-expanded={open}
      aria-busy={loading || undefined}
      aria-label={`${group.label}, ${group.count} ${group.count === 1 ? 'item' : 'items'}`}
      aria-haspopup="menu"
      title={previews ? 'Click to preview · double-click to expand' : 'Click to expand'}
      onClick={(event) => {
        // A double-click fires two clicks. The first runs the single-click
        // action; ignore the second so expansion never toggles twice.
        if (event.detail > 1) return
        if (previews) scheduleTileClick(() => onPreview?.())
        else onToggle()
      }}
      onDoubleClick={
        previews
          ? () => {
              cancelPendingTileClick()
              onToggle()
            }
          : undefined
      }
      onContextMenu={
        onMenu
          ? (event) => {
              event.preventDefault()
              onMenu(event.clientX, event.clientY)
            }
          : undefined
      }
      onKeyDown={
        onMenu
          ? (event) => {
              if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) {
                return
              }
              event.preventDefault()
              const rect = event.currentTarget.getBoundingClientRect()
              onMenu(rect.left + Math.min(rect.width / 2, 120), rect.top + 18)
            }
          : undefined
      }
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
          {deck.map((entry, index) => (
            <img
              key={`${entry.src}-${index}`}
              className={entry.nsfw ? 'is-nsfw' : undefined}
              src={entry.src}
              alt=""
              loading="lazy"
              draggable={false}
            />
          ))}
        </span>
      )}

      {group.favorite && <span className="group-tile-fav" aria-hidden="true" />}
      {posterNsfw && <span className="group-tile-nsfw">nsfw</span>}

      <span className="group-tile-poster" style={posterStyle}>
        {poster ? (
          <>
            <img
              className={posterNsfw ? 'is-nsfw' : undefined}
              src={poster}
              alt=""
              loading="lazy"
              draggable={false}
            />
            <span className="group-tile-relief is-light" aria-hidden="true" />
            <span className="group-tile-relief is-shadow" aria-hidden="true" />
          </>
        ) : (
          <TileFallback kind={group.fallback} />
        )}
        {(group.videoCount > 0 || group.audioCount > 0) && (
          <span className="group-tile-kinds" aria-hidden="true">
            {group.videoCount > 0 && (
              <span className="group-tile-kind">
                <svg viewBox="0 0 24 24">
                  <path d="M8 5.5 19 12 8 18.5Z" fill="currentColor" />
                </svg>
              </span>
            )}
            {group.audioCount > 0 && (
              <span className="group-tile-kind">
                <span className="group-tile-kind-bars">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            )}
          </span>
        )}
        <span className="group-tile-scrim" aria-hidden="true" />
        <span className="group-tile-text">
          <span className="group-tile-label display">{group.label}</span>
          <span className="group-tile-meta">
            <span>{countLabel}</span>
            {group.range && <span className="group-tile-range">{group.range}</span>}
            <span className="group-tile-triage" aria-hidden="true">
              <span className={`cell-status status-${group.status}`} />
              {group.rating > 0 && (
                <span className="cell-rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} className={`rating-dot${n <= group.rating ? ' is-on' : ''}`} />
                  ))}
                </span>
              )}
            </span>
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
  const activeSourceId = useStore((s) => s.activeSourceId)
  const search = useStore((s) => s.search)
  const sort = useStore((s) => s.sort)
  const sortDir = useStore((s) => s.sortDir)
  const activeTagFilters = useStore((s) => s.activeTagFilters)
  const sessions = useStore((s) => s.sessions)
  const collections = useStore((s) => s.collections)
  const groupItems = useStore((s) => s.groupItems)
  const groupLoading = useStore((s) => s.groupLoading)
  const episodes = useStore((s) => s.episodes)
  const episodeLoading = useStore((s) => s.episodeLoading)
  const loadGroupItems = useStore((s) => s.loadGroupItems)
  const loadEpisodes = useStore((s) => s.loadEpisodes)
  const selection = useStore((s) => s.selection)
  const loading = useStore((s) => s.loadingItems)
  const clearSelection = useStore((s) => s.clearSelection)
  const selectGroupItems = useStore((s) => s.selectGroupItems)
  const addToGroup = useStore((s) => s.addToGroup)
  const batchSet = useStore((s) => s.batchSet)
  const batchRemove = useStore((s) => s.batchRemove)
  const openCollectionPicker = useStore((s) => s.openCollectionPicker)
  const openInspector = useStore((s) => s.openInspector)
  const openGroupEditor = useStore((s) => s.openGroupEditor)
  const openEpisodeEditor = useStore((s) => s.openEpisodeEditor)
  const assignEpisodeItems = useStore((s) => s.assignEpisodeItems)
  const clusterEpisodes = useStore((s) => s.clusterEpisodes)
  const setGroupCover = useStore((s) => s.setGroupCover)
  const setPreviewGroup = useStore((s) => s.setPreviewGroup)
  const groupClickMode = useStore((s) => s.groupClickMode)
  const setSurface = useStore((s) => s.setSurface)
  const setPreviewItemId = useStore((s) => s.setPreviewItemId)
  const toggleSelect = useStore((s) => s.toggleSelect)
  const selectRange = useStore((s) => s.selectRange)
  const selectAllVisible = useStore((s) => s.selectAllVisible)
  const loadItems = useStore((s) => s.loadItems)
  const setSelected = useStore((s) => s.setSelected)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)

  const [width, setWidth] = useState(0)
  const [viewportH, setViewportH] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  // Episode cards expand in place, independently of group expansion.
  const [expandedEpisodes, setExpandedEpisodes] = useState<Set<string>>(() => new Set())
  const [entering, setEntering] = useState<Set<string>>(() => new Set())
  const [exiting, setExiting] = useState<Set<string>>(() => new Set())
  const [menu, setMenu] = useState<MenuTarget | null>(null)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const slotRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  // Flat index of the focused slot, kept so a deletion can restore focus to the
  // nearest surviving slot instead of resetting it.
  const focusIndexRef = useRef(0)

  const registerSlot = (key: string, el: HTMLButtonElement | null) => {
    if (el) slotRefs.current.set(key, el)
    else slotRefs.current.delete(key)
  }

  const enterTimers = useRef<Map<string, number>>(new Map())
  const exitTimers = useRef<Map<string, number>>(new Map())

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
  const queryKey = `${surface}|${activeSessionId}|${activeCollectionId}|${activeFolder}|${activeSourceId}|${search}|${activeTagFilters.join(',')}|${sort}|${sortDir}`
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = 0
    setScrollTop(0)
  }, [queryKey, cellSize])

  // Collapse all groups when the query changes.
  useEffect(() => {
    setExpanded(new Set())
    setEntering(new Set())
    setExiting(new Set())
    setFocusedKey(null)
    enterTimers.current.forEach((timer) => window.clearTimeout(timer))
    enterTimers.current.clear()
    exitTimers.current.forEach((timer) => window.clearTimeout(timer))
    exitTimers.current.clear()
  }, [queryKey])

  // Escape or losing focus clears the selection (wired here, once).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !menu) clearSelection()
    }
    const onBlur = () => clearSelection()
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [clearSelection, menu])

  // Keys 1–5 switch surfaces, as long as no typing field or modal owns the key.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      const state = useStore.getState()
      if (
        state.settingsModal ||
        state.inspector ||
        state.groupEditor ||
        state.collectionPicker ||
        state.libraryModal
      ) {
        return
      }
      if (menu) return
      let next: Surface | null = null
      switch (event.key) {
        case '1':
          next = 'all'
          break
        case '2':
          next = 'sessions'
          break
        case '3':
          next = 'collections'
          break
        case '4':
          next = 'folders'
          break
        case '5':
          next = 'tags'
          break
        default:
          return
      }
      event.preventDefault()
      setSurface(next)
      setPreviewItemId(null)
      clearSelection()
      void loadItems()
      // Keep keyboard focus in the grid so arrows keep working after the switch.
      scrollRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, setSurface, setPreviewItemId, clearSelection, loadItems])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      enterTimers.current.forEach((timer) => window.clearTimeout(timer))
      exitTimers.current.forEach((timer) => window.clearTimeout(timer))
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

  const cacheKey = (type: GroupSource, id: string) =>
    groupItemsKey(type, id, search, activeTagFilters, sort, sortDir)

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
  const sessionGrouping = surface === 'sessions' && activeSessionId === null
  // Unfiltered sessions come from the catalog so older sessions stay visible
  // even when the main items page is capped; filtered views fall back to the
  // page-derived groups, where every listed session has a matching item.
  const catalogSessions =
    sessionGrouping && !search.trim() && activeTagFilters.length === 0
  const groupMode: GroupSource | null = sessionGrouping
    ? 'session'
    : collectionTiles
      ? 'collection'
      : null

  // A single session/collection opened from the rail is a flat item list, but
  // episodes still section it. This is the owner those sections belong to.
  const scopedOwner = useMemo<{ type: GroupType; id: string } | null>(() => {
    if (groupMode) return null
    if (surface === 'sessions' && activeSessionId) {
      return { type: 'session', id: activeSessionId }
    }
    if (surface === 'collections' && activeCollectionId) {
      return { type: 'collection', id: activeCollectionId }
    }
    return null
  }, [groupMode, surface, activeSessionId, activeCollectionId])

  // An edit can drop a group's cached page (the group editor or a drop
  // target invalidates it). Refetch any expanded tile that lost its page so
  // the open group keeps showing its items.
  useEffect(() => {
    if (!groupMode) return
    for (const key of expanded) {
      const sep = key.indexOf(':')
      const source = key.slice(0, sep)
      if (source !== 'session' && source !== 'collection') continue
      const id = key.slice(sep + 1)
      const keyed = groupItemsKey(source, id, search, activeTagFilters, sort, sortDir)
      if (!groupItems[keyed] && !groupLoading[keyed]) {
        void loadGroupItems(source, id)
      }
      if (id) {
        const ep = episodeKey(source, id)
        if (!episodes[ep] && !episodeLoading[ep]) void loadEpisodes(source, id)
      }
    }
  }, [
    groupMode,
    expanded,
    groupItems,
    groupLoading,
    episodes,
    episodeLoading,
    search,
    activeTagFilters,
    sort,
    sortDir,
    loadGroupItems,
    loadEpisodes,
  ])

  // Episodes for the single group opened from the rail.
  useEffect(() => {
    if (!scopedOwner) return
    const key = episodeKey(scopedOwner.type, scopedOwner.id)
    if (!episodes[key] && !episodeLoading[key]) {
      void loadEpisodes(scopedOwner.type, scopedOwner.id)
    }
  }, [scopedOwner, episodes, episodeLoading, loadEpisodes])

  const itemSize = groupMode ? Math.round(cellW * ITEM_SCALE) : cellW
  const itemInset = (cellW - itemSize) / 2

  const groups = useMemo(() => {
    let out: Group[]
    if (groupMode === 'session') {
      out = catalogSessions
        ? catalogSessionGroups(sessions, items, (id) => groupItems[cacheKey('session', id)])
        : sessionGroups(items, sessions, (id) => groupItems[cacheKey('session', id)])
    } else if (groupMode === 'collection') {
      out = []
      for (const collection of collections) {
        const cached = groupItems[cacheKey('collection', collection.id)]
        if (collection.itemCount === 0 && !cached?.length) continue
        out.push(collectionGroup(collection, cached))
      }
    } else {
      return []
    }
    return sortGroups(out, sort, sortDir)
  }, [
    groupMode,
    catalogSessions,
    items,
    sessions,
    collections,
    groupItems,
    search,
    activeTagFilters,
    sort,
    sortDir,
  ])

  const layout = useMemo(() => {
    const slots: Slot[] = []
    const outlines: GroupOutline[] = []
    // After an expanded group, pad to the end of its row so the next group
    // tile starts a fresh row instead of butting against the spilled items.
    const breakRow = () => {
      if (cols <= 0) return
      const remainder = slots.length % cols
      if (remainder === 0) return
      for (let i = remainder; i < cols; i++) {
        slots.push({ kind: 'spacer', key: `spacer:${slots.length}` })
      }
    }
    if (groupMode) {
      for (const group of groups) {
        const open = expanded.has(group.key)
        const start = slots.length
        slots.push({
          kind: 'tile',
          key: `tile:${group.key}`,
          group,
          open: open && !exiting.has(group.key),
        })
        if (open) {
          // The root tile keeps its row; spilled items start on the next one.
          breakRow()
          const eps = episodes[episodeKey(group.source, group.id)] ?? []
          pushSectionedSlots(
            slots,
            group,
            group.items,
            group.source,
            group.id,
            eps,
            expandedEpisodes,
            breakRow,
          )
          // Trailing spacers belong to the row break, not the group outline.
          let end = slots.length - 1
          while (end > start && slots[end].kind === 'spacer') end--
          outlines.push(groupOutline(group.key, start, end, cols, cellW, rowStep))
          breakRow()
        }
      }
    } else {
      const eps = scopedOwner
        ? episodes[episodeKey(scopedOwner.type, scopedOwner.id)] ?? []
        : []
      if (scopedOwner) {
        pushSectionedSlots(
          slots,
          null,
          items,
          scopedOwner.type,
          scopedOwner.id,
          eps,
          expandedEpisodes,
          breakRow,
        )
      } else {
        for (const item of items) {
          slots.push({ kind: 'cell', key: `cell:${item.id}`, group: null, item, order: 0 })
        }
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
  }, [
    groupMode,
    groups,
    items,
    cols,
    cellW,
    rowStep,
    expanded,
    exiting,
    viewportH,
    episodes,
    scopedOwner,
    expandedEpisodes,
  ])

  const visible = useMemo(() => {
    if (width <= 0 || viewportH <= 0) return [] as GridRow[]
    const overscan = rowStep * OVERSCAN_ROWS
    const top = scrollTop - overscan
    const bottom = scrollTop + viewportH + overscan
    return layout.rows.filter((row) => row.y + cellW >= top && row.y <= bottom)
  }, [layout, scrollTop, viewportH, rowStep, cellW, width])

  const selectedSet = useMemo(() => new Set(selection), [selection])

  // Visual item order across the whole layout (including every expanded group),
  // so shift-click ranges follow what the grid shows, not the catalog page.
  const itemOrder = useMemo(
    () =>
      layout.rows.flatMap((row) =>
        row.slots.flatMap((slot) => (slot.kind === 'cell' ? [slot.item.id] : [])),
      ),
    [layout],
  )

  // Flat visual order of every slot, so the keyboard cursor can step through
  // tiles and cells alike and map back to a row for scroll-into-view.
  const flatSlots = useMemo(() => {
    const out: { slot: Slot; row: number }[] = []
    layout.rows.forEach((row, r) => {
      row.slots.forEach((slot) => {
        if (slot.kind !== 'spacer') out.push({ slot, row: r })
      })
    })
    return out
  }, [layout])
  const firstSlotKey = flatSlots[0]?.slot.key ?? null

  // Focus the cursor's element once it is actually rendered (virtualized rows
  // only exist while they are near the viewport).
  useEffect(() => {
    if (!focusedKey) return
    const el = slotRefs.current.get(focusedKey)
    if (el && el.isConnected) el.focus({ preventScroll: true })
  }, [focusedKey, visible, scrollTop])

  const expandGroup = (key: string, count: number) => {
    setEntering((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    setExiting((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })

    const timer = enterTimers.current.get(key)
    if (timer !== undefined) window.clearTimeout(timer)
    const delay = ENTER_MS + Math.min(count, MAX_STAGGER) * STAGGER_MS
    enterTimers.current.set(
      key,
      window.setTimeout(() => {
        setEntering((prev) => {
          if (!prev.has(key)) return prev
          const next = new Set(prev)
          next.delete(key)
          return next
        })
        enterTimers.current.delete(key)
      }, delay),
    )
  }

  const collapseGroup = (key: string) => {
    setExiting((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })

    const timer = exitTimers.current.get(key)
    if (timer !== undefined) window.clearTimeout(timer)
    exitTimers.current.set(
      key,
      window.setTimeout(() => {
        setExpanded((prev) => {
          if (!prev.has(key)) return prev
          const next = new Set(prev)
          next.delete(key)
          return next
        })
        setExiting((prev) => {
          if (!prev.has(key)) return prev
          const next = new Set(prev)
          next.delete(key)
          return next
        })
        exitTimers.current.delete(key)
      }, REDUCED_MOTION ? 0 : EXIT_MS),
    )
  }

  const toggleGroup = (group: Group) => {
    const open = expanded.has(group.key) && !exiting.has(group.key)
    if (!open && group.id && !groupItems[cacheKey(group.source, group.id)]) {
      void loadGroupItems(group.source, group.id)
    }
    if (open) {
      collapseGroup(group.key)
    } else {
      // Re-expanding during a collapse cancels the pending exit and keeps it open.
      const timer = exitTimers.current.get(group.key)
      if (timer !== undefined) {
        window.clearTimeout(timer)
        exitTimers.current.delete(group.key)
      }
      expandGroup(group.key, group.items.length)
    }
  }

  const toggleEpisode = (key: string) => {
    setExpandedEpisodes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const focusSlot = (entry: { slot: Slot; row: number }) => {
    setFocusedKey(entry.slot.key)
    focusIndexRef.current = flatSlots.findIndex((e) => e.slot.key === entry.slot.key)
    // Preview follows the keyboard cursor (mirrors a single click).
    if (entry.slot.kind === 'cell') {
      setPreviewItemId(entry.slot.item.id)
    } else if (entry.slot.kind === 'tile' && entry.slot.group.id) {
      setPreviewGroup({ type: entry.slot.group.source, id: entry.slot.group.id })
    }
    // Reveal the row before focusing — virtualized slots may be off-screen.
    const el = scrollRef.current
    if (el) {
      const top = layout.rows[entry.row].y
      const bottom = top + cellW
      if (top < el.scrollTop + PAD_Y) {
        el.scrollTop = top - PAD_Y
      } else if (bottom > el.scrollTop + el.clientHeight) {
        el.scrollTop = bottom - el.clientHeight + PAD_Y
      }
    }
  }

  const moveFocus = (delta: number, shift: boolean) => {
    if (!flatSlots.length) return
    const idx = flatSlots.findIndex((entry) => entry.slot.key === (focusedKey ?? firstSlotKey))
    const from = idx === -1 ? 0 : idx
    const next = Math.max(0, Math.min(flatSlots.length - 1, from + delta))
    const target = flatSlots[next]
    if (shift && target.slot.kind === 'cell') {
      selectRange(target.slot.item.id, itemOrder)
    }
    focusSlot(target)
  }

  const focusIndex = (index: number) => {
    if (!flatSlots.length) return
    focusSlot(flatSlots[Math.max(0, Math.min(flatSlots.length - 1, index))])
  }

  const activateSpace = () => {
    const cur =
      flatSlots.find((entry) => entry.slot.key === (focusedKey ?? firstSlotKey)) ??
      flatSlots[0]
    if (!cur) return
    if (cur.slot.kind === 'cell') toggleSelect(cur.slot.item.id)
    else if (cur.slot.kind === 'episode') toggleEpisode(cur.slot.key)
    else if (cur.slot.kind === 'tile' && cur.slot.group.id)
      void selectGroupItems(cur.slot.group.source, cur.slot.group.id)
  }

  const openFocused = () => {
    const cur =
      flatSlots.find((entry) => entry.slot.key === (focusedKey ?? firstSlotKey)) ??
      flatSlots[0]
    if (!cur) return
    if (cur.slot.kind === 'cell') void openInspector('item', cur.slot.item.id)
    else if (cur.slot.kind === 'episode') toggleEpisode(cur.slot.key)
    else if (cur.slot.kind === 'section')
      openEpisodeEditor(cur.slot.ownerType, cur.slot.ownerId)
    else if (cur.slot.kind === 'tile') toggleGroup(cur.slot.group)
  }

  const deleteFromCatalog = () => {
    const focused = flatSlots.find((entry) => entry.slot.key === (focusedKey ?? firstSlotKey))
    const focusedId = focused?.slot.kind === 'cell' ? focused.slot.item.id : null
    // Del acts on the selection; with nothing selected it targets the focused cell.
    const ids = selection.length ? selection : focusedId ? [focusedId] : []
    if (!ids.length) return
    const ok = window.confirm(
      `Remove ${ids.length} ${ids.length === 1 ? 'item' : 'items'} from the catalog?\n\nFiles stay on disk; they can be imported again.`,
    )
    if (!ok) return
    if (!selection.length && focusedId) setSelected(focusedId, false)
    // Remember the cursor so the repair effect restores focus to the nearest
    // surviving slot instead of resetting it.
    if (focused) setFocusedKey(focused.slot.key)
    void batchRemove()
  }

  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey) return
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        moveFocus(-1, event.shiftKey)
        break
      case 'ArrowRight':
        event.preventDefault()
        moveFocus(1, event.shiftKey)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveFocus(-cols, event.shiftKey)
        break
      case 'ArrowDown':
        event.preventDefault()
        moveFocus(cols, event.shiftKey)
        break
      case 'Home':
        event.preventDefault()
        focusIndex(0)
        break
      case 'End':
        event.preventDefault()
        focusIndex(flatSlots.length - 1)
        break
      case ' ':
        event.preventDefault()
        activateSpace()
        break
      case 'Enter':
        event.preventDefault()
        openFocused()
        break
      case 'a':
      case 'A':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault()
          selectAllVisible()
          break
        }
        return
      case 'Delete':
      case 'Backspace':
        event.preventDefault()
        deleteFromCatalog()
        break
      default:
        return
    }
  }

  // When the focused slot disappears (its item was removed from the catalog),
  // move focus to the nearest surviving slot so the cursor does not reset.
  useEffect(() => {
    if (!focusedKey) return
    if (flatSlots.some((entry) => entry.slot.key === focusedKey)) return
    if (!flatSlots.length) {
      setFocusedKey(null)
      return
    }
    const idx = Math.min(focusIndexRef.current, flatSlots.length - 1)
    focusSlot(flatSlots[idx])
  }, [flatSlots, focusedKey])

  // A cancelable view change leaves no stale menu floating over new content.
  useEffect(() => {
    setMenu(null)
  }, [queryKey, cellSize])

  // A pending tile preview must not outlive the grid.
  useEffect(() => () => cancelPendingTileClick(), [])

  type CoverTarget = {
    type: GroupType
    id: string
    noun: 'session' | 'collection'
    label: string
    coverId: string | null
  }

  const coverTargets = (item: Item, group: Group | null): CoverTarget[] => {
    // Inside an expanded group, that group is the unambiguous target.
    if (group?.id) {
      return [
        {
          type: group.source,
          id: group.id,
          noun: group.source,
          label: group.label,
          coverId: group.coverId,
        },
      ]
    }
    const targets: CoverTarget[] = []
    if (item.sessionId) {
      const session = sessions.find((entry) => entry.id === item.sessionId)
      if (session) {
        targets.push({
          type: 'session',
          id: session.id,
          noun: 'session',
          label: session.label,
          coverId: session.coverItemId,
        })
      }
    }
    if (surface === 'collections' && activeCollectionId) {
      const collection = collections.find((entry) => entry.id === activeCollectionId)
      if (collection) {
        targets.push({
          type: 'collection',
          id: collection.id,
          noun: 'collection',
          label: collection.name,
          coverId: collection.coverItemId,
        })
      }
    }
    return targets
  }

  type SelectionScope = {
    source: GroupSource
    id: string
    label: string
    count: number
  }

  // The group whose items "select all" should target for this context menu:
  // the expanded tile, or the session/collection the grid is currently scoped to.
  const selectionScope = (group: Group | null): SelectionScope | null => {
    if (group?.id) {
      return {
        source: group.source,
        id: group.id,
        label: group.label,
        count: group.count,
      }
    }
    if (surface === 'sessions' && activeSessionId) {
      const session = sessions.find((entry) => entry.id === activeSessionId)
      if (session) {
        return {
          source: 'session',
          id: session.id,
          label: session.label,
          count: session.itemCount,
        }
      }
    }
    if (surface === 'collections' && activeCollectionId) {
      const collection = collections.find((entry) => entry.id === activeCollectionId)
      if (collection) {
        return {
          source: 'collection',
          id: collection.id,
          label: collection.name,
          count: collection.itemCount,
        }
      }
    }
    return null
  }

  const selectAllEntry = (scope: SelectionScope): MenuEntry[] => [
    {
      kind: 'item',
      label: `Select all in ${scope.source} — ${scope.label}`,
      hint: `${scope.count} ${scope.count === 1 ? 'item' : 'items'}`,
      onSelect: () => {
        void selectGroupItems(scope.source, scope.id)
      },
    },
    { kind: 'separator' },
  ]

  // The group an item's episode actions belong to: the expanded tile, or the
  // session/collection the grid is currently scoped to.
  const episodeOwnerFor = (group: Group | null): { type: GroupType; id: string } | null => {
    if (group?.id) return { type: group.source, id: group.id }
    if (surface === 'sessions' && activeSessionId) {
      return { type: 'session', id: activeSessionId }
    }
    if (surface === 'collections' && activeCollectionId) {
      return { type: 'collection', id: activeCollectionId }
    }
    return null
  }

  const buildCellMenu = (item: Item, group: Group | null): MenuEntry[] => {
    const entries: MenuEntry[] = []
    const targets = coverTargets(item, group)

    for (const target of targets) {
      const isCover = target.coverId === item.id
      entries.push({
        kind: 'item',
        label: isCover
          ? `Clear ${target.noun} cover — ${target.label}`
          : `Use as ${target.noun} cover — ${target.label}`,
        hint: isCover ? 'current' : undefined,
        checked: isCover,
        onSelect: () => {
          void setGroupCover(target.type, target.id, isCover ? null : item.id)
        },
      })
      entries.push({
        kind: 'item',
        label: target.type === 'session' ? 'Edit session…' : 'Edit collection…',
        onSelect: () => openGroupEditor(target.type, target.id),
      })
    }

    if (entries.length > 0) entries.push({ kind: 'separator' })

    const scope = selectionScope(group)
    if (scope) entries.push(...selectAllEntry(scope))

    // Batch actions act on the whole selection, as the floating toolbar does.
    const ids = selection.includes(item.id) ? selection : [item.id]
    const chosen = resolveItems(items, groupItems, ids)
    const allFavorite = chosen.length > 0 && chosen.every((entry) => entry.favorite)
    const uniformRating =
      chosen.length > 0 && chosen.every((entry) => entry.rating === chosen[0].rating)
        ? chosen[0].rating
        : -1
    const uniformStatus =
      chosen.length > 0 && chosen.every((entry) => entry.status === chosen[0].status)
        ? chosen[0].status
        : null
    const countHint = ids.length > 1 ? `${ids.length} selected` : undefined

    entries.push({
      kind: 'item',
      label: allFavorite ? 'Unfavorite' : 'Favorite',
      hint: countHint,
      onSelect: () => {
        void batchSet({ favorite: !allFavorite })
      },
    })

    const ratingItems: MenuEntry[] = [0, 1, 2, 3, 4, 5].map((value) => ({
      kind: 'item',
      label: value === 0 ? 'No rating' : `${value} of 5`,
      checked: uniformRating === value,
      onSelect: () => {
        void batchSet({ rating: value })
      },
    }))
    entries.push({ kind: 'submenu', label: 'Rate', items: ratingItems })

    const statusItems: MenuEntry[] = STATUSES.map((status) => ({
      kind: 'item',
      label: status.label,
      checked: uniformStatus === status.id,
      onSelect: () => {
        void batchSet({ status: status.id })
      },
    }))
    entries.push({ kind: 'submenu', label: 'Status', items: statusItems })

    entries.push({
      kind: 'item',
      label: 'Add to collection…',
      onSelect: () => openCollectionPicker(ids),
    })

    const epOwner = episodeOwnerFor(group)
    if (epOwner) {
      const eps = episodes[episodeKey(epOwner.type, epOwner.id)] ?? []
      const ownerItemIds = new Set(
        group
          ? group.items.map((entry) => entry.id)
          : surface === 'sessions' && activeSessionId
            ? items
                .filter((entry) => entry.sessionId === activeSessionId)
                .map((entry) => entry.id)
            : items.map((entry) => entry.id),
      )
      const targetIds = ids.filter((id) => ownerItemIds.has(id))
      const episodeItems: MenuEntry[] = eps.map((ep) => ({
        kind: 'item',
        label: ep.label,
        hint: `${ep.itemCount}`,
        checked: targetIds.length > 0 && targetIds.every((id) => ep.itemIds.includes(id)),
        onSelect: () => {
          void assignEpisodeItems(epOwner.type, epOwner.id, ep.id, targetIds)
        },
      }))
      if (episodeItems.length) episodeItems.push({ kind: 'separator' })
      episodeItems.push({
        kind: 'item',
        label: 'New episode…',
        onSelect: () => openEpisodeEditor(epOwner.type, epOwner.id, null, targetIds),
      })
      episodeItems.push({
        kind: 'item',
        label: 'Manage episodes…',
        onSelect: () => openEpisodeEditor(epOwner.type, epOwner.id),
      })
      episodeItems.push({
        kind: 'item',
        label: eps.length ? 'Regenerate episodes…' : 'Group into episodes…',
        onSelect: () => {
          const ok = window.confirm(
            'Group this group’s similar images into episodes?\n\nAutomatic episodes are rebuilt. Episodes you renamed or edited by hand are left alone.',
          )
          if (ok) void clusterEpisodes(epOwner.type, epOwner.id)
        },
      })
      entries.push({ kind: 'submenu', label: 'Episode', items: episodeItems })
    }

    entries.push({
      kind: 'item',
      label: 'Inspect',
      onSelect: () => {
        void openInspector('item', item.id)
      },
    })

    entries.push({ kind: 'separator' })
    entries.push({
      kind: 'item',
      label: 'Remove from catalog',
      danger: true,
      onSelect: () => {
        const ok = window.confirm(
          `Remove ${ids.length} ${ids.length === 1 ? 'item' : 'items'} from the catalog?\n\nFiles stay on disk; they can be imported again.`,
        )
        if (ok) void batchRemove()
      },
    })

    return entries
  }

  const buildTileMenu = (group: Group, open: boolean): MenuEntry[] => {
    const entries: MenuEntry[] = []
    if (group.id) {
      entries.push(
        ...selectAllEntry({
          source: group.source,
          id: group.id,
          label: group.label,
          count: group.count,
        }),
      )
      entries.push({
        kind: 'item',
        label: group.source === 'session' ? 'Triage session…' : 'Triage collection…',
        onSelect: () => {
          clearSelection()
          setPreviewGroup({ type: group.source, id: group.id })
        },
      })
      entries.push({
        kind: 'item',
        label: group.source === 'session' ? 'Edit session…' : 'Edit collection…',
        onSelect: () => openGroupEditor(group.source, group.id),
      })
      entries.push({
        kind: 'item',
        label: 'Manage episodes…',
        onSelect: () => openEpisodeEditor(group.source, group.id),
      })
      entries.push({
        kind: 'item',
        label:
          (episodes[episodeKey(group.source, group.id)] ?? []).length
            ? 'Regenerate episodes…'
            : 'Group into episodes…',
        onSelect: () => {
          const ok = window.confirm(
            `Group “${group.label}” by image similarity?\n\nAutomatic episodes are rebuilt. Episodes you renamed or edited by hand are left alone.`,
          )
          if (ok) void clusterEpisodes(group.source, group.id)
        },
      })
      entries.push({ kind: 'separator' })
    }
    entries.push({
      kind: 'item',
      label: open ? 'Collapse group' : 'Expand group',
      onSelect: () => toggleGroup(group),
    })
    return entries
  }

  const buildEpisodeMenu = (
    ownerType: GroupType,
    ownerId: string,
    episodeId: string,
  ): MenuEntry[] => [
    {
      kind: 'item',
      label: 'Manage episode…',
      onSelect: () => openEpisodeEditor(ownerType, ownerId, episodeId),
    },
    {
      kind: 'item',
      label: 'Regenerate automatic episodes…',
      onSelect: () => {
        const ok = window.confirm(
          'Rebuild automatic episodes for this group from similar images?\n\nEpisodes you created, renamed, or edited by hand are left alone.',
        )
        if (ok) void clusterEpisodes(ownerType, ownerId)
      },
    },
  ]

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
        tabIndex={-1}
        onKeyDown={handleGridKeyDown}
        onMouseDown={(event) => {
          const target = event.target as HTMLElement
          // Moving on before the double-click window closes drops the pending
          // group preview instead of yanking the panel open late.
          if (!target.closest('.group-tile')) cancelPendingTileClick()
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
              {layout.outlines.map((outline) => {
                const phase = exiting.has(outline.key)
                  ? 'exit'
                  : entering.has(outline.key)
                    ? 'enter'
                    : undefined
                const outlineClass = phase
                  ? `group-outline is-${phase === 'enter' ? 'entering' : 'exiting'}`
                  : undefined
                return (
                  <g key={outline.key} className={outlineClass}>
                    <path className="group-outline-fill" d={outline.path} />
                    <path className="group-outline-tint" d={outline.path} />
                    <path className="group-outline-edge" d={outline.path} />
                  </g>
                )
              })}
            </svg>
          )}

          {width > 0 &&
            visible.map((row) =>
              row.slots.map((slot, index) => {
                if (slot.kind === 'spacer') return null
                const style: CSSProperties =
                  slot.kind === 'cell'
                    ? {
                        top: row.y + itemInset,
                        left: PAD_X + index * rowStep + itemInset,
                        width: itemSize,
                        height: itemSize,
                      }
                    : {
                        top: row.y,
                        left: PAD_X + index * rowStep,
                        width: cellW,
                        height: cellW,
                      }
                if (slot.kind === 'tile') {
                  const group = slot.group
                  const cached = groupItems[cacheKey(group.source, group.id)]
                  return (
                    <GroupTile
                      key={slot.key}
                      group={group}
                      open={slot.open}
                      loading={
                        slot.open &&
                        !cached &&
                        Boolean(groupLoading[cacheKey(group.source, group.id)])
                      }
                      compact={compact}
                      tight={tight}
                      style={style}
                      clickMode={groupClickMode}
                      tabIndex={slot.key === (focusedKey ?? firstSlotKey) ? 0 : -1}
                      slotRef={(el) => registerSlot(slot.key, el)}
                      onToggle={() => toggleGroup(group)}
                      onPreview={
                        group.id
                          ? () => {
                              clearSelection()
                              setPreviewGroup({ type: group.source, id: group.id })
                            }
                          : undefined
                      }
                      onDropItems={(ids) => {
                        void addToGroup(group.source, group.id, ids).catch(() => {
                          /* the rail reports drop errors; keep the tile quiet */
                        })
                      }}
                      onMenu={(x, y) =>
                        setMenu({ kind: 'tile', x, y, group, open: slot.open })
                      }
                    />
                  )
                }
                if (slot.kind === 'episode') {
                  return (
                    <EpisodeCard
                      key={slot.key}
                      label={slot.episode.label}
                      meta={`${slot.episode.auto ? 'auto · ' : ''}${slot.count} ${
                        slot.count === 1 ? 'item' : 'items'
                      }`}
                      thumb={slot.episode.thumbnailPath}
                      open={slot.open}
                      style={style}
                      tabIndex={slot.key === (focusedKey ?? firstSlotKey) ? 0 : -1}
                      slotRef={(el) => registerSlot(slot.key, el)}
                      onToggle={() => toggleEpisode(slot.key)}
                      onMenu={(x, y) =>
                        setMenu({
                          kind: 'episode',
                          x,
                          y,
                          ownerType: slot.ownerType,
                          ownerId: slot.ownerId,
                          episodeId: slot.episode.id,
                        })
                      }
                    />
                  )
                }
                if (slot.kind === 'section') {
                  return (
                    <EpisodeCard
                      key={slot.key}
                      label={slot.label}
                      meta={`${slot.count} ${slot.count === 1 ? 'item' : 'items'}`}
                      unassigned
                      style={style}
                      tabIndex={slot.key === (focusedKey ?? firstSlotKey) ? 0 : -1}
                      slotRef={(el) => registerSlot(slot.key, el)}
                      onToggle={() => openEpisodeEditor(slot.ownerType, slot.ownerId)}
                    />
                  )
                }
                const group = slot.group
                const phase = group
                  ? exiting.has(group.key)
                    ? 'exit'
                    : entering.has(group.key)
                      ? 'enter'
                      : undefined
                  : undefined
                const cellStyle: CSSProperties =
                  phase === 'enter'
                    ? {
                        ...style,
                        animationDelay: `${Math.min(slot.order, MAX_STAGGER) * STAGGER_MS}ms`,
                      }
                    : style
                return (
                  <GridCell
                    key={slot.key}
                    item={slot.item}
                    selected={selectedSet.has(slot.item.id)}
                    isCover={group?.coverId === slot.item.id}
                    phase={phase}
                    order={itemOrder}
                    style={cellStyle}
                    tabIndex={slot.key === (focusedKey ?? firstSlotKey) ? 0 : -1}
                    slotRef={(el) => registerSlot(slot.key, el)}
                    onMenu={(x, y) =>
                      setMenu({ kind: 'cell', x, y, item: slot.item, group })
                    }
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

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            menu.kind === 'cell'
              ? buildCellMenu(menu.item, menu.group)
              : menu.kind === 'tile'
                ? buildTileMenu(menu.group, menu.open)
                : buildEpisodeMenu(menu.ownerType, menu.ownerId, menu.episodeId)
          }
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
