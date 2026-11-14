// PathPicker — an in-app directory browser backed by the Go fs-list API. Used
// anywhere a folder path is needed (library location, media source). The
// browser File System Access API cannot expose absolute paths to the local Go
// backend, so this app-rendered picker is the real folder dialog.
import { useEffect, useState } from 'react'
import { api, type FsEntry } from '../../api'
import './path-picker.css'

export function PathPicker({
  title,
  onSelect,
  onCancel,
}: {
  title: string
  onSelect: (path: string) => void
  onCancel: () => void
}) {
  const [path, setPath] = useState('')
  const [parent, setParent] = useState('')
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (p: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.fsList(p)
      setPath(res.path)
      setParent(res.parent)
      setEntries(res.entries)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const roots = await api.fsRoots()
        const start = roots.home || roots.roots[0]?.path || '/'
        await load(start)
      } catch {
        await load('/')
      }
    })()
  }, [])

  return (
    <div className="path-picker" role="dialog" aria-label={title} aria-modal="true">
      <div className="path-picker-scrim" onClick={onCancel} />
      <div className="path-picker-panel">
        <header className="path-picker-head">
          <span className="path-picker-title display">{title}</span>
          <button type="button" className="path-picker-close" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </header>

        <div className="path-picker-path" title={path}>
          <span className="path-picker-path-label">location</span>
          <span className="path-picker-path-value">{path || '…'}</span>
        </div>

        <button
          type="button"
          className="path-picker-up"
          onClick={() => void load(parent)}
          disabled={loading || parent === path}
        >
          ↑ parent folder
        </button>

        <div className="path-picker-list" role="listbox" aria-label="Folders">
          {loading && <div className="path-picker-hint">loading…</div>}
          {!loading && entries.length === 0 && !error && (
            <div className="path-picker-hint">no folders here</div>
          )}
          {!loading &&
            entries.map((e) => (
              <button
                key={e.path}
                type="button"
                className="path-picker-row"
                onDoubleClick={() => void load(e.path)}
                onClick={() => void load(e.path)}
                role="option"
                aria-selected={false}
              >
                <span className="path-picker-row-icon" aria-hidden="true">
                  ›
                </span>
                <span className="path-picker-row-name">{e.name}</span>
              </button>
            ))}
          {error && <div className="path-picker-error">{error}</div>}
        </div>

        <footer className="path-picker-actions">
          <button type="button" className="path-picker-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="path-picker-select"
            onClick={() => onSelect(path)}
            disabled={loading || !path}
          >
            Select this folder
          </button>
        </footer>
      </div>
    </div>
  )
}
