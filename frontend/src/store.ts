// Central Zustand store — the shared contract between all components.
// Components read state and call actions; they should NOT fetch directly.
import { create } from 'zustand'
import { api } from './api'
import type { DroppedFile } from './api'
import { applyTheme, initialTheme, persistTheme, syncThemeUrl, type Theme } from './theme'
import type {
  Collection,
  FolderNode,
  GroupType,
  ImportStatus,
  Item,
  ItemSort,
  LibrarySettings,
  LibraryStatus,
  Note,
  OwnerType,
  Session,
  SettingsSection,
  SortDir,
  Source,
  SourceMode,
  Status,
  Surface,
  Tag,
  TagImportSummary,
  Workspace,
} from './types'

// Frontend sort name -> backend `sort` query param.
const SORT_PARAM: Record<ItemSort, string> = {
  time: 'time',
  filename: 'name',
  size: 'size',
  session: 'session',
}

// Tag filters are a multi-select AND chain. "Untagged" is a UI-side pseudo
// filter: it is exclusive, and the API takes it as a separate `untagged` flag
// rather than a tag name.
export const UNTAGGED_FILTER = '__untagged__'

export function tagFilterLabel(name: string): string {
  return name === UNTAGGED_FILTER ? 'untagged' : name
}

function tagFilterParams(filters: string[]): { tags?: string[]; untagged?: boolean } {
  const names = filters.filter((name) => name !== UNTAGGED_FILTER)
  return {
    tags: names.length ? names : undefined,
    untagged: filters.includes(UNTAGGED_FILTER) || undefined,
  }
}

// Sentinel for `activeSourceId`: the library-local inbox (source_id IS NULL),
// distinct from `null` ("all items") and a real source id.
export const INBOX_SOURCE = '__inbox__'

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

/**
 * Look up an item in the lazily cached collection pages. Expanded collection
 * groups render from these caches rather than the main `items` page, so the
 * preview and inspector must search them too (a large catalog exceeds the
 * 2000-item page, leaving collection members outside `items`).
 */
export function findCachedItem(
  pages: Record<string, Item[]>,
  id: string,
): Item | null {
  for (const page of Object.values(pages)) {
    const hit = page.find((item) => item.id === id)
    if (hit) return hit
  }
  return null
}

/** Resolve a selection in order, falling back to the collection caches. */
export function resolveItems(
  items: Item[],
  pages: Record<string, Item[]>,
  ids: string[],
): Item[] {
  const out: Item[] = []
  for (const id of ids) {
    const item = items.find((entry) => entry.id === id) ?? findCachedItem(pages, id)
    if (item) out.push(item)
  }
  return out
}

// Replace one item inside every cached collection page that contains it.
function replaceCachedItem(
  pages: Record<string, Item[]>,
  fresh: Item,
): Record<string, Item[]> {
  let next: Record<string, Item[]> | null = null
  for (const [key, page] of Object.entries(pages)) {
    const index = page.findIndex((item) => item.id === fresh.id)
    if (index === -1) continue
    next ??= { ...pages }
    const copy = page.slice()
    copy[index] = fresh
    next[key] = copy
  }
  return next ?? pages
}

// Drops every cached page for one collection after its membership changed.
function clearCollectionCache(
  state: Pick<AppState, 'collectionItems' | 'collectionLoading'>,
  id: string,
): Pick<AppState, 'collectionItems' | 'collectionLoading'> {
  const prefix = id + '|'
  const collectionItems: Record<string, Item[]> = {}
  for (const [key, value] of Object.entries(state.collectionItems)) {
    if (!key.startsWith(prefix)) collectionItems[key] = value
  }
  const collectionLoading: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(state.collectionLoading)) {
    if (!key.startsWith(prefix)) collectionLoading[key] = value
  }
  return { collectionItems, collectionLoading }
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

const DEFAULT_LIBRARY_SETTINGS: LibrarySettings = { sessionGapMinutes: 120 }
const DEFAULT_CELL_SIZE = 168

