// Episodes editor: the nested groups inside one session or collection. Create,
// rename, delete and curate membership by hand. Auto-clustered episodes are
// marked; the first manual edit flips them to user-owned (backend rule).
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { thumbUrl } from '../../api'
import { episodeKey, useStore } from '../../store'
import '../collections/collections.css'
import './episodes.css'

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

export function EpisodeEditor() {
  const editor = useStore((s) => s.episodeEditor)
  const episodesByOwner = useStore((s) => s.episodes)
  const sessions = useStore((s) => s.sessions)
  const collections = useStore((s) => s.collections)
  const items = useStore((s) => s.episodeEditorItems)
  const itemsLoading = useStore((s) => s.episodeEditorLoading)

  const closeEditor = useStore((s) => s.closeEpisodeEditor)
  const createEpisode = useStore((s) => s.createEpisode)
  const renameEpisode = useStore((s) => s.renameEpisode)
  const deleteEpisode = useStore((s) => s.deleteEpisode)
  const removeEpisodeItem = useStore((s) => s.removeEpisodeItem)

  const [label, setLabel] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ownerType = editor?.ownerType ?? 'session'
  const ownerId = editor?.ownerId ?? ''
  const ownerLabel = useMemo(() => {
    if (!editor) return ''
    if (editor.ownerType === 'session') {
      return sessions.find((s) => s.id === editor.ownerId)?.label ?? 'session'
    }
    return collections.find((c) => c.id === editor.ownerId)?.name ?? 'collection'
  }, [editor, sessions, collections])

  const episodes = editor ? episodesByOwner[episodeKey(ownerType, ownerId)] ?? [] : []
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  // Seed the new-episode name and focus when the editor switches target.
  useEffect(() => {
    if (!editor) return
    const key = episodeKey(editor.ownerType, editor.ownerId)
    const count = useStore.getState().episodes[key]?.length ?? 0
    setLabel(`Episode ${count + 1}`)
    setOpenId(editor.episodeId)
    setEditingId(null)
    setEditLabel('')
    setError(null)
  }, [editor?.ownerType, editor?.ownerId, editor?.episodeId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) closeEditor()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, closeEditor])

  if (!editor) return null

  const close = () => {
    if (!busy) closeEditor()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = label.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await createEpisode(ownerType, ownerId, trimmed, editor.itemIds)
      if (editor.itemIds.length) {
        closeEditor()
        return
      }
      setLabel(`Episode ${episodes.length + 2}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const startRename = (id: string, current: string) => {
    setEditingId(id)
    setEditLabel(current)
    setError(null)
  }

  const submitRename = async (event: FormEvent) => {
    event.preventDefault()
    if (!editingId || busy) return
    const trimmed = editLabel.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      await renameEpisode(ownerType, ownerId, editingId, trimmed)
      setEditingId(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const destroy = async (id: string, name: string) => {
    if (busy) return
    const ok = window.confirm(
      `Delete episode “${name}”? Its items stay in the ${ownerType}.`,
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await deleteEpisode(ownerType, ownerId, id)
      if (openId === id) setOpenId(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const removeMember = async (episodeId: string, itemId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await removeEpisodeItem(ownerType, ownerId, episodeId, itemId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const pendingCount = editor.itemIds.length

  return (
    <div
      className="col-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        className="col-panel episode-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="episode-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="col-head">
          <h2 className="col-title display" id="episode-editor-title">
            episodes
          </h2>
          <button type="button" className="col-x" aria-label="close" onClick={close}>
            ×
          </button>
        </header>

        <div className="col-form">
          <div className="col-body">
            <p className="col-hint">
              {ownerLabel} · {ownerType} · {episodes.length}{' '}
              {episodes.length === 1 ? 'episode' : 'episodes'}
            </p>

            {episodes.length > 0 ? (
              episodes.map((ep) => {
                const expanded = openId === ep.id
                const cover = ep.thumbnailPath ? thumbUrl(ep.thumbnailPath) : null
                return (
                  <div
                    className={`episode-block${editor.episodeId === ep.id ? ' is-focus' : ''}`}
                    key={ep.id}
                  >
                    <div className="episode-head">
                      <span className="episode-cover">
                        {cover ? (
                          <img src={cover} alt="" loading="lazy" />
                        ) : (
                          <span className="episode-cover-empty" aria-hidden="true" />
                        )}
                      </span>
                      <span className="episode-head-text">
                        <span className="episode-name">{ep.label}</span>
                        <span className="episode-meta">
                          {ep.auto ? 'automatic · ' : ''}
                          {ep.itemCount} {ep.itemCount === 1 ? 'item' : 'items'}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="episode-btn"
                        onClick={() => setOpenId(expanded ? null : ep.id)}
                        aria-expanded={expanded}
                      >
                        {expanded ? 'hide items' : 'items'}
                      </button>
                      <button
                        type="button"
                        className="episode-btn"
                        disabled={busy}
                        onClick={() => startRename(ep.id, ep.label)}
                      >
                        rename
                      </button>
                      <button
                        type="button"
                        className="episode-btn is-danger"
                        disabled={busy}
                        onClick={() => void destroy(ep.id, ep.label)}
                      >
                        delete
                      </button>
                    </div>

                    {editingId === ep.id && (
                      <form className="episode-rename" onSubmit={(e) => void submitRename(e)}>
                        <input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          aria-label="episode name"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="col-primary"
                          disabled={busy || !editLabel.trim()}
                        >
                          save
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} disabled={busy}>
                          cancel
                        </button>
                      </form>
                    )}

                    {expanded && (
                      <div className="episode-members">
                        {ep.itemIds.length === 0 && (
                          <p className="col-hint">
                            empty — assign items from the grid’s Episode menu.
                          </p>
                        )}
                        {ep.itemIds.map((id) => {
                          const item = itemMap.get(id)
                          const src = item?.thumbnailPath ? thumbUrl(item.thumbnailPath) : null
                          const name = item ? basename(item.relativePath) : id.slice(0, 8)
                          return (
                            <button
                              type="button"
                              className="episode-member"
                              key={id}
                              title={`Remove ${name} from ${ep.label}`}
                              aria-label={`Remove ${name} from ${ep.label}`}
                              disabled={busy}
                              onClick={() => void removeMember(ep.id, id)}
                            >
                              {src ? (
                                <img src={src} alt="" loading="lazy" />
                              ) : (
                                <span className="episode-member-empty" aria-hidden="true" />
                              )}
                              <span className="episode-member-x" aria-hidden="true">
                                ×
                              </span>
                            </button>
                          )
                        })}
                        {itemsLoading && <span className="col-hint">loading items…</span>}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="col-hint">
                no episodes yet. create one below, assign items from the grid’s
                Episode menu, or run “Group into episodes…” on the group.
              </p>
            )}

            <form className="episode-new" onSubmit={(e) => void submit(e)}>
              <div className="col-section-head">
                <span className="col-label display">new episode</span>
                {pendingCount > 0 && (
                  <span className="col-count">
                    {pendingCount} {pendingCount === 1 ? 'item' : 'items'}
                  </span>
                )}
              </div>
              <div className="episode-new-row">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="episode name"
                  aria-label="New episode name"
                  disabled={busy}
                />
                <button
                  type="submit"
                  className="col-primary"
                  disabled={busy || !label.trim()}
                >
                  {busy ? 'working…' : 'create'}
                </button>
              </div>
              {pendingCount > 0 && (
                <p className="col-hint">
                  the selected {pendingCount === 1 ? 'item' : 'items'} will be added
                  to the new episode.
                </p>
              )}
            </form>

            {error && <p className="col-error">{error}</p>}
          </div>

          <footer className="col-foot">
            <span className="col-foot-spacer" />
            <button type="button" onClick={close} disabled={busy}>
              close
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
