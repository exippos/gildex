// Right preview (D7): read-only triage. Owner-polymorphic — item, session,
// collection, or a minimal folder/tag line. Frosted fixed chrome.
import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { mediaUrl, thumbUrl } from '../../api'
import { useStore } from '../../store'
import type { Collection, Item, Session, Status } from '../../types'
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatRange,
} from '../format'
import './right-preview.css'

const STATUSES: ReadonlyArray<{ id: Status; label: string }> = [
  { id: 'draft', label: 'draft' },
  { id: 'wip', label: 'wip' },
  { id: 'final', label: 'final' },
]

function MetaRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

function Media({ item }: { item: Item }) {
  if (item.state === 'missing') {
    return (
      <div className="preview-media preview-missing">
        <span className="preview-danger-tick" aria-hidden="true" />
        <span className="display">missing from disk</span>
      </div>
    )
  }
  if (item.kind === 'video') {
    return (
      <div className="preview-media">
        <video src={mediaUrl(item.id)} controls preload="metadata" />
      </div>
    )
  }
  if (item.kind === 'audio') {
    return (
      <div className="preview-media is-audio">
        <span className="preview-audio-label display">audio</span>
        <audio src={mediaUrl(item.id)} controls preload="metadata" />
      </div>
    )
  }
  return (
    <div className="preview-media">
      <img src={mediaUrl(item.id)} alt={item.relativePath} />
    </div>
  )
}

