// Shared types — MUST match internal/model/model.go (camelCase JSON) exactly.

export type Kind = 'image' | 'video' | 'audio'
export type Status = 'draft' | 'final' | 'wip'
export type State = 'present' | 'missing'
export type Surface = 'all' | 'sessions' | 'collections' | 'folders' | 'tags'
export type Workspace = 'ingest' | 'gallery' | 'timeline'
export type OwnerType = 'item' | 'session' | 'collection'
export type ItemSort = 'time' | 'filename' | 'size' | 'session'
export type SortDir = 'asc' | 'desc'

export interface Item {
  id: string
  contentHash: string
  relativePath: string
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
  extra: Record<string, string>
}

export interface Session {
  id: string
  label: string
  startsAt: number
  endsAt: number
  itemCount: number
  thumbnailPath: string
}

export interface Tag {
  id: string
  name: string
  itemCount: number
}

export interface Collection {
  id: string
  name: string
  description: string
  itemCount: number
  thumbnailPath: string
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
  itemCount: number
  children: FolderNode[]
}

export interface LibraryStatus {
  root: string
  rootSet: boolean
  itemCount: number
  sessionCount: number
  tagCount: number
  collectionCount: number
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
  tags?: string[]
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
