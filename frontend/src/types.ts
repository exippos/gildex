// Shared types — MUST match internal/model/model.go (camelCase JSON) exactly.

export type Kind = 'image' | 'video' | 'audio'
export type Status = 'draft' | 'final' | 'wip'
export type State = 'present' | 'missing'
export type Surface = 'all' | 'sessions' | 'collections' | 'folders' | 'tags'
export type GroupType = 'session' | 'collection'
export type Workspace = 'ingest' | 'gallery' | 'timeline'
export type OwnerType = 'item' | 'session' | 'collection'
export type ItemSort = 'time' | 'filename' | 'size' | 'session'
export type SortDir = 'asc' | 'desc'
export type SourceMode = 'once' | 'watch'
export type SettingsSection = 'appearance' | 'library' | 'sources' | 'behavior' | 'about'

// Library-scoped preferences stored in the .gildex catalog DB.
export interface LibrarySettings {
  sessionGapMinutes: number
}

export interface Source {
  id: string
  name: string
  path: string
  mode: SourceMode
  addedAt: number
  lastScanAt: number | null
}

export interface Item {
  id: string
  contentHash: string
  relativePath: string
  originPath: string // absolute path at last import; clue when the source is gone
  sourceId: string | null
  kind: Kind
  format: string
  fileSize: number
  timestamp: number // unix ms
  width: number
  height: number
  duration: number | null // seconds
  favorite: boolean
  rating: number // 0 = unrated, else 1..5
  status: Status
  state: State
  sessionId: string | null
  prompt: string | null
  negativePrompt: string | null
  modelName: string | null
  seed: number | null
  steps: number | null
  sampler: string | null
  cfgScale: number | null
  generatedAt: number | null
  thumbnailPath: string // "<hash>.jpg" or ""
  frameCount: number // prerendered hover-play frames, 0 = none
  tags: string[] // assigned tag names
  extra: Record<string, string>
}

export interface Session {
  id: string
  label: string
  startsAt: number
  endsAt: number
  itemCount: number
  videoCount: number
  audioCount: number
  thumbnailPath: string
  coverItemId: string | null
}

export interface Tag {
  id: string
  name: string
  itemCount: number
}

// GET /api/tags: the vocabulary plus a count of items that carry no tag.
export interface TagList {
  tags: Tag[]
  untagged: number
}

export interface Collection {
  id: string
  name: string
  description: string
  itemCount: number
  videoCount: number
  audioCount: number
  thumbnailPath: string
  coverItemId: string | null
}

export interface Note {
  id: string
  ownerType: OwnerType
  ownerId: string
  body: string
  typeLabel: string
  createdAt: number
  updatedAt: number
}

export interface FolderNode {
  name: string
  path: string
  sourceId: string | null
  itemCount: number
  children: FolderNode[]
}

export interface LibraryStatus {
  id: string
  name: string
  root: string
  rootSet: boolean
  lastLibrary: string
  itemCount: number
  sessionCount: number
  tagCount: number
  collectionCount: number
  sourceCount: number
  appVersion: string
  schemaVersion: number
}

export interface ImportDuplicate {
  id: string
  name: string
  kind: Kind
  thumb: string
}

export interface ImportStatus {
  running: boolean
  total: number
  done: number
  stage: string
  error: string
  itemsPerSec: number
  duplicates: ImportDuplicate[]
}

export interface ItemPage {
  items: Item[]
  total: number
}

export interface ItemQuery {
  sessionId?: string
  collectionId?: string
  folder?: string
  sourceId?: string
  sourceNull?: boolean
  tags?: string[]
  untagged?: boolean
  q?: string
  kind?: Kind
  rating?: number
  status?: Status
  favorite?: boolean
  limit?: number
  offset?: number
  sort?: string
  dir?: SortDir
}

export interface ItemPatch {
  favorite?: boolean
  rating?: number
  status?: Status
  prompt?: string | null
  negativePrompt?: string | null
  modelName?: string | null
  seed?: number | null
  steps?: number | null
  sampler?: string | null
  cfgScale?: number | null
  generatedAt?: number | null
}

export interface BatchPatch {
  ids: string[]
  addTags?: string[]
  removeTags?: string[]
  addToCollectionId?: string
  removeFromCollectionId?: string
  favorite?: boolean
  rating?: number
  status?: Status
  setSessionId?: string | null
  removeFromCatalog?: boolean
}
