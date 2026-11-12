// Markdown notes for the open inspector owner (D8).
// Owner context comes from store.inspector; all writes go through store actions.
import { useState } from 'react'
import type { FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { useStore } from '../../store'
import type { Note } from '../../types'
import './notes-panel.css'

function fmtTime(ms: number): string {
  const d = new Date(ms)
  return `${d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

export function NotesPanel() {
  const notes = useStore((s) => s.notes)
  const inspector = useStore((s) => s.inspector)
  const addNote = useStore((s) => s.addNote)
  const updateNote = useStore((s) => s.updateNote)
  const deleteNote = useStore((s) => s.deleteNote)

  const [body, setBody] = useState('')
  const [typeLabel, setTypeLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const owner = inspector ? inspector.ownerType : 'catalog'

  const submitNew = async (e: FormEvent) => {
    e.preventDefault()
    const text = body.trim()
    if (!text || saving) return
    setSaving(true)
    setError(null)
    try {
      await addNote(text, typeLabel.trim() || undefined)
      setBody('')
      setTypeLabel('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (note: Note) => {
    setEditingId(note.id)
    setDraft(note.body)
    setError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft('')
  }

  const commitEdit = async () => {
    if (!editingId) return
    const text = draft.trim()
    if (!text) return
    setError(null)
    try {
      await updateNote(editingId, text)
      setEditingId(null)
      setDraft('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const remove = async (note: Note) => {
    if (!window.confirm('Delete this note?')) return
    setError(null)
    try {
      await deleteNote(note.id)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <section className="notes" aria-label="notes">
      <header className="notes-head">
        <h2 className="notes-title display">notes</h2>
        <span className="notes-context">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'} · {owner}
        </span>
      </header>

      {notes.length === 0 ? (
        <p className="notes-empty">no notes yet. the first note is the hardest.</p>
      ) : (
        <div className="notes-list">
          {notes.map((note) => (
            <article className="notes-note" key={note.id}>
              <header className="notes-meta">
                {note.typeLabel && <span className="notes-chip display">{note.typeLabel}</span>}
                <time className="notes-time" dateTime={new Date(note.updatedAt).toISOString()}>
                  {fmtTime(note.updatedAt)}
                </time>
                <span className="notes-actions">
                  {editingId !== note.id && (
                    <>
                      <button
                        type="button"
                        className="notes-mini"
                        onClick={() => startEdit(note)}
                      >
                        edit
                      </button>
                      <button
                        type="button"
                        className="notes-mini notes-mini--danger"
                        onClick={() => void remove(note)}
                      >
                        delete
                      </button>
                    </>
                  )}
                </span>
              </header>

              {editingId === note.id ? (
                <div className="notes-edit">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={6}
                    aria-label="note body"
                    autoFocus
                  />
                  <div className="notes-edit-actions">
                    <button
                      type="button"
                      className="notes-primary"
                      onClick={() => void commitEdit()}
                      disabled={!draft.trim()}
                    >
                      save
                    </button>
                    <button type="button" onClick={cancelEdit}>
                      cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="notes-md">
                  <ReactMarkdown>{note.body}</ReactMarkdown>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <form className="notes-form" onSubmit={(e) => void submitNew(e)}>
        <h3 className="notes-form-title display">new note</h3>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="write in markdown…"
          aria-label="new note body"
        />
        <div className="notes-form-row">
          <input
            className="notes-type"
            value={typeLabel}
            onChange={(e) => setTypeLabel(e.target.value)}
            placeholder="type label (optional)"
            aria-label="note type label"
          />
          <button
            type="submit"
            className="notes-primary"
            disabled={saving || !body.trim()}
          >
            {saving ? 'saving…' : 'save note'}
          </button>
        </div>
        {error && <p className="notes-error">{error}</p>}
      </form>
    </section>
  )
}
