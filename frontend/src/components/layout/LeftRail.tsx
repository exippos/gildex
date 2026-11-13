// Left rail: nav (surface switcher) + per-surface content. Frosted fixed chrome.
import { useMemo, useState } from 'react'
import type { CSSProperties, DragEvent } from 'react'
import { useStore } from '../../store'
import { thumbUrl } from '../../api'
import type { Surface } from '../../types'
import { FolderTree } from '../folders/FolderTree'
import { formatRange } from '../format'
import { readDraggedItemIds } from '../groups/drag'
import './left-rail.css'

const TABS: ReadonlyArray<{ id: Surface; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'collections', label: 'Collections' },
  { id: 'folders', label: 'Folders' },
  { id: 'tags', label: 'Tags' },
]

export function LeftRail({ style }: { style?: CSSProperties }) {
  const surface = useStore((s) => s.surface)
  const setSurface = useStore((s) => s.setSurface)
  const loadItems = useStore((s) => s.loadItems)
  const setPreviewItemId = useStore((s) => s.setPreviewItemId)

  const sessions = useStore((s) => s.sessions)
  const collections = useStore((s) => s.collections)
  const tags = useStore((s) => s.tags)
  const library = useStore((s) => s.library)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const activeCollectionId = useStore((s) => s.activeCollectionId)
  const activeTagFilters = useStore((s) => s.activeTagFilters)

  const setActiveSessionId = useStore((s) => s.setActiveSessionId)
  const setActiveCollectionId = useStore((s) => s.setActiveCollectionId)
  const toggleTagFilter = useStore((s) => s.toggleTagFilter)
  const clearTagFilters = useStore((s) => s.clearTagFilters)
  const openGroupEditor = useStore((s) => s.openGroupEditor)
  const addToGroup = useStore((s) => s.addToGroup)

  const [tagQuery, setTagQuery] = useState('')
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [createOver, setCreateOver] = useState(false)
  const [dragError, setDragError] = useState<string | null>(null)

  const visibleTags = useMemo(() => {
    const needle = tagQuery.trim().toLowerCase()
    if (!needle) return tags
    return tags.filter((tag) => tag.name.toLowerCase().includes(needle))
  }, [tags, tagQuery])

  const chooseSurface = (next: Surface) => {
    setSurface(next)
    setPreviewItemId(null)
    void loadItems()
  }

  const chooseSession = (id: string | null) => {
    setActiveSessionId(id)
    setPreviewItemId(null)
  }

  const chooseCollection = (id: string | null) => {
    setActiveCollectionId(id)
    setPreviewItemId(null)
  }

  const dropOnGroup = async (
    event: DragEvent,
    type: 'session' | 'collection',
    id: string,
  ) => {
    event.preventDefault()
    setDragOverId(null)
    const ids = readDraggedItemIds(event.dataTransfer)
    if (!ids.length) return
    setDragError(null)
    try {
      await addToGroup(type, id, ids)
    } catch (err) {
      setDragError((err as Error).message)
    }
  }

  const dropToCreate = (event: DragEvent) => {
    event.preventDefault()
    setCreateOver(false)
    const ids = readDraggedItemIds(event.dataTransfer)
    if (!ids.length) return
    setDragError(null)
    if (surface !== 'collections') chooseSurface('collections')
    openGroupEditor('collection', null, ids)
  }

  // Drag events fire for every child the pointer crosses; only clear when the
  // pointer really left the drop wrapper.
  const leaves = (event: DragEvent) => {
    const next = event.relatedTarget as Node | null
    return !next || !event.currentTarget.contains(next)
  }

  return (
    <aside className="left-rail chrome" style={style} aria-label="Library navigation">
      <div className="rail-nav">
        <div className="rail-label">browse</div>
        {TABS.map((tab) => {
          const collectionsTab = tab.id === 'collections'
          return (
            <button
              key={tab.id}
              type="button"
              className={`rail-nav-item${tab.id === surface ? ' is-active' : ''}${
                collectionsTab && createOver ? ' is-drop-target' : ''
              }`}
              aria-current={tab.id === surface ? 'page' : undefined}
              title={
                collectionsTab ? 'Drop items here to start a collection' : undefined
              }
              onClick={() => chooseSurface(tab.id)}
              onDragOver={
                collectionsTab
                  ? (event) => {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'copy'
                      setCreateOver(true)
                    }
                  : undefined
              }
              onDragLeave={
                collectionsTab
                  ? (event) => {
                      if (leaves(event)) setCreateOver(false)
                    }
                  : undefined
              }
              onDrop={collectionsTab ? dropToCreate : undefined}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="rail-body">
        {surface === 'all' && (
          <>
            <div className="rail-label">library</div>
            <div className="rail-hint">
              {library?.rootSet
                ? `${library.itemCount} ${library.itemCount === 1 ? 'item' : 'items'} in ${library.root}`
                : 'no library root set'}
            </div>
          </>
        )}

        {surface === 'sessions' && (
          <>
            <div className="rail-label">sessions</div>
            <div className="rail-list">
              <button
                type="button"
                className={`rail-row${activeSessionId === null ? ' is-active' : ''}`}
                onClick={() => chooseSession(null)}
              >
                <span className="rail-row-title">All sessions</span>
                <span className="rail-row-meta">{sessions.length} sessions</span>
              </button>
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`rail-row-wrap${dragOverId === session.id ? ' is-drop-target' : ''}`}
                  title="Drag items here to add them to this session"
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'copy'
                    setDragOverId(session.id)
                  }}
                  onDragLeave={(event) => {
                    if (leaves(event)) setDragOverId(null)
                  }}
                  onDrop={(event) => void dropOnGroup(event, 'session', session.id)}
                >
                  <button
                    type="button"
                    className={`rail-row rail-row-session${
                      activeSessionId === session.id ? ' is-active' : ''
                    }`}
                    onClick={() => chooseSession(session.id)}
                  >
                    <span className="rail-row-thumb" aria-hidden="true">
                      {session.thumbnailPath ? (
                        <img
                          src={thumbUrl(session.thumbnailPath)!}
                          alt=""
                          loading="lazy"
                          draggable={false}
                        />
                      ) : (
                        <span className="rail-row-thumb-empty" />
                      )}
                    </span>
                    <span className="rail-row-text">
                      <span className="rail-row-title">{session.label}</span>
                      <span className="rail-row-meta">
                        {formatRange(session.startsAt, session.endsAt)}
                        <span className="rail-row-count">{session.itemCount}</span>
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="rail-row-edit"
                    title="Edit session"
                    aria-label={`Edit ${session.label}`}
                    onClick={() => openGroupEditor('session', session.id)}
                  >
                    edit
                  </button>
                </div>
              ))}
              {sessions.length === 0 && <div className="rail-hint">no sessions yet</div>}
            </div>
          </>
        )}

        {surface === 'collections' && (
          <>
            <div className="rail-label">collections</div>
            <div className="rail-list">
              <button
                type="button"
                className={`rail-row${activeCollectionId === null ? ' is-active' : ''}`}
                onClick={() => chooseCollection(null)}
              >
                <span className="rail-row-title">All collections</span>
              </button>
              {collections.map((collection) => (
                <div
                  key={collection.id}
                  className={`rail-row-wrap${dragOverId === collection.id ? ' is-drop-target' : ''}`}
                  title="Drag items here to add them to this collection"
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'copy'
                    setDragOverId(collection.id)
                  }}
                  onDragLeave={(event) => {
                    if (leaves(event)) setDragOverId(null)
                  }}
                  onDrop={(event) => void dropOnGroup(event, 'collection', collection.id)}
                >
                  <button
                    type="button"
                    className={`rail-row rail-row-session${activeCollectionId === collection.id ? ' is-active' : ''}`}
                    onClick={() => chooseCollection(collection.id)}
                  >
                    <span className="rail-row-thumb" aria-hidden="true">
                      {collection.thumbnailPath ? (
                        <img
                          src={thumbUrl(collection.thumbnailPath)!}
                          alt=""
                          loading="lazy"
                          draggable={false}
                        />
                      ) : (
                        <span className="rail-row-thumb-empty" />
                      )}
                    </span>
                    <span className="rail-row-text">
                      <span className="rail-row-title">{collection.name}</span>
                      <span className="rail-row-meta">
                        <span className="rail-row-count">{collection.itemCount}</span>
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="rail-row-edit"
                    title="Edit collection"
                    aria-label={`Edit ${collection.name}`}
                    onClick={() => openGroupEditor('collection', collection.id)}
                  >
                    edit
                  </button>
                </div>
              ))}
              {collections.length === 0 && <div className="rail-hint">no collections yet</div>}
              {dragError && <div className="rail-hint rail-hint-error">{dragError}</div>}
            </div>
            <button
              type="button"
              className={`rail-new${createOver ? ' is-drop-target' : ''}`}
              title="Drop items here to start a collection"
              onClick={() => openGroupEditor('collection', null)}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
                setCreateOver(true)
              }}
              onDragLeave={(event) => {
                if (leaves(event)) setCreateOver(false)
              }}
              onDrop={dropToCreate}
            >
              {createOver ? 'drop to create a collection' : '+ New collection'}
            </button>
          </>
        )}

        {surface === 'folders' && (
          <>
            <div className="rail-label">folders</div>
            <FolderTree />
          </>
        )}

        {surface === 'tags' && (
          <>
            <div className="rail-label">tags</div>
            <div className="rail-tag-filter">
              <input
                type="search"
                value={tagQuery}
                onChange={(event) => setTagQuery(event.target.value)}
                placeholder="filter tags"
                aria-label="Filter tags"
              />
            </div>
            {activeTagFilters.length > 0 && (
              <button type="button" className="rail-clear-tags" onClick={clearTagFilters}>
                clear {activeTagFilters.length} active
              </button>
            )}
            <div className="rail-list rail-tag-list">
              {visibleTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={`rail-row rail-tag-row${
                    activeTagFilters.includes(tag.name) ? ' is-active' : ''
                  }`}
                  aria-pressed={activeTagFilters.includes(tag.name)}
                  onClick={() => toggleTagFilter(tag.name)}
                >
                  <span className="rail-row-title">{tag.name}</span>
                  <span className="rail-row-meta">
                    <span className="rail-row-count">{tag.itemCount}</span>
                  </span>
                </button>
              ))}
              {visibleTags.length === 0 && <div className="rail-hint">no tags match</div>}
            </div>
          </>
        )}

      </div>

    </aside>
  )
}
