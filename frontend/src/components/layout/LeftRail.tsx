// Left rail: nav (surface switcher) + per-surface content. Frosted fixed chrome.
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '../../store'
import { thumbUrl } from '../../api'
import type { Surface } from '../../types'
import { FolderTree } from '../folders/FolderTree'
import { formatRange } from '../format'
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
  const openCollectionModal = useStore((s) => s.openCollectionModal)

  const [tagQuery, setTagQuery] = useState('')

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

  return (
    <aside className="left-rail chrome" style={style} aria-label="Library navigation">
      <div className="rail-nav">
        <div className="rail-label">browse</div>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`rail-nav-item${tab.id === surface ? ' is-active' : ''}`}
            aria-current={tab.id === surface ? 'page' : undefined}
            onClick={() => chooseSurface(tab.id)}
          >
            {tab.label}
          </button>
        ))}
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
                <button
                  key={session.id}
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
                <button
                  key={collection.id}
                  type="button"
                  className={`rail-row${activeCollectionId === collection.id ? ' is-active' : ''}`}
                  onClick={() => chooseCollection(collection.id)}
                >
                  <span className="rail-row-title">{collection.name}</span>
                  <span className="rail-row-meta">
                    <span className="rail-row-count">{collection.itemCount}</span>
                  </span>
                </button>
              ))}
              {collections.length === 0 && <div className="rail-hint">no collections yet</div>}
            </div>
            <button
              type="button"
              className="rail-new"
              onClick={() => openCollectionModal(null)}
            >
              + New collection
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
