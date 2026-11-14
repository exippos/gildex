// Ingest workspace: manage the library's media sources, drop files/folders to
// copy them into _inbox, and watch import progress.
import { useEffect, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import { useStore } from '../../store'
import { thumbUrl } from '../../api'
import type { DroppedFile } from '../../api'
import type { SourceMode } from '../../types'
import { PathPicker } from '../fs/PathPicker'
import './ingest.css'

async function readEntry(entry: FileSystemEntry, base: string): Promise<DroppedFile[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject))
    return [{ file, relPath: base ? `${base}/${entry.name}` : entry.name }]
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    const reader = dirEntry.createReader()
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      const all: FileSystemEntry[] = []
      const read = () =>
        reader.readEntries(
          (batch) => {
            if (batch.length === 0) resolve(all)
            else {
              all.push(...batch)
              read()
            }
          },
          reject,
        )
      read()
    })
    const sub = base ? `${base}/${entry.name}` : entry.name
    const out: DroppedFile[] = []
    for (const child of entries) out.push(...(await readEntry(child, sub)))
    return out
  }
  return []
}

async function collectDroppedFiles(dt: DataTransfer): Promise<DroppedFile[]> {
  const out: DroppedFile[] = []
  for (const item of Array.from(dt.items)) {
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null
    if (entry) {
      out.push(...(await readEntry(entry, '')))
    } else {
      const file = item.getAsFile()
      if (file) out.push({ file, relPath: file.webkitRelativePath || file.name })
    }
  }
  return out
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function Ingest() {
  const library = useStore((s) => s.library)
  const importing = useStore((s) => s.importing)
  const importProgress = useStore((s) => s.importProgress)
  const importError = useStore((s) => s.importError)
  const sources = useStore((s) => s.sources)
  const addSource = useStore((s) => s.addSource)
  const updateSource = useStore((s) => s.updateSource)
  const removeSource = useStore((s) => s.removeSource)
  const scanSource = useStore((s) => s.scanSource)
  const importFiles = useStore((s) => s.importFiles)
  const openLibraryModal = useStore((s) => s.openLibraryModal)
  const openInspector = useStore((s) => s.openInspector)

  const [picking, setPicking] = useState(false)
  const [busySourceId, setBusySourceId] = useState<string | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)

  // Prevent the browser from navigating away if a drop lands outside the zone.
  useEffect(() => {
    const prevent = (event: Event) => event.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const rootSet = Boolean(library?.rootSet)
  const canDrop = rootSet && !importing

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

  const handleDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current += 1
    setDragOver(true)
  }
  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }
  const handleDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragOver(false)
    }
  }
  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragOver(false)
    const dt = event.dataTransfer
    if (!dt || !canDrop) return
    void (async () => {
      const files = await collectDroppedFiles(dt)
      if (files.length) await importFiles(files)
    })()
  }

  const percent =
    importProgress && importProgress.total > 0
      ? Math.max(0, Math.min(100, (importProgress.done / importProgress.total) * 100))
      : 0

  return (
    <div
      className="ingest"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="ingest-inner">
        <p className="ingest-title display">ingest</p>

        <section
          className={`ingest-drop${dragOver ? ' is-over' : ''}${canDrop ? '' : ' is-disabled'}`}
        >
          <p className="ingest-drop-title display">drop files or folders</p>
          <p className="ingest-drop-hint">
            {canDrop
              ? 'copied into _inbox and catalogued'
              : !rootSet
                ? 'open or create a library first'
                : 'import already running'}
          </p>
        </section>

        {!rootSet && (
          <section className="ingest-card">
            <h2 className="ingest-heading">no library open</h2>
            <p className="ingest-hint">
              gildex catalogues media from the folders you add to a library. create a new library
              or open an existing one to begin.
            </p>
            <div className="ingest-actions">
              <button
                type="button"
                className="is-primary"
                onClick={() => openLibraryModal('create')}
              >
                Create library
              </button>
              <button type="button" onClick={() => openLibraryModal('open')}>
                Open library
              </button>
            </div>
          </section>
        )}

        {rootSet && (
          <section className="ingest-card">
            <h2 className="ingest-heading">media sources</h2>
            <p className="ingest-hint">
              folders gildex catalogues from. once imports a folder a single time; watch keeps it
              in sync.
            </p>

            {sources.length === 0 ? (
              <p className="ingest-hint ingest-sources-empty">no sources yet</p>
            ) : (
              <ul className="ingest-sources-list">
                {sources.map((source) => {
                  const rowBusy = importing || busySourceId === source.id
                  return (
                    <li key={source.id} className="ingest-source">
                      <div className="ingest-source-head">
                        <span className="ingest-source-name" title={source.name}>
                          {source.name}
                        </span>
                        <span className="ingest-source-path" title={source.path}>
                          {source.path}
                        </span>
                      </div>
                      <div className="ingest-source-actions">
                        <button
                          type="button"
                          className={`ingest-source-mode${
                            source.mode === 'watch' ? ' is-watch' : ''
                          }`}
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
                          <span className="ingest-source-mode-dot" aria-hidden="true" />
                          {source.mode}
                        </button>
                        <button
                          type="button"
                          className="ingest-source-btn"
                          onClick={() =>
                            void runSourceAction(source.id, () => scanSource(source.id))
                          }
                          disabled={rowBusy}
                        >
                          Rescan
                        </button>
                        <button
                          type="button"
                          className="ingest-source-btn is-danger"
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

            <div className="ingest-actions">
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
            {sourceError && <p className="ingest-error">{sourceError}</p>}
            {importError && <p className="ingest-error">{importError}</p>}
          </section>
        )}

        {importing && (
          <section className="ingest-card" role="status" aria-label="Importing">
            <h2 className="ingest-heading">importing</h2>
            <p className="ingest-stage">
              {importProgress?.stage || 'scanning'}
              {importProgress && importProgress.total > 0
                ? ` · ${importProgress.done} / ${importProgress.total}`
                : ''}
              {importProgress && importProgress.itemsPerSec > 0
                ? ` · ${importProgress.itemsPerSec.toFixed(1)}/s`
                : ''}
            </p>
            <div className="ingest-progress" aria-hidden="true">
              <span style={{ width: `${percent}%` }} />
            </div>
          </section>
        )}

        {importProgress && importProgress.duplicates.length > 0 && (
          <section className="ingest-card" role="status" aria-label="Duplicate files">
            <h2 className="ingest-heading">
              found {importProgress.duplicates.length}{' '}
              {importProgress.duplicates.length === 1 ? 'duplicate' : 'duplicates'}
            </h2>
            <ul className="ingest-dupes-list">
              {importProgress.duplicates.map((dup, i) => (
                <li key={`${dup.name}-${i}`} className="ingest-dupe">
                  <span className="ingest-dupe-icon" aria-hidden="true">
                    {dup.thumb ? (
                      <img src={thumbUrl(dup.thumb)!} alt="" loading="lazy" draggable={false} />
                    ) : dup.kind === 'video' ? (
                      <svg viewBox="0 0 24 24">
                        <path d="M8 5.5 19 12 8 18.5Z" fill="currentColor" />
                      </svg>
                    ) : dup.kind === 'audio' ? (
                      <span className="ingest-dupe-audio">
                        <span />
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : (
                      <span className="ingest-dupe-frame" />
                    )}
                  </span>
                  <span className="ingest-dupe-name">
                    found duplicate{' '}
                    <button
                      type="button"
                      className="ingest-dupe-link"
                      onClick={() => void openInspector('item', dup.id, dup.name)}
                    >
                      {dup.name}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {rootSet && library && !importing && (
          <p className="ingest-summary">
            {library.itemCount} items · {sources.length} sources · {library.sessionCount} sessions ·{' '}
            {library.collectionCount} collections · {library.tagCount} tags
          </p>
        )}
      </div>

      {picking && (
        <PathPicker
          title="Choose a media folder"
          onSelect={(path) => void handleAddSource(path)}
          onCancel={() => setPicking(false)}
        />
      )}
    </div>
  )
}
