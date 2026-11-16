// First-run / empty browse states: nothing to show yet — point the user at the
// library (create/open) or at the Ingest workspace once a library is open.
import { useState } from 'react'
import { useStore } from '../store'
import './empty-state.css'

export function EmptyState() {
  const library = useStore((s) => s.library)
  const itemsTotal = useStore((s) => s.itemsTotal)
  const loadingItems = useStore((s) => s.loadingItems)
  const search = useStore((s) => s.search)
  const activeTagFilters = useStore((s) => s.activeTagFilters)
  const surface = useStore((s) => s.surface)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const activeCollectionId = useStore((s) => s.activeCollectionId)
  const activeFolder = useStore((s) => s.activeFolder)
  const activeSourceId = useStore((s) => s.activeSourceId)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const openLibraryModal = useStore((s) => s.openLibraryModal)
  const openLibrary = useStore((s) => s.openLibrary)

  const [openingLast, setOpeningLast] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  if (!library) return null

  const openLast = async () => {
    const last = library.lastLibrary
    if (!last) return
    setOpeningLast(true)
    setLastError(null)
    try {
      await openLibrary(last)
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err))
    } finally {
      setOpeningLast(false)
    }
  }

  const filtered =
    Boolean(search) ||
    activeTagFilters.length > 0 ||
    (surface === 'folders' && (activeSourceId !== null || activeFolder !== null)) ||
    (surface === 'sessions' && activeSessionId !== null) ||
    (surface === 'collections' && activeCollectionId !== null)

  const ornament = (
    <div className="empty-ornament" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  )

  if (!library.rootSet) {
    const last = library.lastLibrary
    return (
      <div className="empty-state" role="dialog" aria-label="Create or open a library">
        {ornament}
        <p className="empty-line display">no library open</p>
        <p className="empty-hint">
          gildex catalogues your media into a library. create one or open an existing one to begin.
        </p>
        <div className="empty-actions">
          {last && (
            <button
              type="button"
              className="empty-action"
              onClick={() => void openLast()}
              disabled={openingLast}
            >
              {openingLast ? 'Opening…' : 'Open last library'}
            </button>
          )}
          <button
            type="button"
            className="empty-action is-quiet"
            onClick={() => openLibraryModal('create')}
          >
            Create library
          </button>
          <button
            type="button"
            className="empty-action is-quiet"
            onClick={() => openLibraryModal('open')}
          >
            Open library
          </button>
        </div>
        {last && (
          <p className="empty-last" title={last}>
            {last}
          </p>
        )}
        {lastError && (
          <p className="empty-error" role="alert">
            {lastError}
          </p>
        )}
      </div>
    )
  }

  if (itemsTotal === 0 && library.itemCount === 0 && !loadingItems && !filtered) {
    return (
      <div className="empty-state" role="dialog" aria-label="Import media">
        {ornament}
        <p className="empty-line display">nothing catalogued yet</p>
        <p className="empty-hint">
          <span className="empty-root">{library.name || library.root}</span> is open. open ingest to
          add a media source.
        </p>
        <button type="button" className="empty-action" onClick={() => setWorkspace('ingest')}>
          Open ingest
        </button>
      </div>
    )
  }

  return null
}