// Rail selections are remembered per surface while the app runs. Opening a
// different library resets them so ids and folder paths from the old catalog
// never leak into the new one.
function clearedRailSelection() {
  return {
    activeSessionId: null,
    activeCollectionId: null,
    activeFolder: null,
    activeSourceId: null,
  }
}

function readCellSize(): number {
  try {
    const raw = Number(localStorage.getItem('gildex-cell-size'))
    if (Number.isFinite(raw) && raw >= 80 && raw <= 320) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_CELL_SIZE
}

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
  activeSourceId: string | null
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
  // items with no tags, shown as the "untagged" pseudo tag
  untaggedCount: number
  collections: Collection[]
  folders: FolderNode[]
  sources: Source[]
  // collection id + query key -> one page of that collection's items
  collectionItems: Record<string, Item[]>
  collectionLoading: Record<string, boolean>
  // library-scoped preferences from the catalog DB
  librarySettings: LibrarySettings

  // selection
  selection: string[]
  lastSelectedId: string | null

  // quick preview (right panel)
  previewItemId: string | null

  // inspector (deep surface)
  inspector: InspectorTarget | null

  // modals
  groupEditor: { type: GroupType; id: string | null; pendingItemIds: string[] } | null
  // unfiltered contents of the group being edited
  groupEditorItems: Item[]
  groupEditorLoading: boolean
  // library search inside the editor's "add items" picker
  groupPickerResults: Item[]
  groupPickerQuery: string
  collectionPicker: { itemIds: string[] } | null

  // notes cache for the open inspector
  notes: Note[]

  // library modal (creation / open wizard)
  libraryModal: 'create' | 'open' | null

  // settings modal: open section, null when closed
  settingsModal: SettingsSection | null

  // presentation
  theme: Theme
  setTheme: (theme: Theme) => void
  effects: EffectsMode
  setEffects: (mode: EffectsMode) => void

  // actions
  init: () => Promise<void>
  createLibrary: (name: string, directory: string) => Promise<void>
  openLibrary: (path: string) => Promise<void>
  addSource: (path: string, name?: string, mode?: SourceMode) => Promise<string>
  updateSource: (id: string, patch: { name?: string; mode?: SourceMode }) => Promise<void>
  removeSource: (id: string) => Promise<void>
  scanSource: (id: string) => Promise<void>
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
  selectFolder: (sourceId: string | null, folder: string | null) => void
  setSearch: (q: string) => void
  setSort: (s: ItemSort) => void
  setSortDir: (d: SortDir) => void
  setCellSize: (n: number) => void
  toggleTagFilter: (name: string) => void
  clearTagFilters: () => void

  toggleSelect: (id: string) => void
  setSelected: (id: string, additive: boolean) => void
  /** Extend the selection to `id` within the visual order (defaults to `items`). */
  selectRange: (id: string, order?: string[]) => void
  clearSelection: () => void
  selectAllVisible: () => void
  /** Select every loaded item in a session or collection group. */
  selectGroupItems: (type: GroupType, id: string) => Promise<void>

  setPreviewItemId: (id: string | null) => void
  openInspector: (ownerType: OwnerType, ownerId: string, ownerLabel?: string) => Promise<void>
  closeInspector: () => void

  openGroupEditor: (type: GroupType, id: string | null, pendingItemIds?: string[]) => void
  closeGroupEditor: () => void
  loadGroupEditorItems: () => Promise<void>
  searchGroupPicker: (query: string) => Promise<void>
  addToGroup: (type: GroupType, id: string, itemIds: string[]) => Promise<void>
  removeFromGroup: (type: GroupType, id: string, itemId: string) => Promise<void>
  setGroupCover: (type: GroupType, id: string, itemId: string | null) => Promise<void>
  openCollectionPicker: (itemIds: string[]) => void
  closeCollectionPicker: () => void

  batchTag: (add: string[], remove: string[], opts?: { keep?: boolean }) => Promise<void>
  batchSet: (
    patch: { favorite?: boolean; rating?: number; status?: Status },
    opts?: { keep?: boolean },
  ) => Promise<void>
  batchRemove: () => Promise<void>
  addToCollection: (collectionId: string, itemIds: string[]) => Promise<void>
  removeFromCollection: (collectionId: string, itemId: string) => Promise<void>

  saveItem: (id: string, patch: Partial<Item>) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  tagItem: (id: string, add: string[], remove: string[]) => Promise<void>
  /** Refetch one item and splice it into `items` and the collection caches. */
  syncItem: (id: string) => Promise<void>

  createTag: (name: string) => Promise<void>
  exportTags: () => Promise<void>
  importTags: (names: string[]) => Promise<TagImportSummary>
  createCollection: (name: string, description: string, itemIds?: string[]) => Promise<string | null>
  updateCollection: (id: string, patch: { name?: string; description?: string }) => Promise<void>
  updateSession: (id: string, patch: { label?: string }) => Promise<void>
  deleteCollection: (id: string) => Promise<void>

  loadNotes: (ownerType: OwnerType, ownerId: string) => Promise<void>
  addNote: (body: string, typeLabel?: string) => Promise<void>
  updateNote: (id: string, body: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>

  openLibraryModal: (mode: 'create' | 'open') => void
  closeLibraryModal: () => void

  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
  loadSettings: () => Promise<void>
  updateSettings: (patch: { sessionGapMinutes?: number }) => Promise<LibrarySettings>
  reclusterSessions: () => Promise<void>
}

const EMPTY_PROGRESS: ImportStatus = { running: false, total: 0, done: 0, stage: '', error: '', itemsPerSec: 0, duplicates: [] }

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
  activeSourceId: null,
  activeTagFilters: [],

  search: '',
  sort: 'time',
  sortDir: 'desc',
  cellSize: readCellSize(),
  items: [],
  itemsTotal: 0,
  loadingItems: false,

  sessions: [],
  tags: [],
  untaggedCount: 0,
  collections: [],
  folders: [],
  sources: [],
  collectionItems: {},
  collectionLoading: {},
  librarySettings: DEFAULT_LIBRARY_SETTINGS,

  selection: [],
  lastSelectedId: null,

  previewItemId: null,
  inspector: null,

  groupEditor: null,
  groupEditorItems: [],
  groupEditorLoading: false,
  groupPickerResults: [],
  groupPickerQuery: '',
  collectionPicker: null,

  notes: [],

  libraryModal: null,
  settingsModal: null,

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

  createLibrary: async (name, directory) => {
    const library = await api.createLibrary(name, directory)
    set({ library, ...clearedRailSelection() })
    await get().refreshCatalog()
  },

  openLibrary: async (path) => {
    const library = await api.openLibrary(path)
    set({ library, ...clearedRailSelection() })
    await get().refreshCatalog()
  },

  addSource: async (path, name, mode) => {
    const src = await api.addSource({ path, name, mode })
    await get().refreshCatalog()
    return src.id
  },

  updateSource: async (id, patch) => {
    await api.updateSource(id, patch)
    await get().refreshCatalog()
  },

  removeSource: async (id) => {
    await api.deleteSource(id)
    await get().refreshCatalog()
  },

  scanSource: async (id) => {
    set({ importing: true, importError: null, importProgress: EMPTY_PROGRESS })
    try {
      await api.scanSource(id)
      await get().pollImport()
    } catch (e) {
      set({ importing: false, importError: (e as Error).message })
    }
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
    const [library, sessions, tagList, collections, folders, sources, librarySettings] =
      await Promise.all([
        api.status(),
        api.sessions(),
        api.tags(),
        api.collections(),
        api.folders(),
        api.sources(),
        api.settings(),
      ])
    set((state) => ({
      library,
      sessions,
      tags: tagList.tags,
      untaggedCount: tagList.untagged,
      collections,
      folders,
      sources,
      librarySettings,
      // Drop remembered selections whose group no longer exists (recluster or
      // a deleted collection), so a tab switch cannot restore a ghost row.
      activeSessionId:
        state.activeSessionId && sessions.some((s) => s.id === state.activeSessionId)
          ? state.activeSessionId
          : null,
      activeCollectionId:
        state.activeCollectionId && collections.some((c) => c.id === state.activeCollectionId)
          ? state.activeCollectionId
          : null,
    }))
    await get().loadItems()
  },

  loadItems: async () => {
    const {
      workspace,
      surface,
      activeSessionId,
      activeCollectionId,
      activeFolder,
      activeSourceId,
      activeTagFilters,
      search,
    } = get()
    set({ loadingItems: true })
    try {
      const gallery = workspace === 'gallery'
      const foldersSurface = gallery && surface === 'folders'
      const q = {
        sessionId: gallery && surface === 'sessions' ? activeSessionId ?? undefined : undefined,
        collectionId:
          gallery && surface === 'collections' ? activeCollectionId ?? undefined : undefined,
        folder: foldersSurface ? activeFolder ?? undefined : undefined,
        sourceId:
          foldersSurface && activeSourceId && activeSourceId !== INBOX_SOURCE
            ? activeSourceId
            : undefined,
        sourceNull: foldersSurface && activeSourceId === INBOX_SOURCE ? true : undefined,
        ...tagFilterParams(activeTagFilters),
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
        ...tagFilterParams(activeTagFilters),
        q: search || undefined,
        limit: 2000,
        sort: SORT_PARAM[sort],
        dir: sortDir,
      })
      set((s) => ({ collectionItems: { ...s.collectionItems, [key]: page.items } }))
    } catch {
      // Cache the failure as an empty page so the grid stops retrying; a
      // membership change (which clears this key) will try again.
      set((s) => ({ collectionItems: { ...s.collectionItems, [key]: [] } }))
    } finally {
      set((s) => ({ collectionLoading: { ...s.collectionLoading, [key]: false } }))
    }
  },

  setWorkspace: (workspace) => {
    set({ workspace, previewItemId: null })
    if (workspace !== 'ingest') void get().loadItems()
  },
  setSurface: (surface) => {
    // Keep each surface's rail selection. `loadItems` already scopes the
    // session / collection / folder ids to their surface, so switching tabs
    // and returning restores the last selected row instead of "All".
    set({ surface })
  },
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
  selectFolder: (sourceId, folder) => {
    set({ activeSourceId: sourceId, activeFolder: folder })
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
  setCellSize: (cellSize) => {
    try {
      localStorage.setItem('gildex-cell-size', String(cellSize))
    } catch {
      /* ignore */
    }
    set({ cellSize })
  },
  toggleTagFilter: (name) => {
    const cur = get().activeTagFilters
    let next: string[]
    if (cur.includes(name)) {
      next = cur.filter((t) => t !== name)
    } else if (name === UNTAGGED_FILTER) {
      // Untagged excludes every named tag, so it stands alone.
      next = [UNTAGGED_FILTER]
    } else {
      next = [...cur.filter((t) => t !== UNTAGGED_FILTER), name]
    }
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
  selectRange: (id, order) => {
    const { items, lastSelectedId } = get()
    if (!lastSelectedId) {
      get().toggleSelect(id)
      return
    }
    const ids = order ?? items.map((i) => i.id)
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
  selectGroupItems: async (type, id) => {
    let ids: string[]
    if (type === 'session') {
      ids = get()
        .items.filter((item) => item.sessionId === id)
        .map((item) => item.id)
    } else {
      // A collapsed collection tile may not have loaded its page yet.
      const { search, activeTagFilters, sort, sortDir } = get()
      const key = collectionItemsKey(id, search, activeTagFilters, sort, sortDir)
      if (!get().collectionItems[key]) await get().loadCollectionItems(id)
      ids = (get().collectionItems[key] ?? []).map((item) => item.id)
    }
    if (!ids.length) return
    set({ selection: ids, lastSelectedId: ids[0] })
  },

  setPreviewItemId: (id) => set({ previewItemId: id }),

  openInspector: async (ownerType, ownerId, ownerLabel) => {
    set({ inspector: { ownerType, ownerId, ownerLabel } })
    await get().loadNotes(ownerType, ownerId)
  },
  closeInspector: () => set({ inspector: null, notes: [] }),

  openGroupEditor: (type, id, pendingItemIds = []) => {
    set({
      groupEditor: { type, id, pendingItemIds },
      groupEditorItems: [],
      groupEditorLoading: false,
      groupPickerResults: [],
      groupPickerQuery: '',
    })
    void get().loadGroupEditorItems()
    if (id) void get().searchGroupPicker('')
  },
  closeGroupEditor: () =>
    set({
      groupEditor: null,
      groupEditorItems: [],
      groupEditorLoading: false,
      groupPickerResults: [],
      groupPickerQuery: '',
    }),

  loadGroupEditorItems: async () => {
    const editor = get().groupEditor
    if (!editor?.id) {
      set({ groupEditorItems: [], groupEditorLoading: false })
      return
    }
    const id = editor.id
    const type = editor.type
    set({ groupEditorLoading: true })
    try {
      const page = await api.items(
        type === 'session'
          ? { sessionId: id, limit: 2000, sort: 'time', dir: 'desc' }
          : { collectionId: id, limit: 2000, sort: 'time', dir: 'desc' },
      )
      const current = get().groupEditor
      if (current?.id === id && current.type === type) {
        set({ groupEditorItems: page.items })
      }
    } finally {
      set({ groupEditorLoading: false })
    }
  },

  searchGroupPicker: async (query) => {
    set({ groupPickerQuery: query })
    try {
      const page = await api.items({
        q: query.trim() || undefined,
        limit: 60,
        sort: 'time',
        dir: 'desc',
      })
      if (get().groupPickerQuery === query) set({ groupPickerResults: page.items })
    } catch {
      if (get().groupPickerQuery === query) set({ groupPickerResults: [] })
    }
  },

  addToGroup: async (type, id, itemIds) => {
    if (!itemIds.length) return
    if (type === 'collection') {
      await api.addToCollection(id, itemIds)
      set((s) => clearCollectionCache(s, id))
    } else {
      await api.batch({ ids: itemIds, setSessionId: id })
    }
    await get().refreshCatalog()
    await get().loadGroupEditorItems()
  },
  removeFromGroup: async (type, id, itemId) => {
    if (type === 'collection') {
      await api.removeFromCollection(id, itemId)
      set((s) => clearCollectionCache(s, id))
    } else {
      await api.batch({ ids: [itemId], setSessionId: null })
    }
    await get().refreshCatalog()
    await get().loadGroupEditorItems()
  },
  setGroupCover: async (type, id, itemId) => {
    if (type === 'collection') {
      await api.updateCollection(id, { coverItemId: itemId })
    } else {
      await api.updateSession(id, { coverItemId: itemId })
    }
    await get().refreshCatalog()
    await get().loadGroupEditorItems()
  },

  openCollectionPicker: (itemIds) => set({ collectionPicker: { itemIds } }),
  closeCollectionPicker: () => set({ collectionPicker: null }),

  batchTag: async (add, remove, opts) => {
    const ids = get().selection
    if (!ids.length) return
    await api.batch({ ids, addTags: add, removeTags: remove })
    // Keep expanded collection tiles in step without a refetch. Their items may
    // sit outside the main `items` page, so the preview reads from these caches.
    const idSet = new Set(ids)
    const addSet = new Set(add)
    const removeSet = new Set(remove)
    set((s) => {
      const collectionItems: Record<string, Item[]> = {}
      for (const [key, page] of Object.entries(s.collectionItems)) {
        collectionItems[key] = page.map((item) => {
          if (!idSet.has(item.id)) return item
          const tags = item.tags.filter((name) => !removeSet.has(name))
          for (const name of addSet) if (!tags.includes(name)) tags.push(name)
          return { ...item, tags }
        })
      }
      return { collectionItems }
    })
    if (!opts?.keep) get().clearSelection()
    await get().refreshCatalog()
  },
  batchSet: async (patch, opts) => {
    const ids = get().selection
    if (!ids.length) return
    await api.batch({ ids, ...patch })
    // Keep expanded collection tiles in step without a refetch.
    const idSet = new Set(ids)
    set((s) => {
      const collectionItems: Record<string, Item[]> = {}
      for (const [key, page] of Object.entries(s.collectionItems)) {
        collectionItems[key] = page.map((item) =>
          idSet.has(item.id) ? { ...item, ...patch } : item,
        )
      }
      return { collectionItems }
    })
    if (!opts?.keep) get().clearSelection()
    await get().refreshCatalog()
  },
  batchRemove: async () => {
    const ids = get().selection
    if (!ids.length) return
    await api.batch({ ids, removeFromCatalog: true })
    const idSet = new Set(ids)
    set((s) => {
      const collectionItems: Record<string, Item[]> = {}
      for (const [key, page] of Object.entries(s.collectionItems)) {
        collectionItems[key] = page.filter((item) => !idSet.has(item.id))
      }
      return { collectionItems }
    })
    get().clearSelection()
    await get().refreshCatalog()
  },
  addToCollection: async (collectionId, itemIds) => {
    if (!itemIds.length) return
    await api.addToCollection(collectionId, itemIds)
    get().clearSelection()
    set((s) => ({ ...clearCollectionCache(s, collectionId), collectionPicker: null }))
    await get().refreshCatalog()
  },
  removeFromCollection: async (collectionId, itemId) => {
    await api.removeFromCollection(collectionId, itemId)
    // Drop the cached page so an expanded tile refetches without the item.
    set((s) => clearCollectionCache(s, collectionId))
    await get().refreshCatalog()
  },

  saveItem: async (id, patch) => {
    await api.updateItem(id, patch)
    await get().loadItems()
    await get().syncItem(id)
  },
  toggleFavorite: async (id) => {
    const item =
      get().items.find((i) => i.id === id) ?? findCachedItem(get().collectionItems, id)
    if (!item) return
    await api.updateItem(id, { favorite: !item.favorite })
    await get().loadItems()
    await get().syncItem(id)
  },
  tagItem: async (id, add, remove) => {
    await api.batch({ ids: [id], addTags: add, removeTags: remove })
    await get().refreshCatalog()
    await get().syncItem(id)
  },
  syncItem: async (id) => {
    const fresh = await api.item(id)
    set((s) => ({
      items: s.items.map((item) => (item.id === fresh.id ? fresh : item)),
      collectionItems: replaceCachedItem(s.collectionItems, fresh),
    }))
  },

  createTag: async (name) => {
    await api.createTag(name)
    await get().refreshCatalog()
  },
  exportTags: async () => {
    await api.exportTags()
  },
  importTags: async (names) => {
    const summary = await api.importTags(names)
    await get().refreshCatalog()
    return summary
  },
  createCollection: async (name, description, itemIds = []) => {
    const c = await api.createCollection({ name, description })
    if (itemIds.length) await api.addToCollection(c.id, itemIds)
    await get().refreshCatalog()
    return c.id
  },
  updateCollection: async (id, patch) => {
    await api.updateCollection(id, patch)
    await get().refreshCatalog()
  },
  updateSession: async (id, patch) => {
    await api.updateSession(id, patch)
    await get().refreshCatalog()
  },
  deleteCollection: async (id) => {
    await api.deleteCollection(id)
    set((s) => clearCollectionCache(s, id))
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

  openSettings: (section = 'appearance') => set({ settingsModal: section }),
  closeSettings: () => set({ settingsModal: null }),

  loadSettings: async () => {
    const settings = await api.settings()
    set({ librarySettings: settings })
  },
  updateSettings: async (patch) => {
    const settings = await api.updateSettings(patch)
    set({ librarySettings: settings })
    return settings
  },
  reclusterSessions: async () => {
    await api.reclusterSessions()
    await get().refreshCatalog()
  },

  openLibraryModal: (mode) => set({ libraryModal: mode }),
  closeLibraryModal: () => set({ libraryModal: null }),
}))
