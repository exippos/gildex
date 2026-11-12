// First-run / empty browse states: nothing to show yet — point the user at the
// Ingest workspace (root pick + import live there now).
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
  const setWorkspace = useStore((s) => s.setWorkspace)

  if (!library) return null

  const filtered =
    Boolean(search) ||
    activeTagFilters.length > 0 ||
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
      <div className="empty-state" role="dialog" aria-label="Set a library root">
        {ornament}
        <p className="empty-line display">library root not set</p>
        <p className="empty-hint">
          gildex watches a single folder. open ingest to point it at your media library.
        </p>
        <button type="button" className="empty-action" onClick={() => setWorkspace('ingest')}>
          Open ingest
        </button>
      </div>
    )
  }

  if (itemsTotal === 0 && library.itemCount === 0 && !loadingItems && !filtered) {
    return (
      <div className="empty-state" role="dialog" aria-label="Import media">
        {ornament}
        <p className="empty-line display">nothing catalogued yet</p>
        <p className="empty-hint">
          root is set to <span className="empty-root">{library.root}</span>. open ingest to import
          a folder.
        </p>
        <button type="button" className="empty-action" onClick={() => setWorkspace('ingest')}>
          Open ingest
        </button>
      </div>
    )
  }

  return null
}
