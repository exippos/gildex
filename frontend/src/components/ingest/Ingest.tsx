// Ingest workspace: drop files/folders to copy them into _inbox, watch import
// progress, and mount the reusable media-source manager.
import { useEffect, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import { useStore } from '../../store'
import { thumbUrl } from '../../api'
import type { DroppedFile } from '../../api'
import { SourceManager } from '../sources/SourceManager'
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

export function Ingest() {
  const library = useStore((s) => s.library)
  const importing = useStore((s) => s.importing)
  const importProgress = useStore((s) => s.importProgress)
  const sources = useStore((s) => s.sources)
  const importFiles = useStore((s) => s.importFiles)
  const openLibraryModal = useStore((s) => s.openLibraryModal)
  const openInspector = useStore((s) => s.openInspector)

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
            <SourceManager />
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
    </div>
  )
}
