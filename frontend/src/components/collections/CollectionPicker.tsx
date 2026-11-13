// Pick a collection to add the pending selection to. Reads store.collectionPicker.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useStore } from '../../store'
import './collections.css'

export function CollectionPicker() {
  const picker = useStore((s) => s.collectionPicker)
  const collections = useStore((s) => s.collections)
  const addToCollection = useStore((s) => s.addToCollection)
  const createCollection = useStore((s) => s.createCollection)
  const closeCollectionPicker = useStore((s) => s.closeCollectionPicker)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCollectionPicker()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeCollectionPicker])

  if (!picker) return null

  const itemIds = picker.itemIds
  const count = itemIds.length
  const label = `${count} ${count === 1 ? 'item' : 'items'}`

  const close = () => {
    if (!busy) closeCollectionPicker()
  }

  const pick = async (collectionId: string) => {
    if (busy || count === 0) return
    setBusy(true)
    setError(null)
    try {
      await addToCollection(collectionId, itemIds)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const createAndAdd = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy || count === 0) return
    setBusy(true)
    setError(null)
    try {
      const createdId = await createCollection(trimmed, '')
      if (!createdId) {
        setError('could not create the collection.')
        return
      }
      await addToCollection(createdId, itemIds)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const cancelCreate = () => {
    setCreating(false)
    setName('')
    setError(null)
  }

  return (
    <div
      className="col-overlay col-overlay--picker"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        className="col-panel col-panel--picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="col-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="col-head">
          <h2 className="col-title display" id="col-picker-title">
            add to collection
          </h2>
          <button type="button" className="col-x" aria-label="close" onClick={close}>
            ×
          </button>
        </header>

        <div className="col-body">
          <p className="col-hint">{label} selected.</p>

          {collections.length > 0 ? (
            <ul className="col-picker-list">
              {collections.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="col-picker-row"
                    onClick={() => void pick(c.id)}
                    disabled={busy || count === 0}
                  >
                    <span className="col-picker-name">{c.name}</span>
                    <span className="col-picker-count">{c.itemCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="col-hint">no collections yet.</p>
          )}

          {creating ? (
            <form className="col-new" onSubmit={(e) => void createAndAdd(e)}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="new collection name"
                aria-label="new collection name"
                autoFocus
              />
              <div className="col-new-actions">
                <button
                  type="submit"
                  className="col-primary"
                  disabled={busy || !name.trim() || count === 0}
                >
                  {busy ? 'creating…' : 'create + add'}
                </button>
                <button type="button" onClick={cancelCreate} disabled={busy}>
                  cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="col-picker-new"
              onClick={() => setCreating(true)}
              disabled={busy}
            >
              new collection…
            </button>
          )}

          {error && <p className="col-error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
