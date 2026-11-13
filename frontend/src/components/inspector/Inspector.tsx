// Full-screen deep inspection surface (D7): story view + notes.
// Owner-polymorphic over item / session / collection. Reads only store state.
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { thumbUrl } from '../../api'
import { useStore } from '../../store'
import type { Collection, Item, Session } from '../../types'
import { NotesPanel } from './NotesPanel'
import { StoryView } from './StoryView'
import './inspector.css'

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

function itemLabel(item: Item): string {
  return basename(item.relativePath) || item.id
}

function fmtDate(ms: number): string {
  const d = new Date(ms)
  return `${d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

function fmtRange(startsAt: number, endsAt: number): string {
  return `${fmtDate(startsAt)} — ${fmtDate(endsAt)}`
}

function ThumbStrip({ items, onOpen }: { items: Item[]; onOpen: (item: Item) => void }) {
  const shown = items.slice(0, 48)
  return (
    <div className="insp-strip">
      {shown.map((it) => {
        const src = thumbUrl(it.thumbnailPath)
        return (
          <button
            key={it.id}
            type="button"
            className={`insp-thumb${it.state === 'missing' ? ' is-missing' : ''}`}
            onClick={() => onOpen(it)}
            title={itemLabel(it)}
            aria-label={`open ${itemLabel(it)}`}
          >
            {src ? (
              <img src={src} alt="" loading="lazy" />
            ) : (
              <span className="insp-thumb-empty" aria-hidden="true" />
            )}
            {it.state === 'missing' && <span className="insp-thumb-tick" aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}

function SessionView({
  session,
  items,
  onOpen,
}: {
  session: Session
  items: Item[]
  onOpen: (item: Item) => void
}) {
  const loaded = items.filter((i) => i.sessionId === session.id)
  const remainder = session.itemCount - loaded.length

  return (
    <section className="insp-summary" aria-label="session summary">
      <h2 className="insp-name display">{session.label}</h2>
      <dl className="insp-facts">
        <div className="insp-fact">
          <dt>range</dt>
          <dd>{fmtRange(session.startsAt, session.endsAt)}</dd>
        </div>
        <div className="insp-fact">
          <dt>items</dt>
          <dd>{session.itemCount}</dd>
        </div>
      </dl>

      {loaded.length > 0 ? (
        <>
          <div className="insp-strip-label display">loaded stills</div>
          <ThumbStrip items={loaded} onOpen={onOpen} />
          {remainder > 0 && (
            <p className="insp-note">…{remainder} more not loaded in this view.</p>
          )}
        </>
      ) : (
        <p className="insp-note">
          {session.itemCount === 0
            ? 'empty session.'
            : 'session items are not loaded in this view.'}
        </p>
      )}
    </section>
  )
}

function CollectionView({
  collection,
  items,
  isActive,
  onOpen,
}: {
  collection: Collection
  items: Item[]
  isActive: boolean
  onOpen: (item: Item) => void
}) {
  const scoped = isActive ? items : []
  const counts = new Map<string, number>()
  for (const it of scoped) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1)
  const breakdown = [...counts.entries()].map(([kind, n]) => `${n} ${kind}`).join(' · ')

  return (
    <section className="insp-summary" aria-label="collection summary">
      <h2 className="insp-name display">{collection.name}</h2>
      <p className={`insp-desc${collection.description ? '' : ' is-empty'}`}>
        {collection.description || 'no description.'}
      </p>
      <dl className="insp-facts">
        <div className="insp-fact">
          <dt>items</dt>
          <dd>{collection.itemCount}</dd>
        </div>
        {breakdown && (
          <div className="insp-fact">
            <dt>contents</dt>
            <dd>{breakdown}</dd>
          </div>
        )}
      </dl>

      {scoped.length > 0 ? (
        <>
          <div className="insp-strip-label display">stills</div>
          <ThumbStrip items={scoped} onOpen={onOpen} />
        </>
      ) : (
        collection.itemCount > 0 && (
          <p className="insp-note">open the collection to see its stills.</p>
        )
      )}
    </section>
  )
}

export function Inspector() {
  const inspector = useStore((s) => s.inspector)
  const items = useStore((s) => s.items)
  const sessions = useStore((s) => s.sessions)
  const collections = useStore((s) => s.collections)
  const surface = useStore((s) => s.surface)
  const activeCollectionId = useStore((s) => s.activeCollectionId)
  const openInspector = useStore((s) => s.openInspector)
  const closeInspector = useStore((s) => s.closeInspector)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeInspector()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeInspector])

  if (!inspector) return null

  const { ownerType, ownerId, ownerLabel } = inspector
  const item = ownerType === 'item' ? items.find((i) => i.id === ownerId) : undefined
  const session = ownerType === 'session' ? sessions.find((s) => s.id === ownerId) : undefined
  const collection =
    ownerType === 'collection' ? collections.find((c) => c.id === ownerId) : undefined

  const fallbackLabel = ownerLabel || `untitled ${ownerType}`
  const title =
    ownerType === 'item'
      ? item
        ? itemLabel(item)
        : fallbackLabel
      : ownerType === 'session'
        ? session?.label ?? fallbackLabel
        : collection?.name ?? fallbackLabel

  const kicker =
    ownerType === 'item' && item ? `item · ${item.kind}` : ownerType

  const openItem = (it: Item) => {
    void openInspector('item', it.id, itemLabel(it))
  }

  let body: ReactNode
  if (ownerType === 'item') {
    body = item ? (
      <>
        <StoryView key={item.id} item={item} />
        <NotesPanel key={`notes-${ownerId}`} />
      </>
    ) : (
      <p className="insp-empty display">item not loaded — reopen it from the grid.</p>
    )
  } else if (ownerType === 'session') {
    body = session ? (
      <>
        <SessionView session={session} items={items} onOpen={openItem} />
        <NotesPanel key={`notes-${ownerId}`} />
      </>
    ) : (
      <p className="insp-empty display">session not loaded.</p>
    )
  } else {
    body = collection ? (
      <>
        <CollectionView
          collection={collection}
          items={items}
          isActive={surface === 'collections' && activeCollectionId === collection.id}
          onOpen={openItem}
        />
        <NotesPanel key={`notes-${ownerId}`} />
      </>
    ) : (
      <p className="insp-empty display">collection not loaded.</p>
    )
  }

  return (
    <div className="insp" role="dialog" aria-modal="true" aria-label={`${ownerType} inspector`}>
      <header className="chrome insp-header">
        <button type="button" className="insp-back" onClick={closeInspector}>
          <span aria-hidden="true">←</span> back
        </button>
        <div className="insp-heading">
          <div className="insp-kicker display">{kicker}</div>
          <h1 className="insp-title display" title={title}>
            {title}
          </h1>
        </div>
        <button
          type="button"
          className="insp-detach"
          title="Detached windows arrive with the desktop shell — not in this prototype."
          aria-label="detached window (unavailable in this prototype)"
        >
          detach
        </button>
      </header>
      <div className="insp-body">
        <div className="insp-inner">{body}</div>
      </div>
    </div>
  )
}
