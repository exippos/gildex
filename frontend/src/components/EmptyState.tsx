// First-run / empty browse states: nothing to show yet — point the user at the
// library (create/open) or at the Ingest workspace once a library is open.
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

  if (!library) return null

  const filtered =
    Boolean(search) ||
    activeTagFilters.length > 0 ||
    activeSourceId !== null ||
    (surface === 'sessions' && activeSessionId !== null) ||
    (surface === 'collections' && activeCollectionId !== null) ||
    (surface === 'folders' && activeFolder !== null)

  const ornament = (
    <div className="empty-ornament" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  )

  if (!library.rootSet) {
    return (
      <div className="empty-state" role="dialog" aria-label="Create or open a library">
        {ornament}
        <p className="empty-line display">no library open</p>
        <p className="empty-hint">
          gildex catalogues your media into a library. create one or open an existing one to begin.
        </p>
        <div className="empty-actions">
          <button
            type="button"
            className="empty-action"
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
