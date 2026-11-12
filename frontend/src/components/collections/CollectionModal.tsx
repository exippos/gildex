// Create / edit collection modal. Reads store.collectionModal.
// Centered over a scrim; flat panel, hairline rules, gilt only on the edge.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { thumbUrl } from '../../api'
import { useStore } from '../../store'
import './collections.css'

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

export function CollectionModal() {
  const modal = useStore((s) => s.collectionModal)
  const collections = useStore((s) => s.collections)
  const items = useStore((s) => s.items)
  const surface = useStore((s) => s.surface)
  const activeCollectionId = useStore((s) => s.activeCollectionId)
  const closeCollectionModal = useStore((s) => s.closeCollectionModal)
  const createCollection = useStore((s) => s.createCollection)
  const updateCollection = useStore((s) => s.updateCollection)
  const deleteCollection = useStore((s) => s.deleteCollection)
  const removeFromCollection = useStore((s) => s.removeFromCollection)

  const id = modal?.id ?? null
  const collection = id ? collections.find((c) => c.id === id) : undefined

  const [name, setName] = useState(collection?.name ?? '')
  const [description, setDescription] = useState(collection?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(collection?.name ?? '')
    setDescription(collection?.description ?? '')
    // Re-seed only when the modal switches target, not on every catalog refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCollectionModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeCollectionModal])

  if (!modal) return null

  const close = () => {
    if (!busy) closeCollectionModal()
  }

  const notFound = id !== null && !collection
  const activeHere = id !== null && surface === 'collections' && activeCollectionId === id
  const collectionItems = activeHere ? items : []

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      if (id) {
        await updateCollection(id, { name: trimmed, description: description.trim() })
      } else {
        await createCollection(trimmed, description.trim())
      }
      closeCollectionModal()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (itemId: string) => {
    if (!id) return
    setError(null)
    try {
      await removeFromCollection(id, itemId)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const destroy = async () => {
    if (!id || busy) return
    if (
      !window.confirm(
        `Delete “${collection?.name ?? 'this collection'}”? Items stay in the library; only the collection is removed.`,
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await deleteCollection(id)
      closeCollectionModal()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="col-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        className="col-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="col-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="col-head">
          <h2 className="col-title display" id="col-modal-title">
            {id ? 'edit collection' : 'new collection'}
          </h2>
          <button type="button" className="col-x" aria-label="close" onClick={close}>
            ×
          </button>
        </header>

        {notFound ? (
          <>
            <div className="col-body">
              <p className="col-hint">this collection is no longer in the catalog.</p>
            </div>
            <footer className="col-foot">
              <span className="col-foot-spacer" />
              <button type="button" onClick={close}>
                close
              </button>
            </footer>
          </>
        ) : (
          <form className="col-form" onSubmit={(e) => void submit(e)}>
            <div className="col-body">
              <label className="col-field">
                <span className="col-label display">name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="collection name"
                  aria-label="collection name"
                  autoFocus
                />
              </label>

              <label className="col-field">
                <span className="col-label display">description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="what holds these together?"
                  aria-label="collection description"
                />
              </label>

              {id && (
                <div className="col-section">
                  <div className="col-section-head">
                    <span className="col-label display">items</span>
                    <span className="col-count">{collection?.itemCount ?? 0}</span>
                  </div>

                  {activeHere ? (
                    collectionItems.length > 0 ? (
                      <ul className="col-items">
                        {collectionItems.map((it) => {
                          const src = thumbUrl(it.thumbnailPath)
                          return (
                            <li className="col-item" key={it.id}>
                              <span className="col-item-thumb">
                                {src ? (
                                  <img src={src} alt="" loading="lazy" />
                                ) : (
                                  <span className="col-item-empty" aria-hidden="true" />
                                )}
                              </span>
                              <span className="col-item-text">
                                <span className="col-item-name">{basename(it.relativePath)}</span>
                                <span className="col-item-meta">
                                  {it.kind}
                                  {it.state === 'missing' ? ' · missing' : ''}
                                </span>
                              </span>
                              <button
                                type="button"
                                className="col-item-remove"
                                onClick={() => void remove(it.id)}
                              >
                                remove
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="col-hint">this collection is empty.</p>
                    )
                  ) : (
                    <p className="col-hint">open this collection to manage its items.</p>
                  )}
                </div>
              )}

              {error && <p className="col-error">{error}</p>}
            </div>

            <footer className="col-foot">
              {id && (
                <button
                  type="button"
                  className="col-danger"
                  onClick={() => void destroy()}
                  disabled={busy}
                >
                  delete collection
                </button>
              )}
              <span className="col-foot-spacer" />
              <button type="button" onClick={close} disabled={busy}>
                cancel
              </button>
              <button
                type="submit"
                className="col-primary"
                disabled={busy || !name.trim()}
              >
                {busy ? 'saving…' : id ? 'save' : 'create'}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  )
}
