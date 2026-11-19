// Group editor for sessions and collections: rename, manage membership, and
// pick the label image (cover) shown on the group tile. Reads store.groupEditor.
// Centered over a scrim; flat panel, hairline rules, gilt only on the edge.
import { useEffect, useMemo, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { thumbUrl } from '../../api'
import { useStore, isNsfwBlurred } from '../../store'
import type { Item } from '../../types'
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
  const librarySettings = useStore((s) => s.librarySettings)

  const closeGroupEditor = useStore((s) => s.closeGroupEditor)
  const createCollection = useStore((s) => s.createCollection)
  const updateCollection = useStore((s) => s.updateCollection)
  const updateSession = useStore((s) => s.updateSession)
  const deleteCollection = useStore((s) => s.deleteCollection)
  const addToGroup = useStore((s) => s.addToGroup)
  const removeFromGroup = useStore((s) => s.removeFromGroup)
  const setGroupCover = useStore((s) => s.setGroupCover)
  const searchGroupPicker = useStore((s) => s.searchGroupPicker)
  const reorderCollection = useStore((s) => s.reorderCollection)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sorted, setSorted] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Reorder state for the collection member list.
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [overAfter, setOverAfter] = useState(false)

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
      setSorted(false)
    } else {
      const next = editor.id ? collections.find((c) => c.id === editor.id) : undefined
      setName(next?.name ?? '')
      setDescription(next?.description ?? '')
      setSorted(next?.sorted ?? false)
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

  // Working copy of the member list so a drag reorder reads back instantly;
  // re-synced whenever the source list changes (e.g. after a persist).
  const [ordered, setOrdered] = useState<Item[]>(items)
  useEffect(() => setOrdered(items), [items])

  const canReorder = type === 'collection' && !isNew

  const startReorder = (index: number, event: DragEvent<HTMLLIElement>) => {
    if (!canReorder) return
    setDragIndex(index)
    setOverIndex(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  const handleReorderOver = (index: number, event: DragEvent<HTMLLIElement>) => {
    if (!canReorder || dragIndex === null) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    setOverIndex(index)
    setOverAfter(event.clientY > rect.top + rect.height / 2)
  }

  const handleReorderDrop = (index: number, event: DragEvent<HTMLLIElement>) => {
    event.preventDefault()
    if (!canReorder || dragIndex === null || !id) return
    const from = dragIndex
    const targetPos = index + (overAfter ? 1 : 0)
    const next = ordered.slice()
    const [moved] = next.splice(from, 1)
    const insertAt = from < targetPos ? targetPos - 1 : targetPos
    next.splice(insertAt, 0, moved)
    setOrdered(next)
    setDragIndex(null)
    setOverIndex(null)
    void reorderCollection(id, next.map((it) => it.id))
  }

  const endReorder = () => {
    setDragIndex(null)
    setOverIndex(null)
  }

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
        await updateCollection(id, { name: trimmed, description: description.trim(), sorted })
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

              {type === 'collection' && !isNew && (
                <label className="col-check">
                  <input
                    type="checkbox"
                    checked={sorted}
                    onChange={(e) => setSorted(e.target.checked)}
                  />
                  <span className="col-check-text">
                    <span className="col-label display">sorted</span>
                    <span className="col-hint">
                      mark as curated — tells sorted collections from raw ones
                    </span>
                  </span>
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

                    {ordered.length > 0 ? (
                      <ul className="col-items">
                        {ordered.map((it, index) => {
                          const src = thumbUrl(it.thumbnailPath)
                          const isCover = coverId === it.id
                          const nsfw = isNsfwBlurred(it, librarySettings)
                          const overClass =
                            overIndex === index
                              ? overAfter
                                ? ' is-reorder-over-after'
                                : ' is-reorder-over-before'
                              : ''
                          return (
                            <li
                              className={`col-item${isCover ? ' is-cover' : ''}${
                                canReorder ? ' is-reorderable' : ''
                              }${dragIndex === index ? ' is-reorder-drag' : ''}${overClass}`}
                              key={it.id}
                              draggable={canReorder}
                              onDragStart={(e) => startReorder(index, e)}
                              onDragOver={(e) => handleReorderOver(index, e)}
                              onDrop={(e) => handleReorderDrop(index, e)}
                              onDragEnd={endReorder}
                            >
                              {canReorder && (
                                <span className="col-item-grip" aria-hidden="true" title="drag to reorder">
                                  ⋮⋮
                                </span>
                              )}
                              <span className={`col-item-thumb${nsfw ? ' is-nsfw' : ''}`}>
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
                          const nsfw = isNsfwBlurred(it, librarySettings)
                          return (
                            <button
                              key={it.id}
                              type="button"
                              className={`col-add-item${nsfw ? ' is-nsfw' : ''}`}
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
