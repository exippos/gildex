// Central Zustand store — the shared contract between all components.
// Components read state and call actions; they should NOT fetch directly.
import { create } from 'zustand'
import { api } from './api'
import type { DroppedFile } from './api'
import { applyTheme, initialTheme, persistTheme, syncThemeUrl, type Theme } from './theme'
import type {
  Collection,
  FolderNode,
  ImportStatus,
  Item,
  ItemSort,
  LibraryStatus,
  Note,
  OwnerType,
  Session,
  SortDir,
  Status,
  Surface,
  Tag,
  Workspace,
} from './types'

// Frontend sort name -> backend `sort` query param.
const SORT_PARAM: Record<ItemSort, string> = {
  time: 'time',
  filename: 'name',
  size: 'size',
  session: 'session',
}

// Collection contents are fetched lazily and cached per query. The key folds in
// every input that changes the result set, so a stale page never gets reused
// after a sort or filter change.
export function collectionItemsKey(
  id: string,
  search: string,
  tagFilters: string[],
  sort: ItemSort,
  sortDir: SortDir,
): string {
  return [id, search, tagFilters.join(','), sort, sortDir].join('|')
}

interface InspectorTarget {
  ownerType: OwnerType
  ownerId: string
  ownerLabel?: string
}

export type EffectsMode = 'full' | 'reduced'

function readEffects(): EffectsMode {
  try {
    return localStorage.getItem('gildex-effects') === 'reduced' ? 'reduced' : 'full'
  } catch {
    return 'full'
  }
}

const initialEffects = readEffects()
document.documentElement.setAttribute('data-effects', initialEffects)

interface AppState {
  // library / import
  library: LibraryStatus | null
  importing: boolean
  importProgress: ImportStatus | null
  importError: string | null

  // navigation
  workspace: Workspace
  surface: Surface
  activeSessionId: string | null
  activeCollectionId: string | null
  activeFolder: string | null
  activeTagFilters: string[]

  // search & items
  search: string
  sort: ItemSort
  sortDir: SortDir
  cellSize: number
  items: Item[]
  itemsTotal: number
  loadingItems: boolean

  // data caches
  sessions: Session[]
  tags: Tag[]
  collections: Collection[]
  folders: FolderNode[]
  // collection id + query key -> one page of that collection's items
  collectionItems: Record<string, Item[]>
  collectionLoading: Record<string, boolean>

  // selection
  selection: string[]
  lastSelectedId: string | null

  // quick preview (right panel)
  previewItemId: string | null

  // inspector (deep surface)
  inspector: InspectorTarget | null

  // modals
  collectionModal: { id: string | null } | null
  collectionPicker: { itemIds: string[] } | null

  // notes cache for the open inspector
  notes: Note[]

  // presentation
  theme: Theme
  setTheme: (theme: Theme) => void
  effects: EffectsMode
  setEffects: (mode: EffectsMode) => void

  // actions
  init: () => Promise<void>
  setRoot: (path: string) => Promise<void>
  importPaths: (paths: string[]) => Promise<void>
  importFiles: (files: DroppedFile[]) => Promise<void>
  pollImport: () => Promise<void>
  loadItems: () => Promise<void>
  loadCollectionItems: (id: string) => Promise<void>
  refreshCatalog: () => Promise<void>

  setWorkspace: (w: Workspace) => void
  setSurface: (s: Surface) => void
  setActiveSessionId: (id: string | null) => void
  setActiveCollectionId: (id: string | null) => void
  setActiveFolder: (path: string | null) => void
  setSearch: (q: string) => void
  setSort: (s: ItemSort) => void
  setSortDir: (d: SortDir) => void
  setCellSize: (n: number) => void
  toggleTagFilter: (name: string) => void
  clearTagFilters: () => void

  toggleSelect: (id: string) => void
  setSelected: (id: string, additive: boolean) => void
  selectRange: (id: string) => void
  clearSelection: () => void
  selectAllVisible: () => void

  setPreviewItemId: (id: string | null) => void
  openInspector: (ownerType: OwnerType, ownerId: string, ownerLabel?: string) => Promise<void>
  closeInspector: () => void

  openCollectionModal: (id: string | null) => void
  closeCollectionModal: () => void
  openCollectionPicker: (itemIds: string[]) => void
  closeCollectionPicker: () => void

  batchTag: (add: string[], remove: string[]) => Promise<void>
  batchSet: (patch: { favorite?: boolean; rating?: number; status?: Status }) => Promise<void>
  batchRemove: () => Promise<void>
  addToCollection: (collectionId: string, itemIds: string[]) => Promise<void>
  removeFromCollection: (collectionId: string, itemId: string) => Promise<void>

  saveItem: (id: string, patch: Partial<Item>) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>

  createTag: (name: string) => Promise<void>
  createCollection: (name: string, description: string) => Promise<string | null>
  updateCollection: (id: string, patch: { name?: string; description?: string }) => Promise<void>
  deleteCollection: (id: string) => Promise<void>

