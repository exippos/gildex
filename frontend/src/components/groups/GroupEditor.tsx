// Group editor for sessions and collections: rename, manage membership, and
// pick the label image (cover) shown on the group tile. Reads store.groupEditor.
// Centered over a scrim; flat panel, hairline rules, gilt only on the edge.
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { thumbUrl } from '../../api'
import { useStore } from '../../store'
import '../collections/collections.css'

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

export function GroupEditor() {
  const editor = useStore((s) => s.groupEditor)
  const sessions = useStore((s) => s.sessions)
  const collections = useStore((s) => s.collections)
  const items = useStore((s) => s.groupEditorItems)
  const itemsLoading = useStore((s) => s.groupEditorLoading)
  const pickerResults = useStore((s) => s.groupPickerResults)

  const closeGroupEditor = useStore((s) => s.closeGroupEditor)
  const createCollection = useStore((s) => s.createCollection)
  const updateCollection = useStore((s) => s.updateCollection)
  const updateSession = useStore((s) => s.updateSession)
  const deleteCollection = useStore((s) => s.deleteCollection)
  const addToGroup = useStore((s) => s.addToGroup)
  const removeFromGroup = useStore((s) => s.removeFromGroup)
  const setGroupCover = useStore((s) => s.setGroupCover)
  const searchGroupPicker = useStore((s) => s.searchGroupPicker)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const type = editor?.type ?? 'collection'
  const id = editor?.id ?? null
  const pendingItemIds = editor?.pendingItemIds ?? []
  const isNew = id === null

  const session = id && type === 'session' ? sessions.find((s) => s.id === id) : undefined
  const collection =
    id && type === 'collection' ? collections.find((c) => c.id === id) : undefined
  const record = type === 'session' ? session : collection
  const coverId = record?.coverItemId ?? null

  // Seed the fields when the editor switches target, not on every catalog
  // refresh (a rename should not clobber what the user is typing).
  useEffect(() => {
    if (!editor) return
    if (editor.type === 'session') {
      const next = editor.id ? sessions.find((s) => s.id === editor.id) : undefined
      setName(next?.label ?? '')
      setDescription('')
    } else {
      const next = editor.id ? collections.find((c) => c.id === editor.id) : undefined
      setName(next?.name ?? '')
      setDescription(next?.description ?? '')
    }
    setQuery('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.type, editor?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeGroupEditor()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeGroupEditor])

  // Debounced library search for the "add items" picker.
  useEffect(() => {
    if (!id) return
    const timer = window.setTimeout(() => void searchGroupPicker(query), 220)
    return () => window.clearTimeout(timer)
  }, [query, id, searchGroupPicker])

  const memberIds = useMemo(() => new Set(items.map((item) => item.id)), [items])
  const addable = pickerResults
    .filter((item) => !memberIds.has(item.id))
    .slice(0, 24)

  if (!editor) return null

  const close = () => {
    if (!busy) closeGroupEditor()
  }

  const notFound = !isNew && !record
  const count = isNew ? pendingItemIds.length : record?.itemCount ?? 0
  const title = isNew ? 'new collection' : type === 'session' ? 'edit session' : 'edit collection'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      if (isNew) {
        if (type !== 'collection') return
        await createCollection(trimmed, description.trim(), pendingItemIds)
      } else if (type === 'session') {
        await updateSession(id, { label: trimmed })
      } else {
        await updateCollection(id, { name: trimmed, description: description.trim() })
      }
      closeGroupEditor()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const add = async (itemId: string) => {
    if (!id || busy) return
    setBusy(true)
    setError(null)
    try {
      await addToGroup(type, id, [itemId])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (itemId: string) => {
    if (!id || busy) return
    setBusy(true)
    setError(null)
    try {
      await removeFromGroup(type, id, itemId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const toggleCover = async (itemId: string) => {
    if (!id || busy) return
    setBusy(true)
    setError(null)
    try {
      await setGroupCover(type, id, coverId === itemId ? null : itemId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const destroy = async () => {
    if (!id || busy || type !== 'collection') return
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
      closeGroupEditor()
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
        aria-labelledby="group-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="col-head">
          <h2 className="col-title display" id="group-editor-title">
            {title}
          </h2>
          <button type="button" className="col-x" aria-label="close" onClick={close}>
            ×
          </button>
        </header>

        {notFound ? (
          <>
            <div className="col-body">
              <p className="col-hint">this {type} is no longer in the catalog.</p>
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
                  placeholder={type === 'session' ? 'session name' : 'collection name'}
                  aria-label={type === 'session' ? 'session name' : 'collection name'}
                  autoFocus
                />
              </label>

              {type === 'collection' && (
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
              )}

              {isNew ? (
                <div className="col-section">
                  <div className="col-section-head">
                    <span className="col-label display">items</span>
                    <span className="col-count">{count}</span>
                  </div>
                  <p className="col-hint">
                    {count > 0
                      ? `${count} ${count === 1 ? 'item' : 'items'} will be added when the collection is created.`
                      : 'the collection starts empty — drag items onto it later.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="col-section">
                    <div className="col-section-head">
                      <span className="col-label display">items</span>
                      <span className="col-count">
                        {itemsLoading ? 'loading…' : count}
                      </span>
                    </div>

                    {items.length > 0 ? (
                      <ul className="col-items">
                        {items.map((it) => {
                          const src = thumbUrl(it.thumbnailPath)
                          const isCover = coverId === it.id
                          return (
                            <li
                              className={`col-item${isCover ? ' is-cover' : ''}`}
                              key={it.id}
                            >
                              <span className="col-item-thumb">
                                {src ? (
                                  <img src={src} alt="" loading="lazy" />
                                ) : (
                                  <span className="col-item-empty" aria-hidden="true" />
                                )}
                              </span>
                              <span className="col-item-text">
                                <span className="col-item-name">
                                  {basename(it.relativePath)}
                                </span>
                                <span className="col-item-meta">
                                  {it.kind}
                                  {it.state === 'missing' ? ' · missing' : ''}
                                  {isCover ? ' · label image' : ''}
                                </span>
                              </span>
                              <button
                                type="button"
                                className={`col-item-cover${isCover ? ' is-on' : ''}`}
                                aria-pressed={isCover}
                                disabled={busy || !src}
                                title={
                                  src
                                    ? isCover
                                      ? 'Clear the label image'
                                      : 'Use as the group label image'
                                    : 'This item has no thumbnail'
                                }
                                onClick={() => void toggleCover(it.id)}
                              >
                                {isCover ? 'cover ✓' : 'cover'}
                              </button>
                              <button
                                type="button"
                                className="col-item-remove"
                                disabled={busy}
                                onClick={() => void remove(it.id)}
                              >
                                remove
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      !itemsLoading && (
                        <p className="col-hint">
                          this {type} is empty — add items below.
                        </p>
                      )
                    )}
                  </div>

                  <div className="col-section">
                    <div className="col-section-head">
                      <span className="col-label display">add items</span>
                      <span className="col-count">{addable.length} shown</span>
                    </div>
                    <input
                      type="search"
                      className="col-add-search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="search the library"
                      aria-label="Search library items to add"
                    />
                    {addable.length > 0 ? (
                      <div className="col-add-grid">
                        {addable.map((it) => {
                          const src = thumbUrl(it.thumbnailPath)
                          return (
                            <button
                              key={it.id}
                              type="button"
                              className="col-add-item"
                              title={`Add ${basename(it.relativePath)}`}
                              aria-label={`Add ${basename(it.relativePath)}`}
                              disabled={busy}
                              onClick={() => void add(it.id)}
                            >
                              {src ? (
                                <img src={src} alt="" loading="lazy" />
                              ) : (
                                <span className="col-add-empty" aria-hidden="true" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="col-hint">no more items match.</p>
                    )}
                  </div>
                </>
              )}

              {error && <p className="col-error">{error}</p>}
            </div>

            <footer className="col-foot">
              {!isNew && type === 'collection' && (
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
              <button type="submit" className="col-primary" disabled={busy || !name.trim()}>
                {busy ? 'saving…' : isNew ? 'create' : 'save'}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  )
}
