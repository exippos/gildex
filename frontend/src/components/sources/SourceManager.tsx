// Media-source manager: add folders, flip between one-time import and watch,
// rescan, and remove sources. Extracted from the Ingest workspace so the same
// controls can be mounted anywhere a library's sources are managed.
import { useState } from 'react'
import { useStore } from '../../store'
import type { SourceMode } from '../../types'
import { PathPicker } from '../fs/PathPicker'
import './source-manager.css'

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function SourceManager() {
  const sources = useStore((s) => s.sources)
  const importing = useStore((s) => s.importing)
  const importError = useStore((s) => s.importError)
  const addSource = useStore((s) => s.addSource)
  const updateSource = useStore((s) => s.updateSource)
  const removeSource = useStore((s) => s.removeSource)
  const scanSource = useStore((s) => s.scanSource)

  const [picking, setPicking] = useState(false)
  const [busySourceId, setBusySourceId] = useState<string | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)

  const runSourceAction = async (id: string, action: () => Promise<void>) => {
    setSourceError(null)
    setBusySourceId(id)
    try {
      await action()
    } catch (error: unknown) {
      setSourceError(describeError(error))
    } finally {
      setBusySourceId(null)
    }
  }

  const toggleMode = (id: string, mode: SourceMode) => {
    void runSourceAction(id, () => updateSource(id, { mode }))
  }

  const handleRemove = (id: string) => {
    const ok = window.confirm('Remove this source? Its items will be marked missing.')
    if (!ok) return
    void runSourceAction(id, () => removeSource(id))
  }

  const handleAddSource = async (path: string) => {
    setPicking(false)
    setSourceError(null)
    try {
      const id = await addSource(path)
      if (id) await scanSource(id)
    } catch (error: unknown) {
      setSourceError(describeError(error))
    }
  }

  return (
    <>
      <h2 className="source-manager-heading">media sources</h2>
      <p className="source-manager-hint">
        folders gildex catalogues from. once imports a folder a single time; watch keeps it in
        sync.
      </p>

      {sources.length === 0 ? (
        <p className="source-manager-hint source-manager-empty">no sources yet</p>
      ) : (
        <ul className="source-manager-list">
          {sources.map((source) => {
            const rowBusy = importing || busySourceId === source.id
            return (
              <li key={source.id} className="source-manager-row">
                <div className="source-manager-row-head">
                  <span className="source-manager-row-name" title={source.name}>
                    {source.name}
                  </span>
                  <span className="source-manager-row-path" title={source.path}>
                    {source.path}
                  </span>
                </div>
                <div className="source-manager-row-actions">
                  <button
                    type="button"
                    className={`source-manager-mode${source.mode === 'watch' ? ' is-watch' : ''}`}
                    title={
                      source.mode === 'watch'
                        ? 'watching for changes — click for one-time import'
                        : 'one-time import — click to keep in sync'
                    }
                    aria-label={`Import mode: ${source.mode}. Click to switch to ${
                      source.mode === 'once' ? 'watch' : 'once'
                    }.`}
                    onClick={() =>
                      toggleMode(source.id, source.mode === 'once' ? 'watch' : 'once')
                    }
                    disabled={rowBusy}
                  >
                    <span className="source-manager-mode-dot" aria-hidden="true" />
                    {source.mode}
                  </button>
                  <button
                    type="button"
                    className="source-manager-btn"
                    onClick={() => void runSourceAction(source.id, () => scanSource(source.id))}
                    disabled={rowBusy}
                  >
                    Rescan
                  </button>
                  <button
                    type="button"
                    className="source-manager-btn is-danger"
                    onClick={() => handleRemove(source.id)}
                    disabled={rowBusy}
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="source-manager-actions">
        <button
          type="button"
          className="is-primary"
          onClick={() => {
            setSourceError(null)
            setPicking(true)
          }}
          disabled={importing}
        >
          Add source
        </button>
      </div>
      {sourceError && <p className="source-manager-error">{sourceError}</p>}
      {importError && <p className="source-manager-error">{importError}</p>}

      {picking && (
        <PathPicker
          title="Choose a media folder"
          onSelect={(path) => void handleAddSource(path)}
          onCancel={() => setPicking(false)}
        />
      )}
    </>
  )
}