  loadNotes: (ownerType: OwnerType, ownerId: string) => Promise<void>
  addNote: (body: string, typeLabel?: string) => Promise<void>
  updateNote: (id: string, body: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
}

const EMPTY_PROGRESS: ImportStatus = { running: false, total: 0, done: 0, stage: '', error: '', duplicates: [] }

export const useStore = create<AppState>((set, get) => ({
  library: null,
  importing: false,
  importProgress: null,
  importError: null,

  workspace: 'gallery',
  surface: 'sessions',
  activeSessionId: null,
  activeCollectionId: null,
  activeFolder: null,
  activeTagFilters: [],

  search: '',
  sort: 'time',
  sortDir: 'desc',
  cellSize: 168,
  items: [],
  itemsTotal: 0,
  loadingItems: false,

  sessions: [],
  tags: [],
  collections: [],
  folders: [],
  collectionItems: {},
  collectionLoading: {},

  selection: [],
  lastSelectedId: null,

  previewItemId: null,
  inspector: null,

  collectionModal: null,
  collectionPicker: null,

  notes: [],

  theme: initialTheme,
  setTheme: (theme) => {
    applyTheme(theme)
    persistTheme(theme)
    syncThemeUrl(theme)
    set({ theme })
  },

  effects: initialEffects,
  setEffects: (mode) => {
    document.documentElement.setAttribute('data-effects', mode)
    try {
      localStorage.setItem('gildex-effects', mode)
    } catch {
      /* ignore */
    }
    set({ effects: mode })
  },

  init: async () => {
    const library = await api.status()
    set({ library })
    if (library.rootSet) await get().refreshCatalog()
  },

  setRoot: async (path) => {
    const library = await api.setRoot(path)
    set({ library })
    await get().refreshCatalog()
  },

  importPaths: async (paths) => {
    set({ importing: true, importError: null, importProgress: EMPTY_PROGRESS })
    try {
      await api.importPaths(paths)
      // poll until done
      await get().pollImport()
    } catch (e) {
      set({ importing: false, importError: (e as Error).message })
    }
  },

  importFiles: async (files) => {
    if (!files.length) return
    set({ importing: true, importError: null, importProgress: EMPTY_PROGRESS })
    try {
      await api.uploadImport(files)
      await get().pollImport()
    } catch (e) {
      set({ importing: false, importError: (e as Error).message })
    }
  },

  pollImport: async () => {
    for (let i = 0; i < 2000; i++) {
      const p = await api.importStatus()
      set({ importProgress: p })
      if (!p.running) {
        set({ importing: false, importError: p.error || null })
        if (!p.error) await get().refreshCatalog()
        return
      }
      await new Promise((r) => setTimeout(r, 400))
    }
    set({ importing: false, importError: 'import timed out' })
  },

  refreshCatalog: async () => {
    const [library, sessions, tags, collections, folders] = await Promise.all([
      api.status(),
      api.sessions(),
      api.tags(),
      api.collections(),
      api.folders(),
    ])
    set({ library, sessions, tags, collections, folders })
    await get().loadItems()
  },

  loadItems: async () => {
    const {
      workspace,
      surface,
      activeSessionId,
      activeCollectionId,
      activeFolder,
      activeTagFilters,
      search,
    } = get()
    set({ loadingItems: true })
    try {
      const gallery = workspace === 'gallery'
      const q = {
        sessionId: gallery && surface === 'sessions' ? activeSessionId ?? undefined : undefined,
        collectionId:
          gallery && surface === 'collections' ? activeCollectionId ?? undefined : undefined,
        folder: gallery && surface === 'folders' ? activeFolder ?? undefined : undefined,
        tags: activeTagFilters.length ? activeTagFilters : undefined,
        q: search || undefined,
        limit: 2000,
        sort: SORT_PARAM[get().sort],
        dir: get().sortDir,
      }
      const page = await api.items(q)
      set({ items: page.items, itemsTotal: page.total })
    } finally {
      set({ loadingItems: false })
    }
  },

  loadCollectionItems: async (id) => {
    const { search, activeTagFilters, sort, sortDir } = get()
    const key = collectionItemsKey(id, search, activeTagFilters, sort, sortDir)
    if (get().collectionItems[key] || get().collectionLoading[key]) return
    set((s) => ({ collectionLoading: { ...s.collectionLoading, [key]: true } }))
    try {
      const page = await api.items({
        collectionId: id,
        tags: activeTagFilters.length ? activeTagFilters : undefined,
        q: search || undefined,
        limit: 2000,
        sort: SORT_PARAM[sort],
        dir: sortDir,
      })
      set((s) => ({ collectionItems: { ...s.collectionItems, [key]: page.items } }))
    } finally {
      set((s) => ({ collectionLoading: { ...s.collectionLoading, [key]: false } }))
    }
  },

  setWorkspace: (workspace) => {
    set({ workspace, previewItemId: null })
    if (workspace !== 'ingest') void get().loadItems()
  },
  setSurface: (surface) => set({ surface, activeSessionId: null, activeCollectionId: null, activeFolder: null }),
  setActiveSessionId: (id) => {
    set({ activeSessionId: id })
    void get().loadItems()
  },
  setActiveCollectionId: (id) => {
    set({ activeCollectionId: id })
    void get().loadItems()
  },
  setActiveFolder: (path) => {
    set({ activeFolder: path })
    void get().loadItems()
  },
  setSearch: (q) => {
    set({ search: q })
    void get().loadItems()
  },
  setSort: (sort) => {
    set({ sort })
    void get().loadItems()
  },
  setSortDir: (sortDir) => {
    set({ sortDir })
    void get().loadItems()
  },
  setCellSize: (cellSize) => set({ cellSize }),
  toggleTagFilter: (name) => {
    const cur = get().activeTagFilters
    const next = cur.includes(name) ? cur.filter((t) => t !== name) : [...cur, name]
    set({ activeTagFilters: next })
    void get().loadItems()
  },
  clearTagFilters: () => {
    set({ activeTagFilters: [] })
    void get().loadItems()
  },

  toggleSelect: (id) => {
    const sel = get().selection
    set({
      selection: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id],
      lastSelectedId: id,
    })
  },
  setSelected: (id, additive) => {
    const sel = get().selection
    if (!additive) {
      set({ selection: [id], lastSelectedId: id })
      return
    }
    set({
      selection: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id],
      lastSelectedId: id,
    })
  },
  selectRange: (id) => {
    const { items, lastSelectedId } = get()
    if (!lastSelectedId) {
      get().toggleSelect(id)
      return
    }
    const ids = items.map((i) => i.id)
    const a = ids.indexOf(lastSelectedId)
    const b = ids.indexOf(id)
    if (a === -1 || b === -1) return
    const [lo, hi] = a < b ? [a, b] : [b, a]
    set({ selection: ids.slice(lo, hi + 1) })
  },
  clearSelection: () => set({ selection: [], lastSelectedId: null }),
  selectAllVisible: () => {
    const ids = get().items.map((i) => i.id)
    set({ selection: ids })
  },

  setPreviewItemId: (id) => set({ previewItemId: id }),

  openInspector: async (ownerType, ownerId, ownerLabel) => {
    set({ inspector: { ownerType, ownerId, ownerLabel } })
    await get().loadNotes(ownerType, ownerId)
  },
  closeInspector: () => set({ inspector: null, notes: [] }),

  openCollectionModal: (id) => set({ collectionModal: { id } }),
  closeCollectionModal: () => set({ collectionModal: null }),
  openCollectionPicker: (itemIds) => set({ collectionPicker: { itemIds } }),
  closeCollectionPicker: () => set({ collectionPicker: null }),

  batchTag: async (add, remove) => {
    const ids = get().selection
    if (!ids.length) return
    await api.batch({ ids, addTags: add, removeTags: remove })
    get().clearSelection()
    await get().refreshCatalog()
  },
  batchSet: async (patch) => {
    const ids = get().selection
    if (!ids.length) return
    await api.batch({ ids, ...patch })
    get().clearSelection()
    await get().refreshCatalog()
  },
  batchRemove: async () => {
    const ids = get().selection
    if (!ids.length) return
    await api.batch({ ids, removeFromCatalog: true })
    get().clearSelection()
    await get().refreshCatalog()
  },
  addToCollection: async (collectionId, itemIds) => {
    if (!itemIds.length) return
    await api.addToCollection(collectionId, itemIds)
    get().clearSelection()
    set({ collectionPicker: null })
    await get().refreshCatalog()
  },
  removeFromCollection: async (collectionId, itemId) => {
    await api.removeFromCollection(collectionId, itemId)
    await get().refreshCatalog()
  },

  saveItem: async (id, patch) => {
    await api.updateItem(id, patch)
    await get().loadItems()
  },
  toggleFavorite: async (id) => {
    const item = get().items.find((i) => i.id === id)
    if (!item) return
    await api.updateItem(id, { favorite: !item.favorite })
    await get().loadItems()
  },

  createTag: async (name) => {
    await api.createTag(name)
    await get().refreshCatalog()
  },
  createCollection: async (name, description) => {
    const c = await api.createCollection({ name, description })
    await get().refreshCatalog()
    return c.id
  },
  updateCollection: async (id, patch) => {
    await api.updateCollection(id, patch)
    await get().refreshCatalog()
  },
  deleteCollection: async (id) => {
    await api.deleteCollection(id)
    await get().refreshCatalog()
  },

  loadNotes: async (ownerType, ownerId) => {
    const notes = await api.notes(ownerType, ownerId)
    set({ notes })
  },
  addNote: async (body, typeLabel) => {
    const { inspector } = get()
    if (!inspector) return
    await api.createNote({ ownerType: inspector.ownerType, ownerId: inspector.ownerId, body, typeLabel })
    await get().loadNotes(inspector.ownerType, inspector.ownerId)
  },
  updateNote: async (id, body) => {
    await api.updateNote(id, { body })
    const { inspector } = get()
    if (inspector) await get().loadNotes(inspector.ownerType, inspector.ownerId)
  },
  deleteNote: async (id) => {
    await api.deleteNote(id)
    const { inspector } = get()
    if (inspector) await get().loadNotes(inspector.ownerType, inspector.ownerId)
  },
}))