function ItemPreview({ item }: { item: Item }) {
  const toggleFavorite = useStore((s) => s.toggleFavorite)
  const saveItem = useStore((s) => s.saveItem)
  const openInspector = useStore((s) => s.openInspector)

  const fileName = item.relativePath.split('/').filter(Boolean).pop() ?? item.relativePath
  const dimensions =
    item.width > 0 && item.height > 0 ? `${item.width} × ${item.height}` : ''
  const params: string[] = []
  if (item.modelName) params.push(item.modelName)
  if (item.seed !== null) params.push(`seed ${item.seed}`)
  if (item.steps !== null) params.push(`steps ${item.steps}`)
  if (item.sampler) params.push(item.sampler)
  if (item.cfgScale !== null) params.push(`cfg ${item.cfgScale}`)

  const hasGeneration = Boolean(
    item.prompt ||
      item.negativePrompt ||
      item.modelName ||
      item.seed !== null ||
      item.steps !== null ||
      item.sampler ||
      item.cfgScale !== null,
  )

  return (
    <>
      <Media item={item} />

      <div className="preview-section preview-lead">
        <div className="preview-filename" title={item.relativePath}>
          {fileName}
        </div>
        <div className="preview-sub">
          {item.kind} · {item.format || 'unknown'} · {formatDateTime(item.timestamp)}
        </div>
      </div>

      {hasGeneration && (
        <div className="preview-section">
          <div className="preview-section-label display">generation</div>
          {item.prompt && <div className="preview-prompt-box">{item.prompt}</div>}
          {item.negativePrompt && (
            <div className="preview-prompt-box preview-negative-box">
              <span className="preview-neg-label">negative</span>
              {item.negativePrompt}
            </div>
          )}
          {params.length > 0 && <div className="preview-params">{params.join(' · ')}</div>}
        </div>
      )}

      <div className="preview-section">
        <div className="preview-section-label display">file</div>
        <dl className="preview-meta">
          <MetaRow label="kind" value={item.kind} />
          <MetaRow label="format" value={item.format} />
          <MetaRow label="dimensions" value={dimensions} />
          <MetaRow label="size" value={formatBytes(item.fileSize)} />
          <MetaRow label="duration" value={formatDuration(item.duration)} />
          <MetaRow label="added" value={formatDateTime(item.timestamp)} />
          {item.state === 'missing' && <MetaRow label="state" value="missing" />}
        </dl>
      </div>

      <div className="preview-section">
        <div className="preview-section-label display">triage</div>

        <button
          type="button"
          className={`preview-fav${item.favorite ? ' is-on' : ''}`}
          aria-pressed={item.favorite}
          onClick={() => void toggleFavorite(item.id)}
        >
          <span className="preview-fav-mark" aria-hidden="true" />
          favorite
        </button>

        <div className="preview-rating" role="group" aria-label="Rating">
          <span className="preview-control-label">rating</span>
          <div className="preview-rating-dots">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                className={`preview-rating-dot${rating <= item.rating ? ' is-on' : ''}`}
                aria-label={`${rating} of 5`}
                aria-pressed={rating === item.rating}
                onClick={() =>
                  void saveItem(item.id, {
                    rating: rating === item.rating ? 0 : rating,
                  })
                }
              />
            ))}
          </div>
        </div>

        <div className="preview-status" role="group" aria-label="Status">
          <span className="preview-control-label">status</span>
          <div className="preview-status-row">
            {STATUSES.map((status) => (
              <button
                key={status.id}
                type="button"
                className={`preview-status-button${item.status === status.id ? ' is-active' : ''}`}
                data-status={status.id}
                aria-pressed={item.status === status.id}
                onClick={() => void saveItem(item.id, { status: status.id })}
              >
                {status.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="preview-section preview-actions">
        <button
          type="button"
          className="preview-inspect"
          onClick={() => void openInspector('item', item.id)}
        >
          Inspect
        </button>
      </div>
    </>
  )
}

function SessionPreview({ session, items }: { session: Session; items: Item[] }) {
  const setPreviewItemId = useStore((s) => s.setPreviewItemId)
  const openGroupEditor = useStore((s) => s.openGroupEditor)
  const thumbs = items
    .filter((item) => item.sessionId === session.id && item.thumbnailPath)
    .slice(0, 12)

  return (
    <>
      <div className="preview-section preview-lead">
        <h2 className="preview-title display">{session.label}</h2>
        <div className="preview-sub">{formatRange(session.startsAt, session.endsAt)}</div>
        <div className="preview-sub">{session.itemCount} items</div>
      </div>

      <div className="preview-section">
        <div className="preview-section-label display">strip</div>
        <div className="preview-strip">
          {thumbs.map((item) => {
            const thumb = thumbUrl(item.thumbnailPath)
            if (!thumb) return null
            return (
              <button
                key={item.id}
                type="button"
                className="preview-thumb"
                title={item.relativePath}
                onClick={() => setPreviewItemId(item.id)}
              >
                <img src={thumb} alt="" loading="lazy" />
              </button>
            )
          })}
          {thumbs.length === 0 && session.thumbnailPath && (
            <span className="preview-thumb">
              <img src={thumbUrl(session.thumbnailPath) ?? ''} alt="" loading="lazy" />
            </span>
          )}
          {thumbs.length === 0 && !session.thumbnailPath && (
            <span className="preview-empty-line">no thumbnails</span>
          )}
        </div>
      </div>

      <div className="preview-section preview-actions">
        <button
          type="button"
          className="preview-edit-group"
          onClick={() => openGroupEditor('session', session.id)}
        >
          Edit session
        </button>
      </div>
    </>
  )
}

function CollectionPreview({
  collection,
  items,
}: {
  collection: Collection
  items: Item[]
}) {
  const setPreviewItemId = useStore((s) => s.setPreviewItemId)
  const openGroupEditor = useStore((s) => s.openGroupEditor)
  const thumbs = items.filter((item) => item.thumbnailPath).slice(0, 9)

  return (
    <>
      <div className="preview-section preview-lead">
        <h2 className="preview-title display">{collection.name}</h2>
        {collection.description && (
          <p className="preview-description">{collection.description}</p>
        )}
        <div className="preview-sub">{collection.itemCount} items</div>
      </div>

      <div className="preview-section">
        <div className="preview-section-label display">contents</div>
        <div className="preview-thumb-grid">
          {thumbs.map((item) => {
            const thumb = thumbUrl(item.thumbnailPath)
            if (!thumb) return null
            return (
              <button
                key={item.id}
                type="button"
                className="preview-thumb"
                title={item.relativePath}
                onClick={() => setPreviewItemId(item.id)}
              >
                <img src={thumb} alt="" loading="lazy" />
              </button>
            )
          })}
          {thumbs.length === 0 && (
            <span className="preview-empty-line">no thumbnails yet</span>
          )}
        </div>
      </div>

      <div className="preview-section preview-actions">
        <button
          type="button"
          className="preview-edit-group"
          onClick={() => openGroupEditor('collection', collection.id)}
        >
          Edit collection
        </button>
      </div>
    </>
  )
}

export function RightPreview({ style }: { style?: CSSProperties }) {
  const previewItemId = useStore((s) => s.previewItemId)
  const items = useStore((s) => s.items)
  const sessions = useStore((s) => s.sessions)
  const collections = useStore((s) => s.collections)
  const surface = useStore((s) => s.surface)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const activeCollectionId = useStore((s) => s.activeCollectionId)
  const activeFolder = useStore((s) => s.activeFolder)
  const activeTagFilters = useStore((s) => s.activeTagFilters)
  const itemsTotal = useStore((s) => s.itemsTotal)

  const found = previewItemId ? items.find((item) => item.id === previewItemId) ?? null : null
  const lastItemRef = useRef<Item | null>(null)
  if (found) lastItemRef.current = found
  const item =
    found ?? (lastItemRef.current && lastItemRef.current.id === previewItemId ? lastItemRef.current : null)

  const session =
    !item && surface === 'sessions' && activeSessionId
      ? sessions.find((entry) => entry.id === activeSessionId) ?? null
      : null
  const collection =
    !item && surface === 'collections' && activeCollectionId
      ? collections.find((entry) => entry.id === activeCollectionId) ?? null
      : null

  let kicker = 'preview'
  if (item) kicker = 'item'
  else if (session) kicker = 'session'
  else if (collection) kicker = 'collection'

  return (
    <aside className="right-preview chrome" style={style} aria-label="Quick preview">
      <div className="preview-head">
        <span className="preview-kicker display">{kicker}</span>
      </div>

      <div className="preview-body">
        {item && <ItemPreview item={item} />}

        {!item && session && <SessionPreview session={session} items={items} />}

        {!item && !session && collection && (
          <CollectionPreview collection={collection} items={items} />
        )}

        {!item && !session && !collection && (
          <div className="preview-section preview-minimal">
            {surface === 'all' ? (
              <>
                <span className="preview-title display">library</span>
                <span className="preview-sub">{itemsTotal} items in this library</span>
              </>
            ) : surface === 'folders' ? (
              <>
                <span className="preview-title display">
                  {activeFolder ?? 'directories'}
                </span>
                <span className="preview-sub">{itemsTotal} items in this folder</span>
              </>
            ) : surface === 'tags' ? (
              <>
                <span className="preview-title display">
                  {activeTagFilters.length ? 'tag filters' : 'tags'}
                </span>
                <span className="preview-sub">
                  {activeTagFilters.length
                    ? `${activeTagFilters.join(' + ')} · ${itemsTotal} items`
                    : 'browse the vocabulary in the rail'}
                </span>
              </>
            ) : (
              <>
                <span className="preview-title display">nothing selected</span>
                <span className="preview-sub">
                  click an item to triage it here — double-click for the inspector
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
